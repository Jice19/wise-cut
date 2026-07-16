
import { videoAgentVoiceOptions } from '../../shared/video-agent-voices';
import type { CreatePageContent } from '../types/create';
import type { WorkspaceNavItem } from '../types/workspace';

import { workspaceBrand } from './workspace';

export { workspaceBrand as createBrand };

export const createNavItems = [
    {
        label: '首页',
        icon: 'house',
        tone: 'default'
    },
    {
        label: '创作',
        icon: 'scissors',
        href: '/',
        tone: 'active'
    },
    {
        label: '项目',
        icon: 'folder',
        href: '/workspace',
        tone: 'default'
    }
] satisfies WorkspaceNavItem[];

export const createPageContent = {
    titlePrefix: '让文字',
    titleAccent: '赴一场光影之约',
    titleAccentColors: ['#E9FFD0', '#FF92E9', '#7E62FF'],
    subtitle: '顷刻成帧，每一种表达都自有回响',
    modes: [
        {
            label: '输入文稿',
            tone: 'active',
            widthClassName: 'w-[132px]'
        },
        {
            label: '上传口播音频',
            tone: 'default',
            widthClassName: 'w-[134px]'
        }
    ],
    placeholder: '输入/粘贴视频文稿，为你生成精彩视频',
    maxLength: 10000,
    voiceLabelPrefix: '配音',
    voiceOptions: [...videoAgentVoiceOptions],
    actionLabel: '创建'
} satisfies CreatePageContent;
