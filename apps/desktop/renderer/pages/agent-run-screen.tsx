/**
 * 智能体运行 Screen —— Pencil 中 VlGoO。
 *
 * commit 8 接 useVideoAgent:
 *   - 左侧 panel 列出已知节点 + 状态(从 hook.nodes 拿)
 *   - 主区 log 是 hook 累积的事件流
 *   - interrupt 时弹 SceneApprovalDialog,点批准/驳回调 hook.approve
 *   - 启动按钮调 hook.start(input)
 *
 * 保留左侧"智能体运行计划"标题 + step 列表,但数据源换成 hook.nodes。
 */

import { useCallback, useMemo, useState } from 'react';

import { AppShell } from '@/components/app-shell';
import { SceneApprovalDialog } from '@/components/SceneApprovalDialog';
import { type NodeState, useVideoAgent } from '@/hooks/useVideoAgent';

const formatTimestamp = (ts: number): string => {
    const d = new Date(ts);
    const pad = (n: number): string => String(n).padStart(2, '0');
    return `${pad(d.getHours())}:${pad(d.getMinutes())}:${pad(d.getSeconds())}`;
};

const formatEventLine = (
    type: string,
    fields: Record<string, unknown>
): string => {
    const interesting = Object.entries(fields)
        .filter(
            ([key, value]) =>
                key !== 'type' &&
                key !== 'runId' &&
                key !== 'seq' &&
                key !== 'timestamp' &&
                value !== undefined
        )
        .map(([key, value]) => {
            if (typeof value === 'object') {
                return `${key}=${JSON.stringify(value)}`;
            }
            return `${key}=${String(value)}`;
        })
        .join(' ');
    return interesting ? `${type} ${interesting}` : type;
};

export const AgentRunScreen = (): JSX.Element => {
    const {
        approve,
        cancel,
        errorMessage,
        interrupt,
        nodes,
        projectPath,
        runStatus,
        start
    } = useVideoAgent();

    const [logLines, setLogLines] = useState<
        { ts: number; type: string; text: string }[]
    >([]);

    const handleStart = useCallback(async (): Promise<void> => {
        setLogLines([]);
        await start({
            brief: '春日京都樱花',
            runId: `run-${Date.now()}`,
            sourceAssetDirectory: '/Users/apple/Movies/sample-videos'
        });
    }, [start]);

    // 累积事件日志 — 监听 nodes/projectPath 变化追加
    const nodesRef = nodes;
    useMemo(() => {
        setLogLines((prev) => {
            const next = [...prev];
            for (const [name, state] of Object.entries(nodesRef)) {
                const alreadyLogged = next
                    .slice()
                    .reverse()
                    .find(
                        (l: { type: string; text: string }) =>
                            l.type === `node.${state.status}` &&
                            l.text.includes(name)
                    );
                if (!alreadyLogged && state.status !== 'pending') {
                    next.push({
                        text: formatEventLine(`node.${state.status}`, { name }),
                        ts: Date.now(),
                        type: `node.${state.status}`
                    });
                }
            }
            return next;
        });
    }, [nodesRef]);

    return (
        <AppShell pageLabel="智能体运行">
            <div className="flex h-full gap-2 overflow-hidden p-2">
                <aside className="flex w-[280px] flex-shrink-0 flex-col gap-3 overflow-y-auto rounded-lg border border-border-subtle bg-bg-elevated p-5">
                    <h2 className="mb-1 text-sm font-semibold text-text-primary">
                        智能体运行计划
                    </h2>
                    <ol className="flex flex-col gap-3">
                        {Object.entries(nodes).length === 0 ? (
                            <li className="rounded-md border border-border-subtle bg-bg-base px-3 py-2 text-xs text-text-tertiary">
                                {runStatus === 'idle'
                                    ? '点击「开始」启动 run'
                                    : '等待首个节点事件'}
                            </li>
                        ) : (
                            Object.entries(nodes).map(([name, state]) => (
                                <NodeRow key={name} name={name} state={state} />
                            ))
                        )}
                    </ol>
                    <div className="mt-auto rounded border border-brand bg-brand-soft px-3 py-2 text-center text-xs text-brand">
                        {runStatus}
                    </div>
                </aside>

                <div className="flex min-w-0 flex-1 flex-col gap-2">
                    <div className="rounded-lg border border-border-subtle bg-bg-elevated p-5">
                        <div className="mb-2 flex items-center justify-between text-xs text-text-secondary">
                            <span>
                                当前：
                                {runStatus === 'awaiting_approval'
                                    ? '等待分镜确认'
                                    : runStatus}
                            </span>
                            <span>
                                {
                                    Object.values(nodes).filter(
                                        (n) => n.status === 'completed'
                                    ).length
                                }{' '}
                                / {Object.keys(nodes).length}
                            </span>
                        </div>
                        <div className="h-1.5 w-full overflow-hidden rounded-full bg-bg-sunken">
                            <div
                                className="h-full bg-brand transition-all"
                                style={{
                                    width: `${computeOverallProgress(nodes)}%`
                                }}
                            />
                        </div>
                        {errorMessage && (
                            <p className="mt-3 text-xs text-danger">
                                {errorMessage}
                            </p>
                        )}
                        {projectPath && (
                            <p className="mt-3 break-all text-xs text-text-tertiary">
                                落盘:{projectPath}
                            </p>
                        )}
                    </div>

                    <div className="flex-1 overflow-auto rounded-lg border border-border-subtle bg-bg-base p-5 font-mono text-xs leading-relaxed text-text-secondary">
                        {logLines.length === 0 ? (
                            <p className="text-text-tertiary">等待事件流...</p>
                        ) : (
                            logLines.map((l, i) => (
                                <div key={i} className="flex gap-3">
                                    <span className="text-text-tertiary">
                                        {formatTimestamp(l.ts)}
                                    </span>
                                    <span>{l.text}</span>
                                </div>
                            ))
                        )}
                    </div>

                    <div className="flex items-center justify-end gap-3 rounded-lg border border-border-subtle bg-bg-elevated p-4">
                        <button
                            type="button"
                            onClick={() => void cancel()}
                            disabled={runStatus !== 'running'}
                            className="rounded-md border border-border-subtle px-4 py-2 text-sm text-text-secondary hover:bg-bg-hover disabled:opacity-50"
                        >
                            取消
                        </button>
                        <button
                            type="button"
                            onClick={() => void handleStart()}
                            disabled={
                                runStatus === 'running' ||
                                runStatus === 'awaiting_approval'
                            }
                            className="rounded-md bg-brand px-5 py-2 text-sm font-semibold text-text-on-brand hover:bg-brand-dim disabled:opacity-50"
                        >
                            ▶ 开始 run
                        </button>
                    </div>
                </div>
            </div>

            {interrupt && (
                <SceneApprovalDialog
                    request={interrupt}
                    onApprove={(approved) => void approve(approved)}
                    onClose={() => {
                        // 用户关掉弹窗但没点 approve/reject = 视为驳回
                        void approve(false);
                    }}
                />
            )}
        </AppShell>
    );
};

const NodeRow = ({
    name,
    state
}: {
    name: string;
    state: NodeState;
}): JSX.Element => {
    const isDone = state.status === 'completed';
    const isFailed = state.status === 'failed';
    const isActive = state.status === 'running';

    return (
        <li
            className={[
                'rounded-md border px-3 py-2 text-xs',
                isDone
                    ? 'border-border-subtle bg-bg-hover text-text-secondary'
                    : isFailed
                      ? 'border-danger bg-danger-soft text-danger'
                      : isActive
                        ? 'border-brand bg-brand-soft text-brand'
                        : 'border-border-subtle text-text-tertiary'
            ].join(' ')}
        >
            <div className="flex items-center justify-between">
                <span>
                    {state.label ?? name}{' '}
                    {state.progress !== undefined && isActive
                        ? `${state.progress}%`
                        : ''}
                </span>
                <span className="text-[10px]">
                    {isDone ? '✓' : isFailed ? '✗' : isActive ? '●' : '○'}
                </span>
            </div>
            {state.error && <p className="mt-1 text-[10px]">{state.error}</p>}
        </li>
    );
};

const computeOverallProgress = (nodes: Record<string, NodeState>): number => {
    const list = Object.values(nodes);
    if (list.length === 0) return 0;
    const sum = list.reduce((acc, n) => {
        if (n.status === 'completed') return acc + 100;
        if (n.status === 'failed') return acc + 0;
        return acc + (n.progress ?? 0);
    }, 0);
    return Math.round(sum / list.length);
};
