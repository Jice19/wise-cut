/* */
import { existsSync, readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it, vi } from 'vitest';

import {
    sampleVideoProject,
    type VideoProject
} from '@wise-cut/video-project';

import { ConfigPanel } from '../renderer/components/config/ConfigPanel';
import { filterMusicTracksByCategory } from '../renderer/components/config/music/MusicConfigPanel';
import { ConfigPresetSwatch } from '../renderer/components/config/shared/ConfigPresetSwatch';
import { SubtitleConfigPanel } from '../renderer/components/config/subtitle/SubtitleConfigPanel';
import { ExportProgressDialog } from '../renderer/components/ExportProgressDialog';
import { ModeRail } from '../renderer/components/ModeRail';
import {
    createPreviewTimeUpdate,
    createPreviewVoicePlaybackKey,
    getPreviewSegmentLocalTimeMs,
    isPreviewSegmentSourceExhausted,
    PreviewPanel
} from '../renderer/components/PreviewPanel';
import {
    calculateTimelinePointerTimeMs,
    calculateTimelineScrollLeft,
    TimelinePanel
} from '../renderer/components/TimelinePanel';
import { musicLibraryTracks } from '../renderer/constants/config';
import { createEditorScreenData } from '../renderer/mappers/video-project-to-editor';
import {
    advancePlaybackTime,
    MiaojianEditorScreen
} from '../renderer/pages/MiaojianEditorScreen';
import type { PreviewSegment } from '../renderer/types/editor-screen';

describe('MiaojianEditorScreen', () => {
    it('renders the smart video editor workspace from the Pencil frame', () => {
        const html = renderToStaticMarkup(createElement(MiaojianEditorScreen));

        expect(html).toContain('智剪智能视频编辑器');
        expect(html).toContain('口播短片自动剪辑工程');
        expect(html).toContain('2 分钟前更新 · 已自动保存');
        expect(html).toContain('文稿字幕');
        expect(html).toContain('9 段分镜 · 01:30 · 当前 00:08-00:20');
        expect(html).toContain('快捷调整');
        expect(html).toContain('输入你的任何想法');
        expect(html).not.toContain('生成口播音轨');
        expect(html).not.toContain('file://');
    });

    it('uses the loaded project title as an editable editor header title', () => {
        const project = structuredClone(sampleVideoProject);
        project.project.title = '真实生成的项目标题';

        const html = renderToStaticMarkup(
            createElement(MiaojianEditorScreen, { project })
        );

        expect(html).toContain('aria-label="项目标题"');
        expect(html).toContain('value="真实生成的项目标题"');
        expect(html).not.toContain('口播短片自动剪辑工程</h1>');
    });

    it('applies the requested compact sidebars and the 320px voice config rail', () => {
        const html = renderToStaticMarkup(createElement(MiaojianEditorScreen));

        expect(html).toContain(
            'grid-cols-[300px_minmax(420px,1fr)_320px_59px]'
        );
        expect(html).toContain('w-[320px]');
        expect(html).toContain('overflow-hidden');
    });

    it('renders playable voice previews and adjustable voice parameters', () => {
        const html = renderToStaticMarkup(
            createElement(ConfigPanel, { mode: 'voice' })
        );

        for (const label of ['温婉学姐', '沉稳男声', '新闻播报', '活力讲解']) {
            expect(html).toContain(`aria-label="试听${label}"`);
            expect(html).toContain(`data-voice-preview="${label}"`);
        }

        expect(html).toContain('data-voice-preview-audio="true"');
        expect(html).toContain('/voice-previews/');
        expect(html).toContain('type="range"');
        expect(html).toContain('aria-label="音量"');
        expect(html).toContain('aria-label="语速"');
        expect(html).toContain('value="82"');
        expect(html).toContain('value="1.05"');
    });

    it('plays the uploaded custom voice audio as the selected voice preview', () => {
        const html = renderToStaticMarkup(
            createElement(ConfigPanel, {
                customVoices: [
                    {
                        createdAt: '2026-06-28T01:02:03.000Z',
                        id: 'voice_001',
                        previewAudioUrl:
                            'app-media://custom-voice/voice_001/reference',
                        provider: 'index-tts2',
                        sourceFileName: 'heyi.wav',
                        title: '合一原声',
                        voiceType: 'custom:index-tts2:voice_001'
                    }
                ],
                mode: 'voice',
                selectedVoice: {
                    title: '合一原声',
                    voiceType: 'custom:index-tts2:voice_001'
                }
            })
        );

        expect(html).toContain('data-voice-preview="合一原声"');
        expect(html).toContain('aria-label="试听合一原声"');
        expect(html).toContain(
            'src="app-media://custom-voice/voice_001/reference"'
        );
        expect(html).toContain('aria-pressed="true"');
    });

    it('stops the voice preset preview when editor preview playback starts', () => {
        const editorSource = readFileSync(
            resolve(__dirname, '../renderer/pages/MiaojianEditorScreen.tsx'),
            'utf8'
        );
        const configPanelSource = readFileSync(
            resolve(__dirname, '../renderer/components/config/ConfigPanel.tsx'),
            'utf8'
        );
        const voicePanelSource = readFileSync(
            resolve(
                __dirname,
                '../renderer/components/config/voice/VoiceConfigPanel.tsx'
            ),
            'utf8'
        );

        expect(editorSource).toContain('voicePreviewStopSignal');
        expect(editorSource).toContain(
            'setVoicePreviewStopSignal((value) => value + 1)'
        );
        expect(editorSource).toContain(
            'voicePreviewStopSignal={voicePreviewStopSignal}'
        );
        expect(configPanelSource).toContain('voicePreviewStopSignal');
        expect(voicePanelSource).toContain('context.voicePreviewStopSignal');
        expect(voicePanelSource).toContain('audio.pause()');
    });

    it('wires the voice generation button to regenerate all narration clips', () => {
        const editorSource = readFileSync(
            resolve(__dirname, '../renderer/pages/MiaojianEditorScreen.tsx'),
            'utf8'
        );
        const configPanelSource = readFileSync(
            resolve(__dirname, '../renderer/components/config/ConfigPanel.tsx'),
            'utf8'
        );
        const voicePanelSource = readFileSync(
            resolve(
                __dirname,
                '../renderer/components/config/voice/VoiceConfigPanel.tsx'
            ),
            'utf8'
        );
        const primaryButtonSource = readFileSync(
            resolve(
                __dirname,
                '../renderer/components/config/shared/ConfigPrimaryButton.tsx'
            ),
            'utf8'
        );

        expect(editorSource).toContain('handleRegenerateVoices');
        expect(editorSource).toContain('voiceRegenerationProgress');
        expect(editorSource).toContain('handleCancelRegenerateVoices');
        expect(editorSource).toContain('window.appAPI.videoAgent.cancel');
        expect(editorSource).toContain("'voice.regeneration.progress'");
        expect(editorSource).toContain("'run.cancelled'");
        expect(editorSource).toContain(
            'onCancelRegenerateVoices={handleCancelRegenerateVoices}'
        );
        expect(editorSource).toContain(
            'window.appAPI.videoAgent.regenerateVoices'
        );
        expect(editorSource).toContain(
            'onRegenerateVoices={handleRegenerateVoices}'
        );
        expect(configPanelSource).toContain('onRegenerateVoices');
        expect(configPanelSource).toContain('onCancelRegenerateVoices');
        expect(configPanelSource).toContain('voiceRegenerationProgress');
        expect(voicePanelSource).toContain('context.onRegenerateVoices');
        expect(voicePanelSource).toContain('context.onCancelRegenerateVoices');
        expect(voicePanelSource).toContain('voiceRegenerationProgress');
        expect(voicePanelSource).toContain('正在生成口播音轨');
        expect(voicePanelSource).toContain('取消生成');
        expect(voicePanelSource).toContain('selectedPreset.voiceType');
        expect(primaryButtonSource).toContain('onClick');
        expect(primaryButtonSource).toContain('disabled');
        expect(primaryButtonSource).toContain('isLoading');
        expect(primaryButtonSource).toContain('animate-spin');
    });

    it('wires custom voice library uploads into the voice config panel', () => {
        const editorSource = readFileSync(
            resolve(__dirname, '../renderer/pages/MiaojianEditorScreen.tsx'),
            'utf8'
        );
        const configPanelSource = readFileSync(
            resolve(__dirname, '../renderer/components/config/ConfigPanel.tsx'),
            'utf8'
        );
        const voicePanelSource = readFileSync(
            resolve(
                __dirname,
                '../renderer/components/config/voice/VoiceConfigPanel.tsx'
            ),
            'utf8'
        );
        const preloadSource = readFileSync(
            resolve(__dirname, '../client/preload.ts'),
            'utf8'
        );

        expect(preloadSource).toContain('customVoice');
        expect(preloadSource).toContain('importReferenceAudio');
        expect(editorSource).toContain('checkIndexTts2');
        expect(editorSource).toContain('customVoices');
        expect(editorSource).toContain('selectedVoice');
        expect(editorSource).toContain('setSelectedVoice');
        expect(editorSource).toContain('resolveProjectVoiceSelection');
        expect(editorSource).toContain('handleImportCustomVoice');
        expect(configPanelSource).toContain('onImportCustomVoice');
        expect(configPanelSource).toContain('onVoiceSelectionChange');
        expect(configPanelSource).toContain('selectedVoice');
        expect(voicePanelSource).toContain('context.customVoices');
        expect(voicePanelSource).toContain('context.selectedVoice');
        expect(voicePanelSource).toContain('context.onVoiceSelectionChange?.');
        expect(voicePanelSource).toContain("description: '自定义'");
        expect(voicePanelSource).toContain(
            'previewAudioUrl: voice.previewAudioUrl'
        );
        expect(voicePanelSource).toContain('onImportCustomVoice');
    });

    it('renders export progress in a modal and subscribes to export progress events', () => {
        const editorSource = readFileSync(
            resolve(__dirname, '../renderer/pages/MiaojianEditorScreen.tsx'),
            'utf8'
        );
        const html = renderToStaticMarkup(
            createElement(ExportProgressDialog, {
                progress: {
                    message: '正在渲染视频',
                    percent: 57,
                    phase: 'rendering'
                },
                state: 'running'
            })
        );

        expect(editorSource).toContain('ExportProgressDialog');
        expect(editorSource).toContain(
            'window.appAPI.videoExport.onProgress'
        );
        expect(editorSource).toContain(
            'window.appAPI.videoExport.selectOutputPath'
        );
        expect(html).toContain('导出进度');
        expect(html).toContain('正在渲染视频');
        expect(html).toContain('57%');
        expect(html).toContain('width:57%');
    });

    it('shows export settings before rendering starts', () => {
        const html = renderToStaticMarkup(
            createElement(ExportProgressDialog, {
                durationMs: 12_000,
                onChoosePath: () => undefined,
                onClose: () => undefined,
                onStartExport: () => undefined,
                outputPath: '/Users/heyi/Downloads/demo.mp4',
                state: 'idle'
            })
        );

        expect(html).toContain('导出视频');
        expect(html).toContain('输出路径');
        expect(html).toContain('/Users/heyi/Downloads/demo.mp4');
        expect(html).toContain('00:12');
        expect(html).toContain('选择路径');
        expect(html).toContain('开始导出');
    });

    it('keeps the script sidebar vertically scrollable when captions overflow', () => {
        const html = renderToStaticMarkup(createElement(MiaojianEditorScreen));

        expect(html).toContain('flex min-h-0 flex-col');
        expect(html).toContain('border-r border-[#2A2F38]');
        expect(html).toContain('bg-[#15171B]');
        expect(html).toContain('data-script-scroll="true"');
        expect(html).toContain('overflow-y-auto');
        expect(html).toContain('pr-1');
        expect(html).toContain('type="button"');
        expect(html).toContain('data-storyboard-seek-time="0"');
        expect(html).toContain('cursor-pointer');
    });

    it('keeps the bottom timeline on one shared horizontal grid', () => {
        const html = renderToStaticMarkup(createElement(MiaojianEditorScreen));

        expect(html).toContain('grid-cols-[200px_minmax(0,1fr)]');
        expect(html).toContain('grid-rows-[30px_50px_50px_50px_50px]');
        expect(html).toContain('min-w-[max(100%,1728px)]');
        expect(html).toContain('h-[272px]');
        expect(html).toContain('h-[42px]');
        expect(html).toContain('overflow-x-auto');
        expect(html).toContain('data-playhead-progress="0"');
        expect(html).toContain('left:calc(200px - 9px)');
        expect(html).toContain('transform:translateX(0px)');
        expect(html).toContain('will-change-transform');
        expect(html).not.toContain(
            'w-5 transition-[left] duration-200 ease-out'
        );
        expect(html).not.toContain('absolute left-[199px] top-[52px]');
        expect(html).not.toContain('absolute left-[195px] top-[35px]');
        expect(html).not.toContain('absolute left-[200px] right-0 top-[82px]');
        expect(html).not.toContain('absolute left-[-1px] top-[82px]');
    });

    it('uses the timeline title-bar frame structure and a draggable custom header', () => {
        const html = renderToStaticMarkup(createElement(MiaojianEditorScreen));

        expect(html).toContain('data-window-drag-region="true"');
        expect(html).toContain('h-10');
        expect(html).toContain('[app-region:drag]');
        expect(html).toContain('[app-region:no-drag]');
        expect(html).toContain('px-3');
        expect(html).toContain('py-[6px]');
        expect(html).toContain('items-start');
        expect(html).not.toContain('pl-[88px]');
        expect(html).toContain(
            'flex h-[42px] w-full items-center justify-between border-b border-[#2A2F38] bg-[#15171B] px-3 py-[6px]'
        );
        expect(html).not.toContain('aria-label="撤销"');
        expect(html).not.toContain('aria-label="重做"');
        expect(html).not.toContain('aria-label="分割"');
        expect(html).not.toContain('aria-label="联动"');
        expect(html).toContain('aria-label="吸附"');
        expect(html).toContain('aria-label="波纹"');
        expect(html).toContain('w-[92px]');
        expect(html).toContain('w-[54px]');
    });

    it('renders four compact scene-aligned timeline tracks with nine continuous clips', () => {
        const html = renderToStaticMarkup(createElement(MiaojianEditorScreen));
        const countMatches = (pattern: RegExp) =>
            html.match(pattern)?.length ?? 0;

        expect(html).toContain('视频');
        expect(html).not.toContain('视频 1');
        expect(html).toContain('配音');
        expect(html).toContain('字幕');
        expect(html).toContain('音乐');
        expect(html).toContain('9 个分镜');
        expect(html).toContain('Eutopia · 全片背景音乐');
        expect(html).toContain('分镜09');
        expect(html).toContain('旁白09');
        expect(html).toContain('字幕09');

        expect(countMatches(/data-timeline-track="video"/g)).toBe(1);
        expect(countMatches(/data-timeline-track="voice"/g)).toBe(1);
        expect(countMatches(/data-timeline-track="subtitle"/g)).toBe(1);
        expect(countMatches(/data-timeline-track="music"/g)).toBe(1);
        expect(countMatches(/data-timeline-clip-kind="video"/g)).toBe(9);
        expect(countMatches(/data-timeline-clip-kind="voice"/g)).toBe(9);
        expect(countMatches(/data-timeline-clip-kind="subtitle"/g)).toBe(18);
        expect(countMatches(/data-timeline-clip-kind="music"/g)).toBe(1);

        expect(html).toContain('data-duration-seconds="8"');
        expect(html).toContain('data-duration-seconds="15"');
        expect(html).toContain('data-width-px="154"');
        expect(html).toContain('data-width-px="288"');
        expect(html).toContain('字幕02-02');
        expect(html).toContain('h-[28px]');
        expect(html).not.toContain('h-[38px]');
        expect(html).toContain('text-[11px]');
        expect(html).not.toContain('text-sm font-extrabold text-[#F5F7FA]');
        expect(html).toContain('h-3 w-0.5 shrink-0');
        expect(html).toContain('h-3 w-3 shrink-0 text-[#F6B84B]');
        expect(html).toContain('h-3 w-3 shrink-0 text-[#8EA2FF]');
        expect(html).toContain('ml-auto flex gap-[2px]');
        expect(html).toContain('h-2 w-2 rounded');
        expect(html).toContain('data-waveform-size="compact"');
        expect(html).toContain('w-[2px] rounded-full bg-[#BFFFE266]');
        expect(html).toContain('rounded-md border');
        expect(html).toContain('w-[192px]');
        expect(html).toContain('w-[1728px]');
        expect(html).toContain('min-w-[max(100%,1728px)]');
        expect(html).toContain('gap-0');
        expect(html).not.toContain('first:rounded-l-md');
        expect(html).not.toContain('last:rounded-r-md');
        expect(html).not.toContain('gap-[15px] px-3');
        expect(html).not.toContain('gap-3 px-3');
        expect(html).not.toContain('w-[760px]');
    });

    it('moves the timeline playhead from playback progress', () => {
        const data = createEditorScreenData().timeline;
        const html = renderToStaticMarkup(
            createElement(TimelinePanel, {
                data: {
                    ...data,
                    playhead: {
                        currentTimeMs: 45000,
                        progress: 0.5
                    }
                }
            })
        );

        expect(html).toContain('data-playhead-progress="0.5"');
        expect(html).toContain('left:calc(200px - 9px)');
        expect(html).toContain('transform:translateX(864px)');
    });

    it('renders an extra timeline hover playhead with a time label', () => {
        const data = createEditorScreenData().timeline;
        const html = renderToStaticMarkup(
            createElement(TimelinePanel, {
                data,
                durationMs: 90_000,
                hoverTimeMs: 45_000
            })
        );

        expect(html).toContain('data-timeline-hover-playhead="true"');
        expect(html).toContain('data-hover-time-ms="45000"');
        expect(html).toContain('00:45');
        expect(html).toContain('translateX(864px)');
    });

    it('keeps global preview time moving forward when media local time resets', () => {
        const segment: PreviewSegment = {
            alt: '第一分镜',
            endMs: 12000,
            id: 'segment_01',
            source: 'app-media://project/project_preview/video/video_01',
            sourceEndMs: 7000,
            sourceStartMs: 0,
            startMs: 0,
            subtitleCues: []
        };

        expect(
            createPreviewTimeUpdate({
                currentTimeMs: 7000,
                nextLocalTimeMs: 0,
                segment
            })
        ).toBe(7000);
        expect(
            createPreviewTimeUpdate({
                currentTimeMs: 9000,
                nextLocalTimeMs: 1600,
                segment: {
                    ...segment,
                    endMs: 20000,
                    id: 'segment_02',
                    startMs: 8000
                }
            })
        ).toBe(9600);
    });

    it('derives the second segment media time from global time minus previous scenes', () => {
        const segment: PreviewSegment = {
            alt: '第二分镜',
            endMs: 20_000,
            id: 'segment_02',
            source: 'app-media://project/project_preview/video/video_02',
            sourceEndMs: 12_000,
            sourceStartMs: 500,
            startMs: 8_000,
            subtitleCues: []
        };

        expect(
            getPreviewSegmentLocalTimeMs({
                currentTimeMs: 12_250,
                segment
            })
        ).toBe(4_750);
    });

    it('derives media local time from playback rate when preview speed changes', () => {
        const segment: PreviewSegment = {
            alt: '倍速分镜',
            endMs: 4_000,
            id: 'segment_speed',
            playbackRate: 2,
            source: 'app-media://project/project_preview/video/video_speed',
            sourceEndMs: 8_000,
            sourceStartMs: 0,
            startMs: 0,
            subtitleCues: []
        };

        expect(
            getPreviewSegmentLocalTimeMs({
                currentTimeMs: 2_000,
                segment
            })
        ).toBe(4_000);
    });

    it('freezes a short source video on its last frame until the next segment', () => {
        const segment: PreviewSegment = {
            alt: '短视频分镜',
            endMs: 10_000,
            id: 'segment_short_video',
            source: 'app-media://project/project_preview/video/video_short',
            sourceEndMs: 5_000,
            sourceStartMs: 0,
            startMs: 0,
            subtitleCues: []
        };

        expect(
            getPreviewSegmentLocalTimeMs({
                currentTimeMs: 7_500,
                segment
            })
        ).toBe(5_000);
    });

    it('detects when a video source is shorter than its segment', () => {
        const segment: PreviewSegment = {
            alt: '短视频分镜',
            endMs: 10_000,
            id: 'segment_short_video',
            source: 'app-media://project/project_preview/video/video_short',
            sourceEndMs: 5_000,
            sourceStartMs: 1_000,
            startMs: 0,
            subtitleCues: []
        };

        expect(
            isPreviewSegmentSourceExhausted({
                currentTimeMs: 3_999,
                segment
            })
        ).toBe(false);
        expect(
            isPreviewSegmentSourceExhausted({
                currentTimeMs: 4_000,
                segment
            })
        ).toBe(true);
    });

    it('advances playback time from the actual animation frame delta', () => {
        expect(
            advancePlaybackTime({
                currentTimeMs: 8_000,
                durationMs: 90_000,
                elapsedMs: 16.7
            })
        ).toBe(8_016.7);
        expect(
            advancePlaybackTime({
                currentTimeMs: 89_990,
                durationMs: 90_000,
                elapsedMs: 50
            })
        ).toBe(90_000);
    });

    it('keeps the timeline scroll container following an overflowing playhead', () => {
        expect(
            calculateTimelineScrollLeft({
                contentWidthPx: 1728,
                currentScrollLeft: 0,
                playheadX: 1200,
                viewportWidth: 900
            })
        ).toBe(396);
        expect(
            calculateTimelineScrollLeft({
                contentWidthPx: 1728,
                currentScrollLeft: 396,
                playheadX: 460,
                viewportWidth: 900
            })
        ).toBe(396);
        expect(
            calculateTimelineScrollLeft({
                contentWidthPx: 1728,
                currentScrollLeft: 396,
                playheadX: 12,
                viewportWidth: 900
            })
        ).toBe(0);
    });

    it('maps timeline pointer coordinates to preview time', () => {
        expect(
            calculateTimelinePointerTimeMs({
                clientX: 300,
                contentWidthPx: 1728,
                durationMs: 90_000,
                scrollContainerLeft: 200,
                scrollLeft: 0
            })
        ).toBe(5_208);
        expect(
            calculateTimelinePointerTimeMs({
                clientX: 50,
                contentWidthPx: 1728,
                durationMs: 90_000,
                scrollContainerLeft: 200,
                scrollLeft: 0
            })
        ).toBe(0);
        expect(
            calculateTimelinePointerTimeMs({
                clientX: 1_000,
                contentWidthPx: 1728,
                durationMs: 90_000,
                scrollContainerLeft: 200,
                scrollLeft: 1_000
            })
        ).toBe(90_000);
    });

    it('only enables timeline hover preview while playback is paused', () => {
        const editorSource = readFileSync(
            resolve(__dirname, '../renderer/pages/MiaojianEditorScreen.tsx'),
            'utf8'
        );
        const normalizedEditorSource = editorSource.replace(/\s+/g, ' ');

        expect(normalizedEditorSource).toContain(
            'const canHoverPreviewTimeline = !isPreviewPlaying;'
        );
        expect(normalizedEditorSource).toMatch(
            /hoverTimeMs=\{\s*canHoverPreviewTimeline \? hoverPreviewTimeMs : undefined\s*\}/
        );
        expect(normalizedEditorSource).toMatch(
            /onPointerTimeClear=\{\s*canHoverPreviewTimeline \? clearHoverPreviewTime : undefined\s*\}/
        );
        expect(normalizedEditorSource).toMatch(
            /onPointerTimePreview=\{\s*canHoverPreviewTimeline \? setHoverPreviewTimeMs : undefined\s*\}/
        );
    });

    it('keeps preview playback driven by editor time instead of video timeupdate feedback', () => {
        const previewSource = readFileSync(
            resolve(__dirname, '../renderer/components/PreviewPanel.tsx'),
            'utf8'
        );

        expect(previewSource).not.toContain('onTimeUpdate?.(');
    });

    it('switches the preview playback button icon between play and pause', () => {
        const pausedHtml = renderToStaticMarkup(
            createElement(PreviewPanel, {
                data: createEditorScreenData().preview,
                isPlaying: false
            })
        );
        const playingHtml = renderToStaticMarkup(
            createElement(PreviewPanel, {
                data: createEditorScreenData().preview,
                isPlaying: true
            })
        );

        expect(pausedHtml).toContain('aria-label="播放预览"');
        expect(pausedHtml).toContain('M8 5v14l11-7-11-7Z');
        expect(playingHtml).toContain('aria-label="暂停预览"');
        expect(playingHtml).toContain('M8 5v14m8-14v14');
    });

    it('links the editor logo back to the workspace with a hover home icon', () => {
        const html = renderToStaticMarkup(createElement(MiaojianEditorScreen));

        expect(html).toContain('aria-label="返回首页"');
        expect(html).toContain('href="/workspace"');
        expect(html).toContain('group-hover:hidden');
        expect(html).toContain('group-hover:grid');
        expect(html).toContain('group-focus-visible:hidden');
        expect(html).toContain('group-focus-visible:grid');
    });

    it('uses the renderer config folders for visual and voice strategies', () => {
        const html = renderToStaticMarkup(createElement(MiaojianEditorScreen));
        const voiceHtml = renderToStaticMarkup(
            createElement(ConfigPanel, { mode: 'voice' })
        );

        expect(html).toContain('快捷调整');
        expect(voiceHtml).toContain('口播配音');
        expect(
            existsSync(resolve(__dirname, '../renderer/components/config'))
        ).toBe(true);
        expect(
            existsSync(
                resolve(__dirname, '../renderer/components/config/visual')
            )
        ).toBe(true);
        expect(
            existsSync(
                resolve(__dirname, '../renderer/components/config/voice')
            )
        ).toBe(true);
        expect(
            existsSync(
                resolve(
                    __dirname,
                    '../renderer/components/config/ConfigPanel.tsx'
                )
            )
        ).toBe(true);
    });

    it('switches config strategies between visual and voice modes', () => {
        const defaultHtml = renderToStaticMarkup(createElement(ConfigPanel));
        const voiceHtml = renderToStaticMarkup(
            createElement(ConfigPanel, { mode: 'voice' })
        );
        const visualHtml = renderToStaticMarkup(
            createElement(ConfigPanel, { mode: 'visual' })
        );
        const subtitleHtml = renderToStaticMarkup(
            createElement(ConfigPanel, { mode: 'subtitle' })
        );
        const musicHtml = renderToStaticMarkup(
            createElement(ConfigPanel, { mode: 'music' })
        );

        expect(voiceHtml).toContain('口播配音');
        expect(voiceHtml).toContain('生成口播音轨');
        expect(defaultHtml).toContain('快捷调整');
        expect(defaultHtml).toContain('输入你的任何想法');
        expect(defaultHtml).not.toContain('生成口播音轨');
        expect(visualHtml).toContain('快捷调整');
        expect(visualHtml).toContain('输入你的任何想法');
        expect(subtitleHtml).toContain('字幕');
        expect(musicHtml).toContain('音乐');
    });

    it('shows the persisted creation conversation in the visual config rail', () => {
        const project: VideoProject = structuredClone(sampleVideoProject);
        project.ai.conversation = [
            {
                blocks: [
                    {
                        text: '我会先把文稿拆成镜头目标，再匹配本地素材。',
                        type: 'paragraph'
                    }
                ],
                content: '我会先把文稿拆成镜头目标，再匹配本地素材。',
                createdAt: '2026-06-23T08:00:01.000Z',
                nodeName: 'creative_brief',
                role: 'assistant',
                sequence: 1,
                sourceEventType: 'model.stream.completed',
                tone: 'completed'
            },
            {
                blocks: [
                    {
                        items: [
                            {
                                detail: '生成分镜并等待确认',
                                label: '02 创建分镜',
                                status: 'completed'
                            }
                        ],
                        type: 'progress'
                    }
                ],
                content: '执行流程已更新',
                createdAt: '2026-06-23T08:00:02.000Z',
                role: 'system',
                sequence: 2,
                sourceEventType: 'run.progress',
                tone: 'completed'
            },
            {
                blocks: [
                    {
                        columns: ['分镜', '画面意图', '口播字幕', '时长'],
                        rows: [
                            [
                                '开场问题',
                                '横屏口播画面',
                                '很多前端同学都在焦虑 AI 怎么学。',
                                '8.0s'
                            ]
                        ],
                        type: 'table'
                    }
                ],
                content: '请确认分镜方案',
                createdAt: '2026-06-23T08:00:03.000Z',
                role: 'assistant',
                sequence: 3,
                sourceEventType: 'approval.required',
                tone: 'waiting'
            },
            {
                content: '确认这个分镜方案，继续生成视频。',
                createdAt: '2026-06-23T08:00:04.000Z',
                role: 'user',
                sequence: 4,
                sourceEventType: 'user.reply'
            }
        ];

        const html = renderToStaticMarkup(
            createElement(MiaojianEditorScreen, { project })
        );

        expect(html).toContain('data-visual-conversation-feed="true"');
        expect(html).toContain('创建过程');
        expect(html).toContain('我会先把文稿拆成镜头目标，再匹配本地素材。');
        expect(html).toContain('02 创建分镜');
        expect(html).toContain('生成分镜并等待确认');
        expect(html).toContain('开场问题');
        expect(html).toContain('横屏口播画面');
        expect(html).toContain('确认这个分镜方案，继续生成视频。');
        expect(html).toContain(
            'data-visual-conversation-message="user" class="pl-10'
        );
        expect(html).toContain(
            'data-visual-conversation-message="assistant" class="pr-10'
        );
        expect(html).toContain(
            'data-visual-conversation-message="system" class="pr-10'
        );
        expect(html).not.toContain(
            'data-visual-conversation-message="assistant" class="rounded-[12px] border p-3'
        );
        expect(html).not.toContain(
            'data-visual-conversation-message="system" class="rounded-[12px] border p-3'
        );
        expect(html).not.toContain('这是一份完整的技术教学口播稿');
    });

    it('keeps the visual config static analysis fallback without a persisted conversation', () => {
        const html = renderToStaticMarkup(
            createElement(ConfigPanel, { mode: 'visual' })
        );

        expect(html).not.toContain('data-visual-conversation-feed="true"');
        expect(html).toContain('这是一份完整的技术教学口播稿');
    });

    it('uses a real textarea composer in the visual config rail', () => {
        const html = renderToStaticMarkup(
            createElement(ConfigPanel, { mode: 'visual' })
        );

        expect(html).not.toContain('回到底部');
        expect(html).toContain('textarea');
        expect(html).toContain('aria-label="输入快捷调整"');
        expect(html).toContain('placeholder="输入你的任何想法"');
        expect(html).toContain('resize-none');
    });

    it('passes the selected scene into the visual quick adjustment composer', () => {
        const project = structuredClone(sampleVideoProject);
        const html = renderToStaticMarkup(
            createElement(MiaojianEditorScreen, { project })
        );

        expect(html).toContain('data-selected-scene-id="scene_001"');
        expect(html).toContain('分镜 01');
        expect(html).toContain('aria-label="发送快捷调整"');
        expect(html).toContain('pb-[14px]');
    });

    it('hides the visual quick adjustment scene tag when no scene is linked', () => {
        const html = renderToStaticMarkup(
            createElement(ConfigPanel, {
                mode: 'visual',
                selectedScene: undefined
            })
        );

        expect(html).not.toContain('aria-label="移除关联分镜"');
        expect(html).not.toContain('data-selected-scene-id=');
    });

    it('wires storyboard and timeline scene clicks into scene selection', () => {
        const editorSource = readFileSync(
            resolve(__dirname, '../renderer/pages/MiaojianEditorScreen.tsx'),
            'utf8'
        );
        const scriptPanelSource = readFileSync(
            resolve(__dirname, '../renderer/components/ScriptPanel.tsx'),
            'utf8'
        );
        const timelinePanelSource = readFileSync(
            resolve(__dirname, '../renderer/components/TimelinePanel.tsx'),
            'utf8'
        );

        expect(editorSource).toContain('selectedSceneId');
        expect(editorSource).toContain('handleSceneSelect');
        expect(editorSource).toContain(
            'createSceneRegenerationPendingConversation'
        );
        expect(editorSource).toContain(
            'setIsQuickAdjustmentSceneLinked(false)'
        );
        expect(editorSource).toContain('resolveSceneVoiceOption');
        expect(editorSource).toContain('onClearSelectedScene');
        expect(scriptPanelSource).toContain('onSceneSelect?.(');
        expect(timelinePanelSource).toContain('event.stopPropagation();');
        expect(timelinePanelSource).toContain('data-timeline-scene-id');
        expect(timelinePanelSource).toContain('onSceneSelect?.(');
    });

    it('renders the music settings rail from the Pencil frame', () => {
        const html = renderToStaticMarkup(
            createElement(ConfigPanel, { mode: 'music' })
        );

        expect(html).toContain('音乐设置');
        expect(html).toContain('控制背景音乐与推荐曲库');
        expect(html).toContain('开启');
        expect(html).toContain('p-[16px]');
        expect(html).toContain('当前音乐');
        expect(html).toContain('Eutopia');
        expect(html).toContain('Mika Chen');
        expect(html).toContain('偏慢 · 02:01 · 已对齐时间线');
        expect(html).toContain('音量');
        expect(html).toContain('60%');
        expect(html).toContain('推荐音乐');
        expect(html).toContain('全部');
        expect(html).toContain('平静');
        expect(html).toContain('欢快');
        expect(html).toContain('励志');
        expect(html).toContain('抒情');
        expect(html).toContain('更多');
        expect(html).toContain('overflow-x-auto');
        expect(html).toContain('shrink-0 whitespace-nowrap');
        expect(html).toContain('hover:bg-[#30343A]');
        expect(html).toContain('hover:bg-[#24282F]');
        expect(html).toContain('eutopia.png');
        expect(html).toContain('Paris 悬疑电影解说');
        expect(html).toContain('月亮之上(交响乐版)');
        expect(html).toContain('久石让 - 太阳照常升起(the s...');
        expect(html).toContain('data-music-track-id="song_08"');
        expect(html).toContain('data-music-source-url');
        expect(html).toContain('w-[320px]');
        expect(html).toContain('p-[16px]');
        expect(html).toContain('overflow-y-auto');
        expect(html).not.toContain('移除');
        expect(html).not.toContain('应用音乐');
    });

    it('wires music settings from the config panel into the editor timeline', () => {
        const editorSource = readFileSync(
            resolve(__dirname, '../renderer/pages/MiaojianEditorScreen.tsx'),
            'utf8'
        );
        const configPanelSource = readFileSync(
            resolve(__dirname, '../renderer/components/config/ConfigPanel.tsx'),
            'utf8'
        );
        const musicPanelSource = readFileSync(
            resolve(
                __dirname,
                '../renderer/components/config/music/MusicConfigPanel.tsx'
            ),
            'utf8'
        );

        expect(editorSource).toContain('musicSettings');
        expect(editorSource).toContain(
            'onMusicSettingsChange={setMusicSettings}'
        );
        expect(editorSource).toContain('subtitleSettings,');
        expect(editorSource).toContain('musicSettings');
        expect(configPanelSource).toContain('onMusicSettingsChange');
        expect(configPanelSource).toContain('musicSettings');
        expect(musicPanelSource).toContain('context.onMusicSettingsChange');
        expect(musicPanelSource).toContain('selectedTrackId');
        expect(musicPanelSource).toContain('selectedCategory');
        expect(musicPanelSource).toContain('onCategorySelect');
    });

    it('filters the bundled music list by category', () => {
        const suspenseTracks = filterMusicTracksByCategory({
            category: '悬疑',
            tracks: musicLibraryTracks
        });

        expect(suspenseTracks.map((track) => track.title)).toEqual([
            'Paris 悬疑电影解说'
        ]);
    });

    it('keeps the config panel scrollbars flush to the right edge', () => {
        const visualHtml = renderToStaticMarkup(
            createElement(ConfigPanel, { mode: 'visual' })
        );
        const voiceHtml = renderToStaticMarkup(
            createElement(ConfigPanel, { mode: 'voice' })
        );
        const subtitleHtml = renderToStaticMarkup(
            createElement(ConfigPanel, { mode: 'subtitle' })
        );
        const musicHtml = renderToStaticMarkup(
            createElement(ConfigPanel, { mode: 'music' })
        );

        expect(visualHtml).toContain('p-[16px]');
        expect(visualHtml).toContain('overflow-y-auto');
        expect(visualHtml).toContain('p-[16px]');
        expect(voiceHtml).toContain('overflow-y-auto');
        expect(subtitleHtml).toContain('overflow-y-auto');
        expect(musicHtml).toContain('overflow-y-auto');
    });

    it('switches the active config mode when clicking the rail', () => {
        const onModeChange = vi.fn();
        const rail = ModeRail({
            activeMode: 'voice',
            onModeChange
        });

        const buttons = rail.props.children as {
            props: Record<string, unknown>;
        }[];
        const subtitleButton = buttons.find(
            (button) => button.props['data-mode'] === 'subtitle'
        );

        expect(subtitleButton).toBeDefined();

        (subtitleButton?.props.onClick as () => void)();

        expect(onModeChange).toHaveBeenCalledWith('subtitle');
    });

    it('adds pointer cursor and hover transitions to the mode rail items', () => {
        const html = renderToStaticMarkup(
            createElement(ModeRail, {
                activeMode: 'voice',
                onModeChange: vi.fn()
            })
        );

        expect(html).toContain('cursor-pointer');
        expect(html).toContain('transition-all');
        expect(html).toContain('duration-200');
        expect(html).toContain('hover:-translate-y-[1px]');
        expect(html).toContain('hover:bg-white/5');
    });

    it('uses the borderless preview controls frame with compact lower spacing', () => {
        const html = renderToStaticMarkup(createElement(MiaojianEditorScreen));

        expect(html).toContain('grid-rows-[minmax(0,1fr)_58px]');
        expect(html).toContain('p-[16px_16px_8px]');
        expect(html).toContain(
            'grid h-[58px] w-full grid-cols-[1fr_40px_1fr] items-end'
        );
        expect(html).toContain(
            'grid h-10 w-10 place-items-center rounded-full bg-[#F05F73] text-white'
        );
        expect(html).toContain(
            'flex h-10 w-[88px] items-center justify-end gap-3'
        );
        expect(html).toContain(
            'grid h-9 w-9 place-items-center rounded-full bg-[#1A1D22] text-[#A9AFBA]'
        );
        expect(html).not.toContain('mt-[26px]');
        expect(html).not.toContain('h-[calc(100%-74px)]');
    });

    it('renders a project video through the Electron media protocol', () => {
        const project = structuredClone(sampleVideoProject);
        project.assets.videos[0]!.path =
            '/Users/heyi/Videos/miaojian/scene-01.mp4';
        project.assets.thumbnails[0]!.path =
            '/Users/heyi/Videos/miaojian/scene-01.jpg';
        const html = renderToStaticMarkup(
            createElement(MiaojianEditorScreen, { project })
        );

        expect(html).toContain('<video');
        expect(html).toContain('data-preview-source="project-video"');
        expect(html).toContain(
            'src="app-media://project/project_sample_001/video/video_asset_001"'
        );
        expect(html).toContain('preload="metadata"');
        expect(html).toContain(
            'poster="app-media://project/project_sample_001/thumbnail/thumbnail_asset_001"'
        );
        expect(html).toContain('<audio');
        expect(html).toContain(
            'src="app-media://project/project_sample_001/voice/voice_asset_001"'
        );
        expect(html).toContain('data-preview-music="true"');
        expect(html).toContain('data-preview-music-volume="0.6"');
        expect(html).toContain('Eutopia.m4a');
        expect(html).not.toContain('file:///Users/heyi/Videos/miaojian');
        expect(html).toContain('data-preview-subtitle-layer="true"');
        expect(html).toContain(
            'absolute inset-x-0 bottom-[50px] flex justify-center'
        );
        expect(html).toContain('data-preview-subtitle="true"');
        expect(html).toContain('inline-block max-w-[80%]');
        expect(html).toContain('text-[24px]');
        expect(html).toContain('font-size:24px');
        expect(html).not.toMatch(/(?:class="|\s)w-\[80%](?:\s|")/);
        expect(html).not.toContain('left-1/2 max-w-[80%]');
        expect(html).not.toContain('max-w-[86%]');
        expect(html).toContain('00:00:00 / 00:00:07');
        expect(html).toContain('data-duration-seconds="7.619"');
        expect(html).not.toContain('dSqyy.png');
    });

    it('switches video, voice, and subtitles by the current preview time', () => {
        const html = renderToStaticMarkup(
            createElement(PreviewPanel, {
                currentTimeMs: 12_000,
                data: {
                    alt: '测试预览',
                    durationMs: 20_000,
                    segments: [
                        {
                            alt: '第一段',
                            endMs: 10_000,
                            id: 'segment_01',
                            source: 'app-media://project/project_preview/video/video_01',
                            sourceEndMs: 10_000,
                            sourceStartMs: 0,
                            startMs: 0,
                            subtitleCues: [
                                {
                                    endMs: 10_000,
                                    id: 'subtitle_01',
                                    startMs: 0,
                                    text: '第一段字幕'
                                }
                            ],
                            voiceSource:
                                'app-media://project/project_preview/voice/voice_01'
                        },
                        {
                            alt: '第二段',
                            endMs: 20_000,
                            id: 'segment_02',
                            source: 'app-media://project/project_preview/video/video_02',
                            sourceEndMs: 10_000,
                            sourceStartMs: 0,
                            startMs: 10_000,
                            subtitleCues: [
                                {
                                    endMs: 15_000,
                                    id: 'subtitle_02',
                                    startMs: 10_000,
                                    text: '第二段字幕'
                                }
                            ],
                            voiceSource:
                                'app-media://project/project_preview/voice/voice_02'
                        }
                    ],
                    source: 'app-media://project/project_preview/video/video_01',
                    type: 'video'
                }
            })
        );

        expect(html).toContain(
            'src="app-media://project/project_preview/video/video_02"'
        );
        expect(html).toContain(
            'src="app-media://project/project_preview/voice/voice_02"'
        );
        expect(html).toContain('第二段字幕');
        expect(html).not.toContain('第一段字幕');
    });

    it('renders preview subtitles with the configured font size and preset colors', () => {
        const html = renderToStaticMarkup(
            createElement(PreviewPanel, {
                data: {
                    alt: '字幕样式预览',
                    durationMs: 4000,
                    segments: [
                        {
                            alt: '单分镜',
                            endMs: 4000,
                            id: 'segment_subtitle_style',
                            source: 'app-media://project/project_preview/video/video_subtitle_style',
                            sourceEndMs: 4000,
                            sourceStartMs: 0,
                            startMs: 0,
                            subtitleCues: [
                                {
                                    endMs: 4000,
                                    id: 'subtitle_style_01',
                                    startMs: 0,
                                    style: {
                                        fontSizePx: 32,
                                        outlineColor: '#050505',
                                        presetLabel: '黄字黑边',
                                        textColor: '#FFD400'
                                    },
                                    text: '样式后的字幕'
                                }
                            ]
                        }
                    ],
                    source: 'app-media://project/project_preview/video/video_subtitle_style',
                    type: 'video'
                }
            })
        );

        expect(html).toContain('样式后的字幕');
        expect(html).toContain('font-size:32px');
        expect(html).toContain('color:#FFD400');
        expect(html).toContain('-webkit-text-stroke:2px #050505');
        expect(html).toContain('data-preview-subtitle-preset="黄字黑边"');
    });

    it('keeps small preview subtitle text readable with a lighter outline', () => {
        const html = renderToStaticMarkup(
            createElement(PreviewPanel, {
                data: {
                    alt: '小字号字幕样式预览',
                    durationMs: 4000,
                    segments: [
                        {
                            alt: '单分镜',
                            endMs: 4000,
                            id: 'segment_small_subtitle_style',
                            source: 'app-media://project/project_preview/video/video_small_subtitle_style',
                            sourceEndMs: 4000,
                            sourceStartMs: 0,
                            startMs: 0,
                            subtitleCues: [
                                {
                                    endMs: 4000,
                                    id: 'subtitle_small_style_01',
                                    startMs: 0,
                                    style: {
                                        fontSizePx: 12,
                                        outlineColor: '#050505',
                                        presetLabel: '黄字黑边',
                                        textColor: '#FFD400'
                                    },
                                    text: '小字号字幕'
                                }
                            ]
                        }
                    ],
                    source: 'app-media://project/project_preview/video/video_small_subtitle_style',
                    type: 'video'
                }
            })
        );

        expect(html).toContain('font-size:12px');
        expect(html).toContain('-webkit-text-stroke:1px #050505');
        expect(html).not.toContain('-webkit-text-stroke:2px #050505');
    });

    it('switches multiple voice cues inside one video segment by the current preview time', () => {
        const html = renderToStaticMarkup(
            createElement(PreviewPanel, {
                currentTimeMs: 2200,
                data: {
                    alt: '单分镜多段配音',
                    durationMs: 3700,
                    segments: [
                        {
                            alt: '单个视频分镜',
                            endMs: 3700,
                            id: 'segment_01',
                            source: 'app-media://project/project_preview/video/video_01',
                            sourceEndMs: 3700,
                            sourceStartMs: 0,
                            startMs: 0,
                            subtitleCues: [
                                {
                                    endMs: 1400,
                                    id: 'subtitle_01',
                                    startMs: 0,
                                    text: '第一句字幕就是第一段配音'
                                },
                                {
                                    endMs: 3700,
                                    id: 'subtitle_02',
                                    startMs: 1400,
                                    text: '第二句字幕就是第二段配音'
                                }
                            ],
                            voiceCues: [
                                {
                                    endMs: 1400,
                                    id: 'voice_01',
                                    source: 'app-media://project/project_preview/voice/voice_01',
                                    startMs: 0
                                },
                                {
                                    endMs: 3700,
                                    id: 'voice_02',
                                    source: 'app-media://project/project_preview/voice/voice_02',
                                    startMs: 1400
                                }
                            ]
                        }
                    ],
                    source: 'app-media://project/project_preview/video/video_01',
                    type: 'video'
                }
            })
        );

        expect(html).toContain(
            'src="app-media://project/project_preview/voice/voice_02"'
        );
        expect(html).toContain('第二句字幕就是第二段配音');
        expect(html).not.toContain(
            'src="app-media://project/project_preview/voice/voice_01"'
        );
        expect(html).not.toContain('第一句字幕就是第一段配音');
    });

    it('separates preview voice playback instances when speed changes', () => {
        const source = 'app-media://project/project_preview/voice/voice_01';
        const normalSpeedKey = createPreviewVoicePlaybackKey({
            cueId: 'voice_01',
            playbackRate: 1,
            source
        });
        const fasterSpeedKey = createPreviewVoicePlaybackKey({
            cueId: 'voice_01',
            playbackRate: 1.25,
            source
        });
        const html = renderToStaticMarkup(
            createElement(PreviewPanel, {
                data: {
                    alt: '语速预览',
                    durationMs: 3000,
                    segments: [
                        {
                            alt: '单分镜',
                            endMs: 3000,
                            id: 'segment_01',
                            source: 'app-media://project/project_preview/video/video_01',
                            sourceEndMs: 3000,
                            sourceStartMs: 0,
                            startMs: 0,
                            subtitleCues: [],
                            voiceCues: [
                                {
                                    endMs: 3000,
                                    id: 'voice_01',
                                    playbackRate: 1.25,
                                    source,
                                    startMs: 0,
                                    volume: 0.72
                                }
                            ]
                        }
                    ],
                    source: 'app-media://project/project_preview/video/video_01',
                    type: 'video'
                }
            })
        );

        expect(normalSpeedKey).not.toBe(fasterSpeedKey);
        expect(html).toContain(`data-preview-voice-key="${fasterSpeedKey}"`);
        expect(html).toContain('data-preview-voice-playback-rate="1.25"');
    });

    it('applies preview speed to the video element playback rate', () => {
        const html = renderToStaticMarkup(
            createElement(PreviewPanel, {
                data: {
                    alt: '视频倍速预览',
                    durationMs: 4000,
                    segments: [
                        {
                            alt: '单分镜',
                            endMs: 4000,
                            id: 'segment_speed',
                            playbackRate: 2,
                            source: 'app-media://project/project_preview/video/video_speed',
                            sourceEndMs: 8000,
                            sourceStartMs: 0,
                            startMs: 0,
                            subtitleCues: []
                        }
                    ],
                    source: 'app-media://project/project_preview/video/video_speed',
                    type: 'video'
                }
            })
        );

        expect(html).toContain('data-preview-video-playback-rate="2"');
    });

    it('keeps the voice config content scrollable with a right-aligned slider rail', () => {
        const html = renderToStaticMarkup(
            createElement(ConfigPanel, { mode: 'voice' })
        );

        expect(html).toContain('overflow-y-auto');
        expect(html).toContain('flex-1');
        expect(html).toContain('min-w-0');
        expect(html).toContain('ml-auto');
        expect(html).toContain('w-[250px]');
        expect(html).toContain('shrink-0');
    });

    it('positions the subtitle preset glyphs like the Pencil frame', () => {
        const html = renderToStaticMarkup(
            createElement(ConfigPresetSwatch, {
                label: '白字黑边',
                active: true,
                backgroundColor: '#0D201B',
                borderColor: '#25D0B1',
                outerTextColor: '#000000',
                innerTextColor: '#F5F7FA'
            })
        );

        expect(html).toContain('absolute left-[8px] top-[6px]');
        expect(html).toContain('absolute left-[10px] top-[6px]');
        expect(html).not.toContain('grid h-[20px] place-items-center');
    });

    it('reuses the shared slider track primitive for voice and subtitle sliders', () => {
        const voiceHtml = renderToStaticMarkup(
            createElement(ConfigPanel, { mode: 'voice' })
        );
        const subtitleHtml = renderToStaticMarkup(
            createElement(SubtitleConfigPanel)
        );
        const sharedTrackMarkup =
            'absolute left-0 top-[5px] h-[6px] w-full rounded-full bg-[#30343C]';

        expect(voiceHtml).toContain(sharedTrackMarkup);
        expect(subtitleHtml).toContain(sharedTrackMarkup);
    });

    it('renders the updated custom voice library upload card', () => {
        const html = renderToStaticMarkup(
            createElement(ConfigPanel, { mode: 'voice' })
        );

        expect(html).toContain('自定义音色库');
        expect(html).toContain('rounded-[8px]');
        expect(html).toContain('w-[107px]');
    });

    it('wires subtitle setting controls to the editor preview state', () => {
        const editorSource = readFileSync(
            resolve(__dirname, '../renderer/pages/MiaojianEditorScreen.tsx'),
            'utf8'
        );
        const configPanelSource = readFileSync(
            resolve(__dirname, '../renderer/components/config/ConfigPanel.tsx'),
            'utf8'
        );
        const subtitlePanelSource = readFileSync(
            resolve(
                __dirname,
                '../renderer/components/config/subtitle/SubtitleConfigPanel.tsx'
            ),
            'utf8'
        );

        expect(editorSource).toContain('subtitleSettings');
        expect(editorSource).toContain(
            'onSubtitleSettingsChange={setSubtitleSettings}'
        );
        expect(configPanelSource).toContain('onSubtitleSettingsChange');
        expect(configPanelSource).toContain('subtitleSettings');
        expect(subtitlePanelSource).toContain('onValueChange={(fontSizePx)');
        expect(subtitlePanelSource).toContain('onToggle={() =>');
        expect(subtitlePanelSource).toContain('onClick={() =>');
    });

    it('moves the subtitle preset highlight with the selected style', () => {
        const html = renderToStaticMarkup(
            createElement(ConfigPanel, {
                mode: 'subtitle',
                subtitleSettings: {
                    fontSizePx: 18,
                    isVisible: true,
                    outlineColor: '#050505',
                    presetLabel: '黄字黑边',
                    textColor: '#FFD400'
                }
            })
        );

        expect(html).toContain(
            'aria-pressed="true" data-subtitle-preset="黄字黑边"'
        );
        expect(html).toContain(
            'data-subtitle-preset="黄字黑边" class="flex h-[36px] w-[32px] items-center justify-center rounded-[8px] border transition-all duration-200 hover:-translate-y-[1px]" style="background-color:#111214;border-color:#F05F73'
        );
        expect(html).toContain(
            'aria-pressed="false" data-subtitle-preset="白字黑边"'
        );
    });

    it('renders the subtitle settings rail from the Pencil frame', () => {
        const html = renderToStaticMarkup(
            createElement(ConfigPanel, { mode: 'subtitle' })
        );

        expect(html).toContain('字幕设置');
        expect(html).toContain('调整当前字幕轨显示样式');
        expect(html).toContain('显示字幕');
        expect(html).toContain('42 px');
        expect(html).toContain('字幕样式');
        expect(html).toContain('应用到当前字幕轨');
        expect(html).toContain('w-[260px]');
        expect(html).toContain('白字黑边');
        expect(html).toContain('经典白字');
        expect(html).toContain('黄字黑边');
        expect(html).toContain('红字白边');
        expect(html).toContain('青灰字幕');
        expect(html).toContain('粉色字幕');
        expect(html).toContain('蓝色字幕');
    });

    it('keeps the subtitle preset group at seven options with one active preset', () => {
        const html = renderToStaticMarkup(
            createElement(ConfigPanel, { mode: 'subtitle' })
        );
        const countMatches = (pattern: RegExp) =>
            html.match(pattern)?.length ?? 0;

        expect(countMatches(/<button type="button" aria-pressed="true"/g)).toBe(
            2
        );
        expect(
            countMatches(/<button type="button" aria-pressed="false"/g)
        ).toBe(6);
    });

    it('keeps page feature files in renderer-level architecture folders', () => {
        expect(existsSync(resolve(__dirname, '../renderer/editor'))).toBe(
            false
        );
        expect(
            existsSync(
                resolve(__dirname, '../renderer/pages/MiaojianEditorScreen.tsx')
            )
        ).toBe(true);
    });
});
