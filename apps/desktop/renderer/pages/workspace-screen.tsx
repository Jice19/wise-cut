/**
 * WorkspaceScreen —— Pencil `fDidh` 工作台 outer shell 的 React 还原。
 *
 * initialView：
 * - 'projects'：项目列表（默认）
 * - 'create'：智能体创作入口 / Wizard
 *
 * 数据源 mock 占位 + 子组件已抽出。后续接入 workspace-store。
 */

import { WorkspaceCreateView } from '@/components/workspace/workspace-create-view';
import { WorkspaceProjectsView } from '@/components/workspace/workspace-projects-view';

export type WorkspaceView = 'projects' | 'create';

export interface WorkspaceScreenProps {
    initialView?: WorkspaceView;
}

export const WorkspaceScreen = ({
    initialView = 'projects'
}: WorkspaceScreenProps): JSX.Element => {
    return initialView === 'create' ? (
        <WorkspaceCreateView />
    ) : (
        <WorkspaceProjectsView />
    );
};
