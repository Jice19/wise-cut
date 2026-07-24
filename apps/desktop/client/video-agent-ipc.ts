
import { randomUUID } from 'node:crypto';
import { existsSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';

import { app } from 'electron';

import {
    type AgentEnv,
    type AgentRunEvent,
    ArkChatModelProvider,
    createVideoCreationGraph,
    IndexTts2Provider,
    loadAgentEnv,
    type ModelProvider,
    RoutingTtsProvider,
    serializeError,
    type TtsProvider,
    type VideoCreationGraphRunner,
    VolcengineTtsProvider
} from '@wise-cut/video-agent';

import type {
    DesktopAgentRunEvent,
    VideoAgentAnalyzeAssetInput,
    VideoAgentApprovalInput,
    VideoAgentCancelInput,
    VideoAgentOperationResult,
    VideoAgentRegenerateSceneInput,
    VideoAgentRegenerateVoicesInput,
    VideoAgentReportSelectedFramesInput,
    VideoAgentResultData,
    VideoAgentStartInput
} from '../shared/video-agent';
import { videoAgentIpcChannels } from '../shared/video-agent-channels';
import { normalizeVideoAgentVoiceSettings } from '../shared/video-agent-voices';

import { regenerateVideoProjectScene } from './video-agent-scene-regeneration';
import { createDesktopVideoAgentTools } from './video-agent-tools';
import {
    isVoiceRegenerationCancelled,
    regenerateVideoProjectVoices
} from './video-agent-voice-regeneration';
import { resolveVideoExportBinaries } from './video-export-binaries';
import type { VideoProjectStore } from './video-project-store';

export { videoAgentIpcChannels };

type VideoAgentIpcSender = {
    send: (channel: string, event: DesktopAgentRunEvent) => void;
};

type VideoAgentIpcEvent = {
    sender: VideoAgentIpcSender;
};

type VideoAgentIpcMain = {
    handle: (
        channel: string,
        handler: (
            event: VideoAgentIpcEvent,
            input: unknown
        ) => Promise<unknown> | unknown
    ) => void;
};

type UnsequencedDesktopAgentRunEvent = DesktopAgentRunEvent extends infer Event
    ? Event extends DesktopAgentRunEvent
        ? Omit<Event, 'createdAt' | 'runId' | 'sequence'>
        : never
    : never;

export type VideoAgentEventEmitter = (event: DesktopAgentRunEvent) => void;

export type VideoAgentIpcController = {
    analyzeAsset: (
        input: VideoAgentAnalyzeAssetInput,
        emit: VideoAgentEventEmitter
    ) => Promise<VideoAgentOperationResult<VideoAgentResultData>>;
    approve: (
        input: VideoAgentApprovalInput,
        emit: VideoAgentEventEmitter
    ) => Promise<VideoAgentOperationResult<VideoAgentResultData>>;
    cancel: (
        input: VideoAgentCancelInput,
        emit: VideoAgentEventEmitter
    ) => Promise<VideoAgentOperationResult<VideoAgentResultData>>;
    regenerateScene: (
        input: VideoAgentRegenerateSceneInput,
        emit: VideoAgentEventEmitter
    ) => Promise<VideoAgentOperationResult<VideoAgentResultData>>;
    regenerateVoices: (
        input: VideoAgentRegenerateVoicesInput,
        emit: VideoAgentEventEmitter
    ) => Promise<VideoAgentOperationResult<VideoAgentResultData>>;
    reportSelectedFrames: (
        input: VideoAgentReportSelectedFramesInput,
        emit: VideoAgentEventEmitter
    ) => Promise<VideoAgentOperationResult<VideoAgentResultData>>;
    start: (
        input: VideoAgentStartInput,
        emit: VideoAgentEventEmitter
    ) => Promise<VideoAgentOperationResult<VideoAgentResultData>>;
};

type DemoVideoAgentRunState = {
    input: VideoAgentStartInput;
    runId: string;
    sequence: number;
};

type LangGraphVideoAgentRunState = {
    input: VideoAgentStartInput;
    runId: string;
    sequence: number;
};

type VoiceRegenerationRunState = {
    cancelEventEmitted: boolean;
    cancelled: boolean;
    runId: string;
    sequence: number;
};

type LangGraphRunnerFactory = (input: {
    emit: (event: AgentRunEvent) => void;
    getSelectedVoice: (runId: string) => string | undefined;
    getSelectedVoiceType: (runId: string) => string | undefined;
}) => VideoCreationGraphRunner;

type ProviderFactoryInput = {
    customVoiceReferenceResolver?: (
        voiceId: string
    ) => Promise<string> | string;
    loadEnv?: () => AgentEnv;
    modelProvider?: ModelProvider;
    ttsProvider?: TtsProvider;
};

type ProviderFactoryResult = {
    modelProvider: ModelProvider;
    ttsProvider: TtsProvider;
};

const success = <T>(data: T): VideoAgentOperationResult<T> => ({
    data,
    success: true
});

const failure = <T>({
    code,
    message
}: {
    code: 'CANCELLED' | 'RUN_FAILED' | 'VALIDATION_FAILED';
    message: string;
}): VideoAgentOperationResult<T> => ({
    error: {
        code,
        message
    },
    success: false
});

const normalizeStartInput = (input: VideoAgentStartInput) => ({
    ...input,
    prompt: input.prompt.trim(),
    selectedVoice: input.selectedVoice.trim(),
    selectedVoiceType: input.selectedVoiceType?.trim(),
    sourceAssetDirectory: input.sourceAssetDirectory.trim(),
    ...normalizeVideoAgentVoiceSettings(input)
});

const normalizeRegenerateSceneInput = (
    input: VideoAgentRegenerateSceneInput
) => ({
    ...input,
    projectId: input.projectId.trim(),
    prompt: input.prompt.trim(),
    sceneId: input.sceneId.trim(),
    selectedVoice: input.selectedVoice.trim(),
    selectedVoiceType: input.selectedVoiceType?.trim(),
    ...normalizeVideoAgentVoiceSettings(input)
});

const normalizeRegenerateVoicesInput = (
    input: VideoAgentRegenerateVoicesInput
) => ({
    ...input,
    projectId: input.projectId.trim(),
    selectedVoice: input.selectedVoice.trim(),
    selectedVoiceType: input.selectedVoiceType?.trim(),
    ...normalizeVideoAgentVoiceSettings(input)
});

const findAgentEnvFilePath = () => {
    const candidates = [process.cwd()];
    let currentDirectory = process.cwd();

    for (let index = 0; index < 4; index += 1) {
        const parentDirectory = path.dirname(currentDirectory);

        if (parentDirectory === currentDirectory) break;

        candidates.push(parentDirectory);
        currentDirectory = parentDirectory;
    }

    for (const directory of candidates) {
        for (const fileName of ['.env.local', '.env']) {
            const filePath = path.join(directory, fileName);

            if (existsSync(filePath)) return filePath;
        }
    }

    return undefined;
};

const createDefaultProviders = ({
    customVoiceReferenceResolver,
    loadEnv,
    modelProvider,
    ttsProvider
}: ProviderFactoryInput): ProviderFactoryResult => {
    if (modelProvider && ttsProvider) {
        return {
            modelProvider,
            ttsProvider
        };
    }

    const env =
        loadEnv?.() ?? loadAgentEnv({ envFilePath: findAgentEnvFilePath() });
    const defaultTtsProvider =
        ttsProvider ?? new VolcengineTtsProvider({ env });
    const resolvedTtsProvider =
        ttsProvider || !customVoiceReferenceResolver
            ? defaultTtsProvider
            : new RoutingTtsProvider({
                  customProvider: new IndexTts2Provider({
                      resolveVoiceReferencePath: customVoiceReferenceResolver
                  }),
                  defaultProvider: defaultTtsProvider
              });

    return {
        modelProvider: modelProvider ?? new ArkChatModelProvider({ env }),
        ttsProvider: resolvedTtsProvider
    };
};

const toDesktopGraphEvent = ({
    event,
    state
}: {
    event: AgentRunEvent;
    state: LangGraphVideoAgentRunState;
}): DesktopAgentRunEvent => {
    if (event.type === 'run.started') {
        return {
            ...event,
            input: {
                ...event.input,
                selectedVoice: state.input.selectedVoice,
                selectedVoiceType: state.input.selectedVoiceType,
                voiceSpeed: state.input.voiceSpeed,
                voiceVolume: state.input.voiceVolume
            }
        };
    }

    return event as DesktopAgentRunEvent;
};

const graphResultToOperationResult = ({
    errors,
    runId,
    status
}: {
    errors: string[];
    runId: string;
    status: 'completed' | 'failed' | 'waiting_for_approval';
}): VideoAgentOperationResult<VideoAgentResultData> => {
    if (status === 'failed') {
        return failure({
            code: 'RUN_FAILED',
            message: errors[0] ?? '智能体任务执行失败'
        });
    }

    return success({ runId });
};

export const createDemoVideoAgentController = ({
    createRunId = () => `run_${randomUUID()}`,
    now = () => new Date().toISOString()
}: {
    createRunId?: () => string;
    now?: () => string;
} = {}): VideoAgentIpcController => {
    const runs = new Map<string, DemoVideoAgentRunState>();

    const emitForRun = (
        state: DemoVideoAgentRunState,
        event: UnsequencedDesktopAgentRunEvent,
        emit: VideoAgentEventEmitter
    ) => {
        state.sequence += 1;
        emit({
            ...event,
            createdAt: now(),
            runId: state.runId,
            sequence: state.sequence
        } as DesktopAgentRunEvent);
    };

    return {
        analyzeAsset: async (input) =>
            success({
                runId: input.runId
            }),
        approve: async (input, emit) => {
            const state = runs.get(input.runId);

            if (!state) {
                return failure({
                    code: 'RUN_FAILED',
                    message: '未找到对应的智能体任务'
                });
            }

            if (!input.approved) {
                emitForRun(
                    state,
                    {
                        reason: '用户取消分镜确认',
                        type: 'run.cancelled'
                    },
                    emit
                );

                return failure({
                    code: 'CANCELLED',
                    message: '已取消智能创作任务'
                });
            }

            emitForRun(
                state,
                {
                    nodeName: 'asset_matcher',
                    type: 'node.started'
                },
                emit
            );
            emitForRun(
                state,
                {
                    nodeName: 'asset_matcher',
                    type: 'node.completed'
                },
                emit
            );
            emitForRun(
                state,
                {
                    nodeName: 'tts',
                    type: 'node.started'
                },
                emit
            );
            emitForRun(
                state,
                {
                    nodeName: 'tts',
                    type: 'node.completed'
                },
                emit
            );
            emitForRun(
                state,
                {
                    nodeName: 'timeline_assemble',
                    type: 'node.started'
                },
                emit
            );
            emitForRun(
                state,
                {
                    nodeName: 'timeline_assemble',
                    type: 'node.completed'
                },
                emit
            );
            emitForRun(
                state,
                {
                    projectId: `project_${state.runId}`,
                    savedProjectPath: undefined,
                    type: 'run.completed'
                },
                emit
            );

            return success({
                runId: state.runId
            });
        },
        cancel: async (input, emit) => {
            const state = runs.get(input.runId);

            if (!state) {
                return failure({
                    code: 'RUN_FAILED',
                    message: '未找到对应的智能体任务'
                });
            }

            emitForRun(
                state,
                {
                    reason: '用户取消任务',
                    type: 'run.cancelled'
                },
                emit
            );

            return success({
                runId: state.runId
            });
        },
        regenerateScene: async (rawInput, emit) => {
            const input = normalizeRegenerateSceneInput(rawInput);
            const state: DemoVideoAgentRunState = {
                input: {
                    prompt: input.prompt,
                    selectedVoice: input.selectedVoice,
                    selectedVoiceType: input.selectedVoiceType,
                    sourceAssetDirectory: input.projectId,
                    voiceSpeed: input.voiceSpeed,
                    voiceVolume: input.voiceVolume
                },
                runId: `regen_${randomUUID()}`,
                sequence: 0
            };

            if (!input.projectId || !input.sceneId || !input.prompt) {
                return failure({
                    code: 'VALIDATION_FAILED',
                    message: '请选择分镜并输入优化要求'
                });
            }

            emitForRun(
                state,
                {
                    nodeName: 'scene_planner',
                    type: 'node.started'
                },
                emit
            );
            emitForRun(
                state,
                {
                    nodeName: 'asset_matcher',
                    type: 'node.started'
                },
                emit
            );
            emitForRun(
                state,
                {
                    nodeName: 'tts',
                    type: 'node.started'
                },
                emit
            );
            emitForRun(
                state,
                {
                    projectId: input.projectId,
                    type: 'run.completed'
                },
                emit
            );

            return success({
                projectId: input.projectId,
                runId: state.runId
            });
        },
        regenerateVoices: async (rawInput, emit) => {
            const input = normalizeRegenerateVoicesInput(rawInput);
            const state: DemoVideoAgentRunState = {
                input: {
                    prompt: '重新生成全量旁白',
                    selectedVoice: input.selectedVoice,
                    selectedVoiceType: input.selectedVoiceType,
                    sourceAssetDirectory: input.projectId,
                    voiceSpeed: input.voiceSpeed,
                    voiceVolume: input.voiceVolume
                },
                runId: `voice_regen_${randomUUID()}`,
                sequence: 0
            };

            if (!input.projectId || !input.selectedVoice) {
                return failure({
                    code: 'VALIDATION_FAILED',
                    message: '请选择项目和音色'
                });
            }

            emitForRun(
                state,
                {
                    nodeName: 'voice_regeneration',
                    type: 'node.started'
                },
                emit
            );
            emitForRun(
                state,
                {
                    projectId: input.projectId,
                    type: 'run.completed'
                },
                emit
            );

            return success({
                projectId: input.projectId,
                runId: state.runId
            });
        },
        start: async (rawInput, emit) => {
            const input = normalizeStartInput(rawInput);

            if (!input.sourceAssetDirectory) {
                return failure({
                    code: 'VALIDATION_FAILED',
                    message: '请选择本地素材目录'
                });
            }

            if (!input.prompt) {
                return failure({
                    code: 'VALIDATION_FAILED',
                    message: '请输入视频创作文稿'
                });
            }

            const state: DemoVideoAgentRunState = {
                input,
                runId: createRunId(),
                sequence: 0
            };
            runs.set(state.runId, state);

            emitForRun(
                state,
                {
                    input: {
                        prompt: input.prompt,
                        selectedVoice: input.selectedVoice,
                        selectedVoiceType: input.selectedVoiceType,
                        sourceAssetDirectory: input.sourceAssetDirectory,
                        voiceSpeed: input.voiceSpeed,
                        voiceVolume: input.voiceVolume
                    },
                    type: 'run.started'
                },
                emit
            );
            emitForRun(
                state,
                {
                    nodeName: 'asset_scan',
                    type: 'node.started'
                },
                emit
            );
            emitForRun(
                state,
                {
                    nodeName: 'asset_scan',
                    type: 'node.completed'
                },
                emit
            );
            emitForRun(
                state,
                {
                    nodeName: 'scene_planner',
                    type: 'node.started'
                },
                emit
            );
            emitForRun(
                state,
                {
                    delta: '正在根据文稿拆解分镜、节奏和画面意图',
                    nodeName: 'scene_planner',
                    type: 'model.delta'
                },
                emit
            );
            emitForRun(
                state,
                {
                    nodeName: 'scene_planner',
                    type: 'node.completed'
                },
                emit
            );
            emitForRun(
                state,
                {
                    approval: {
                        payload: {
                            prompt: input.prompt,
                            selectedVoice: input.selectedVoice
                        },
                        type: 'scene-plan'
                    },
                    type: 'approval.required'
                },
                emit
            );

            return success({
                runId: state.runId
            });
        },
        reportSelectedFrames: async (rawInput) => {
            return success({
                runId: rawInput.runId
            });
        }
    };
};

export const createLangGraphVideoAgentController = ({
    createRunId = () => `run_${randomUUID()}`,
    createRunner,
    customVoiceReferenceResolver,
    loadEnv,
    modelProvider,
    now = () => new Date().toISOString(),
    store,
    ttsProvider,
    voiceOutputDirectory = path.join(tmpdir(), 'miaoma-magicut', 'voices')
}: {
    createRunId?: () => string;
    createRunner?: LangGraphRunnerFactory;
    customVoiceReferenceResolver?: (
        voiceId: string
    ) => Promise<string> | string;
    loadEnv?: () => AgentEnv;
    modelProvider?: ModelProvider;
    now?: () => string;
    store: VideoProjectStore;
    ttsProvider?: TtsProvider;
    voiceOutputDirectory?: string;
}): VideoAgentIpcController => {
    const activeEmitters = new Map<string, VideoAgentEventEmitter>();
    const runs = new Map<string, LangGraphVideoAgentRunState>();
    const voiceRegenerationRuns = new Map<string, VoiceRegenerationRunState>();
    // Step 2 多模态理解用到的缓存:
    // - keyframesByRunId: scan 阶段推过来的所有 keyframes(全量,用于兜底)
    // - fileNameByRunId: 资产 → 原始 fileName(修之前 .map(()=>'').join('') 永远是空字符串的 bug)
    // - selectedFramesByRunId: renderer 实时推过来的代表帧(用户精选,优先用)
    const keyframesByRunId = new Map<
        string,
        Map<
            string,
            {
                dataUrl: string;
                index: number;
                timestampMs: number;
            }[]
        >
    >();
    const fileNameByRunId = new Map<string, Map<string, string>>();
    const selectedFramesByRunId = new Map<
        string,
        Map<
            string,
            {
                dataUrl: string;
                index: number;
                timestampMs: number;
            }[]
        >
    >();
    // 当 tools 内部 emit 一个 sequence=0 的事件(说明没有 sequence 来源),
    // 我们用 lastSequences 统一分配递增 sequence,跟 graph node 事件保持单调。
    const lastSequences = new Map<string, number>();
    const getSelectedVoice = (runId: string) =>
        runs.get(runId)?.input.selectedVoice;
    const getSelectedVoiceType = (runId: string) =>
        runs.get(runId)?.input.selectedVoiceType;
    const getVoiceSettings = (runId: string) => {
        const input = runs.get(runId)?.input;

        if (!input) return undefined;

        return {
            voiceSpeed: input.voiceSpeed,
            voiceVolume: input.voiceVolume
        };
    };
    const createScopedRunId = (scope: string) => {
        const runId = createRunId();

        if (runId.startsWith(`${scope}_`)) return runId;
        if (runId.startsWith('run_')) return `${scope}_${runId.slice(4)}`;

        return `${scope}_${runId}`;
    };

    const rememberKeyframes = (
        runId: string,
        assetId: string,
        keyframes: {
            dataUrl: string;
            index: number;
            timestampMs: number;
        }[]
    ) => {
        let perAsset = keyframesByRunId.get(runId);

        if (!perAsset) {
            perAsset = new Map();
            keyframesByRunId.set(runId, perAsset);
        }
        perAsset.set(assetId, keyframes);
    };
    const rememberFileName = (
        runId: string,
        assetId: string,
        fileName: string
    ) => {
        let perAsset = fileNameByRunId.get(runId);

        if (!perAsset) {
            perAsset = new Map();
            fileNameByRunId.set(runId, perAsset);
        }
        perAsset.set(assetId, fileName);
    };
    const getFileName = (runId: string, assetId: string) =>
        fileNameByRunId.get(runId)?.get(assetId);

    const emitGraphEvent = (event: AgentRunEvent) => {
        const state = runs.get(event.runId);

        if (!state) return;

        // 缓存 scan 阶段的 keyframes + fileName,供后续 analyzeAsset 使用。
        // 必须在分配 sequence 之前做,确保 cache miss 时不会 race。
        if (event.type === 'asset_scan_progress') {
            rememberKeyframes(event.runId, event.assetId, event.keyframes);
            rememberFileName(event.runId, event.assetId, event.fileName);
        }

        // graph node 已经填了 sequence 的事件原样用;否则用 lastSequences
        // 分配一个递增 sequence(主要给 tools 内部 emit 用)。
        let sequence = event.sequence;

        if (sequence === 0) {
            sequence = (lastSequences.get(event.runId) ?? 0) + 1;
        }

        lastSequences.set(event.runId, sequence);
        state.sequence = sequence;
        activeEmitters.get(event.runId)?.(
            toDesktopGraphEvent({
                event: { ...event, sequence },
                state
            })
        );
    };
    let providers: ProviderFactoryResult | undefined;
    const getProviders = () => {
        if (providers) return providers;

        providers = createDefaultProviders({
            customVoiceReferenceResolver,
            loadEnv,
            modelProvider,
            ttsProvider
        });

        return providers;
    };
    let runner: VideoCreationGraphRunner | undefined;
    const getRunner = () => {
        if (runner) return runner;

        if (createRunner) {
            runner = createRunner({
                emit: emitGraphEvent,
                getSelectedVoice,
                getSelectedVoiceType
            });
            return runner;
        }

        const runnerProviders = getProviders();

        // Resolve the bundled ffprobe path so scanAssets can probe real
        // metadata for each source video. Without this, the agent falls
        // back to a placeholder duration, which misleads both the AI
        // matcher and the timeline assembler.
        let ffprobePath: string | undefined;
        let ffmpegPath: string | undefined;
        try {
            const binaries = resolveVideoExportBinaries({
                appPath: app.getAppPath(),
                isPackaged: app.isPackaged,
                platform: process.platform as
                    | 'darwin'
                    | 'linux'
                    | 'win32',
                resourcesPath: process.resourcesPath
            });
            if (existsSync(binaries.ffprobePath)) {
                ffprobePath = binaries.ffprobePath;
            }
            if (existsSync(binaries.ffmpegPath)) {
                ffmpegPath = binaries.ffmpegPath;
            }
        } catch {
            // Running outside Electron (e.g. unit tests) — ffprobePath
            // stays undefined and scanAssets uses its placeholder path.
        }

        runner = createVideoCreationGraph({
            emit: emitGraphEvent,
            tools: createDesktopVideoAgentTools({
                // 工具 emit 的 asset_scan_progress 走 graph 的 emit 通道,
                // 跟节点事件共享同一个 sequence 计数器,避免乱序。
                emit: emitGraphEvent,
                ffmpegPath,
                ffprobePath,
                getSelectedVoice,
                getSelectedVoiceType,
                getVoiceSettings,
                modelProvider: runnerProviders.modelProvider,
                now,
                store,
                ttsProvider: runnerProviders.ttsProvider,
                voiceOutputDirectory
            })
        });

        return runner;
    };

    const emitForRun = (
        state: LangGraphVideoAgentRunState,
        event: UnsequencedDesktopAgentRunEvent,
        emit: VideoAgentEventEmitter
    ) => {
        state.sequence += 1;
        emit({
            ...event,
            createdAt: now(),
            runId: state.runId,
            sequence: state.sequence
        } as DesktopAgentRunEvent);
    };

    const emitForVoiceRegenerationRun = (
        state: VoiceRegenerationRunState,
        event: UnsequencedDesktopAgentRunEvent,
        emit: VideoAgentEventEmitter
    ) => {
        state.sequence += 1;
        emit({
            ...event,
            createdAt: now(),
            runId: state.runId,
            sequence: state.sequence
        } as DesktopAgentRunEvent);
    };

    const runWithEmitter = async (
        runId: string,
        emit: VideoAgentEventEmitter,
        operation: () => Promise<
            VideoAgentOperationResult<VideoAgentResultData>
        >
    ): Promise<VideoAgentOperationResult<VideoAgentResultData>> => {
        activeEmitters.set(runId, emit);

        try {
            return await operation();
        } catch (error) {
            return failure<VideoAgentResultData>({
                code: 'RUN_FAILED',
                message: serializeError(error)
            });
        } finally {
            activeEmitters.delete(runId);
        }
    };

    return {
        approve: async (input, emit) => {
            const state = runs.get(input.runId);

            if (!state) {
                return failure({
                    code: 'RUN_FAILED',
                    message: '未找到对应的智能体任务'
                });
            }

            if (!input.approved) {
                emitForRun(
                    state,
                    {
                        reason: '用户取消分镜确认',
                        type: 'run.cancelled'
                    },
                    emit
                );

                return failure({
                    code: 'CANCELLED',
                    message: '已取消智能创作任务'
                });
            }

            return runWithEmitter(input.runId, emit, async () => {
                const result = await getRunner().resume({
                    approval: {
                        approved: input.approved
                    },
                    runId: input.runId
                });

                return graphResultToOperationResult(result);
            });
        },
        cancel: async (input, emit) => {
            const voiceRegenerationState = voiceRegenerationRuns.get(
                input.runId
            );

            if (voiceRegenerationState) {
                voiceRegenerationState.cancelled = true;

                if (!voiceRegenerationState.cancelEventEmitted) {
                    voiceRegenerationState.cancelEventEmitted = true;
                    emitForVoiceRegenerationRun(
                        voiceRegenerationState,
                        {
                            reason: '用户取消口播音轨生成',
                            type: 'run.cancelled'
                        },
                        emit
                    );
                }

                return success({
                    runId: input.runId
                });
            }

            const state = runs.get(input.runId);

            if (!state) {
                return failure({
                    code: 'RUN_FAILED',
                    message: '未找到对应的智能体任务'
                });
            }

            emitForRun(
                state,
                {
                    reason: '用户取消任务',
                    type: 'run.cancelled'
                },
                emit
            );

            return success({
                runId: input.runId
            });
        },
        regenerateScene: async (rawInput, emit) => {
            const input = normalizeRegenerateSceneInput(rawInput);

            if (!input.projectId || !input.sceneId || !input.prompt) {
                return failure({
                    code: 'VALIDATION_FAILED',
                    message: '请选择分镜并输入优化要求'
                });
            }

            try {
                const sceneRegeneration = await regenerateVideoProjectScene({
                    createRunId: () => `regen_${randomUUID()}`,
                    emit,
                    input,
                    modelProvider: getProviders().modelProvider,
                    now,
                    store,
                    ttsProvider: getProviders().ttsProvider,
                    voiceOutputDirectory
                });

                return success({
                    projectId: sceneRegeneration.project.project.id,
                    runId: sceneRegeneration.runId
                });
            } catch (error) {
                return failure({
                    code: 'RUN_FAILED',
                    message: serializeError(error)
                });
            }
        },
        regenerateVoices: async (rawInput, emit) => {
            const input = normalizeRegenerateVoicesInput(rawInput);

            if (!input.projectId || !input.selectedVoice) {
                return failure({
                    code: 'VALIDATION_FAILED',
                    message: '请选择项目和音色'
                });
            }

            const runId = createScopedRunId('voice_regen');
            const state: VoiceRegenerationRunState = {
                cancelEventEmitted: false,
                cancelled: false,
                runId,
                sequence: 0
            };
            voiceRegenerationRuns.set(runId, state);

            const runInBackground = async () => {
                try {
                    await regenerateVideoProjectVoices({
                        createRunId: () => runId,
                        emit,
                        emitForRun: (event) => {
                            emitForVoiceRegenerationRun(state, event, emit);
                        },
                        input,
                        isCancelled: () => state.cancelled,
                        now,
                        runId,
                        store,
                        ttsProvider: getProviders().ttsProvider,
                        voiceOutputDirectory
                    });
                } catch (error) {
                    if (
                        state.cancelled &&
                        (state.cancelEventEmitted ||
                            isVoiceRegenerationCancelled(error))
                    ) {
                        return;
                    }

                    emitForVoiceRegenerationRun(
                        state,
                        {
                            error: serializeError(error),
                            type: 'run.failed'
                        },
                        emit
                    );
                } finally {
                    voiceRegenerationRuns.delete(runId);
                }
            };

            void runInBackground();

            return success({
                projectId: input.projectId,
                runId
            });
        },
        start: async (rawInput, emit) => {
            const input = normalizeStartInput(rawInput);

            if (!input.sourceAssetDirectory) {
                return failure({
                    code: 'VALIDATION_FAILED',
                    message: '请选择本地素材目录'
                });
            }

            if (!input.prompt) {
                return failure({
                    code: 'VALIDATION_FAILED',
                    message: '请输入视频创作文稿'
                });
            }

            const runId = createRunId();
            const state: LangGraphVideoAgentRunState = {
                input,
                runId,
                sequence: 0
            };
            runs.set(runId, state);

            activeEmitters.set(runId, emit);

            const runInBackground = async () => {
                try {
                    await getRunner().start({
                        prompt: input.prompt,
                        runId,
                        sourceAssetDirectory: input.sourceAssetDirectory
                    });
                } catch (error) {
                    emitForRun(
                        state,
                        {
                            error: serializeError(error),
                            type: 'run.failed'
                        },
                        emit
                    );
                } finally {
                    activeEmitters.delete(runId);
                }
            };

            void runInBackground();

            return success({
                runId
            });
        },
        reportSelectedFrames: async (rawInput) => {
            const input = {
                assetId: rawInput.assetId.trim(),
                frames: rawInput.frames,
                runId: rawInput.runId.trim()
            };

            if (!input.runId || !input.assetId) {
                return failure({
                    code: 'VALIDATION_FAILED',
                    message: '缺少 runId 或 assetId'
                });
            }
            if (input.frames.length === 0) {
                return failure({
                    code: 'VALIDATION_FAILED',
                    message: '至少需要选中 1 张代表帧'
                });
            }

            let perAsset = selectedFramesByRunId.get(input.runId);

            if (!perAsset) {
                perAsset = new Map();
                selectedFramesByRunId.set(input.runId, perAsset);
            }
            perAsset.set(input.assetId, input.frames);

            return success({
                runId: input.runId
            });
        },
        analyzeAsset: async (rawInput, emit) => {
            const input = {
                assetId: rawInput.assetId.trim(),
                runId: rawInput.runId.trim()
            };

            if (!input.runId || !input.assetId) {
                return failure({
                    code: 'VALIDATION_FAILED',
                    message: '缺少 runId 或 assetId'
                });
            }

            const runState = runs.get(input.runId);

            if (!runState) {
                return failure({
                    code: 'RUN_FAILED',
                    message: '未找到对应的智能体任务'
                });
            }

            // 优先用用户实时推过来的代表帧;没推过就 fallback 到 scan 全量
            // (按 frameCount 截前 N,默认 3)。无论哪种都得 > 0。
            const selected =
                selectedFramesByRunId.get(input.runId)?.get(input.assetId);
            const allKeyframes =
                keyframesByRunId.get(input.runId)?.get(input.assetId) ?? [];
            const frames =
                selected && selected.length > 0
                    ? selected
                    : allKeyframes.slice(0, 3);

            if (frames.length === 0) {
                return failure({
                    code: 'VALIDATION_FAILED',
                    message: '该资产还没有可用的关键帧,请先等待抽帧完成'
                });
            }

            const providers = getProviders();
            const modelProvider = providers.modelProvider;

            if (!modelProvider.describeImages) {
                return failure({
                    code: 'RUN_FAILED',
                    message: '当前模型不支持多模态画面理解'
                });
            }

            const fileName =
                getFileName(input.runId, input.assetId) ?? input.assetId;
            const startedAt = now();
            const sequence = (lastSequences.get(input.runId) ?? 0) + 1;

            lastSequences.set(input.runId, sequence);
            activeEmitters.get(input.runId)?.({
                assetId: input.assetId,
                createdAt: startedAt,
                fileName,
                promptMatchReason: '',
                promptMatchScore: 0,
                runId: input.runId,
                sequence,
                type: 'asset_understood',
                understanding: {
                    actions: [],
                    description: '正在调用多模态模型…',
                    mood: '',
                    objects: [],
                    suggestedSceneType: ''
                }
            } as DesktopAgentRunEvent);

            try {
                const described = await modelProvider.describeImages({
                    frames,
                    userPrompt: runState.input.prompt
                });

                const completedAt = now();
                const completedSequence =
                    (lastSequences.get(input.runId) ?? sequence) + 1;

                lastSequences.set(input.runId, completedSequence);
                activeEmitters.get(input.runId)?.({
                    assetId: input.assetId,
                    createdAt: completedAt,
                    fileName,
                    promptMatchReason: described.promptMatchReason,
                    promptMatchScore: described.promptMatchScore,
                    runId: input.runId,
                    sequence: completedSequence,
                    type: 'asset_understood',
                    understanding: {
                        actions: described.actions,
                        description: described.description,
                        mood: described.mood,
                        objects: described.objects,
                        suggestedSceneType: described.suggestedSceneType
                    }
                } as DesktopAgentRunEvent);

                return success({
                    runId: input.runId
                });
            } catch (error) {
                // 失败降级:不阻塞后续节点,console.warn 留痕,返回失败
                // 但不 emit 失败事件(用户卡片依然保持原 description 透传)。
                // eslint-disable-next-line no-console
                console.warn(
                    `[analyzeAsset] 多模态理解失败 ${fileName}: ${
                        error instanceof Error
                            ? error.message
                            : String(error)
                    }`
                );

                return failure({
                    code: 'RUN_FAILED',
                    message: `画面理解失败:${serializeError(error)}`
                });
            }
        }
    };
};

export const registerVideoAgentIpc = ({
    controller,
    ipcMain
}: {
    controller: VideoAgentIpcController;
    ipcMain: VideoAgentIpcMain;
}) => {
    const emitToRenderer =
        (event: VideoAgentIpcEvent): VideoAgentEventEmitter =>
        (agentEvent) => {
            event.sender.send(videoAgentIpcChannels.event, agentEvent);
        };

    ipcMain.handle(videoAgentIpcChannels.start, (event, input) =>
        controller.start(input as VideoAgentStartInput, emitToRenderer(event))
    );
    ipcMain.handle(videoAgentIpcChannels.approve, (event, input) =>
        controller.approve(
            input as VideoAgentApprovalInput,
            emitToRenderer(event)
        )
    );
    ipcMain.handle(videoAgentIpcChannels.cancel, (event, input) =>
        controller.cancel(input as VideoAgentCancelInput, emitToRenderer(event))
    );
    ipcMain.handle(videoAgentIpcChannels.regenerateScene, (event, input) =>
        controller.regenerateScene(
            input as VideoAgentRegenerateSceneInput,
            emitToRenderer(event)
        )
    );
    ipcMain.handle(videoAgentIpcChannels.regenerateVoices, (event, input) =>
        controller.regenerateVoices(
            input as VideoAgentRegenerateVoicesInput,
            emitToRenderer(event)
        )
    );
    ipcMain.handle(videoAgentIpcChannels.reportSelectedFrames, (event, input) =>
        controller.reportSelectedFrames(
            input as VideoAgentReportSelectedFramesInput,
            emitToRenderer(event)
        )
    );
    ipcMain.handle(videoAgentIpcChannels.analyzeAsset, (event, input) =>
        controller.analyzeAsset(
            input as VideoAgentAnalyzeAssetInput,
            emitToRenderer(event)
        )
    );
};
