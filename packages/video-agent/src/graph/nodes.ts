/**
 * LangGraph 节点工厂 —— commit 6.5 阶段,补完 8 个剩余节点。
 *
 * 总拓扑(plan §3):
 *   START
 *     → scan_assets → analyze_assets
 *     → creative_brief → plan_scenes
 *     → scene_approval(interrupt)
 *     → match_assets → synthesize_voice
 *     → assemble_timeline → validate_project → save_project
 *     → END
 *
 * 异常处理:每个 node 内 emit node.started / node.completed / node.failed,
 * node 抛错让 LangGraph 自动 GraphInterrupt 向上抛,controller 端 catch
 * 后 emit run.failed。
 */

import { readdir } from 'node:fs/promises';
import { extname, join } from 'node:path';

import { interrupt } from '@langchain/langgraph';
import {
    type AssetAnalysis,
    type AssetMatchResult,
    type CreativeBrief,
    type Scene,
    type VideoProject,
    type VoiceSynthesisResult
} from '@miaoma-magicut/video-project';

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
import type {
    AssetMatcherPayload,
    CreativeBriefPayload,
    SceneApprovalRequest,
    SceneApprovalResume,
    ScenePlannerPayload
} from './node-payloads.ts';
import type { NodeRuntime } from './node-runtime.ts';
import type { VideoCreationStateType } from './state.ts';
import {
    analyzeAssets,
    type AnalyzeAssetsInput
} from './steps/analyze-assets.ts';

// ---------------------------------------------------------------------------
// scan_assets + analyze_assets(commit 6 已有,这里再 export 让 graph.ts 复用)
// ---------------------------------------------------------------------------

const VIDEO_EXTENSIONS = new Set(['.mp4', '.mov', '.mkv', '.webm', '.avi']);

const isVideoFile = (filename: string): boolean =>
    VIDEO_EXTENSIONS.has(extname(filename).toLowerCase());

export const scanAssetsNode = async (
    state: VideoCreationStateType,
    runtime: NodeRuntime
): Promise<Partial<VideoCreationStateType>> => {
    runtime.emit({
        type: 'node.started',
        nodeName: 'scan_assets',
        nodeLabel: '扫描素材'
    });

    const start = Date.now();
    const directory = state.input.sourceAssetDirectory;

    const entries = await readdir(directory, { withFileTypes: true });
    const videoFiles = entries
        .filter((e) => e.isFile() && isVideoFile(e.name))
        .map((e) => e.name)
        .sort();

    const skeleton: AssetAnalysis[] = videoFiles.map((name, idx) => ({
        assetId: `${state.input.runId}-asset-${idx + 1}`,
        description: '',
        durationMs: 0,
        filePath: join(directory, name),
        fps: 0,
        frames: [],
        height: 0,
        width: 0
    }));

    runtime.emit({
        durationMs: Date.now() - start,
        nodeName: 'scan_assets',
        type: 'node.completed'
    });

    return { assets: skeleton };
};

export const analyzeAssetsNode = async (
    state: VideoCreationStateType,
    runtime: NodeRuntime
): Promise<Partial<VideoCreationStateType>> => {
    runtime.emit({
        type: 'node.started',
        nodeName: 'analyze_assets',
        nodeLabel: 'AI 理解画面'
    });

    const start = Date.now();

    const input: AnalyzeAssetsInput = {
        assets: state.assets.map((a) => ({
            assetId: a.assetId,
            filePath: a.filePath
        })),
        ffmpegPath: runtime.ffmpegPath,
        ffprobePath: runtime.ffprobePath,
        frameOutputDirectory: runtime.frameOutputDirectory,
        modelProvider: runtime.modelProvider,
        tools: runtime.tools
    };

    try {
        const enriched = await analyzeAssets(input);

        runtime.emit({
            durationMs: Date.now() - start,
            nodeName: 'analyze_assets',
            type: 'node.completed'
        });

        return { assets: enriched };
    } catch (error) {
        runtime.emit({
            error: (error as Error).message,
            nodeName: 'analyze_assets',
            type: 'node.failed'
        });
        throw error;
    }
};

// ---------------------------------------------------------------------------
// commit 6.5:creative_brief / plan_scenes / scene_approval / match_assets /
// synthesize_voice / assemble_timeline / validate_project / save_project
// ---------------------------------------------------------------------------

/**
 * creative_brief —— 调 M3 generateText,产出 CreativeBrief。
 * 失败时降级返回基础 brief(title=brief 前 20 字,summary=brief)。
 */
export const creativeBriefNode = async (
    state: VideoCreationStateType,
    runtime: NodeRuntime
): Promise<Partial<VideoCreationStateType>> => {
    runtime.emit({
        type: 'node.started',
        nodeName: 'creative_brief',
        nodeLabel: '生成创意简报'
    });

    const start = Date.now();

    const userPrompt = CREATIVE_BRIEF_USER_PROMPT_TEMPLATE.replace(
        '{brief}',
        state.input.brief
    ).replace('{assetsJson}', JSON.stringify(state.assets, null, 2));

    let brief: CreativeBrief;
    try {
        const result = await runtime.modelProvider.generateText({
            system: CREATIVE_BRIEF_SYSTEM_PROMPT,
            user: userPrompt
        });
        const json = extractJsonFromLlmResponse(
            result.text
        ) as CreativeBriefPayload;
        brief = {
            audience: json.audience,
            keyMessages: json.keyMessages,
            summary: json.summary,
            title: json.title,
            tone: json.tone
        };
    } catch (error) {
        // 降级路径:LLM 不可用时用基础 brief
        brief = {
            audience: '短视频用户',
            keyMessages: [state.input.brief.slice(0, 20)],
            summary: state.input.brief,
            title: state.input.brief.slice(0, 20),
            tone: '友好亲切'
        };
        // eslint-disable-next-line no-console
        console.warn(
            `[creative_brief] LLM failed, using fallback: ${(error as Error).message}`
        );
    }

    runtime.emit({
        durationMs: Date.now() - start,
        nodeName: 'creative_brief',
        type: 'node.completed'
    });

    return { brief };
};

/**
 * plan_scenes —— 调 M3 generateText,产出 Scene[]。
 * 失败时降级:用 3 个占位 scene。
 */
export const planScenesNode = async (
    state: VideoCreationStateType,
    runtime: NodeRuntime
): Promise<Partial<VideoCreationStateType>> => {
    runtime.emit({
        type: 'node.started',
        nodeName: 'plan_scenes',
        nodeLabel: '拆分镜'
    });

    const start = Date.now();

    const userPrompt = SCENE_PLANNER_USER_PROMPT_TEMPLATE.replace(
        '{briefJson}',
        JSON.stringify(state.brief, null, 2)
    ).replace('{assetsJson}', JSON.stringify(state.assets, null, 2));

    let scenes: Scene[];
    try {
        const result = await runtime.modelProvider.generateText({
            system: SCENE_PLANNER_SYSTEM_PROMPT,
            user: userPrompt
        });
        const json = extractJsonFromLlmResponse(
            result.text
        ) as ScenePlannerPayload;
        scenes = json.scenes.map((s, idx) => ({
            endMs: s.endMs,
            narration: s.narration,
            order: s.order ?? idx,
            sceneId: s.sceneId,
            startMs: s.startMs,
            subtitleLines: s.subtitleLines,
            visualBrief: s.visualBrief
        }));
    } catch (error) {
        scenes = buildFallbackScenes(state.input.runId, state.input.brief);
        // eslint-disable-next-line no-console
        console.warn(
            `[plan_scenes] LLM failed, using fallback: ${(error as Error).message}`
        );
    }

    runtime.emit({
        durationMs: Date.now() - start,
        nodeName: 'plan_scenes',
        type: 'node.completed'
    });

    return { scenes };
};

const buildFallbackScenes = (runId: string, brief: string): Scene[] => {
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

/**
 * scene_approval —— 用 LangGraph interrupt() 抛 SceneApprovalRequest,
 * 等用户 approve/resume,返回 SceneApprovalResume。
 * 驳回时抛错让 controller 端 run.failed。
 */
export const sceneApprovalNode = async (
    state: VideoCreationStateType,
    runtime: NodeRuntime
): Promise<Partial<VideoCreationStateType>> => {
    runtime.emit({
        type: 'node.started',
        nodeName: 'scene_approval',
        nodeLabel: '等待用户审批分镜'
    });

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

    // emit interrupt 事件(让 renderer 端弹窗,详见 plan §5.2)
    runtime.emit({
        interruptType: 'scene_approval',
        payload: request,
        type: 'interrupt'
    });

    // LangGraph interrupt():抛 GraphInterrupt,等 Command({ resume }) 唤醒
    const resume = interrupt<SceneApprovalRequest, SceneApprovalResume>(
        request
    );

    runtime.emit({
        type: 'interrupt.resumed',
        interruptType: 'scene_approval'
    });

    if (!resume.approved) {
        // 驳回抛错,外层 catch 后 emit run.failed
        throw new Error('Scene plan rejected by user');
    }

    runtime.emit({
        durationMs: 0,
        nodeName: 'scene_approval',
        type: 'node.completed'
    });

    return {};
};

/**
 * match_assets —— 调 M3 generateText,产出 AssetMatchResult[]。
 * 失败时降级:每个 scene 选第一个 asset(按 order 顺序)。
 */
export const matchAssetsNode = async (
    state: VideoCreationStateType,
    runtime: NodeRuntime
): Promise<Partial<VideoCreationStateType>> => {
    runtime.emit({
        type: 'node.started',
        nodeName: 'match_assets',
        nodeLabel: '匹配素材'
    });

    const start = Date.now();

    const userPrompt = ASSET_MATCHER_USER_PROMPT_TEMPLATE.replace(
        '{scenesJson}',
        JSON.stringify(state.scenes, null, 2)
    ).replace('{assetsJson}', JSON.stringify(state.assets, null, 2));

    let matches: AssetMatchResult[];
    try {
        const result = await runtime.modelProvider.generateText({
            system: ASSET_MATCHER_SYSTEM_PROMPT,
            user: userPrompt
        });
        const json = extractJsonFromLlmResponse(
            result.text
        ) as AssetMatcherPayload;
        matches = json.matches.map((m) => ({
            matchedAssetId: m.matchedAssetId,
            ranking: m.ranking,
            sceneId: m.sceneId,
            score: m.score
        }));
    } catch (error) {
        // 降级:循环分配
        matches = state.scenes.map((scene, idx) => ({
            matchedAssetId:
                state.assets[idx % Math.max(state.assets.length, 1)]?.assetId ??
                `${state.input.runId}-asset-1`,
            ranking: idx,
            sceneId: scene.sceneId,
            score: 0.5
        }));
        // eslint-disable-next-line no-console
        console.warn(
            `[match_assets] LLM failed, using fallback: ${(error as Error).message}`
        );
    }

    runtime.emit({
        durationMs: Date.now() - start,
        nodeName: 'match_assets',
        type: 'node.completed'
    });

    return { matches };
};

/**
 * synthesize_voice —— 给每个 scene 调 TTS 合成旁白音频。
 * 降级路径:LLM 不可用或 TTS 不可用时,voices 数组为空(后续 assemble
 * 节点走"无 voice clip"分支)。
 */
export const synthesizeVoiceNode = async (
    state: VideoCreationStateType,
    runtime: NodeRuntime
): Promise<Partial<VideoCreationStateType>> => {
    runtime.emit({
        type: 'node.started',
        nodeName: 'synthesize_voice',
        nodeLabel: '合成配音'
    });

    const start = Date.now();

    const voices: VoiceSynthesisResult[] = [];

    for (let i = 0; i < state.scenes.length; i += 1) {
        const scene = state.scenes[i]!;
        const voiceId = state.input.selectedVoiceType ?? 'default-female';
        const audioFilePath = join(
            runtime.voiceOutputDirectory,
            `${state.input.runId}-${scene.sceneId}.mp3`
        );

        try {
            await runtime.tools.writeMp3({
                audioFilePath,
                narration: scene.narration,
                voiceId
            });
            const durationMs = scene.endMs - scene.startMs;
            voices.push({
                audioFilePath,
                durationMs,
                sceneId: scene.sceneId,
                voiceId
            });
            runtime.emit({
                current: i + 1,
                percent: Math.round(((i + 1) / state.scenes.length) * 100),
                total: state.scenes.length,
                type: 'voice.regeneration.progress'
            });
        } catch (error) {
            runtime.emit({
                error: (error as Error).message,
                nodeName: 'synthesize_voice',
                progress: 0,
                type: 'node.progress'
            });
        }
    }

    runtime.emit({
        durationMs: Date.now() - start,
        nodeName: 'synthesize_voice',
        type: 'node.completed'
    });

    return { voices };
};

/**
 * assemble_timeline —— 把 assets + scenes + matches + voices 拼成 VideoProject。
 * 纯函数,无 IO。
 */
export const assembleTimelineNode = async (
    state: VideoCreationStateType,
    runtime: NodeRuntime
): Promise<Partial<VideoCreationStateType>> => {
    runtime.emit({
        type: 'node.started',
        nodeName: 'assemble_timeline',
        nodeLabel: '组装时间线'
    });

    const start = Date.now();

    const now = new Date().toISOString();
    const projectId = `proj-${state.input.runId}`;
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
            durationMs: state.scenes.reduce(
                (acc, s) => Math.max(acc, s.endMs),
                0
            ),
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
            title: state.brief?.title ?? state.input.brief.slice(0, 20),
            updatedAt: now
        },
        renderConfig: { format: 'mp4', quality: 'preview' },
        schemaVersion: '1.0.0',
        tracks: [
            {
                clips: state.scenes.map((scene, idx) => {
                    const match = state.matches.find(
                        (m) => m.sceneId === scene.sceneId
                    );
                    const asset = state.assets.find(
                        (a) => a.assetId === match?.matchedAssetId
                    );
                    return {
                        assetId:
                            asset?.assetId ?? state.assets[idx]?.assetId ?? '',
                        endMs: scene.endMs,
                        kind: 'video' as const,
                        playbackRate: 1,
                        startMs: scene.startMs
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

    runtime.emit({
        durationMs: Date.now() - start,
        nodeName: 'assemble_timeline',
        type: 'node.completed'
    });

    return { project };
};

/**
 * validate_project —— 调 VideoProjectSchema.parse 校验。失败抛错让
 * LangGraph 走 fail 路径,controller emit run.failed。
 */
export const validateProjectNode = async (
    state: VideoCreationStateType,
    runtime: NodeRuntime
): Promise<Partial<VideoCreationStateType>> => {
    runtime.emit({
        type: 'node.started',
        nodeName: 'validate_project',
        nodeLabel: '校验项目'
    });

    const start = Date.now();

    if (!state.project) {
        throw new Error('validate_project called with undefined project');
    }

    // 校验由 schema 抛错,LangGraph catch 后向上抛
    const { VideoProjectSchema } = await import(
        '@miaoma-magicut/video-project'
    );
    VideoProjectSchema.parse(state.project);

    runtime.emit({
        durationMs: Date.now() - start,
        nodeName: 'validate_project',
        type: 'node.completed'
    });

    return {};
};

/**
 * save_project —— 调 tools.writeProject 落盘,emit savedProjectPath。
 * 失败抛错让 LangGraph 走 fail 路径。
 */
export const saveProjectNode = async (
    state: VideoCreationStateType,
    runtime: NodeRuntime
): Promise<Partial<VideoCreationStateType>> => {
    runtime.emit({
        type: 'node.started',
        nodeName: 'save_project',
        nodeLabel: '保存项目'
    });

    const start = Date.now();

    if (!state.project) {
        throw new Error('save_project called with undefined project');
    }

    const projectId = state.project.metadata.projectId;
    const outputDir = state.savedProjectPath
        ? join(state.savedProjectPath, '..')
        : runtime.projectOutputDirectory;

    const savedPath = await runtime.tools.writeProject({
        outputDir,
        projectId,
        projectJson: state.project
    });

    runtime.emit({
        durationMs: Date.now() - start,
        nodeName: 'save_project',
        type: 'node.completed'
    });

    return { savedProjectPath: savedPath };
};
