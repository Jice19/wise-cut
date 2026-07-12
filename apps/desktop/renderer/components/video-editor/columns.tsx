import type { ReactNode } from 'react';

/**
 * 编辑器三列布局：
 * - SceneColumn (W=280, 略窄于 Pencil 248 / 250)
 * - MiddleColumn (fill)
 * - RightColumn (W=320, 严格匹配 f2yO2)
 *
 * 两侧不要 border-r / border-l：Pencil 中 ContentArea 是无边距的，让 Column 自己
 * 渲染自己的边框 / 背景，避免双层描边。
 */

export const ColumnLayout = ({
    children
}: {
    children: ReactNode;
}): JSX.Element => (
    <div className="flex h-full w-full min-h-[720px] gap-0 bg-bg-base">
        {children}
    </div>
);

export const SceneColumn = ({
    children
}: {
    children: ReactNode;
}): JSX.Element => (
    <aside className="flex w-[280px] flex-shrink-0 flex-col gap-3 border-r border-border-subtle bg-bg-elevated p-5">
        {children}
    </aside>
);

export const MiddleColumn = ({
    children
}: {
    children: ReactNode;
}): JSX.Element => (
    <section className="flex min-w-0 flex-1 flex-col bg-bg-base">
        {children}
    </section>
);

export const RightColumn = ({
    children
}: {
    children: ReactNode;
}): JSX.Element => (
    <aside className="flex w-[320px] flex-shrink-0 flex-col border-l border-border-subtle bg-bg-elevated">
        {children}
    </aside>
);
