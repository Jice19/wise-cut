import { Icon } from './icons';

/** LeftColumn 顶部 (Pencil HiU9l SBHeader) */
export const SceneColumnHeader = (): JSX.Element => (
    <div className="flex h-7 items-center gap-2">
        <h2 className="text-[13px] font-bold text-text-primary">分镜列表</h2>
        <div className="flex h-[18px] items-center rounded bg-brand-soft px-1.5">
            <span className="font-mono text-[10px] font-semibold text-brand">
                12
            </span>
        </div>
        <div className="flex-1" />
        <button
            type="button"
            aria-label="新增分镜"
            className="flex h-6 w-6 items-center justify-center rounded bg-bg-sunken text-text-secondary"
        >
            <Icon name="plus" boxSize={4} />
        </button>
    </div>
);

/** LeftColumn search bar (Pencil MPsNw) */
export const SceneSearchBar = (): JSX.Element => (
    <div className="flex h-8 items-center gap-2 rounded border border-border-subtle bg-bg-sunken px-2.5">
        <Icon name="search" boxSize={4} className="text-text-tertiary" />
        <span className="text-[11px] text-text-tertiary">搜索分镜...</span>
    </div>
);
