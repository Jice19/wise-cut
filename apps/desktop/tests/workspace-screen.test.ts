/* */
import { existsSync, readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { createElement, isValidElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it, vi } from 'vitest';

import { sampleVideoProject } from '@wise-cut/video-project';

import { ProjectDeleteConfirmDialog } from '../renderer/components/workspace/ProjectDeleteConfirmDialog';
import { WorkspaceProjectCard } from '../renderer/components/workspace/WorkspaceProjectCard';
import { MiaojianWorkspaceScreen } from '../renderer/pages/MiaojianWorkspaceScreen';
import { appRoutes } from '../renderer/router';

describe('MiaojianWorkspaceScreen', () => {
    it('registers /workspace as the projects tab of the shared workspace page', () => {
        expect(appRoutes.some((route) => route.path === '/workspace')).toBe(
            true
        );
        expect(
            appRoutes.some((route) => route.path === '/editor/:projectId')
        ).toBe(true);

        const rootRoute = appRoutes.find((route) => route.path === '/');
        const workspaceRoute = appRoutes.find(
            (route) => route.path === '/workspace'
        );

        expect(isValidElement(rootRoute?.element)).toBe(true);
        expect(isValidElement(workspaceRoute?.element)).toBe(true);
        expect(
            isValidElement(rootRoute?.element) &&
                isValidElement(workspaceRoute?.element) &&
                rootRoute.element.type === workspaceRoute.element.type
        ).toBe(true);
    });

    it('uses client-side navigation for project cards to avoid page reload flashes', () => {
        const project = {
            id: 'project_real_001',
            title: '真实生成的视频项目',
            createdAt: '创建时间 2026-06-23',
            coverImageUrl: '/covers/project-real.jpg',
            href: '/editor/project_real_001'
        };
        const html = renderToStaticMarkup(
            createElement(MiaojianWorkspaceScreen, {
                initialProjects: [project]
            })
        );

        expect(html).toContain('href="/editor/project_real_001"');
        expect(html).toContain('data-client-route="true"');
    });

    it('renders the workspace page from the Pencil frame', () => {
        const html = renderToStaticMarkup(
            createElement(MiaojianWorkspaceScreen)
        );

        expect(html).toContain('智剪 Magicut');
        expect(html).toContain('智能视频剪辑工具');
        expect(html).toContain('所有项目');
        expect(html).toContain('data-window-drag-region="true"');
        expect(html).toContain('h-10');
        expect(html).toContain('[app-region:drag]');
        expect(html).toContain('创建、查看和继续编辑你的智能视频项目');
        expect(html).toContain('创建新作品');
        expect(html).not.toContain('前端AI进阶路线：3个月从调接口到架构师');
        expect(html).not.toContain('618直播高光混剪：从长视频自动提炼爆点');
    });

    it('keeps workspace feature files under renderer workspace folders', () => {
        expect(
            existsSync(
                resolve(
                    __dirname,
                    '../renderer/pages/MiaojianWorkspaceScreen.tsx'
                )
            )
        ).toBe(true);
        expect(
            existsSync(resolve(__dirname, '../renderer/components/workspace'))
        ).toBe(true);
    });

    it('uses the create card as an in-page tab switch instead of a route jump', () => {
        const html = renderToStaticMarkup(
            createElement(MiaojianWorkspaceScreen)
        );

        expect(html).toContain('type="button"');
        expect(html).toContain('创建新作品');
    });

    it('restores the floating capsule navigation frame from Pencil', () => {
        const html = renderToStaticMarkup(
            createElement(MiaojianWorkspaceScreen)
        );
        const brandLogoPath = resolve(
            __dirname,
            '..//renderer/assets/brand/coding.png'
        );

        expect(existsSync(brandLogoPath)).toBe(true);
        expect(html).toContain('w-[260px]');
        expect(html).toContain('bg-[#080911]/70');
        expect(html).toContain('backdrop-blur-[28px]');
        expect(html).toContain('left-[20px]');
        expect(html).toContain('top-[30px]');
        expect(html).toContain('h-12');
        expect(html).toContain('w-12');
        expect(html).toContain('favicon@152.png');
        expect(html).toContain('alt="智剪 Magicut"');
        expect(html).toContain('text-[24px]');
        expect(html).toContain('top-[318px]');
        expect(html).toContain('h-[444px]');
        expect(html).toContain('w-[220px]');
        expect(html).toContain('left-[33px]');
        expect(html).toContain('top-[542px]');
        expect(html).toContain('ml-[26px]');
        expect(html).toContain('top-[342px]');
        expect(html).toContain('h-[428px]');
        expect(html).toContain('w-[120px]');
        expect(html).toContain('rounded-[60px]');
        expect(html).toContain('gap-[18px]');
        expect(html).toContain('px-[10px]');
        expect(html).toContain('py-[49px]');
        expect(html).toContain('h-[92px]');
        expect(html).toContain('opacity-[0.78]');
        expect(html).toContain('left-[28px]');
        expect(html).toContain('top-[14px]');
        expect(html).toContain('top-[65px]');
        expect(html).toContain('h-[108px]');
        expect(html).toContain('top-[8px]');
        expect(html).toContain('left-[13px]');
        expect(html).toContain('h-[60px]');
        expect(html).toContain('w-[72px]');
        expect(html).toContain('left-[26px]');
        expect(html).toContain('top-[18px]');
        expect(html).toContain('top-[75px]');
        expect(html).toContain('bg-[#FFFFFF24]');
        expect(html).toContain(
            'shadow-[0_10px_28px_rgba(191,64,255,0.4),0_0_16px_rgba(255,77,166,0.3)]'
        );
    });

    it('uses a glassmorphism app background behind the workspace content', () => {
        const html = renderToStaticMarkup(
            createElement(MiaojianWorkspaceScreen)
        );

        expect(html).toContain(
            'bg-[radial-gradient(circle_at_0%_0%,#582CFF30_0%,transparent_34%),radial-gradient(circle_at_86%_8%,#00F2FF14_0%,transparent_32%),linear-gradient(180deg,#10121B_0%,#080911_48%,#05060A_100%)]'
        );
        expect(html).toContain('backdrop-blur-[12px]');
        expect(html).toContain('bg-[#111318]/24');
        expect(html).toContain('bg-[#202123]/72');
        expect(html).toContain(
            'supports-[backdrop-filter]:backdrop-blur-[18px]'
        );
    });

    it('uses a visible React Bits DotField layer and adjusted content spacing', () => {
        const html = renderToStaticMarkup(
            createElement(MiaojianWorkspaceScreen)
        );

        expect(html).toContain('workspace-dot-field-layer');
        expect(html).toContain('dot-field-container');
        expect(html).toContain(
            'style="width:100%;height:100%;position:relative"'
        );
        expect(html).toContain('r="160"');
        expect(html).toContain('stop-color="#120F17"');
        expect(html).toContain('pt-[180px]');
        expect(html).toContain('px-[86px]');
    });

    it('keeps create and project content mounted to avoid background reinitialization flashes', () => {
        const html = renderToStaticMarkup(
            createElement(MiaojianWorkspaceScreen, { initialView: 'create' })
        );

        expect(html).toContain('workspace-view-stack');
        expect(html).toContain('data-workspace-view="create"');
        expect(html).toContain('data-workspace-view="projects"');
        expect(html).toContain('opacity-100');
        expect(html).toContain('opacity-0');
        expect(html).toContain('create-main-soft-aurora-layer');
        expect(html).toContain('workspace-dot-field-layer');
    });

    it('adds a left-right Aurora motion layer only to the workspace sidebar', () => {
        const html = renderToStaticMarkup(
            createElement(MiaojianWorkspaceScreen)
        );
        const auroraPath = resolve(
            __dirname,
            '../renderer/components/reactbits/Aurora/Aurora.tsx'
        );

        expect(existsSync(auroraPath)).toBe(true);
        expect(html).toContain('workspace-sidebar-aurora-fallback');
        expect(html).toContain('workspace-sidebar-aurora-layer');
        expect(html).toContain('workspace-sidebar-aurora-horizontal');
        expect(html).not.toContain('workspace-aurora-layer');
        expect(html.indexOf('workspace-sidebar-aurora-layer')).toBeLessThan(
            html.indexOf('relative min-w-0 overflow-y-auto')
        );

        const auroraSource = readFileSync(auroraPath, 'utf8');
        expect(auroraSource).toContain('COLOR_RAMP(colors, uv.y, rampColor)');
        expect(auroraSource).toContain('height = ((1.0 - uv.x) * 2.0');
        expect(auroraSource).toContain("gl.canvas.style.opacity = '0'");
        expect(auroraSource).toContain("gl.canvas.style.opacity = '1'");
        expect(auroraSource).toContain(
            'const renderFrame = (timestamp: number)'
        );
        expect(auroraSource).toContain('renderFrame(0)');
    });

    it('keeps project cards in a four-column row', () => {
        const html = renderToStaticMarkup(
            createElement(MiaojianWorkspaceScreen)
        );

        expect(html).toContain('grid-cols-4');
        expect(html).not.toContain('repeat(auto-fit');
    });

    it('renders project image cards with the spotlight interaction layer', () => {
        const project = {
            id: 'project_real_001',
            title: '真实生成的视频项目',
            createdAt: '创建时间 2026-06-23',
            coverImageUrl: '/covers/project-real.jpg',
            href: '/editor/project_real_001'
        };
        const html = renderToStaticMarkup(
            createElement(MiaojianWorkspaceScreen, {
                initialProjects: [project]
            })
        );

        expect(
            existsSync(
                resolve(
                    __dirname,
                    '../renderer/components/workspace/SpotlightCard.tsx'
                )
            )
        ).toBe(true);
        expect(html).toContain('spotlight-card');
        expect(html).toContain('spotlight-card-glow');
        expect(html).toContain('radial-gradient(circle at 0px 0px');
        expect(html).toContain(
            'spotlight-card relative overflow-hidden h-[250px] rounded-[18px] bg-[#202123] p-0'
        );
        expect(html).toContain(
            'group relative z-10 flex h-full flex-col overflow-hidden rounded-[18px]'
        );
        expect(html).toContain('relative h-[130px] w-full overflow-hidden');
        expect(html).toContain('h-full w-full object-cover');
        expect(html).toContain(
            'absolute bottom-0 left-0 h-[42px] w-full bg-[linear-gradient(180deg,#11121400_0%,#111214AA_100%)]'
        );
        expect(html).toContain(
            'absolute right-[18px] top-3 grid h-[26px] w-8 place-items-center rounded-full bg-[#00000055] text-white/80'
        );
        expect(html).toContain(
            'flex h-[120px] flex-col gap-[10px] px-5 py-[18px]'
        );
        expect(html).toContain(
            'h-[43px] line-clamp-2 overflow-hidden text-[17px] font-[900] leading-[1.25]'
        );
        expect(html).toContain('创建时间 2026-06-23');
        expect(html).toContain('真实生成的视频项目');
        expect(html).toContain('href="/editor/project_real_001"');
    });

    it('stops the project delete button click from bubbling to card navigation', () => {
        const onDeleteRequest = vi.fn();
        const project = {
            id: 'project_real_001',
            title: '真实生成的视频项目',
            createdAt: '创建时间 2026-06-23',
            coverImageUrl: '/covers/project-real.jpg',
            href: '/editor/project_real_001'
        };
        const card = WorkspaceProjectCard({
            onDeleteRequest,
            project
        });
        const findDeleteButton = (
            node: unknown
        ): { props: Record<string, unknown> } | undefined => {
            if (!node || typeof node !== 'object' || !('props' in node)) {
                return undefined;
            }

            const element = node as { props: Record<string, unknown> };

            if (element.props['aria-label'] === '删除项目') return element;

            const children = element.props.children;
            const childItems = Array.isArray(children) ? children : [children];

            for (const child of childItems) {
                const found = findDeleteButton(child);

                if (found) return found;
            }

            return undefined;
        };
        const deleteButton = findDeleteButton(card);
        const deleteButtonChildren = Array.isArray(deleteButton?.props.children)
            ? deleteButton.props.children
            : [deleteButton?.props.children];
        type ProjectMenuClickEvent = {
            preventDefault: () => void;
            stopPropagation: () => void;
        };
        const event = {
            preventDefault: vi.fn(),
            stopPropagation: vi.fn()
        };

        expect(deleteButton).toBeDefined();
        expect(
            deleteButtonChildren.some(
                (child) =>
                    typeof child === 'object' &&
                    child !== null &&
                    'props' in child &&
                    (child as { props: { name?: string } }).props.name ===
                        'trash-2'
            )
        ).toBe(true);

        (deleteButton?.props.onClick as (event: ProjectMenuClickEvent) => void)(
            event
        );

        expect(event.preventDefault).toHaveBeenCalledTimes(1);
        expect(event.stopPropagation).toHaveBeenCalledTimes(1);
        expect(onDeleteRequest).toHaveBeenCalledWith(project);
    });

    it('renders an accessible project delete confirmation dialog component', () => {
        const dialogSource = readFileSync(
            resolve(
                __dirname,
                '../renderer/components/workspace/ProjectDeleteConfirmDialog.tsx'
            ),
            'utf8'
        );
        const project = {
            id: 'project_real_001',
            title: '真实生成的视频项目',
            createdAt: '创建时间 2026-06-23',
            coverImageUrl: '/covers/project-real.jpg',
            href: '/editor/project_real_001'
        };
        const html = renderToStaticMarkup(
            createElement(ProjectDeleteConfirmDialog, {
                errorMessage: '删除失败，请稍后重试',
                onCancel: () => undefined,
                onConfirm: () => undefined,
                project
            })
        );

        expect(html).toContain('role="dialog"');
        expect(html).toContain('aria-modal="true"');
        expect(html).toContain('aria-labelledby="project-delete-title"');
        expect(html).toContain('aria-describedby="project-delete-description"');
        expect(html).toContain('确认删除项目');
        expect(html).toContain('真实生成的视频项目');
        expect(html).toContain('取消');
        expect(html).toContain('确认删除');
        expect(html).toContain('删除失败，请稍后重试');
        expect(dialogSource).toContain('previousActiveElementRef');
        expect(dialogSource).toContain('cancelButtonRef.current?.focus()');
        expect(dialogSource).toContain(
            'previousActiveElementRef.current?.focus()'
        );
    });

    it('maps real VideoProject files to workspace project cards', async () => {
        const { mapVideoProjectFileToWorkspaceProject } = await import(
            '../renderer/mappers/workspace-projects'
        );
        const project = structuredClone(sampleVideoProject);
        project.project.id = 'project_real_001';
        project.project.title = '真实生成的视频项目';
        project.project.createdAt = '2026-06-23T08:30:00.000Z';

        expect(
            mapVideoProjectFileToWorkspaceProject({
                filePath:
                    '/Users/heyi/Library/video-projects/project_real_001.miaojian.json',
                project
            })
        ).toMatchObject({
            createdAt: '创建时间 2026-06-23',
            href: '/editor/project_real_001',
            id: 'project_real_001',
            title: '真实生成的视频项目'
        });
    });

    it('loads real workspace project data and refreshes after agent completion', () => {
        const workspaceSource = readFileSync(
            resolve(__dirname, '../renderer/pages/MiaojianWorkspaceScreen.tsx'),
            'utf8'
        );

        expect(workspaceSource).toContain('loadWorkspaceProjects');
        expect(workspaceSource).toContain('window.appAPI.videoProject.list');
        expect(workspaceSource).toContain('setWorkspaceProjects');
        expect(workspaceSource).toContain("event.type === 'run.completed'");
        expect(workspaceSource).not.toContain('projects={workspaceProjects}');
    });

    it('uses the project delete dialog before deleting a real workspace project', () => {
        const workspaceSource = readFileSync(
            resolve(__dirname, '../renderer/pages/MiaojianWorkspaceScreen.tsx'),
            'utf8'
        );

        expect(workspaceSource).toContain('ProjectDeleteConfirmDialog');
        expect(workspaceSource).toContain('setProjectPendingDeletion(project)');
        expect(workspaceSource).toContain('handleProjectDeleteConfirm');
        expect(workspaceSource).not.toContain('window.confirm');
        expect(workspaceSource).toContain(
            'window.appAPI.videoProject.delete'
        );
        expect(workspaceSource).toContain('setWorkspaceProjects((projects) =>');
    });
});
