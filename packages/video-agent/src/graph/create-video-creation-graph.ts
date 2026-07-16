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
    status: 'completed' | 'failed' | 'waiting_for_approval';
};

export type VideoCreationGraphRunner = {
    resume: (input: {
        approval: SceneApprovalResume;
        runId: string;
    }) => Promise<VideoCreationGraphResult>;
    start: (input: VideoCreationInput) => Promise<VideoCreationGraphResult>;
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
        checkpointer,
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
            getEmitter(input.runId).emit({
                input: {
                    prompt: input.prompt,
                    sourceAssetDirectory: input.sourceAssetDirectory
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
