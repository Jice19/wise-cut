
import { railModes } from '../constants/editor-screen';
import type { ConfigMode, RailMode } from '../types/editor-screen';
import { cx } from '../utils/classNames';

import { Icon } from './Icon';

const modeToneClassNames: Record<RailMode['tone'], string> = {
    current: 'text-[#F05F73]',
    default: 'text-[#6F7784]'
};

export const ModeRail = ({
    activeMode,
    onModeChange
}: {
    activeMode: ConfigMode;
    onModeChange: (mode: ConfigMode) => void;
}) => {
    return (
        <nav
            className="flex flex-col items-center gap-4 border-l border-[#2A2F38] bg-[#101216] pt-[18px]"
            aria-label="编辑功能"
        >
            {railModes.map((item) => (
                <button
                    key={item.label}
                    type="button"
                    data-mode={item.mode}
                    aria-current={item.mode === activeMode ? 'page' : undefined}
                    onClick={() => onModeChange(item.mode)}
                    className={cx(
                        'grid w-[52px] h-[52px] cursor-pointer place-items-center rounded-[10px] text-xs font-bold transition-all duration-200 hover:-translate-y-[1px] hover:bg-white/5',
                        item.mode === activeMode
                            ? modeToneClassNames.current
                            : modeToneClassNames.default
                    )}
                >
                    <Icon name={item.icon} className="h-5 w-5" />
                    <span>{item.label}</span>
                </button>
            ))}
        </nav>
    );
};
