/* */
import type { CreateModeOption } from '../../types/create';
import { cx } from '../../utils/classNames';

export const CreateModeSwitch = ({ modes }: { modes: CreateModeOption[] }) => {
    return (
        <div className="absolute left-8 top-[34px] flex h-[58px] w-[305px] items-center gap-3 rounded-xl border border-[#E7E5E0] bg-[#F1EFEC] p-1">
            {modes.map((mode) => (
                <span
                    key={mode.label}
                    className={cx(
                        'grid h-[50px] place-items-center rounded-lg text-[20px] leading-none',
                        mode.widthClassName,
                        mode.tone === 'active'
                            ? 'bg-white font-bold text-[#1C1917] shadow-[0_2px_8px_rgba(28,25,23,0.08)]'
                            : 'bg-transparent font-medium text-[#A8A29E] cursor-not-allowed'
                    )}
                >
                    {mode.label}
                </span>
            ))}
        </div>
    );
};
