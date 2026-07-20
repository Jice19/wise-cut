
import { writeFile } from 'node:fs/promises';
import path from 'node:path';

import type {
    SubtitleClip,
    VideoClip,
    VideoProject,
    VoiceClip
} from '@wise-cut/video-project';

import songCatalog from '../renderer/assets/song/song.json';
import type {
    VideoExportMusicSettings,
    VideoExportSubtitleSettings
} from '../shared/video-export';

type TrackClip = VideoProject['tracks'][number]['clips'][number];

type VideoExportAssetPathContext = {
    appPath: string;
    isPackaged: boolean;
    resourcesPath: string;
};

type ClipTimelineRange = {
    endMs: number;
    startMs: number;
};

type TimelineClipSegment<Clip extends TrackClip> = ClipTimelineRange & {
    clip: Clip;
    label: string;
};

type VoiceAsset = VideoProject['assets']['voices'][number];

type VoiceTimelineSegment = TimelineClipSegment<VoiceClip> & {
    inputIndex: number;
    sourceEndMs: number;
    sourceStartMs: number;
};

export type VideoExportFfmpegCommandInput = {
    bundledMusicPath?: string;
    ffmpegPath: string;
    musicSettings?: VideoExportMusicSettings;
    outputPath: string;
    project: VideoProject;
    subtitleSettings?: VideoExportSubtitleSettings;
    subtitleSrtPath?: string;
};

export type VideoExportFfmpegCommand = {
    args: string[];
    filterComplex: string;
    ffmpegPath: string;
};

const defaultSubtitleSettings: VideoExportSubtitleSettings = {
    fontSizePx: 24,
    isVisible: true,
    outlineColor: '#000000',
    textColor: '#FFFFFF'
};

const defaultMusicSettings: VideoExportMusicSettings = {
    enabled: true,
    selectedTrackId: 'song_01',
    volume: 0.6
};

const formatSongId = (order: number) =>
    `song_${String(order).padStart(2, '0')}`;

const bundledMusicById = new Map(
    songCatalog.items.map((item) => [formatSongId(item.order), item])
);

const msToSeconds = (timeMs: number) => timeMs / 1000;

const formatSeconds = (seconds: number) => {
    const normalized = Number.isFinite(seconds) ? Math.max(0, seconds) : 0;

    return Number(normalized.toFixed(3)).toString();
};

const sortClips = <Clip extends TrackClip>(clips: Clip[]) =>
    [...clips].sort((left, right) => left.startMs - right.startMs);

const createSceneTimelineRanges = (project: VideoProject) => {
    const ranges = new Map<string, ClipTimelineRange>();
    let cursorMs = 0;

    [...project.scenes]
        .sort((left, right) => left.index - right.index)
        .forEach((scene) => {
            const startMs = cursorMs;
            const endMs = startMs + Math.max(0, scene.durationMs);

            ranges.set(scene.id, {
                endMs,
                startMs
            });
            cursorMs = endMs;
        });

    return ranges;
};

const resolveTimelineRange = ({
    clip,
    sceneTimelineRanges
}: {
    clip: TrackClip;
    sceneTimelineRanges: Map<string, ClipTimelineRange>;
}): ClipTimelineRange => {
    const sceneId = 'sceneId' in clip ? clip.sceneId : undefined;
    const sceneRange = sceneId ? sceneTimelineRanges.get(sceneId) : undefined;

    if (!sceneRange) {
        return {
            endMs: clip.endMs,
            startMs: clip.startMs
        };
    }

    const isAlreadyGlobal = clip.startMs >= sceneRange.startMs;

    if (isAlreadyGlobal) {
        return {
            endMs: clip.endMs,
            startMs: clip.startMs
        };
    }

    return {
        endMs: sceneRange.startMs + clip.endMs,
        startMs: sceneRange.startMs + clip.startMs
    };
};

export const resolveVideoExportDurationMs = (project: VideoProject) => {
    const sceneDurationMs = project.scenes.reduce(
        (durationMs, scene) => durationMs + Math.max(0, scene.durationMs),
        0
    );
    const nonMusicTrackEndMs = project.tracks
        .filter((track) => track.kind !== 'music')
        .flatMap((track) => track.clips)
        .reduce((endMs, clip) => Math.max(endMs, clip.endMs), 0);
    const contentDurationMs = Math.max(sceneDurationMs, nonMusicTrackEndMs);

    return contentDurationMs > 0
        ? contentDurationMs
        : project.canvas.durationMs;
};

const getTrack = <Kind extends VideoProject['tracks'][number]['kind']>(
    project: VideoProject,
    kind: Kind
) => project.tracks.find((track) => track.kind === kind);

const getVideoClips = (project: VideoProject) =>
    sortClips(
        (getTrack(project, 'video')?.clips ?? []).filter(
            (clip): clip is VideoClip => clip.kind === 'video'
        )
    );

const getVoiceClips = (project: VideoProject) =>
    sortClips(
        (getTrack(project, 'voice')?.clips ?? []).filter(
            (clip): clip is VoiceClip => clip.kind === 'voice'
        )
    );

const getSubtitleClips = (project: VideoProject) =>
    sortClips(
        (getTrack(project, 'subtitle')?.clips ?? []).filter(
            (clip): clip is SubtitleClip => clip.kind === 'subtitle'
        )
    );

const escapeSubtitleFilterPath = (filePath: string) =>
    filePath
        .replaceAll('\\', '/')
        .replace(/^([A-Za-z]):/, '$1\\:')
        .replaceAll("'", "\\'");

const hexToAssColor = (hexColor: string) => {
    const normalized = hexColor.replace('#', '');

    if (!/^[0-9a-fA-F]{6}$/.test(normalized)) return '&H00FFFFFF';

    const red = normalized.slice(0, 2);
    const green = normalized.slice(2, 4);
    const blue = normalized.slice(4, 6);

    return `&H00${blue}${green}${red}`.toUpperCase();
};

const resolveSubtitleFontName = () => {
    if (process.platform === 'win32') return 'Microsoft YaHei';
    if (process.platform === 'darwin') return 'PingFang SC';

    return 'Source Han Sans SC';
};

const resolveSubtitleOutlineWidth = (fontSizePx: number) => {
    if (fontSizePx <= 18) return 1;
    if (fontSizePx <= 28) return 1.5;

    return 2;
};

const createSubtitleForceStyle = (settings: VideoExportSubtitleSettings) =>
    [
        `FontName=${resolveSubtitleFontName()}`,
        `FontSize=${settings.fontSizePx}`,
        'Bold=1',
        `PrimaryColour=${hexToAssColor(settings.textColor)}`,
        `OutlineColour=${hexToAssColor(settings.outlineColor)}`,
        'BorderStyle=1',
        `Outline=${resolveSubtitleOutlineWidth(settings.fontSizePx)}`,
        'Shadow=0',
        'Alignment=2',
        'MarginV=33'
    ].join(',');

const createAtempoFilter = (speed = 1) =>
    `atempo=${formatSeconds(Math.min(Math.max(speed, 0.5), 2))}`;

const clampPlaybackSpeed = (speed = 1) => Math.min(Math.max(speed, 0.5), 2);

const toSrtTimestamp = (timeMs: number) => {
    const totalMs = Math.max(0, Math.round(timeMs));
    const hours = Math.floor(totalMs / 3_600_000);
    const minutes = Math.floor((totalMs % 3_600_000) / 60_000);
    const seconds = Math.floor((totalMs % 60_000) / 1000);
    const milliseconds = totalMs % 1000;

    return `${String(hours).padStart(2, '0')}:${String(minutes).padStart(
        2,
        '0'
    )}:${String(seconds).padStart(2, '0')},${String(milliseconds).padStart(
        3,
        '0'
    )}`;
};

export const resolveBundledMusicFilePath = ({
    appPath,
    isPackaged,
    resourcesPath,
    selectedTrackId
}: VideoExportAssetPathContext & {
    selectedTrackId: string;
}) => {
    const item = bundledMusicById.get(selectedTrackId);

    if (!item) return undefined;

    return path.join(
        isPackaged ? resourcesPath : path.join(appPath, 'renderer/assets'),
        'song',
        item.fileName
    );
};

export const writeVideoExportSubtitleSrt = async ({
    outputPath,
    project
}: {
    outputPath: string;
    project: VideoProject;
}) => {
    const subtitleAssetsById = new Map(
        project.assets.subtitles.map((asset) => [asset.id, asset])
    );
    const sceneTimelineRanges = createSceneTimelineRanges(project);
    const content = getSubtitleClips(project)
        .map((clip, index) => {
            const text =
                subtitleAssetsById.get(clip.subtitleId)?.text ?? clip.text;
            const range = resolveTimelineRange({
                clip,
                sceneTimelineRanges
            });

            return [
                String(index + 1),
                `${toSrtTimestamp(range.startMs)} --> ${toSrtTimestamp(
                    range.endMs
                )}`,
                text,
                ''
            ].join('\n');
        })
        .join('\n');

    await writeFile(outputPath, content, 'utf8');
};

const pushVideoClipFilter = ({
    endMs,
    filters,
    inputIndex,
    label,
    loops,
    project,
    startMs,
    videoClip
}: {
    endMs: number;
    filters: string[];
    inputIndex: number;
    label: string;
    /**
     * When true, the caller added `-stream_loop -1` for this input so
     * ffmpeg can replay the source indefinitely. Skip the tpad fallback
     * because looping frames are real motion, not cloned last frames.
     */
    loops: boolean;
    project: VideoProject;
    startMs: number;
    videoClip: VideoClip;
}) => {
    const timelineDurationSec = msToSeconds(endMs - startMs);
    const sourceStartSec = msToSeconds(videoClip.sourceStartMs);
    const sourceEndSec = msToSeconds(videoClip.sourceEndMs);
    const speed = videoClip.speed ?? 1;
    const playbackSourceDurationSec =
        Math.max(0.001, sourceEndSec - sourceStartSec) / speed;
    const freezeDurationSec = loops
        ? 0
        : Math.max(0, timelineDurationSec - playbackSourceDurationSec);

    if (loops) {
        // For looped inputs we cannot use `trim=end=sourceEndSec`
        // because that filter caps the output at the first iteration
        // and ignores the rest. Instead, skip the source to
        // `sourceStartSec` via a setpts offset (so the loop starts at
        // the requested offset) and let `-stream_loop -1` replay the
        // source naturally until the outer trim cuts at the scene
        // duration. No tpad is needed because the source never ends.
        filters.push(
            [
                `[${inputIndex}:v]setpts=PTS-STARTPTS+${formatSeconds(
                    sourceStartSec
                )}/TB`,
                `setpts=${formatSeconds(1 / speed)}*(PTS-STARTPTS)`,
                `scale=${project.canvas.width}:${project.canvas.height}:force_original_aspect_ratio=increase`,
                `crop=${project.canvas.width}:${project.canvas.height}`,
                'setsar=1',
                `fps=${project.canvas.fps}`,
                `trim=duration=${formatSeconds(timelineDurationSec)}`,
                `setpts=PTS-STARTPTS[${label}]`
            ].join(',')
        );
        return;
    }

    filters.push(
        [
            `[${inputIndex}:v]trim=start=${formatSeconds(
                sourceStartSec
            )}:end=${formatSeconds(sourceEndSec)}`,
            `setpts=${formatSeconds(1 / speed)}*(PTS-STARTPTS)`,
            `scale=${project.canvas.width}:${project.canvas.height}:force_original_aspect_ratio=increase`,
            `crop=${project.canvas.width}:${project.canvas.height}`,
            'setsar=1',
            `fps=${project.canvas.fps}`,
            `tpad=stop_mode=clone:stop_duration=${formatSeconds(
                freezeDurationSec
            )}`,
            `trim=duration=${formatSeconds(timelineDurationSec)}`,
            `setpts=PTS-STARTPTS[${label}]`
        ].join(',')
    );
};

const pushVideoTimelineFilter = ({
    durationMs,
    filters,
    project,
    videoSegments
}: {
    durationMs: number;
    filters: string[];
    project: VideoProject;
    videoSegments: TimelineClipSegment<VideoClip>[];
}) => {
    const timelineLabels: string[] = [];
    const projectDurationMs = Math.max(0, durationMs);
    let cursorMs = 0;
    let gapIndex = 0;

    const pushGap = (durationMs: number) => {
        const label = `vgap${gapIndex}`;

        gapIndex += 1;
        filters.push(
            `color=c=black:s=${project.canvas.width}x${
                project.canvas.height
            }:r=${project.canvas.fps}:d=${formatSeconds(
                msToSeconds(durationMs)
            )}[${label}]`
        );
        timelineLabels.push(`[${label}]`);
    };

    videoSegments.forEach(({ endMs, label, startMs }) => {
        const clipStartMs = Math.min(Math.max(startMs, 0), projectDurationMs);
        const clipEndMs = Math.min(Math.max(endMs, 0), projectDurationMs);

        if (clipEndMs <= clipStartMs) return;

        if (clipStartMs > cursorMs) {
            pushGap(clipStartMs - cursorMs);
            cursorMs = clipStartMs;
        }

        timelineLabels.push(`[${label}]`);
        cursorMs = Math.max(cursorMs, clipEndMs);
    });

    if (cursorMs < projectDurationMs) {
        pushGap(projectDurationMs - cursorMs);
    }

    if (timelineLabels.length === 0) {
        pushGap(Math.max(projectDurationMs, 1));
    }

    filters.push(
        `${timelineLabels.join('')}concat=n=${
            timelineLabels.length
        }:v=1:a=0[vconcat]`
    );
};

const pushVoiceFilters = ({
    endMs,
    filters,
    inputIndex,
    label,
    sourceEndMs,
    sourceStartMs,
    startMs,
    voiceClip
}: {
    endMs: number;
    filters: string[];
    inputIndex: number;
    label: string;
    sourceEndMs: number;
    sourceStartMs: number;
    startMs: number;
    voiceClip: VoiceClip;
}) => {
    const timelineDurationSec = formatSeconds(msToSeconds(endMs - startMs));

    filters.push(
        [
            `[${inputIndex}:a]atrim=start=${formatSeconds(
                msToSeconds(sourceStartMs)
            )}:end=${formatSeconds(msToSeconds(sourceEndMs))}`,
            'asetpts=PTS-STARTPTS',
            createAtempoFilter(voiceClip.speed),
            `apad=whole_dur=${timelineDurationSec}`,
            `atrim=duration=${timelineDurationSec}`,
            'asetpts=PTS-STARTPTS',
            `volume=${formatSeconds(voiceClip.volume ?? 1)}`,
            `asetpts=PTS-STARTPTS[${label}]`
        ].join(',')
    );
};

const pushVoiceTimelineFilter = ({
    durationMs,
    filters,
    voiceSegments
}: {
    durationMs: number;
    filters: string[];
    voiceSegments: VoiceTimelineSegment[];
}) => {
    if (voiceSegments.length === 0) return undefined;

    const timelineLabels: string[] = [];
    const projectDurationMs = Math.max(0, durationMs);
    let cursorMs = 0;
    let gapIndex = 0;

    const pushGap = (durationMs: number) => {
        if (durationMs <= 0) return;

        const label = `voicegap${gapIndex}`;

        gapIndex += 1;
        filters.push(
            `anullsrc=channel_layout=stereo:sample_rate=48000,atrim=duration=${formatSeconds(
                msToSeconds(durationMs)
            )},asetpts=PTS-STARTPTS[${label}]`
        );
        timelineLabels.push(`[${label}]`);
    };

    [...voiceSegments]
        .sort((left, right) => left.startMs - right.startMs)
        .forEach(({ endMs, label, startMs }) => {
            const clipStartMs = Math.min(
                Math.max(startMs, 0),
                projectDurationMs
            );
            const clipEndMs = Math.min(Math.max(endMs, 0), projectDurationMs);

            if (clipEndMs <= clipStartMs) return;

            if (clipStartMs > cursorMs) {
                pushGap(clipStartMs - cursorMs);
                cursorMs = clipStartMs;
            }

            timelineLabels.push(`[${label}]`);
            cursorMs = Math.max(cursorMs, clipEndMs);
        });

    if (cursorMs < projectDurationMs) {
        pushGap(projectDurationMs - cursorMs);
    }

    if (timelineLabels.length === 0) return undefined;

    if (timelineLabels.length === 1) {
        filters.push(`${timelineLabels[0]}anull[voiceTimeline]`);
    } else {
        filters.push(
            `${timelineLabels.join('')}concat=n=${
                timelineLabels.length
            }:v=0:a=1[voiceTimeline]`
        );
    }

    return '[voiceTimeline]';
};

const pushMusicFilter = ({
    durationMs,
    filters,
    inputIndex,
    label,
    musicSettings
}: {
    durationMs: number;
    filters: string[];
    inputIndex: number;
    label: string;
    musicSettings: VideoExportMusicSettings;
}) => {
    filters.push(
        [
            `[${inputIndex}:a]asetpts=PTS-STARTPTS`,
            `atrim=duration=${formatSeconds(msToSeconds(durationMs))}`,
            'asetpts=PTS-STARTPTS',
            `volume=${formatSeconds(musicSettings.volume)}`,
            'afade=t=in:st=0:d=1.2',
            `afade=t=out:st=${formatSeconds(
                Math.max(0, msToSeconds(durationMs) - 1.8)
            )}:d=1.8[${label}]`
        ].join(',')
    );
};

const shouldUseTimelineSourceOffsets = ({
    asset,
    durationMs,
    segments
}: {
    asset: VoiceAsset;
    durationMs: number;
    segments: TimelineClipSegment<VoiceClip>[];
}) =>
    asset.durationMs >= durationMs * 0.9 &&
    segments.length > 1 &&
    segments.every((segment) => clampPlaybackSpeed(segment.clip.speed) === 1);

const resolveVoiceSourceRanges = ({
    asset,
    durationMs,
    segments
}: {
    asset: VoiceAsset;
    durationMs: number;
    segments: TimelineClipSegment<VoiceClip>[];
}) => {
    const useTimelineOffsets = shouldUseTimelineSourceOffsets({
        asset,
        durationMs,
        segments
    });
    let sourceCursorMs = 0;

    return segments.map((segment) => {
        const segmentDurationMs = Math.max(0, segment.endMs - segment.startMs);
        const sourceDurationMs = Math.ceil(
            segmentDurationMs * clampPlaybackSpeed(segment.clip.speed)
        );
        const sourceStartMs = useTimelineOffsets
            ? segment.startMs
            : sourceCursorMs;
        const sourceEndMs = Math.min(
            asset.durationMs,
            sourceStartMs + sourceDurationMs
        );

        sourceCursorMs = sourceEndMs;

        return {
            ...segment,
            sourceEndMs,
            sourceStartMs
        };
    });
};

export const createVideoExportFfmpegCommand = ({
    bundledMusicPath,
    ffmpegPath,
    musicSettings = defaultMusicSettings,
    outputPath,
    project,
    subtitleSettings = defaultSubtitleSettings,
    subtitleSrtPath
}: VideoExportFfmpegCommandInput): VideoExportFfmpegCommand => {
    const videoAssetsById = new Map(
        project.assets.videos.map((asset) => [asset.id, asset])
    );
    const voiceAssetsById = new Map(
        project.assets.voices.map((asset) => [asset.id, asset])
    );
    const videoClips = getVideoClips(project);
    const voiceClips = getVoiceClips(project);
    const sceneTimelineRanges = createSceneTimelineRanges(project);
    const durationMs = resolveVideoExportDurationMs(project);
    const filters: string[] = [];
    const args: string[] = ['-y', '-hide_banner', '-progress', 'pipe:2'];
    const videoSegments: TimelineClipSegment<VideoClip>[] = [];
    const voiceSegmentsByAssetId = new Map<
        string,
        TimelineClipSegment<VoiceClip>[]
    >();
    const voiceAssetInputById = new Map<string, number>();
    const voiceTimelineSegments: VoiceTimelineSegment[] = [];
    const audioLabels: string[] = [];
    let inputIndex = 0;

    videoClips.forEach((clip, index) => {
        const asset = videoAssetsById.get(clip.assetId);
        const range = resolveTimelineRange({
            clip,
            sceneTimelineRanges
        });

        if (!asset) return;

        // If the source window is shorter than the scene timeline, loop
        // the input so ffmpeg has frames to fill the gap instead of
        // cloning the last frame via tpad=stop_mode=clone. The trim
        // filter downstream still bounds playback to sourceEndMs per
        // iteration (and the timeline filter caps total duration).
        const clipSourceMs = clip.sourceEndMs - clip.sourceStartMs;
        const sceneDurationMs = range.endMs - range.startMs;
        const needsLoop = clipSourceMs < sceneDurationMs;

        if (needsLoop) {
            args.push('-stream_loop', '-1');
        }
        args.push('-i', asset.path);
        pushVideoClipFilter({
            endMs: range.endMs,
            filters,
            inputIndex,
            label: `v${index}`,
            loops: needsLoop,
            project,
            startMs: range.startMs,
            videoClip: clip
        });
        videoSegments.push({
            clip,
            endMs: range.endMs,
            label: `v${index}`,
            startMs: range.startMs
        });
        inputIndex += 1;
    });

    voiceClips.forEach((clip) => {
        const range = resolveTimelineRange({
            clip,
            sceneTimelineRanges
        });
        const segments = voiceSegmentsByAssetId.get(clip.assetId) ?? [];

        segments.push({
            clip,
            endMs: range.endMs,
            label: '',
            startMs: range.startMs
        });
        voiceSegmentsByAssetId.set(clip.assetId, segments);
    });

    Array.from(voiceSegmentsByAssetId.entries()).forEach(
        ([assetId, segments]) => {
            const asset = voiceAssetsById.get(assetId);

            if (!asset) return;

            const existingInputIndex = voiceAssetInputById.get(asset.id);
            const voiceInputIndex = existingInputIndex ?? inputIndex;

            if (typeof existingInputIndex !== 'number') {
                args.push('-i', asset.path);
                voiceAssetInputById.set(asset.id, voiceInputIndex);
                inputIndex += 1;
            }

            resolveVoiceSourceRanges({
                asset,
                durationMs,
                segments: [...segments].sort(
                    (left, right) => left.startMs - right.startMs
                )
            }).forEach((segment) => {
                const label = `voice${voiceTimelineSegments.length}`;

                pushVoiceFilters({
                    endMs: segment.endMs,
                    filters,
                    inputIndex: voiceInputIndex,
                    label,
                    sourceEndMs: segment.sourceEndMs,
                    sourceStartMs: segment.sourceStartMs,
                    startMs: segment.startMs,
                    voiceClip: segment.clip
                });
                voiceTimelineSegments.push({
                    ...segment,
                    inputIndex: voiceInputIndex,
                    label
                });
            });
        }
    );

    const voiceTimelineLabel = pushVoiceTimelineFilter({
        durationMs,
        filters,
        voiceSegments: voiceTimelineSegments
    });

    if (voiceTimelineLabel) {
        audioLabels.push(voiceTimelineLabel);
    }

    if (musicSettings.enabled && bundledMusicPath) {
        args.push('-stream_loop', '-1', '-i', bundledMusicPath);
        pushMusicFilter({
            durationMs,
            filters,
            inputIndex,
            label: 'music0',
            musicSettings
        });
        audioLabels.push('[music0]');
        inputIndex += 1;
    }

    pushVideoTimelineFilter({
        durationMs,
        filters,
        project,
        videoSegments
    });

    const shouldBurnSubtitles = subtitleSettings.isVisible && subtitleSrtPath;

    if (shouldBurnSubtitles) {
        filters.push(
            `[vconcat]subtitles='${escapeSubtitleFilterPath(
                subtitleSrtPath
            )}':force_style='${createSubtitleForceStyle(
                subtitleSettings
            )}',format=yuv420p[vout]`
        );
    } else {
        filters.push('[vconcat]format=yuv420p[vout]');
    }

    if (audioLabels.length > 0) {
        filters.push(
            `${audioLabels.join('')}amix=inputs=${
                audioLabels.length
            }:duration=longest:normalize=0,atrim=duration=${formatSeconds(
                msToSeconds(durationMs)
            )},asetpts=PTS-STARTPTS[aout]`
        );
    } else {
        filters.push(
            `anullsrc=channel_layout=stereo:sample_rate=48000,atrim=duration=${formatSeconds(
                msToSeconds(durationMs)
            )},asetpts=PTS-STARTPTS[aout]`
        );
    }

    const filterComplex = filters.join(';');

    args.push(
        '-filter_complex',
        filterComplex,
        '-map',
        '[vout]',
        '-map',
        '[aout]',
        '-c:v',
        'libx264',
        '-preset',
        'medium',
        '-crf',
        '20',
        '-pix_fmt',
        'yuv420p',
        '-c:a',
        'aac',
        '-b:a',
        '192k',
        '-movflags',
        '+faststart',
        '-t',
        formatSeconds(msToSeconds(durationMs)),
        outputPath
    );

    return {
        args,
        ffmpegPath,
        filterComplex
    };
};
