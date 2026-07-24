/* */
import { Command, interrupt } from '@langchain/langgraph';
import { validateVideoProject } from '@wise-cut/video-project';

import type { AgentRunEventEmitter } from '../events/event-emitter';
import { serializeError } from '../events/event-emitter';
import type { VideoAgentTools } from '../tools/video-agent-tools';

import type {
    SceneApprovalRequest,
    SceneApprovalResume,
    VideoCreationGraphState
} from './state';

type GraphNodeUpdate = Partial<VideoCreationGraphState>;

const requireInput = (state: VideoCreationGraphState) => {
    if (!state.input) {
        throw new Error('Video creation input is required');
    }

    return state.input;
};

const requireBrief = (state: VideoCreationGraphState) => {
    if (!state.brief) {
        throw new Error('Creative brief is required');
    }

    return state.brief;
};

const requireProject = (state: VideoCreationGraphState) => {
    if (!state.project) {
        throw new Error('Video project is required');
    }

    return state.project;
};

const createInstrumentedNode =
    ({
        emit,
        nodeName,
        run
    }: {
        emit: AgentRunEventEmitter;
        nodeName: string;
        run: (state: VideoCreationGraphState) => Promise<GraphNodeUpdate>;
    }) =>
    async (state: VideoCreationGraphState): Promise<GraphNodeUpdate> => {
        emit({
            createdAt: '',
            nodeName,
            runId: state.runId,
            sequence: 0,
            type: 'node.started'
        });

        try {
            const update = await run(state);
            emit({
                createdAt: '',
                nodeName,
                runId: state.runId,
                sequence: 0,
                type: 'node.completed'
            });

            return update;
        } catch (error) {
            emit({
                createdAt: '',
                error: serializeError(error),
                nodeName,
                runId: state.runId,
                sequence: 0,
                type: 'node.failed'
            });
            throw error;
        }
    };

const emitModelStreamReport = async ({
    context,
    emit,
    messageId,
    nodeName,
    prompt,
    title,
    tools,
    runId
}: {
    context?: string;
    emit: AgentRunEventEmitter;
    messageId: string;
    nodeName: string;
    prompt: string;
    runId: string;
    title: string;
    tools: VideoAgentTools;
}) => {
    if (!tools.streamReport) return;

    emit({
        createdAt: '',
        messageId,
        nodeName,
        runId,
        sequence: 0,
        title,
        type: 'model.stream.started'
    });

    await tools.streamReport(
        {
            context,
            prompt,
            title
        },
        (delta) => {
            emit({
                createdAt: '',
                delta,
                messageId,
                nodeName,
                runId,
                sequence: 0,
                type: 'model.stream.delta'
            });
        }
    );

    emit({
        createdAt: '',
        messageId,
        nodeName,
        runId,
        sequence: 0,
        type: 'model.stream.completed'
    });
};

export const createVideoCreationNodes = ({
    emit,
    tools
}: {
    emit: AgentRunEventEmitter;
    tools: VideoAgentTools;
}) => ({
    analyzeAssets: createInstrumentedNode({
        emit,
        nodeName: 'asset_understand',
        run: async (state) => ({
            assets: await tools.analyzeAssets({
                assets: state.assets,
                input: requireInput(state)
            })
        })
    }),
    assembleTimeline: createInstrumentedNode({
        emit,
        nodeName: 'timeline_assemble',
        run: async (state) => {
            const brief = requireBrief(state);
            const input = requireInput(state);

            await emitModelStreamReport({
                context: `创作标题：${brief.title}\n分镜数量：${state.scenes.length}\n配音片段：${state.voices.length}`,
                emit,
                messageId: 'timeline_assemble-finalization',
                nodeName: 'timeline_assemble',
                prompt: input.prompt,
                runId: state.runId,
                title: '视频生成与工程整理',
                tools
            });

            return {
                project: await tools.assembleTimeline({
                    assets: state.assets,
                    brief,
                    input,
                    matches: state.matches,
                    scenes: state.scenes,
                    voices: state.voices
                })
            };
        }
    }),
    creativeBrief: createInstrumentedNode({
        emit,
        nodeName: 'creative_brief',
        run: async (state) => {
            const input = requireInput(state);

            await emitModelStreamReport({
                context: `素材数量：${state.assets.length}`,
                emit,
                messageId: 'creative_brief-content-understanding',
                nodeName: 'creative_brief',
                prompt: input.prompt,
                runId: state.runId,
                title: '内容理解',
                tools
            });

            return {
                brief: await tools.generateCreativeBrief({
                    assets: state.assets,
                    input
                })
            };
        }
    }),
    matchAssets: createInstrumentedNode({
        emit,
        nodeName: 'asset_matcher',
        run: async (state) => {
            const input = requireInput(state);

            await emitModelStreamReport({
                context: `分镜数量：${state.scenes.length}\n候选素材数量：${state.assets.length}`,
                emit,
                messageId: 'asset_matcher-voice-strategy',
                nodeName: 'asset_matcher',
                prompt: input.prompt,
                runId: state.runId,
                title: '素材匹配与配音生成',
                tools
            });

            return {
                matches: await tools.matchAssets({
                    assets: state.assets,
                    input,
                    scenes: state.scenes
                })
            };
        }
    }),
    planScenes: createInstrumentedNode({
        emit,
        nodeName: 'scene_planner',
        run: async (state) => {
            const brief = requireBrief(state);
            const input = requireInput(state);
            // scene_approval reject 时会把 feedback 写到 state,plan_scenes
            // 节点重跑时透传给 LLM。如果用户没给反馈(空字符串)就省略,
            // 跟"首次拆分镜"行为一致。
            const feedback = state.sceneApprovalFeedback?.trim()
                ? state.sceneApprovalFeedback.trim()
                : undefined;

            await emitModelStreamReport({
                context: feedback
                    ? `创作标题:${brief.title}\n核心信息:${brief.keyMessages.join(
                          '、'
                      )}\n用户反馈:${feedback}`
                    : `创作标题：${brief.title}\n核心信息：${brief.keyMessages.join('、')}`,
                emit,
                messageId: 'scene_planner-storyboard-breakdown',
                nodeName: 'scene_planner',
                prompt: input.prompt,
                runId: state.runId,
                title: '文稿拆解为可执行分镜',
                tools
            });

            return {
                scenes: await tools.planScenes({
                    assets: state.assets,
                    brief,
                    feedback,
                    input
                })
            };
        }
    }),
    saveProject: createInstrumentedNode({
        emit,
        nodeName: 'project_save',
        run: async (state) => ({
            savedProjectPath: (
                await tools.saveProject({
                    project: requireProject(state)
                })
            ).path
        })
    }),
    scanAssets: createInstrumentedNode({
        emit,
        nodeName: 'asset_scan',
        run: async (state) => ({
            assets: await tools.scanAssets({
                input: requireInput(state)
            })
        })
    }),
    sceneApproval: async (state: VideoCreationGraphState) => {
        emit({
            createdAt: '',
            nodeName: 'scene_approval',
            runId: state.runId,
            sequence: 0,
            type: 'node.started'
        });

        const approval = interrupt<SceneApprovalRequest, SceneApprovalResume>({
            payload: {
                brief: state.brief,
                scenes: state.scenes
            },
            type: 'scene-plan'
        });

        if (!approval.approved) {
            // 用户 reject:把 feedback 写到 state,清空 scenes,跳回 plan_scenes
            // 节点重跑。LangGraph 的 Command({ goto }) 会在 resume 后跳转,
            // 不会继续走 match_assets。
            emit({
                createdAt: '',
                nodeName: 'scene_approval',
                runId: state.runId,
                sequence: 0,
                type: 'node.completed'
            });

            return new Command({
                goto: 'plan_scenes',
                update: {
                    sceneApprovalFeedback: approval.feedback?.trim() ?? '',
                    scenes: []
                }
            });
        }

        emit({
            createdAt: '',
            nodeName: 'scene_approval',
            runId: state.runId,
            sequence: 0,
            type: 'node.completed'
        });

        return {};
    },
    synthesizeVoice: createInstrumentedNode({
        emit,
        nodeName: 'tts',
        run: async (state) => {
            const brief = requireBrief(state);
            const input = requireInput(state);

            await emitModelStreamReport({
                context: `口播音色：${input.selectedVoiceType ?? '默认音色'}\n分镜数量：${state.scenes.length}`,
                emit,
                messageId: 'tts-voice-generation',
                nodeName: 'tts',
                prompt: input.prompt,
                runId: state.runId,
                title: '口播配音生成',
                tools
            });

            return {
                voices: await tools.synthesizeVoice({
                    brief,
                    input,
                    scenes: state.scenes
                })
            };
        }
    }),
    validateProject: createInstrumentedNode({
        emit,
        nodeName: 'validation',
        run: async (state) => {
            const project = requireProject(state);
            const localValidation = validateVideoProject(project);

            if (localValidation.success === false) {
                throw new Error(localValidation.issues.join('; '));
            }

            const toolValidation = await tools.validateProject({ project });

            if (toolValidation.success === false) {
                throw new Error(toolValidation.error);
            }

            return {};
        }
    })
});
