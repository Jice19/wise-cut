
import type { VideoProject } from '@wise-cut/video-project';

import type { WorkspaceProject } from '../types/workspace';

export type WorkspaceProjectFile = {
    filePath: string;
    project: VideoProject;
};

const fallbackCoverImages = [
    new URL('../assets/workspace/project-ai-advanced.jpg', import.meta.url)
        .href,
    new URL('../assets/workspace/project-ai-learning.jpg', import.meta.url)
        .href,
    new URL('../assets/workspace/project-livestream.jpg', import.meta.url).href,
    new URL('../assets/workspace/project-saas-launch.jpg', import.meta.url)
        .href,
    new URL('../assets/workspace/project-ceo-interview.jpg', import.meta.url)
        .href,
    new URL('../assets/workspace/project-city-vlog.jpg', import.meta.url).href,
    new URL('../assets/workspace/project-game-trailer.jpg', import.meta.url)
        .href
];

const hashProjectId = (projectId: string) => {
    return [...projectId].reduce(
        (total, character) => total + character.charCodeAt(0),
        0
    );
};

const formatProjectCreatedAt = (createdAt: string) => {
    return `创建时间 ${createdAt.slice(0, 10)}`;
};

const getFallbackCoverImageUrl = (projectId: string) => {
    const index = hashProjectId(projectId) % fallbackCoverImages.length;

    return fallbackCoverImages[index]!;
};

export const mapVideoProjectFileToWorkspaceProject = ({
    project
}: WorkspaceProjectFile): WorkspaceProject => {
    return {
        coverImageUrl: getFallbackCoverImageUrl(project.project.id),
        createdAt: formatProjectCreatedAt(project.project.createdAt),
        href: `/editor/${project.project.id}`,
        id: project.project.id,
        title: project.project.title
    };
};

export const mapVideoProjectFilesToWorkspaceProjects = (
    projects: WorkspaceProjectFile[]
) => {
    return projects.map((project) =>
        mapVideoProjectFileToWorkspaceProject(project)
    );
};
