/* */
import { useEffect, useId, useRef, useState } from 'react';

import type { CreateVoiceOption } from '../../types/create';
import { cx } from '../../utils/classNames';
import { Icon } from '../Icon';

type VoiceSelectProps = {
    defaultOpen?: boolean;
    labelPrefix: string;
    onChange: (value: string) => void;
    options: CreateVoiceOption[];
    value: string;
};

export const VoiceSelect = ({
    defaultOpen = false,
    labelPrefix,
    onChange,
    options,
    value
}: VoiceSelectProps) => {
    const [isOpen, setIsOpen] = useState(defaultOpen);
    const containerRef = useRef<HTMLDivElement>(null);
    const listboxId = useId();

    useEffect(() => {
        if (!isOpen) return undefined;

        const handlePointerDown = (event: PointerEvent) => {
            if (
                event.target instanceof Node &&
                !containerRef.current?.contains(event.target)
            ) {
                setIsOpen(false);
            }
        };

        const handleKeyDown = (event: KeyboardEvent) => {
            if (event.key === 'Escape') {
                setIsOpen(false);
            }
        };

        document.addEventListener('pointerdown', handlePointerDown);
        document.addEventListener('keydown', handleKeyDown);

        return () => {
            document.removeEventListener('pointerdown', handlePointerDown);
            document.removeEventListener('keydown', handleKeyDown);
        };
    }, [isOpen]);

    const selectedOption =
        options.find((option) => option.label === value) ?? options[0];

    const handleSelect = (nextValue: string) => {
        onChange(nextValue);
        setIsOpen(false);
    };

    return (
        <div ref={containerRef} className="absolute left-[42px] top-[300px]">
            <button
                type="button"
                aria-controls={listboxId}
                aria-expanded={isOpen}
                aria-haspopup="listbox"
                aria-label={labelPrefix}
                className="create-voice-select-trigger flex h-[58px] w-[278px] items-center justify-between gap-2.5 rounded-xl border border-[#E7E5E0] bg-white px-[14px] text-left text-[18px] transition-all duration-200 hover:border-[#D97706] focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#D97706]"
                onClick={() => setIsOpen((current) => !current)}
            >
                <span className="flex min-w-0 items-center gap-2">
                    <span className="shrink-0 font-bold text-[#57534E]">
                        {labelPrefix}
                    </span>
                    <span className="truncate font-bold text-[#1C1917]">
                        {selectedOption?.label}
                    </span>
                </span>
                <Icon
                    name={isOpen ? 'chevron-up' : 'chevron-down'}
                    className="h-4 w-4 shrink-0 text-[#A8A29E]"
                />
            </button>

            {isOpen ? (
                <div
                    id={listboxId}
                    role="listbox"
                    aria-label={labelPrefix}
                    className="absolute left-0 top-[68px] z-30 grid h-[202px] w-[278px] gap-[6px] rounded-2xl border border-[#E7E5E0] bg-white p-2 shadow-[0_18px_42px_rgba(28,25,23,0.12)]"
                >
                    {options.map((option) => {
                        const isSelected = option.label === value;

                        return (
                            <button
                                key={option.label}
                                type="button"
                                role="option"
                                aria-selected={isSelected}
                                className={cx(
                                    'flex h-[42px] w-full items-center justify-between gap-2.5 rounded-lg px-3 text-left transition-all duration-200',
                                    isSelected
                                        ? 'bg-[#FEF3C7] text-[#92400E]'
                                        : 'bg-transparent text-[#1C1917] hover:bg-[#F1EFEC]'
                                )}
                                onClick={() => handleSelect(option.label)}
                            >
                                <span className="grid min-w-0 gap-[3px]">
                                    <span
                                        className={cx(
                                            'truncate text-[14px] font-bold'
                                        )}
                                    >
                                        {option.label}
                                    </span>
                                    <span
                                        className={cx(
                                            'truncate text-[10px] font-medium',
                                            isSelected
                                                ? 'text-[#A16207]'
                                                : 'text-[#78716C]'
                                        )}
                                    >
                                        {option.description}
                                    </span>
                                </span>
                                {isSelected ? (
                                    <Icon
                                        name="check"
                                        className="h-4 w-4 shrink-0 text-[#D97706]"
                                    />
                                ) : (
                                    <span className="h-4 w-4 shrink-0" />
                                )}
                            </button>
                        );
                    })}
                </div>
            ) : null}
        </div>
    );
};
