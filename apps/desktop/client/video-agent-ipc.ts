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
    /** per-run 递增事件 seq */
    seq: number;
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

/**
 * 创建 demo controller —— plan §16.3 阶段 B + §17.2 commit 5 主体。
 *
 * commit 18:demo 模式真接 LangGraph runner,扫真实素材目录 + 跑 10 节点
 * pipeline,scene_approval interrupt 走 Command({ resume }) 真接 resume。
 */
export const createDemoVideoAgentController = (options: {
    outputBaseDir: string;
    projectStore?: never;
}) => {
    const runs = new Map<string, RunState>();
    const outputBaseDir = options.outputBaseDir;

    // 单 emitter:内部自动注入 runId/seq/timestamp,调用者只填事件特有字段
    const makeEmitter =
        (runId: string, base: DesktopEventEmitter) =>
        // 用 Record 包事件主体,这样 discriminated union 的窄类型自动继承
        (event: Record<string, unknown>): void => {
            const st = runs.get(runId);
            const seq = st ? ++st.seq : 0;
            const evt = {
                ...event,
                runId,
                seq,
                timestamp: Date.now()
            } as unknown as AgentRunEvent;
            base(evt);
        };

    /**
     * 主入口 —— commit 18:走 createVideoCreationGraph 真跑 10 节点。
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
            seq: 0,
            workDir
        };
        runs.set(input.runId, state);

        const emitEvt = makeEmitter(input.runId, emit);

        try {
            emitEvt({ type: 'run.started', input });

            // commit 19/20.2:真接 LLM / TTS —— 双重 key 名兼容(老
            // ARK_API_KEY / 新 API_KEY)。两者任一存在即走真路径。
            const {
                createVideoCreationGraph,
                createSequencedEventEmitter,
                setModelProvider
            } = await import('@miaoma-magicut/video-agent');

            const llmApiKey =
                process.env['ARK_API_KEY'] ?? process.env['API_KEY'];
            if (llmApiKey) {
                const { MinimaxM3ModelProvider } = await import(
                    '@miaoma-magicut/video-agent'
                );
                setModelProvider(
                    new MinimaxM3ModelProvider({ apiKey: llmApiKey })
                );
            } else {
                // 没配 key,跑 stub —— 节点各自 fallback 路径
                setModelProvider({
                    describeFrames: async () => {
                        throw new Error('demo mode: no LLM');
                    },
                    generateText: async () => {
                        throw new Error('demo mode: no LLM');
                    }
                } as never);
            }

            // commit 20.3:env 有 VOLCENGINE_TTS_APP_ID / 新名
            // VOLCENGINE_TTS_API_KEY 时 writeMp3 走真 TTS 路径,否则 stub。
            // 真 TTS 没有字级时间戳返回值,用 estimateWordTimestamps 估算(原
            // synthesize_voice 节点 fallback 也是这条)。
            const ttsApiKey =
                process.env['VOLCENGINE_TTS_APP_ID'] ??
                process.env['VOLCENGINE_TTS_API_KEY'];
            const defaultVoiceId =
                process.env['TTS_DEFAULT_VOICE_ID'] ?? 'zh_female_v1';
            const { mkdir, writeFile, copyFile } = await import(
                'node:fs/promises'
            );
            const desktopTools = {
                readImageAsBase64DataUrl: async () => {
                    throw new Error('demo: readImageAsBase64DataUrl not impl');
                },
                writeMp3: ttsApiKey
                    ? async (input: {
                          audioFilePath: string;
                          narration: string;
                          voiceId: string;
                      }) => {
                          const { estimateWordTimestamps } = await import(
                              '@miaoma-magicut/video-agent'
                          );
                          const { getCachedOrNull, writeTtsCache } =
                              await import('./tts-cache.ts');
                          const { VolcengineTtsProvider } = await import(
                              '../scripts/api-probe/providers/volcengine-tts-provider.ts'
                          );

                          // 1. 缓存命中 → 直接拷到目标 path
                          const cached = await getCachedOrNull(
                              input.narration,
                              input.voiceId
                          );
                          if (cached) {
                              await mkdir(
                                  input.audioFilePath
                                      .split('/')
                                      .slice(0, -1)
                                      .join('/'),
                                  { recursive: true }
                              );
                              await copyFile(
                                  cached.audioFilePath,
                                  input.audioFilePath
                              );
                              return { wordTimestamps: cached.wordTimestamps };
                          }

                          // 2. miss → 调真 TTS,落缓存 + 拷到目标 path
                          await mkdir(
                              input.audioFilePath
                                  .split('/')
                                  .slice(0, -1)
                                  .join('/'),
                              { recursive: true }
                          );
                          const provider = new VolcengineTtsProvider({
                              apiKey: ttsApiKey
                          });
                          await provider.synthesizeSpeech({
                              outputPath: input.audioFilePath,
                              text: input.narration,
                              voice: input.voiceId
                          });
                          const { readFile } = await import('node:fs/promises');
                          const audioBytes = await readFile(
                              input.audioFilePath
                          );
                          const durationMs = 4000; // 与 scene 默认 3-5s 对齐
                          const wordTimestamps = estimateWordTimestamps(
                              input.narration,
                              durationMs
                          );
                          await writeTtsCache({
                              audioBytes,
                              durationMs,
                              narration: input.narration,
                              voiceId: input.voiceId,
                              wordTimestamps
                          });
                          return { wordTimestamps };
                      }
                    : async () => {
                          throw new Error('demo: writeMp3 not impl');
                      },
                writeProject: async (input: {
                    outputDir: string;
                    projectId: string;
                    projectJson: unknown;
                }) => {
                    await mkdir(input.outputDir, { recursive: true });
                    const filePath = join(
                        input.outputDir,
                        `${input.projectId}.json`
                    );
                    await writeFile(
                        filePath,
                        JSON.stringify(input.projectJson, null, 2),
                        'utf-8'
                    );
                    return filePath;
                }
            };

            // 让 save_project 节点走 demo controller 自己的 outputBaseDir
            // (覆盖节点默认的 ~/.miaoma-projects,electron 启动时再覆盖)
            process.env['MIAOMA_PROJECT_OUTPUT_DIR'] = outputBaseDir;

            const sequencedEmit = createSequencedEventEmitter({
                runId: input.runId,
                sink: (evt) => emitEvt(evt as never)
            });

            const runner = createVideoCreationGraph({
                emit: (evt) => sequencedEmit(evt as never),
                tools: desktopTools as never
            });

            // commit 20.4:用户没指定 voice 时,塞 env 默认 voice id(避免
            // synthesize_voice 节点 fallback 'default-female' 在火山方舟 API
            // 返回 'resource ID is mismatched with speaker related resource')。
            const inputWithVoice = {
                ...input,
                voiceConfig: input.voiceConfig ?? {
                    provider: 'volcengine-seed-tts',
                    voiceId: defaultVoiceId
                },
                selectedVoiceType: defaultVoiceId
            } as typeof input;

            // 真跑 runner —— scan / analyze / brief / plan / scene_approval
            const firstResult = await runner.start(inputWithVoice);

            if (firstResult.status === 'failed') {
                emitEvt({
                    error: firstResult.errors.join('; '),
                    type: 'run.failed'
                });
                return { status: 'failed' };
            }

            if (firstResult.status === 'waiting_for_approval') {
                // emit interrupt 事件(让 UI 弹窗)
                emitEvt({
                    type: 'interrupt',
                    interruptType: 'scene_approval',
                    payload: firstResult.approval ?? {}
                });

                // 等 renderer 调 approve 或 cancel 调用把 approvalReject 唤醒
                const outcome = await new Promise<'cancelled' | 'approved'>(
                    (resolve) => {
                        state.approvalResolve = (ok) =>
                            resolve(ok ? 'approved' : 'cancelled');
                        state.approvalReject = () => resolve('cancelled');
                    }
                );

                if (outcome === 'cancelled') {
                    emitEvt({ type: 'run.cancelled' });
                    return { status: 'cancelled' };
                }

                emitEvt({
                    type: 'node.completed',
                    nodeName: 'scene_approval',
                    durationMs: 0
                });

                // 真 resume graph —— 让后续 match / voice / assemble / save 节点真跑
                const resumed = await runner.resume({
                    approval: { approved: true },
                    runId: input.runId
                });

                if (resumed.status === 'failed') {
                    emitEvt({
                        error: resumed.errors.join('; '),
                        type: 'run.failed'
                    });
                    return { status: 'failed' };
                }

                state.projectPath = resumed.savedProjectPath;
                emitEvt({
                    durationMs: Date.now() - startedAt,
                    projectPath: resumed.savedProjectPath,
                    type: 'run.completed'
                });
                return {
                    projectPath: resumed.savedProjectPath,
                    status: 'completed'
                };
            }

            // completed 状态(罕见,fallback 全通过)
            state.projectPath = firstResult.savedProjectPath;
            emitEvt({
                durationMs: Date.now() - startedAt,
                projectPath: firstResult.savedProjectPath,
                type: 'run.completed'
            });
            return {
                projectPath: firstResult.savedProjectPath,
                status: 'completed'
            };
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
            await rm(workDir, { recursive: true, force: true }).catch(() => {});
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

/**
 * LangGraph 视频创作 controller —— commit 11 stub。
 *
 * commit 10 graph 重构后,start/resume 走 VideoCreationGraphRunner 接口,
 * 旧实现 (createMemoryCheckpointer / graph.invoke / graph.builder) 已
 * 全部移除。langgraph 模式 controller 留空壳,start 抛 not implemented,
 * commit 11+ 会基于新 runner 接口重写完整实现。
 *
 * 当前 desktop 端用 demo 模式走通基本流程;langgraph 模式后续接入。
 */
export const createLangGraphVideoAgentController = (_options: {
    outputBaseDir: string;
    projectStore?: never;
    modelProvider?: never;
    ffmpegPath?: string;
    ffprobePath?: string;
}): {
    approve: (runId: string, approved: boolean) => boolean;
    cancel: (runId: string) => boolean;
    regenerateScene: (
        runId: string,
        sceneId: string,
        feedback: string | undefined,
        emit: DesktopEventEmitter
    ) => Promise<{ status: 'completed' }>;
    regenerateVoices: (
        runId: string,
        emit: DesktopEventEmitter
    ) => Promise<{
        status: 'completed';
    }>;
    requestFullState: (runId: string) => {
        runId: string;
        status: 'running' | 'cancelled' | 'completed' | 'not_found';
    };
    start: (
        input: VideoCreationInput,
        emit: DesktopEventEmitter
    ) => Promise<{
        status: 'completed' | 'cancelled' | 'failed';
        projectPath?: string;
    }>;
} => {
    return {
        approve: () => false,
        cancel: () => false,
        regenerateScene: async () => {
            throw new Error(
                'regenerateScene not implemented in langgraph mode'
            );
        },
        regenerateVoices: async () => {
            throw new Error(
                'regenerateVoices not implemented in langgraph mode'
            );
        },
        requestFullState: (runId) => ({ runId, status: 'not_found' }),
        start: async () => {
            throw new Error(
                'langgraph 模式 controller 留待 commit 11 重写,先跑 demo 模式'
            );
        }
    };
};
