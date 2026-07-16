/* */
import { type KeyboardEvent, type MouseEvent, useEffect, useRef } from 'react';

import type { WorkspaceProject } from '../../types/workspace';
import { Icon } from '../Icon';

export const ProjectDeleteConfirmDialog = ({
    errorMessage,
    isDeleting = false,
    onCancel,
    onConfirm,
    project
}: {
    errorMessage?: string;
    isDeleting?: boolean;
    onCancel: () => void;
    onConfirm: () => void;
    project?: WorkspaceProject;
}) => {
    const cancelButtonRef = useRef<HTMLButtonElement>(null);
    const previousActiveElementRef = useRef<HTMLElement | null>(null);

    useEffect(() => {
        if (!project) return undefined;

        previousActiveElementRef.current =
            document.activeElement instanceof HTMLElement
                ? document.activeElement
                : null;
        cancelButtonRef.current?.focus();

        return () => {
            previousActiveElementRef.current?.focus();
            previousActiveElementRef.current = null;
        };
    }, [project?.id]);

    if (!project) return null;

    const handleBackdropClick = () => {
        if (isDeleting) return;

        onCancel();
    };

    const handleDialogClick = (event: MouseEvent<HTMLElement>) => {
        event.stopPropagation();
    };

    const handleDialogKeyDown = (event: KeyboardEvent<HTMLElement>) => {
        if (event.key !== 'Escape' || isDeleting) return;

        event.stopPropagation();
        onCancel();
    };

    return (
        <div
            className="fixed inset-0 z-[80] flex items-center justify-center bg-[#05060A]/72 px-6 backdrop-blur-[18px]"
            onClick={handleBackdropClick}
        >
            <section
                role="dialog"
                aria-modal="true"
                aria-labelledby="project-delete-title"
                aria-describedby="project-delete-description"
                className="w-full max-w-[420px] rounded-[22px] border border-white/12 bg-[#181A20]/95 p-6 text-[#F5F7FA] shadow-[0_28px_90px_rgba(0,0,0,0.46)]"
                onClick={handleDialogClick}
                onKeyDown={handleDialogKeyDown}
            >
                <div className="flex items-start justify-between gap-4">
                    <div className="grid h-11 w-11 shrink-0 place-items-center rounded-full bg-[#FF4D6D]/14 text-[#FF8A9B]">
                        <Icon name="trash-2" className="h-5 w-5" />
                    </div>
                    <button
                        type="button"
                        aria-label="关闭删除确认"
                        className="grid h-8 w-8 place-items-center rounded-full text-[#858B96] transition-colors duration-200 hover:bg-white/8 hover:text-white focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#B497CF]"
                        disabled={isDeleting}
                        onClick={onCancel}
                    >
                        <Icon name="x" className="h-4 w-4" />
                    </button>
                </div>

                <div className="mt-5">
                    <h2
                        id="project-delete-title"
                        className="text-[20px] font-[900] leading-tight text-white"
                    >
                        确认删除项目
                    </h2>
                    <p
                        id="project-delete-description"
                        className="mt-3 text-[13px] font-[650] leading-[1.7] text-[#AEB4BF]"
                    >
                        删除后将从项目列表移除，且无法恢复。请确认是否删除
                        <span className="text-[#F5F7FA]">
                            「{project.title}」
                        </span>
                        。
                    </p>
                </div>

                {errorMessage ? (
                    <p
                        role="alert"
                        className="mt-4 rounded-[12px] border border-[#FF4D6D]/22 bg-[#FF4D6D]/10 px-3 py-2 text-[12px] font-[700] leading-[1.6] text-[#FF9BAD]"
                    >
                        {errorMessage}
                    </p>
                ) : null}

                <div className="mt-6 flex items-center justify-end gap-3">
                    <button
                        type="button"
                        className="h-10 rounded-full border border-white/10 px-5 text-[13px] font-[800] text-[#CBD1DA] transition-colors duration-200 hover:border-white/18 hover:bg-white/8 hover:text-white focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#B497CF]"
                        disabled={isDeleting}
                        onClick={onCancel}
                        ref={cancelButtonRef}
                    >
                        取消
                    </button>
                    <button
                        type="button"
                        className="inline-flex h-10 items-center gap-2 rounded-full bg-[#FF4D6D] px-5 text-[13px] font-[900] text-white shadow-[0_12px_30px_rgba(255,77,109,0.26)] transition-colors duration-200 hover:bg-[#FF6681] focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#FFD1DA] disabled:cursor-not-allowed disabled:opacity-70"
                        disabled={isDeleting}
                        onClick={onConfirm}
                    >
                        <Icon name="trash-2" className="h-4 w-4" />
                        {isDeleting ? '删除中...' : '确认删除'}
                    </button>
                </div>
            </section>
        </div>
    );
};
