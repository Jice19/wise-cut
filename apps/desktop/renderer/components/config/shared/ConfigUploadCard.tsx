/* */
import type { VoiceUploadCard } from '../../../types/config';
import { cx } from '../../../utils/classNames';
import { Icon } from '../../Icon';

export const ConfigUploadCard = ({
    card,
    className,
    disabled,
    onClick,
    statusLabel
}: {
    card: VoiceUploadCard;
    className?: string;
    disabled?: boolean;
    onClick?: () => void;
    statusLabel?: string;
}) => {
    return (
        <button
            type="button"
            disabled={disabled}
            onClick={onClick}
            className={cx(
                'relative h-[72px] w-[260px] rounded-[12px] border border-[#3A3F49] bg-[#101216] px-[14px] py-[13px] text-left transition-all duration-200 hover:-translate-y-[1px] hover:bg-[#262B33]',
                disabled
                    ? 'cursor-not-allowed opacity-55 hover:translate-y-0 hover:bg-[#101216]'
                    : 'cursor-pointer',
                className
            )}
        >
            <div className="flex h-[23px] w-[107px] items-center gap-1 rounded-[8px] text-left text-white">
                <Icon name={card.buttonIcon} className="h-4 w-4 shrink-0" />
                <span className="text-[12px] font-[800] leading-none">
                    {card.title}
                </span>
            </div>
            <p className="mt-[12px] text-[9px] font-semibold leading-[1.25] text-[#6F7784]">
                {statusLabel ?? card.description}
            </p>
        </button>
    );
};
