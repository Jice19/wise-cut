import { type ReactNode } from 'react';

import { Icon } from '@/components/icons';

const FILTERS: readonly { label: string; active: boolean }[] = [
    { label: '全部', active: true },
    { label: '我的', active: false },
    { label: '分享', active: false },
    { label: '回收站', active: false }
];

const PROJECTS: readonly {
    id: string;
    title: string;
    badge: string;
    meta: string;
    bg: string;
}[] = [
    {
        id: 'p1',
        title: '春日 Vlog 02',
        badge: '9:16',
        meta: '00:42 · 2026-07-11',
        bg: 'linear-gradient(135deg, #4a8dff, #7b5cff)'
    },
    {
        id: 'p2',
        title: '产品介绍 —  AI智能剪辑',
        badge: '16:9',
        meta: '01:18 · 2026-07-09',
        bg: 'linear-gradient(135deg, #00e7ff, #3fcb7a)'
    },
    {
        id: 'p3',
        title: '旅行日记 · 京都',
        badge: '9:16',
        meta: '00:36 · 2026-07-07',
        bg: 'linear-gradient(135deg, #ff8a4a, #ffb547)'
    },
    {
        id: 'p4',
        title: '夏日街拍集',
        badge: '1:1',
        meta: '00:54 · 2026-07-04',
        bg: 'linear-gradient(135deg, #7b5cff, #ff5c5c)'
    },
    {
        id: 'p5',
        title: '美食探店',
        badge: '16:9',
        meta: '02:04 · 2026-07-01',
        bg: 'linear-gradient(135deg, #3fcb7a, #00e7ff)'
    },
    {
        id: 'p6',
        title: '朋友聚会花絮',
        badge: '9:16',
        meta: '00:28 · 2026-06-28',
        bg: 'linear-gradient(135deg, #ffb547, #ff8a4a)'
    }
];

export const WorkspaceProjectsView = (): ReactNode => {
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
                        className="flex items-center gap-1.5 rounded border border-border-subtle bg-bg-elevated px-2.5 py-1 hover:bg-bg-hover"
                    >
                        <Icon name="search" boxSize={4} />
                        <span>扫描素材</span>
                    </button>
                    <span>共 {PROJECTS.length} 个项目</span>
                </div>
            </div>

            {/* Project grid */}
            <div className="grid grid-cols-3 gap-4">
                {PROJECTS.map((p) => (
                    <article
                        key={p.id}
                        className="overflow-hidden rounded-md border border-border-subtle bg-bg-elevated"
                    >
                        <div
                            className="relative h-36 w-full"
                            style={{ background: p.bg }}
                        >
                            <span className="absolute left-2 top-2 rounded bg-black/60 px-1.5 py-0.5 text-[10px] text-white">
                                {p.badge}
                            </span>
                        </div>
                        <div className="flex flex-col gap-1.5 p-3.5 pb-4">
                            <h3 className="text-sm font-bold text-text-primary">
                                {p.title}
                            </h3>
                            <div className="flex items-center justify-between text-[11px] text-text-tertiary">
                                <span>{p.meta}</span>
                                <span>·</span>
                                <span>本地</span>
                            </div>
                        </div>
                    </article>
                ))}
            </div>
        </div>
    );
};
