import type { ReactNode } from 'react';

import { Icon } from '../icons';

export interface AssetCardProps {
    name: string;
    /** 缩略图 CSS 背景（linear-gradient 或 url）。 */
    thumbBg: string;
    /** 标签行（时长 / 类型 / 标签 chip）。 */
    meta?: ReactNode;
    selected?: boolean;
}

/** 单个素材卡，对应 .pen 中 Asset 樱花飘落 / 光斑闪烁 / 粒子光效 等。 */
export const AssetCard = ({
    name,
    thumbBg,
    meta,
    selected = false
}: AssetCardProps): JSX.Element => (
    <div
        className={[
            'flex h-[154px] flex-col gap-1.5 rounded-md p-1.5',
            selected
                ? 'border-[1.5px] border-brand bg-bg-elevated'
                : 'border border-border-subtle bg-bg-elevated'
        ].join(' ')}
    >
        <div className="h-24 w-full rounded" style={{ background: thumbBg }} />
        <div className="flex flex-1 flex-col gap-0.5 p-1">
            <span className="truncate text-[11px] font-semibold text-text-primary">
                {name}
            </span>
            {meta ?? (
                <span className="font-mono text-[10px] text-text-tertiary">
                    00:04 · 4K
                </span>
            )}
        </div>
    </div>
);

/* Tab chip + Filter chip — Pencil RCTabs/RCRef */

export interface TabChipProps {
    icon: 'layers' | 'mic' | 'image' | 'type' | 'sparkles';
    label: string;
    count?: number;
    active?: boolean;
}

export const TabChip = ({
    icon,
    label,
    count,
    active = false
}: TabChipProps): JSX.Element => (
    <div
        className={[
            'flex h-6 items-center gap-1.5 rounded-xl px-2.5',
            active
                ? 'border border-brand bg-brand-soft'
                : 'border border-border-subtle bg-bg-sunken'
        ].join(' ')}
    >
        <Icon
            name={icon}
            boxSize={4}
            className={active ? 'text-brand' : 'text-text-secondary'}
        />
        <span
            className={[
                'text-[11px]',
                active
                    ? 'font-semibold text-brand'
                    : 'font-normal text-text-secondary'
            ].join(' ')}
        >
            {label}
        </span>
        {count !== undefined && (
            <span
                className={[
                    'font-mono text-[10px]',
                    active ? 'opacity-70 text-brand' : 'text-text-tertiary'
                ].join(' ')}
            >
                {count}
            </span>
        )}
    </div>
);

export interface FilterChipProps {
    label: string;
    active?: boolean;
}

export const FilterChip = ({
    label,
    active = false
}: FilterChipProps): JSX.Element => (
    <div
        className={[
            'flex h-[18px] items-center justify-center rounded-lg px-2',
            active
                ? 'bg-brand font-semibold text-text-on-brand'
                : 'border border-border-subtle bg-bg-sunken text-text-secondary'
        ].join(' ')}
    >
        <span className="text-[10px]">{label}</span>
    </div>
);

/* Search box + RCActions */

export const SearchBox = ({
    placeholder = '搜索素材名称、标签…'
}: {
    placeholder?: string;
}): JSX.Element => (
    <div className="flex h-7 flex-1 items-center gap-1.5 rounded border border-border-subtle bg-bg-sunken px-2.5">
        <Icon name="search" boxSize={4} className="text-text-tertiary" />
        <span className="text-[11px] text-text-tertiary">{placeholder}</span>
    </div>
);

export const FilterBtn = (): JSX.Element => (
    <button
        type="button"
        aria-label="筛选"
        className="flex h-7 w-7 items-center justify-center rounded border border-border-subtle bg-bg-sunken text-text-secondary hover:bg-bg-hover"
    >
        <Icon name="sliders-horizontal" boxSize={4} />
    </button>
);

export const LibraryPanel = ({
    tabs,
    activeTab,
    chips,
    assets,
    selectedAssetName,
    onSelectAsset
}: {
    tabs: readonly TabChipProps[];
    activeTab: string;
    chips: readonly FilterChipProps[];
    assets: readonly AssetCardProps[];
    selectedAssetName?: string;
    onSelectAsset?: (name: string) => void;
}): JSX.Element => (
    <section className="flex h-full flex-col gap-0">
        {/* Header */}
        <header className="flex h-12 items-center justify-between border-b border-border-subtle bg-bg-elevated px-4">
            <div className="flex items-center gap-2">
                <h2 className="text-[13px] font-bold text-text-primary">
                    素材库
                </h2>
                <span className="rounded-md bg-bg-sunken px-1.5 py-0.5 font-mono text-[10px] text-text-secondary">
                    238
                </span>
            </div>
            <div className="flex items-center gap-1">
                <IconBtn icon="upload" />
                <IconBtn icon="ellipsis" />
            </div>
        </header>

        {/* Tabs */}
        <div className="flex h-9 items-center gap-1 border-b border-border-subtle bg-bg-elevated px-4 py-1">
            {tabs.map((t) => (
                <TabChip key={t.label} {...t} active={activeTab === t.label} />
            ))}
        </div>

        {/* Search */}
        <div className="flex h-9 items-center gap-2 border-b border-border-subtle bg-bg-elevated px-4">
            <SearchBox />
            <FilterBtn />
        </div>

        {/* Filter chips */}
        <div className="flex h-8 items-center gap-1.5 border-b border-border-subtle bg-bg-elevated px-4">
            {chips.map((c) => (
                <FilterChip key={c.label} {...c} />
            ))}
        </div>

        {/* Asset grid (2 cols * 4 rows = 8 cards) */}
        <div className="grid flex-1 grid-cols-2 gap-2.5 overflow-auto bg-bg-base p-3.5">
            {assets.map((a) => (
                <button
                    key={a.name}
                    type="button"
                    onClick={() => onSelectAsset?.(a.name)}
                    className="text-left"
                >
                    <AssetCard {...a} selected={selectedAssetName === a.name} />
                </button>
            ))}
        </div>

        {/* Footer */}
        <footer className="flex h-9 items-center justify-between border-t border-border-subtle bg-bg-elevated px-4 text-[10px]">
            <span className="text-text-tertiary">
                已选 1 个 · 共 {assets.length} 项
            </span>
            <span className="text-brand">查看全部 →</span>
        </footer>
    </section>
);

const IconBtn = ({ icon }: { icon: 'upload' | 'ellipsis' }): JSX.Element => (
    <button
        type="button"
        aria-label={icon}
        className="flex h-6 w-6 items-center justify-center rounded text-text-secondary hover:bg-bg-hover"
    >
        <Icon name={icon} boxSize={4} />
    </button>
);
