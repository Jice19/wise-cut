
import type { RouteObject } from 'react-router-dom';
import { createBrowserRouter } from 'react-router-dom';

import { MiaojianCreateRunRoute } from '../pages/MiaojianCreateRunScreen';
import { MiaojianEditorRoute } from '../pages/MiaojianEditorRoute';
import { MiaojianWorkspaceScreen } from '../pages/MiaojianWorkspaceScreen';

export const appRoutes: RouteObject[] = [
    {
        path: '/',
        element: <MiaojianWorkspaceScreen initialView="create" />
    },
    {
        path: '/editor',
        element: <MiaojianEditorRoute />
    },
    {
        path: '/editor/:projectId',
        element: <MiaojianEditorRoute />
    },
    {
        path: '/create/runs/:runId',
        element: <MiaojianCreateRunRoute />
    },
    {
        path: '/workspace',
        element: <MiaojianWorkspaceScreen initialView="projects" />
    }
];

export const createAppRouter = () => createBrowserRouter(appRoutes);
