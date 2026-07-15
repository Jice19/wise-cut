/**
 * 视频创作图入口 ——  项目规范:
 *   - 装配 10 节点 StateGraph
 *   - 暴露 VideoCreationGraphRunner = { start, resume } 接口
 *     (controller 端不直接用 LangGraph Command,只调 runner.resume)
 *   - 识别 LangGraph v1 的 __interrupt__ 字段返回 waiting_for_approval
 *   - run.completed / run.failed 事件在 runner 端 emit
 *     (不放在 save_project 节点里)
 *
 * 用法(在 apps/desktop/client):
 *   const runner = createVideoCreationGraph({ tools });
 *   const result = await runner.start({
 *       runId: 'r-1',
 *       brief: '...',
 *       sourceAssetDirectory: '/path/to/mp4s'
 *   });
 *   if (result.status === 'waiting_for_approval') {
 *       // 弹窗
 *       const r2 = await runner.resume({
 *           runId: 'r-1',
 *           approval: { approved: true }
 *       });
 *   }
 */

import { mkdir, readdir, readFile } from 'node:fs/promises';
import { join } from 'node:path';

import {
    type BaseCheckpointSaver,
    Command,
    END,
    START,
    StateGraph
} from '@langchain/langgraph';
import type { VideoProject } from '@miaoma-magicut/video-project';

import type { AgentRunEvent } from '../events/agent-run-event.ts';
import type { AgentRunEventEmitter } from '../events/event-emitter.ts';
import {
    createSequencedEventEmitter,
    serializeError
} from '../events/event-emitter.ts';
import type { VideoAgentTools } from '../tools/video-agent-tools.ts';
import { createVideoCreationCheckpointer } from './checkpoint.ts';
import { createVideoCreationNodes } from './nodes.ts';
import type {
    SceneApprovalRequest,
    SceneApprovalResume,
    VideoCreationGraphState
} from './state.ts';
import type { VideoCreationInput } from './state.ts';
import { VideoCreationStateAnnotation } from './state.ts';

export type { VideoAgentTools } from '../tools/video-agent-tools.ts';
export type {
    SceneApprovalRequest,
    SceneApprovalResume,
    VideoCreationGraphState,
    VideoCreationInput
} from './state.ts';
export { buildInitialState } from './state.ts';

export type VideoCreationGraphResult = {
    approval?: SceneApprovalRequest;
    errors: string[];
    project?: VideoProject;
    runId: string;
    savedProjectPath?: string;
    state?: Partial<VideoCreationGraphState>;
    status: 'completed' | 'failed' | 'waiting_for_approval';
};

export type VideoCreationGraphRunner = {
    resume: (input: {
        approval: SceneApprovalResume;
        runId: string;
    }) => Promise<VideoCreationGraphResult>;
    start: (input: VideoCreationInput) => Promise<VideoCreationGraphResult>;
};

// ---------------------------------------------------------------------------
// helpers
// ---------------------------------------------------------------------------

const isInterruptResult = (
    value: unknown
): value is { __interrupt__: { value: SceneApprovalRequest }[] } =>
    Boolean(
        value &&
            typeof value === 'object' &&
            '__interrupt__' in value &&
            Array.isArray((value as { __interrupt__?: unknown }).__interrupt__)
    );

const getStateValues = async ({
    app,
    runId
}: {
    app: ReturnType<typeof createCompiledGraph>;
    runId: string;
}) => {
    const snapshot = await app.getState({
        configurable: {
            thread_id: runId
        }
    });
    return snapshot.values as Partial<VideoCreationGraphState>;
};

// ---------------------------------------------------------------------------
// 编译图(闭包,每 runner 实例一份)
// ---------------------------------------------------------------------------

import { AgentRunEventSink } from '../events/event-emitter.ts';

const createCompiledGraph = ({
    checkpointer,
    emit,
    tools
}: {
    checkpointer: BaseCheckpointSaver;
    emit: AgentRunEventEmitter;
    tools: VideoAgentTools;
}) => {
    const nodes = createVideoCreationNodes({ emit, tools });

    return (
        new StateGraph(VideoCreationStateAnnotation)
            .addNode('scan_assets', nodes.scanAssets)
            .addNode('analyze_assets', nodes.analyzeAssets)
            .addNode('creative_brief', nodes.creativeBrief)
            .addNode('plan_scenes', nodes.planScenes)
            .addNode('scene_approval', nodes.sceneApproval)
            .addNode('match_assets', nodes.matchAssets)
            .addNode('synthesize_voice', nodes.synthesizeVoice)
            .addNode('assemble_timeline', nodes.assembleTimeline)
            .addNode('validate_project', nodes.validateProject)
            .addNode('save_project', nodes.saveProject)
            .addEdge(START, 'scan_assets')
            .addEdge('scan_assets', 'analyze_assets')
            .addEdge('analyze_assets', 'creative_brief')
            .addEdge('creative_brief', 'plan_scenes')
            .addEdge('plan_scenes', 'scene_approval')
            // commit 12:驳回时 state.feedback 非空 → 跳回 plan_scenes 重跑;
            // 批准时 feedback 仍 undefined → 进 match_assets
            .addConditionalEdges(
                'scene_approval',
                (state) => (state.feedback ? 'plan_scenes' : 'match_assets'),
                { match_assets: 'match_assets', plan_scenes: 'plan_scenes' }
            )
            .addEdge('match_assets', 'synthesize_voice')
            .addEdge('synthesize_voice', 'assemble_timeline')
            .addEdge('assemble_timeline', 'validate_project')
            .addEdge('validate_project', 'save_project')
            .addEdge('save_project', END)
            .compile({ checkpointer })
    );
};

// ---------------------------------------------------------------------------
// 工厂入口
// ---------------------------------------------------------------------------

export const createVideoCreationGraph = ({
    checkpointer = createVideoCreationCheckpointer(),
    emit,
    tools
}: {
    checkpointer?: BaseCheckpointSaver;
    emit?: (event: AgentRunEvent) => void;
    tools: VideoAgentTools;
}): VideoCreationGraphRunner => {
    const eventEmitters = new Map<
        string,
        ReturnType<typeof createSequencedEventEmitter>
    >();
    const runStartedAt = new Map<string, number>();
    const getEmitter = (runId: string) => {
        const existing = eventEmitters.get(runId);
        if (existing) return existing;
        const created = createSequencedEventEmitter({
            sink: emit as AgentRunEventSink,
            runId
        });
        eventEmitters.set(runId, created);
        return created;
    };
    const getElapsedMs = (runId: string): number => {
        const start = runStartedAt.get(runId);
        return start ? Date.now() - start : 0;
    };

    const app = createCompiledGraph({
        checkpointer,
        emit: (event) => {
            getEmitter(event.runId)(event);
        },
        tools
    });

    const toResult = async ({
        output,
        runId
    }: {
        output: unknown;
        runId: string;
    }): Promise<VideoCreationGraphResult> => {
        const state = await getStateValues({ app, runId });

        if (isInterruptResult(output)) {
            const approval = output.__interrupt__[0]?.value;
            if (approval) {
                getEmitter(runId)({
                    approval,
                    type: 'approval.required'
                });
            }
            return {
                approval,
                errors: [],
                runId,
                state,
                status: 'waiting_for_approval'
            };
        }

        const project = state.project;
        const savedProjectPath = state.savedProjectPath;

        if (!project) {
            return {
                errors: ['Video project was not generated'],
                runId,
                state,
                status: 'failed'
            };
        }

        const completedAt = Date.now();
        getEmitter(runId)({
            durationMs: getElapsedMs(runId),
            projectId: project.metadata.projectId,
            projectPath: savedProjectPath ?? '',
            savedProjectPath,
            type: 'run.completed'
        });
        void completedAt;

        return {
            errors: [],
            project,
            runId,
            savedProjectPath,
            state,
            status: 'completed'
        };
    };

    const failRun = async ({
        error,
        runId
    }: {
        error: unknown;
        runId: string;
    }): Promise<VideoCreationGraphResult> => {
        const message = serializeError(error);
        let state: Partial<VideoCreationGraphState> | undefined;
        try {
            state = await getStateValues({ app, runId });
        } catch {
            state = undefined;
        }
        getEmitter(runId)({
            error: message,
            type: 'run.failed'
        });
        return {
            errors: [message],
            runId,
            state,
            status: 'failed'
        };
    };

    return {
        resume: async ({ approval, runId }) => {
            try {
                const output = await app.invoke(
                    new Command({ resume: approval }),
                    {
                        configurable: {
                            thread_id: runId
                        }
                    }
                );
                return toResult({ output, runId });
            } catch (error) {
                return failRun({ error, runId });
            }
        },
        start: async (input) => {
            runStartedAt.set(input.runId, Date.now());
            getEmitter(input.runId)({
                input: {
                    brief: input.brief,
                    sourceAssetDirectory: input.sourceAssetDirectory
                },
                type: 'run.started'
            });
            try {
                const output = await app.invoke(
                    { input },
                    {
                        configurable: {
                            thread_id: input.runId
                        }
                    }
                );
                return toResult({ output, runId: input.runId });
            } catch (error) {
                return failRun({ error, runId: input.runId });
            }
        }
    };
};

// 兼容旧 import:`createVideoCreationGraphRunner` 重命名提示
export { createVideoCreationGraph as createVideoCreationGraphRunner };

// 兼容旧 path:listProjects / readProject helper
export const listProjects = async (outputDir: string) => {
    try {
        await mkdir(outputDir, { recursive: true });
        const entries = await readdir(outputDir);
        const projects = await Promise.all(
            entries
                .filter((e) => e.endsWith('.json'))
                .map(async (file) => {
                    try {
                        const content = await readFile(
                            join(outputDir, file),
                            'utf-8'
                        );
                        const json = JSON.parse(content);
                        return {
                            projectId:
                                json.metadata?.projectId ??
                                file.replace('.json', ''),
                            title: json.metadata?.title ?? 'untitled',
                            createdAt: json.metadata?.createdAt,
                            updatedAt: json.metadata?.updatedAt,
                            durationMs: json.canvas?.durationMs
                        };
                    } catch {
                        return null;
                    }
                })
        );
        return projects
            .filter((p): p is NonNullable<typeof p> => p !== null)
            .sort((a, b) => (b.updatedAt ?? 0) - (a.updatedAt ?? 0));
    } catch {
        return [];
    }
};
