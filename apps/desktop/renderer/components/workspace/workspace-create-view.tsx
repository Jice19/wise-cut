import { type ReactNode } from 'react';
import { useNavigate } from 'react-router-dom';

import { Icon } from '@/components/icons';

const TEMPLATES: readonly {
    title: string;
    desc: string;
    bg: string;
}[] = [
    {
        title: 'Vlog · 春日漫步',
        desc: '一镜到底的樱花街道叙事 + 钢琴 BGM',
        bg: 'linear-gradient(135deg, #FFC1D8, #FFE8B0)'
    },
    {
        title: '产品介绍 · 15s',
        desc: '开场悬念 + 三段特性镜头 + 收尾 CTA',
        bg: 'linear-gradient(135deg, #4A8DFF, #7B5CFF)'
    },
    {
        title: '素材自动重组',
        desc: '从一句话剧本拆分分镜，匹配素材并自动剪辑',
        bg: 'linear-gradient(135deg, #00E7FF, #3FCB7A)'
    }
];

/**
 * WorkspaceScreen `initialView='create'` 视图。
 * 触发智能体 Wizard —— 在此输入 prompt 进入 LangGraph 工作流。
 */
export const WorkspaceCreateView = (): ReactNode => {
    const navigate = useNavigate();

    return (
        <div className="mx-auto flex w-[1024px] flex-col gap-8 py-6">
            {/* Hero */}
            <section className="flex flex-col items-center gap-3 py-12 text-center">
                <div className="inline-flex items-center gap-2 rounded-full border border-border-subtle bg-bg-elevated px-3 py-1 text-xs text-text-secondary">
                    <Icon name="sparkles" boxSize={4} className="text-brand" />
                    <span>AI智能剪辑 · 一句话智能剪辑</span>
                </div>
                <h1 className="text-5xl font-bold leading-tight text-text-primary">
                    描述你想要的视频
                    <br />
                    <span className="text-brand">智能重组精彩片段</span>
                </h1>
                <p className="max-w-xl text-sm text-text-secondary">
                    全链路：素材扫描 → 创意生成分镜 → 分镜审批 → 素材匹配 → 流式
                    TTS 配音。
                </p>
            </section>

            {/* Prompt input */}
            <section className="rounded-2xl border border-border-subtle bg-bg-elevated p-6">
                <label
                    htmlFor="narrative"
                    className="mb-3 block text-sm font-semibold text-text-primary"
                >
                    一句话描述
                </label>
                <textarea
                    id="narrative"
                    rows={4}
                    placeholder="例如：春日京都街头的樱花大道，主角从远处走来，背景是舒缓的钢琴曲……"
                    className="w-full resize-none rounded-md border border-border-subtle bg-bg-sunken px-4 py-3 text-sm text-text-primary placeholder:text-text-tertiary focus:border-brand focus:outline-none"
                />
                <div className="mt-4 flex flex-wrap items-center gap-2 text-xs">
                    {[
                        { label: '风格', value: '自动' },
                        { label: '配乐', value: '舒缓' },
                        { label: '时长', value: '30s' },
                        { label: '画幅', value: '9:16' },
                        { label: '语言', value: '中文' }
                    ].map((c) => (
                        <span
                            key={c.label}
                            className="rounded border border-border-subtle bg-bg-sunken px-2.5 py-1 text-text-secondary"
                        >
                            <span className="text-text-tertiary">
                                {c.label}：
                            </span>
                            <span>{c.value}</span>
                        </span>
                    ))}
                    <div className="ml-auto" />
                    <button
                        type="button"
                        onClick={() => navigate('/create/runs/run-local')}
                        className="rounded-md bg-brand px-8 py-2 text-sm font-semibold text-text-on-brand hover:bg-brand-dim"
                    >
                        ▶ 开始创作
                    </button>
                </div>
            </section>

            {/* Templates */}
            <section>
                <div className="mb-4 flex items-center justify-between">
                    <h2 className="text-sm font-semibold text-text-primary">
                        推荐模板
                    </h2>
                    <span className="text-xs text-text-tertiary">
                        选一个快速开始
                    </span>
                </div>
                <div className="grid grid-cols-3 gap-4">
                    {TEMPLATES.map((t) => (
                        <button
                            key={t.title}
                            type="button"
                            className="overflow-hidden rounded-lg border border-border-subtle bg-bg-elevated text-left transition hover:border-brand hover:shadow-lg"
                        >
                            <div
                                className="h-28 w-full"
                                style={{ background: t.bg }}
                            />
                            <div className="flex flex-col gap-1 p-3.5">
                                <h3 className="text-sm font-bold text-text-primary">
                                    {t.title}
                                </h3>
                                <p className="text-[11px] text-text-tertiary">
                                    {t.desc}
                                </p>
                            </div>
                        </button>
                    ))}
                </div>
            </section>
        </div>
    );
};
