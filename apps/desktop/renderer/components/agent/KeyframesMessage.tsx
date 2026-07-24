/* */
import { useEffect, useMemo, useState } from 'react';

import type {
    AssetKeyframesViewModel,
    KeyframeViewModel
} from '../../mappers/agent-run-conversation';
import {
    analyzeAsset,
    reportSelectedFrames
} from '../../stores/agent-run-store';
import { cx } from '../../utils/classNames';

const formatTimestamp = (ms: number) => {
    const seconds = ms / 1000;

    return `${seconds.toFixed(1)}s`;
};

// 默认选 3 张:首、中、末。frames 不足 3 张时全选。
const pickDefaultIndices = (totalFrames: number) => {
    if (totalFrames <= 0) return [];
    if (totalFrames === 1) return [0];
    if (totalFrames === 2) return [0, 1];

    return [0, Math.floor(totalFrames / 2), totalFrames - 1];
};

const MAX_SELECTED = 5;

export type KeyframesMessageProps = {
    asset: AssetKeyframesViewModel;
    runId: string;
};

const KeyframeThumb = ({
    frame,
    isSelected,
    selectionOrder,
    onSelect
}: {
    frame: KeyframeViewModel;
    isSelected: boolean;
    onSelect: (index: number) => void;
    selectionOrder?: number;
}) => {
    return (
        <button
            type="button"
            data-keyframe-index={frame.index}
            onClick={() => onSelect(frame.index)}
            className={cx(
                'group relative flex shrink-0 cursor-pointer flex-col gap-1 rounded-[8px] border bg-[#11141A] p-1 transition-all duration-150',
                isSelected
                    ? 'border-[#5B8CFF] shadow-[0_0_0_2px_rgba(91,140,255,0.25)]'
                    : 'border-[#252B35] hover:border-[#3A4250]'
            )}
        >
            <img
                src={frame.dataUrl}
                alt={`关键帧 ${frame.index + 1}`}
                draggable={false}
                className="block h-[68px] w-[120px] rounded-[5px] object-cover"
            />
            <div className="flex items-center justify-between px-1">
                <span className="text-[9.5px] font-[650] leading-none text-[#DCE2EA]">
                    #{frame.index + 1}
                </span>
                <span className="text-[9.5px] font-[400] leading-none text-[#737C8C]">
                    {formatTimestamp(frame.timestampMs)}
                </span>
            </div>
            {isSelected && selectionOrder !== undefined ? (
                <span className="absolute right-1.5 top-1.5 grid h-[18px] w-[18px] place-items-center rounded-full bg-[#5B8CFF] text-[10px] font-[800] leading-none text-white shadow-[0_2px_6px_rgba(91,140,255,0.5)]">
                    {selectionOrder}
                </span>
            ) : null}
        </button>
    );
};

export const KeyframesMessage = ({ asset, runId }: KeyframesMessageProps) => {
    // 默认选 3 张(首/中/末)。frames 变化时若用户没改过,重置默认。
    const [selectedIndices, setSelectedIndices] = useState<Set<number>>(
        () => new Set(pickDefaultIndices(asset.frames.length))
    );
    const [hasUserTouched, setHasUserTouched] = useState(false);
    const [analyzeState, setAnalyzeState] = useState<
        'idle' | 'pending' | 'succeeded' | 'failed'
    >('idle');
    const [analyzeError, setAnalyzeError] = useState<string | null>(null);

    useEffect(() => {
        // 当 frames 数量变化(后续 progress 事件追加新帧)时,如果用户没动过,
        // 重新算默认选择;否则保留用户选择。
        if (!hasUserTouched) {
            setSelectedIndices(
                new Set(pickDefaultIndices(asset.frames.length))
            );
        }
    }, [asset.frames.length, hasUserTouched]);

    const sortedSelection = useMemo(
        () =>
            Array.from(selectedIndices).sort((a, b) => a - b),
        [selectedIndices]
    );

    const selectedFrames = useMemo(
        () =>
            sortedSelection
                .map((index) => asset.frames.find((f) => f.index === index))
                .filter((frame): frame is KeyframeViewModel => Boolean(frame)),
        [sortedSelection, asset.frames]
    );

    // 选中变化时实时推给主进程(去抖 — 用 sortedSelection 引用即可,
    // React 的 useEffect 已经天然合并同一帧内多次变更)。
    useEffect(() => {
        if (selectedFrames.length === 0) return;

        void reportSelectedFrames({
            assetId: asset.assetId,
            frames: selectedFrames,
            runId
        });
    }, [asset.assetId, runId, selectedFrames]);

    const handleSelect = (index: number) => {
        setHasUserTouched(true);
        // 用户改选择时重置按钮状态(允许重新理解)
        setAnalyzeState('idle');
        setAnalyzeError(null);
        setSelectedIndices((current) => {
            const next = new Set(current);

            if (next.has(index)) {
                next.delete(index);
            } else {
                if (next.size >= MAX_SELECTED) {
                    // 上限保护:不再加入,给出视觉反馈由调用方处理
                    return current;
                }
                next.add(index);
            }

            return next;
        });
    };

    const handleAnalyze = async () => {
        if (selectedFrames.length === 0) return;

        setAnalyzeState('pending');
        setAnalyzeError(null);

        const result = await analyzeAsset({
            assetId: asset.assetId,
            runId
        });

        if (result.success) {
            setAnalyzeState('succeeded');
        } else {
            setAnalyzeState('failed');
            setAnalyzeError(
                'error' in result ? result.error.message : '画面理解失败'
            );
        }
    };

    const orderedSelectionMap = useMemo(() => {
        const map = new Map<number, number>();

        sortedSelection.forEach((frameIndex, order) => {
            map.set(frameIndex, order + 1);
        });

        return map;
    }, [sortedSelection]);

    const buttonLabel = (() => {
        switch (analyzeState) {
            case 'pending':
                return '理解中…';
            case 'succeeded':
                return '✓ 已完成';
            case 'failed':
                return '重试理解';
            default:
                return '开始理解 →';
        }
    })();

    return (
        <div
            data-keyframes-message="true"
            data-asset-id={asset.assetId}
            className="flex w-[860px] flex-col gap-2"
        >
            <div className="flex flex-wrap items-center gap-2 text-[12px] text-[#C9D0DA]">
                <span className="font-[700] text-[#F5F7FA]">
                    {asset.fileName}
                </span>
                <span className="text-[#737C8C]">
                    {asset.frames.length} 帧
                </span>
                <span
                    className={cx(
                        'rounded-[4px] px-1.5 py-0.5 text-[10px] font-[700] leading-none',
                        selectedIndices.size > 0
                            ? 'bg-[#5B8CFF]/15 text-[#5B8CFF]'
                            : 'bg-[#737C8C]/15 text-[#737C8C]'
                    )}
                >
                    已选 {selectedIndices.size}/{MAX_SELECTED} 张代表帧
                </span>
                {selectedIndices.size >= MAX_SELECTED ? (
                    <span className="rounded-[4px] bg-[#F6B84B]/15 px-1.5 py-0.5 text-[10px] font-[700] leading-none text-[#F6B84B]">
                        已达上限
                    </span>
                ) : null}
            </div>
            <div className="flex gap-1.5 overflow-x-auto pb-1">
                {asset.frames.map((frame) => (
                    <KeyframeThumb
                        key={frame.index}
                        frame={frame}
                        isSelected={selectedIndices.has(frame.index)}
                        selectionOrder={orderedSelectionMap.get(frame.index)}
                        onSelect={handleSelect}
                    />
                ))}
            </div>
            <div className="flex items-center justify-between gap-2">
                <p className="text-[10.5px] font-[400] leading-none text-[#737C8C]">
                    点击缩略图选中/取消 · 默认选首/中/末 3 张 · 上限 5 张
                </p>
                <button
                    type="button"
                    data-keyframes-analyze-button="true"
                    onClick={handleAnalyze}
                    disabled={
                        selectedFrames.length === 0 || analyzeState === 'pending'
                    }
                    className={cx(
                        'h-7 shrink-0 rounded-[6px] px-3 text-[11.5px] font-[700] leading-none transition-all duration-150',
                        analyzeState === 'succeeded'
                            ? 'bg-[#25D0B1]/15 text-[#25D0B1]'
                            : analyzeState === 'failed'
                              ? 'bg-[#F05F73]/15 text-[#F05F73] hover:bg-[#F05F73]/25'
                              : 'bg-[#5B8CFF] text-white hover:bg-[#7BA0FF] disabled:cursor-not-allowed disabled:opacity-50'
                    )}
                >
                    {buttonLabel}
                </button>
            </div>
            {analyzeError ? (
                <p
                    data-keyframes-analyze-error="true"
                    className="text-[10.5px] font-[500] leading-[14px] text-[#F05F73]"
                >
                    {analyzeError}
                </p>
            ) : null}
        </div>
    );
};
