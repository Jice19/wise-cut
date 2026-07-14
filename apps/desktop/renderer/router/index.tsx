import { createBrowserRouter, type RouteObject } from 'react-router-dom';
import { Navigate, useParams, useSearchParams } from 'react-router-dom';

import { AppShell } from '@/components/app-shell';
import { AgentRunScreen } from '@/pages/agent-run-screen';
import { CreationScreen } from '@/pages/creation-screen';
import { EditorScreen } from '@/pages/editor-screen';
import { ExportScreen } from '@/pages/export-screen';
import { WorkspaceScreen, type WorkspaceView } from '@/pages/workspace-screen';

/**
 * 路由结构：
 *  /                       → redirect to /workspace?view=projects
 *  /workspace?view=projects|create → 工作台（projects / create 双视图）
 *  /create                 → 创作
 *  /create/runs/:runId     → 智能体运行
 *  /editor                 → fallback 到最近项目 → /editor/p1
 *  /editor/:projectId      → 按 projectId 加载
 *  /export                 → 导出（占位）
 *
 *  注意：路由层不包 AppShell —— 各 Screen 自己包，避免嵌套两个 Tab bar。
 */

interface WorkspaceShellProps {
    initialView: WorkspaceView;
}

const WorkspaceShell = ({ initialView }: WorkspaceShellProps): JSX.Element => (
    <AppShell pageLabel="工作台">
        <WorkspaceScreen initialView={initialView} />
    </AppShell>
);

const RootRedirect = (): JSX.Element => (
    <Navigate to="/workspace?view=projects" replace />
);

const useWorkspaceView = (): WorkspaceView => {
    const [params] = useSearchParams();
    return params.get('view') === 'create' ? 'create' : 'projects';
};

const WorkspaceShellWithQuery = (): JSX.Element => {
    const view = useWorkspaceView();
    return <WorkspaceShell initialView={view} />;
};

/**
 * `/editor` 和 `/editor/:projectId` 都通过它路由：
 *  - 缺 projectId 时 fallback 到 `/editor/p1`
 *  - 存在时直接渲染 EditorScreen，并在 *EditorScreen 内部* 已经包了 AppShell
 *  - 这里不要再包 AppShell，否则 Sidebar / TopBar 出现两层
 */
const EditorRoute = (): JSX.Element => {
    const { projectId } = useParams<{ projectId: string }>();
    if (!projectId) {
        return <Navigate to="/editor/p1" replace />;
    }
    return <EditorScreen />;
};

export const routes: RouteObject[] = [
    {
        path: '/',
        element: <RootRedirect />
    },
    {
        path: '/workspace',
        element: <WorkspaceShellWithQuery />
    },
    {
        path: '/create',
        element: (
            <AppShell pageLabel="智能剪辑">
                <CreationScreen />
            </AppShell>
        )
    },
    {
        path: '/create/runs/:runId',
        // Screen 内部自己包 AppShell（与 editor 路由保持一致），
        // 路由层不要重复包，否则会出现两个 TopBar。
        element: <AgentRunScreen />
    },
    {
        path: '/editor',
        element: <EditorRoute />
    },
    {
        path: '/editor/:projectId',
        element: <EditorRoute />
    },
    {
        path: '/export',
        element: (
            <AppShell pageLabel="导出">
                <ExportScreen />
            </AppShell>
        )
    }
];

export const router = createBrowserRouter(routes);
