/* */
import { useCallback, useEffect, useState } from 'react';

import { defaultVideoAgentCanvas } from '../../shared/video-agent';
import { CreateMainContent } from '../components/create/CreateMainContent';
import DotField from '../components/reactbits/DotField/DotField';
import { WindowDragRegion } from '../components/WindowDragRegion';
import { ProjectDeleteConfirmDialog } from '../components/workspace/ProjectDeleteConfirmDialog';
import { WorkspaceHeader } from '../components/workspace/WorkspaceHeader';
import { WorkspaceProjectGrid } from '../components/workspace/WorkspaceProjectGrid';
import { WorkspaceSidebar } from '../components/workspace/WorkspaceSidebar';
import { createPageContent } from '../constants/create';
import {
    getWorkspaceNavItems,
    workspaceBrand,
    workspaceCreateCard,
    workspaceHeader
} from '../constants/workspace';
import { mapVideoProjectFilesToWorkspaceProjects } from '../mappers/workspace-projects';
import {
    ensureAgentRunEventSubscription,
    startAgentRun
} from '../stores/agent-run-store';
import type { CreateAgentSubmitInput } from '../types/create';
import type { WorkspaceProject, WorkspaceView } from '../types/workspace';
import { cx } from '../utils/classNames';
import { navigateToClientRoute } from '../utils/clientNavigation';

const WorkspaceProjectsContent = ({
    onCreate,
    onProjectDeleteRequest,
    projects
}: {
    onCreate: () => void;
    onProjectDeleteRequest?: (project: WorkspaceProject) => void;
    projects: WorkspaceProject[];
}) => {
    return (
        <section className="relative min-w-0 overflow-y-auto h-full bg-[#FAF9F7]">
            <div
                aria-hidden="true"
                className="workspace-dot-field-layer pointer-events-none absolute inset-0 z-[1] overflow-hidden opacity-60"
            >
                <div
                    style={{
                        width: '100%',
                        height: '100%',
                        position: 'relative'
                    }}
                >
                    <DotField
                        dotRadius={1.5}
                        dotSpacing={14}
                        cursorRadius={500}
                        cursorForce={0.1}
                        bulgeOnly
                        bulgeStrength={67}
                        glowRadius={160}
                        sparkle={false}
                        waveAmplitude={0}
                        gradientFrom="rgba(245, 158, 11, 0.24)"
                        gradientTo="rgba(217, 119, 6, 0.12)"
                        glowColor="#FAF9F7"
                    />
                </div>
            </div>
            <div className="relative z-10 flex min-h-full flex-col px-[86px] pb-10 pt-[180px]">
                <WorkspaceHeader content={workspaceHeader} />
                <div className="mt-[18px]">
                    <WorkspaceProjectGrid
                        createCard={workspaceCreateCard}
                        onCreate={onCreate}
                        onProjectDeleteRequest={onProjectDeleteRequest}
                        projects={projects}
                    />
                </div>
            </div>
        </section>
    );
};

export const MiaojianWorkspaceScreen = ({
    initialProjects = [],
    initialView = 'projects'
}: {
    initialProjects?: WorkspaceProject[];
    initialView?: WorkspaceView;
}) => {
    const [activeView, setActiveView] = useState<WorkspaceView>(initialView);
    const [isAgentStarting, setIsAgentStarting] = useState(false);
    const [isProjectDeleting, setIsProjectDeleting] = useState(false);
    const [projectDeleteErrorMessage, setProjectDeleteErrorMessage] =
        useState<string>();
    const [projectPendingDeletion, setProjectPendingDeletion] =
        useState<WorkspaceProject>();
    const [workspaceProjectCards, setWorkspaceProjects] =
        useState<WorkspaceProject[]>(initialProjects);

    const loadWorkspaceProjects = useCallback(async () => {
        if (typeof window === 'undefined' || !window.miaomaAPI?.videoProject) {
            return;
        }

        const result = await window.miaomaAPI.videoProject.list();

        if (result.success === false) return;

        setWorkspaceProjects(
            mapVideoProjectFilesToWorkspaceProjects(result.data)
        );
    }, []);

    useEffect(() => {
        setActiveView(initialView);
    }, [initialView]);

    useEffect(() => {
        void loadWorkspaceProjects();
    }, [loadWorkspaceProjects]);

    useEffect(() => {
        ensureAgentRunEventSubscription();
    }, []);

    useEffect(() => {
        if (typeof window === 'undefined') return undefined;

        return window.miaomaAPI?.videoAgent?.onEvent((event) => {
            if (event.type === 'run.completed') {
                void loadWorkspaceProjects();
            }
        });
    }, [loadWorkspaceProjects]);

    const workspaceNavItems = getWorkspaceNavItems(activeView);

    const handleAgentSubmit = async (input: CreateAgentSubmitInput) => {
        setActiveView('create');
        setIsAgentStarting(true);

        const result = await startAgentRun({
            ...input,
            canvas: defaultVideoAgentCanvas
        });

        setIsAgentStarting(false);

        if (result.success) {
            navigateToClientRoute(`/create/runs/${result.data.runId}`);
            return;
        }
    };

    const handleProjectDeleteRequest = (project: WorkspaceProject) => {
        setProjectDeleteErrorMessage(undefined);
        setProjectPendingDeletion(project);
    };

    const handleProjectDeleteCancel = () => {
        if (isProjectDeleting) return;

        setProjectDeleteErrorMessage(undefined);
        setProjectPendingDeletion(undefined);
    };

    const handleProjectDeleteConfirm = async () => {
        if (!projectPendingDeletion) return;

        if (typeof window === 'undefined' || !window.miaomaAPI?.videoProject) {
            setProjectDeleteErrorMessage('项目删除接口尚未就绪');
            return;
        }

        setIsProjectDeleting(true);
        const result = await window.miaomaAPI.videoProject.delete(
            projectPendingDeletion.id
        );

        if (result.success === false) {
            setProjectDeleteErrorMessage(result.error.message);
            setIsProjectDeleting(false);
            return;
        }

        setWorkspaceProjects((projects) =>
            projects.filter((item) => item.id !== projectPendingDeletion.id)
        );
        setProjectDeleteErrorMessage(undefined);
        setProjectPendingDeletion(undefined);
        setIsProjectDeleting(false);
    };

    const createViewClassName = cx(
        'absolute inset-0 min-w-0 transition-opacity duration-200',
        activeView === 'create'
            ? 'pointer-events-auto opacity-100'
            : 'pointer-events-none opacity-0'
    );
    const projectsViewClassName = cx(
        'absolute inset-0 min-w-0 transition-opacity duration-200',
        activeView === 'projects'
            ? 'pointer-events-auto opacity-100'
            : 'pointer-events-none opacity-0'
    );

    return (
        <main
            aria-label="智剪工作台"
            className="relative h-screen min-h-[720px] overflow-hidden bg-[#FAF9F7] text-[#1C1917]"
        >
            <WindowDragRegion className="left-[260px] z-20" />
            <div className="relative z-10 grid h-full min-w-[1280px] grid-cols-[260px_minmax(0,1fr)]">
                <WorkspaceSidebar
                    brand={workspaceBrand}
                    navItems={workspaceNavItems}
                    onNavItemSelect={setActiveView}
                />
                <section className="workspace-view-stack relative min-w-0 overflow-hidden">
                    <div
                        data-workspace-view="create"
                        className={createViewClassName}
                    >
                        <CreateMainContent
                            content={createPageContent}
                            isAgentBusy={isAgentStarting}
                            onAgentSubmit={(input) => {
                                void handleAgentSubmit(input);
                            }}
                        />
                    </div>
                    <div
                        data-workspace-view="projects"
                        className={projectsViewClassName}
                    >
                        <WorkspaceProjectsContent
                            onCreate={() => setActiveView('create')}
                            onProjectDeleteRequest={(project) => {
                                void handleProjectDeleteRequest(project);
                            }}
                            projects={workspaceProjectCards}
                        />
                    </div>
                </section>
            </div>
            <ProjectDeleteConfirmDialog
                errorMessage={projectDeleteErrorMessage}
                isDeleting={isProjectDeleting}
                onCancel={handleProjectDeleteCancel}
                onConfirm={() => {
                    void handleProjectDeleteConfirm();
                }}
                project={projectPendingDeletion}
            />
        </main>
    );
};
