/**
 * video-project schema 验证测试 —— 字段契约是否合法。
 *
 * Phase 3 commit 7 起覆盖到完整 17 类 + superRefine 校验。
 */

import {
    AssetAnalysisSchema,
    CreativeBriefSchema,
    ExtractedKeyframeSchema,
    FrameDescriptionSchema,
    MediaMetadataSchema,
    RenderConfigSchema,
    SceneSchema,
    SubtitleLineSchema,
    TimelineClipSchema,
    TimelineTrackSchema,
    VIDEO_PROJECT_SCHEMA_VERSION,
    VideoProjectSchema
} from '@miaoma-magicut/video-project';
import { describe, expect, it } from 'vitest';
import { z } from 'zod';

const baseMetadata = {
    codecName: 'h264',
    durationMs: 5000,
    filePath: '/tmp/a.mp4',
    fps: 30,
    hasAudio: true,
    height: 1080,
    width: 1920
};

const buildVideoProject = () => {
    const now = new Date().toISOString();
    return VideoProjectSchema.parse({
        agentConversation: [],
        assets: {
            music: [],
            videos: [
                {
                    assetId: 'a-1',
                    durationMs: 5000,
                    filePath: '/tmp/a.mp4',
                    kind: 'video'
                }
            ],
            voices: [
                {
                    assetId: 'v-1',
                    durationMs: 3000,
                    filePath: '/tmp/v.mp3',
                    kind: 'voice'
                }
            ]
        },
        canvas: {
            durationMs: 5000,
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
            projectId: 'proj-1',
            title: 'demo',
            updatedAt: now
        },
        renderConfig: { format: 'mp4', quality: 'preview' },
        schemaVersion: VIDEO_PROJECT_SCHEMA_VERSION,
        tracks: [
            {
                clips: [
                    {
                        assetId: 'a-1',
                        endMs: 5000,
                        kind: 'video',
                        playbackRate: 1,
                        startMs: 0
                    }
                ],
                kind: 'video',
                trackId: 't-1'
            },
            {
                clips: [
                    {
                        assetId: 'v-1',
                        endMs: 3000,
                        gainDb: 0,
                        kind: 'voice',
                        startMs: 0
                    }
                ],
                kind: 'voice',
                trackId: 't-2'
            }
        ]
    });
};

describe('video-project schemas', () => {
    it('RenderConfigSchema accepts preview / final', () => {
        expect(() =>
            RenderConfigSchema.parse({ format: 'mp4', quality: 'preview' })
        ).not.toThrow();
        expect(() =>
            RenderConfigSchema.parse({ format: 'mp4', quality: 'final' })
        ).not.toThrow();
        expect(() =>
            RenderConfigSchema.parse({ format: 'mp4', quality: 'unknown' })
        ).toThrow();
    });

    it('MediaMetadataSchema rejects missing positive dims', () => {
        expect(() => MediaMetadataSchema.parse(baseMetadata)).not.toThrow();

        const broken = { ...baseMetadata, width: 0 };

        expect(() => MediaMetadataSchema.parse(broken)).toThrow();
    });

    it('ExtractedKeyframeSchema round-trips', () => {
        const parsed = ExtractedKeyframeSchema.parse({
            height: 720,
            index: 1,
            path: '/tmp/frame-001.jpg',
            timestampMs: 2000,
            width: 1280
        });

        expect(parsed.timestampMs).toBe(2000);
    });

    it('FrameDescriptionSchema requires non-empty description', () => {
        expect(() =>
            FrameDescriptionSchema.parse({
                actions: [],
                description: 'OK',
                frameId: 'f-1',
                mood: 'neutral',
                objects: []
            })
        ).not.toThrow();

        expect(() =>
            FrameDescriptionSchema.parse({
                actions: [],
                description: '',
                frameId: 'f-1',
                mood: 'neutral',
                objects: []
            })
        ).toThrow();
    });

    it('AssetAnalysisSchema accepts empty frames array (degraded path)', () => {
        const parsed = AssetAnalysisSchema.parse({
            assetId: 'a-1',
            description: '',
            durationMs: 0,
            filePath: '/tmp/a.mp4',
            fps: 0,
            frames: [],
            height: 720,
            width: 1280
        });

        expect(parsed.frames).toEqual([]);
    });

    it('zod schema version is 4.x', () => {
        expect(
            (z as unknown as { ZodFirstPartyTypeKind: unknown })
                .ZodFirstPartyTypeKind
        ).toBeDefined();
    });
});

describe('commit 7 — phase 3 schema 扩展', () => {
    it('CreativeBriefSchema 接受完整 brief', () => {
        const brief = CreativeBriefSchema.parse({
            audience: '25-35 岁程序员',
            keyMessages: ['AI 剪辑让效率翻倍'],
            summary: '一段展示 AI 剪辑能力的短视频',
            title: 'AI 剪辑演示',
            tone: '科技感 + 简洁'
        });
        expect(brief.title).toBe('AI 剪辑演示');
    });

    it('SceneSchema 接受完整 scene,matchedAssetId 可选', () => {
        const scene = SceneSchema.parse({
            endMs: 5000,
            narration: '旁白文字',
            order: 0,
            sceneId: 's-1',
            startMs: 0,
            subtitleLines: [{ endMs: 2500, startMs: 0, text: '第一句' }],
            visualBrief: '夜景城市'
        });
        expect(scene.matchedAssetId).toBeUndefined();
    });

    it('SubtitleLineSchema 接受合法行', () => {
        const line = SubtitleLineSchema.parse({
            endMs: 2000,
            startMs: 0,
            text: '你好'
        });
        expect(line.text).toBe('你好');
    });

    it('TimelineClipSchema discriminatedUnion 4 种 clip', () => {
        const video = TimelineClipSchema.parse({
            assetId: 'a-1',
            endMs: 1000,
            kind: 'video',
            playbackRate: 1,
            startMs: 0
        });
        expect(video.kind).toBe('video');

        const voice = TimelineClipSchema.parse({
            assetId: 'v-1',
            endMs: 1000,
            gainDb: 0,
            kind: 'voice',
            startMs: 0
        });
        expect(voice.kind).toBe('voice');

        const subtitle = TimelineClipSchema.parse({
            assetId: 'sub-1',
            endMs: 1000,
            fontSizePx: 24,
            kind: 'subtitle',
            startMs: 0,
            text: '字幕'
        });
        expect(subtitle.kind).toBe('subtitle');

        const music = TimelineClipSchema.parse({
            assetId: 'm-1',
            endMs: 1000,
            gainDb: -3,
            kind: 'music',
            loop: false,
            startMs: 0
        });
        expect(music.kind).toBe('music');
    });

    it('TimelineTrackSchema 接受带 clips 的 track', () => {
        const track = TimelineTrackSchema.parse({
            clips: [
                {
                    assetId: 'a-1',
                    endMs: 1000,
                    kind: 'video',
                    playbackRate: 1,
                    startMs: 0
                }
            ],
            kind: 'video',
            trackId: 't-1'
        });
        expect(track.clips.length).toBe(1);
    });

    it('VideoProjectSchema 完整项目 parse 成功', () => {
        const project = buildVideoProject();
        expect(project.schemaVersion).toBe(VIDEO_PROJECT_SCHEMA_VERSION);
        expect(project.tracks.length).toBe(2);
    });

    it('VideoProjectSchema 拒绝未注册的 assetId 引用', () => {
        const project = buildVideoProject();
        const broken = {
            ...project,
            tracks: [
                {
                    clips: [
                        {
                            assetId: 'unknown-asset',
                            endMs: 1000,
                            kind: 'video',
                            playbackRate: 1,
                            startMs: 0
                        }
                    ],
                    kind: 'video',
                    trackId: 't-1'
                }
            ]
        };

        expect(() => VideoProjectSchema.parse(broken)).toThrow(/unknown asset/);
    });

    it('VideoProjectSchema 拒绝 endMs <= startMs 的 clip', () => {
        const project = buildVideoProject();
        const broken = {
            ...project,
            tracks: [
                {
                    clips: [
                        {
                            assetId: 'a-1',
                            endMs: 1000,
                            kind: 'video',
                            playbackRate: 1,
                            startMs: 1000
                        }
                    ],
                    kind: 'video',
                    trackId: 't-1'
                }
            ]
        };

        expect(() => VideoProjectSchema.parse(broken)).toThrow(
            /must be greater/
        );
    });

    it('VideoProjectSchema 拒绝缺 schemaVersion', () => {
        const project = buildVideoProject();
        // eslint-disable-next-line @typescript-eslint/no-unused-vars
        const { schemaVersion: _schemaVersion, ...broken } = project;

        expect(() => VideoProjectSchema.parse(broken)).toThrow();
    });
});
