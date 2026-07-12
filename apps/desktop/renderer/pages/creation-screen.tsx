import { AppShell } from '@/components/app-shell';

const SCRIPT_CARDS: readonly {
    label: string;
    time: string;
    bg: string;
}[] = [
    { label: '开场 · 春日向往', time: '00:00 - 00:08', bg: '#4a8dff' },
    { label: '热闹的樱花大道', time: '00:08 - 00:20', bg: '#7b5cff' },
    { label: '神社前的许愿', time: '00:20 - 00:32', bg: '#ff8a4a' },
    { label: '收尾字幕', time: '00:32 - 00:40', bg: '#3fcb7a' }
];

/**
 * 创作 Screen —— Pencil 中 TiF37。顶部 narrative prompt + 中间 script cards + 底部 placeholder timeline。
 */
export const CreationScreen = (): JSX.Element => {
    return (
        <AppShell pageLabel="创作">
            <div className="mx-auto flex w-[1280px] flex-col gap-6">
                {/* Hero */}
                <div className="flex flex-col items-center gap-4 py-12 text-center">
                    <h1 className="text-4xl font-bold text-text-primary">
                        开始你的 <span className="text-brand">AI 创作</span>
                    </h1>
                    <p className="text-text-secondary">
                        用一句自然语言描述，AI AI 自动拆脚本、配画面、配音乐。
                    </p>
                </div>

                {/* Prompt input */}
                <div className="rounded-lg border border-border-subtle bg-bg-elevated p-8">
                    <label
                        htmlFor="narrative"
                        className="mb-3 block text-sm text-text-secondary"
                    >
                        描述你想要的视频
                    </label>
                    <textarea
                        id="narrative"
                        rows={3}
                        placeholder="例如：春日京都街头的樱花大道，背景音乐是舒缓的钢琴曲..."
                        className="w-full resize-none rounded-md border border-border-subtle bg-bg-sunken px-4 py-3 text-sm text-text-primary placeholder:text-text-tertiary focus:border-brand focus:outline-none"
                    />
                    <div className="mt-4 flex items-center justify-between">
                        <div className="flex items-center gap-2 text-xs text-text-tertiary">
                            <span>风格：</span>
                            <span className="rounded border border-border-subtle px-2 py-0.5 text-text-secondary">
                                自动
                            </span>
                            <span>·</span>
                            <span>配乐：</span>
                            <span className="rounded border border-border-subtle px-2 py-0.5 text-text-secondary">
                                自动
                            </span>
                        </div>
                        <button
                            type="button"
                            className="rounded-md bg-brand px-8 py-2 text-sm font-semibold text-text-on-brand hover:bg-brand-dim"
                        >
                            ▶ 开始生成
                        </button>
                    </div>
                </div>

                {/* Script cards */}
                <div>
                    <div className="mb-3 flex items-center justify-between">
                        <h2 className="text-sm font-semibold text-text-primary">
                            生成的脚本
                        </h2>
                        <span className="text-xs text-text-tertiary">
                            {SCRIPT_CARDS.length} 段
                        </span>
                    </div>
                    <div className="flex gap-4">
                        {SCRIPT_CARDS.map((c, i) => (
                            <div
                                key={c.label}
                                className="flex h-32 w-64 flex-col gap-2 rounded-md border border-border-subtle bg-bg-elevated p-3"
                            >
                                <div
                                    className="h-14 w-full rounded"
                                    style={{ background: c.bg }}
                                />
                                <div className="text-xs font-semibold text-text-primary">
                                    {i + 1}. {c.label}
                                </div>
                                <div className="text-[10px] text-text-tertiary">
                                    {c.time}
                                </div>
                            </div>
                        ))}
                    </div>
                </div>

                {/* Timeline placeholder */}
                <div className="rounded-lg border border-border-subtle bg-bg-elevated p-6">
                    <div className="mb-3 text-xs text-text-secondary">
                        时间线预览
                    </div>
                    <div className="flex h-32 items-center justify-center text-xs text-text-tertiary">
                        时间线占位 — 后续接入 React Player / 自绘 SVG
                    </div>
                </div>
            </div>
        </AppShell>
    );
};
