/* */
import {
    type BaseCheckpointSaver,
    Command,
    END,
    START,
    StateGraph
} from '@langchain/langgraph';
import type { VideoProject } from '@wise-cut/video-project';

import type { AgentRunEvent } from '../events/agent-run-event';
import type { AgentRunEventEmitter } from '../events/event-emitter';
import {
    createSequencedEventEmitter,
    serializeError
} from '../events/event-emitter';
import type {
    VideoAgentTools,
    VideoCreationInput
} from '../tools/video-agent-tools';
import { isAbortError } from '../utils/with-retry';

import { createVideoCreationCheckpointer } from './checkpoint';
import { createVideoCreationNodes } from './nodes';
import type {
    SceneApprovalRequest,
    SceneApprovalResume,
    VideoCreationGraphState
} from './state';
import { VideoCreationStateAnnotation } from './state';

export type { VideoAgentTools } from '../tools/video-agent-tools';

export type VideoCreationGraphResult = {
    approval?: SceneApprovalRequest;
    errors: string[];
    project?: VideoProject;
    runId: string;
    savedProjectPath?: string;
    state?: Partial<VideoCreationGraphState>;
    /**
     * 'cancelled':执行被 AbortSignal 中止(用户取消)。此时不 emit
     * run.failed——取消语义由调用方(IPC 层)负责发 run.cancelled。
     */
    status: 'cancelled' | 'completed' | 'failed' | 'waiting_for_approval';
};

/** 执行选项:signal 传入后,abort 会中止整条图执行并返回 'cancelled'。 */
export type VideoGraphRunOptions = {
    signal?: AbortSignal;
};

export type VideoCreationGraphRunner = {
    resume: (
        input: {
            approval: SceneApprovalResume;
            runId: string;
        },
        options?: VideoGraphRunOptions
    ) => Promise<VideoCreationGraphResult>;
    start: (
        input: VideoCreationInput,
        options?: VideoGraphRunOptions
    ) => Promise<VideoCreationGraphResult>;
};

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

    return new StateGraph(VideoCreationStateAnnotation)
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
        .addEdge('scene_approval', 'match_assets')
        .addEdge('match_assets', 'synthesize_voice')
        .addEdge('synthesize_voice', 'assemble_timeline')
        .addEdge('assemble_timeline', 'validate_project')
        .addEdge('validate_project', 'save_project')
        .addEdge('save_project', END)
        .compile({ checkpointer });
};

export const createVideoCreationGraph = ({
    checkpointerDbPath,
    emit,
    tools
}: {
    /**
     * 可选:SQLite 文件路径。传了以后会按 runId 把 checkpoint 持久化到
     * 这个文件里,进程重启后可以恢复未完成的 agent run。
     * 不传则用 in-memory checkpointer(测试场景用)。
     */
    checkpointerDbPath?: string;
    emit?: (event: AgentRunEvent) => void;
    tools: VideoAgentTools;
}): VideoCreationGraphRunner => {
    const eventEmitters = new Map<
        string,
        ReturnType<typeof createSequencedEventEmitter>
    >();
    const getEmitter = (runId: string) => {
        const existing = eventEmitters.get(runId);

        if (existing) {
            return existing;
        }

        const created = createSequencedEventEmitter({ emit, runId });
        eventEmitters.set(runId, created);

        return created;
    };
    const app = createCompiledGraph({
        checkpointer: createVideoCreationCheckpointer({
            dbPath: checkpointerDbPath
        }),
        emit: (event) => {
            getEmitter(event.runId).emit(event);
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
                getEmitter(runId).emit({
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

        getEmitter(runId).emit({
            projectId: project.project.id,
            savedProjectPath,
            type: 'run.completed'
        });

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

        getEmitter(runId).emit({
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

    // 取消的 run 不补 run.failed(调用方已发 run.cancelled),直接以
    // 'cancelled' 终态返回;checkpoint 保留在最后一个节点边界,之后可 resume。
    const abortRun = ({
        runId
    }: {
        runId: string;
    }): VideoCreationGraphResult => ({
        errors: [],
        runId,
        status: 'cancelled'
    });

    return {
        resume: async ({ approval, runId }, { signal } = {}) => {
            try {
                const output = await app.invoke(
                    new Command({ resume: approval }),
                    {
                        configurable: {
                            thread_id: runId
                        },
                        signal
                    }
                );

                return toResult({ output, runId });
            } catch (error) {
                if (isAbortError(error)) {
                    return abortRun({ runId });
                }

                return failRun({ error, runId });
            }
        },
        start: async (input, { signal } = {}) => {
            getEmitter(input.runId).emit({
                input: {
                    prompt: input.prompt,
                    sourceAssetDirectory: input.sourceAssetDirectory,
                    sourceFilePaths: input.sourceFilePaths
                },
                type: 'run.started'
            });

            try {
                const output = await app.invoke(
                    {
                        input,
                        runId: input.runId
                    },
                    {
                        configurable: {
                            thread_id: input.runId
                        },
                        signal
                    }
                );

                return toResult({ output, runId: input.runId });
            } catch (error) {
                if (isAbortError(error)) {
                    return abortRun({ runId: input.runId });
                }

                return failRun({ error, runId: input.runId });
            }
        }
    };
};
