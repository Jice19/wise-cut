/* */
import type { EditorIconName } from '../../../types/editor-screen';
import { Icon } from '../../Icon';

export const ConfigPrimaryButton = ({
    disabled = false,
    isLoading = false,
    label,
    icon,
    onClick
}: {
    disabled?: boolean;
    isLoading?: boolean;
    label: string;
    icon: EditorIconName;
    onClick?: () => void;
}) => {
    return (
        <button
            type="button"
            disabled={disabled}
            onClick={onClick}
            className="flex h-[42px] w-full items-center justify-center gap-2 rounded-[10px] bg-[#D97706] text-[13px] font-[850] text-white transition hover:bg-[#F47787] disabled:cursor-not-allowed disabled:opacity-60"
        >
            <Icon
                name={icon}
                className={`h-[15px] w-[15px] ${isLoading ? 'animate-spin' : ''}`}
            />
            {label}
        </button>
    );
};
