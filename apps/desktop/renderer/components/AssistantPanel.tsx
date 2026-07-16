
import { assistantPanel, assistantTags } from '../constants/editor-screen';

import { Icon } from './Icon';

const AssistantTagRow = ({
    label,
    value
}: {
    label: string;
    value: string;
}) => {
    return (
        <div className="flex gap-1.5">
            <span className="rounded-md bg-[#3A3B3E] px-2 py-1 text-[11.5px] font-[750] text-[#F5F7FA]">
                {label}
            </span>
            <span className="rounded-md bg-[#303133] px-2 py-1 text-[11.5px] font-[750] text-[#A9AFBA]">
                {value}
            </span>
        </div>
    );
};

const LinkedShotChip = () => {
    return (
        <div className="flex h-[22px] w-[78px] items-center justify-center gap-1.5 rounded-md bg-[#303136]">
            <Icon name="image" className="h-[14px] w-[14px] text-[#A9AFBA]" />
            <span className="text-[11px] font-bold text-[#D5D8DE]">
                {assistantPanel.linkedShot}
            </span>
            <button
                type="button"
                aria-label="移除关联分镜"
                className="grid h-3 w-3 place-items-center text-[#A9AFBA]"
            >
                <Icon name="x" className="h-3 w-3" />
            </button>
        </div>
    );
};

const QuickAdjustmentInput = () => {
    return (
        <section className="mt-auto h-[129px] w-full shrink-0 rounded-[14px] bg-[#1A1B1E] p-[10px_0_0]">
            <div className="flex h-[18px] w-full items-center justify-between px-3 text-xs font-bold text-[#A9AFBA]">
                <span>{assistantPanel.quickEditTitle}</span>
                <Icon name="chevron-up" className="h-[18px] w-[18px]" />
            </div>
            <div className="mt-2 flex h-[93px] w-full flex-col justify-between rounded-[10px] border border-[#34363B] p-[10px_12px_12px]">
                <span className="text-xs font-semibold text-[#6F737C]">
                    {assistantPanel.quickEditPlaceholder}
                </span>
                <div className="flex h-6 w-full items-center justify-between overflow-hidden">
                    <LinkedShotChip />
                    <button
                        type="button"
                        aria-label="发送快捷调整"
                        className="grid h-[23px] w-[23px] place-items-center rounded-full bg-[#F05F73] text-white"
                    >
                        <Icon name="arrow-up" className="h-[19px] w-[19px]" />
                    </button>
                </div>
            </div>
        </section>
    );
};

export const AssistantPanel = () => {
    return (
        <aside className="flex min-h-0 flex-col overflow-hidden bg-[#111214] p-[16px_10px]">
            <div className="min-h-0 overflow-y-auto pb-3">
                <div className="mb-[18px] text-center font-['Geist'] text-[13px] font-semibold text-[#6F7784]">
                    {assistantPanel.timestamp}
                </div>

                <section className="mx-2 rounded-[18px] bg-[#252628] p-[12px_14px]">
                    <div className="mb-2 flex h-6 items-center justify-between">
                        <h2 className="text-[15px] font-[760]">
                            {assistantPanel.contextTitle}
                        </h2>
                        <span className="text-[#A9AFBA]">⌄</span>
                    </div>
                    <p className="whitespace-pre-line text-[12.5px] font-semibold leading-[1.35] text-[#D5D8DE]">
                        {assistantPanel.contextSummary}
                    </p>
                    <div className="my-3 h-px bg-white/10" />
                    <div className="grid gap-1.5">
                        {assistantTags.map((tag) => (
                            <AssistantTagRow
                                key={tag.label}
                                label={tag.label}
                                value={tag.value}
                            />
                        ))}
                    </div>
                </section>

                <p className="mx-2 mt-[33px] whitespace-pre-line text-[12.2px] font-semibold leading-[1.36] text-[#D6D8DD]">
                    {assistantPanel.analysis}
                </p>

                <button
                    type="button"
                    className="mx-auto mt-2 flex h-8 w-[118px] items-center justify-center gap-2 rounded-full bg-[#2B2D31] text-xs font-bold text-[#A9AFBA]"
                >
                    <Icon name="arrow-down" className="h-[15px] w-[15px]" />
                    {assistantPanel.returnAction}
                </button>
            </div>

            <QuickAdjustmentInput />
        </aside>
    );
};
