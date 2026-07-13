import type { ReactNode } from 'react';

import { Sidebar } from './sidebar';
import { TopBar } from './top-bar';

interface AppShellProps {
    /** 渲染于右下的页面内容（Pencil 中的 ContentArea）。 */
    children: ReactNode;
    /** 当前 Screen 的中文名（驱动 TopBar 末项）。 */
    pageLabel: string;
}

/**
 * AppShell = Sidebar + TopBar + ContentArea 的固定两列布局。
 *
 * 1920×1080 桌面设计，按 fit 缩放 —— 不强加 min-width，让内容随窗口自动撑满；
 * 在小窗口下 Editor 三列会自然收紧。
 */
export const AppShell = ({
    children,
    pageLabel
}: AppShellProps): JSX.Element => {
    return (
        <div className="flex h-screen w-screen overflow-hidden bg-bg-base p-2 text-text-primary">
            <Sidebar />
            <div className="flex h-full min-w-0 flex-1 flex-col gap-2">
                <TopBar pageLabel={pageLabel} />
                <main className="flex min-h-0 min-w-0 flex-1 flex-col overflow-hidden rounded-lg border border-border-subtle bg-bg-base">
                    {children}
                </main>
            </div>
        </div>
    );
};
