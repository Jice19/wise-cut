
import type {
    WorkspaceBrand,
    WorkspaceCreateCard,
    WorkspaceHeaderContent,
    WorkspaceNavItem,
    WorkspaceProject,
    WorkspaceView
} from '../types/workspace';

export const workspaceBrand = {
    name: 'AI Magicut',
    description: '智能视频剪辑工具'
} satisfies WorkspaceBrand;

export const workspaceHeader = {
    title: '所有项目',
    subtitle: '创建、查看和继续编辑你的智能视频项目'
} satisfies WorkspaceHeaderContent;

export const getWorkspaceNavItems = (
    activeView: WorkspaceView
): WorkspaceNavItem[] => [
    {
        label: '首页',
        icon: 'house',
        tone: 'default'
    },
    {
        label: '创作',
        icon: 'scissors',
        view: 'create',
        tone: activeView === 'create' ? 'active' : 'default'
    },
    {
        label: '项目',
        icon: 'folder',
        view: 'projects',
        tone: activeView === 'projects' ? 'active' : 'default'
    }
];

export const workspaceCreateCard = {
    title: '创建新作品',
    view: 'create'
} satisfies WorkspaceCreateCard;

export const workspaceProjects = [
    {
        id: '101',
        title: '前端AI进阶路线：3个月从调接口到架构师',
        createdAt: '创建时间 2026-06-10',
        coverImageUrl: new URL(
            '../assets/workspace/project-ai-advanced.jpg',
            import.meta.url
        ).href,
        href: '/editor/101'
    },
    {
        id: '102',
        title: '前端AI学习路线：从调接口到50K架构师的3个月进阶攻略',
        createdAt: '创建时间 2026-06-10',
        coverImageUrl: new URL(
            '../assets/workspace/project-ai-learning.jpg',
            import.meta.url
        ).href,
        href: '/editor/102'
    },
    {
        id: '103',
        title: '618直播高光混剪：从长视频自动提炼爆点',
        createdAt: '创建时间 2026-06-11',
        coverImageUrl: new URL(
            '../assets/workspace/project-livestream.jpg',
            import.meta.url
        ).href,
        href: '/editor/103'
    },
    {
        id: '104',
        title: 'SaaS新功能发布短片：一分钟讲清核心卖点',
        createdAt: '创建时间 2026-06-12',
        coverImageUrl: new URL(
            '../assets/workspace/project-saas-launch.jpg',
            import.meta.url
        ).href,
        href: '/editor/104'
    },
    {
        id: '105',
        title: 'CEO访谈精剪版：品牌故事与团队幕后',
        createdAt: '创建时间 2026-06-09',
        coverImageUrl: new URL(
            '../assets/workspace/project-ceo-interview.jpg',
            import.meta.url
        ).href,
        href: '/editor/105'
    },
    {
        id: '106',
        title: '周末城市咖啡探店：生活方式短片模板',
        createdAt: '创建时间 2026-06-08',
        coverImageUrl: new URL(
            '../assets/workspace/project-city-vlog.jpg',
            import.meta.url
        ).href,
        href: '/editor/106'
    },
    {
        id: '107',
        title: '独立游戏实机预告：节奏卡点与字幕包装',
        createdAt: '创建时间 2026-06-07',
        coverImageUrl: new URL(
            '../assets/workspace/project-game-trailer.jpg',
            import.meta.url
        ).href,
        href: '/editor/107'
    }
] satisfies WorkspaceProject[];
