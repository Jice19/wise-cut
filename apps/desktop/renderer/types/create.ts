
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
    sourceAssetDirectory: string;
};
