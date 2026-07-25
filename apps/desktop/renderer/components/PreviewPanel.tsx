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
    const sourceDurationMs = Math.max(
        0,
        segment.sourceEndMs - segment.sourceStartMs
    );
    const elapsedInSegmentMs = Math.max(0, currentTimeMs - segment.startMs);
    const sourceElapsedMs = elapsedInSegmentMs * playbackRate;

    if (sourceDurationMs > 0) {
        // 源比 scene 短时,在 source 区间内 mod loop,跟 ffmpeg export
        // 的 `-stream_loop -1` 语义一致(apps/desktop/client/video-export-ffmpeg.ts
        // 第 678 行)。源比 scene 长时,sourceElapsedMs < sourceDurationMs,
        // mod 等于自身,跟 ffmpeg 的 trim 行为一致。
        return segment.sourceStartMs + (sourceElapsedMs % sourceDurationMs);
    }

    // source 长度为 0 的退化情况(不该发生,但防一下)
    return segment.sourceStartMs;
};

export const isPreviewSegmentSourceExhausted = ({
    currentTimeMs,
    segment
}: {
    currentTimeMs: number;
    segment?: PreviewSegment;
}) => {
    if (!segment) return false;

    // scene 结束才算 exhausted。源比 scene 短时,我们循环播源,不应该
    // 在源末尾就 stop play;源比 scene 长时,playbackRate 会让源播得
    // 比实时慢,自然会在 sourceEndMs 时停下,但此时 scene 已经结束。
    return currentTimeMs >= segment.endMs;
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
    timeMs
}: {
    element: HTMLMediaElement | null;
    /**
     * 必须 force 设 currentTime(用户拖进度条 / 切分镜时需要)。
     * 平时(每帧 React 推 prop)不调这个,避免频繁 seek 卡顿。
     */
    timeMs: number;
}) => {
    if (!element) return;

    element.currentTime = timeMs / 1000;
};

export const syncMediaPlaybackSettings = ({
    element,
    playbackRate
}: {
    element: HTMLMediaElement | null;
    playbackRate?: number;
}) => {
    if (!element) return;

    element.playbackRate = clampPreviewPlaybackRate(playbackRate);
};

export const syncAudioPlaybackSettings = ({
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
    playbackRate,
    source
}: {
    playbackRate?: number;
    source?: string;
}) => {
    if (!source) return '';

    // key 不含 cueId。voice cue 切换只改 cueId,不改 source 时,audio
    // 元素不该 remount,否则正在播的配音会被截断,下一段从头开始
    // (典型场景:一段长配音切成多个 cue 标注句子边界,用户在中间切
    // 配音应该连续播,而不是每句都被打断)。
    return [source, playbackRate ?? 1].join('|');
};

/**
 * 把 video 的 `ended` 事件绑成 browser-native loop:源播到尽头时,
 * 调 `currentTime = 0` + `play()` 重新从头开始,避免 React 每帧
 * 推 prop 触发频繁 seek 导致画面/音频卡顿(原方案 A 的核心修复点)。
 *
 * 音频(口播/配音)一起 reset + play — video 跟 voice 同步 loop,
 * 避免"视频刚到 0、配音卡在 2s"这种错位。
 *
 * 返回 cleanup 函数,调用方在 effect cleanup 里跑。
 */
export const createLoopVideoOnEnded = ({
    video,
    audio
}: {
    video: HTMLVideoElement | null;
    audio?: HTMLAudioElement | null;
}) => {
    if (!video) return undefined;

    const handleEnded = () => {
        video.currentTime = 0;
        void video.play().catch((): void => undefined);

        if (audio) {
            audio.currentTime = 0;
            void audio.play().catch((): void => undefined);
        }
    };

    video.addEventListener('ended', handleEnded);

    return () => {
        video.removeEventListener('ended', handleEnded);
    };
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
    const videoPlaybackRate = activeSegment?.playbackRate ?? 1;
    const voicePlaybackRate =
        activeVoiceCue?.playbackRate ?? activeSegment?.playbackRate;
    const voicePlaybackKey = createPreviewVoicePlaybackKey({
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
        const audio = musicAudioRef.current;

        if (isPlaying) {
            void audio?.play().catch((): void => undefined);
            return;
        }

        audio?.pause();
    }, [isPlaying, music?.source, music?.volume]);

    useEffect(() => {
        const video = videoRef.current;
        const audio = audioRef.current;

        if (isPlaying && !isVideoSourceExhausted) {
            void video?.play().catch((): void => undefined);
            void audio?.play().catch((): void => undefined);
            return;
        }

        video?.pause();
        // 不再 force 设 currentTime — React 不再频繁 seek video,
        // video 自然从 0 播到 5s,5s 时由 video.onEnded listener 触发
        // loop(currentTime = 0 + play())。这才是真正的 browser-native
        // loop,避免 mod loop 在边界跨阈值的频繁 seek 卡顿。
        if (isPlaying) {
            void audio?.play().catch((): void => undefined);
            return;
        }

        audio?.pause();
    }, [
        isPlaying,
        isVideoSourceExhausted,
        mediaSource,
        voicePlaybackKey,
        voicePlaybackRate,
        voiceVolume
    ]);

    // video.onEnded → 源播完时设 currentTime=0 + play(),实现 browser
    // 原生 loop。删掉 L358-L395 的频繁 seek effect 后,video 自然从 0
    // 播到 duration,触发 ended 事件,我们接住,设 0 再 play → 无缝循环。
    // 音频也同步 loop(口播/配音短于 video 时,跟 video 一起 loop 听起来更
    // 协调;但 audio 没 ended 概念,只设 audio.currentTime = 0 + play()。
    useEffect(
        () =>
            createLoopVideoOnEnded({
                video: videoRef.current,
                audio: audioRef.current
            }),
        [mediaSource, voicePlaybackKey]
    );

    // 用户拖进度条 / 切分镜:外部 setState 后传 currentTimeMs / 媒体
    // 源进 PreviewPanel,我们 force 设 video.currentTime 跳到新位置。
    // 不依赖 video 的 onTimeUpdate 推 prop(那样循环依赖,会抖)。
    //
    // 依赖只有 [mediaSource] — 不挂 voicePlaybackKey。原因:voice cue
    // 切换时(audio 元素 key 变,自己 remount),不应 seek video。video
    // 跟 voice 是平行轨道,voice 换了 video 该继续在当前位置播,只有
    // 分镜本身换了(mediaSource 变)才需要 seek。
    useEffect(() => {
        syncMediaCurrentTime({
            element: videoRef.current,
            timeMs: localTimeMs
        });
    }, [mediaSource]);

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
                                // 不再 force 设 currentTime,让 video 从 0
                                // 自然开始播。playbackRate / volume 由下面
                                // 的独立 effect 设(只切分镜/切速率时跑)。
                                // 切分镜时由 mediaSource / voicePlaybackKey
                                // 变化触发的 effect seek 一次到 localTimeMs。
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
                                    // 同样不设 currentTime,让 audio 从 0
                                    // 自然开始;切分镜时 effect seek 一次。
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
                            // music 不设 currentTime,让 audio 从 0 开始;
                            // volume 由独立 effect 在 isPlaying 切换时设。
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
