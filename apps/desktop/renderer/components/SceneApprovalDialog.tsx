/**
 * SceneApprovalDialog —— scene_approval interrupt 弹窗。
 *
 * 消费 SceneApprovalRequest,渲染 brief + scenes 卡片列表。
 * 用户点"批准" / "驳回" → 调 onApprove(boolean),然后 onClose 卸载。
 *
 * 视觉:
 *   - 顶部 modal 半透明遮罩
 *   - 居中卡片宽 720px,内部按 scene 卡片堆叠
 *   - 底部固定 approve/reject 按钮
 */

import { useEffect, useRef } from 'react';

import type { SceneApprovalRequest } from '../../../shared/ipc';

export type SceneApprovalDialogProps = {
    onApprove: (approved: boolean) => void;
    onClose: () => void;
    request: SceneApprovalRequest;
};

const formatDuration = (ms: number): string => {
    const seconds = Math.round(ms / 1000);
    return `${seconds}s`;
};

export const SceneApprovalDialog = ({
    onApprove,
    onClose,
    request
}: SceneApprovalDialogProps): JSX.Element => {
    const dialogRef = useRef<HTMLDivElement>(null);

    useEffect(() => {
        const handleKey = (e: KeyboardEvent): void => {
            if (e.key === 'Escape') {
                onClose();
            }
        };
        window.addEventListener('keydown', handleKey);
        dialogRef.current?.focus();
        return () => {
            window.removeEventListener('keydown', handleKey);
        };
    }, [onClose]);

    const scenes = request.payload.scenes;
    const brief = request.payload.brief;

    return (
        <div
            className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-8"
            onClick={(e) => {
                if (e.target === e.currentTarget) onClose();
            }}
        >
            <div
                ref={dialogRef}
                tabIndex={-1}
                role="dialog"
                aria-modal="true"
                aria-labelledby="scene-approval-title"
                className="flex max-h-[85vh] w-[720px] flex-col rounded-2xl border border-border-subtle bg-bg-elevated shadow-2xl outline-none"
            >
                <header className="flex flex-col gap-1 border-b border-border-subtle p-6">
                    <h2
                        id="scene-approval-title"
                        className="text-xl font-bold text-text-primary"
                    >
                        分镜确认
                    </h2>
                    {brief && (
                        <p className="text-xs text-text-tertiary">
                            {brief.title} · {brief.tone} · 面向 {brief.audience}
                        </p>
                    )}
                </header>

                <div className="flex-1 overflow-y-auto p-6">
                    <ol className="flex flex-col gap-3">
                        {scenes.map((scene, idx) => (
                            <li
                                key={scene.sceneId}
                                className="flex gap-4 rounded-lg border border-border-subtle bg-bg-base p-4"
                            >
                                <div className="flex h-10 w-10 flex-shrink-0 items-center justify-center rounded-full border border-brand bg-brand-soft text-sm font-bold text-brand">
                                    {idx + 1}
                                </div>
                                <div className="flex min-w-0 flex-1 flex-col gap-2">
                                    <div className="flex items-center justify-between text-xs text-text-tertiary">
                                        <span>{scene.sceneId}</span>
                                        <span>
                                            {formatDuration(scene.startMs)} -{' '}
                                            {formatDuration(scene.endMs)}
                                        </span>
                                    </div>
                                    <p className="text-sm leading-relaxed text-text-primary">
                                        {scene.narration}
                                    </p>
                                    <p className="text-xs italic text-text-secondary">
                                        画面:{scene.visualBrief}
                                    </p>
                                </div>
                            </li>
                        ))}
                    </ol>
                </div>

                <footer className="flex items-center justify-end gap-3 border-t border-border-subtle p-6">
                    <button
                        type="button"
                        onClick={() => {
                            onApprove(false);
                            onClose();
                        }}
                        className="rounded-md border border-border-subtle px-5 py-2 text-sm text-text-secondary hover:bg-bg-hover"
                    >
                        驳回
                    </button>
                    <button
                        type="button"
                        onClick={() => {
                            onApprove(true);
                            onClose();
                        }}
                        className="rounded-md bg-brand px-6 py-2 text-sm font-semibold text-text-on-brand hover:bg-brand-dim"
                    >
                        批准并继续
                    </button>
                </footer>
            </div>
        </div>
    );
};
