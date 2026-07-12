import { createBrowserRouter, Navigate } from 'react-router-dom';

import { AgentRunScreen } from '@/pages/agent-run-screen';
import { CreationScreen } from '@/pages/creation-screen';
import { EditorScreen } from '@/pages/editor-screen';
import { WorkspaceScreen } from '@/pages/workspace-screen';

/**
 * 路由对应 Pencil 中的 4 个 Screen + 一条 redirect 默认入口。
 *
 * /            → redirect to /workspace
 * /workspace   → 工作台 Screen        (Pencil fDidh)
 * /create      → 创作 Screen          (Pencil TiF37)
 * /agent       → 智能体运行 Screen    (Pencil VlGoO)
 * /editor      → 编辑器 Screen        (Pencil Bx8VF)
 * /export      → 占位，落到 Workspace（未做单独 Screen，先共享）
 */
export const router = createBrowserRouter([
    {
        path: '/',
        element: <Navigate to="/workspace" replace />
    },
    {
        path: '/workspace',
        element: <WorkspaceScreen />
    },
    {
        path: '/create',
        element: <CreationScreen />
    },
    {
        path: '/agent',
        element: <AgentRunScreen />
    },
    {
        path: '/editor',
        element: <EditorScreen />
    },
    {
        path: '/export',
        element: <WorkspaceScreen />
    }
]);
