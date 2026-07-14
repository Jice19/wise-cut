/**
 * Editor screen —— commit 9.2 重写为消费真实 VideoProject。
 *
 * 数据流:
 *   URL /editor/:projectId → useParams 拿 projectId
 *   → useEffect 调 miaomaAPI.readVideoProject({projectId})
 *   → 拿 VideoProject(commit 7 schema) → 渲染 timeline + 分镜列表 + 元信息
 *
 * 不做 frame-level trim/splice(留 Phase 5)。
 */

import type {
    Scene,
    TimelineClip,
    VideoProject
} from '@miaoma-magicut/video-project';
import { useEffect, useState } from 'react';
import { useParams } from 'react-router-dom';

import { AppShell } from '@/components/app-shell';

const formatTime = (ms: number): string => {
    const totalSec = Math.round(ms / 1000);
    const min = Math.floor(totalSec / 60);
    const sec = totalSec % 60;
    return `${min}:${String(sec).padStart(2, '0')}`;
};

const formatDate = (iso: string): string => {
    if (!iso) return '';
    try {
        return new Date(iso).toLocaleString('zh-CN');
    } catch {
        return iso;
    }
};

const findSceneByClip = (
    scenes: Scene[],
    clip: TimelineClip
): Scene | undefined => scenes.find((s) => s.sceneId === clip.assetId);

const TIMELINE_WIDTH_PX = 800;

export const EditorScreen = (): JSX.Element => {
    const params = useParams<{ projectId?: string }>();
    const projectId = params.projectId ?? 'proj-default';

    const [project, setProject] = useState<VideoProject | null>(null);
    const [loadError, setLoadError] = useState<string | null>(null);
    const [selectedSceneIndex, setSelectedSceneIndex] = useState(0);

    useEffect(() => {
        let cancelled = false;
        setLoadError(null);
        setProject(null);
        window.miaomaAPI
            .readVideoProject({ projectId })
            .then((result) => {
                if (!cancelled) setProject(result as VideoProject);
            })
            .catch((err: Error) => {
                if (!cancelled) setLoadError(err.message);
            });
        return () => {
            cancelled = true;
        };
    }, [projectId]);

    if (loadError) {
        return (
            <AppShell pageLabel="编辑器">
                <div className="flex h-full items-center justify-center p-8">
                    <div className="rounded-lg border border-danger bg-danger-soft p-6 text-center">
                        <p className="text-sm font-semibold text-danger">
                            加载项目失败
                        </p>
                        <p className="mt-2 text-xs text-text-secondary">
                            {loadError}
                        </p>
                    </div>
                </div>
            </AppShell>
        );
    }

    if (!project) {
        return (
            <AppShell pageLabel="编辑器">
                <div className="flex h-full items-center justify-center text-text-tertiary">
                    加载中...
                </div>
            </AppShell>
        );
    }

    const totalDurationMs = project.canvas.durationMs;
    // commit 9.2 阶段 scenes 存在 AiRunMetadata.metadata,ProjectMetadata 不含
    // 这里用 tracks 推算分镜列表(每个 video clip = 1 个分镜)
    const scenes: Scene[] = [];
    const videoTrack = project.tracks.find((t) => t.kind === 'video');
    const voiceTrack = project.tracks.find((t) => t.kind === 'voice');
    const derivedScenes = (videoTrack?.clips ?? []).map((clip, idx) => {
        const matched = findSceneByClip(scenes, clip);
        return {
            clip,
            endMs: clip.endMs,
            index: idx,
            matched,
            startMs: clip.startMs
        };
    });
    const selected = derivedScenes[selectedSceneIndex];

    return (
        <AppShell pageLabel={`编辑器 · ${project.metadata.title}`}>
            <div className="flex h-full gap-2 overflow-hidden p-2">
                {/* 左侧:分镜列表 */}
                <aside className="flex w-[320px] flex-shrink-0 flex-col gap-3 overflow-y-auto rounded-lg border border-border-subtle bg-bg-elevated p-4">
                    <header>
                        <h2 className="text-sm font-semibold text-text-primary">
                            分镜列表
                        </h2>
                        <p className="mt-1 text-xs text-text-tertiary">
                            {derivedScenes.length} 个分镜 ·{' '}
                            {formatTime(totalDurationMs)} 总时长
                        </p>
                    </header>
                    <ol className="flex flex-col gap-2">
                        {derivedScenes.map((s) => {
                            const active = s.index === selectedSceneIndex;
                            return (
                                <li key={s.index}>
                                    <button
                                        type="button"
                                        onClick={() =>
                                            setSelectedSceneIndex(s.index)
                                        }
                                        className={[
                                            'flex w-full flex-col gap-1 rounded-md border p-3 text-left text-xs transition',
                                            active
                                                ? 'border-brand bg-brand-soft text-brand'
                                                : 'border-border-subtle bg-bg-base text-text-secondary hover:bg-bg-hover'
                                        ].join(' ')}
                                    >
                                        <div className="flex items-center justify-between">
                                            <span className="font-semibold">
                                                分镜 {s.index + 1}
                                            </span>
                                            <span className="text-[10px]">
                                                {formatTime(s.startMs)} -{' '}
                                                {formatTime(s.endMs)}
                                            </span>
                                        </div>
                                        {s.matched?.narration ? (
                                            <p className="line-clamp-2 text-text-primary">
                                                {s.matched.narration}
                                            </p>
                                        ) : (
                                            <p className="text-text-tertiary">
                                                素材:{s.clip.assetId}
                                            </p>
                                        )}
                                    </button>
                                </li>
                            );
                        })}
                    </ol>
                </aside>

                {/* 主区:预览 + 时间线 */}
                <div className="flex min-w-0 flex-1 flex-col gap-2">
                    {/* 预览区 */}
                    <div className="flex aspect-video items-center justify-center overflow-hidden rounded-lg border border-border-subtle bg-bg-base">
                        {selected ? (
                            <div className="flex flex-col items-center gap-3 p-6 text-center">
                                <div className="text-3xl font-bold text-text-primary">
                                    分镜 {selected.index + 1}
                                </div>
                                <p className="max-w-md text-sm text-text-secondary">
                                    {selected.matched?.narration ??
                                        `素材 ${selected.clip.assetId}`}
                                </p>
                                {selected.matched?.visualBrief && (
                                    <p className="max-w-md text-xs italic text-text-tertiary">
                                        画面:{selected.matched.visualBrief}
                                    </p>
                                )}
                                <p className="text-xs text-text-tertiary">
                                    {formatTime(selected.startMs)} -{' '}
                                    {formatTime(selected.endMs)}
                                </p>
                            </div>
                        ) : (
                            <p className="text-text-tertiary">无分镜</p>
                        )}
                    </div>

                    {/* 时间线 */}
                    <div className="rounded-lg border border-border-subtle bg-bg-elevated p-4">
                        <div className="mb-2 flex items-center justify-between text-xs text-text-secondary">
                            <span>时间线</span>
                            <span>
                                {videoTrack?.clips.length ?? 0} 视频 ·{' '}
                                {voiceTrack?.clips.length ?? 0} 配音
                            </span>
                        </div>
                        <div
                            className="relative h-20 overflow-hidden rounded bg-bg-sunken"
                            style={{ width: TIMELINE_WIDTH_PX }}
                        >
                            {derivedScenes.map((s) => {
                                const left =
                                    (s.startMs / totalDurationMs) *
                                    TIMELINE_WIDTH_PX;
                                const width =
                                    ((s.endMs - s.startMs) / totalDurationMs) *
                                    TIMELINE_WIDTH_PX;
                                return (
                                    <div
                                        key={`v-${s.index}`}
                                        className={[
                                            'absolute top-1 h-7 rounded border-2 px-2 text-[10px] flex items-center overflow-hidden',
                                            s.index === selectedSceneIndex
                                                ? 'border-brand bg-brand text-text-on-brand'
                                                : 'border-border-subtle bg-bg-hover text-text-secondary'
                                        ].join(' ')}
                                        style={{ left, width }}
                                        onClick={() =>
                                            setSelectedSceneIndex(s.index)
                                        }
                                    >
                                        分镜 {s.index + 1}
                                    </div>
                                );
                            })}
                            {/* voice track bar */}
                            <div className="absolute bottom-1 h-3 w-full rounded bg-success opacity-60" />
                        </div>
                    </div>
                </div>

                {/* 右侧:元信息 + 操作 */}
                <aside className="flex w-[280px] flex-shrink-0 flex-col gap-3 rounded-lg border border-border-subtle bg-bg-elevated p-4">
                    <h2 className="text-sm font-semibold text-text-primary">
                        项目信息
                    </h2>
                    <dl className="flex flex-col gap-2 text-xs">
                        <div>
                            <dt className="text-text-tertiary">标题</dt>
                            <dd className="text-text-primary">
                                {project.metadata.title}
                            </dd>
                        </div>
                        <div>
                            <dt className="text-text-tertiary">项目 ID</dt>
                            <dd className="break-all text-text-secondary">
                                {project.metadata.projectId}
                            </dd>
                        </div>
                        <div>
                            <dt className="text-text-tertiary">画布</dt>
                            <dd className="text-text-secondary">
                                {project.canvas.width}×{project.canvas.height} ·{' '}
                                {project.canvas.fps}fps
                            </dd>
                        </div>
                        <div>
                            <dt className="text-text-tertiary">时长</dt>
                            <dd className="text-text-secondary">
                                {formatTime(totalDurationMs)}
                            </dd>
                        </div>
                        <div>
                            <dt className="text-text-tertiary">创建时间</dt>
                            <dd className="text-text-secondary">
                                {formatDate(project.metadata.createdAt)}
                            </dd>
                        </div>
                        <div>
                            <dt className="text-text-tertiary">视频素材</dt>
                            <dd className="text-text-secondary">
                                {project.assets.videos.length} 个
                            </dd>
                        </div>
                        <div>
                            <dt className="text-text-tertiary">配音素材</dt>
                            <dd className="text-text-secondary">
                                {project.assets.voices.length} 个
                            </dd>
                        </div>
                    </dl>
                    <div className="mt-auto rounded-md border border-border-subtle bg-bg-base p-3 text-center text-xs text-text-tertiary">
                        编辑功能(裁剪/拼接)留 Phase 5
                    </div>
                </aside>
            </div>
        </AppShell>
    );
};
