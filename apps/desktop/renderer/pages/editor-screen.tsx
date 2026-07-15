/**
 * Editor screen —— commit 17 升级。
 *
 * 4 个主要 section:
 *   1. 帧分析面板(commit 15) — 整体理解 + 时间窗摘要
 *   2. 分镜列表(左侧) — 选中 → 详情显示
 *   3. 时间线(主区) — 视频轨 + 配音轨,横向 block 可拖(改 startMs)
 *   4. 字幕轨道(主区底) — 显示 SRT 文本,inline 编辑(改 narration)
 *
 * 拖拽策略:用 mousedown/mousemove/mouseup,不引第三方库。
 * 修改只更新 local state,不入盘(commit 16 导出时再应用变更)。
 */

import type {
    KeyFrameWindowAnalysis,
    TimelineClip,
    VideoAnalysisResult,
    VideoProject
} from '@miaoma-magicut/video-project';
import { type ReactNode, useEffect, useRef, useState } from 'react';
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

const TIMELINE_WIDTH_PX = 800;

type DerivedScene = {
    endMs: number;
    /** commit 21:plan_scenes 节点产出的画面描述(M3 真接时是中文一段)。 */
    visualBrief: string;
    index: number;
    narration: string;
    startMs: number;
    subtitleText: string;
    voiceClip?: TimelineClip;
};

const extractAnalysisResult = (
    project: VideoProject
): VideoAnalysisResult | null => {
    for (const msg of project.agentConversation) {
        for (const block of msg.blocks) {
            if (block.kind === 'analysis') {
                return block.analysis;
            }
        }
    }
    return null;
};

const buildDerivedScenes = (project: VideoProject): DerivedScene[] => {
    const videoTrack = project.tracks.find((t) => t.kind === 'video');
    const voiceTrack = project.tracks.find((t) => t.kind === 'voice');
    // commit 21:从 VideoProjectSchema.scenes(plan_scenes 节点产出)取 narration /
    // visualBrief / subtitleLines,落到 card 渲染。1:1 by construction —
    // assembleTimeline 跟 plan_scenes 都按 state.scenes 顺序遍历,clip[idx]
    // 对应 scenes[idx]。
    const scenesMeta = project.scenes;
    return (videoTrack?.clips ?? []).map((clip, idx) => {
        const voiceClip = voiceTrack?.clips.find((c) => {
            // voice clip assetId 对应 sceneId(assembleTimelineNode 用 sceneId 作为 voice assetId)
            return (
                c.assetId === clip.assetId || c.assetId.endsWith(`-${idx + 1}`)
            );
        });
        const sceneMeta = scenesMeta[idx];
        return {
            endMs: clip.endMs,
            index: idx,
            // fallback '' 让老 project 文件(.json 无 scenes 字段走 default([])
            // 后 scenesMeta[idx] undefined)仍走 commit 17 路径,不爆 React。
            narration: sceneMeta?.narration ?? '',
            startMs: clip.startMs,
            subtitleText:
                sceneMeta?.subtitleLines?.map((l) => l.text).join(' ') ?? '',
            visualBrief: sceneMeta?.visualBrief ?? '',
            voiceClip
        };
    });
};

const pxPerMs = (durationMs: number): number =>
    Math.max(TIMELINE_WIDTH_PX / Math.max(durationMs, 1), 0.001);

export const EditorScreen = (): JSX.Element => {
    const params = useParams<{ projectId?: string }>();
    const projectId = params.projectId ?? 'proj-default';

    const [project, setProject] = useState<VideoProject | null>(null);
    const [loadError, setLoadError] = useState<string | null>(null);
    const [selectedSceneIndex, setSelectedSceneIndex] = useState(0);
    const [scenes, setScenes] = useState<DerivedScene[]>([]);
    const [subtitleDraft, setSubtitleDraft] = useState('');

    useEffect(() => {
        let cancelled = false;
        setLoadError(null);
        setProject(null);
        window.miaomaAPI
            .readVideoProject({ projectId })
            .then((result) => {
                if (cancelled) return;
                const p = result as VideoProject;
                setProject(p);
                setScenes(buildDerivedScenes(p));
            })
            .catch((err: Error) => {
                if (cancelled) return;
                setLoadError(err.message);
            });
        return () => {
            cancelled = true;
        };
    }, [projectId]);

    // commit 17 拖拽：mousedown 在 block 上记录 startMs, mousemove 计算 delta, mouseup commit
    const dragRef = useRef<{
        clipIndex: number;
        startX: number;
        originalStartMs: number;
    } | null>(null);

    const onClipMouseDown = (
        e: React.MouseEvent<HTMLDivElement>,
        clipIndex: number,
        originalStartMs: number
    ): void => {
        e.preventDefault();
        dragRef.current = {
            clipIndex,
            originalStartMs,
            startX: e.clientX
        };
        const onMove = (ev: MouseEvent): void => {
            const drag = dragRef.current;
            if (!drag || !project) return;
            const ratio = pxPerMs(project.canvas.durationMs);
            const deltaMs = (ev.clientX - drag.startX) / ratio;
            const newStart = Math.max(
                0,
                Math.round(drag.originalStartMs + deltaMs)
            );
            setScenes((prev) => {
                const next = [...prev];
                const cur = next[drag.clipIndex];
                if (!cur) return prev;
                // 不能超过前一个 scene 的 endMs
                const prevScene = next[drag.clipIndex - 1];
                const maxStart = prevScene ? prevScene.endMs : Infinity;
                const clamped = Math.min(newStart, maxStart);
                const delta = clamped - cur.startMs;
                next[drag.clipIndex] = {
                    ...cur,
                    endMs: cur.endMs + delta,
                    startMs: clamped
                };
                return next;
            });
        };
        const onUp = (): void => {
            dragRef.current = null;
            window.removeEventListener('mousemove', onMove);
            window.removeEventListener('mouseup', onUp);
        };
        window.addEventListener('mousemove', onMove);
        window.addEventListener('mouseup', onUp);
    };

    // commit 17 inline 字幕编辑：选 scene → 在详情面板编辑字幕(暂存 local)
    const onSelectScene = (idx: number): void => {
        setSelectedSceneIndex(idx);
        setSubtitleDraft(scenes[idx]?.subtitleText ?? '');
    };
    const onSaveSubtitle = (): void => {
        setScenes((prev) => {
            const next = [...prev];
            const cur = next[selectedSceneIndex];
            if (cur) {
                next[selectedSceneIndex] = {
                    ...cur,
                    subtitleText: subtitleDraft
                };
            }
            return next;
        });
    };

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
    const selected = scenes[selectedSceneIndex];
    const analysisResult = extractAnalysisResult(project);

    return (
        <AppShell pageLabel={`编辑器 · ${project.metadata.title}`}>
            <div className="flex h-full gap-2 overflow-hidden p-2">
                {/* 左侧:分镜列表 + 帧分析 */}
                <aside className="flex w-[320px] flex-shrink-0 flex-col gap-3 overflow-y-auto rounded-lg border border-border-subtle bg-bg-elevated p-4">
                    {/* 帧分析面板(commit 15) */}
                    {analysisResult && (
                        <AnalysisPanel analysis={analysisResult} />
                    )}

                    <header>
                        <h2 className="mb-1 text-sm font-semibold text-text-primary">
                            分镜列表
                        </h2>
                        <p className="text-[11px] text-text-tertiary">
                            {scenes.length} 个分镜 ·{' '}
                            {formatTime(totalDurationMs)} 总时长
                        </p>
                    </header>
                    <ol className="flex flex-col gap-2">
                        {scenes.map((s) => {
                            const active = s.index === selectedSceneIndex;
                            return (
                                <li key={s.index}>
                                    <button
                                        type="button"
                                        onClick={() => onSelectScene(s.index)}
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
                                        {/* commit 21:落地 plan_scenes 节点
                                            产出的 narration(自然语言旁白),
                                            30 字截断避免卡片视觉溢出。 */}
                                        {s.narration ? (
                                            <p className="line-clamp-2 text-[11px] text-text-tertiary">
                                                {s.narration.length > 30
                                                    ? `${s.narration.slice(0, 30)}…`
                                                    : s.narration}
                                            </p>
                                        ) : null}
                                    </button>
                                </li>
                            );
                        })}
                    </ol>
                </aside>

                {/* 主区:预览 + 时间线 + 字幕 */}
                <div className="flex min-w-0 flex-1 flex-col gap-2">
                    {/* 预览 */}
                    <div className="flex aspect-video items-center justify-center overflow-hidden rounded-lg border border-border-subtle bg-bg-base">
                        {selected ? (
                            <div className="flex flex-col items-center gap-3 p-6 text-center">
                                <div className="text-3xl font-bold text-text-primary">
                                    分镜 {selected.index + 1}
                                </div>
                                {/* commit 21:落地 plan_scenes 节点产出的
                                    narration(主行)与 visualBrief(副行)。
                                    fallback 行为:无 narration 显原 subtitleText
                                    占位;无 visualBrief 不显示。 */}
                                <p className="max-w-md text-sm font-semibold text-text-primary">
                                    {selected.narration ||
                                        '(无旁白,可在编辑器下方写字幕)'}
                                </p>
                                {selected.visualBrief ? (
                                    <p className="line-clamp-3 max-w-md text-xs text-text-tertiary">
                                        {selected.visualBrief}
                                    </p>
                                ) : null}
                                <p className="text-xs text-text-tertiary">
                                    {formatTime(selected.startMs)} -{' '}
                                    {formatTime(selected.endMs)}
                                </p>
                            </div>
                        ) : (
                            <p className="text-text-tertiary">无分镜</p>
                        )}
                    </div>

                    {/* 时间线 + 字幕轨 */}
                    <div className="rounded-lg border border-border-subtle bg-bg-elevated p-4">
                        <div className="mb-2 flex items-center justify-between text-xs text-text-secondary">
                            <span>时间线</span>
                            <span>
                                视频 {scenes.length} 段 · 配音{' '}
                                {scenes.filter((s) => s.voiceClip).length}
                            </span>
                        </div>
                        <div
                            className="relative h-20 overflow-hidden rounded bg-bg-sunken"
                            style={{ width: TIMELINE_WIDTH_PX }}
                        >
                            {scenes.map((s) => {
                                const left =
                                    s.startMs * pxPerMs(totalDurationMs);
                                const width =
                                    (s.endMs - s.startMs) *
                                    pxPerMs(totalDurationMs);
                                return (
                                    <div
                                        key={`v-${s.index}`}
                                        onMouseDown={(e) =>
                                            onClipMouseDown(
                                                e,
                                                s.index,
                                                s.startMs
                                            )
                                        }
                                        className={[
                                            'absolute top-1 flex h-7 cursor-grab items-center overflow-hidden rounded border-2 px-2 text-[10px] active:cursor-grabbing',
                                            s.index === selectedSceneIndex
                                                ? 'border-brand bg-brand text-text-on-brand'
                                                : 'border-border-subtle bg-bg-hover text-text-secondary'
                                        ].join(' ')}
                                        style={{ left, width }}
                                    >
                                        分镜 {s.index + 1}
                                    </div>
                                );
                            })}
                            {/* 配音轨:voice block 提示 */}
                            <div className="absolute bottom-1 h-3 w-full rounded bg-success opacity-60" />
                        </div>

                        {/* 字幕编辑(commit 17) */}
                        <div className="mt-3 border-t border-border-subtle pt-3">
                            <label
                                htmlFor="subtitle-edit"
                                className="mb-1 block text-[11px] font-semibold text-text-secondary"
                            >
                                字幕 (分镜 {selectedSceneIndex + 1})
                            </label>
                            <textarea
                                id="subtitle-edit"
                                rows={2}
                                value={subtitleDraft}
                                onChange={(e) =>
                                    setSubtitleDraft(e.target.value)
                                }
                                placeholder="输入字幕文本..."
                                className="w-full resize-none rounded border border-border-subtle bg-bg-sunken px-2 py-1.5 text-xs text-text-primary placeholder:text-text-tertiary focus:border-brand focus:outline-none"
                            />
                            <div className="mt-2 flex justify-end">
                                <button
                                    type="button"
                                    onClick={onSaveSubtitle}
                                    className="rounded bg-brand px-3 py-1 text-[11px] font-semibold text-text-on-brand hover:bg-brand-dim"
                                >
                                    保存字幕
                                </button>
                            </div>
                        </div>
                    </div>
                </div>

                {/* 右侧:项目元信息 */}
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
                    </dl>
                </aside>
            </div>
        </AppShell>
    );
};

/**
 * commit 15 帧分析面板 — 整体理解 + 时间窗摘要。
 */
const AnalysisPanel = ({
    analysis
}: {
    analysis: VideoAnalysisResult;
}): ReactNode => {
    const [expandedWindow, setExpandedWindow] = useState<number | null>(null);
    return (
        <section className="rounded border border-border-subtle bg-bg-base p-3">
            <h3 className="mb-1 text-[11px] font-bold uppercase tracking-wide text-text-tertiary">
                帧分析
            </h3>
            <p className="text-[11px] text-text-secondary">
                {analysis.summary}
            </p>
            <p className="mt-2 line-clamp-3 text-[11px] italic text-text-tertiary">
                {analysis.overallUnderstanding}
            </p>
            <div className="mt-2 space-y-1">
                {analysis.keyFrameAnalysis.map((w: KeyFrameWindowAnalysis) => (
                    <button
                        type="button"
                        key={w.windowIndex}
                        onClick={() =>
                            setExpandedWindow(
                                expandedWindow === w.windowIndex
                                    ? null
                                    : w.windowIndex
                            )
                        }
                        className="flex w-full flex-col items-start rounded border border-border-subtle bg-bg-elevated p-1.5 text-left text-[10px] hover:border-brand"
                    >
                        <span className="font-mono text-text-tertiary">
                            {formatTime(w.windowStart)} -{' '}
                            {formatTime(w.windowEnd)} · {w.frameIds.length} 帧
                        </span>
                        <span className="line-clamp-2 text-text-secondary">
                            {w.summary}
                        </span>
                        {expandedWindow === w.windowIndex && (
                            <span className="mt-1 text-[9px] text-text-tertiary">
                                帧:{w.frameIds.join(', ')}
                            </span>
                        )}
                    </button>
                ))}
            </div>
        </section>
    );
};
