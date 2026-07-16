/* */
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
        'border-[#E7E5E0] bg-[#F1EFEC] text-[#57534E] hover:border-[#E7E5E0] hover:text-white',
    accent: 'border-[#E7E5E0] bg-[#D97706] text-white',
    history: 'border-[#E7E5E0] bg-[#F1EFEC] text-[#57534E]',
    timeline: 'border-[#E7E5E0] bg-[#F1EFEC] text-[#57534E]',
    timelineActive: 'border-[#E7E5E0] bg-[#F1EFEC] text-white'
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
