import type { ReactNode } from 'react';

import { Icon } from './icons';

export interface SceneCardProps {
    /** 编号，例如 "01" / "02" — 渲染为左上角 ID 徽章。 */
    id: string;
    title: string;
    /** 副行（时长 · 元数据）。React 端可塞任意 node。 */
    meta?: ReactNode;
    /** 缩略图渐变背景。 */
    thumbBg: string;
    /** 是否当前激活 scene。激活时填充 $brand-soft + $brand 描边。 */
    active?: boolean;
    /** 是否还在回放中（顶部显示播放点）。 */
    playing?: boolean;
}

/**
 * 左列 Pencil 中 6 个分镜（Scene 01..06）复刻为单一组件，
 * 对应 .pen 节点 Scene01 (Y1Fzi) / Scene02 (l9lY6j) / …。
 *
 * 结构：
 * - 60×60 渐变缩略图 + 角标
 * - 右侧 Title（text-primary, 12, weight 600–700）+ Meta 行（gap 6, 高度 14）
 */
export const SceneCard = ({
    id,
    title,
    meta,
    thumbBg,
    active = false,
    playing = false
}: SceneCardProps): JSX.Element => (
    <div
        className={[
            'flex h-[76px] items-center gap-2.5 rounded-md p-2',
            active
                ? 'border border-brand bg-brand-soft'
                : 'border border-border-subtle bg-bg-sunken'
        ].join(' ')}
    >
        {/* 缩略图 */}
        <div
            className="relative h-[60px] w-[60px] flex-shrink-0 rounded"
            style={{ background: thumbBg }}
        >
            <span className="absolute left-1 top-1 rounded bg-black/70 px-1 py-[1px] font-mono text-[8px] font-semibold text-white">
                {id}
            </span>
            {playing && (
                <span className="absolute right-1 top-1 h-2.5 w-2.5 rounded-full bg-brand" />
            )}
        </div>

        {/* 文字 */}
        <div className="flex h-full w-[160px] flex-col justify-center gap-1.5">
            <span
                className={[
                    'text-xs',
                    active
                        ? 'font-bold text-text-primary'
                        : 'font-semibold text-text-primary'
                ].join(' ')}
            >
                {title}
            </span>
            <div className="flex h-3.5 items-center gap-1.5 text-text-tertiary">
                {meta ?? (
                    <>
                        <span className="font-mono text-[10px]">02:13</span>
                        <span>·</span>
                        <span className="font-mono text-[10px]">已生成</span>
                    </>
                )}
            </div>
        </div>
    </div>
);

/**
 * SceneList 对应 Pencil `R6hhSd` + 头部 + footer。
 * 内部使用 SceneCard 组件循环渲染。
 */
export interface SceneListProps {
    scenes: readonly SceneCardProps[];
    activeId: string;
    onSelect?: (id: string) => void;
    totalShown?: number;
    totalCount?: number;
}

export const SceneList = ({
    scenes,
    activeId,
    onSelect,
    totalShown,
    totalCount = 12
}: SceneListProps): JSX.Element => {
    const shown = totalShown ?? scenes.length;
    return (
        <div className="flex flex-1 flex-col gap-3.5 overflow-auto">
            {scenes.map((s) => (
                <button
                    key={s.id}
                    type="button"
                    onClick={() => onSelect?.(s.id)}
                    className="text-left"
                >
                    <SceneCard {...s} active={s.id === activeId} />
                </button>
            ))}

            <div className="flex h-8 items-center justify-center gap-1.5 rounded border border-border-subtle bg-bg-sunken">
                <Icon
                    name="chevrons-up-down"
                    boxSize={4}
                    className="text-text-tertiary"
                />
                <span className="font-mono text-[10px] text-text-tertiary">
                    已显示 {shown} · 滚动查看更多（共 {totalCount}）
                </span>
            </div>
        </div>
    );
};
