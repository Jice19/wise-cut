/* */
import { useEffect } from 'react';
import { useParams } from 'react-router-dom';

import { AgentExecutionToc } from '../components/agent/AgentExecutionToc';
import { AgentProcessNav } from '../components/agent/AgentProcessNav';
import { AgentConversationTimeline } from '../components/agent/AgentConversationTimeline';
import { WindowDragRegion } from '../components/WindowDragRegion';
import {
    approveAgentRun,
    cancelAgentRun,
    ensureAgentRunEventSubscription,
    reviseAgentRun,
    useAgentRunSnapshot
} from '../stores/agent-run-store';
import { navigateToClientRoute } from '../utils/clientNavigation';

const formatHeaderTime = () =>
    new Intl.DateTimeFormat('zh-CN', {
        day: '2-digit',
        hour: '2-digit',
        minute: '2-digit',
        month: '2-digit'
    }).format(new Date());

export const MiaojianCreateRunScreen = ({ runId }: { runId?: string }) => {
    const snapshot = useAgentRunSnapshot(runId);
    const resolvedRunId = runId ?? snapshot.activeRunId;

    useEffect(() => {
        ensureAgentRunEventSubscription();
    }, []);

    const handleApprove = () => {
        if (!resolvedRunId) return;

        void approveAgentRun(resolvedRunId);
    };

    const handleCancel = () => {
        if (!resolvedRunId) return;

        void cancelAgentRun(resolvedRunId);
    };

    const handleRevise = (feedback: string) => {
        if (!resolvedRunId) return;

        void reviseAgentRun(resolvedRunId, feedback);
    };

    const handleBackToHome = () => {
        navigateToClientRoute('/');
    };

    return (
        <main
            data-create-run-message-page="true"
            className="relative h-screen min-h-[720px] overflow-hidden bg-canvas text-ink"
        >
            <WindowDragRegion />

            {/* ── Top-left: 返回首页 按钮(独立于步骤指示器,
                 浮在最左,不挤中间内容) ── */}
            <button
                type="button"
                data-create-run-back-to-home="true"
                onClick={handleBackToHome}
                className="absolute left-4 top-4 z-10 inline-flex h-8 items-center gap-1.5 rounded-full bg-white/90 px-3 text-[12px] font-semibold text-[#1C1917] shadow-[0_2px_8px_rgba(28,25,23,0.06)] backdrop-blur transition-colors hover:bg-white"
            >
                <span aria-hidden="true">←</span>
                <span>首页</span>
            </button>

            {/* ── Top-right: 取消生成 按钮(agent 运行中 / 等待确认时可用) ── */}
            {snapshot.viewModel.canCancel ? (
                <button
                    type="button"
                    data-create-run-cancel="true"
                    onClick={handleCancel}
                    className="absolute right-4 top-4 z-10 inline-flex h-8 items-center gap-1.5 rounded-full border border-[#FF6B86]/40 bg-[#2A1218]/80 px-3 text-[12px] font-semibold text-[#FF9DAE] shadow-[0_2px_8px_rgba(255,107,134,0.12)] backdrop-blur transition-colors hover:bg-[#3A1A22] hover:text-white"
                >
                    <span aria-hidden="true">■</span>
                    <span>取消生成</span>
                </button>
            ) : null}

            {/* ── Top: process navigation bar ── */}
            <AgentProcessNav
                stageItems={snapshot.viewModel.stageItems}
                status={snapshot.viewModel.status}
            />

            {/* ── Content area ── */}
            <section
                data-create-run-chat-shell="true"
                className="relative mx-auto flex h-full w-[960px] flex-col"
            >
                {/* Timestamp */}
                <time className="mt-5 shrink-0 text-center text-[12px] font-[650] leading-none text-ink-muted">
                    {formatHeaderTime()}
                </time>

                {/* Scrollable conversation timeline */}
                <div className="min-h-0 flex-1 overflow-y-auto pb-[120px] pt-4">
                    <AgentConversationTimeline
                        onApprove={handleApprove}
                        onCancel={handleCancel}
                        onRevise={handleRevise}
                        runId={resolvedRunId}
                        viewModel={snapshot.viewModel}
                    />
                </div>
            </section>

            {/* ── Right: execution table-of-contents sidebar ── */}
            <AgentExecutionToc stageItems={snapshot.viewModel.stageItems} />
        </main>
    );
};

export const MiaojianCreateRunRoute = () => {
    const params = useParams();

    return <MiaojianCreateRunScreen runId={params.runId} />;
};
