
import { mkdir } from 'node:fs/promises';
import path from 'node:path';

import type { TtsProvider } from '@wise-cut/video-agent';
import type {
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
    VideoAgentRegenerateVoicesInput
} from '../shared/video-agent';
import {
    defaultVideoAgentVoice,
    normalizeVideoAgentVoiceSettings
} from '../shared/video-agent-voices';

import type { VideoAgentEventEmitter } from './video-agent-ipc';
import type { VideoProjectStore } from './video-project-store';

type VoiceRegenerationInput = {
    createRunId: () => string;
    emit: VideoAgentEventEmitter;
    emitForRun?: (event: UnsequencedDesktopAgentRunEvent) => void;
    input: VideoAgentRegenerateVoicesInput;
    isCancelled?: () => boolean;
    now: () => string;
    runId?: string;
    store: VideoProjectStore;
    ttsProvider: TtsProvider;
    voiceOutputDirectory: string;
};

type VoiceRegenerationResult = {
    project: VideoProject;
    runId: string;
    savedProjectPath?: string;
};

type UnsequencedDesktopAgentRunEvent = DesktopAgentRunEvent extends infer Event
    ? Event extends DesktopAgentRunEvent
        ? Omit<Event, 'createdAt' | 'runId' | 'sequence'>
        : never
    : never;

type SceneTiming = {
    endMs: number;
    startMs: number;
};

type VoiceLine = {
    lineIndex: number;
    subtitleClipId?: string;
    subtitleId: string;
    styleId: string;
    text: string;
};

type VoiceSegment = VoiceLine & {
    assetId: string;
    durationMs: number;
    endMs: number;
    path: string;
    sceneId: string;
    startMs: number;
};

class VoiceRegenerationCancelledError extends Error {
    constructor() {
        super('口播音轨生成已取消');
        this.name = 'VoiceRegenerationCancelledError';
    }
}

const padIndex = (index: number) => String(index).padStart(3, '0');

const readableTextPattern = /[\p{L}\p{N}]/u;

const createSafeId = (value: string) => {
    const normalized = value.trim().replace(/[^a-zA-Z0-9_-]/g, '_');

    return normalized || 'item';
};

const hasReadableText = (text: string) => readableTextPattern.test(text);

const isVoiceRegenerationCancelled = (error: unknown) =>
    error instanceof VoiceRegenerationCancelledError;

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

    scenes
        .sort((left, right) => left.index - right.index)
        .forEach((scene) => {
            const startMs = cursorMs;
            const endMs = startMs + scene.durationMs;

            timings.set(scene.id, { endMs, startMs });
            cursorMs = endMs;
        });

    return timings;
};

const createSceneVoiceLines = ({
    project,
    scene
}: {
    project: VideoProject;
    scene: VideoProject['scenes'][number];
}): VoiceLine[] => {
    const subtitlesById = new Map(
        project.assets.subtitles.map((subtitle) => [subtitle.id, subtitle])
    );
    const subtitleTrack = getTrack(project.tracks, 'subtitle');
    const subtitleClipsBySubtitleId = new Map(
        (subtitleTrack?.clips ?? [])
            .filter(isSubtitleClip)
            .map((clip) => [clip.subtitleId, clip])
    );
    const existingLines = scene.subtitleIds.flatMap((subtitleId, lineIndex) => {
        const subtitle = subtitlesById.get(subtitleId);

        const text = subtitle?.text.trim() ?? '';

        if (!hasReadableText(text)) return [];

        const clip = subtitleClipsBySubtitleId.get(subtitleId);

        return [
            {
                lineIndex,
                subtitleClipId: clip?.id,
                subtitleId,
                styleId: clip?.styleId ?? subtitle.styleId,
                text
            }
        ];
    });

    if (existingLines.length > 0) return existingLines;

    return scene.script
        .split('\n')
        .map((line) => line.trim())
        .filter(hasReadableText)
        .map((text, lineIndex) => ({
            lineIndex,
            subtitleId: `subtitle_asset_${createSafeId(scene.id)}_voice_regen_${padIndex(
                lineIndex + 1
            )}`,
            styleId: 'subtitle_style_default',
            text
        }));
};

const synthesizeVoices = async ({
    emitForRun,
    input,
    isCancelled,
    linesBySceneId,
    runId,
    ttsProvider,
    voiceOutputDirectory
}: {
    emitForRun: (event: UnsequencedDesktopAgentRunEvent) => void;
    input: VideoAgentRegenerateVoicesInput;
    isCancelled?: () => boolean;
    linesBySceneId: Map<string, VoiceLine[]>;
    runId: string;
    ttsProvider: TtsProvider;
    voiceOutputDirectory: string;
}) => {
    const voice = input.selectedVoiceType ?? defaultVideoAgentVoice.voiceType;
    const safeRunId = createSafeId(runId);
    const synthesized = new Map<string, VoiceSegment[]>();
    const total = [...linesBySceneId.values()].reduce(
        (count, lines) => count + lines.length,
        0
    );
    let completed = 0;

    const throwIfCancelled = () => {
        if (isCancelled?.()) {
            throw new VoiceRegenerationCancelledError();
        }
    };

    for (const [sceneId, lines] of linesBySceneId) {
        const safeSceneId = createSafeId(sceneId);
        const segments: VoiceSegment[] = [];

        for (const line of lines) {
            throwIfCancelled();

            const outputPath = path.join(
                voiceOutputDirectory,
                `${safeRunId}-${safeSceneId}-voice-${padIndex(
                    line.lineIndex + 1
                )}.mp3`
            );

            await mkdir(path.dirname(outputPath), { recursive: true });
            emitForRun({
                current: completed + 1,
                message: `正在合成第 ${completed + 1} / ${total} 条口播`,
                percent:
                    total > 0 ? Math.round((completed / total) * 100) : 100,
                text: line.text,
                total,
                type: 'voice.regeneration.progress'
            });

            const result = await ttsProvider.synthesizeSpeech({
                outputPath,
                text: line.text,
                voice
            });
            throwIfCancelled();
            completed += 1;
            emitForRun({
                current: completed,
                message: `已完成第 ${completed} / ${total} 条口播`,
                percent:
                    total > 0 ? Math.round((completed / total) * 100) : 100,
                text: line.text,
                total,
                type: 'voice.regeneration.progress'
            });

            segments.push({
                ...line,
                assetId: `voice_asset_${safeSceneId}_voice_regen_${safeRunId}_${padIndex(
                    line.lineIndex + 1
                )}`,
                durationMs: result.durationMs,
                endMs: 0,
                path: result.path,
                sceneId,
                startMs: 0
            });
        }

        synthesized.set(sceneId, segments);
    }

    return synthesized;
};

const createTimedScenes = ({
    project,
    segmentsBySceneId,
    voiceSpeed
}: {
    project: VideoProject;
    segmentsBySceneId: Map<string, VoiceSegment[]>;
    voiceSpeed: number;
}) => {
    const nextSegmentsBySceneId = new Map<string, VoiceSegment[]>();
    let cursorMs = 0;
    const scenes = [...project.scenes]
        .sort((left, right) => left.index - right.index)
        .map((scene) => {
            const sceneStartMs = cursorMs;
            const segments = segmentsBySceneId.get(scene.id) ?? [];
            if (segments.length === 0) {
                cursorMs += scene.durationMs;
                nextSegmentsBySceneId.set(scene.id, []);

                return scene;
            }

            const nextSegments = segments.map((segment) => {
                const startMs = cursorMs;
                const durationMs = Math.max(
                    1,
                    Math.round(segment.durationMs / voiceSpeed)
                );
                const endMs = startMs + durationMs;

                cursorMs = endMs;

                return {
                    ...segment,
                    endMs,
                    startMs
                };
            });
            const sceneEndMs = cursorMs;

            nextSegmentsBySceneId.set(scene.id, nextSegments);

            return {
                ...scene,
                durationMs: Math.max(1, sceneEndMs - sceneStartMs),
                subtitleIds: nextSegments.map((segment) => segment.subtitleId),
                voiceAssetId: nextSegments[0]?.assetId ?? scene.voiceAssetId
            };
        });

    return {
        scenes,
        segmentsBySceneId: nextSegmentsBySceneId,
        totalDurationMs: cursorMs
    };
};

const rebuildVideoClips = ({
    project,
    sceneTimings,
    voiceSpeed
}: {
    project: VideoProject;
    sceneTimings: Map<string, SceneTiming>;
    voiceSpeed: number;
}): VideoClip[] => {
    const videoTrack = getTrack(project.tracks, 'video');
    const videoAssetsById = new Map(
        project.assets.videos.map((asset) => [asset.id, asset])
    );

    return (videoTrack?.clips ?? []).filter(isVideoClip).map((clip) => {
        if (!clip.sceneId) return clip;

        const timing = sceneTimings.get(clip.sceneId);

        if (!timing) return clip;

        const sourceStartMs = clip.sourceStartMs;
        const assetDurationMs =
            videoAssetsById.get(clip.assetId)?.durationMs ??
            timing.endMs - timing.startMs;
        const sourceDurationMs = Math.max(1, assetDurationMs - sourceStartMs);
        const timelineDurationMs = timing.endMs - timing.startMs;

        return {
            ...clip,
            endMs: timing.endMs,
            sourceEndMs:
                sourceStartMs +
                Math.min(
                    sourceDurationMs,
                    Math.round(timelineDurationMs * voiceSpeed)
                ),
            speed: voiceSpeed,
            startMs: timing.startMs
        };
    });
};

const rebuildVoiceClips = ({
    input,
    segmentsBySceneId
}: {
    input: VideoAgentRegenerateVoicesInput;
    segmentsBySceneId: Map<string, VoiceSegment[]>;
}): VoiceClip[] => {
    const voiceSettings = normalizeVideoAgentVoiceSettings(input);

    return [...segmentsBySceneId.values()].flatMap((segments) =>
        segments.map((segment) => ({
            assetId: segment.assetId,
            endMs: segment.endMs,
            id: `voice_clip_${createSafeId(segment.sceneId)}_voice_regen_${padIndex(
                segment.lineIndex + 1
            )}`,
            kind: 'voice' as const,
            sceneId: segment.sceneId,
            speed: voiceSettings.voiceSpeed,
            startMs: segment.startMs,
            volume: voiceSettings.voiceVolume,
            voicePreset: input.selectedVoice
        }))
    );
};

const rebuildSubtitleClips = ({
    segmentsBySceneId
}: {
    segmentsBySceneId: Map<string, VoiceSegment[]>;
}): SubtitleClip[] =>
    [...segmentsBySceneId.values()].flatMap((segments) =>
        segments.map((segment) => ({
            endMs: segment.endMs,
            id:
                segment.subtitleClipId ??
                `subtitle_clip_${createSafeId(
                    segment.sceneId
                )}_voice_regen_${padIndex(segment.lineIndex + 1)}`,
            kind: 'subtitle' as const,
            sceneId: segment.sceneId,
            startMs: segment.startMs,
            styleId: segment.styleId,
            subtitleId: segment.subtitleId,
            text: segment.text
        }))
    );

const rebuildMusicClips = ({
    project,
    totalDurationMs
}: {
    project: VideoProject;
    totalDurationMs: number;
}): MusicClip[] => {
    const musicTrack = getTrack(project.tracks, 'music');
    const musicAssetsById = new Map(
        project.assets.music.map((asset) => [asset.id, asset])
    );

    return (musicTrack?.clips ?? []).filter(isMusicClip).map((clip) => ({
        ...clip,
        endMs: totalDurationMs,
        sourceEndMs: Math.min(
            musicAssetsById.get(clip.assetId)?.durationMs ?? totalDurationMs,
            totalDurationMs
        ),
        startMs: 0
    }));
};

const rebuildTracks = ({
    input,
    project,
    sceneTimings,
    segmentsBySceneId,
    totalDurationMs
}: {
    input: VideoAgentRegenerateVoicesInput;
    project: VideoProject;
    sceneTimings: Map<string, SceneTiming>;
    segmentsBySceneId: Map<string, VoiceSegment[]>;
    totalDurationMs: number;
}): TimelineTrack[] => {
    const voiceSettings = normalizeVideoAgentVoiceSettings(input);

    return project.tracks.map((track) => {
        if (track.kind === 'video') {
            return {
                ...track,
                clips: rebuildVideoClips({
                    project,
                    sceneTimings,
                    voiceSpeed: voiceSettings.voiceSpeed
                })
            };
        }

        if (track.kind === 'voice') {
            return {
                ...track,
                clips: rebuildVoiceClips({
                    input,
                    segmentsBySceneId
                })
            };
        }

        if (track.kind === 'subtitle') {
            return {
                ...track,
                clips: rebuildSubtitleClips({
                    segmentsBySceneId
                })
            };
        }

        return {
            ...track,
            clips: rebuildMusicClips({
                project,
                totalDurationMs
            })
        };
    });
};

export const regenerateVideoProjectVoices = async ({
    createRunId,
    emit,
    emitForRun: scopedEmitForRun,
    input,
    isCancelled,
    now,
    runId: providedRunId,
    store,
    ttsProvider,
    voiceOutputDirectory
}: VoiceRegenerationInput): Promise<VoiceRegenerationResult> => {
    const projectId = input.projectId.trim();
    const selectedVoice = input.selectedVoice.trim();

    if (!projectId) {
        throw new Error('缺少项目 ID');
    }

    if (!selectedVoice) {
        throw new Error('请选择音色');
    }

    const runId = providedRunId ?? createRunId();
    let sequence = 0;
    const emitForRun =
        scopedEmitForRun ??
        ((event: UnsequencedDesktopAgentRunEvent) => {
            sequence += 1;
            emit({
                ...event,
                createdAt: now(),
                runId,
                sequence
            } as DesktopAgentRunEvent);
        });
    const throwIfCancelled = () => {
        if (isCancelled?.()) {
            throw new VoiceRegenerationCancelledError();
        }
    };

    const loaded = await store.readProjectById({ projectId });

    if (loaded.success === false) {
        throw new Error(loaded.error.message);
    }

    throwIfCancelled();

    const project = loaded.data;
    const voiceSettings = normalizeVideoAgentVoiceSettings(input);
    const sourceScenes = [...project.scenes].sort(
        (left, right) => left.index - right.index
    );
    const linesBySceneId = new Map(
        sourceScenes.map((scene) => [
            scene.id,
            createSceneVoiceLines({ project, scene })
        ])
    );

    emitForRun({
        nodeName: 'voice_regeneration',
        type: 'node.started'
    });

    const synthesized = await synthesizeVoices({
        emitForRun,
        input: {
            ...input,
            selectedVoice
        },
        isCancelled,
        linesBySceneId,
        runId,
        ttsProvider,
        voiceOutputDirectory
    });
    throwIfCancelled();
    const timed = createTimedScenes({
        project,
        segmentsBySceneId: synthesized,
        voiceSpeed: voiceSettings.voiceSpeed
    });
    const sceneTimings = createSceneTimings([...timed.scenes]);

    emitForRun({
        nodeName: 'voice_regeneration',
        type: 'node.completed'
    });

    emitForRun({
        nodeName: 'project_save',
        type: 'node.started'
    });
    throwIfCancelled();

    const voiceTrack = getTrack(project.tracks, 'voice');
    const oldVoiceAssetIds = new Set([
        ...project.scenes.map((scene) => scene.voiceAssetId),
        ...(voiceTrack?.clips ?? [])
            .filter(isVoiceClip)
            .map((clip) => clip.assetId)
    ]);
    const generatedSubtitleAssets = [...timed.segmentsBySceneId.values()]
        .flat()
        .filter(
            (segment) =>
                !project.assets.subtitles.some(
                    (subtitle) => subtitle.id === segment.subtitleId
                )
        )
        .map((segment) => ({
            id: segment.subtitleId,
            styleId: segment.styleId,
            text: segment.text
        }));
    const nextProject: VideoProject = {
        ...project,
        assets: {
            ...project.assets,
            subtitles: [
                ...project.assets.subtitles,
                ...generatedSubtitleAssets
            ],
            voices: [
                ...project.assets.voices.filter(
                    (voice) => !oldVoiceAssetIds.has(voice.id)
                ),
                ...[...timed.segmentsBySceneId.values()]
                    .flat()
                    .map((segment) => ({
                        durationMs: segment.durationMs,
                        id: segment.assetId,
                        path: segment.path,
                        provider: 'volcengine-seed-tts',
                        voice:
                            input.selectedVoiceType ??
                            defaultVideoAgentVoice.voiceType
                    }))
            ]
        },
        canvas: {
            ...project.canvas,
            durationMs: timed.totalDurationMs
        },
        project: {
            ...project.project,
            updatedAt: now()
        },
        scenes: timed.scenes,
        tracks: rebuildTracks({
            input: {
                ...input,
                selectedVoice
            },
            project,
            sceneTimings,
            segmentsBySceneId: timed.segmentsBySceneId,
            totalDurationMs: timed.totalDurationMs
        })
    };
    const saved = await store.createProject({ project: nextProject });

    if (saved.success === false) {
        throw new Error(saved.error.message);
    }

    throwIfCancelled();

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

export { isVoiceRegenerationCancelled };
