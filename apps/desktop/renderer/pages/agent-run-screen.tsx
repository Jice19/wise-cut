import { AppShell } from '@/components/app-shell';

const AGENT_STEPS: readonly {
    label: string;
    status: 'done' | 'active' | 'todo';
}[] = [
    { label: '解析脚本', status: 'done' },
    { label: '选素材', status: 'done' },
    { label: '配 BGM', status: 'done' },
    { label: '剪辑序列', status: 'active' },
    { label: '字幕 + 导出', status: 'todo' }
];

/**
 * 智能体运行 Screen —— Pencil 中 VlGoO。
 * 左 280 panel（步骤进度）+ 主区 1456（agent log + run controls）。
 */
export const AgentRunScreen = (): JSX.Element => {
    return (
        <AppShell pageLabel="智能体运行">
            <div className="flex h-full gap-2 overflow-hidden p-2">
                {/* Inner sidebar: agent run plan */}
                <aside className="flex w-[280px] flex-shrink-0 flex-col gap-3 overflow-y-auto rounded-lg border border-border-subtle bg-bg-elevated p-5">
                    <h2 className="mb-1 text-sm font-semibold text-text-primary">
                        智能体运行计划
                    </h2>
                    <ol className="flex flex-col gap-3">
                        {AGENT_STEPS.map((s, i) => (
                            <li
                                key={s.label}
                                className={[
                                    'rounded-md border px-3 py-2 text-xs',
                                    s.status === 'done'
                                        ? 'border-border-subtle bg-bg-hover text-text-secondary'
                                        : s.status === 'active'
                                          ? 'border-brand bg-brand-soft text-brand'
                                          : 'border-border-subtle text-text-tertiary'
                                ].join(' ')}
                            >
                                <div className="flex items-center justify-between">
                                    <span>
                                        {i + 1}. {s.label}
                                    </span>
                                    <span className="text-[10px]">
                                        {s.status === 'done'
                                            ? '✓'
                                            : s.status === 'active'
                                              ? '●'
                                              : '○'}
                                    </span>
                                </div>
                            </li>
                        ))}
                    </ol>
                    <div className="mt-auto rounded border border-brand bg-brand-soft px-3 py-2 text-center text-xs text-brand">
                        67%
                    </div>
                </aside>

                {/* Main: agent log + run controls */}
                <div className="flex min-w-0 flex-1 flex-col gap-2">
                    {/* Progress bar */}
                    <div className="rounded-lg border border-border-subtle bg-bg-elevated p-5">
                        <div className="mb-2 flex items-center justify-between text-xs text-text-secondary">
                            <span>当前：剪辑序列</span>
                            <span>67%</span>
                        </div>
                        <div className="h-1.5 w-full overflow-hidden rounded-full bg-bg-sunken">
                            <div
                                className="h-full bg-brand"
                                style={{ width: '67%' }}
                            />
                        </div>
                    </div>

                    {/* Log lines */}
                    <div className="flex-1 overflow-auto rounded-lg border border-border-subtle bg-bg-base p-5 font-mono text-xs leading-relaxed text-text-secondary">
                        {[
                            { ts: '14:31:02', msg: 'agent:start [春日Vlog]' },
                            { ts: '14:31:03', msg: 'plan:load 5 steps' },
                            { ts: '14:31:04', msg: 'step:parse-script OK' },
                            { ts: '14:31:06', msg: 'step:pick-footage OK' },
                            { ts: '14:31:08', msg: 'step:pick-bgm OK' },
                            { ts: '14:31:09', msg: 'step:sequence running…' },
                            { ts: '14:31:11', msg: '  ▸ segment 1/4 OK' },
                            { ts: '14:31:13', msg: '  ▸ segment 2/4 OK' }
                        ].map((l) => (
                            <div key={l.ts + l.msg} className="flex gap-3">
                                <span className="text-text-tertiary">
                                    {l.ts}
                                </span>
                                <span>{l.msg}</span>
                            </div>
                        ))}
                    </div>

                    {/* Controls */}
                    <div className="flex items-center justify-end gap-3 rounded-lg border border-border-subtle bg-bg-elevated p-4">
                        <button
                            type="button"
                            className="rounded-md border border-border-subtle px-4 py-2 text-sm text-text-secondary hover:bg-bg-hover"
                        >
                            暂停
                        </button>
                        <button
                            type="button"
                            className="rounded-md bg-danger px-4 py-2 text-sm text-text-primary hover:opacity-80"
                        >
                            取消
                        </button>
                    </div>
                </div>
            </div>
        </AppShell>
    );
};
