/**
 * 导出页 /export —— Pencil 中未单独成 Screen，本路由走「项目 → 导出弹窗」
 * 内联 placeholder。后续接 IPC.EXPORT_START 时补齐 Modal 表单 + 进度条。
 *
 * 注意：本组件**不**包 AppShell —— router 已经包了一层。
 */
export const ExportScreen = (): JSX.Element => (
    <div className="mx-auto flex w-[720px] flex-col gap-4">
        <div className="rounded-lg border border-border-subtle bg-bg-elevated p-6">
            <h1 className="mb-2 text-2xl font-bold text-text-primary">导出</h1>
            <p className="text-sm text-text-secondary">
                该流程会调用 IPC.EXPORT_START 后端渲染流水线输出 mp4。
                当前为占位，未接入后端。
            </p>
            <div className="mt-6 grid grid-cols-2 gap-3 text-xs">
                {[
                    { label: '文件名', value: '春日Vlog-v2.mp4' },
                    { label: '分辨率', value: '1920×1080' },
                    { label: '帧率', value: '30fps' },
                    { label: '编码', value: 'H.264' },
                    { label: '音频', value: 'AAC · 320 kbps' },
                    { label: '预估大小', value: '~ 120 MB' }
                ].map((row) => (
                    <div
                        key={row.label}
                        className="flex items-center justify-between rounded bg-bg-sunken px-3 py-2"
                    >
                        <span className="text-text-tertiary">{row.label}</span>
                        <span className="font-mono text-text-primary">
                            {row.value}
                        </span>
                    </div>
                ))}
            </div>
            <div className="mt-6 flex justify-end gap-3">
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
            </div>
        </div>
    </div>
);
