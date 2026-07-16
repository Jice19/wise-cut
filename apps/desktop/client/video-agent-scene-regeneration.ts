
import { mkdir } from 'node:fs/promises';
import path from 'node:path';

import type {
    AssetMatchCandidate,
    CreativeBrief,
    ModelProvider,
    PlannedScene,
    TtsProvider,
    VoiceSynthesisResult
} from '@wise-cut/video-agent';
import type {
    AgentConversationMessage,
    MusicClip,
    SubtitleClip,
    TimelineClip,
    TimelineTrack,
    VideoClip,
    VideoProject,
    VoiceClip
} from '@wise-cut/video-project';

import type {
    DesktopAgentRunEvent,
    VideoAgentRegenerateSceneInput
} from '../shared/video-agent';
import {
    defaultVideoAgentVoice,
    normalizeVideoAgentVoiceSettings
} from '../shared/video-agent-voices';

import type { VideoAgentEventEmitter } from './video-agent-ipc';
import type { VideoProjectStore } from './video-project-store';

type SceneTiming = {
    endMs: number;
    startMs: number;
};

type SceneRegenerationInput = {
    createRunId: () => string;
    emit: VideoAgentEventEmitter;
    input: VideoAgentRegenerateSceneInput;
    modelProvider: ModelProvider;
    now: () => string;
    store: VideoProjectStore;
    ttsProvider: TtsProvider;
    voiceOutputDirectory: string;
};

type SceneRegenerationResult = {
    project: VideoProject;
    runId: string;
    savedProjectPath?: string;
};

type SceneReportInput = {
    context?: string;
    emitForRun: (event: UnsequencedDesktopAgentRunEvent) => void;
    fallback: string;
    messageId: string;
    modelProvider: ModelProvider;
    nodeName: string;
    prompt: string;
    title: string;
};

type UnsequencedDesktopAgentRunEvent = DesktopAgentRunEvent extends infer Event
    ? Event extends DesktopAgentRunEvent
        ? Omit<Event, 'createdAt' | 'runId' | 'sequence'>
        : never
    : never;

const padIndex = (index: number) => String(index).padStart(3, '0');

const createSafeId = (value: string) => {
    const normalized = value.trim().replace(/[^a-zA-Z0-9_-]/g, '_');

    return normalized || 'item';
};

const isVideoClip = (clip: TimelineClip): clip is VideoClip =>
    clip.kind === 'video';

const isVoiceClip = (clip: TimelineClip): clip is VoiceClip =>
    clip.kind === 'voice';

const isSubtitleClip = (clip: TimelineClip): clip is SubtitleClip =>
    clip.kind === 'subtitle';

const isMusicClip = (clip: TimelineClip): clip is MusicClip =>
    clip.kind === 'music';

const getTrack = (
    tracks: TimelineTrack[],
    kind: TimelineTrack['kind']
): TimelineTrack | undefined => tracks.find((track) => track.kind === kind);

const createSceneTimings = (scenes: VideoProject['scenes']) => {
    const timings = new Map<string, SceneTiming>();
    let cursorMs = 0;

    scenes.forEach((scene) => {
        const startMs = cursorMs;
        const endMs = startMs + scene.durationMs;

        timings.set(scene.id, {
            endMs,
            startMs
        });
        cursorMs = endMs;
    });

    return timings;
};

const normalizePlannedScene = ({
    plannedScene,
    sourceScene
}: {
    plannedScene: PlannedScene;
    sourceScene: VideoProject['scenes'][number];
}): PlannedScene => {
    const subtitleLines = plannedScene.subtitleLines
        .map((line) => line.trim())
        .filter(Boolean);
    const nextSubtitleLines =
        subtitleLines.length > 0
            ? subtitleLines
            : plannedScene.script
                  .split('\n')
                  .map((line) => line.trim())
                  .filter(Boolean);

    return {
        ...plannedScene,
        durationMs: sourceScene.durationMs,
        id: sourceScene.id,
        index: sourceScene.index,
        script: nextSubtitleLines.join('\n'),
        subtitleLines: nextSubtitleLines
    };
};

const createRegenerationBrief = ({
    input,
    project,
    scene
}: {
    input: VideoAgentRegenerateSceneInput;
    project: VideoProject;
    scene: VideoProject['scenes'][number];
}): CreativeBrief => ({
    audience: '短视频创作者',
    keyMessages: [
        '仅优化当前选中的单个分镜',
        '文稿字幕与 TTS 文本必须完全一致',
        '需要重新匹配视频素材'
    ],
    summary: [
        `项目：${project.project.title}`,
        `当前分镜：${scene.title}`,
        `原口播：${scene.script}`,
        `用户优化要求：${input.prompt.trim()}`
    ].join('\n'),
    title: scene.title,
    tone: '自然清晰',
    visualStyle: scene.visualIntent
});

const createAssetCandidates = (project: VideoProject): AssetMatchCandidate[] =>
    project.assets.videos.map((asset) => ({
        assetId: asset.id,
        description: `${asset.path} · ${Math.round(asset.durationMs / 1000)}s`,
        durationMs: Math.max(1, asset.durationMs)
    }));

const streamSceneReport = async ({
    context,
    emitForRun,
    fallback,
    messageId,
    modelProvider,
    nodeName,
    prompt,
    title
}: SceneReportInput) => {
    if (!modelProvider.streamReport) return fallback;

    emitForRun({
        messageId,
        nodeName,
        title,
        type: 'model.stream.started'
    });

    const report = await modelProvider.streamReport(
        {
            context,
            prompt,
            title
        },
        (delta) => {
            emitForRun({
                delta,
                messageId,
                nodeName,
                type: 'model.stream.delta'
            });
        }
    );

    emitForRun({
        messageId,
        nodeName,
        type: 'model.stream.completed'
    });

    return report.trim() || fallback;
};

const synthesizeSceneVoices = async ({
    input,
    runId,
    scene,
    ttsProvider,
    voiceOutputDirectory
}: {
    input: VideoAgentRegenerateSceneInput;
    runId: string;
    scene: PlannedScene;
    ttsProvider: TtsProvider;
    voiceOutputDirectory: string;
}): Promise<VoiceSynthesisResult[]> => {
    const voice = input.selectedVoiceType ?? defaultVideoAgentVoice.voiceType;
    const voiceSettings = normalizeVideoAgentVoiceSettings(input);
    const safeRunId = createSafeId(runId);
    const safeSceneId = createSafeId(scene.id);
    const voiceResults: VoiceSynthesisResult[] = [];

    for (const [lineIndex, text] of scene.subtitleLines.entries()) {
        const outputPath = path.join(
            voiceOutputDirectory,
            `${safeRunId}-${safeSceneId}-${padIndex(lineIndex + 1)}.mp3`
        );

        await mkdir(path.dirname(outputPath), { recursive: true });

        const result = await ttsProvider.synthesizeSpeech({
            outputPath,
            speedRatio: voiceSettings.voiceSpeed,
            text,
            voice,
            volumeRatio: voiceSettings.voiceVolume
        });

        voiceResults.push({
            assetId: `voice_asset_${safeSceneId}_regen_${safeRunId}_${padIndex(
                lineIndex + 1
            )}`,
            durationMs: result.durationMs,
            lineIndex,
            path: result.path,
            sceneId: scene.id,
            text
        });
    }

    return voiceResults;
};

const createTimedVoiceSegments = ({
    scene,
    sceneStartMs,
    voices
}: {
    scene: PlannedScene;
    sceneStartMs: number;
    voices: VoiceSynthesisResult[];
}) => {
    let cursorMs = sceneStartMs;

    return scene.subtitleLines.map((text, lineIndex) => {
        const voice = voices.find(
            (item) => item.sceneId === scene.id && item.lineIndex === lineIndex
        );

        if (!voice) {
            throw new Error(`缺少分镜 ${scene.id} 第 ${lineIndex + 1} 段配音`);
        }

        if (voice.text !== text) {
            throw new Error(
                `分镜 ${scene.id} 第 ${lineIndex + 1} 段配音文本与字幕文本不一致`
            );
        }

        const startMs = cursorMs;
        const endMs = startMs + Math.max(1, voice.durationMs);

        cursorMs = endMs;

        return {
            endMs,
            lineIndex,
            startMs,
            text,
            voice
        };
    });
};

const shiftSceneClip = <Clip extends SubtitleClip | VideoClip | VoiceClip>({
    clip,
    nextTiming,
    previousTiming
}: {
    clip: Clip;
    nextTiming: SceneTiming;
    previousTiming?: SceneTiming;
}): Clip => {
    if (!previousTiming) {
        return {
            ...clip,
            endMs: nextTiming.endMs,
            startMs: nextTiming.startMs
        };
    }

    return {
        ...clip,
        endMs: nextTiming.startMs + (clip.endMs - previousTiming.startMs),
        startMs: nextTiming.startMs + (clip.startMs - previousTiming.startMs)
    };
};

const rebuildVideoClips = ({
    matchedVideoAssetId,
    nextSceneTimings,
    nextScenes,
    previousSceneTimings,
    project,
    scene,
    selectedVideoAsset
}: {
    matchedVideoAssetId: string;
    nextSceneTimings: Map<string, SceneTiming>;
    nextScenes: VideoProject['scenes'];
    previousSceneTimings: Map<string, SceneTiming>;
    project: VideoProject;
    scene: PlannedScene;
    selectedVideoAsset: VideoProject['assets']['videos'][number];
}): VideoClip[] => {
    const videoTrack = getTrack(project.tracks, 'video');
    const previousVideoClips = (videoTrack?.clips ?? []).filter(isVideoClip);
    const videoClipBySceneId = new Map(
        previousVideoClips.flatMap((clip) =>
            clip.sceneId ? [[clip.sceneId, clip] as const] : []
        )
    );
    const fallbackCrop = {
        height: project.canvas.height,
        width: project.canvas.width,
        x: 0,
        y: 0
    };
    const fallbackTransform = {
        rotation: 0,
        scale: 1,
        x: 0,
        y: 0
    };

    return nextScenes.map((item) => {
        const nextTiming = nextSceneTimings.get(item.id);
        const previousClip = videoClipBySceneId.get(item.id);

        if (!nextTiming) {
            throw new Error(`缺少分镜 ${item.id} 的时间信息`);
        }

        if (item.id !== scene.id) {
            if (!previousClip) {
                throw new Error(`缺少分镜 ${item.id} 的视频片段`);
            }

            return shiftSceneClip({
                clip: previousClip,
                nextTiming,
                previousTiming: previousSceneTimings.get(item.id)
            });
        }

        const sourceStartMs = previousClip?.sourceStartMs ?? 0;
        const sourceDurationMs = Math.max(
            1,
            selectedVideoAsset.durationMs - sourceStartMs
        );

        return {
            assetId: matchedVideoAssetId,
            crop: previousClip?.crop ?? fallbackCrop,
            endMs: nextTiming.endMs,
            id: previousClip?.id ?? `video_clip_${padIndex(item.index)}`,
            kind: 'video',
            sceneId: item.id,
            sourceEndMs:
                sourceStartMs +
                Math.min(
                    sourceDurationMs,
                    nextTiming.endMs - nextTiming.startMs
                ),
            sourceStartMs,
            startMs: nextTiming.startMs,
            transform: previousClip?.transform ?? fallbackTransform
        };
    });
};

const rebuildVoiceClips = ({
    input,
    nextSceneTimings,
    nextScenes,
    previousSceneTimings,
    project,
    scene,
    segments
}: {
    input: VideoAgentRegenerateSceneInput;
    nextSceneTimings: Map<string, SceneTiming>;
    nextScenes: VideoProject['scenes'];
    previousSceneTimings: Map<string, SceneTiming>;
    project: VideoProject;
    scene: PlannedScene;
    segments: ReturnType<typeof createTimedVoiceSegments>;
}): VoiceClip[] => {
    const voiceTrack = getTrack(project.tracks, 'voice');
    const previousVoiceClips = (voiceTrack?.clips ?? []).filter(isVoiceClip);
    const voiceSettings = normalizeVideoAgentVoiceSettings(input);

    return nextScenes.flatMap((item) => {
        const nextTiming = nextSceneTimings.get(item.id);

        if (!nextTiming) {
            throw new Error(`缺少分镜 ${item.id} 的时间信息`);
        }

        if (item.id === scene.id) {
            return segments.map((segment) => ({
                assetId: segment.voice.assetId,
                endMs: segment.endMs,
                id: `voice_clip_${scene.id}_regen_${padIndex(
                    segment.lineIndex + 1
                )}`,
                kind: 'voice' as const,
                sceneId: scene.id,
                speed: voiceSettings.voiceSpeed,
                startMs: segment.startMs,
                volume: voiceSettings.voiceVolume,
                voicePreset: input.selectedVoice
            }));
        }

        return previousVoiceClips
            .filter((clip) => clip.sceneId === item.id)
            .map((clip) =>
                shiftSceneClip({
                    clip,
                    nextTiming,
                    previousTiming: previousSceneTimings.get(item.id)
                })
            );
    });
};

const rebuildSubtitleClips = ({
    nextSceneTimings,
    nextScenes,
    previousSceneTimings,
    project,
    scene,
    segments,
    subtitleIds
}: {
    nextSceneTimings: Map<string, SceneTiming>;
    nextScenes: VideoProject['scenes'];
    previousSceneTimings: Map<string, SceneTiming>;
    project: VideoProject;
    scene: PlannedScene;
    segments: ReturnType<typeof createTimedVoiceSegments>;
    subtitleIds: string[];
}): SubtitleClip[] => {
    const subtitleTrack = getTrack(project.tracks, 'subtitle');
    const previousSubtitleClips = (subtitleTrack?.clips ?? []).filter(
        isSubtitleClip
    );

    return nextScenes.flatMap((item) => {
        const nextTiming = nextSceneTimings.get(item.id);

        if (!nextTiming) {
            throw new Error(`缺少分镜 ${item.id} 的时间信息`);
        }

        if (item.id === scene.id) {
            return segments.map((segment) => ({
                endMs: segment.endMs,
                id: `subtitle_clip_${scene.id}_regen_${padIndex(
                    segment.lineIndex + 1
                )}`,
                kind: 'subtitle' as const,
                sceneId: scene.id,
                startMs: segment.startMs,
                styleId: 'subtitle_style_default',
                subtitleId:
                    subtitleIds[segment.lineIndex] ??
                    subtitleIds[0] ??
                    `subtitle_asset_${scene.id}`,
                text: segment.text
            }));
        }

        return previousSubtitleClips
            .filter((clip) => clip.sceneId === item.id)
            .map((clip) =>
                shiftSceneClip({
                    clip,
                    nextTiming,
                    previousTiming: previousSceneTimings.get(item.id)
                })
            );
    });
};

const rebuildTracks = ({
    input,
    matchedVideoAssetId,
    nextSceneTimings,
    nextScenes,
    previousSceneTimings,
    project,
    scene,
    selectedVideoAsset,
    segments,
    subtitleIds,
    totalDurationMs
}: {
    input: VideoAgentRegenerateSceneInput;
    matchedVideoAssetId: string;
    nextSceneTimings: Map<string, SceneTiming>;
    nextScenes: VideoProject['scenes'];
    previousSceneTimings: Map<string, SceneTiming>;
    project: VideoProject;
    scene: PlannedScene;
    selectedVideoAsset: VideoProject['assets']['videos'][number];
    segments: ReturnType<typeof createTimedVoiceSegments>;
    subtitleIds: string[];
    totalDurationMs: number;
}): TimelineTrack[] =>
    project.tracks.map((track) => {
        if (track.kind === 'video') {
            return {
                ...track,
                clips: rebuildVideoClips({
                    matchedVideoAssetId,
                    nextSceneTimings,
                    nextScenes,
                    previousSceneTimings,
                    project,
                    scene,
                    selectedVideoAsset
                })
            };
        }

        if (track.kind === 'voice') {
            return {
                ...track,
                clips: rebuildVoiceClips({
                    input,
                    nextSceneTimings,
                    nextScenes,
                    previousSceneTimings,
                    project,
                    scene,
                    segments
                })
            };
        }

        if (track.kind === 'subtitle') {
            return {
                ...track,
                clips: rebuildSubtitleClips({
                    nextSceneTimings,
                    nextScenes,
                    previousSceneTimings,
                    project,
                    scene,
                    segments,
                    subtitleIds
                })
            };
        }

        return {
            ...track,
            clips: track.clips.filter(isMusicClip).map((clip) => ({
                ...clip,
                endMs: totalDurationMs,
                sourceEndMs: Math.min(
                    project.assets.music.find(
                        (asset) => asset.id === clip.assetId
                    )?.durationMs ?? totalDurationMs,
                    totalDurationMs
                ),
                startMs: 0
            }))
        };
    });

const appendConversation = ({
    finalSummary,
    input,
    now,
    processReport,
    project,
    runId,
    scene
}: {
    finalSummary: string;
    input: VideoAgentRegenerateSceneInput;
    now: () => string;
    processReport: string;
    project: VideoProject;
    runId: string;
    scene: PlannedScene;
}): AgentConversationMessage[] => {
    const existing = project.ai.conversation ?? [];
    const nextSequence =
        Math.max(0, ...existing.map((message) => message.sequence)) + 1;
    const createdAt = now();

    return [
        ...existing,
        {
            blocks: [
                {
                    items: [
                        {
                            key: '分镜',
                            value: scene.title
                        }
                    ],
                    type: 'key-values'
                }
            ],
            content: input.prompt.trim(),
            createdAt,
            role: 'user',
            sequence: nextSequence,
            sourceEventType: 'scene.regeneration.request'
        },
        {
            blocks: [
                {
                    text: '创作过程',
                    type: 'heading'
                },
                {
                    text: processReport,
                    type: 'paragraph'
                }
            ],
            content: processReport,
            createdAt,
            nodeName: 'scene_planner',
            role: 'assistant',
            sequence: nextSequence + 1,
            sourceEventType: 'model.stream.completed',
            tone: 'completed'
        },
        {
            blocks: [
                {
                    items: [
                        {
                            detail: '脚本、字幕、TTS 和视频素材已重新生成',
                            label: '单分镜优化',
                            status: 'completed'
                        }
                    ],
                    type: 'progress'
                }
            ],
            content: '单分镜优化完成，已重新生成脚本、匹配视频素材并生成配音。',
            createdAt,
            nodeName: 'scene_regeneration',
            role: 'assistant',
            sequence: nextSequence + 2,
            sourceEventType: 'scene.regeneration.completed',
            tone: 'completed'
        },
        {
            blocks: [
                {
                    text: '最终总结',
                    type: 'heading'
                },
                {
                    text: finalSummary,
                    type: 'paragraph'
                }
            ],
            content: finalSummary,
            createdAt,
            nodeName: 'timeline_assemble',
            role: 'assistant',
            sequence: nextSequence + 3,
            sourceEventType: 'scene.regeneration.summary',
            tone: 'completed'
        },
        {
            blocks: [
                {
                    items: [
                        {
                            key: '运行 ID',
                            value: runId
                        }
                    ],
                    type: 'key-values'
                }
            ],
            content: `已追加到创作历史：${scene.title}`,
            createdAt,
            role: 'system',
            sequence: nextSequence + 4,
            sourceEventType: 'scene.regeneration.history',
            tone: 'completed'
        }
    ];
};

export const regenerateVideoProjectScene = async ({
    createRunId,
    emit,
    input,
    modelProvider,
    now,
    store,
    ttsProvider,
    voiceOutputDirectory
}: SceneRegenerationInput): Promise<SceneRegenerationResult> => {
    const prompt = input.prompt.trim();

    if (!input.projectId.trim()) {
        throw new Error('缺少项目 ID');
    }

    if (!input.sceneId.trim()) {
        throw new Error('缺少分镜 ID');
    }

    if (!prompt) {
        throw new Error('请输入分镜优化要求');
    }

    const runId = createRunId();
    let sequence = 0;
    const emitForRun = (event: UnsequencedDesktopAgentRunEvent) => {
        sequence += 1;
        emit({
            ...event,
            createdAt: now(),
            runId,
            sequence
        } as DesktopAgentRunEvent);
    };

    const loaded = await store.readProjectById({
        projectId: input.projectId.trim()
    });

    if (loaded.success === false) {
        throw new Error(loaded.error.message);
    }

    const project = loaded.data;
    const sourceScenes = [...project.scenes].sort(
        (left, right) => left.index - right.index
    );
    const sourceScene = sourceScenes.find(
        (scene) => scene.id === input.sceneId
    );

    if (!sourceScene) {
        throw new Error(`未找到分镜：${input.sceneId}`);
    }

    const candidates = createAssetCandidates(project);

    if (candidates.length === 0) {
        throw new Error('当前项目没有可用于匹配的视频素材');
    }

    emitForRun({
        nodeName: 'scene_planner',
        type: 'node.started'
    });

    const brief = createRegenerationBrief({
        input: {
            ...input,
            prompt
        },
        project,
        scene: sourceScene
    });
    const processReport = await streamSceneReport({
        context: [
            `项目标题：${project.project.title}`,
            `原分镜标题：${sourceScene.title}`,
            `原分镜口播：${sourceScene.script}`,
            `原画面意图：${sourceScene.visualIntent}`,
            `用户优化要求：${prompt}`
        ].join('\n'),
        emitForRun,
        fallback: [
            `我会先围绕“${sourceScene.title}”判断原文案的表达重点。`,
            '然后把优化要求转成新的口播结构，保持字幕、配音文本完全一致。',
            '最后重新匹配视频素材，让画面意图和新文案同步。'
        ].join('\n'),
        messageId: `${runId}:scene-regeneration-process`,
        modelProvider,
        nodeName: 'scene_planner',
        prompt: '请输出这次单分镜优化的公开创作过程说明，包含内容理解、文案设计方向和画面匹配思路。不要输出隐藏推理链。',
        title: '单分镜优化创作过程'
    });
    const [rawPlannedScene] = await modelProvider.planScenes({
        brief,
        targetSceneCount: 1
    });

    if (!rawPlannedScene) {
        throw new Error('模型没有返回可用分镜');
    }

    const plannedScene = normalizePlannedScene({
        plannedScene: rawPlannedScene,
        sourceScene
    });

    emitForRun({
        nodeName: 'scene_planner',
        type: 'node.completed'
    });
    emitForRun({
        nodeName: 'asset_matcher',
        type: 'node.started'
    });

    const [match] = await modelProvider.rankAssetMatches({
        candidates,
        scenes: [plannedScene]
    });
    const matchedVideoAssetId =
        match?.rankedAssetIds[0]?.assetId ??
        sourceScene.matchedVideoAssetIds[0];
    const selectedVideoAsset = project.assets.videos.find(
        (asset) => asset.id === matchedVideoAssetId
    );

    if (!matchedVideoAssetId || !selectedVideoAsset) {
        throw new Error('素材匹配没有返回有效视频素材');
    }

    emitForRun({
        nodeName: 'asset_matcher',
        type: 'node.completed'
    });
    emitForRun({
        nodeName: 'tts',
        type: 'node.started'
    });

    const voices = await synthesizeSceneVoices({
        input,
        runId,
        scene: plannedScene,
        ttsProvider,
        voiceOutputDirectory
    });

    emitForRun({
        nodeName: 'tts',
        type: 'node.completed'
    });
    emitForRun({
        nodeName: 'timeline_assemble',
        type: 'node.started'
    });

    const previousSceneTimings = createSceneTimings(sourceScenes);
    const sourceSceneStartMs = previousSceneTimings.get(
        sourceScene.id
    )?.startMs;

    if (sourceSceneStartMs === undefined) {
        throw new Error(`缺少分镜 ${sourceScene.id} 的起始时间`);
    }

    const segments = createTimedVoiceSegments({
        scene: plannedScene,
        sceneStartMs: sourceSceneStartMs,
        voices
    });
    const nextDurationMs =
        segments.at(-1)?.endMs !== undefined
            ? segments.at(-1)!.endMs - sourceSceneStartMs
            : sourceScene.durationMs;
    const safeRunId = createSafeId(runId);
    const subtitleIds = plannedScene.subtitleLines.map(
        (_, index) =>
            `subtitle_asset_${createSafeId(plannedScene.id)}_regen_${safeRunId}_${padIndex(
                index + 1
            )}`
    );
    const nextScene: VideoProject['scenes'][number] = {
        ...sourceScene,
        durationMs: nextDurationMs,
        goal: plannedScene.goal,
        matchedVideoAssetIds: [matchedVideoAssetId],
        notes: sourceScene.notes,
        script: plannedScene.script,
        subtitleIds,
        title: plannedScene.title,
        visualIntent: plannedScene.visualIntent,
        voiceAssetId: voices[0]?.assetId ?? sourceScene.voiceAssetId
    };
    const nextScenes = sourceScenes.map((scene) =>
        scene.id === sourceScene.id ? nextScene : scene
    );
    const nextSceneTimings = createSceneTimings(nextScenes);
    const totalDurationMs =
        nextSceneTimings.get(nextScenes.at(-1)?.id ?? '')?.endMs ?? 0;
    const finalSummary = await streamSceneReport({
        context: [
            `优化后分镜标题：${plannedScene.title}`,
            `优化后口播：${plannedScene.script}`,
            `匹配视频素材：${matchedVideoAssetId}`,
            `新分镜时长：${nextDurationMs}ms`,
            `配音段数：${segments.length}`
        ].join('\n'),
        emitForRun,
        fallback: [
            `最终总结：${plannedScene.title} 已完成单分镜优化。`,
            `文案更新为 ${plannedScene.subtitleLines.length} 段口播，配音时长决定新分镜时长。`,
            `视频素材已重新匹配为 ${matchedVideoAssetId}。`
        ].join('\n'),
        messageId: `${runId}:scene-regeneration-summary`,
        modelProvider,
        nodeName: 'timeline_assemble',
        prompt: '请输出这次单分镜优化的最终总结，说明文案变化、素材匹配、配音和时间线结果。不要输出隐藏推理链。',
        title: '单分镜优化最终总结'
    });
    const voiceTrack = getTrack(project.tracks, 'voice');
    const subtitleIdsToRemove = new Set(sourceScene.subtitleIds);
    const voiceAssetIdsToRemove = new Set([
        sourceScene.voiceAssetId,
        ...((voiceTrack?.clips ?? [])
            .filter(isVoiceClip)
            .filter((clip) => clip.sceneId === sourceScene.id)
            .map((clip) => clip.assetId) ?? [])
    ]);
    const nextProject: VideoProject = {
        ...project,
        ai: {
            ...project.ai,
            conversation: appendConversation({
                finalSummary,
                input: {
                    ...input,
                    prompt
                },
                now,
                processReport,
                project,
                runId,
                scene: plannedScene
            })
        },
        assets: {
            ...project.assets,
            subtitles: [
                ...project.assets.subtitles.filter(
                    (subtitle) => !subtitleIdsToRemove.has(subtitle.id)
                ),
                ...plannedScene.subtitleLines.map((text, index) => ({
                    id:
                        subtitleIds[index] ??
                        `subtitle_asset_${plannedScene.id}`,
                    styleId: 'subtitle_style_default',
                    text
                }))
            ],
            voices: [
                ...project.assets.voices.filter(
                    (voice) => !voiceAssetIdsToRemove.has(voice.id)
                ),
                ...voices.map((voice) => ({
                    durationMs: voice.durationMs,
                    id: voice.assetId,
                    path: voice.path,
                    provider: 'volcengine-seed-tts',
                    voice:
                        input.selectedVoiceType ??
                        defaultVideoAgentVoice.voiceType
                }))
            ]
        },
        canvas: {
            ...project.canvas,
            durationMs: totalDurationMs
        },
        project: {
            ...project.project,
            updatedAt: now()
        },
        scenes: nextScenes,
        tracks: rebuildTracks({
            input,
            matchedVideoAssetId,
            nextSceneTimings,
            nextScenes,
            previousSceneTimings,
            project,
            scene: plannedScene,
            selectedVideoAsset,
            segments,
            subtitleIds,
            totalDurationMs
        })
    };

    emitForRun({
        nodeName: 'timeline_assemble',
        type: 'node.completed'
    });
    emitForRun({
        nodeName: 'project_save',
        type: 'node.started'
    });

    const saved = await store.createProject({ project: nextProject });

    if (saved.success === false) {
        throw new Error(saved.error.message);
    }

    emitForRun({
        nodeName: 'project_save',
        type: 'node.completed'
    });
    emitForRun({
        projectId: saved.data.project.project.id,
        savedProjectPath: saved.data.filePath,
        type: 'run.completed'
    });

    return {
        project: saved.data.project,
        runId,
        savedProjectPath: saved.data.filePath
    };
};
