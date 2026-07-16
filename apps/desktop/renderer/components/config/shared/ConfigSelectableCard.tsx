/* */
import type { MouseEvent } from 'react';

import type { VoicePresetCard } from '../../../types/config';
import { cx } from '../../../utils/classNames';
import { Icon } from '../../Icon';

export const ConfigSelectableCard = ({
    card,
    onPreview,
    onSelect
}: {
    card: VoicePresetCard;
    onPreview?: (card: VoicePresetCard) => void;
    onSelect?: (card: VoicePresetCard) => void;
}) => {
    const handlePreview = (event: MouseEvent<HTMLButtonElement>) => {
        event.stopPropagation();
        onPreview?.(card);
    };

    return (
        <div
            data-voice-preview={card.title}
            className={cx(
                'flex h-[54px] w-[126px] items-start justify-between rounded-[10px] border px-3 py-2 text-left',
                card.selected
                    ? 'border-[#F05F73] bg-[#F05F73]/20'
                    : 'border-[#1A1D24] bg-[#111418]'
            )}
        >
            <button
                type="button"
                aria-pressed={card.selected}
                className="min-w-0 flex-1 text-left"
                onClick={() => {
                    onSelect?.(card);
                }}
            >
                <span className="grid gap-0.5">
                    <span
                        className={cx(
                            'text-[13px] font-[800]',
                            card.selected ? 'text-white' : 'text-[#88909C]'
                        )}
                    >
                        {card.title}
                    </span>
                    <span
                        className={cx(
                            'text-[10px] font-semibold',
                            card.selected ? 'text-[#F05F73]' : 'text-[#88909C]'
                        )}
                    >
                        {card.description}
                    </span>
                </span>
            </button>
            <button
                type="button"
                aria-label={`试听${card.title}`}
                className={cx(
                    'mt-[2px] grid h-6 w-6 shrink-0 place-items-center rounded-full',
                    card.selected ? 'bg-[#F05F73]/30' : 'bg-[#1A1D25]'
                )}
                onClick={handlePreview}
            >
                <Icon
                    name={card.actionIcon}
                    className={cx(
                        'h-3 w-3',
                        card.selected ? 'text-[#F05F73]' : 'text-[#88909C]'
                    )}
                />
            </button>
        </div>
    );
};
