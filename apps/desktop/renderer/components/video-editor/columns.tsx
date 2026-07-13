import type { ReactNode } from 'react';

/**
 * 编辑器三列布局：
 * - SceneColumn (W=280, 略窄于 Pencil 248 / 250)
 * - MiddleColumn (fill)
 * - RightColumn (W=320, 严格匹配 f2yO2)
 *
 *  三个 column 间用 gap-2 留呼吸，不再紧贴；每个 column 自带圆角 + 边框。
 */

export const ColumnLayout = ({
    children
}: {
    children: ReactNode;
}): JSX.Element => (
    <div className="flex h-full w-full gap-2 overflow-hidden p-2">
        {children}
    </div>
);

export const SceneColumn = ({
    children
}: {
    children: ReactNode;
}): JSX.Element => (
    <aside className="flex w-[280px] flex-shrink-0 flex-col gap-3 overflow-y-auto rounded-lg border border-border-subtle bg-bg-elevated p-5">
        {children}
    </aside>
);

export const MiddleColumn = ({
    children
}: {
    children: ReactNode;
}): JSX.Element => (
    <section className="flex min-w-0 flex-1 flex-col gap-2 overflow-hidden rounded-lg border border-border-subtle bg-bg-elevated">
        {children}
    </section>
);

export const RightColumn = ({
    children
}: {
    children: ReactNode;
}): JSX.Element => (
    <aside className="flex w-[320px] flex-shrink-0 flex-col overflow-y-auto rounded-lg border border-border-subtle bg-bg-elevated">
        {children}
    </aside>
);
