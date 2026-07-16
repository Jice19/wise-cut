
import { type FormEvent, type KeyboardEvent, useEffect, useState } from 'react';

import { editorHeader } from '../constants/editor-screen';

import { EditorHomeLink } from './EditorHomeLink';
import { Icon } from './Icon';
import { WindowDragRegion } from './WindowDragRegion';

export const EditorHeader = ({
    onPrimaryAction,
    onTitleChange,
    primaryActionDisabled = false,
    primaryActionLabel = editorHeader.primaryAction,
    status = editorHeader.status,
    title = editorHeader.title
}: {
    onPrimaryAction?: () => void;
    primaryActionDisabled?: boolean;
    primaryActionLabel?: string;
    onTitleChange?: (title: string) => void;
    status?: string;
    title?: string;
}) => {
    const [draftTitle, setDraftTitle] = useState(title);

    useEffect(() => {
        setDraftTitle(title);
    }, [title]);

    const commitTitle = () => {
        const nextTitle = draftTitle.trim();

        if (!nextTitle) {
            setDraftTitle(title);
            return;
        }

        if (nextTitle === title) return;

        onTitleChange?.(nextTitle);
    };

    const handleSubmit = (event: FormEvent<HTMLFormElement>) => {
        event.preventDefault();
        commitTitle();
    };

    const handleTitleKeyDown = (event: KeyboardEvent<HTMLInputElement>) => {
        if (event.key === 'Escape') {
            setDraftTitle(title);
            event.currentTarget.blur();
        }
    };

    return (
        <header className="relative flex h-20 items-start justify-between border-b border-[#2A2F38] bg-[#111318] px-5 [app-region:drag] [-webkit-app-region:drag]">
            <WindowDragRegion className="left-0 z-0" />
            <div className="relative z-10 flex w-[230px] items-center gap-3 pt-[30px]">
                <EditorHomeLink
                    href={editorHeader.homeHref}
                    label={editorHeader.homeLabel}
                />
                <div className="grid gap-0.5">
                    <div className="text-[15px] font-bold">
                        {editorHeader.productName}
                    </div>
                    <div className="font-['Geist'] text-[11px] text-[#6F7784]">
                        {editorHeader.productDescription}
                    </div>
                </div>
            </div>

            <div className="relative z-10 h-10 w-[440px] pt-[18px] text-center">
                <form
                    className="mx-auto grid w-full justify-items-center"
                    onSubmit={handleSubmit}
                >
                    <input
                        aria-label="项目标题"
                        className="w-full rounded-md border border-transparent bg-transparent px-2 py-0.5 text-center text-xl font-[750] leading-5 text-[#F5F7FA] outline-none transition-colors duration-200 hover:border-[#2A2F38] focus:border-[#6B5B80] focus:bg-[#171A20] [app-region:no-drag] [-webkit-app-region:no-drag]"
                        value={draftTitle}
                        onBlur={commitTitle}
                        onChange={(event) => setDraftTitle(event.target.value)}
                        onKeyDown={handleTitleKeyDown}
                    />
                </form>
                <p className="mt-1 font-['Geist'] text-[11px] text-[#6F7784]">
                    {status}
                </p>
            </div>

            <div className="relative z-10 flex w-28 justify-end pt-[30px]">
                <button
                    type="button"
                    disabled={primaryActionDisabled}
                    onClick={onPrimaryAction}
                    className="flex h-9 items-center gap-2 rounded-lg bg-[#F05F73] px-4 text-[13px] font-[750] text-white shadow-[0_10px_22px_rgba(240,95,115,0.22)] disabled:cursor-not-allowed disabled:opacity-60 [app-region:no-drag] [-webkit-app-region:no-drag]"
                >
                    <Icon name="download" />
                    {primaryActionLabel}
                </button>
            </div>
        </header>
    );
};
