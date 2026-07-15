/**
 * Workspace projects view —— commit 9.3 真实数据版。
 *
 * 流程:
 *   useEffect → 调 miaomaAPI.listVideoProjects() 拿 userData/video-projects/ 列表
 *   卡片点击 → navigate('/editor/:projectId')
 *
 * 替代之前的静态 PROJECTS 常量。
 */

import { type ReactNode, useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';

import { Icon } from '@/components/icons';

import type { VideoProjectSummary } from '../../../shared/ipc';

const FILTERS: readonly { label: string; active: boolean }[] = [
    { label: '全部', active: true },
    { label: '我的', active: false },
    { label: '分享', active: false },
    { label: '回收站', active: false }
];

const formatDuration = (ms: number | undefined): string => {
    if (!ms) return '00:00';
    const totalSec = Math.round(ms / 1000);
    const min = Math.floor(totalSec / 60);
    const sec = totalSec % 60;
    return `${String(min).padStart(2, '0')}:${String(sec).padStart(2, '0')}`;
};

const formatDate = (iso: string | undefined): string => {
    if (!iso) return '';
    try {
        return new Date(iso).toLocaleDateString('zh-CN');
    } catch {
        return iso;
    }
};

const gradientByIndex = (idx: number): string => {
    const gradients = [
        'linear-gradient(135deg, #4a8dff, #7b5cff)',
        'linear-gradient(135deg, #00e7ff, #3fcb7a)',
        'linear-gradient(135deg, #ff8a4a, #ffb547)',
        'linear-gradient(135deg, #7b5cff, #ff5c5c)',
        'linear-gradient(135deg, #3fcb7a, #00e7ff)',
        'linear-gradient(135deg, #ffb547, #ff8a4a)'
    ];
    return gradients[idx % gradients.length]!;
};

export const WorkspaceProjectsView = (): ReactNode => {
    const navigate = useNavigate();
    const [projects, setProjects] = useState<VideoProjectSummary[]>([]);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState<string | null>(null);

    const refresh = (): void => {
        setLoading(true);
        setError(null);
        window.miaomaAPI
            .listVideoProjects()
            .then((list) => {
                setProjects(list);
            })
            .catch((err: Error) => {
                setError(err.message);
            })
            .finally(() => {
                setLoading(false);
            });
    };

    useEffect(() => {
        refresh();
    }, []);

    return (
        <div className="flex flex-col gap-6 px-6 py-6">
            {/* Hero header */}
            <header className="flex h-[140px] items-end justify-between rounded-lg bg-bg-elevated px-8 py-6">
                <div>
                    <h1 className="text-3xl font-bold text-text-primary">
                        欢迎回来，开启今天的创作
                    </h1>
                    <p className="mt-2 text-sm text-text-secondary">
                        从一个自然语言描述开始，AI智能剪辑自动重组你素材库里的精彩片段
                    </p>
                </div>
                <button
                    type="button"
                    onClick={() => navigate('/create')}
                    className="rounded-md bg-brand px-6 py-2.5 text-sm font-semibold text-text-on-brand hover:bg-brand-dim"
                >
                    + 新建项目
                </button>
            </header>

            {/* Filter row */}
            <div className="flex h-10 items-center justify-between">
                <div className="flex gap-2">
                    {FILTERS.map((f) => (
                        <button
                            key={f.label}
                            type="button"
                            className={[
                                'rounded-md px-3 py-1 text-sm',
                                f.active
                                    ? 'bg-brand-soft text-brand'
                                    : 'bg-bg-elevated text-text-secondary hover:bg-bg-hover'
                            ].join(' ')}
                        >
                            {f.label}
                        </button>
                    ))}
                </div>
                <div className="flex items-center gap-3 text-xs text-text-tertiary">
                    <button
                        type="button"
                        onClick={refresh}
                        className="flex items-center gap-1.5 rounded border border-border-subtle bg-bg-elevated px-2.5 py-1 hover:bg-bg-hover"
                    >
                        <Icon name="search" boxSize={4} />
                        <span>刷新</span>
                    </button>
                    <span>共 {projects.length} 个项目</span>
                </div>
            </div>

            {/* Status / error */}
            {error && (
                <div className="rounded border border-danger bg-danger-soft px-4 py-2 text-xs text-danger">
                    加载项目列表失败:{error}
                </div>
            )}

            {/* Project grid */}
            {loading ? (
                <div className="rounded-lg border border-border-subtle bg-bg-base p-8 text-center text-text-tertiary">
                    加载中...
                </div>
            ) : projects.length === 0 ? (
                <div className="rounded-lg border border-dashed border-border-subtle bg-bg-base p-12 text-center">
                    <p className="text-text-tertiary">还没有项目</p>
                    <button
                        type="button"
                        onClick={() => navigate('/create')}
                        className="mt-3 rounded-md bg-brand px-4 py-1.5 text-xs font-semibold text-text-on-brand hover:bg-brand-dim"
                    >
                        开始第一个项目
                    </button>
                </div>
            ) : (
                <div className="grid grid-cols-3 gap-4">
                    {projects.map((p, idx) => (
                        <article
                            key={p.projectId}
                            onClick={() => navigate(`/editor/${p.projectId}`)}
                            onKeyDown={(e) => {
                                if (e.key === 'Enter') {
                                    navigate(`/editor/${p.projectId}`);
                                }
                            }}
                            role="button"
                            tabIndex={0}
                            className="cursor-pointer overflow-hidden rounded-md border border-border-subtle bg-bg-elevated transition hover:border-brand hover:shadow-lg"
                        >
                            <div
                                className="relative h-36 w-full"
                                style={{ background: gradientByIndex(idx) }}
                            >
                                <span className="absolute left-2 top-2 rounded bg-black/60 px-1.5 py-0.5 text-[10px] text-white">
                                    16:9
                                </span>
                            </div>
                            <div className="flex flex-col gap-1.5 p-3.5 pb-4">
                                <h3 className="line-clamp-1 text-sm font-bold text-text-primary">
                                    {p.title}
                                </h3>
                                <div className="flex items-center justify-between text-[11px] text-text-tertiary">
                                    <span>{formatDuration(p.durationMs)}</span>
                                    <span>·</span>
                                    <span>{formatDate(p.updatedAt)}</span>
                                </div>
                                <p className="text-[10px] text-text-tertiary">
                                    {p.projectId}
                                </p>
                            </div>
                        </article>
                    ))}
                </div>
            )}
        </div>
    );
};
