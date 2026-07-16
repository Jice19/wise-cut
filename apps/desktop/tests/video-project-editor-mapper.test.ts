/* */
import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';

import {
    type MusicClip,
    sampleVideoProject,
    type SubtitleClip,
    type VideoClip,
    type VideoProject,
    type VoiceClip
} from '@wise-cut/video-project';

import { TimelinePanel } from '../renderer/components/TimelinePanel';
import {
    applyVoiceSettingsToVideoProject,
    createEditorScreenData,
    createPlaybackStoryboard,
    videoProjectToEditor
} from '../renderer/mappers/video-project-to-editor';

const sceneDurationsMs = [
    8000, 12000, 6000, 15000, 9000, 10000, 14000, 7000, 9000
];

const createNineSceneProject = (): VideoProject => {
    const project: VideoProject = structuredClone(sampleVideoProject);
    let cursorMs = 0;

    project.project.id = 'project_9_scenes';
    project.project.title = '九段分镜项目';
    project.canvas.durationMs = sceneDurationsMs.reduce(
        (total, durationMs) => total + durationMs,
        0
    );
    project.assets.videos = [];
    project.assets.voices = [];
    project.assets.subtitles = [];
    project.assets.music = [
        {
            durationMs: project.canvas.durationMs,
            id: 'music_asset_001',
            path: 'assets/music/eutopia.mp3',
            title: 'Eutopia'
        }
    ];
    project.assets.thumbnails = [];
    project.scenes = [];

    const videoClips: VideoClip[] = [];
    const voiceClips: VoiceClip[] = [];
    const subtitleClips: SubtitleClip[] = [];
    const musicClips: MusicClip[] = [
        {
            assetId: 'music_asset_001',
            endMs: project.canvas.durationMs,
            fadeInMs: 1200,
            fadeOutMs: 1800,
            id: 'music_clip_001',
            kind: 'music',
            sourceEndMs: project.canvas.durationMs,
            sourceStartMs: 0,
            startMs: 0,
            volume: 0.28
        }
    ];

    sceneDurationsMs.forEach((durationMs, index) => {
        const sceneNumber = String(index + 1).padStart(2, '0');
        const sceneId = `scene_${sceneNumber}`;
        const videoAssetId = `video_asset_${sceneNumber}`;
        const voiceAssetId = `voice_asset_${sceneNumber}`;
        const subtitleAssetIds = [
            `subtitle_asset_${sceneNumber}_01`,
            `subtitle_asset_${sceneNumber}_02`
        ];
        const startMs = cursorMs;
        const endMs = cursorMs + durationMs;
        const midpointMs = startMs + Math.floor(durationMs / 2);

        project.assets.videos.push({
            durationMs,
            fps: 30,
            height: 1080,
            id: videoAssetId,
            path: `assets/videos/scene-${sceneNumber}.mp4`,
            thumbnailIds: [],
            width: 1920
        });
        project.assets.voices.push({
            durationMs,
            id: voiceAssetId,
            path: `assets/voices/scene-${sceneNumber}.mp3`,
            provider: 'volcengine-seed-tts',
            voice: 'zh_female_gaolengyujie_uranus_bigtts'
        });
        subtitleAssetIds.forEach((subtitleId, subtitleIndex) => {
            project.assets.subtitles.push({
                id: subtitleId,
                styleId: 'subtitle_style_default',
                text: `字幕 ${sceneNumber}-${String(subtitleIndex + 1).padStart(2, '0')}`
            });
        });
        project.scenes.push({
            durationMs,
            goal: `分镜 ${sceneNumber} 目标`,
            id: sceneId,
            index: index + 1,
            matchedVideoAssetIds: [videoAssetId],
            notes: '',
            script: `第 ${index + 1} 段分镜文稿`,
            subtitleIds: subtitleAssetIds,
            title: `分镜 ${sceneNumber}`,
            visualIntent: `分镜 ${sceneNumber} 画面`,
            voiceAssetId
        });
        videoClips.push({
            assetId: videoAssetId,
            crop: {
                height: 1080,
                width: 1920,
                x: 0,
                y: 0
            },
            endMs,
            id: `video_clip_${sceneNumber}`,
            kind: 'video',
            sceneId,
            sourceEndMs: durationMs,
            sourceStartMs: 0,
            startMs,
            transform: {
                rotation: 0,
                scale: 1,
                x: 0,
                y: 0
            }
        });
        voiceClips.push({
            assetId: voiceAssetId,
            endMs,
            id: `voice_clip_${sceneNumber}`,
            kind: 'voice',
            sceneId,
            startMs,
            voicePreset: 'zh_female_gaolengyujie_uranus_bigtts'
        });
        subtitleClips.push(
            {
                endMs: midpointMs,
                id: `subtitle_clip_${sceneNumber}_01`,
                kind: 'subtitle',
                sceneId,
                startMs,
                styleId: 'subtitle_style_default',
                subtitleId: subtitleAssetIds[0],
                text: `字幕 ${sceneNumber}-01`
            },
            {
                endMs,
                id: `subtitle_clip_${sceneNumber}_02`,
                kind: 'subtitle',
                sceneId,
                startMs: midpointMs,
                styleId: 'subtitle_style_default',
                subtitleId: subtitleAssetIds[1],
                text: `字幕 ${sceneNumber}-02`
            }
        );
        cursorMs = endMs;
    });

    project.tracks = [
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
            clips: musicClips,
            id: 'track_music_001',
            kind: 'music',
            label: '音乐'
        }
    ];

    return project;
};

describe('videoProjectToEditor', () => {
    it('maps a VideoProject into scene storyboard and four timeline tracks', () => {
        const data = videoProjectToEditor(createNineSceneProject());

        expect(data.storyboard.items).toHaveLength(9);
        expect(data.storyboard.items[1]).toMatchObject({
            sceneId: 'scene_02',
            startMs: 8000
        });
        expect(data.storyboard.summary.meta).toBe(
            '9 段分镜 · 01:30 · 当前 00:00-00:08'
        );
        expect(data.timeline.tracks.map((track) => track.id)).toEqual([
            'video',
            'voice',
            'subtitle',
            'music'
        ]);
        expect(data.timeline.tracks[0]?.title).toBe('视频');
        expect(data.timeline.clipsByTrack.video).toHaveLength(9);
        expect(data.timeline.clipsByTrack.voice).toHaveLength(9);
        expect(data.timeline.clipsByTrack.subtitle).toHaveLength(18);
        expect(data.timeline.clipsByTrack.music).toHaveLength(1);
        expect(data.timeline.clipsByTrack.video[0]).toMatchObject({
            durationSeconds: 8,
            label: '分镜01',
            sceneId: 'scene_01',
            startMs: 0,
            widthPx: 154
        });
        expect(data.timeline.clipsByTrack.video[3]).toMatchObject({
            durationSeconds: 15,
            label: '分镜04',
            sceneId: 'scene_04',
            startMs: 26000,
            widthPx: 288
        });
        expect(data.preview).toMatchObject({
            alt: '分镜 01 画面',
            durationMs: 90000,
            source: 'app-media://project/project_9_scenes/video/video_asset_01',
            type: 'video'
        });
        if (data.preview.type !== 'video') {
            throw new Error('Expected video preview');
        }
        expect(data.preview.segments).toHaveLength(9);
        expect(data.preview.segments[0]).toMatchObject({
            endMs: 8000,
            source: 'app-media://project/project_9_scenes/video/video_asset_01',
            startMs: 0,
            subtitleCues: [
                expect.objectContaining({
                    startMs: 0,
                    style: expect.objectContaining({
                        fontSizePx: 24
                    }),
                    text: '字幕 01-01'
                }),
                expect.objectContaining({
                    startMs: 4000,
                    text: '字幕 01-02'
                })
            ],
            voiceSource:
                'app-media://project/project_9_scenes/voice/voice_asset_01'
        });
        expect(data.preview.segments[1]).toMatchObject({
            source: 'app-media://project/project_9_scenes/video/video_asset_02',
            startMs: 8000
        });
        expect(data.timeline.layout.contentMinWidthClassName).toBe(
            'min-w-[max(100%,1728px)] w-[1728px]'
        );
        expect(data.timeline.playhead).toEqual({
            currentTimeMs: 0,
            progress: 0
        });
        expect(data.timeline.ticks).toEqual([
            '00:00',
            '00:10',
            '00:20',
            '00:30',
            '00:40',
            '00:50',
            '01:00',
            '01:10',
            '01:20'
        ]);
    });

    it('applies subtitle preview settings to mapped subtitle cues', () => {
        const data = createEditorScreenData(createNineSceneProject(), {
            subtitleSettings: {
                fontSizePx: 32,
                isVisible: true,
                outlineColor: '#050505',
                presetLabel: '黄字黑边',
                textColor: '#FFD400'
            }
        });

        if (data.preview.type !== 'video') {
            throw new Error('Expected video preview');
        }

        expect(data.preview.segments[0]?.subtitleCues[0]).toMatchObject({
            style: {
                fontSizePx: 32,
                outlineColor: '#050505',
                presetLabel: '黄字黑边',
                textColor: '#FFD400'
            },
            text: '字幕 01-01'
        });
    });

    it('hides subtitle cues when subtitle preview is disabled', () => {
        const data = createEditorScreenData(createNineSceneProject(), {
            subtitleSettings: {
                fontSizePx: 18,
                isVisible: false,
                outlineColor: '#000000',
                presetLabel: '白字黑边',
                textColor: '#F5F7FA'
            }
        });

        if (data.preview.type !== 'video') {
            throw new Error('Expected video preview');
        }

        expect(data.preview.segments[0]?.subtitleCues).toEqual([]);
    });

    it('hides subtitle and music timeline tracks when those settings are disabled', () => {
        const data = createEditorScreenData(createNineSceneProject(), {
            musicSettings: {
                enabled: false,
                selectedTrackId: 'song_01',
                volume: 0.6
            },
            subtitleSettings: {
                fontSizePx: 24,
                isVisible: false,
                outlineColor: '#000000',
                presetLabel: '白字黑边',
                textColor: '#F5F7FA'
            }
        });
        const html = renderToStaticMarkup(
            createElement(TimelinePanel, {
                data: data.timeline
            })
        );

        expect(data.timeline.tracks.map((track) => track.id)).toEqual([
            'video',
            'voice'
        ]);
        expect(data.timeline.clipsByTrack.subtitle).toEqual([]);
        expect(data.timeline.clipsByTrack.music).toEqual([]);
        expect(html).toContain('data-timeline-track="video"');
        expect(html).toContain('data-timeline-track="voice"');
        expect(html).not.toContain('data-timeline-track="subtitle"');
        expect(html).not.toContain('data-timeline-track="music"');
    });

    it('renders mapped timeline clips through the existing timeline component', () => {
        const data = videoProjectToEditor(createNineSceneProject());
        const html = renderToStaticMarkup(
            createElement(TimelinePanel, {
                data: data.timeline
            })
        );

        expect(html).toContain('data-timeline-track="video"');
        expect(html).toContain('data-timeline-track="voice"');
        expect(html).toContain('data-timeline-track="subtitle"');
        expect(html).toContain('data-timeline-track="music"');
        expect(html.match(/data-timeline-clip-kind="video"/g)).toHaveLength(9);
        expect(html.match(/data-timeline-clip-kind="voice"/g)).toHaveLength(9);
        expect(html.match(/data-timeline-clip-kind="subtitle"/g)).toHaveLength(
            18
        );
        expect(html).toContain('data-width-px="154"');
        expect(html).toContain('data-width-px="288"');
        expect(html).toContain('data-timeline-scene-id="scene_01"');
        expect(html).toContain('data-timeline-clip-start-ms="0"');
        expect(html).toContain('Eutopia · 全片背景音乐');
    });

    it('maps multiple voice clips in one scene into preview voice cues', () => {
        const project = createNineSceneProject();
        const voiceTrack = project.tracks.find(
            (track) => track.kind === 'voice'
        );

        if (!voiceTrack) {
            throw new Error('Expected voice track');
        }

        project.assets.voices.splice(
            0,
            1,
            {
                durationMs: 3000,
                id: 'voice_asset_01_01',
                path: 'assets/voices/scene-01-01.mp3',
                provider: 'volcengine-seed-tts',
                voice: 'zh_female_gaolengyujie_uranus_bigtts'
            },
            {
                durationMs: 5000,
                id: 'voice_asset_01_02',
                path: 'assets/voices/scene-01-02.mp3',
                provider: 'volcengine-seed-tts',
                voice: 'zh_female_gaolengyujie_uranus_bigtts'
            }
        );
        voiceTrack.clips.splice(
            0,
            1,
            {
                assetId: 'voice_asset_01_01',
                endMs: 3000,
                id: 'voice_clip_01_01',
                kind: 'voice',
                sceneId: 'scene_01',
                startMs: 0,
                voicePreset: 'zh_female_gaolengyujie_uranus_bigtts'
            },
            {
                assetId: 'voice_asset_01_02',
                endMs: 8000,
                id: 'voice_clip_01_02',
                kind: 'voice',
                sceneId: 'scene_01',
                startMs: 3000,
                voicePreset: 'zh_female_gaolengyujie_uranus_bigtts'
            }
        );

        const data = videoProjectToEditor(project);

        if (data.preview.type !== 'video') {
            throw new Error('Expected video preview');
        }

        expect(data.preview.segments[0]?.voiceCues).toEqual([
            {
                endMs: 3000,
                id: 'voice_clip_01_01',
                source: 'app-media://project/project_9_scenes/voice/voice_asset_01_01',
                startMs: 0
            },
            {
                endMs: 8000,
                id: 'voice_clip_01_02',
                source: 'app-media://project/project_9_scenes/voice/voice_asset_01_02',
                startMs: 3000
            }
        ]);
        expect(data.timeline.clipsByTrack.voice[0]?.label).toBe('旁白01-01');
        expect(data.timeline.clipsByTrack.voice[1]?.label).toBe('旁白01-02');
    });

    it('reflows voice-driven scene timing from preview speed settings', () => {
        const project = createNineSceneProject();
        const voiceTrack = project.tracks.find(
            (track) => track.kind === 'voice'
        );

        if (!voiceTrack) {
            throw new Error('Expected voice track');
        }

        project.assets.voices.splice(
            0,
            1,
            {
                durationMs: 3000,
                id: 'voice_asset_01_01',
                path: 'assets/voices/scene-01-01.mp3',
                provider: 'volcengine-seed-tts',
                voice: 'zh_female_gaolengyujie_uranus_bigtts'
            },
            {
                durationMs: 5000,
                id: 'voice_asset_01_02',
                path: 'assets/voices/scene-01-02.mp3',
                provider: 'volcengine-seed-tts',
                voice: 'zh_female_gaolengyujie_uranus_bigtts'
            }
        );
        voiceTrack.clips.splice(
            0,
            1,
            {
                assetId: 'voice_asset_01_01',
                endMs: 3000,
                id: 'voice_clip_01_01',
                kind: 'voice',
                sceneId: 'scene_01',
                startMs: 0,
                voicePreset: 'zh_female_gaolengyujie_uranus_bigtts'
            },
            {
                assetId: 'voice_asset_01_02',
                endMs: 8000,
                id: 'voice_clip_01_02',
                kind: 'voice',
                sceneId: 'scene_01',
                startMs: 3000,
                voicePreset: 'zh_female_gaolengyujie_uranus_bigtts'
            }
        );

        const adjustedProject = applyVoiceSettingsToVideoProject({
            project,
            settings: {
                voiceSpeed: 2,
                voiceVolume: 0.5
            }
        });
        const data = videoProjectToEditor(adjustedProject);

        if (data.preview.type !== 'video') {
            throw new Error('Expected video preview');
        }

        expect(adjustedProject.canvas.durationMs).toBe(45_000);
        expect(adjustedProject.scenes[0]).toMatchObject({
            durationMs: 4000
        });
        expect(data.storyboard.items[1]).toMatchObject({
            sceneId: 'scene_02',
            startMs: 4000
        });
        expect(data.preview.durationMs).toBe(45_000);
        expect(data.preview.segments[0]).toMatchObject({
            endMs: 4000,
            playbackRate: 2,
            sourceEndMs: 8000,
            startMs: 0,
            subtitleCues: [
                expect.objectContaining({
                    endMs: 1500,
                    startMs: 0
                }),
                expect.objectContaining({
                    endMs: 4000,
                    startMs: 1500
                })
            ],
            voiceCues: [
                expect.objectContaining({
                    endMs: 1500,
                    playbackRate: 2,
                    startMs: 0,
                    volume: 0.5
                }),
                expect.objectContaining({
                    endMs: 4000,
                    playbackRate: 2,
                    startMs: 1500,
                    volume: 0.5
                })
            ]
        });
        expect(
            adjustedProject.tracks
                .find((track) => track.kind === 'video')
                ?.clips.find((clip) => clip.kind === 'video')
        ).toMatchObject({
            sourceEndMs: 8000,
            speed: 2
        });
        expect(data.timeline.clipsByTrack.voice[0]).toMatchObject({
            durationSeconds: 1.5,
            startMs: 0,
            widthPx: 29
        });
        expect(data.timeline.clipsByTrack.voice[1]).toMatchObject({
            durationSeconds: 2.5,
            startMs: 1500,
            widthPx: 48
        });
    });

    it('derives the active storyboard item from the shared playback time', () => {
        const data = videoProjectToEditor(createNineSceneProject());
        const storyboard = createPlaybackStoryboard({
            currentTimeMs: 12_000,
            storyboard: data.storyboard
        });

        expect(storyboard.summary.meta).toBe(
            '9 段分镜 · 01:30 · 当前 00:08-00:20'
        );
        expect(storyboard.items.map((item) => item.tone)).toEqual([
            'default',
            'current',
            'default',
            'default',
            'default',
            'default',
            'default',
            'default',
            'default'
        ]);
    });

    it('falls back to the existing static editor data when no project is loaded', () => {
        const data = createEditorScreenData();

        expect(data.storyboard.items).toHaveLength(9);
        expect(data.timeline.clipsByTrack.video).toHaveLength(9);
        expect(data.timeline.clipsByTrack.music[0]?.label).toBe(
            'Eutopia · 全片背景音乐'
        );
        expect(data.preview.type).toBe('image');
    });

    it('syncs the selected bundled song into the static editor timeline', () => {
        const data = createEditorScreenData(undefined, {
            musicSettings: {
                enabled: true,
                selectedTrackId: 'song_08',
                volume: 0.6
            }
        });

        expect(
            data.timeline.tracks.find((track) => track.id === 'music')
        ).toMatchObject({
            meta: 'Paris 悬疑电影解说 · 01:30'
        });
        expect(data.timeline.clipsByTrack.music[0]).toMatchObject({
            durationSeconds: 90,
            label: 'Paris 悬疑电影解说 · 全片背景音乐',
            widthPx: 1728
        });
    });

    it('passes the selected bundled song and volume into the preview data', () => {
        const data = createEditorScreenData(createNineSceneProject(), {
            musicSettings: {
                enabled: true,
                selectedTrackId: 'song_08',
                volume: 0.35
            }
        });

        expect(data.preview.music).toMatchObject({
            source: expect.stringContaining('Paris'),
            title: 'Paris 悬疑电影解说',
            volume: 0.35
        });
    });
});
