import type { ComponentType } from 'react';
import { NavLink } from 'react-router-dom';

import { Icon } from './icons';

type IconName = React.ComponentProps<typeof Icon>['name'];

interface NavItemDef {
    to: string;
    label: string;
    icon: IconName;
}

/**
 * Sidebar 组件对应 Pencil 中的 Sidebar (NmASa) reusable component。
 * 64px 宽、垂直布局，brand + 4 个 nav + spacer + avatar。
 * 高亮用 descendant override：active 时填充 $brand-soft，icon/label 染色 $brand。
 */
const NAV: readonly NavItemDef[] = [
    { to: '/workspace', label: '工作台', icon: 'layout-dashboard' },
    { to: '/create', label: '创作', icon: 'sparkles' },
    { to: '/editor', label: '编辑器', icon: 'scissors' },
    { to: '/export', label: '导出', icon: 'upload' }
] as const;

export const Sidebar = (): JSX.Element => {
    return (
        <nav
            aria-label="主导航"
            className="flex h-full w-16 flex-col items-center gap-2 bg-bg-elevated py-5"
        >
            {/* Brand mark — 对应 Sidebar.Brand */}
            <div
                aria-label="AI智能剪辑平台"
                className="mb-2 flex h-10 w-10 items-center justify-center rounded-lg bg-brand text-[24px] font-bold text-text-on-brand"
            >
                J
            </div>

            {/* Divider — Pencil 里 32×1 */}
            <div className="my-2 h-px w-8 bg-border-subtle" />

            {/* Nav items */}
            {NAV.map((item) => (
                <NavLink
                    key={item.to}
                    to={item.to}
                    className={({ isActive }) =>
                        [
                            'flex h-14 w-14 flex-col items-center justify-center gap-1 rounded-lg border transition',
                            isActive
                                ? 'border-brand bg-brand-soft text-brand'
                                : 'border-border-subtle bg-bg-elevated text-text-secondary hover:bg-bg-hover'
                        ].join(' ')
                    }
                >
                    <Icon name={item.icon} boxSize={5} />
                    <span className="text-[10px] font-normal">
                        {item.label}
                    </span>
                </NavLink>
            ))}

            {/* spacer → avatar at bottom */}
            <div className="mt-auto" />
            <div
                aria-label="用户头像"
                className="h-8 w-8 rounded-full bg-bg-hover"
            />
        </nav>
    );
};

export type { IconName };
export type { ComponentType };
