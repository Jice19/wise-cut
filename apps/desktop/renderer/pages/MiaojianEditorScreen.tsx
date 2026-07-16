
import { useEffect, useState } from 'react';

import type { VideoProject, VoiceClip } from '@wise-cut/video-project';

import type {
    CustomVoiceItem,
    CustomVoiceProviderStatus
} from '../../shared/custom-voice';
import {
    defaultVideoAgentVoice,
    normalizeVideoAgentVoiceSettings,
    videoAgentVoiceOptions,
    type VideoAgentVoiceSettings
} from '../../shared/video-agent-voices';
import type { VideoExportProgressEvent } from '../../shared/video-export';
import { ConfigPanel } from '../components/config/ConfigPanel';
import { EditorHeader } from '../components/EditorHeader';
import {
    type ExportDialogState,
    ExportProgressDialog
} from '../components/ExportProgressDialog';
import { ModeRail } from '../components/ModeRail';
import { PreviewPanel } from '../components/PreviewPanel';
import { ScriptPanel } from '../components/ScriptPanel';
import { TimelinePanel } from '../components/TimelinePanel';
import {
    defaultMusicSettings,
    defaultSubtitleSettings,
    editorConfigMode
} from '../constants/config';
import { editorHeader } from '../constants/editor-screen';
import {
    applySceneRegenerationStreamEvent,
    createSceneRegenerationPendingConversation,
    resolveSceneVoiceOption
} from '../mappers/scene-regeneration-conversation';
import {
    applyVoiceSettingsToVideoProject,
    createEditorScreenData,
    createPlaybackStoryboard,
    createTimelinePlayhead
} from '../mappers/video-project-to-editor';
import type {
    ConfigMode,
    MusicSettings,
    SubtitleSettings,
    VoiceRegenerationProgress,
    VoiceSelection
} from '../types/config';
import type { StoryboardItem, TimelineData } from '../types/editor-screen';

const createPlaybackTimeline = ({
    currentTimeMs,
    durationMs,
    timeline
}: {
    currentTimeMs: number;
    durationMs: number;
    timeline: TimelineData;
}): TimelineData => {
    return {
        ...timeline,
        playhead: createTimelinePlayhead({
            currentTimeMs,
            durationMs
        })
    };
};

export const advancePlaybackTime = ({
    currentTimeMs,
    durationMs,
    elapsedMs
}: {
    currentTimeMs: number;
    durationMs: number;
    elapsedMs: number;
}) => Math.min(currentTimeMs + Math.max(0, elapsedMs), durationMs);

const createAnimationClock = (onFrame: (elapsedMs: number) => boolean) => {
    let frameId = 0;
    let isStopped = false;
    let lastTimeMs = window.performance.now();

    const tick = (timeMs: number) => {
        if (isStopped) return;

        const elapsedMs = timeMs - lastTimeMs;
        lastTimeMs = timeMs;
        isStopped = onFrame(elapsedMs);

        if (isStopped) return;

        frameId = window.requestAnimationFrame(tick);
    };

    frameId = window.requestAnimationFrame(tick);

    return () => {
        isStopped = true;
        window.cancelAnimationFrame(frameId);
    };
};

const createSelectedSceneContext = (item?: StoryboardItem) => {
    if (!item?.sceneId) return undefined;

    return {
        endMs: item.endMs,
        id: item.sceneId,
        label: item.title,
        script: item.body,
        startMs: item.startMs
    };
};

const resolveProjectVoiceSettings = (
    project?: VideoProject
): VideoAgentVoiceSettings => {
    const voiceTrack = project?.tracks.find((track) => track.kind === 'voice');
    const voiceClip = voiceTrack?.clips.find(
        (clip): clip is VoiceClip => clip.kind === 'voice'
    );

    return normalizeVideoAgentVoiceSettings({
        voiceSpeed: voiceClip?.speed,
        voiceVolume: voiceClip?.volume
    });
};

const resolveProjectVoiceSelection = (
    project?: VideoProject
): VoiceSelection => {
    const voiceTrack = project?.tracks.find((track) => track.kind === 'voice');
    const voiceClip = voiceTrack?.clips.find(
        (clip): clip is VoiceClip => clip.kind === 'voice'
    );
    const voiceAsset = project?.assets.voices.find(
        (asset) => asset.id === voiceClip?.assetId
    );
    const voiceType =
        voiceAsset?.voice ??
        voiceClip?.voicePreset ??
        defaultVideoAgentVoice.voiceType;
    const matchedOption = videoAgentVoiceOptions.find(
        (option) =>
            option.voiceType === voiceType ||
            option.label === voiceClip?.voicePreset
    );

    return {
        title:
            matchedOption?.label ??
            voiceClip?.voicePreset ??
            defaultVideoAgentVoice.label,
        voiceType: matchedOption?.voiceType ?? voiceType
    };
};

export const MiaojianEditorScreen = ({
    project
}: {
    project?: VideoProject;
} = {}) => {
    const [activeMode, setActiveMode] = useState<ConfigMode>(editorConfigMode);
    const [committedTimeMs, setCommittedTimeMs] = useState(0);
    const [currentProject, setCurrentProject] = useState(project);
    const [hoverPreviewTimeMs, setHoverPreviewTimeMs] = useState<
        number | undefined
    >();
    const [isPreviewPlaying, setIsPreviewPlaying] = useState(false);
    const [exportDialogState, setExportDialogState] = useState<
        ExportDialogState | undefined
    >();
    const [exportOutputPath, setExportOutputPath] = useState<
        string | undefined
    >();
    const [isExporting, setIsExporting] = useState(false);
    const [exportProgress, setExportProgress] = useState<
        VideoExportProgressEvent | undefined
    >();
    const [isQuickAdjustmentSceneLinked, setIsQuickAdjustmentSceneLinked] =
        useState(true);
    const [customVoiceStatus, setCustomVoiceStatus] = useState<
        CustomVoiceProviderStatus | undefined
    >();
    const [customVoices, setCustomVoices] = useState<CustomVoiceItem[]>([]);
    const [isUploadingCustomVoice, setIsUploadingCustomVoice] = useState(false);
    const [isRegeneratingScene, setIsRegeneratingScene] = useState(false);
    const [isRegeneratingVoices, setIsRegeneratingVoices] = useState(false);
    const [voiceRegenerationRunId, setVoiceRegenerationRunId] = useState<
        string | undefined
    >();
    const [voiceRegenerationProgress, setVoiceRegenerationProgress] = useState<
        VoiceRegenerationProgress | undefined
    >();
    const [selectedSceneId, setSelectedSceneId] = useState<
        string | undefined
    >();
    const [titleSaveStatus, setTitleSaveStatus] = useState(editorHeader.status);
    const [voicePreviewStopSignal, setVoicePreviewStopSignal] = useState(0);
    const [musicSettings, setMusicSettings] =
        useState<MusicSettings>(defaultMusicSettings);
    const [subtitleSettings, setSubtitleSettings] = useState<SubtitleSettings>(
        defaultSubtitleSettings
    );
    const [voiceSettings, setVoiceSettings] = useState<VideoAgentVoiceSettings>(
        () => resolveProjectVoiceSettings(project)
    );
    const [selectedVoice, setSelectedVoice] = useState<VoiceSelection>(() =>
        resolveProjectVoiceSelection(project)
    );
    const previewProject = currentProject
        ? applyVoiceSettingsToVideoProject({
              project: currentProject,
              settings: voiceSettings
          })
        : undefined;
    const editorData = createEditorScreenData(previewProject, {
        musicSettings,
        subtitleSettings
    });
    const canHoverPreviewTimeline = !isPreviewPlaying;
    const previewTimeMs = canHoverPreviewTimeline
        ? (hoverPreviewTimeMs ?? committedTimeMs)
        : committedTimeMs;
    const shouldPlayPreview = isPreviewPlaying;
    const timelineData = createPlaybackTimeline({
        currentTimeMs: committedTimeMs,
        durationMs: editorData.preview.durationMs,
        timeline: editorData.timeline
    });
    const storyboardData = createPlaybackStoryboard({
        currentTimeMs: previewTimeMs,
        storyboard: editorData.storyboard
    });
    const editorTitle = currentProject?.project.title ?? editorHeader.title;
    const selectedStoryboardItem =
        storyboardData.items.find((item) => item.sceneId === selectedSceneId) ??
        storyboardData.items.find((item) => item.tone === 'current') ??
        storyboardData.items[0];
    const selectedScene = isQuickAdjustmentSceneLinked
        ? createSelectedSceneContext(selectedStoryboardItem)
        : undefined;

    useEffect(() => {
        setCurrentProject(project);
        setCommittedTimeMs(0);
        setHoverPreviewTimeMs(undefined);
        setExportDialogState(undefined);
        setExportOutputPath(undefined);
        setExportProgress(undefined);
        setIsPreviewPlaying(false);
        setIsExporting(false);
        setIsQuickAdjustmentSceneLinked(true);
        setIsRegeneratingScene(false);
        setIsRegeneratingVoices(false);
        setVoiceRegenerationRunId(undefined);
        setVoiceRegenerationProgress(undefined);
        setSelectedSceneId(undefined);
        setTitleSaveStatus(editorHeader.status);
        setMusicSettings(defaultMusicSettings);
        setSubtitleSettings(defaultSubtitleSettings);
        setVoicePreviewStopSignal(0);
        setVoiceSettings(resolveProjectVoiceSettings(project));
        setSelectedVoice(resolveProjectVoiceSelection(project));
    }, [project]);

    useEffect(() => {
        if (typeof window === 'undefined' || !window.miaomaAPI?.customVoice) {
            return;
        }

        void window.miaomaAPI.customVoice.checkIndexTts2().then((result) => {
            if (result.success) {
                setCustomVoiceStatus(result.data);
            }
        });
        void window.miaomaAPI.customVoice.list().then((result) => {
            if (result.success) {
                setCustomVoices(result.data);
            }
        });
    }, []);

    useEffect(() => {
        setCommittedTimeMs((current) =>
            Math.min(current, editorData.preview.durationMs)
        );
        setHoverPreviewTimeMs((current) =>
            typeof current === 'number'
                ? Math.min(current, editorData.preview.durationMs)
                : current
        );
    }, [editorData.preview.durationMs]);

    useEffect(() => {
        if (!isPreviewPlaying) return undefined;

        return createAnimationClock((elapsedMs) => {
            let reachedEnd = false;

            setCommittedTimeMs((current) => {
                const nextTimeMs = advancePlaybackTime({
                    currentTimeMs: current,
                    durationMs: editorData.preview.durationMs,
                    elapsedMs
                });

                if (nextTimeMs >= editorData.preview.durationMs) {
                    reachedEnd = true;
                }

                return nextTimeMs;
            });

            if (reachedEnd) {
                setIsPreviewPlaying(false);
            }

            return reachedEnd;
        });
    }, [editorData.preview.durationMs, isPreviewPlaying]);

    const commitPreviewTime = (timeMs: number) => {
        const nextTimeMs = Math.min(
            Math.max(timeMs, 0),
            editorData.preview.durationMs
        );

        setCommittedTimeMs(nextTimeMs);
        setHoverPreviewTimeMs(undefined);
    };

    const clearHoverPreviewTime = () => {
        setHoverPreviewTimeMs(undefined);
    };

    const handleSceneSelect = ({
        sceneId,
        startMs
    }: {
        sceneId: string;
        startMs: number;
    }) => {
        setSelectedSceneId(sceneId);
        setIsQuickAdjustmentSceneLinked(true);
        commitPreviewTime(startMs);
    };

    const handleRegenerateScene = async ({
        prompt,
        sceneId
    }: {
        prompt: string;
        sceneId: string;
    }) => {
        if (!currentProject) return;

        if (typeof window === 'undefined' || !window.miaomaAPI?.videoAgent) {
            setTitleSaveStatus('分镜优化失败');
            return;
        }

        const requestProject = currentProject;
        const voiceOption = resolveSceneVoiceOption({
            project: requestProject,
            sceneId
        });
        const normalizedVoiceSettings =
            normalizeVideoAgentVoiceSettings(voiceSettings);
        const sceneLabel = selectedScene?.label ?? sceneId;

        setIsQuickAdjustmentSceneLinked(false);
        setIsRegeneratingScene(true);
        setTitleSaveStatus('正在优化当前分镜');
        setCurrentProject({
            ...requestProject,
            ai: {
                ...requestProject.ai,
                conversation: createSceneRegenerationPendingConversation({
                    conversation: requestProject.ai.conversation ?? [],
                    now: () => new Date().toISOString(),
                    prompt,
                    sceneLabel
                })
            }
        });
        const unsubscribe = window.miaomaAPI.videoAgent.onEvent((event) => {
            if (!event.runId.startsWith('regen_')) return;
            if (
                event.type !== 'model.stream.started' &&
                event.type !== 'model.stream.delta' &&
                event.type !== 'model.stream.completed'
            ) {
                return;
            }

            setCurrentProject((current) => {
                if (!current) return current;

                return {
                    ...current,
                    ai: {
                        ...current.ai,
                        conversation: applySceneRegenerationStreamEvent({
                            conversation: current.ai.conversation ?? [],
                            event
                        })
                    }
                };
            });
        });

        try {
            const result = await window.miaomaAPI.videoAgent.regenerateScene({
                projectId: requestProject.project.id,
                prompt,
                sceneId,
                selectedVoice: voiceOption.selectedVoice,
                selectedVoiceType: voiceOption.selectedVoiceType,
                voiceSpeed: normalizedVoiceSettings.voiceSpeed,
                voiceVolume: normalizedVoiceSettings.voiceVolume
            });

            if (result.success === false) {
                setTitleSaveStatus('分镜优化失败');
                return;
            }

            const loaded = await window.miaomaAPI.videoProject.readById(
                requestProject.project.id
            );

            if (loaded.success === false) {
                setTitleSaveStatus('分镜优化已完成，重新加载失败');
                return;
            }

            setCurrentProject(loaded.data);
            setSelectedSceneId(sceneId);
            setTitleSaveStatus('刚刚更新 · 已自动保存');
        } catch {
            setTitleSaveStatus('分镜优化失败');
        } finally {
            unsubscribe();
            setIsRegeneratingScene(false);
        }
    };

    const handleProjectTitleChange = (title: string) => {
        if (!currentProject) return;

        const nextTitle = title.trim();

        if (!nextTitle || nextTitle === currentProject.project.title) return;

        const nextProject: VideoProject = {
            ...currentProject,
            project: {
                ...currentProject.project,
                title: nextTitle,
                updatedAt: new Date().toISOString()
            }
        };

        setCurrentProject(nextProject);
        setTitleSaveStatus('正在保存项目标题');

        if (typeof window === 'undefined' || !window.miaomaAPI?.videoProject) {
            setTitleSaveStatus('标题保存失败');
            return;
        }

        void window.miaomaAPI.videoProject
            .create(nextProject)
            .then((result) => {
                setTitleSaveStatus(
                    result.success ? '刚刚更新 · 已自动保存' : '标题保存失败'
                );
            })
            .catch(() => {
                setTitleSaveStatus('标题保存失败');
            });
    };

    const handleRegenerateVoices = async ({
        selectedVoice,
        selectedVoiceType
    }: {
        selectedVoice: string;
        selectedVoiceType?: string;
    }) => {
        if (!currentProject) return;

        if (typeof window === 'undefined' || !window.miaomaAPI?.videoAgent) {
            setTitleSaveStatus('口播音轨生成失败');
            return;
        }

        const requestProject = currentProject;
        const normalizedVoiceSettings =
            normalizeVideoAgentVoiceSettings(voiceSettings);

        setHoverPreviewTimeMs(undefined);
        setIsPreviewPlaying(false);
        setIsRegeneratingVoices(true);
        setVoiceRegenerationRunId(undefined);
        setVoiceRegenerationProgress({
            current: 0,
            message: '正在准备口播音轨',
            percent: 0,
            total: 0
        });
        setTitleSaveStatus('正在生成口播音轨');

        let acceptedRunId: string | undefined;
        let isFinished = false;
        let unsubscribe: () => void = () => undefined;
        const finishRegeneration = async ({
            nextStatus,
            reloadProject
        }: {
            nextStatus: string;
            reloadProject: boolean;
        }): Promise<void> => {
            if (isFinished) return;

            isFinished = true;
            unsubscribe();

            if (reloadProject) {
                const loaded = await window.miaomaAPI.videoProject.readById(
                    requestProject.project.id
                );

                if (loaded.success === false) {
                    setTitleSaveStatus('口播音轨已生成，重新加载失败');
                    setIsRegeneratingVoices(false);
                    setVoiceRegenerationRunId(undefined);
                    setVoiceRegenerationProgress(undefined);
                    return;
                }

                setCurrentProject(loaded.data);
                setCommittedTimeMs(0);
                setSelectedSceneId(undefined);
            }

            setTitleSaveStatus(nextStatus);
            setIsRegeneratingVoices(false);
            setVoiceRegenerationRunId(undefined);
            setVoiceRegenerationProgress(undefined);
        };
        unsubscribe = window.miaomaAPI.videoAgent.onEvent((event) => {
            if (!event.runId.startsWith('voice_regen_')) return;
            if (acceptedRunId && event.runId !== acceptedRunId) return;

            acceptedRunId = event.runId;
            setVoiceRegenerationRunId(event.runId);

            if (event.type === 'voice.regeneration.progress') {
                setVoiceRegenerationProgress({
                    current: event.current,
                    message: event.message,
                    percent: event.percent,
                    total: event.total
                });
                setTitleSaveStatus(
                    event.message ?? `正在生成口播音轨 · ${event.percent}%`
                );
                return;
            }

            if (event.type === 'run.completed') {
                void finishRegeneration({
                    nextStatus: '刚刚更新 · 已自动保存',
                    reloadProject: true
                });
                return;
            }

            if (event.type === 'run.failed') {
                void finishRegeneration({
                    nextStatus: `口播音轨生成失败：${event.error}`,
                    reloadProject: false
                });
                return;
            }

            if (event.type === 'run.cancelled') {
                void finishRegeneration({
                    nextStatus: '已取消口播音轨生成',
                    reloadProject: false
                });
            }
        });

        try {
            const result = await window.miaomaAPI.videoAgent.regenerateVoices({
                projectId: requestProject.project.id,
                selectedVoice,
                selectedVoiceType,
                voiceSpeed: normalizedVoiceSettings.voiceSpeed,
                voiceVolume: normalizedVoiceSettings.voiceVolume
            });

            if (result.success === false) {
                unsubscribe();
                setTitleSaveStatus('口播音轨生成失败');
                setIsRegeneratingVoices(false);
                setVoiceRegenerationRunId(undefined);
                setVoiceRegenerationProgress(undefined);
                return;
            }

            if (!isFinished) {
                acceptedRunId = result.data.runId;
                setVoiceRegenerationRunId(result.data.runId);
            }
        } catch {
            unsubscribe();
            setTitleSaveStatus('口播音轨生成失败');
            setIsRegeneratingVoices(false);
            setVoiceRegenerationRunId(undefined);
            setVoiceRegenerationProgress(undefined);
        }
    };

    const handleCancelRegenerateVoices = async () => {
        if (
            !voiceRegenerationRunId ||
            typeof window === 'undefined' ||
            !window.miaomaAPI?.videoAgent
        ) {
            return;
        }

        setTitleSaveStatus('正在取消口播音轨生成');
        setVoiceRegenerationProgress((current) =>
            current
                ? {
                      ...current,
                      message: '正在取消口播音轨生成'
                  }
                : current
        );

        const result = await window.miaomaAPI.videoAgent.cancel({
            runId: voiceRegenerationRunId
        });

        if (result.success === false) {
            setTitleSaveStatus(`取消失败：${result.error.message}`);
        }
    };

    const handleImportCustomVoice = async () => {
        if (typeof window === 'undefined' || !window.miaomaAPI?.customVoice) {
            setTitleSaveStatus('自定义音色库不可用');
            return undefined;
        }

        setIsUploadingCustomVoice(true);
        setTitleSaveStatus('正在导入自定义音色');

        try {
            const status = await window.miaomaAPI.customVoice.checkIndexTts2();

            if (status.success) {
                setCustomVoiceStatus(status.data);

                if (!status.data.available) {
                    setTitleSaveStatus('本地 IndexTTS2 未就绪');
                    return undefined;
                }
            }

            const imported =
                await window.miaomaAPI.customVoice.importReferenceAudio();

            if (imported.success === false) {
                setTitleSaveStatus(
                    imported.error.code === 'IMPORT_CANCELLED'
                        ? editorHeader.status
                        : `自定义音色导入失败：${imported.error.message}`
                );
                return undefined;
            }

            const listed = await window.miaomaAPI.customVoice.list();
            const nextVoices = listed.success
                ? listed.data
                : [...customVoices, imported.data.voice];

            setCustomVoices(nextVoices);
            setSelectedVoice({
                title: imported.data.voice.title,
                voiceType: imported.data.voice.voiceType
            });
            setTitleSaveStatus('自定义音色已导入');

            return imported.data.voice;
        } catch (error) {
            const message =
                error instanceof Error ? error.message : String(error);

            setTitleSaveStatus(`自定义音色导入失败：${message}`);
            return undefined;
        } finally {
            setIsUploadingCustomVoice(false);
        }
    };

    const handlePreviewPlaybackToggle = () => {
        setHoverPreviewTimeMs(undefined);

        if (!isPreviewPlaying) {
            setVoicePreviewStopSignal((value) => value + 1);
        }

        setIsPreviewPlaying((current) => !current);
    };

    const handleOpenExportDialog = () => {
        if (!previewProject) {
            setTitleSaveStatus('暂无可导出的项目');
            return;
        }

        if (typeof window === 'undefined' || !window.miaomaAPI?.videoExport) {
            setTitleSaveStatus('导出服务不可用');
            return;
        }

        setExportDialogState('idle');
        setExportProgress(undefined);
    };

    const handleChooseExportPath = async () => {
        if (typeof window === 'undefined' || !window.miaomaAPI?.videoExport) {
            setTitleSaveStatus('导出服务不可用');
            return;
        }

        const result = await window.miaomaAPI.videoExport.selectOutputPath({
            projectTitle: editorTitle
        });

        if (result.success === false) {
            if (result.error.code !== 'CANCELLED') {
                setTitleSaveStatus(`路径选择失败：${result.error.message}`);
            }

            return;
        }

        setExportOutputPath(result.data.outputPath);
    };

    const handleExportVideo = async () => {
        if (!previewProject) {
            setTitleSaveStatus('暂无可导出的项目');
            return;
        }

        if (!exportOutputPath) {
            setTitleSaveStatus('请先选择导出路径');
            return;
        }

        if (typeof window === 'undefined' || !window.miaomaAPI?.videoExport) {
            setTitleSaveStatus('导出服务不可用');
            return;
        }

        setHoverPreviewTimeMs(undefined);
        setIsPreviewPlaying(false);
        setIsExporting(true);
        setExportDialogState('running');
        setExportProgress({
            message: '正在准备导出资源',
            percent: 5,
            phase: 'preparing'
        });
        setTitleSaveStatus('正在渲染导出');

        const unsubscribeProgress =
            window.miaomaAPI.videoExport.onProgress(setExportProgress);

        try {
            const result = await window.miaomaAPI.videoExport.render({
                musicSettings,
                outputPath: exportOutputPath,
                project: previewProject,
                subtitleSettings
            });

            if (result.success === false) {
                setTitleSaveStatus(
                    result.error.code === 'CANCELLED'
                        ? '已取消导出'
                        : `导出失败：${result.error.message}`
                );
                setExportProgress({
                    message:
                        result.error.code === 'CANCELLED'
                            ? '用户取消导出'
                            : result.error.message,
                    percent: 100,
                    phase:
                        result.error.code === 'CANCELLED'
                            ? 'cancelled'
                            : 'failed'
                });
                setExportDialogState(
                    result.error.code === 'CANCELLED' ? 'cancelled' : 'failed'
                );
                return;
            }

            setExportProgress({
                message: '导出完成',
                percent: 100,
                phase: 'completed'
            });
            setExportDialogState('completed');
            setTitleSaveStatus(`已导出到 ${result.data.outputPath}`);
        } catch (error) {
            const message =
                error instanceof Error ? error.message : String(error);

            setTitleSaveStatus(`导出失败：${message}`);
            setExportProgress({
                message,
                percent: 100,
                phase: 'failed'
            });
            setExportDialogState('failed');
        } finally {
            unsubscribeProgress();
            setIsExporting(false);
        }
    };

    return (
        <main
            aria-label={editorHeader.ariaLabel}
            className="h-screen min-h-[720px] overflow-hidden bg-[#0E0F12] text-[#F5F7FA]"
        >
            <div className="flex h-full min-w-[1280px] flex-col">
                <EditorHeader
                    onPrimaryAction={handleOpenExportDialog}
                    status={titleSaveStatus}
                    title={editorTitle}
                    primaryActionDisabled={isExporting}
                    primaryActionLabel={isExporting ? '导出中' : undefined}
                    onTitleChange={handleProjectTitleChange}
                />
                <section className="grid min-h-0 flex-1 grid-cols-[300px_minmax(420px,1fr)_320px_59px]">
                    <ScriptPanel
                        autoScrollActiveItem={isPreviewPlaying}
                        data={storyboardData}
                        onSceneSelect={handleSceneSelect}
                        onSeek={commitPreviewTime}
                    />
                    <PreviewPanel
                        currentTimeMs={previewTimeMs}
                        data={editorData.preview}
                        isPlaying={shouldPlayPreview}
                        onTogglePlayback={handlePreviewPlaybackToggle}
                    />
                    <ConfigPanel
                        conversation={currentProject?.ai.conversation}
                        customVoiceStatus={customVoiceStatus}
                        customVoices={customVoices}
                        isRegeneratingScene={isRegeneratingScene}
                        isRegeneratingVoices={isRegeneratingVoices}
                        isUploadingCustomVoice={isUploadingCustomVoice}
                        mode={activeMode}
                        musicSettings={musicSettings}
                        onClearSelectedScene={() => {
                            setIsQuickAdjustmentSceneLinked(false);
                        }}
                        onCancelRegenerateVoices={handleCancelRegenerateVoices}
                        onMusicSettingsChange={setMusicSettings}
                        onImportCustomVoice={handleImportCustomVoice}
                        onRegenerateScene={handleRegenerateScene}
                        onRegenerateVoices={handleRegenerateVoices}
                        onSubtitleSettingsChange={setSubtitleSettings}
                        onVoiceSelectionChange={setSelectedVoice}
                        onVoiceSettingsChange={setVoiceSettings}
                        selectedScene={selectedScene}
                        selectedVoice={selectedVoice}
                        subtitleSettings={subtitleSettings}
                        voicePreviewStopSignal={voicePreviewStopSignal}
                        voiceRegenerationProgress={voiceRegenerationProgress}
                        voiceSettings={voiceSettings}
                    />
                    <ModeRail
                        activeMode={activeMode}
                        onModeChange={setActiveMode}
                    />
                </section>
                <TimelinePanel
                    data={timelineData}
                    durationMs={editorData.preview.durationMs}
                    hoverTimeMs={
                        canHoverPreviewTimeline ? hoverPreviewTimeMs : undefined
                    }
                    onPointerTimeClear={
                        canHoverPreviewTimeline
                            ? clearHoverPreviewTime
                            : undefined
                    }
                    onPointerTimeCommit={commitPreviewTime}
                    onPointerTimePreview={
                        canHoverPreviewTimeline
                            ? setHoverPreviewTimeMs
                            : undefined
                    }
                    onSceneSelect={handleSceneSelect}
                />
                <ExportProgressDialog
                    durationMs={editorData.preview.durationMs}
                    outputPath={exportOutputPath}
                    progress={exportProgress}
                    state={exportDialogState}
                    onChoosePath={handleChooseExportPath}
                    onClose={() => {
                        if (isExporting) return;

                        setExportDialogState(undefined);
                        setExportProgress(undefined);
                    }}
                    onStartExport={handleExportVideo}
                />
            </div>
        </main>
    );
};
