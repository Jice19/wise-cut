/* */
import type { VideoProject } from '../types';

export const sampleVideoProject = {
    ai: {
        graphVersion: 'video-creation-agent@0.1.0',
        provider: 'ark-openai-compatible',
        runId: 'run_sample_001'
    },
    assets: {
        music: [
            {
                durationMs: 90000,
                id: 'music_asset_001',
                path: 'assets/music/eutopia.mp3',
                title: 'Eutopia'
            }
        ],
        subtitles: [
            {
                id: 'subtitle_asset_001',
                styleId: 'subtitle_style_default',
                text: '开场提出问题，把学习焦虑拉到观众面前。'
            }
        ],
        thumbnails: [
            {
                id: 'thumbnail_asset_001',
                path: 'assets/thumbnails/scene-01.jpg',
                sourceVideoAssetId: 'video_asset_001'
            }
        ],
        videos: [
            {
                durationMs: 12000,
                fps: 30,
                height: 1080,
                id: 'video_asset_001',
                path: 'assets/videos/scene-01.mp4',
                thumbnailIds: ['thumbnail_asset_001'],
                width: 1920
            }
        ],
        voices: [
            {
                durationMs: 8000,
                id: 'voice_asset_001',
                path: 'assets/voices/scene-01.mp3',
                provider: 'volcengine-seed-tts',
                voice: 'zh_female_gaolengyujie_uranus_bigtts'
            }
        ]
    },
    canvas: {
        durationMs: 90000,
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
        createdAt: '2026-06-23T08:00:00.000Z',
        id: 'project_sample_001',
        sourcePrompt: '生成一个横屏 AI 学习路线视频',
        title: '前端 AI 学习路线',
        updatedAt: '2026-06-23T08:00:00.000Z'
    },
    render: {
        format: 'mp4',
        quality: 'preview'
    },
    scenes: [
        {
            durationMs: 8000,
            goal: '用问题开场建立共鸣',
            id: 'scene_001',
            index: 1,
            matchedVideoAssetIds: ['video_asset_001'],
            notes: '首版示例分镜',
            script: '很多前端同学都在焦虑 AI 到底怎么学。',
            subtitleIds: ['subtitle_asset_001'],
            title: '开场问题',
            visualIntent: '横屏口播画面，节奏清晰',
            voiceAssetId: 'voice_asset_001'
        }
    ],
    schemaVersion: '1.0.0',
    tracks: [
        {
            clips: [
                {
                    assetId: 'video_asset_001',
                    crop: {
                        height: 1080,
                        width: 1920,
                        x: 0,
                        y: 0
                    },
                    endMs: 8000,
                    id: 'video_clip_001',
                    kind: 'video',
                    sceneId: 'scene_001',
                    sourceEndMs: 8000,
                    sourceStartMs: 0,
                    startMs: 0,
                    transform: {
                        rotation: 0,
                        scale: 1,
                        x: 0,
                        y: 0
                    }
                }
            ],
            id: 'track_video_001',
            kind: 'video',
            label: '视频'
        },
        {
            clips: [
                {
                    assetId: 'voice_asset_001',
                    endMs: 8000,
                    id: 'voice_clip_001',
                    kind: 'voice',
                    sceneId: 'scene_001',
                    startMs: 0,
                    voicePreset: 'zh_female_gaolengyujie_uranus_bigtts'
                }
            ],
            id: 'track_voice_001',
            kind: 'voice',
            label: '配音'
        },
        {
            clips: [
                {
                    endMs: 8000,
                    id: 'subtitle_clip_001',
                    kind: 'subtitle',
                    sceneId: 'scene_001',
                    startMs: 0,
                    styleId: 'subtitle_style_default',
                    subtitleId: 'subtitle_asset_001',
                    text: '开场提出问题，把学习焦虑拉到观众面前。'
                }
            ],
            id: 'track_subtitle_001',
            kind: 'subtitle',
            label: '字幕'
        },
        {
            clips: [
                {
                    assetId: 'music_asset_001',
                    endMs: 90000,
                    fadeInMs: 1200,
                    fadeOutMs: 1800,
                    id: 'music_clip_001',
                    kind: 'music',
                    sourceEndMs: 90000,
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
