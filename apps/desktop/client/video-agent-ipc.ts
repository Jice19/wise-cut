/**
 * video-agent 主进程 controller —— commit 6 阶段。
 *
 * 两种实现:
 *   - createDemoVideoAgentController:用 setTimeout 模拟 10 节点流水线进度
 *     (commit 5 引入),无需 LangGraph + 无需 ffmpeg + LLM,适合本地 smoke test
 *   - createLangGraphVideoAgentController:接 LangGraph StateGraph 跑真实
 *     scan_assets + analyze_assets 两个节点,真解析视频元数据 + 帧描述
 *     (commit 6 聚焦版,其它 8 节点留 commit 6.5)
 *
 * 两种实现共用 13 种 AgentRunEvent + per-invoke emit 闭包,渲染层不感知。
 */

import { mkdir, rm, writeFile } from 'node:fs/promises';
import { join } from 'node:path';

import {
    createFsVideoAgentTools,
    type ModelProvider
} from '@miaoma-magicut/video-agent';
import type { IpcMainInvokeEvent } from 'electron';

import {
    type AgentRunEvent,
    IPC,
    type SceneApprovalRequest,
    type VideoCreationInput
} from '../shared/ipc';

/**
 * run 状态(controller 内部维护)。
 */
type RunState = {
    input: VideoCreationInput;
    cancelled: boolean;
    projectPath: string | undefined;
    /** 等待 scene_approval 的 resolve 句柄,approve 时调用 */
    approvalResolve: ((approved: boolean) => void) | undefined;
    /** approve 后流水线继续推进 */
    approvalReject: ((error: Error) => void) | undefined;
    /** 给单 run 用的临时目录(导出/中间文件) */
    workDir: string;
};

/**
 * controller 通过 emit 把事件推给指定 renderer 进程(per-invoke 闭包)。
 */
export type DesktopEventEmitter = (event: AgentRunEvent) => void;

/**
 * 保存项目到本机磁盘的工具接口 —— commit 5 阶段直接落到 userData
 * 下的 project.json,commit 7 起改用 video-project-store。
 */
type ProjectStore = (params: {
    projectId: string;
    projectJson: unknown;
    outputDir: string;
}) => Promise<string>;

const buildProjectId = (runId: string): string => `proj-${runId}`;

const defaultProjectStore: ProjectStore = async ({
    projectId,
    projectJson,
    outputDir
}) => {
    await mkdir(outputDir, { recursive: true });
    const path = join(outputDir, `${projectId}.json`);
    await writeFile(path, JSON.stringify(projectJson, null, 2), 'utf-8');
    return path;
};

/**
 * 10 节点流水线阶段名 + 中文 label(emit 出去 renderer 显示用)。
 */
const NODE_PIPELINE: { name: string; label: string; durationMs: number }[] = [
    { name: 'scan_assets', label: '扫描素材', durationMs: 800 },
    { name: 'analyze_assets', label: 'AI 理解画面', durationMs: 2500 },
    { name: 'creative_brief', label: '生成创意简报', durationMs: 1800 },
    { name: 'plan_scenes', label: '拆分镜', durationMs: 2000 },
    { name: 'scene_approval', label: '等待用户审批分镜', durationMs: 5000 },
    { name: 'match_assets', label: '匹配素材', durationMs: 1500 },
    { name: 'synthesize_voice', label: '合成配音', durationMs: 3000 },
    { name: 'assemble_timeline', label: '组装时间线', durationMs: 1200 },
    { name: 'validate_project', label: '校验项目', durationMs: 300 },
    { name: 'save_project', label: '保存项目', durationMs: 500 }
];

/**
 * scene_approval 阶段构造的 mock 分镜数据(commit 6 会被真实 plan_scenes
 * 节点产物替换)。
 */
const buildMockScenes = (
    runId: string
): SceneApprovalRequest['payload']['scenes'] => {
    const titles = ['开场镜头', '主体内容', '关键转折', '高潮迭起', '结尾升华'];
    const narrations = [
        '欢迎来到 AI 智能剪辑的世界',
        '我们将为您展示一段由人工智能生成的视频',
        '接下来是令人惊艳的转折点',
        '画面逐渐推向高潮,情感层层递进',
        '感谢观看,期待您的下一次创作'
    ];
    const visuals = [
        '全景镜头,展示 logo 与开场动画',
        '中景,人物对话场景',
        '特写,关键道具与表情',
        '远景拉近,蒙太奇剪辑',
        '字幕滚动,配乐淡出'
    ];

    return titles.map((title, i) => ({
        endMs: (i + 1) * 3000,
        narration: narrations[i] ?? title,
        sceneId: `${runId}-scene-${i + 1}`,
        startMs: i * 3000,
        visualBrief: visuals[i] ?? title
    }));
};

/**
 * 创建 demo controller —— plan §16.3 阶段 B + §17.2 commit 5 主体。
 */
export const createDemoVideoAgentController = (options: {
    outputBaseDir: string;
    projectStore?: ProjectStore;
}) => {
    const runs = new Map<string, RunState>();
    let sequence = 0;

    const store = options.projectStore ?? defaultProjectStore;
    const outputBaseDir = options.outputBaseDir;

    // 单 emitter:内部自动注入 runId/seq/timestamp,调用者只填事件特有字段
    const makeEmitter =
        (runId: string, base: DesktopEventEmitter) =>
        // 用 Record 包事件主体,这样 discriminated union 的窄类型自动继承
        (event: Record<string, unknown>): void => {
            sequence += 1;
            const evt = {
                ...event,
                runId,
                seq: sequence,
                timestamp: Date.now()
            } as unknown as AgentRunEvent;
            base(evt);
        };

    /**
     * 跑单个节点的 setTimeout 模拟,emit node.started / node.completed,
     * 节点内 50% 进度回调(给 renderer 进度条反馈)。
     */
    const runMockNode = async (
        state: RunState,
        nodeIndex: number,
        emit: ReturnType<typeof makeEmitter>
    ): Promise<void> => {
        if (state.cancelled) throw new Error('cancelled');

        const def = NODE_PIPELINE[nodeIndex];
        if (!def) throw new Error(`invalid node index ${nodeIndex}`);

        emit({
            type: 'node.started',
            nodeLabel: def.label,
            nodeName: def.name
        });

        // 节点内进度(分两段上报)
        await sleep(def.durationMs / 2);
        if (state.cancelled) throw new Error('cancelled');
        emit({
            message: `${def.label}进行中...`,
            nodeName: def.name,
            progress: 50,
            type: 'node.progress'
        });

        await sleep(def.durationMs / 2);
        if (state.cancelled) throw new Error('cancelled');
        emit({
            nodeName: def.name,
            durationMs: def.durationMs,
            type: 'node.completed'
        });
    };

    /**
     * scene_approval 特殊节点 —— 暂停流水线,emit interrupt 事件,
     * 等用户 approve。commit 6 用 LangGraph interrupt() + Command({ resume })
     * 替代,这里用 Promise + 状态机模拟。
     */
    const runMockApproval = (
        state: RunState,
        emit: ReturnType<typeof makeEmitter>
    ): Promise<boolean> =>
        new Promise<boolean>((resolve, reject) => {
            emit({
                type: 'node.started',
                nodeLabel: '等待用户审批分镜',
                nodeName: 'scene_approval'
            });

            const approvalPayload: SceneApprovalRequest = {
                payload: {
                    brief: {
                        audience: '短视频用户',
                        keyMessages: ['AI 自动剪辑', '一键生成'],
                        summary: `${state.input.brief} 的短视频创意简报`,
                        title: `创意简报 ${state.input.runId}`,
                        tone: '友好亲切'
                    },
                    scenes: buildMockScenes(state.input.runId)
                },
                type: 'scene-plan'
            };

            emit({
                type: 'interrupt',
                interruptType: 'scene_approval',
                payload: approvalPayload
            });

            state.approvalResolve = resolve;
            state.approvalReject = reject;
        });

    /**
     * 主入口 —— 跑完整 10 节点流水线。
     */
    const start = async (
        input: VideoCreationInput,
        emit: DesktopEventEmitter
    ): Promise<{
        status: 'completed' | 'cancelled' | 'failed';
        projectPath?: string;
    }> => {
        const startedAt = Date.now();
        const workDir = join(outputBaseDir, `run-${input.runId}`);
        await mkdir(workDir, { recursive: true });

        const state: RunState = {
            approvalReject: undefined,
            approvalResolve: undefined,
            cancelled: false,
            input,
            projectPath: undefined,
            workDir
        };
        runs.set(input.runId, state);

        const emitEvt = makeEmitter(input.runId, emit);

        try {
            emitEvt({ type: 'run.started', input });

            // 跑前 4 节点:scan / analyze / brief / plan
            for (let i = 0; i < 4; i += 1) {
                await runMockNode(state, i, emitEvt);
            }

            // 跑 scene_approval(暂停 + 等用户)
            emitEvt({
                type: 'node.completed',
                nodeName: 'plan_scenes',
                durationMs: 0
            });
            const approved = await runMockApproval(state, emitEvt);
            if (!approved) {
                emitEvt({ type: 'run.cancelled' });
                return { status: 'cancelled' };
            }

            emitEvt({
                type: 'node.completed',
                nodeName: 'scene_approval',
                durationMs: 0
            });

            // 跑后 5 节点:match / voice / assemble / validate / save
            for (let i = 5; i < NODE_PIPELINE.length; i += 1) {
                await runMockNode(state, i, emitEvt);
            }

            // 落盘(commit 7 起改 video-project-store)
            const projectId = buildProjectId(input.runId);
            const projectJson = {
                metadata: {
                    createdAt: Date.now(),
                    projectId,
                    title: input.brief,
                    updatedAt: Date.now()
                },
                renderConfig: { format: 'mp4', quality: 'preview' }
            };
            const projectPath = await store({
                outputDir: outputBaseDir,
                projectId,
                projectJson
            });
            state.projectPath = projectPath;

            emitEvt({
                durationMs: Date.now() - startedAt,
                projectPath,
                type: 'run.completed'
            });
            return { projectPath, status: 'completed' };
        } catch (error) {
            if (state.cancelled) {
                emitEvt({ type: 'run.cancelled' });
                return { status: 'cancelled' };
            }
            emitEvt({
                error: (error as Error).message,
                type: 'run.failed'
            });
            throw error;
        } finally {
            // 临时目录清理(commit 8 之后改成保留供 UI 看)
            await rm(workDir, { recursive: true, force: true }).catch(() => {
                // ignore cleanup failure
            });
            runs.delete(input.runId);
        }
    };

    /**
     * 批准/驳回 scene_approval。commit 6 起改用 Command({ resume })。
     */
    const approve = (runId: string, approved: boolean): boolean => {
        const state = runs.get(runId);
        if (!state?.approvalResolve) return false;
        state.approvalResolve(approved);
        state.approvalResolve = undefined;
        state.approvalReject = undefined;

        return true;
    };

    /**
     * 取消整个 run —— 下一个 setTimeout 唤醒时检测 cancelled 并抛错。
     */
    const cancel = (runId: string): boolean => {
        const state = runs.get(runId);
        if (!state) return false;
        state.cancelled = true;
        // 唤醒 approval 等待中的 Promise
        state.approvalReject?.(new Error('cancelled'));
        state.approvalResolve = undefined;
        state.approvalReject = undefined;

        return true;
    };

    /**
     * 单分镜重生 —— commit 5 简化版(只 emit progress + 完成事件,真重生成
     * 在 commit 5 step 2 加)。
     */
    const regenerateScene = async (
        runId: string,
        sceneId: string,
        feedback: string | undefined,
        emit: DesktopEventEmitter
    ): Promise<{ status: 'completed' }> => {
        const state = runs.get(runId);
        if (!state) throw new Error(`run ${runId} not found`);

        const emitEvt = makeEmitter(runId, emit);
        emitEvt({
            nodeName: 'regenerate_scene',
            nodeLabel: `重新生成分镜 ${sceneId}`,
            type: 'node.started'
        });

        // 模拟耗时
        await sleep(1500);
        emitEvt({
            message: feedback
                ? `已根据反馈 "${feedback}" 重新生成`
                : '已重新生成分镜',
            nodeName: 'regenerate_scene',
            progress: 100,
            type: 'node.progress'
        });
        emitEvt({
            durationMs: 1500,
            nodeName: 'regenerate_scene',
            type: 'node.completed'
        });

        return { status: 'completed' };
    };

    /**
     * 整批配音重生(emit voice.regeneration.progress)。
     */
    const regenerateVoices = async (
        runId: string,
        emit: DesktopEventEmitter
    ): Promise<{ status: 'completed' }> => {
        const state = runs.get(runId);
        if (!state) throw new Error(`run ${runId} not found`);

        const emitEvt = makeEmitter(runId, emit);

        for (let i = 1; i <= 5; i += 1) {
            emitEvt({
                current: i,
                percent: i * 20,
                total: 5,
                type: 'voice.regeneration.progress'
            });
            await sleep(300);
        }

        return { status: 'completed' };
    };

    /**
     * 全量状态拉取 —— commit 6 起从 LangGraph MemorySaver 拉,commit 5 返回
     * run 元信息 + 当前状态。
     */
    const requestFullState = (
        runId: string
    ): {
        runId: string;
        status: 'running' | 'cancelled' | 'completed' | 'not_found';
    } => {
        const state = runs.get(runId);
        if (!state) return { runId, status: 'not_found' };
        return { runId, status: state.cancelled ? 'cancelled' : 'running' };
    };

    return {
        approve,
        cancel,
        regenerateScene,
        regenerateVoices,
        requestFullState,
        start
    };
};

const sleep = (ms: number): Promise<void> =>
    new Promise((r) => setTimeout(r, ms));

/**
 * LangGraph 真接 controller —— commit 6 聚焦版。
 *
 * 跑真实的 scan_assets + analyze_assets 两个节点:
 *   - scan_assets:扫 sourceAssetDirectory,按后缀白名单抽 .mp4/.mov/.mkv/.webm/.avi
 *   - analyze_assets:对每个素材 probeMedia + extractKeyframes + describeFrames(M3 多模态)
 *
 * 输出 state.assets 里每个 AssetAnalysis 含真实 width/height/durationMs/fps/frames[]
 * 帧描述是 M3 返回的中文画面描述。
 *
 * commit 6.5 起会再串 creative_brief → plan_scenes → scene_approval → ...
 */

export const createLangGraphVideoAgentController = (options: {
    ffmpegPath?: string;
    ffprobePath?: string;
    outputBaseDir: string;
    projectStore?: ProjectStore;
    /**
     * 注入点 —— 测试时塞 fake provider。
     * 默认从 ARK_API_KEY + BASE_URL 构造 MinimaxM3ModelProvider。
     */
    modelProvider?: ModelProvider;
}) => {
    const runs = new Map<string, RunState>();
    let sequence = 0;

    const outputBaseDir = options.outputBaseDir;
    const ffmpegPath = options.ffmpegPath ?? 'ffmpeg';
    const ffprobePath = options.ffprobePath ?? 'ffprobe';

    const makeEmitter =
        (runId: string, base: DesktopEventEmitter) =>
        (event: Record<string, unknown>): void => {
            sequence += 1;
            const evt = {
                ...event,
                runId,
                seq: sequence,
                timestamp: Date.now()
            } as unknown as AgentRunEvent;
            base(evt);
        };

    const start = async (
        input: VideoCreationInput,
        emit: DesktopEventEmitter
    ): Promise<{
        status: 'completed' | 'cancelled' | 'failed';
        projectPath?: string;
    }> => {
        const startedAt = Date.now();
        const workDir = join(outputBaseDir, `run-${input.runId}`);
        await mkdir(workDir, { recursive: true });

        const state: RunState = {
            approvalReject: undefined,
            approvalResolve: undefined,
            cancelled: false,
            input,
            projectPath: undefined,
            workDir
        };
        runs.set(input.runId, state);

        const emitEvt = makeEmitter(input.runId, emit);

        try {
            emitEvt({ type: 'run.started', input });

            // 动态 import video-agent 包(它依赖 LangGraph,主进程只在需要时加载)
            const {
                createMemoryCheckpointer,
                createSequencedEventEmitter,
                createVideoCreationGraph,
                buildInitialState
            } = await import('@miaoma-magicut/video-agent');

            const tools = createFsVideoAgentTools();

            // model provider 注入点
            let modelProvider: ModelProvider | undefined =
                options.modelProvider;
            if (!modelProvider) {
                const apiKey =
                    process.env['ARK_API_KEY'] ?? process.env['API_KEY'] ?? '';
                if (!apiKey) {
                    throw new Error(
                        'ARK_API_KEY / API_KEY env not set; cannot construct model provider'
                    );
                }
                const { MinimaxM3ModelProvider } = await import(
                    '@miaoma-magicut/video-agent'
                );
                modelProvider = new MinimaxM3ModelProvider({ apiKey });
            }

            const sequencedEmit = createSequencedEventEmitter({
                runId: input.runId,
                sink: (evt) => emit(evt as unknown as AgentRunEvent)
            });

            if (!modelProvider) {
                throw new Error('modelProvider not initialized');
            }

            const checkpointer = createMemoryCheckpointer();
            const graph = createVideoCreationGraph({
                checkpointer,
                runtime: {
                    emit: sequencedEmit,
                    ffmpegPath,
                    ffprobePath,
                    frameOutputDirectory: join(workDir, 'frames'),
                    modelProvider,
                    projectOutputDirectory: outputBaseDir,
                    tools,
                    voiceOutputDirectory: join(workDir, 'voices')
                }
            });

            const initial = buildInitialState(input);
            const result = await graph.invoke(initial, {
                configurable: { thread_id: input.runId }
            });

            // commit 6.5:save_project 节点已经落盘,result.savedProjectPath 是真路径
            const resultState = result as unknown as {
                savedProjectPath?: string;
            };
            const projectPath = resultState.savedProjectPath;
            state.projectPath = projectPath;

            emitEvt({
                durationMs: Date.now() - startedAt,
                projectPath:
                    projectPath ??
                    join(outputBaseDir, buildProjectId(input.runId) + '.json'),
                type: 'run.completed'
            });
            return { projectPath, status: 'completed' };
        } catch (error) {
            if (state.cancelled) {
                emitEvt({ type: 'run.cancelled' });
                return { status: 'cancelled' };
            }
            emitEvt({
                error: (error as Error).message,
                type: 'run.failed'
            });
            return { status: 'failed' };
        } finally {
            await rm(workDir, { recursive: true, force: true }).catch(() => {});
            runs.delete(input.runId);
        }
    };

    /**
     * approve —— 调 LangGraph Command({ resume }) 唤醒 scene_approval interrupt。
     * commit 6.5 之前 demo controller 用 Promise.resolve 模拟,现在走真 LangGraph
     * resume 路径。
     *
     * 由于 graph 重新 invoke 是异步的且需要保留 checkpointer 状态,
     * 这里拿不到前一次的 graph 实例(已经在 start 里 await 阻塞了)。
     * 简单方案:controller 维护 graph + checkpointer 引用,start 后等
     * interrupt 信号再 resume。
     *
     * commit 6.5 简化:approve 只标记状态,实际 resume 由下一次 invoke 触发
     * (LangGraph v1 限制:interrupt 后必须重新 invoke 同一 thread_id)。
     */
    const approve = (runId: string, approved: boolean): boolean => {
        const state = runs.get(runId);
        if (!state?.approvalResolve) return false;
        state.approvalResolve(approved);
        state.approvalResolve = undefined;
        state.approvalReject = undefined;
        return true;
    };
    const cancel = (runId: string): boolean => {
        const state = runs.get(runId);
        if (!state) return false;
        state.cancelled = true;
        return true;
    };
    const regenerateScene = async (
        _runId: string,
        _sceneId: string,
        _feedback: string | undefined,
        _emit: DesktopEventEmitter
    ): Promise<{ status: 'completed' }> => {
        throw new Error('regenerateScene not implemented in langgraph mode');
    };
    const regenerateVoices = async (
        _runId: string,
        _emit: DesktopEventEmitter
    ): Promise<{ status: 'completed' }> => {
        throw new Error('regenerateVoices not implemented in langgraph mode');
    };
    const requestFullState = (
        runId: string
    ): {
        runId: string;
        status: 'running' | 'cancelled' | 'completed' | 'not_found';
    } => {
        const state = runs.get(runId);
        if (!state) return { runId, status: 'not_found' };
        return { runId, status: state.cancelled ? 'cancelled' : 'running' };
    };

    return {
        approve,
        cancel,
        regenerateScene,
        regenerateVoices,
        requestFullState,
        start
    };
};

/**
 * controller 类型 —— main.ts 用这个类型 wire handler。
 */
export type VideoAgentController = ReturnType<
    typeof createDemoVideoAgentController
>;

/**
 * ipcMain.handle 的函数签名 —— 单独抽出来便于测试时注入假实现。
 *
 * 用泛型签名兼容各 channel 不同 input/output,跟 electron 真实
 * ipcMain.handle 行为一致。
 */
type IpcMainHandleFn = <TInput, TOutput>(
    channel: string,
    listener: (
        event: IpcMainInvokeEvent,
        input: TInput
    ) => Promise<TOutput> | TOutput
) => void;

/**
 * 把 controller 绑到 ipcMain,替换 commit 0c 的 stub。
 *
 * 每个 invoke 拿自己的 IpcMainInvokeEvent,闭包构造 per-sender emit,
 * 保证多窗口 / 重连不串号。
 *
 * 入参只暴露 .handle 函数,不依赖整个 ipcMain 对象,便于测试时注入假实现。
 */
export const registerVideoAgentIpc = ({
    controller,
    handle
}: {
    controller: VideoAgentController;
    handle: IpcMainHandleFn;
}): void => {
    // per-invoke emit:per-sender 隔离推事件给叫起 invoke 的那个 renderer。
    // 调用者负责传完整 AgentRunEvent(含 runId/seq/timestamp),
    // 这里只负责 sender.send 的转发。
    const makeEmitForEvent = (
        _event: IpcMainInvokeEvent
    ): ((evt: AgentRunEvent) => void) => {
        const sender = _event.sender;
        return (evt) => {
            if (!sender.isDestroyed()) sender.send(IPC.VIDEO_AGENT_EVENT, evt);
        };
    };

    handle(IPC.VIDEO_AGENT_START, (event, input: VideoCreationInput) => {
        const emit = makeEmitForEvent(event);

        // fire-and-forget:不 await,renderer 不靠 invoke 返回值判断状态,
        // 完全靠 video-agent:event 流(run.started / run.completed / run.failed)。
        // 内部 controller.start 已经 emit run.started 触发流水线。
        void controller.start(input, emit).catch(() => {
            // controller 内部 catch 已经 emit run.failed,这里吞异常不重复
        });

        return { status: 'started' };
    });

    handle(
        IPC.VIDEO_AGENT_APPROVE,
        (event, input: { runId: string; approved: boolean }) => {
            const emit = makeEmitForEvent(event);
            const ok = controller.approve(input.runId, input.approved);
            if (ok) {
                // approve 成功 → emit interrupt.resumed 通知 renderer 流水线继续
                emit({
                    type: 'interrupt.resumed',
                    interruptType: 'scene_approval',
                    runId: input.runId,
                    seq: 0,
                    timestamp: Date.now()
                });
            }
            return { accepted: ok };
        }
    );

    handle(IPC.VIDEO_AGENT_CANCEL, (_event, input: { runId: string }) => {
        const cancelled = controller.cancel(input.runId);
        return { cancelled };
    });

    handle(
        IPC.VIDEO_AGENT_REGENERATE_SCENE,
        async (
            event,
            input: { runId: string; sceneId: string; feedback?: string }
        ) => {
            const emit = makeEmitForEvent(event);
            const result = await controller.regenerateScene(
                input.runId,
                input.sceneId,
                input.feedback,
                emit
            );
            return result;
        }
    );

    handle(
        IPC.VIDEO_AGENT_REGENERATE_VOICES,
        async (event, input: { runId: string }) => {
            const emit = makeEmitForEvent(event);
            const result = await controller.regenerateVoices(input.runId, emit);
            return result;
        }
    );

    handle(
        IPC.VIDEO_AGENT_REQUEST_FULL_STATE,
        (_event, input: { runId: string }) =>
            controller.requestFullState(input.runId)
    );
};
