import { Icon } from './icons';

interface TopBarProps {
    /** 当前所在 Screen 的中文名，对应 Pencil TopBar 的「/PageCrumb」。 */
    pageLabel: string;
    /** 项目中文名，默认「春日Vlog」；之后改为 store 取数。 */
    projectLabel?: string;
}

/**
 * TopBar 组件对应 Pencil 中 TopBar (QiPvE) reusable component。
 * 56px 高、水平布局、左 breadcrumb / 中 save indicator / 右 actions。
 *
 * descendant override：Pencil 端每个 Screen 实例把 qGNAX.content 改成
 * '工作台' / '创作' / '智能体运行' / '编辑器'；React 端此处通过 prop 切换。
 */
export const TopBar = ({
    pageLabel,
    projectLabel = '春日Vlog'
}: TopBarProps): JSX.Element => {
    return (
        <header className="flex h-14 w-full items-center justify-between bg-bg-base px-6">
            {/* 左: Breadcrumb */}
            <div className="flex items-center gap-2 font-sans text-[13px]">
                <span className="font-semibold text-brand">AI智能剪辑</span>
                <span className="text-text-tertiary">/</span>
                <span className="text-text-secondary">{projectLabel}</span>
                <span className="text-text-tertiary">/</span>
                <span className="text-text-primary">{pageLabel}</span>
            </div>

            {/* 中: Save indicator + timestamp */}
            <div className="flex items-center gap-3">
                <div className="rounded border border-border-subtle bg-bg-elevated px-2.5 py-1 text-[12px] text-text-secondary">
                    ✓ 自动保存
                </div>
                <span className="font-mono text-[12px] text-text-tertiary">
                    2026-07-12&nbsp;&nbsp;14:32:08
                </span>
            </div>

            {/* 右: Search / Notify / Help / Avatar */}
            <div className="flex items-center gap-2">
                <button
                    type="button"
                    aria-label="搜索"
                    className="flex h-9 w-9 items-center justify-center rounded-md border border-border-subtle bg-bg-elevated text-text-secondary hover:bg-bg-hover"
                >
                    <Icon name="search" boxSize={5} />
                </button>
                <button
                    type="button"
                    aria-label="通知"
                    className="flex h-9 w-9 items-center justify-center rounded-md border border-border-subtle bg-bg-elevated text-text-secondary hover:bg-bg-hover"
                >
                    <Icon name="bell" boxSize={5} />
                </button>
                <button
                    type="button"
                    aria-label="帮助"
                    className="flex h-9 w-9 items-center justify-center rounded-md border border-border-subtle bg-bg-elevated text-text-secondary hover:bg-bg-hover"
                >
                    <Icon name="help-circle" boxSize={5} />
                </button>
                <div
                    aria-label="用户头像"
                    className="flex h-9 w-9 items-center justify-center rounded-full border border-brand bg-brand-soft text-brand"
                >
                    M
                </div>
            </div>
        </header>
    );
};
