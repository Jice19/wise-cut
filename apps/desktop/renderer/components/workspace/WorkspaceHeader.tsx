/* */
import type { WorkspaceHeaderContent } from '../../types/workspace';

export const WorkspaceHeader = ({
    content
}: {
    content: WorkspaceHeaderContent;
}) => {
    return (
        <header className="grid gap-[5px]">
            <h2 className="text-[24px] font-bold leading-none text-[#1C1917]">
                {content.title}
            </h2>
            <p className="font-['Geist'] text-[12px] font-medium leading-none text-[#78716C]">
                {content.subtitle}
            </p>
        </header>
    );
};
