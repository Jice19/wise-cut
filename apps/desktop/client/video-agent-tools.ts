
import { mkdir, readdir } from 'node:fs/promises';
import path from 'node:path';

import type {
    AssetAnalysis,
    AssetMatchResult,
    CreativeBrief,
    ModelProvider,
    PlannedScene,
    TtsProvider,
    VideoAgentTools,
    VideoCreationInput,
    VoiceSynthesisResult
} from '@wise-cut/video-agent';
import {
    validateVideoProject,
    type VideoProject
} from '@wise-cut/video-project';

import {
    defaultVideoAgentVoice,
    normalizeVideoAgentVoiceSettings,
    type VideoAgentVoiceSettings
} from '../shared/video-agent-voices';

import type { VideoProjectStore } from './video-project-store';

const supportedVideoExtensions = new Set(['.m4v', '.mov', '.mp4', '.webm']);

type FileSystemEntry = {
    isFile: () => boolean;
    name: string;
};

const createSafeId = (value: string) => {
    const normalized = value.trim().replace(/[^a-zA-Z0-9_-]/g, '_');

    return normalized || 'item';
};

const padIndex = (index: number) => String(index).padStart(3, '0');

const splitSentences = (text: string) => {
    return text
        .split(/[。！？!?；;\n]+/)
        .map((line) => line.trim())
        .filter(Boolean);
};

const storyboardLabelPattern =
    /^(?:[-*•\d.\s、]+)?(?:[【[(（]\s*)?(?:分镜\s*\d+|镜头\s*\d+|场景\s*\d+|开场明确主题|展示核心内容|收束行动引导|开场|转场|结尾|画面|旁白|字幕)(?:\s*[】\])）])?\s*[：:]\s*/i;
const storyboardOnlyLabelPattern =
    /^(?:[-*•\d.\s、]+)?(?:[【[(（]\s*)?(?:分镜\s*\d+|镜头\s*\d+|场景\s*\d+|开场明确主题|展示核心内容|收束行动引导|开场|转场|结尾|画面|旁白|字幕)(?:\s*[】\])）])?\s*$/i;
const readableTextPattern = /[\p{L}\p{N}]/u;

const normalizeSpokenLine = (text: string) =>
    text
        .trim()
        .replace(storyboardOnlyLabelPattern, '')
        .replace(storyboardLabelPattern, '')
        .replace(/\s+/g, ' ')
        .trim();

const hasReadableText = (text: string) => readableTextPattern.test(text);

const takeTitle = (text: string) => {
    const compact = text.trim().replace(/\s+/g, '');

    if (!compact) return 'AI智能视频';

    return compact.slice(0, 18);
};

const createSubtitleLines = (text: string) => {
    const compact = normalizeSpokenLine(text);

    if (!compact || !hasReadableText(compact)) return [];

    if (compact.length <= 22) return [compact];

    const sentenceChunks: string[] = compact.match(
        /[^。！？!?；;\n]+[。！？!?；;]?/g
    ) ?? [compact];
    const lines: string[] = [];
    let currentLine = '';

    const pushCurrentLine = () => {
        if (currentLine && hasReadableText(currentLine)) {
            lines.push(currentLine);
        }

        currentLine = '';
    };

    const appendNaturalChunk = (chunk: string) => {
        const normalizedChunk = chunk.trim();

        if (!normalizedChunk || !hasReadableText(normalizedChunk)) return;

        const nextLine = `${currentLine}${normalizedChunk}`.trim();

        if (nextLine.length <= 22) {
            currentLine = nextLine;
            return;
        }

        pushCurrentLine();
        currentLine = normalizedChunk;
    };

    sentenceChunks.forEach((sentence) => {
        const normalizedSentence = sentence.trim();

        if (!normalizedSentence || !hasReadableText(normalizedSentence)) {
            return;
        }

        if (normalizedSentence.length <= 22) {
            appendNaturalChunk(normalizedSentence);
            return;
        }

        const clauseChunks =
            normalizedSentence.match(/[^，,、：:]+[，,、：:]?/g) ?? [];

        if (clauseChunks.length <= 1) {
            appendNaturalChunk(normalizedSentence);
            return;
        }

        clauseChunks.forEach(appendNaturalChunk);
    });

    pushCurrentLine();

    return lines;
};

const createSceneScripts = (input: VideoCreationInput) => {
    const sentences = splitSentences(input.prompt);

    if (sentences.length >= 2) return sentences.slice(0, 9);

    const summary = input.prompt.trim();

    return [
        `先把重点说清楚，${summary}`,
        '接下来用几个连续镜头把内容讲透，让观众能顺着节奏看下去。',
        '最后用清晰的配音和字幕收束，让这条视频可以直接进入精修。'
    ];
};

const normalizePlannedSceneSpeech = (scene: PlannedScene): PlannedScene => {
    const subtitleLines = scene.subtitleLines
        .flatMap((line) => createSubtitleLines(line))
        .filter(Boolean);
    const fallbackLines = createSubtitleLines(scene.script);
    const nextSubtitleLines =
        subtitleLines.length > 0
            ? subtitleLines
            : fallbackLines.length > 0
              ? fallbackLines
              : ['这一段先把重点讲清楚，让观众继续看下去。'];

    return {
        ...scene,
        script: nextSubtitleLines.join('\n'),
        subtitleLines: nextSubtitleLines
    };
};

const createBrief = ({
    assets,
    input
}: {
    assets: AssetAnalysis[];
    input: VideoCreationInput;
}): CreativeBrief => ({
    audience: '短视频创作者',
    keyMessages: [
        '智能分镜',
        assets.length > 0 ? '本地素材匹配' : '视频结构规划',
        '自动生成可编辑时间线'
    ],
    summary: input.prompt.trim(),
    title: takeTitle(input.prompt),
    tone: '专业轻快',
    visualStyle: '清爽科技感'
});

const createProjectScenes = ({
    matches,
    subtitleIdsBySceneId,
    timedScenes
}: {
    matches: AssetMatchResult[];
    timedScenes: TimedScene[];
    subtitleIdsBySceneId: Map<string, string[]>;
}): VideoProject['scenes'] => {
    const matchedVideoAssetIdsBySceneId = new Map(
        matches.map((match) => [
            match.sceneId,
            match.rankedAssetIds.map((asset) => asset.assetId)
        ])
    );

    return timedScenes.map(({ durationMs, scene, segments }) => ({
        durationMs,
        goal: scene.goal,
        id: scene.id,
        index: scene.index,
        matchedVideoAssetIds: matchedVideoAssetIdsBySceneId.get(scene.id) ?? [],
        notes: '由本地 LangGraph runner 生成',
        script: createSceneVoiceScript(scene),
        subtitleIds: subtitleIdsBySceneId.get(scene.id) ?? [],
        title: scene.title,
        visualIntent: scene.visualIntent,
        voiceAssetId: segments[0]?.voice.assetId ?? `voice_asset_${scene.id}`
    }));
};

type TimedVoiceSegment = {
    durationMs: number;
    endMs: number;
    lineIndex: number;
    startMs: number;
    text: string;
    voice: VoiceSynthesisResult;
};

type TimedScene = {
    durationMs: number;
    endMs: number;
    scene: PlannedScene;
    segments: TimedVoiceSegment[];
    startMs: number;
};

const createSceneVoiceScript = (scene: PlannedScene) =>
    scene.subtitleLines.join('\n') || scene.script;

const createVoiceSegmentKey = ({
    lineIndex,
    sceneId
}: {
    lineIndex: number;
    sceneId: string;
}) => `${sceneId}:${lineIndex}`;

const createTimedScenes = ({
    scenes,
    voices
}: {
    scenes: PlannedScene[];
    voices: VoiceSynthesisResult[];
}): TimedScene[] => {
    const voicesBySceneLine = new Map<string, VoiceSynthesisResult>();

    voices.forEach((voice) => {
        const key = createVoiceSegmentKey({
            lineIndex: voice.lineIndex,
            sceneId: voice.sceneId
        });

        if (voicesBySceneLine.has(key)) {
            throw new Error(
                `分镜 ${voice.sceneId} 第 ${voice.lineIndex + 1} 段存在重复配音结果`
            );
        }

        voicesBySceneLine.set(key, voice);
    });

    let timelineCursorMs = 0;

    return scenes.map((scene) => {
        const sceneStartMs = timelineCursorMs;
        let segmentCursorMs = sceneStartMs;
        const segments = scene.subtitleLines.map((text, lineIndex) => {
            const voice = voicesBySceneLine.get(
                createVoiceSegmentKey({
                    lineIndex,
                    sceneId: scene.id
                })
            );

            if (!voice) {
                throw new Error(
                    `缺少分镜 ${scene.id} 第 ${lineIndex + 1} 段字幕对应的配音结果`
                );
            }

            if (voice.text !== text) {
                throw new Error(
                    `分镜 ${scene.id} 第 ${lineIndex + 1} 段配音文本与字幕文本不一致`
                );
            }

            const durationMs = Math.max(1, voice.durationMs);
            const startMs = segmentCursorMs;
            const endMs = startMs + durationMs;
            segmentCursorMs = endMs;

            return {
                durationMs,
                endMs,
                lineIndex,
                startMs,
                text,
                voice
            };
        });
        const sceneEndMs = segmentCursorMs;
        const durationMs = sceneEndMs - sceneStartMs;
        timelineCursorMs = sceneEndMs;

        return {
            durationMs,
            endMs: sceneEndMs,
            scene,
            segments,
            startMs: sceneStartMs
        };
    });
};

export const createDesktopVideoAgentTools = ({
    getSelectedVoice,
    getSelectedVoiceType,
    getVoiceSettings,
    modelProvider,
    now = () => new Date().toISOString(),
    store,
    ttsProvider,
    voiceOutputDirectory
}: {
    getSelectedVoice?: (runId: string) => string | undefined;
    getSelectedVoiceType?: (runId: string) => string | undefined;
    getVoiceSettings?: (
        runId: string
    ) => Partial<VideoAgentVoiceSettings> | undefined;
    modelProvider?: ModelProvider;
    now?: () => string;
    store: VideoProjectStore;
    ttsProvider?: TtsProvider;
    voiceOutputDirectory?: string;
}): VideoAgentTools => {
    const assetPaths = new Map<string, string>();
    const resolveTtsSpeaker = (runId: string) =>
        getSelectedVoiceType?.(runId) ?? defaultVideoAgentVoice.voiceType;
    const resolveVoiceSettings = (runId: string) =>
        normalizeVideoAgentVoiceSettings(getVoiceSettings?.(runId));

    return {
        analyzeAssets: async ({ assets }) => assets,
        assembleTimeline: async ({
            assets,
            brief,
            input,
            matches,
            scenes,
            voices
        }) => {
            const safeRunId = createSafeId(input.runId);
            const createdAt = now();
            const voiceSettings = resolveVoiceSettings(input.runId);
            const assetById = new Map(
                assets.map((asset) => [asset.assetId, asset])
            );
            const availableVideoAssetIds = new Set([
                ...assets.map((asset) => asset.assetId),
                ...matches.flatMap((match) =>
                    match.rankedAssetIds.map((asset) => asset.assetId)
                )
            ]);
            const videoAssets = [...availableVideoAssetIds].map(
                (assetId, index) => {
                    const asset = assetById.get(assetId);

                    return {
                        durationMs: asset?.durationMs ?? 6000,
                        fps: 30,
                        height: 1080,
                        id: assetId,
                        path:
                            assetPaths.get(assetId) ??
                            path.join(
                                input.sourceAssetDirectory,
                                `${assetId}.mp4`
                            ),
                        thumbnailIds: [
                            `thumbnail_asset_${padIndex(index + 1)}`
                        ],
                        width: 1920
                    };
                }
            );
            const thumbnails = videoAssets.map((asset) => ({
                id: asset.thumbnailIds[0],
                path: `assets/thumbnails/${asset.id}.jpg`,
                sourceVideoAssetId: asset.id
            }));
            const subtitleIdsBySceneId = new Map<string, string[]>();
            const subtitleAssets = scenes.flatMap((scene) => {
                const ids: string[] = [];
                const subtitles = scene.subtitleLines.map((line, index) => {
                    const id = `subtitle_asset_${scene.id}_${padIndex(
                        index + 1
                    )}`;
                    ids.push(id);

                    return {
                        id,
                        styleId: 'subtitle_style_default',
                        text: line
                    };
                });

                subtitleIdsBySceneId.set(scene.id, ids);

                return subtitles;
            });
            const timedScenes = createTimedScenes({ scenes, voices });
            const totalDurationMs = timedScenes.reduce(
                (total, scene) => total + scene.durationMs,
                0
            );
            const projectScenes = createProjectScenes({
                matches,
                subtitleIdsBySceneId,
                timedScenes
            });
            const videoClips = timedScenes.map((timedScene, index) => {
                const { durationMs, endMs, scene, startMs } = timedScene;
                const match = matches.find((item) => item.sceneId === scene.id);
                const assetId =
                    match?.rankedAssetIds[0]?.assetId ??
                    videoAssets[index % videoAssets.length]?.id;
                const sourceDurationMs =
                    assetById.get(assetId ?? '')?.durationMs ?? durationMs;

                return {
                    assetId: assetId ?? videoAssets[0].id,
                    crop: {
                        height: 1080,
                        width: 1920,
                        x: 0,
                        y: 0
                    },
                    endMs,
                    id: `video_clip_${padIndex(index + 1)}`,
                    kind: 'video' as const,
                    sceneId: scene.id,
                    sourceEndMs: Math.max(
                        1,
                        Math.min(sourceDurationMs, durationMs)
                    ),
                    sourceStartMs: 0,
                    startMs,
                    transform: {
                        rotation: 0,
                        scale: 1,
                        x: 0,
                        y: 0
                    }
                };
            });
            const voiceClips = timedScenes.flatMap(({ scene, segments }) =>
                segments.map((segment) => ({
                    assetId: segment.voice.assetId,
                    endMs: segment.endMs,
                    id: `voice_clip_${scene.id}_${padIndex(
                        segment.lineIndex + 1
                    )}`,
                    kind: 'voice' as const,
                    sceneId: scene.id,
                    speed: voiceSettings.voiceSpeed,
                    startMs: segment.startMs,
                    volume: voiceSettings.voiceVolume,
                    voicePreset: getSelectedVoice?.(input.runId) ?? '温婉学姐'
                }))
            );
            const subtitleClips = timedScenes.flatMap(({ scene, segments }) => {
                const subtitleIds = subtitleIdsBySceneId.get(scene.id) ?? [];

                return segments.map((segment) => ({
                    endMs: segment.endMs,
                    id: `subtitle_clip_${scene.id}_${padIndex(
                        segment.lineIndex + 1
                    )}`,
                    kind: 'subtitle' as const,
                    sceneId: scene.id,
                    startMs: segment.startMs,
                    styleId: 'subtitle_style_default',
                    subtitleId:
                        subtitleIds[segment.lineIndex] ??
                        subtitleIds[0] ??
                        `subtitle_asset_${scene.id}_${padIndex(
                            segment.lineIndex + 1
                        )}`,
                    text: segment.text
                }));
            });
            const musicAssetId = `music_asset_${safeRunId}`;

            return {
                ai: {
                    graphVersion: 'video-creation-agent@0.1.0',
                    provider: 'desktop-langgraph-local-tools',
                    runId: input.runId
                },
                assets: {
                    music: [
                        {
                            durationMs: Math.max(totalDurationMs, 1),
                            id: musicAssetId,
                            path: 'assets/music/internal-preview.mp3',
                            title: 'Internal Preview'
                        }
                    ],
                    subtitles: subtitleAssets,
                    thumbnails,
                    videos: videoAssets,
                    voices: voices.map((voice) => ({
                        durationMs: voice.durationMs,
                        id: voice.assetId,
                        path: voice.path,
                        provider: 'desktop-local-tts-placeholder',
                        voice: resolveTtsSpeaker(input.runId)
                    }))
                },
                canvas: {
                    durationMs: totalDurationMs,
                    fps: 30,
                    height: 1080,
                    safeArea: {
                        height: 888,
                        width: 1728,
                        x: 96,
                        y: 96
                    },
                    width: 1920
                },
                project: {
                    createdAt,
                    id: `project_${safeRunId}`,
                    sourcePrompt: input.prompt,
                    title: brief.title,
                    updatedAt: createdAt
                },
                render: {
                    format: 'mp4',
                    quality: 'preview'
                },
                scenes: projectScenes,
                schemaVersion: '1.0.0',
                tracks: [
                    {
                        clips: videoClips,
                        id: 'track_video_001',
                        kind: 'video',
                        label: '视频'
                    },
                    {
                        clips: voiceClips,
                        id: 'track_voice_001',
                        kind: 'voice',
                        label: '配音'
                    },
                    {
                        clips: subtitleClips,
                        id: 'track_subtitle_001',
                        kind: 'subtitle',
                        label: '字幕'
                    },
                    {
                        clips: [
                            {
                                assetId: musicAssetId,
                                endMs: totalDurationMs,
                                fadeInMs: 1200,
                                fadeOutMs: 1800,
                                id: 'music_clip_001',
                                kind: 'music',
                                sourceEndMs: totalDurationMs,
                                sourceStartMs: 0,
                                startMs: 0,
                                volume: 0.28
                            }
                        ],
                        id: 'track_music_001',
                        kind: 'music',
                        label: '音乐'
                    }
                ]
            } satisfies VideoProject;
        },
        generateCreativeBrief: async ({ assets, input }) =>
            modelProvider
                ? modelProvider.generateCreativeBrief({
                      prompt: input.prompt,
                      sourceAssetSummaries: assets.map(
                          (asset) => asset.description
                      )
                  })
                : createBrief({ assets, input }),
        matchAssets: async ({ assets, scenes }) =>
            modelProvider
                ? modelProvider.rankAssetMatches({
                      candidates: assets,
                      scenes
                  })
                : scenes.map((scene, index) => {
                      const asset = assets[index % assets.length];

                      return {
                          rankedAssetIds: [
                              {
                                  assetId: asset.assetId,
                                  reason: `按分镜顺序匹配 ${asset.description}`,
                                  score: 0.82
                              }
                          ],
                          sceneId: scene.id
                      };
                  }),
        planScenes: async ({ assets, brief, input }) => {
            if (modelProvider) {
                const plannedScenes = await modelProvider.planScenes({
                    brief
                });

                return plannedScenes.map(normalizePlannedSceneSpeech);
            }

            const scripts = createSceneScripts(input);

            return scripts.map((script, index) => {
                const sceneIndex = index + 1;
                const id = `scene_${padIndex(sceneIndex)}`;

                const subtitleLines = createSubtitleLines(script);

                return {
                    durationMs:
                        assets[index % Math.max(assets.length, 1)]
                            ?.durationMs ?? 6000,
                    goal:
                        sceneIndex === 1
                            ? '建立主题和观看期待'
                            : '推进视频叙事信息',
                    id,
                    index: sceneIndex,
                    script: subtitleLines.join('\n'),
                    subtitleLines,
                    title:
                        sceneIndex === 1
                            ? '开场'
                            : `分镜 ${padIndex(sceneIndex)}`,
                    visualIntent: '匹配本地视频素材并保持节奏清晰'
                };
            });
        },
        saveProject: async ({ project }) => {
            const saved = await store.createProject({ project });

            if (saved.success === false) {
                throw new Error(saved.error.message);
            }

            return {
                path: saved.data.filePath,
                project: saved.data.project
            };
        },
        scanAssets: async ({ input }) => {
            let entries: FileSystemEntry[];

            try {
                entries = await readdir(input.sourceAssetDirectory, {
                    withFileTypes: true
                });
            } catch (error) {
                const message =
                    error instanceof Error ? error.message : String(error);

                throw new Error(`无法读取本地素材目录：${message}`);
            }

            const videoEntries = entries
                .filter((entry) => entry.isFile())
                .filter((entry) =>
                    supportedVideoExtensions.has(
                        path.extname(entry.name).toLowerCase()
                    )
                )
                .sort((first, second) => first.name.localeCompare(second.name));

            if (videoEntries.length === 0) {
                throw new Error('本地素材目录中没有找到可用视频文件');
            }

            const safeRunId = createSafeId(input.runId);

            return videoEntries.slice(0, 24).map((entry, index) => {
                const assetId = `video_asset_${safeRunId}_${padIndex(
                    index + 1
                )}`;

                assetPaths.set(
                    assetId,
                    path.join(input.sourceAssetDirectory, entry.name)
                );

                return {
                    assetId,
                    description: `本地视频素材 ${entry.name}`,
                    durationMs: 5000 + (index % 5) * 1500
                };
            });
        },
        ...(modelProvider?.streamReport
            ? {
                  streamReport: (input, emitDelta) =>
                      modelProvider.streamReport?.(input, emitDelta) ??
                      Promise.resolve('')
              }
            : {}),
        synthesizeVoice: async ({ input, scenes }) => {
            const voice = resolveTtsSpeaker(input.runId);
            const voiceSettings = resolveVoiceSettings(input.runId);

            if (!ttsProvider) {
                return scenes.flatMap((scene, sceneIndex) =>
                    scene.subtitleLines.map((text, lineIndex) => ({
                        assetId: `voice_asset_${scene.id}_${padIndex(lineIndex + 1)}`,
                        durationMs: Math.max(800, Math.ceil(text.length * 180)),
                        lineIndex,
                        path: `assets/voices/${input.runId}-${padIndex(sceneIndex + 1)}-${padIndex(lineIndex + 1)}.mp3`,
                        sceneId: scene.id,
                        text
                    }))
                );
            }

            const voiceResults: VoiceSynthesisResult[] = [];

            for (const scene of scenes) {
                for (const [lineIndex, text] of scene.subtitleLines.entries()) {
                    const outputPath = path.join(
                        voiceOutputDirectory ?? input.sourceAssetDirectory,
                        `${createSafeId(input.runId)}-${createSafeId(
                            scene.id
                        )}-${padIndex(lineIndex + 1)}.mp3`
                    );
                    await mkdir(path.dirname(outputPath), {
                        recursive: true
                    });
                    const result = await ttsProvider.synthesizeSpeech({
                        outputPath,
                        speedRatio: voiceSettings.voiceSpeed,
                        text,
                        voice,
                        volumeRatio: voiceSettings.voiceVolume
                    });
                    const voiceResult: VoiceSynthesisResult = {
                        assetId: `voice_asset_${scene.id}_${padIndex(
                            lineIndex + 1
                        )}`,
                        durationMs: result.durationMs,
                        lineIndex,
                        path: result.path,
                        sceneId: scene.id,
                        text
                    };

                    voiceResults.push(voiceResult);
                }
            }

            return voiceResults;
        },
        validateProject: async ({ project }) => {
            const result = validateVideoProject(project);

            if (result.success === false) {
                return {
                    error: result.issues.join('\n'),
                    success: false
                };
            }

            return { success: true };
        }
    };
};
