/* */
import type { AgentRunStageItem } from '../../mappers/agent-run-conversation';
import { cx } from '../../utils/classNames';

const STATUS_STYLES: Record<
    AgentRunStageItem['status'],
    { bar: string; dot: string; label: string }
> = {
    cancelled: {
        bar: 'bg-[#E0E2E8]',
        dot: 'bg-[#B0B4C0]',
        label: 'text-[#9A9EB0]'
    },
    completed: {
        bar: 'bg-[#3B8C5B]',
        dot: 'bg-[#3B8C5B]',
        label: 'text-[#3B8C5B]'
    },
    failed: {
        bar: 'bg-[#C94A6D]',
        dot: 'bg-[#C94A6D]',
        label: 'text-[#C94A6D]'
    },
    running: {
        bar: 'bg-[#5B7FED]',
        dot: 'bg-[#5B7FED]',
        label: 'text-[#5B7FED]'
    },
    waiting: {
        bar: 'bg-[#E0E2E8]',
        dot: 'bg-[#B0B4C0]',
        label: 'text-[#9A9EB0]'
    }
};

const STATUS_LABELS: Record<AgentRunStageItem['status'], string> = {
    cancelled: '已取消',
    completed: '已完成',
    failed: '失败',
    running: '进行中',
    waiting: '待执行'
};

export const AgentExecutionToc = ({
    stageItems
}: {
    stageItems: AgentRunStageItem[];
}) => {
    const hasRunning =
        stageItems.filter((s) => s.status === 'running').length > 0;

    return (
        <aside
            data-agent-execution-toc="true"
            className="fixed right-6 top-[100px] h-fit w-[220px] rounded-xl border border-[#EBECF0] bg-white px-4 py-5 shadow-[0_1px_3px_rgba(0,0,0,0.06)]"
        >
            {/* Header */}
            <div className="mb-4 flex items-center gap-2">
                <svg
                    className="h-4 w-4 text-[#6B6F80]"
                    fill="none"
                    stroke="currentColor"
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    strokeWidth="2"
                    viewBox="0 0 24 24"
                    aria-hidden="true"
                >
                    <path d="M4 21V6h7m-7 15h7m-7-5h7M4 8h7V3H4v5Zm11-5h5m-5 4h5m-5 4h5m-5 4h5m-5 4h5" />
                </svg>
                <span className="text-[13px] font-[700] leading-none text-[#2C2E3A]">
                    执行目录
                </span>
            </div>

            {/* Vertical timeline */}
            <div className="flex flex-col">
                {stageItems.map((item, index) => {
                    const style = STATUS_STYLES[item.status];
                    const isLast = index === stageItems.length - 1;

                    return (
                        <div
                            key={item.label}
                            className="relative flex gap-3"
                        >
                            {/* Timeline bar + dot */}
                            <div className="flex flex-col items-center">
                                {/* Dot */}
                                <div
                                    className={cx(
                                        'z-10 mt-1 h-2.5 w-2.5 shrink-0 rounded-full',
                                        style.dot,
                                        item.status === 'running' &&
                                            'animate-pulse'
                                    )}
                                />
                                {/* Vertical bar */}
                                {!isLast && (
                                    <div
                                        className={cx(
                                            'mt-1 h-full min-h-[36px] w-[3px] rounded-full',
                                            style.bar
                                        )}
                                    />
                                )}
                            </div>

                            {/* Content */}
                            <div className="min-w-0 flex-1 pb-4">
                                <div className="flex items-center justify-between gap-1.5">
                                    <p className="truncate text-[13px] font-[700] leading-[18px] text-[#2C2E3A]">
                                        {item.label}
                                    </p>
                                    <span
                                        className={cx(
                                            'shrink-0 text-[11px] font-[500] leading-none',
                                            style.label
                                        )}
                                    >
                                        {STATUS_LABELS[item.status]}
                                    </span>
                                </div>
                                {item.detail ? (
                                    <p className="mt-0.5 line-clamp-2 text-[11px] font-[400] leading-[16px] text-[#9A9EB0]">
                                        {item.detail}
                                    </p>
                                ) : null}
                            </div>
                        </div>
                    );
                })}
            </div>

            {/* Running indicator */}
            {hasRunning && (
                <div className="mt-2 rounded-lg bg-[#EDF0FD] px-3 py-2">
                    <p className="text-[11px] font-[500] leading-[16px] text-[#4A62D0]">
                        AI 智能体正在执行中，请稍候…
                    </p>
                </div>
            )}
        </aside>
    );
};
