/* */
import type { AgentRunStageItem } from '../../mappers/agent-run-conversation';
import { cx } from '../../utils/classNames';

const STEP_LABELS: Record<string, { label: string; index: number }> = {
    prepare: { index: 0, label: '素材准备' },
    scenes: { index: 1, label: '内容理解' },
    voice: { index: 2, label: '分镜拆解' },
    video: { index: 3, label: '生成导出' }
};

const STATUS_STYLES: Record<
    AgentRunStageItem['status'],
    { bg: string; text: string; ring: string }
> = {
    cancelled: {
        bg: 'bg-[#EEEEF0]',
        ring: 'ring-[#E0E2E8]',
        text: 'text-[#B0B4C0]'
    },
    completed: {
        bg: 'bg-[#E8F5EC]',
        ring: 'ring-[#B9DFC7]',
        text: 'text-[#3B8C5B]'
    },
    failed: {
        bg: 'bg-[#FDE8EF]',
        ring: 'ring-[#F5C6D3]',
        text: 'text-[#C94A6D]'
    },
    running: {
        bg: 'bg-[#FFF3E0]',
        ring: 'ring-[#FFCC80]',
        text: 'text-[#E6960A]'
    },
    waiting: {
        bg: 'bg-[#EEEEF0]',
        ring: 'ring-[#E0E2E8]',
        text: 'text-[#B0B4C0]'
    }
};

export const AgentProcessNav = ({
    stageItems,
    status
}: {
    stageItems: AgentRunStageItem[];
    status: string;
}) => {
    const totalSteps = stageItems.length;
    const completedCount = stageItems.filter(
        (s) => s.status === 'completed'
    ).length;
    const progressPercent =
        status === 'completed'
            ? 100
            : totalSteps > 0
              ? Math.round((completedCount / totalSteps) * 100)
              : 0;

    return (
        <nav
            data-agent-process-nav="true"
            aria-label="AI 创作流程导航"
            className="mx-auto w-full max-w-[960px] px-6 pt-6"
        >
            {/* Step circles + connection lines */}
            <div className="flex items-center justify-center gap-0">
                {stageItems.map((item, index) => {
                    const stepInfo = STEP_LABELS[item.label] ?? {
                        index: index + 1,
                        label: item.label
                    };
                    const stepIndex = stepInfo.index + 1;
                    const style = STATUS_STYLES[item.status];
                    const isLast = index === stageItems.length - 1;

                    return (
                        <div key={item.label} className="flex items-center">
                            {/* Step node */}
                            <div className="flex flex-col items-center gap-1.5">
                                <div
                                    className={cx(
                                        'flex h-8 w-8 items-center justify-center rounded-full text-xs font-[700] transition-all duration-300',
                                        style.bg,
                                        style.text,
                                        item.status === 'running' &&
                                            'animate-pulse ring-4 ring-[#FFCC80]/40',
                                        item.status === 'completed' &&
                                            'ring-2 ring-[#B9DFC7]/40'
                                    )}
                                    aria-label={`步骤 ${stepIndex}: ${stepInfo.label} — ${item.status}`}
                                >
                                    {item.status === 'completed' ? (
                                        <svg
                                            className="h-3.5 w-3.5"
                                            fill="none"
                                            stroke="currentColor"
                                            strokeLinecap="round"
                                            strokeLinejoin="round"
                                            strokeWidth="2.5"
                                            viewBox="0 0 24 24"
                                            aria-hidden="true"
                                        >
                                            <path d="M20 6 9 17l-5-5" />
                                        </svg>
                                    ) : (
                                        <span>{stepIndex}</span>
                                    )}
                                </div>
                                <span
                                    className={cx(
                                        'text-[11px] font-[600] leading-none',
                                        item.status === 'running'
                                            ? 'text-[#E6960A]'
                                            : item.status === 'completed'
                                              ? 'text-[#3B8C5B]'
                                              : 'text-[#B0B4C0]'
                                    )}
                                >
                                    {stepInfo.label}
                                </span>
                            </div>

                            {/* Connection line */}
                            {!isLast && (
                                <div className="mx-1 mb-5 flex h-[2px] w-[80px] items-center">
                                    <div className="h-full w-full rounded-full bg-[#E0E2E8]">
                                        <div
                                            className={cx(
                                                'h-full rounded-full transition-all duration-500',
                                                index < completedCount
                                                    ? 'bg-[#5B7FED]'
                                                    : 'bg-transparent'
                                            )}
                                            style={{
                                                width:
                                                    index < completedCount
                                                        ? '100%'
                                                        : '0%'
                                            }}
                                        />
                                    </div>
                                </div>
                            )}
                        </div>
                    );
                })}
            </div>

            {/* Bottom progress bar */}
            <div className="mx-auto mt-3 h-1 w-[480px] overflow-hidden rounded-full bg-[#EBECF0]">
                <div
                    className="h-full rounded-full bg-[#5B7FED] transition-all duration-700 ease-out"
                    style={{ width: `${progressPercent}%` }}
                />
            </div>
        </nav>
    );
};
