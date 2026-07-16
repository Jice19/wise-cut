/* */
import type { MouseEvent } from 'react';

import type { WorkspaceProject } from '../../types/workspace';
import { Icon } from '../Icon';

import { ClientRouteLink } from './ClientRouteLink';
import { SpotlightCard } from './SpotlightCard';

export const WorkspaceProjectCard = ({
    onDeleteRequest,
    project
}: {
    onDeleteRequest?: (project: WorkspaceProject) => void;
    project: WorkspaceProject;
}) => {
    const handleDeleteClick = (event: MouseEvent<HTMLButtonElement>) => {
        event.preventDefault();
        event.stopPropagation();
        onDeleteRequest?.(project);
    };

    return (
        <SpotlightCard
            className="h-[250px] rounded-[18px] bg-white p-0 ring-1 ring-[#E7E5E0] transition-all duration-200 hover:-translate-y-1 hover:ring-[#D97706] hover:shadow-[0_18px_36px_rgba(217,119,6,0.18)]"
            spotlightColor="rgba(217, 119, 6, 0.16)"
        >
            <ClientRouteLink
                href={project.href}
                className="group relative z-10 flex h-full flex-col overflow-hidden rounded-[18px]"
            >
                <div className="relative h-[130px] w-full overflow-hidden">
                    <img
                        src={project.coverImageUrl}
                        alt={project.title}
                        className="h-full w-full object-cover transition-transform duration-300 group-hover:scale-[1.03]"
                    />
                    <div className="pointer-events-none absolute bottom-0 left-0 h-[42px] w-full bg-[linear-gradient(180deg,#FFFFFF00_0%,#FFFFFFE6_100%)]" />
                    <span className="absolute right-[18px] top-3 grid h-[26px] w-8 place-items-center rounded-full bg-white/90 text-[#57534E] transition-colors duration-200 group-hover:bg-[#D97706] group-hover:text-white">
                        <Icon name="ellipsis" className="h-4 w-4" />
                    </span>
                </div>
                <article className="flex h-[120px] flex-col gap-[10px] px-5 py-[18px]">
                    <h3 className="h-[43px] line-clamp-2 overflow-hidden text-[17px] font-bold leading-[1.25] text-[#1C1917]">
                        {project.title}
                    </h3>
                    <div className="flex h-6 items-center justify-between gap-3">
                        <span className="truncate text-[12px] font-medium leading-none text-[#A8A29E]">
                            {project.createdAt}
                        </span>
                        <span className="h-6 w-[34px]" aria-hidden="true" />
                    </div>
                </article>
            </ClientRouteLink>
            <button
                type="button"
                aria-label="删除项目"
                onClick={handleDeleteClick}
                className="absolute bottom-[18px] right-5 z-20 grid h-6 w-[34px] place-items-center rounded-full text-[#A8A29E] transition-colors duration-200 hover:bg-[#FEE2E2] hover:text-[#DC2626] focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#D97706]"
            >
                <Icon name="trash-2" className="h-5 w-5" />
            </button>
        </SpotlightCard>
    );
};
