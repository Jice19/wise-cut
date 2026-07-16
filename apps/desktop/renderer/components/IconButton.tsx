
import type { EditorIconName } from '../types/editor-screen';
import { cx } from '../utils/classNames';

import { Icon } from './Icon';

type IconButtonVariant =
    | 'default'
    | 'accent'
    | 'history'
    | 'timeline'
    | 'timelineActive';

const variantClassNames: Record<IconButtonVariant, string> = {
    default:
        'border-[#2A2F38] bg-[#1D2026] text-[#A9AFBA] hover:border-[#F05F73] hover:text-white',
    accent: 'border-[#F05F73] bg-[#F05F73] text-white',
    history: 'border-[#2A2F38] bg-[#1A1D22] text-[#A9AFBA]',
    timeline: 'border-[#2A2F38] bg-[#1D2026] text-[#A9AFBA]',
    timelineActive: 'border-[#2A2F38] bg-[#1D2026] text-white'
};

export const IconButton = ({
    label,
    icon,
    variant = 'default',
    className,
    iconClassName
}: {
    label: string;
    icon: EditorIconName;
    variant?: IconButtonVariant;
    className?: string;
    iconClassName?: string;
}) => {
    return (
        <button
            type="button"
            aria-label={label}
            className={cx(
                'grid h-8 w-8 place-items-center rounded-lg border transition-colors',
                variantClassNames[variant],
                className
            )}
        >
            <Icon name={icon} className={iconClassName} />
        </button>
    );
};
