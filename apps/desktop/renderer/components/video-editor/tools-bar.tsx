import type { ReactNode } from 'react';

import { Icon } from '../icons';

export interface ToolDef {
    name: string;
    icon: 'pointer' | 'scissors' | 'gauge' | 'type' | 'sparkles' | 'music';
}

export const ToolsBar = ({
    active,
    onSelect
}: {
    active: ToolDef['name'];
    onSelect?: (name: ToolDef['name']) => void;
}): JSX.Element => {
    const tools: readonly ToolDef[] = [
        { name: '选择', icon: 'pointer' },
        { name: '切割', icon: 'scissors' },
        { name: '速度', icon: 'gauge' },
        { name: '文字', icon: 'type' },
        { name: '特效', icon: 'sparkles' },
        { name: '音频', icon: 'music' }
    ];

    return (
        <div className="flex h-10 items-center gap-1.5 border-b border-border-subtle bg-bg-elevated px-4">
            {tools.map((t) => {
                const isActive = active === t.name;
                return (
                    <button
                        key={t.name}
                        type="button"
                        onClick={() => onSelect?.(t.name)}
                        className={[
                            'flex h-7 items-center gap-1.5 rounded-2xl px-2.5 text-[11px] transition',
                            isActive
                                ? 'border border-brand bg-brand-soft font-semibold text-brand'
                                : 'border border-border-subtle bg-bg-sunken text-text-secondary hover:bg-bg-hover'
                        ].join(' ')}
                    >
                        <Icon name={t.icon} boxSize={4} />
                        <span>{t.name}</span>
                    </button>
                );
            })}

            {/* spacer → 缩放控制 + AI 一键剪辑 */}
            <div className="flex-1" />
            <ZoomChip />
            <button
                type="button"
                className="flex h-7 items-center gap-1.5 rounded-2xl bg-brand px-3.5 text-[11px] font-bold text-text-on-brand"
            >
                <span>✨</span>
                <span>AI 一键剪辑</span>
            </button>
        </div>
    );
};

const ZoomChip = (): JSX.Element => (
    <div className="flex h-7 items-center gap-1.5 px-1.5">
        <Icon name="zoom-out" boxSize={4} className="text-text-tertiary" />
        <div className="h-1 w-[120px] rounded-sm bg-bg-sunken" />
        <Icon name="zoom-in" boxSize={4} className="text-text-tertiary" />
    </div>
);

export type ToolsBarSlot = ReactNode;
