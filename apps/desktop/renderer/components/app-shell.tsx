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
 * 1920×1080 桌面设计，按 fit 缩放；用 min-w 1280 / min-h 720 保证小窗口可用性。
 */
export const AppShell = ({
    children,
    pageLabel
}: AppShellProps): JSX.Element => {
    return (
        <div className="flex h-screen w-screen min-w-[1280px] min-h-[720px] overflow-hidden bg-bg-base text-text-primary">
            <Sidebar />
            <div className="flex h-full flex-1 flex-col">
                <TopBar pageLabel={pageLabel} />
                <main className="flex-1 overflow-auto px-10 py-7">
                    {children}
                </main>
            </div>
        </div>
    );
};
