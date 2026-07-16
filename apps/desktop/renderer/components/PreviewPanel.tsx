
import { useEffect, useRef } from 'react';

import type {
    EditorIconName,
    PreviewData,
    PreviewMusicCue,
    PreviewSegment,
    PreviewSubtitleCue,
    PreviewVoiceCue
} from '../types/editor-screen';

import { Icon } from './Icon';

const formatTwoDigits = (value: number) => String(value).padStart(2, '0');

const findActivePreviewSegment = ({
    currentTimeMs,
    segments
}: {
    currentTimeMs: number;
    segments: PreviewSegment[];
}) =>
    segments.find(
        (segment) =>
            currentTimeMs >= segment.startMs && currentTimeMs < segment.endMs
    ) ?? segments[segments.length - 1];

const findActiveSubtitleCue = ({
    currentTimeMs,
    segment
}: {
    currentTimeMs: number;
    segment?: PreviewSegment;
}): PreviewSubtitleCue | undefined =>
    segment?.subtitleCues.find(
        (cue) => currentTimeMs >= cue.startMs && currentTimeMs < cue.endMs
    );

const findActiveVoiceCue = ({
    currentTimeMs,
    segment
}: {
    currentTimeMs: number;
    segment?: PreviewSegment;
}): PreviewVoiceCue | undefined =>
    segment?.voiceCues?.find(
        (cue) => currentTimeMs >= cue.startMs && currentTimeMs < cue.endMs
    );

const getPreviewMusicLocalTimeMs = ({
    currentTimeMs,
    music
}: {
    currentTimeMs: number;
    music?: PreviewMusicCue;
}) => {
    if (!music || music.durationMs <= 0) return currentTimeMs;

    return currentTimeMs % music.durationMs;
};

const clampPreviewPlaybackRate = (playbackRate?: number) =>
    Math.min(Math.max(playbackRate ?? 1, 0.5), 2);

export const getPreviewSegmentLocalTimeMs = ({
    currentTimeMs,
    segment
}: {
    currentTimeMs: number;
    segment?: PreviewSegment;
}) => {
    if (!segment) return currentTimeMs;

    const playbackRate = clampPreviewPlaybackRate(segment.playbackRate);
    const localTimeMs =
        segment.sourceStartMs +
        Math.max(0, currentTimeMs - segment.startMs) * playbackRate;

    return Math.min(
        Math.max(localTimeMs, segment.sourceStartMs),
        segment.sourceEndMs
    );
};

export const isPreviewSegmentSourceExhausted = ({
    currentTimeMs,
    segment
}: {
    currentTimeMs: number;
    segment?: PreviewSegment;
}) => {
    if (!segment) return false;

    const sourceDurationMs = Math.max(
        0,
        segment.sourceEndMs - segment.sourceStartMs
    );
    const playbackRate = clampPreviewPlaybackRate(segment.playbackRate);

    return currentTimeMs - segment.startMs >= sourceDurationMs / playbackRate;
};

export const createPreviewTimeUpdate = ({
    currentTimeMs,
    nextLocalTimeMs,
    segment
}: {
    currentTimeMs: number;
    nextLocalTimeMs: number;
    segment?: PreviewSegment;
}) => {
    const playbackRate = clampPreviewPlaybackRate(segment?.playbackRate);
    const nextGlobalTimeMs = segment
        ? segment.startMs +
          Math.max(0, nextLocalTimeMs - segment.sourceStartMs) / playbackRate
        : nextLocalTimeMs;
    const clampedTimeMs = segment
        ? Math.min(Math.max(nextGlobalTimeMs, segment.startMs), segment.endMs)
        : Math.max(0, nextGlobalTimeMs);

    return Math.max(currentTimeMs, clampedTimeMs);
};

const syncMediaCurrentTime = ({
    element,
    force = false,
    timeMs
}: {
    element: HTMLMediaElement | null;
    force?: boolean;
    timeMs: number;
}) => {
    if (!element) return;

    const nextCurrentTime = timeMs / 1000;

    if (force || Math.abs(element.currentTime - nextCurrentTime) > 0.3) {
        element.currentTime = nextCurrentTime;
    }
};

const syncMediaPlaybackSettings = ({
    element,
    playbackRate
}: {
    element: HTMLMediaElement | null;
    playbackRate?: number;
}) => {
    if (!element) return;

    element.playbackRate = clampPreviewPlaybackRate(playbackRate);
};

const syncAudioPlaybackSettings = ({
    element,
    playbackRate,
    volume
}: {
    element: HTMLAudioElement | null;
    playbackRate?: number;
    volume?: number;
}) => {
    if (!element) return;

    element.volume = Math.min(Math.max(volume ?? 1, 0), 1);
    syncMediaPlaybackSettings({
        element,
        playbackRate
    });
};

export const createPreviewVoicePlaybackKey = ({
    cueId,
    playbackRate,
    source
}: {
    cueId?: string;
    playbackRate?: number;
    source?: string;
}) => {
    if (!source) return '';

    return [source, cueId ?? 'segment', playbackRate ?? 1].join('|');
};

const createPreviewSubtitleStyle = (style?: PreviewSubtitleCue['style']) => {
    if (!style) return undefined;

    const outlineWidthPx =
        style.fontSizePx <= 18 ? 1 : style.fontSizePx <= 28 ? 1.5 : 2;

    return {
        WebkitTextStroke: `${outlineWidthPx}px ${style.outlineColor}`,
        color: style.textColor,
        fontSize: `${style.fontSizePx}px`,
        textShadow: `0 ${outlineWidthPx}px ${
            outlineWidthPx * 2
        }px ${style.outlineColor}, 0 0 10px rgba(0, 0, 0, 0.45)`
    };
};

const formatPreviewTimecode = ({
    currentTimeMs,
    durationMs
}: {
    currentTimeMs: number;
    durationMs: number;
}) => {
    const formatTime = (timeMs: number) => {
        const totalSeconds = Math.floor(timeMs / 1000);
        const hours = Math.floor(totalSeconds / 3600);
        const minutes = Math.floor((totalSeconds % 3600) / 60);
        const seconds = totalSeconds % 60;

        return `${formatTwoDigits(hours)}:${formatTwoDigits(minutes)}:${formatTwoDigits(seconds)}`;
    };

    return `${formatTime(currentTimeMs)} / ${formatTime(durationMs)}`;
};

const PreviewToolButton = ({
    label,
    icon
}: {
    label: string;
    icon: EditorIconName;
}) => {
    return (
        <button
            type="button"
            aria-label={label}
            className="grid h-9 w-9 place-items-center rounded-full bg-[#1A1D22] text-[#A9AFBA]"
        >
            <Icon name={icon} className="h-[18px] w-[18px]" />
        </button>
    );
};

const PreviewControlBar = ({
    currentTimeMs,
    durationMs,
    isPlaying,
    onTogglePlayback
}: {
    currentTimeMs: number;
    durationMs: number;
    isPlaying: boolean;
    onTogglePlayback?: () => void;
}) => {
    return (
        <div className="grid h-[58px] w-full grid-cols-[1fr_40px_1fr] items-end">
            <span className="font-['Geist_Mono'] text-sm font-semibold text-[#A9AFBA]">
                {formatPreviewTimecode({ currentTimeMs, durationMs })}
            </span>
            <button
                type="button"
                aria-label={isPlaying ? '暂停预览' : '播放预览'}
                onClick={onTogglePlayback}
                className="grid h-10 w-10 place-items-center rounded-full bg-[#F05F73] text-white"
            >
                <Icon name={isPlaying ? 'pause' : 'play'} className="h-6 w-6" />
            </button>
            <div className="flex h-10 w-[88px] items-center justify-end gap-3 justify-self-end">
                <PreviewToolButton label="预览音量" icon="volume" />
                <PreviewToolButton label="放大预览" icon="maximize" />
            </div>
        </div>
    );
};

export const PreviewPanel = ({
    currentTimeMs = 0,
    data,
    isPlaying = false,
    onTogglePlayback
}: {
    currentTimeMs?: number;
    data: PreviewData;
    isPlaying?: boolean;
    onTogglePlayback?: () => void;
}) => {
    const audioRef = useRef<HTMLAudioElement>(null);
    const musicAudioRef = useRef<HTMLAudioElement>(null);
    const videoRef = useRef<HTMLVideoElement>(null);
    const music = data.music;
    const activeSegment =
        data.type === 'video'
            ? findActivePreviewSegment({
                  currentTimeMs,
                  segments: data.segments
              })
            : undefined;
    const activeSubtitle = findActiveSubtitleCue({
        currentTimeMs,
        segment: activeSegment
    });
    const activeVoiceCue = findActiveVoiceCue({
        currentTimeMs,
        segment: activeSegment
    });
    const mediaSource =
        data.type === 'video'
            ? (activeSegment?.source ?? data.source)
            : data.source;
    const posterSource =
        data.type === 'video'
            ? (activeSegment?.posterSource ?? data.posterSource)
            : undefined;
    const voiceSource = activeVoiceCue?.source ?? activeSegment?.voiceSource;
    const voiceVolume = activeVoiceCue?.volume;
    const videoPlaybackRate = activeSegment?.playbackRate;
    const voicePlaybackRate =
        activeVoiceCue?.playbackRate ?? activeSegment?.playbackRate;
    const voicePlaybackKey = createPreviewVoicePlaybackKey({
        cueId: activeVoiceCue?.id,
        playbackRate: voicePlaybackRate,
        source: voiceSource
    });
    const localTimeMs = getPreviewSegmentLocalTimeMs({
        currentTimeMs,
        segment: activeSegment
    });
    const voiceLocalTimeMs = activeVoiceCue
        ? Math.max(0, currentTimeMs - activeVoiceCue.startMs) *
          clampPreviewPlaybackRate(voicePlaybackRate)
        : localTimeMs;
    const musicLocalTimeMs = getPreviewMusicLocalTimeMs({
        currentTimeMs,
        music
    });
    const isVideoSourceExhausted = isPreviewSegmentSourceExhausted({
        currentTimeMs,
        segment: activeSegment
    });

    useEffect(() => {
        const audio = audioRef.current;

        return () => {
            audio?.pause();
        };
    }, [voicePlaybackKey]);

    useEffect(() => {
        const audio = musicAudioRef.current;

        return () => {
            audio?.pause();
        };
    }, [music?.source]);

    useEffect(() => {
        syncMediaCurrentTime({
            element: videoRef.current,
            timeMs: localTimeMs
        });
        syncMediaPlaybackSettings({
            element: videoRef.current,
            playbackRate: videoPlaybackRate
        });
        syncMediaCurrentTime({
            element: audioRef.current,
            timeMs: voiceLocalTimeMs
        });
        syncAudioPlaybackSettings({
            element: audioRef.current,
            playbackRate: voicePlaybackRate,
            volume: voiceVolume
        });
        syncMediaCurrentTime({
            element: musicAudioRef.current,
            timeMs: musicLocalTimeMs
        });
        syncAudioPlaybackSettings({
            element: musicAudioRef.current,
            volume: music?.volume
        });
    }, [
        localTimeMs,
        mediaSource,
        music?.source,
        music?.volume,
        musicLocalTimeMs,
        videoPlaybackRate,
        voiceLocalTimeMs,
        voicePlaybackRate,
        voicePlaybackKey,
        voiceVolume
    ]);

    useEffect(() => {
        const audio = musicAudioRef.current;

        if (isPlaying) {
            void audio?.play().catch((): void => undefined);
            return;
        }

        audio?.pause();
    }, [isPlaying, music?.source, music?.volume, musicLocalTimeMs]);

    useEffect(() => {
        const video = videoRef.current;
        const audio = audioRef.current;

        if (isPlaying && !isVideoSourceExhausted) {
            void video?.play().catch((): void => undefined);
            void audio?.play().catch((): void => undefined);
            return;
        }

        video?.pause();
        syncMediaCurrentTime({
            element: video,
            force: true,
            timeMs: localTimeMs
        });

        if (isPlaying) {
            void audio?.play().catch((): void => undefined);
            return;
        }

        audio?.pause();
    }, [
        isPlaying,
        isVideoSourceExhausted,
        localTimeMs,
        mediaSource,
        voicePlaybackKey,
        voicePlaybackRate,
        voiceVolume
    ]);

    return (
        <section
            className="grid min-h-0 grid-rows-[minmax(0,1fr)_58px] gap-2 border-r border-[#2A2F38] bg-[#101116] p-[16px_16px_8px]"
            aria-label="视频预览"
        >
            <div className="relative mx-auto h-full max-h-[567px] min-h-[300px] w-full max-w-[1162px] self-end overflow-hidden rounded-xl bg-[radial-gradient(circle_at_50%_42%,#1A2430_0%,#080B10_58%,#050609_100%)] shadow-[0_4px_12px_rgba(0,0,0,0.35)]">
                {data.type === 'video' ? (
                    <>
                        <video
                            key={mediaSource}
                            ref={videoRef}
                            data-preview-video-playback-rate={
                                videoPlaybackRate ?? 1
                            }
                            data-preview-source="project-video"
                            src={mediaSource}
                            poster={posterSource}
                            aria-label={activeSegment?.alt ?? data.alt}
                            className="absolute inset-0 h-full w-full object-cover"
                            muted
                            playsInline
                            preload="metadata"
                            onLoadedMetadata={(event) => {
                                syncMediaCurrentTime({
                                    element: event.currentTarget,
                                    timeMs: localTimeMs
                                });
                                syncMediaPlaybackSettings({
                                    element: event.currentTarget,
                                    playbackRate: videoPlaybackRate
                                });
                            }}
                        />
                        {voiceSource ? (
                            <audio
                                key={voicePlaybackKey}
                                ref={audioRef}
                                data-preview-voice-key={voicePlaybackKey}
                                data-preview-voice-playback-rate={
                                    voicePlaybackRate ?? 1
                                }
                                src={voiceSource}
                                preload="metadata"
                                onLoadedMetadata={(event) => {
                                    syncMediaCurrentTime({
                                        element: event.currentTarget,
                                        timeMs: voiceLocalTimeMs
                                    });
                                    syncAudioPlaybackSettings({
                                        element: event.currentTarget,
                                        playbackRate: voicePlaybackRate,
                                        volume: voiceVolume
                                    });
                                }}
                            />
                        ) : null}
                        {activeSubtitle ? (
                            <div
                                data-preview-subtitle-layer="true"
                                className="absolute inset-x-0 bottom-[50px] flex justify-center"
                            >
                                <p
                                    data-preview-subtitle="true"
                                    data-preview-subtitle-preset={
                                        activeSubtitle.style?.presetLabel
                                    }
                                    className="inline-block max-w-[80%] break-words rounded bg-black/45 px-3 py-1 text-center text-[24px] font-semibold leading-[1.45] text-white shadow-[0_4px_12px_rgba(0,0,0,0.35)]"
                                    style={createPreviewSubtitleStyle(
                                        activeSubtitle.style
                                    )}
                                >
                                    {activeSubtitle.text}
                                </p>
                            </div>
                        ) : null}
                    </>
                ) : (
                    <img
                        data-preview-source="fallback-image"
                        src={mediaSource}
                        alt={data.alt}
                        className="absolute inset-0 h-full w-full object-cover"
                    />
                )}
                {music ? (
                    <audio
                        key={music.source}
                        ref={musicAudioRef}
                        data-preview-music="true"
                        data-preview-music-title={music.title}
                        data-preview-music-volume={music.volume}
                        src={music.source}
                        preload="metadata"
                        onLoadedMetadata={(event) => {
                            syncMediaCurrentTime({
                                element: event.currentTarget,
                                timeMs: musicLocalTimeMs
                            });
                            syncAudioPlaybackSettings({
                                element: event.currentTarget,
                                volume: music.volume
                            });
                        }}
                    />
                ) : null}
            </div>

            <div className="mx-auto w-full max-w-[1162px]">
                <PreviewControlBar
                    currentTimeMs={currentTimeMs}
                    durationMs={data.durationMs}
                    isPlaying={isPlaying}
                    onTogglePlayback={onTogglePlayback}
                />
            </div>
        </section>
    );
};
