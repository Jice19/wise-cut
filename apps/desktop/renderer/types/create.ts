import type { VideoAgentVoiceOption } from '../../shared/video-agent-voices';

export type CreateModeTone = 'active' | 'default';

export type CreateModeOption = {
    label: string;
    tone: CreateModeTone;
    widthClassName: string;
};

export type CreateVoiceOption = VideoAgentVoiceOption;

export type CreatePageContent = {
    titlePrefix: string;
    titleAccent: string;
    titleAccentColors: string[];
    subtitle: string;
    modes: CreateModeOption[];
    placeholder: string;
    maxLength: number;
    voiceLabelPrefix: string;
    voiceOptions: CreateVoiceOption[];
    actionLabel: string;
};

export type CreateAgentSubmitInput = {
    prompt: string;
    selectedVoice: string;
    selectedVoiceType: string;
    /**
     * 直接选的视频文件路径（多选），优先于 sourceAssetDirectory。
     * 文件选择器或拖拽产生。
     */
    sourceFilePaths?: string[];
    /**
     * 视频素材目录路径。sourceFilePaths 未提供时使用。
     */
    sourceAssetDirectory?: string;
};
