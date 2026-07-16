
export type VideoAgentVoiceOption = {
    description: string;
    label: string;
    previewAudioFileName: string;
    voiceType: string;
};

export type VideoAgentVoiceSettings = {
    voiceSpeed: number;
    voiceVolume: number;
};

export const defaultVideoAgentVoiceSettings = {
    voiceSpeed: 1.05,
    voiceVolume: 0.82
} as const satisfies VideoAgentVoiceSettings;

const clamp = ({
    max,
    min,
    value
}: {
    max: number;
    min: number;
    value: number;
}) => Math.min(Math.max(value, min), max);

export const normalizeVideoAgentVoiceSettings = (
    settings?: Partial<VideoAgentVoiceSettings>
): VideoAgentVoiceSettings => ({
    voiceSpeed: clamp({
        max: 2,
        min: 0.5,
        value:
            typeof settings?.voiceSpeed === 'number'
                ? settings.voiceSpeed
                : defaultVideoAgentVoiceSettings.voiceSpeed
    }),
    voiceVolume: clamp({
        max: 1,
        min: 0,
        value:
            typeof settings?.voiceVolume === 'number'
                ? settings.voiceVolume
                : defaultVideoAgentVoiceSettings.voiceVolume
    })
});

export const videoAgentVoiceOptions = [
    {
        label: '温婉学姐',
        description: '柔和亲切 · 适合知识口播',
        previewAudioFileName: 'wenroushunv.mp3',
        voiceType: 'zh_female_wenroushunv_uranus_bigtts'
    },
    {
        label: '新闻播报',
        description: '清晰正式 · 适合资讯解说',
        previewAudioFileName: 'cixingjieshuonan.mp3',
        voiceType: 'zh_male_cixingjieshuonan_uranus_bigtts'
    },
    {
        label: '沉稳男声',
        description: '低沉可靠 · 适合商业叙事',
        previewAudioFileName: 'gaolengchenwen.mp3',
        voiceType: 'zh_male_gaolengchenwen_uranus_bigtts'
    },
    {
        label: '活力讲解',
        description: '明快有力 · 适合教程种草',
        previewAudioFileName: 'huolixiaoge.mp3',
        voiceType: 'zh_male_huolixiaoge_uranus_bigtts'
    }
] as const satisfies readonly VideoAgentVoiceOption[];

export const defaultVideoAgentVoice = videoAgentVoiceOptions[0];
