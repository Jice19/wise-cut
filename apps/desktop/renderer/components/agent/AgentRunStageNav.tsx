
import type { AgentRunStageItem } from '../../mappers/agent-run-conversation';
import { cx } from '../../utils/classNames';

const stageToneClassName = {
    cancelled: {
        dot: 'bg-[#6F7784]',
        label: 'text-[#6F7784]',
        text: '已取消'
    },
    completed: {
        dot: 'bg-[#25D0B1]',
        label: 'text-[#25D0B1]',
        text: '已完成'
    },
    failed: {
        dot: 'bg-[#F05F73]',
        label: 'text-[#F05F73]',
        text: '失败'
    },
    running: {
        dot: 'bg-[#F6B84B]',
        label: 'text-[#F6B84B]',
        text: '进行中'
    },
    waiting: {
        dot: 'bg-[#6F7784]',
        label: 'text-[#737C8C]',
        text: '待执行'
    }
} satisfies Record<
    AgentRunStageItem['status'],
    { dot: string; label: string; text: string }
>;

export const AgentRunStageNav = ({
    stageItems
}: {
    stageItems: AgentRunStageItem[];
}) => {
    return (
        <aside
            data-agent-stage-nav="true"
            className="fixed right-8 top-[88px] h-fit w-[240px] rounded-[14px] border border-[#242933] bg-[#111318]/92 p-4 shadow-[0_18px_42px_rgba(0,0,0,0.28)] backdrop-blur"
        >
            <div className="mb-4">
                <p className="text-[12px] font-[700] leading-none text-[#F5F7FA]">
                    执行目录
                </p>
                <p className="mt-2 text-[11px] font-[400] leading-[16px] text-[#737C8C]">
                    实时跟踪智能体阶段
                </p>
            </div>
            <div className="flex flex-col gap-3">
                {stageItems.map((item) => {
                    const tone = stageToneClassName[item.status];

                    return (
                        <div
                            key={item.label}
                            className="grid grid-cols-[8px_minmax(0,1fr)] gap-2.5"
                        >
                            <span
                                className={cx(
                                    'mt-[5px] h-2 w-2 rounded-full',
                                    tone.dot,
                                    item.status === 'running' && 'animate-pulse'
                                )}
                            />
                            <div className="min-w-0">
                                <div className="flex items-center justify-between gap-2">
                                    <p className="truncate text-[13px] font-[700] leading-[18px] text-[#F5F7FA]">
                                        {item.label}
                                    </p>
                                    <span
                                        className={cx(
                                            'shrink-0 text-[11px] font-[500] leading-[16px]',
                                            tone.label
                                        )}
                                    >
                                        {tone.text}
                                    </span>
                                </div>
                                <p className="mt-0.5 line-clamp-2 text-[11px] font-[400] leading-[16px] text-[#737C8C]">
                                    {item.detail}
                                </p>
                            </div>
                        </div>
                    );
                })}
            </div>
        </aside>
    );
};
