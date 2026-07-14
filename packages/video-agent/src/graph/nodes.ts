/**
 * LangGraph 节点工厂 ——  项目规范模式。
 *
 * 工厂入口:`createVideoCreationNodes({ emit, tools })` 返回 10 个 node
 * 工厂函数对象,每个 node 用 `createInstrumentedNode` 高阶函数包装:
 *   - 自动 emit node.started / node.completed / node.failed
 *   - 自动 serializeError
 *   - 业务逻辑放 run() 里
 *
 * 用法(在 create-video-creation-graph.ts):
 *   const nodes = createVideoCreationNodes({ emit, tools });
 *   new StateGraph(VideoCreationStateAnnotation)
 *       .addNode('scan_assets', nodes.scanAssets)
 *       ...
 *
 * 异常处理:node 抛错 → emit node.failed → 向上抛 → LangGraph
 * 自动转成 GraphInterrupt,runner 端 catch 后 emit run.failed。
 */

import { readdir } from 'node:fs/promises';
import { extname, join } from 'node:path';

import { interrupt } from '@langchain/langgraph';
import type { VideoProject } from '@miaoma-magicut/video-project';
import { VideoProjectSchema } from '@miaoma-magicut/video-project';

import type { AgentRunEventEmitter } from '../events/event-emitter.ts';
import { serializeError } from '../events/event-emitter.ts';
import {
    ASSET_MATCHER_SYSTEM_PROMPT,
    ASSET_MATCHER_USER_PROMPT_TEMPLATE
} from '../prompts/asset-matcher.ts';
import {
    CREATIVE_BRIEF_SYSTEM_PROMPT,
    CREATIVE_BRIEF_USER_PROMPT_TEMPLATE
} from '../prompts/creative-brief.ts';
import {
    SCENE_PLANNER_SYSTEM_PROMPT,
    SCENE_PLANNER_USER_PROMPT_TEMPLATE
} from '../prompts/scene-planner.ts';
import { extractJsonFromLlmResponse } from '../providers/llm-json.ts';
import type { ModelProvider } from '../providers/model-provider.ts';
import type { VideoAgentTools } from '../tools/video-agent-tools.ts';
import type {
    AssetMatcherPayload,
    CreativeBriefPayload,
    SceneApprovalRequest,
    SceneApprovalResume,
    ScenePlannerPayload
} from './node-payloads.ts';
import type { VideoCreationGraphState, VideoCreationInput } from './state.ts';
import {
    analyzeAssets,
    type AnalyzeAssetsInput
} from './steps/analyze-assets.ts';

type GraphNodeUpdate = Partial<VideoCreationGraphState>;

// ---------------------------------------------------------------------------
// 高阶函数:createInstrumentedNode —— 每个 node 入口包装 emit 逻辑
// ---------------------------------------------------------------------------

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
        const start = Date.now();
        emit({
            nodeName,
            runId: state.input?.runId ?? 'unknown',
            type: 'node.started'
        });

        try {
            const update = await run(state);
            emit({
                durationMs: Date.now() - start,
                nodeName,
                runId: state.input?.runId ?? 'unknown',
                type: 'node.completed'
            });
            return update;
        } catch (error) {
            // GraphInterrupt 是 LangGraph 协议信号(interrupt 抛的),不是
            // 业务错误 —— 不 emit node.failed,直接向上抛
            if (
                error &&
                typeof error === 'object' &&
                'name' in error &&
                (error as { name: string }).name === 'GraphInterrupt'
            ) {
                throw error;
            }
            emit({
                error: serializeError(error),
                nodeName,
                runId: state.input?.runId ?? 'unknown',
                type: 'node.failed'
            });
            throw error;
        }
    };

// ---------------------------------------------------------------------------
// 状态 guard:从 state 拿必填字段,缺则抛错
// ---------------------------------------------------------------------------

const requireInput = (state: VideoCreationGraphState): VideoCreationInput => {
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

const requireProject = (state: VideoCreationGraphState): VideoProject => {
    if (!state.project) {
        throw new Error('Video project is required');
    }
    return state.project;
};

// ---------------------------------------------------------------------------
// 节点业务逻辑(每个函数是 1 个 node 的内部 run(),不直接 emit)
// ---------------------------------------------------------------------------

const VIDEO_EXTENSIONS = new Set(['.mp4', '.mov', '.mkv', '.webm', '.avi']);

const isVideoFile = (filename: string): boolean =>
    VIDEO_EXTENSIONS.has(extname(filename).toLowerCase());

const scanAssetsRun = async (
    state: VideoCreationGraphState
): Promise<GraphNodeUpdate> => {
    const input = requireInput(state);
    const entries = await readdir(input.sourceAssetDirectory, {
        withFileTypes: true
    });
    const videoFiles = entries
        .filter((e) => e.isFile() && isVideoFile(e.name))
        .map((e) => e.name)
        .sort();
    const skeleton = videoFiles.map((name, idx) => ({
        assetId: `${input.runId}-asset-${idx + 1}`,
        description: '',
        durationMs: 0,
        filePath: join(input.sourceAssetDirectory, name),
        fps: 0,
        frames: [],
        height: 0,
        width: 0
    }));
    return { assets: skeleton };
};

const buildFallbackScenes = (
    runId: string,
    brief: string
): VideoCreationGraphState['scenes'] => {
    const templates = [
        { narration: `${brief} —— 开场`, visual: '全景镜头,展示主题' },
        { narration: `${brief} —— 主体`, visual: '中景,主体内容' },
        { narration: `${brief} —— 结尾`, visual: '特写,总结升华' }
    ];
    return templates.map((t, i) => ({
        endMs: (i + 1) * 5000,
        narration: t.narration,
        order: i,
        sceneId: `${runId}-s-${i + 1}`,
        startMs: i * 5000,
        subtitleLines: [
            {
                endMs: (i + 1) * 5000,
                startMs: i * 5000,
                text: t.narration.slice(0, 25)
            }
        ],
        visualBrief: t.visual
    }));
};

// ---------------------------------------------------------------------------
// 公共 fallback / model access
// ---------------------------------------------------------------------------

/**
 * modelProvider 注入点(测试可塞 stub)。
 */
let modelProviderRef: ModelProvider | null = null;

export const setModelProvider = (provider: ModelProvider): void => {
    modelProviderRef = provider;
};

const getModel = (): ModelProvider => {
    if (!modelProviderRef) {
        throw new Error('ModelProvider not set; call setModelProvider() first');
    }
    return modelProviderRef;
};

// ---------------------------------------------------------------------------
// createVideoCreationNodes —— 工厂入口( 项目规范)
// ---------------------------------------------------------------------------

export const createVideoCreationNodes = ({
    emit,
    tools
}: {
    emit: AgentRunEventEmitter;
    tools: VideoAgentTools;
}) => {
    // 公共 emit 函数被 createInstrumentedNode 引用
    const instrumented = (
        nodeName: string,
        run: (state: VideoCreationGraphState) => Promise<GraphNodeUpdate>
    ) => createInstrumentedNode({ emit, nodeName, run });

    return {
        scanAssets: instrumented('scan_assets', scanAssetsRun),

        analyzeAssets: instrumented('analyze_assets', async (state) => {
            requireInput(state);
            const analyzeInput: AnalyzeAssetsInput = {
                assets: state.assets.map((a) => ({
                    assetId: a.assetId,
                    filePath: a.filePath
                })),
                ffmpegPath: '',
                ffprobePath: '',
                frameOutputDirectory: '',
                modelProvider: getModel(),
                tools
            };
            const enriched = await analyzeAssets(analyzeInput);
            return { assets: enriched };
        }),

        creativeBrief: instrumented('creative_brief', async (state) => {
            const input = requireInput(state);
            const userPrompt = CREATIVE_BRIEF_USER_PROMPT_TEMPLATE.replace(
                '{brief}',
                state.input?.brief ?? ''
            ).replace('{assetsJson}', JSON.stringify(state.assets, null, 2));
            try {
                const result = await getModel().generateText({
                    system: CREATIVE_BRIEF_SYSTEM_PROMPT,
                    user: userPrompt
                });
                const json = extractJsonFromLlmResponse(
                    result.text
                ) as CreativeBriefPayload;
                return {
                    brief: {
                        audience: json.audience,
                        keyMessages: json.keyMessages,
                        summary: json.summary,
                        title: json.title,
                        tone: json.tone
                    }
                };
            } catch (error) {
                // 降级
                // eslint-disable-next-line no-console
                console.warn(
                    `[creative_brief] LLM failed, using fallback: ${(error as Error).message}`
                );
                return {
                    brief: {
                        audience: '短视频用户',
                        keyMessages: [input.brief.slice(0, 20)],
                        summary: input.brief,
                        title: input.brief.slice(0, 20),
                        tone: '友好亲切'
                    }
                };
            }
        }),

        planScenes: instrumented('plan_scenes', async (state) => {
            const userPrompt = SCENE_PLANNER_USER_PROMPT_TEMPLATE.replace(
                '{briefJson}',
                JSON.stringify(state.brief, null, 2)
            ).replace('{assetsJson}', JSON.stringify(state.assets, null, 2));
            try {
                const result = await getModel().generateText({
                    system: SCENE_PLANNER_SYSTEM_PROMPT,
                    user: userPrompt
                });
                const json = extractJsonFromLlmResponse(
                    result.text
                ) as ScenePlannerPayload;
                return {
                    scenes: json.scenes.map((s, idx) => ({
                        endMs: s.endMs,
                        narration: s.narration,
                        order: s.order ?? idx,
                        sceneId: s.sceneId,
                        startMs: s.startMs,
                        subtitleLines: s.subtitleLines,
                        visualBrief: s.visualBrief
                    }))
                };
            } catch (error) {
                // eslint-disable-next-line no-console
                console.warn(
                    `[plan_scenes] LLM failed, using fallback: ${(error as Error).message}`
                );
                return {
                    scenes: buildFallbackScenes(
                        state.input?.runId ?? 'r-unknown',
                        state.input?.brief ?? '主题'
                    )
                };
            }
        }),

        sceneApproval: instrumented('scene_approval', async (state) => {
            const request: SceneApprovalRequest = {
                payload: {
                    brief: state.brief
                        ? {
                              audience: state.brief.audience,
                              keyMessages: state.brief.keyMessages,
                              summary: state.brief.summary,
                              title: state.brief.title,
                              tone: state.brief.tone
                          }
                        : undefined,
                    scenes: state.scenes.map((s) => ({
                        endMs: s.endMs,
                        narration: s.narration,
                        sceneId: s.sceneId,
                        startMs: s.startMs,
                        visualBrief: s.visualBrief
                    }))
                },
                type: 'scene-plan'
            };

            // LangGraph interrupt():抛 GraphInterrupt(runner 走 waiting_for_approval
            // 并 emit approval.required 事件)
            const resume = interrupt<SceneApprovalRequest, SceneApprovalResume>(
                request
            );

            if (!resume.approved) {
                throw new Error('Scene plan rejected by user');
            }
            return {};
        }),

        matchAssets: instrumented('match_assets', async (state) => {
            const userPrompt = ASSET_MATCHER_USER_PROMPT_TEMPLATE.replace(
                '{scenesJson}',
                JSON.stringify(state.scenes, null, 2)
            ).replace('{assetsJson}', JSON.stringify(state.assets, null, 2));
            try {
                const result = await getModel().generateText({
                    system: ASSET_MATCHER_SYSTEM_PROMPT,
                    user: userPrompt
                });
                const json = extractJsonFromLlmResponse(
                    result.text
                ) as AssetMatcherPayload;
                return {
                    matches: json.matches.map((m) => ({
                        matchedAssetId: m.matchedAssetId,
                        ranking: m.ranking,
                        sceneId: m.sceneId,
                        score: m.score
                    }))
                };
            } catch (error) {
                // eslint-disable-next-line no-console
                console.warn(
                    `[match_assets] LLM failed, using fallback: ${(error as Error).message}`
                );
                return {
                    matches: state.scenes.map((scene, idx) => ({
                        matchedAssetId:
                            state.assets[idx % Math.max(state.assets.length, 1)]
                                ?.assetId ?? `${state.input?.runId}-asset-1`,
                        ranking: idx,
                        sceneId: scene.sceneId,
                        score: 0.5
                    }))
                };
            }
        }),

        synthesizeVoice: instrumented('synthesize_voice', async (state) => {
            const runId = state.input?.runId ?? 'r-unknown';
            const voiceId = state.input?.selectedVoiceType ?? 'default-female';
            const voiceOutputDir = join(
                process.env['HOME'] ?? '/tmp',
                '.miaoma-voices',
                runId
            );
            const voices = [];
            for (let i = 0; i < state.scenes.length; i += 1) {
                const scene = state.scenes[i]!;
                const audioFilePath = join(
                    voiceOutputDir,
                    `${runId}-${scene.sceneId}.mp3`
                );
                try {
                    await tools.writeMp3({
                        audioFilePath,
                        narration: scene.narration,
                        voiceId
                    });
                    voices.push({
                        audioFilePath,
                        durationMs: scene.endMs - scene.startMs,
                        sceneId: scene.sceneId,
                        voiceId
                    });
                } catch (error) {
                    // eslint-disable-next-line no-console
                    console.warn(
                        `[synthesize_voice] TTS failed for ${scene.sceneId}: ${(error as Error).message}`
                    );
                }
            }
            return { voices };
        }),

        assembleTimeline: instrumented('assemble_timeline', async (state) => {
            const input = requireInput(state);
            const brief = requireBrief(state);
            const now = new Date().toISOString();
            const projectId = `proj-${input.runId}`;
            const totalDurationMs = state.scenes.reduce(
                (acc, s) => Math.max(acc, s.endMs),
                0
            );
            const project: VideoProject = {
                agentConversation: [],
                assets: {
                    music: [],
                    videos: state.assets.map((a) => ({
                        assetId: a.assetId,
                        durationMs: a.durationMs,
                        filePath: a.filePath,
                        kind: 'video'
                    })),
                    voices: state.voices.map((v) => ({
                        assetId: v.sceneId,
                        durationMs: v.durationMs,
                        filePath: v.audioFilePath,
                        kind: 'voice'
                    }))
                },
                canvas: {
                    durationMs: totalDurationMs,
                    fps: 30,
                    height: 1080,
                    safeArea: {
                        bottomPx: 0,
                        leftPx: 0,
                        rightPx: 0,
                        topPx: 0
                    },
                    width: 1920
                },
                metadata: {
                    createdAt: now,
                    projectId,
                    title: brief.title,
                    updatedAt: now
                },
                renderConfig: { format: 'mp4', quality: 'preview' },
                schemaVersion: '1.0.0',
                tracks: [
                    {
                        clips: state.scenes.map((s) => {
                            const match = state.matches.find(
                                (m) => m.sceneId === s.sceneId
                            );
                            const asset = state.assets.find(
                                (a) => a.assetId === match?.matchedAssetId
                            );
                            return {
                                assetId:
                                    asset?.assetId ??
                                    state.assets[0]?.assetId ??
                                    '',
                                endMs: s.endMs,
                                kind: 'video' as const,
                                playbackRate: 1,
                                startMs: s.startMs
                            };
                        }),
                        kind: 'video',
                        trackId: 'video-track'
                    },
                    {
                        clips: state.voices.map((v) => ({
                            assetId: v.sceneId,
                            endMs: v.durationMs,
                            gainDb: 0,
                            kind: 'voice' as const,
                            startMs: 0
                        })),
                        kind: 'voice',
                        trackId: 'voice-track'
                    }
                ]
            };
            return { project };
        }),

        validateProject: instrumented('validate_project', async (state) => {
            VideoProjectSchema.parse(requireProject(state));
            return {};
        }),

        saveProject: instrumented('save_project', async (state) => {
            const project = requireProject(state);
            const outputDir =
                process.env['MIAOMA_PROJECT_OUTPUT_DIR'] ??
                join(process.env['HOME'] ?? '/tmp', '.miaoma-projects');
            const saved = await tools.writeProject({
                outputDir,
                projectId: project.metadata.projectId,
                projectJson: project
            });
            return { savedProjectPath: saved };
        })
    };
};
