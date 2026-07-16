/* */
import type { WorkspaceNavItem, WorkspaceView } from '../../types/workspace';
import { cx } from '../../utils/classNames';
import { Icon } from '../Icon';

const WorkspaceNavItemContent = ({ item }: { item: WorkspaceNavItem }) => {
    const isActive = item.tone === 'active';

    if (isActive) {
        return (
            <>
                <span className="pointer-events-none absolute left-[13px] top-[8px] h-[60px] w-[72px] rounded-full bg-[radial-gradient(circle_at_45%_45%,#FFFFFF5C_0%,#FCD34D22_44%,#FFFFFF00_100%)] opacity-[0.6] blur-[8px]" />
                <span className="absolute left-[26px] top-[18px] grid h-[46px] w-[46px] place-items-center rounded-[23px] border border-[#D97706] bg-white text-[#D97706] shadow-[0_4px_14px_rgba(217,119,6,0.32)]">
                    <Icon name={item.icon} className="h-[22px] w-[22px]" />
                </span>
                <span className="absolute left-0 top-[75px] w-[98px] text-center font-['Geist'] text-[12px] font-bold leading-none text-[#1C1917]">
                    {item.label}
                </span>
            </>
        );
    }

    return (
        <>
            <span className="absolute left-[28px] top-[14px] grid h-[42px] w-[42px] place-items-center rounded-[21px] border border-[#E7E5E0] bg-white text-[#57534E] transition-all duration-200">
                <Icon
                    name={item.icon}
                    className={cx(
                        item.icon === 'house'
                            ? 'h-[20px] w-[20px]'
                            : 'h-[20px] w-[20px]'
                    )}
                />
            </span>
            <span className="absolute left-0 top-[65px] w-[98px] text-center font-['Geist'] text-[12px] font-medium leading-none text-[#A8A29E]">
                {item.label}
            </span>
        </>
    );
};

export const WorkspaceSidebarNavItem = ({
    item,
    onSelect
}: {
    item: WorkspaceNavItem;
    onSelect?: (view: WorkspaceView) => void;
}) => {
    const isActive = item.tone === 'active';
    const className = cx(
        'relative block w-[98px] rounded-[46px] transition-all duration-200',
        isActive
            ? 'h-[108px] overflow-hidden bg-[linear-gradient(165deg,#FDE68A_0%,#FBBF24_48%,#F59E0B_100%)] shadow-[0_8px_22px_rgba(217,119,6,0.28)]'
            : 'h-[92px] bg-transparent opacity-90 hover:bg-[#F1EFEC] hover:opacity-100'
    );

    const view = item.view;

    if (view) {
        return (
            <button
                type="button"
                aria-current={isActive ? 'page' : undefined}
                className={cx(
                    className,
                    'cursor-pointer appearance-none border-0 p-0 text-left'
                )}
                onClick={() => onSelect?.(view)}
            >
                <WorkspaceNavItemContent item={item} />
            </button>
        );
    }

    if (item.href) {
        return (
            <a
                href={item.href}
                aria-current={isActive ? 'page' : undefined}
                className={className}
            >
                <WorkspaceNavItemContent item={item} />
            </a>
        );
    }

    return (
        <div className={className}>
            <WorkspaceNavItemContent item={item} />
        </div>
    );
};
