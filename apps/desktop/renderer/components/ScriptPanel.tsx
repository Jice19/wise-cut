
import { useEffect, useRef } from 'react';

import { storyboardItems, storyboardSummary } from '../constants/editor-screen';
import type { StoryboardData, StoryboardItem } from '../types/editor-screen';
import { cx } from '../utils/classNames';

const cardToneClassNames: Record<StoryboardItem['tone'], string> = {
    current:
        'border-[#F05F73] bg-[#0B0D11] p-[12px_14px_13px] shadow-[0_10px_20px_rgba(0,0,0,0.6)]',
    default: 'border-transparent bg-[#171A20] p-[10px_12px]'
};

const textToneClassNames: Record<StoryboardItem['tone'], string> = {
    current: 'font-bold text-white',
    default: 'font-medium text-[#9AA0AD]'
};

const metaToneClassNames: Record<StoryboardItem['tone'], string> = {
    current: 'text-[#C8D6FF]',
    default: 'text-[#6B7385]'
};

const parseStoryboardTimeStartMs = (time: string) => {
    const [startTime] = time.split('-');
    const parts = startTime?.split(':').map(Number);

    if (!parts || parts.some((part) => Number.isNaN(part))) {
        return undefined;
    }

    const [first = 0, second = 0, third] = parts;
    const totalSeconds =
        third === undefined
            ? first * 60 + second
            : first * 3600 + second * 60 + third;

    return totalSeconds * 1000;
};

export const getStoryboardSeekTimeMs = (item: StoryboardItem) =>
    typeof item.startMs === 'number'
        ? item.startMs
        : parseStoryboardTimeStartMs(item.time);

const createStoryboardItemKey = (item: StoryboardItem) =>
    `${item.title}-${item.startMs ?? 'static'}-${item.body}`;

const StoryboardCard = ({
    cardRef,
    item,
    onSceneSelect,
    onSeek
}: {
    cardRef?: (element: HTMLButtonElement | null) => void;
    item: StoryboardItem;
    onSceneSelect?: (input: { sceneId: string; startMs: number }) => void;
    onSeek?: (timeMs: number) => void;
}) => {
    const seekTimeMs = getStoryboardSeekTimeMs(item);

    return (
        <button
            ref={cardRef}
            type="button"
            data-storyboard-current={
                item.tone === 'current' ? 'true' : undefined
            }
            data-storyboard-scene-id={item.sceneId}
            data-storyboard-seek-time={seekTimeMs}
            disabled={seekTimeMs === undefined}
            onClick={() => {
                if (seekTimeMs === undefined) return;

                if (item.sceneId) {
                    onSceneSelect?.({
                        sceneId: item.sceneId,
                        startMs: seekTimeMs
                    });
                    return;
                }

                onSeek?.(seekTimeMs);
            }}
            className={cx(
                'w-full rounded-md border text-left transition-colors duration-150 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#F05F73]',
                seekTimeMs === undefined
                    ? 'cursor-default'
                    : 'cursor-pointer hover:border-[#F05F73]/70',
                cardToneClassNames[item.tone]
            )}
        >
            <span className="mb-2 flex items-center justify-between gap-3">
                <span className="flex items-center gap-2">
                    <span
                        className={cx(
                            "font-['Geist'] font-bold leading-none",
                            item.tone === 'current'
                                ? 'text-xs text-[#F5F7FA]'
                                : 'text-[11px] text-[#6F7784]'
                        )}
                    >
                        {item.title}
                    </span>
                    {item.tone === 'current' ? (
                        <span className="rounded-full bg-[#F05F73]/15 px-2 py-0.5 font-['Geist'] text-[10px] font-bold leading-none text-[#F05F73]">
                            当前
                        </span>
                    ) : null}
                </span>
                <span
                    className={cx(
                        "font-['Geist'] font-semibold leading-none",
                        item.tone === 'current' ? 'text-[11px]' : 'text-[10px]',
                        metaToneClassNames[item.tone]
                    )}
                >
                    {item.time}
                </span>
            </span>
            <span
                className={cx(
                    'block whitespace-pre-line text-sm leading-[1.5]',
                    textToneClassNames[item.tone]
                )}
            >
                {item.body}
            </span>
        </button>
    );
};

const fallbackStoryboardData: StoryboardData = {
    items: storyboardItems,
    summary: storyboardSummary
};

export const ScriptPanel = ({
    autoScrollActiveItem = false,
    data = fallbackStoryboardData,
    onSceneSelect,
    onSeek
}: {
    autoScrollActiveItem?: boolean;
    data?: StoryboardData;
    onSceneSelect?: (input: { sceneId: string; startMs: number }) => void;
    onSeek?: (timeMs: number) => void;
}) => {
    return (
        <ScriptPanelContent
            autoScrollActiveItem={autoScrollActiveItem}
            data={data}
            onSceneSelect={onSceneSelect}
            onSeek={onSeek}
        />
    );
};

export const ScriptPanelContent = ({
    autoScrollActiveItem = false,
    data,
    onSceneSelect,
    onSeek
}: {
    autoScrollActiveItem?: boolean;
    data: StoryboardData;
    onSceneSelect?: (input: { sceneId: string; startMs: number }) => void;
    onSeek?: (timeMs: number) => void;
}) => {
    const itemRefs = useRef(new Map<string, HTMLButtonElement>());
    const activeItemKey = data.items
        .filter((item) => item.tone === 'current')
        .map(createStoryboardItemKey)[0];

    useEffect(() => {
        if (!autoScrollActiveItem || !activeItemKey) return;

        itemRefs.current.get(activeItemKey)?.scrollIntoView({
            block: 'nearest'
        });
    }, [activeItemKey, autoScrollActiveItem]);

    return (
        <aside className="flex min-h-0 flex-col border-r border-[#2A2F38] bg-[#15171B] p-[18px_16px]">
            <div className="mb-3 grid gap-1.5">
                <h2 className="text-xl font-bold leading-[1.1]">
                    {data.summary.title}
                </h2>
                <p className="font-['Geist'] text-[11px] font-medium leading-[1.2] text-[#6F7784]">
                    {data.summary.meta}
                </p>
            </div>
            <div
                data-script-scroll="true"
                className="min-h-0 flex-1 overflow-y-auto pr-1"
            >
                <div className="grid gap-2">
                    {data.items.map((item) => {
                        const itemKey = createStoryboardItemKey(item);

                        return (
                            <StoryboardCard
                                key={itemKey}
                                cardRef={(element) => {
                                    if (element) {
                                        itemRefs.current.set(itemKey, element);
                                        return;
                                    }

                                    itemRefs.current.delete(itemKey);
                                }}
                                item={item}
                                onSceneSelect={onSceneSelect}
                                onSeek={onSeek}
                            />
                        );
                    })}
                </div>
            </div>
        </aside>
    );
};
