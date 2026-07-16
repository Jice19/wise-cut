
import type { EditorIconName } from './editor-screen';

export type WorkspaceBrand = {
    name: string;
    description: string;
};

export type WorkspaceHeaderContent = {
    title: string;
    subtitle: string;
};

export type WorkspaceView = 'create' | 'projects';

export type WorkspaceNavTone = 'default' | 'active';

export type WorkspaceNavItem = {
    label: string;
    icon: EditorIconName;
    href?: string;
    view?: WorkspaceView;
    tone: WorkspaceNavTone;
};

export type WorkspaceCreateCard = {
    title: string;
    view: WorkspaceView;
};

export type WorkspaceProject = {
    id: string;
    title: string;
    createdAt: string;
    coverImageUrl: string;
    href: string;
};
