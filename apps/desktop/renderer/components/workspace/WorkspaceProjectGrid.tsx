/* */
import type {
    WorkspaceCreateCard as WorkspaceCreateCardData,
    WorkspaceProject
} from '../../types/workspace';

import { WorkspaceCreateCard } from './WorkspaceCreateCard';
import { WorkspaceProjectCard } from './WorkspaceProjectCard';

export const WorkspaceProjectGrid = ({
    createCard,
    onCreate,
    onProjectDeleteRequest,
    projects
}: {
    createCard: WorkspaceCreateCardData;
    onCreate?: () => void;
    onProjectDeleteRequest?: (project: WorkspaceProject) => void;
    projects: WorkspaceProject[];
}) => {
    return (
        <ul className="grid grid-cols-4 gap-[18px]">
            <li>
                <WorkspaceCreateCard card={createCard} onCreate={onCreate} />
            </li>
            {projects.map((project) => (
                <li key={project.id}>
                    <WorkspaceProjectCard
                        project={project}
                        onDeleteRequest={onProjectDeleteRequest}
                    />
                </li>
            ))}
        </ul>
    );
};
