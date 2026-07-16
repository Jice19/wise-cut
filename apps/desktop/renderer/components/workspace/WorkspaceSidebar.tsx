/* */
import type {
    WorkspaceBrand,
    WorkspaceNavItem,
    WorkspaceView
} from '../../types/workspace';
import Aurora from '../reactbits/Aurora/Aurora';

import { WorkspaceSidebarNavItem } from './WorkspaceSidebarNavItem';

const workspaceBrandLogoUrl = new URL(
    '../../assets/brand/coding.png',
    import.meta.url
).href;

const WorkspaceBrandMark = ({ label }: { label: string }) => {
    return (
        <div className="grid h-12 w-12 place-items-center overflow-hidden rounded-[8px] shadow-[0_8px_24px_rgba(88,44,255,0.22)]">
            <img
                src={workspaceBrandLogoUrl}
                alt={label}
                className="h-full w-full object-cover"
                draggable={false}
            />
        </div>
    );
};

export const WorkspaceSidebar = ({
    brand,
    navItems,
    onNavItemSelect
}: {
    brand: WorkspaceBrand;
    navItems: WorkspaceNavItem[];
    onNavItemSelect?: (view: WorkspaceView) => void;
}) => {
    return (
        <aside className="relative h-full w-[260px] overflow-hidden border-r border-[#E7E5E0] bg-[#FAF9F7]">
            <div
                aria-hidden="true"
                className="workspace-sidebar-aurora-fallback pointer-events-none absolute inset-0 z-0 bg-[radial-gradient(ellipse_at_55%_30%,#FCD34D30_0%,#FB923C18_42%,transparent_72%),linear-gradient(180deg,#FFFFFF_0%,#F1EFEC_48%,#FAF9F7_100%)]"
            />
            <div
                aria-hidden="true"
                className="workspace-sidebar-aurora-layer pointer-events-none absolute inset-0 z-[1] overflow-hidden opacity-60 mix-blend-multiply"
            >
                <Aurora
                    className="workspace-sidebar-aurora-horizontal"
                    colorStops={['#FCD34D', '#FB923C', '#F59E0B']}
                    amplitude={0.95}
                    blend={0.62}
                    speed={0.7}
                />
            </div>
            <div className="pointer-events-none absolute inset-0 z-[2] bg-white/30" />
            <div className="pointer-events-none absolute left-[20px] top-[318px] z-[2] h-[444px] w-[220px] rounded-[110px] bg-[radial-gradient(circle_at_center,#FCD34D42_0%,#FB923C24_38%,#FAF9F700_72%)] opacity-50 blur-[38px]" />
            <div className="pointer-events-none absolute left-[33px] top-[542px] z-[2] h-1 w-[196px] -rotate-[7deg] rounded-full bg-[linear-gradient(90deg,transparent_0%,#F59E0BCC_38%,#FB923CD9_62%,transparent_100%)] opacity-70 blur-[18px]" />
            <div className="absolute left-[20px] top-[30px] z-[3] flex w-[230px] items-center gap-3">
                <WorkspaceBrandMark label={brand.name} />
                <div className="grid gap-0.5">
                    <h1 className="text-[24px] font-bold leading-none text-[#1C1917]">
                        {brand.name}
                    </h1>
                    <p className="font-['Geist'] text-[11px] font-normal leading-none text-[#78716C]">
                        {brand.description}
                    </p>
                </div>
            </div>
            <nav className="absolute left-0 top-[342px] z-[3] ml-[26px] h-[428px] w-[120px] rounded-[60px] bg-[linear-gradient(180deg,#FFFFFF_0%,#FEF3C7_48%,#FED7AA_100%)] p-px shadow-[0_8px_22px_rgba(217,119,6,0.16)]">
                <div className="flex h-full w-full flex-col items-center gap-[18px] rounded-[59px] bg-white px-[10px] py-[49px]">
                    {navItems.map((item) => (
                        <WorkspaceSidebarNavItem
                            key={item.label}
                            item={item}
                            onSelect={onNavItemSelect}
                        />
                    ))}
                </div>
            </nav>
        </aside>
    );
};
