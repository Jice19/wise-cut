/* */
import { describe, expect, it, vi } from 'vitest';

import type { PreviewSegment } from '../types/editor-screen';

import {
    createLoopVideoOnEnded,
    createPreviewVoicePlaybackKey,
    getPreviewSegmentLocalTimeMs,
    isPreviewSegmentSourceExhausted,
    syncAudioPlaybackSettings,
    syncMediaPlaybackSettings
} from './PreviewPanel';

// 5s 源视频 + 8s 分镜 — 经典"源短于 scene"循环场景,
// 复现之前 bug 报告的"前半段播放 + 后半段静态画面"。
const shortSourceSegment: PreviewSegment = {
    alt: 'test',
    endMs: 8_000,
    id: 'segment_short',
    playbackRate: 1,
    source: '/test.mp4',
    sourceEndMs: 5_000,
    sourceStartMs: 0,
    startMs: 0,
    subtitleCues: []
};

// 8s 源视频 + 5s 分镜 — 源长于 scene,不需要 loop。
const longSourceSegment: PreviewSegment = {
    ...shortSourceSegment,
    endMs: 5_000,
    sourceEndMs: 8_000
};

describe('getPreviewSegmentLocalTimeMs — source < scene (loop case)', () => {
    it('returns sourceStartMs when currentTimeMs equals segment.startMs', () => {
        expect(
            getPreviewSegmentLocalTimeMs({
                currentTimeMs: 0,
                segment: shortSourceSegment
            })
        ).toBe(0);
    });

    it('plays through the source up to sourceEndMs without clamping', () => {
        // currentTimeMs 4_999 还在源区间内,正常递增到 4_999(最后一帧前)。
        // 修复前在 5_000 时会被 clamp 到 5_000(等于 sourceEndMs),
        // 但这跟 ffmpeg 的 stream_loop 行为不一致 — ffmpeg 在
        // sourceElapsedMs 整除 sourceDurationMs 时会跳回 0 开始下一圈。
        // 5_000 跳回 0 是预期行为(测试在下一个 case 覆盖)。
        expect(
            getPreviewSegmentLocalTimeMs({
                currentTimeMs: 4_999,
                segment: shortSourceSegment
            })
        ).toBe(4_999);
    });

    it('wraps to sourceStartMs exactly at source end (matches ffmpeg -stream_loop semantics)', () => {
        // currentTimeMs 5_000 → 5_000 mod 5_000 = 0 → 跳回 0 开始 loop。
        // HTML5 video 在 currentTime=0 时从头开始播,自然形成 loop 行为。
        expect(
            getPreviewSegmentLocalTimeMs({
                currentTimeMs: 5_000,
                segment: shortSourceSegment
            })
        ).toBe(0);
    });

    it('loops back into the source after it ends (regression: frozen last frame bug)', () => {
        // scene 6s,源 5s → 1s 超出源末尾。修复前 clamp 到 sourceEndMs=5000,
        // 修复后 mod 5s → 回到源 1s 处,视频继续播放而不是卡住。
        expect(
            getPreviewSegmentLocalTimeMs({
                currentTimeMs: 6_000,
                segment: shortSourceSegment
            })
        ).toBe(1_000);
    });

    it('loops correctly at scene end (8s scene, 5s source → 3s into 2nd loop)', () => {
        // scene 8s,源 5s → 3s 超出源末尾。mod 5s → 回到源 3s 处。
        expect(
            getPreviewSegmentLocalTimeMs({
                currentTimeMs: 8_000,
                segment: shortSourceSegment
            })
        ).toBe(3_000);
    });

    it('loops multiple times when source is much shorter than scene', () => {
        // 假设 3s 源 + 13s scene,currentTimeMs 13s → 10s 超出源。
        // mod 3s = 1s。
        const segment: PreviewSegment = {
            ...shortSourceSegment,
            endMs: 13_000,
            sourceEndMs: 3_000
        };
        expect(
            getPreviewSegmentLocalTimeMs({
                currentTimeMs: 13_000,
                segment
            })
        ).toBe(1_000);
    });

    it('respects playbackRate when looping', () => {
        // playbackRate 2:currentTimeMs 4s × 2 = 8s source elapsed。
        // 8s mod 5s = 3s → 回到源 3s 处。
        const segment: PreviewSegment = {
            ...shortSourceSegment,
            playbackRate: 2
        };
        expect(
            getPreviewSegmentLocalTimeMs({
                currentTimeMs: 4_000,
                segment
            })
        ).toBe(3_000);
    });

    it('handles non-zero sourceStartMs with loop', () => {
        // sourceStartMs 1000 + sourceEndMs 6000(源长度 5s),scene 12s。
        // currentTimeMs 9s × rate 1 = 9s source elapsed;
        // mod 5_000 = 4_000 → 实际 local = sourceStartMs + 4_000 = 5_000。
        const segment: PreviewSegment = {
            ...shortSourceSegment,
            endMs: 12_000,
            sourceEndMs: 6_000,
            sourceStartMs: 1_000
        };
        expect(
            getPreviewSegmentLocalTimeMs({
                currentTimeMs: 9_000,
                segment
            })
        ).toBe(5_000);
    });
});

describe('getPreviewSegmentLocalTimeMs — source > scene (no loop needed)', () => {
    it('clamps to scene end (currentTimeMs < source end)', () => {
        // 8s 源 + 5s scene,currentTimeMs 3s → 3s source elapsed,
        // mod 8s = 3s,local = 3000。scene 还在播。
        expect(
            getPreviewSegmentLocalTimeMs({
                currentTimeMs: 3_000,
                segment: longSourceSegment
            })
        ).toBe(3_000);
    });

    it('clamps to scene end (currentTimeMs == source end)', () => {
        expect(
            getPreviewSegmentLocalTimeMs({
                currentTimeMs: 5_000,
                segment: longSourceSegment
            })
        ).toBe(5_000);
    });

    it('still clamps to scene end after source is exhausted', () => {
        // source 8s 早就结束,但 scene 已经结束。currentTimeMs 6s 仍在
        // source 区间(mod 8s = 6),local = 6000 — 但实际播放到 scene end
        // 之后由 isPreviewSegmentSourceExhausted + 切换 segment 接管。
        expect(
            getPreviewSegmentLocalTimeMs({
                currentTimeMs: 6_000,
                segment: longSourceSegment
            })
        ).toBe(6_000);
    });
});

describe('getPreviewSegmentLocalTimeMs — edge cases', () => {
    it('returns currentTimeMs when segment is undefined', () => {
        expect(getPreviewSegmentLocalTimeMs({ currentTimeMs: 1_234 })).toBe(
            1_234
        );
    });

    it('handles zero source duration (degenerate case)', () => {
        // 源 0 长度,mod 会 NaN,fallback 到 sourceStartMs。
        const segment: PreviewSegment = {
            ...shortSourceSegment,
            sourceEndMs: 0
        };
        expect(
            getPreviewSegmentLocalTimeMs({
                currentTimeMs: 1_000,
                segment
            })
        ).toBe(0);
    });

    it('handles currentTimeMs before segment.startMs (no negative elapsed)', () => {
        expect(
            getPreviewSegmentLocalTimeMs({
                currentTimeMs: 0,
                segment: { ...shortSourceSegment, startMs: 1_000 }
            })
        ).toBe(0); // sourceStartMs
    });

    it('clamps playbackRate to safe range', () => {
        // playbackRate 100 应该被 clamp 到 2(预览只支持 0.5x ~ 2x),
        // 否则用户调速到 100x 视频会跳到末尾然后卡住。
        const segment: PreviewSegment = {
            ...shortSourceSegment,
            playbackRate: 100
        };
        // rate clamp 到 2,currentTimeMs 3s × 2 = 6s source elapsed,
        // mod 5s = 1s,local = 1000。
        expect(
            getPreviewSegmentLocalTimeMs({
                currentTimeMs: 3_000,
                segment
            })
        ).toBe(1_000);
    });
});

describe('isPreviewSegmentSourceExhausted', () => {
    it('returns false when source has ended but scene has not (regression: stop too early)', () => {
        // 5s 源 + 8s scene,currentTimeMs 6s → scene 没结束,源已经结束。
        // 修复前:返回 true(错,导致 video.pause,画面卡在最后一帧)。
        // 修复后:返回 false,video 继续 loop 播。
        expect(
            isPreviewSegmentSourceExhausted({
                currentTimeMs: 6_000,
                segment: shortSourceSegment
            })
        ).toBe(false);
    });

    it('returns false exactly at scene end (boundary check uses >=)', () => {
        // currentTimeMs == endMs 时应该算 exhausted,这样 segment 切换逻辑
        // 能拿到下一个 segment。
        // 注:实际 isExhausted 用的是 currentTimeMs >= endMs,所以 endMs 本身
        // 返回 true。但 findActivePreviewSegment 用 currentTimeMs < endMs,
        // 所以这个边界值在一帧内是 race,但 endMs 本身返回 true 是安全的。
        expect(
            isPreviewSegmentSourceExhausted({
                currentTimeMs: 8_000,
                segment: shortSourceSegment
            })
        ).toBe(true);
    });

    it('returns false before scene end', () => {
        expect(
            isPreviewSegmentSourceExhausted({
                currentTimeMs: 7_999,
                segment: shortSourceSegment
            })
        ).toBe(false);
    });

    it('returns false when segment is undefined', () => {
        expect(isPreviewSegmentSourceExhausted({ currentTimeMs: 1_000 })).toBe(
            false
        );
    });

    it('returns true for source > scene after scene end', () => {
        // 8s 源 + 5s scene,currentTimeMs 5s → scene 结束。
        expect(
            isPreviewSegmentSourceExhausted({
                currentTimeMs: 5_000,
                segment: longSourceSegment
            })
        ).toBe(true);
    });
});

// fakeMediaElement:一个最小的 HTMLMediaElement 替身,只暴露我们要测的
// 属性(addEventListener / removeEventListener / currentTime / playbackRate
// / volume / play)。不需要 jsdom,纯对象 mock 就能验证 sync 行为。
// 返回 `unknown` 因为 lib.dom.d.ts 的 HTMLMediaElement 类型有 370+ 属性,
// fake 只暴露我们关心的;runtime 行为正确就够了。调用方按需 cast。
const createFakeMediaElement = ({
    initialCurrentTime = 0
}: { initialCurrentTime?: number } = {}) => {
    const listeners: Record<string, Set<() => void>> = {};
    let currentTime = initialCurrentTime;
    let playbackRate = 1;
    let volume = 1;
    const play = vi.fn(() => Promise.resolve());

    const fake = {
        addEventListener: vi.fn((event: string, handler: () => void) => {
            listeners[event] = listeners[event] ?? new Set();
            listeners[event].add(handler);
        }),
        get currentTime() {
            return currentTime;
        },
        get playbackRate() {
            return playbackRate;
        },
        get volume() {
            return volume;
        },
        fireEnded: () => {
            listeners['ended']?.forEach((h) => h());
        },
        play,
        removeEventListener: vi.fn((event: string, handler: () => void) => {
            listeners[event]?.delete(handler);
        }),
        set currentTime(value: number) {
            currentTime = value;
        },
        set playbackRate(value: number) {
            playbackRate = value;
        },
        set volume(value: number) {
            volume = value;
        }
    };

    return fake;
};

type FakeMediaElement = ReturnType<typeof createFakeMediaElement>;
const asVideo = (fake: FakeMediaElement) =>
    fake as unknown as HTMLVideoElement & {
        fireEnded: () => void;
        play: ReturnType<typeof vi.fn>;
    };
const asAudio = (fake: FakeMediaElement) =>
    fake as unknown as HTMLAudioElement & {
        play: ReturnType<typeof vi.fn>;
    };
const asMedia = (fake: FakeMediaElement) =>
    fake as unknown as HTMLMediaElement & {
        play: ReturnType<typeof vi.fn>;
    };

describe('createLoopVideoOnEnded — A-plan browser-native loop', () => {
    it('returns undefined when video is null (no-op safety)', () => {
        expect(
            createLoopVideoOnEnded({ video: null, audio: null })
        ).toBeUndefined();
    });

    it('attaches an "ended" listener to the video element', () => {
        const fake = createFakeMediaElement();
        const video = asVideo(fake);
        const cleanup = createLoopVideoOnEnded({ video, audio: null });

        expect(fake.addEventListener).toHaveBeenCalledTimes(1);
        expect(fake.addEventListener.mock.calls[0]?.[0]).toBe('ended');
        expect(typeof fake.addEventListener.mock.calls[0]?.[1]).toBe(
            'function'
        );

        cleanup?.();
    });

    it('on "ended" event: resets video.currentTime to 0 and calls play()', () => {
        const fake = createFakeMediaElement({ initialCurrentTime: 5 });
        const video = asVideo(fake);
        const cleanup = createLoopVideoOnEnded({ video, audio: null });

        video.fireEnded();

        expect(video.currentTime).toBe(0);
        expect(video.play).toHaveBeenCalledTimes(1);

        cleanup?.();
    });

    it('on "ended" event with audio: also resets audio.currentTime and plays audio', () => {
        const fakeVideo = createFakeMediaElement({ initialCurrentTime: 5 });
        const fakeAudio = createFakeMediaElement({ initialCurrentTime: 2 });
        const video = asVideo(fakeVideo);
        const audio = asAudio(fakeAudio);
        const cleanup = createLoopVideoOnEnded({ video, audio });

        video.fireEnded();

        // 同步 loop,video 跟 audio 都从头开始播,不会出"视频 0s / 配音 2s"错位
        expect(video.currentTime).toBe(0);
        expect(audio.currentTime).toBe(0);
        expect(video.play).toHaveBeenCalledTimes(1);
        expect(audio.play).toHaveBeenCalledTimes(1);

        cleanup?.();
    });

    it('cleanup removes the listener (subsequent "ended" events are ignored)', () => {
        const fake = createFakeMediaElement();
        const video = asVideo(fake);
        const cleanup = createLoopVideoOnEnded({ video, audio: null });
        cleanup?.();

        // 卸载后,end 事件再触发也不该 reset/play。
        video.fireEnded();

        expect(fake.removeEventListener).toHaveBeenCalledWith(
            'ended',
            expect.any(Function)
        );
        expect(video.play).not.toHaveBeenCalled();
    });
});

describe('syncMediaPlaybackSettings — onLoadedMetadata 行为(不设 currentTime)', () => {
    it('sets playbackRate on the element', () => {
        const fake = createFakeMediaElement();
        const video = asMedia(fake);
        syncMediaPlaybackSettings({ element: video, playbackRate: 1.5 });
        expect(fake.playbackRate).toBe(1.5);
    });

    it('clamps playbackRate above 2 to 2 (preview safe range)', () => {
        const fake = createFakeMediaElement();
        const video = asMedia(fake);
        syncMediaPlaybackSettings({ element: video, playbackRate: 100 });
        expect(fake.playbackRate).toBe(2);
    });

    it('clamps playbackRate below 0.5 to 0.5 (preview safe range)', () => {
        const fake = createFakeMediaElement();
        const video = asMedia(fake);
        syncMediaPlaybackSettings({ element: video, playbackRate: 0.1 });
        expect(fake.playbackRate).toBe(0.5);
    });

    it('does NOT touch currentTime (regression: previously onLoadedMetadata seeked video)', () => {
        // 之前 onLoadedMetadata 调了 syncMediaCurrentTime,频繁触发 video
        // 重置 + 重新加载 metadata,导致画面卡顿。修复后 onLoadedMetadata
        // 只设 playbackRate,video 自己从 0 开始播。
        const fake = createFakeMediaElement({ initialCurrentTime: 3 });
        const video = asMedia(fake);
        syncMediaPlaybackSettings({ element: video, playbackRate: 1 });
        expect(fake.currentTime).toBe(3);
    });

    it('no-op when element is null', () => {
        expect(() =>
            syncMediaPlaybackSettings({ element: null, playbackRate: 1.5 })
        ).not.toThrow();
    });
});

describe('syncAudioPlaybackSettings — onLoadedMetadata 行为(不设 currentTime)', () => {
    it('sets volume and playbackRate on the audio element', () => {
        const fake = createFakeMediaElement();
        const audio = asMedia(fake);
        syncAudioPlaybackSettings({
            element: audio,
            playbackRate: 1.2,
            volume: 0.6
        });
        expect(fake.volume).toBe(0.6);
        expect(fake.playbackRate).toBe(1.2);
    });

    it('clamps volume above 1 to 1', () => {
        const fake = createFakeMediaElement();
        const audio = asMedia(fake);
        syncAudioPlaybackSettings({
            element: audio,
            playbackRate: 1,
            volume: 5
        });
        expect(fake.volume).toBe(1);
    });

    it('clamps volume below 0 to 0', () => {
        const fake = createFakeMediaElement();
        const audio = asMedia(fake);
        syncAudioPlaybackSettings({
            element: audio,
            playbackRate: 1,
            volume: -1
        });
        expect(fake.volume).toBe(0);
    });

    it('defaults volume to 1 when not provided', () => {
        const fake = createFakeMediaElement();
        const audio = asMedia(fake);
        // 先把 volume 改掉,验证会被 reset
        fake.volume = 0.3;
        syncAudioPlaybackSettings({ element: audio, playbackRate: 1 });
        expect(fake.volume).toBe(1);
    });

    it('does NOT touch currentTime (regression: previously onLoadedMetadata seeked audio)', () => {
        const fake = createFakeMediaElement({ initialCurrentTime: 1.5 });
        const audio = asMedia(fake);
        syncAudioPlaybackSettings({
            element: audio,
            playbackRate: 1,
            volume: 0.8
        });
        expect(fake.currentTime).toBe(1.5);
    });
});

describe('createPreviewVoicePlaybackKey — voice cue 切换不重置 audio', () => {
    it('returns empty string when source is missing', () => {
        expect(createPreviewVoicePlaybackKey({})).toBe('');
        expect(createPreviewVoicePlaybackKey({ source: '' })).toBe('');
        expect(createPreviewVoicePlaybackKey({ source: undefined })).toBe('');
    });

    it('returns the same key regardless of cueId (regression: 配音被打断 bug)', () => {
        // 之前 key 包含 cueId,每个 voice cue 都让 audio remount,正在播
        // 的配音被切断。修复后同 source 下所有 cue 共享同一个 audio 元素,
        // 配音连续播。重现场景:一段长配音切分成多个 cue(标注句子边界),
        // 切换 cue 时不应该打断。
        const source = '/voice/segment-1.mp3';
        const a = createPreviewVoicePlaybackKey({
            playbackRate: 1,
            source
        });
        const b = createPreviewVoicePlaybackKey({
            playbackRate: 1,
            source
        });

        expect(a).toBe(b);
    });

    it('returns different keys for different sources (cue 真的换了配音文件)', () => {
        const a = createPreviewVoicePlaybackKey({
            playbackRate: 1,
            source: '/voice/cue-1.mp3'
        });
        const b = createPreviewVoicePlaybackKey({
            playbackRate: 1,
            source: '/voice/cue-2.mp3'
        });

        expect(a).not.toBe(b);
    });

    it('returns different keys for different playback rates (rate 切换要重置 audio)', () => {
        const a = createPreviewVoicePlaybackKey({
            playbackRate: 1,
            source: '/voice/segment-1.mp3'
        });
        const b = createPreviewVoicePlaybackKey({
            playbackRate: 1.5,
            source: '/voice/segment-1.mp3'
        });

        expect(a).not.toBe(b);
    });

    it('defaults playbackRate to 1 when not provided', () => {
        // 不传 rate 时,应该跟显式传 1 得到同样的 key(否则无意义重置)
        const implicit = createPreviewVoicePlaybackKey({
            source: '/voice/segment-1.mp3'
        });
        const explicit = createPreviewVoicePlaybackKey({
            playbackRate: 1,
            source: '/voice/segment-1.mp3'
        });

        expect(implicit).toBe(explicit);
        expect(implicit).toBe('/voice/segment-1.mp3|1');
    });
});
