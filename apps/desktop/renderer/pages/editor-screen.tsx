import { AppShell } from '@/components/app-shell';

/**
 * 编辑器 Screen —— Pencil 中 Bx8VF。
 * 三列布局（左素材 W=280 / 中时间线 fill / 右 inspector W=320）+ 居中 Modal。
 */
export const EditorScreen = (): JSX.Element => {
    return (
        <AppShell pageLabel="编辑器">
            <div className="relative flex h-full gap-0">
                {/* Left: media library */}
                <section className="flex w-[280px] flex-shrink-0 flex-col gap-3 overflow-auto rounded-l-lg border-y border-l border-border-subtle bg-bg-elevated p-4">
                    <h2 className="text-xs font-semibold uppercase tracking-wide text-text-tertiary">
                        素材库
                    </h2>
                    <div className="grid grid-cols-2 gap-2">
                        {Array.from({ length: 6 }).map((_, i) => (
                            <div
                                key={i}
                                className="aspect-video rounded bg-bg-hover"
                                aria-label={`素材 ${i + 1}`}
                            />
                        ))}
                    </div>
                </section>

                {/* Divider 1 */}
                <div className="w-px self-stretch bg-border-subtle" />

                {/* Mid: timeline area */}
                <section className="flex min-w-0 flex-1 flex-col gap-3 bg-bg-base p-6">
                    <div className="flex h-[60%] items-center justify-center rounded border border-border-subtle bg-bg-hover text-xs text-text-tertiary">
                        视频预览 — 占位
                    </div>
                    <div className="flex-1 overflow-auto rounded border border-border-subtle bg-bg-elevated p-3">
                        <div className="mb-2 text-[10px] text-text-tertiary">
                            时间线
                        </div>
                        <div className="flex gap-1">
                            {Array.from({ length: 12 }).map((_, i) => (
                                <div
                                    key={i}
                                    className="h-12 flex-1 rounded bg-bg-sunken"
                                />
                            ))}
                        </div>
                    </div>
                </section>

                {/* Divider 2 */}
                <div className="w-px self-stretch bg-border-subtle" />

                {/* Right: inspector */}
                <aside className="flex w-[320px] flex-shrink-0 flex-col gap-3 overflow-auto rounded-r-lg border-y border-r border-border-subtle bg-bg-elevated p-4">
                    <h2 className="text-xs font-semibold uppercase tracking-wide text-text-tertiary">
                        属性
                    </h2>
                    {['位置', '缩放', '时长', '透明度', '音量'].map((k) => (
                        <div
                            key={k}
                            className="flex items-center justify-between rounded border border-border-subtle bg-bg-sunken px-3 py-2 text-xs text-text-secondary"
                        >
                            <span>{k}</span>
                            <span className="font-mono text-text-tertiary">
                                0.00
                            </span>
                        </div>
                    ))}
                </aside>

                {/* Modal overlay (Pencil 中 Modal Card 880×680) */}
                <div className="pointer-events-none absolute inset-0 flex items-center justify-center bg-black/60">
                    <div
                        role="dialog"
                        aria-modal="true"
                        aria-labelledby="export-dialog-title"
                        className="pointer-events-auto flex w-[880px] flex-col rounded-lg bg-bg-elevated shadow-2xl"
                    >
                        <header className="flex h-14 items-center px-7">
                            <h2
                                id="export-dialog-title"
                                className="text-base font-semibold text-text-primary"
                            >
                                导出
                            </h2>
                            <button
                                type="button"
                                aria-label="关闭"
                                className="ml-auto text-text-tertiary hover:text-text-primary"
                            >
                                ✕
                            </button>
                        </header>
                        <div className="h-px bg-border-subtle" />
                        <div className="grid grid-cols-2 gap-7 p-7">
                            {/* Left column */}
                            <div className="flex flex-col gap-3 text-xs text-text-secondary">
                                <Row label="文件名">春日Vlog-v2.mp4</Row>
                                <Row label="分辨率">1920×1080</Row>
                                <Row label="帧率">30</Row>
                                <Row label="编码">H.264</Row>
                            </div>
                            {/* Right column */}
                            <div className="flex flex-col gap-3 text-xs text-text-secondary">
                                <Row label="音频">AAC · 320 kbps</Row>
                                <Row label="时长">00:42</Row>
                                <Row label="大小">~ 120 MB</Row>
                            </div>
                        </div>
                        <div className="h-px bg-border-subtle" />
                        <footer className="flex h-20 items-center justify-end gap-3 px-7">
                            <button
                                type="button"
                                className="rounded-md border border-border-subtle px-4 py-2 text-sm text-text-secondary hover:bg-bg-hover"
                            >
                                取消
                            </button>
                            <button
                                type="button"
                                className="rounded-md bg-brand px-6 py-2 text-sm font-semibold text-text-on-brand hover:bg-brand-dim"
                            >
                                开始导出
                            </button>
                        </footer>
                    </div>
                </div>
            </div>
        </AppShell>
    );
};

interface RowProps {
    label: string;
    children: React.ReactNode;
}

const Row = ({ label, children }: RowProps): JSX.Element => (
    <div className="flex items-center justify-between rounded bg-bg-sunken px-3 py-2">
        <span className="text-text-tertiary">{label}</span>
        <span className="font-mono">{children}</span>
    </div>
);
