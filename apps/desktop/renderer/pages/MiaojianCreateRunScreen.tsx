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
    useAgentRunSnapshot
} from '../stores/agent-run-store';

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

    return (
        <main
            data-create-run-message-page="true"
            className="relative h-screen min-h-[720px] overflow-hidden bg-canvas text-ink"
        >
            <WindowDragRegion />

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
