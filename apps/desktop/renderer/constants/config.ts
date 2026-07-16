
import { videoAgentVoiceOptions } from '../../shared/video-agent-voices';
import songCatalog from '../assets/song/song.json';
import type {
    ConfigMode,
    MusicConfigData,
    MusicSettings,
    MusicTrack,
    SubtitleConfigData,
    SubtitleSettings,
    VisualConfigData,
    VoiceConfigData
} from '../types/config';

const voiceOptionByLabel = new Map<
    string,
    (typeof videoAgentVoiceOptions)[number]
>(videoAgentVoiceOptions.map((option) => [option.label, option]));

const voicePreviewAudioUrls = {
    cixingjieshuonan: new URL(
        '../assets/voice-previews/cixingjieshuonan.mp3',
        import.meta.url
    ).href,
    gaolengchenwen: new URL(
        '../assets/voice-previews/gaolengchenwen.mp3',
        import.meta.url
    ).href,
    huolixiaoge: new URL(
        '../assets/voice-previews/huolixiaoge.mp3',
        import.meta.url
    ).href,
    wenroushunv: new URL(
        '../assets/voice-previews/wenroushunv.mp3',
        import.meta.url
    ).href
} as const;

const voicePreviewAudioUrlByFileName = new Map([
    ['cixingjieshuonan.mp3', voicePreviewAudioUrls.cixingjieshuonan],
    ['gaolengchenwen.mp3', voicePreviewAudioUrls.gaolengchenwen],
    ['huolixiaoge.mp3', voicePreviewAudioUrls.huolixiaoge],
    ['wenroushunv.mp3', voicePreviewAudioUrls.wenroushunv]
]);

const songAudioUrlsByFileName = new Map([
    [
        'Dance for Me Wallis.m4a',
        new URL('../assets/song/Dance for Me Wallis.m4a', import.meta.url).href
    ],
    [
        'Eutopia.m4a',
        new URL('../assets/song/Eutopia.m4a', import.meta.url).href
    ],
    [
        'Paris 悬疑电影解说.m4a',
        new URL('../assets/song/Paris 悬疑电影解说.m4a', import.meta.url).href
    ],
    [
        'Send My Love.m4a',
        new URL('../assets/song/Send My Love.m4a', import.meta.url).href
    ],
    [
        'eternity.m4a',
        new URL('../assets/song/eternity.m4a', import.meta.url).href
    ],
    [
        'みかん箱-ひやむぎ、そーめ....m4a',
        new URL(
            '../assets/song/みかん箱-ひやむぎ、そーめ....m4a',
            import.meta.url
        ).href
    ],
    [
        '久石让 - 太阳照常升起(the s....m4a',
        new URL(
            '../assets/song/久石让 - 太阳照常升起(the s....m4a',
            import.meta.url
        ).href
    ],
    [
        '月亮之上(交响乐版).m4a',
        new URL('../assets/song/月亮之上(交响乐版).m4a', import.meta.url).href
    ],
    ['青空.m4a', new URL('../assets/song/青空.m4a', import.meta.url).href],
    ['面会菜.m4a', new URL('../assets/song/面会菜.m4a', import.meta.url).href]
]);

const musicCoverImageUrls = [
    new URL('../assets/music/eutopia.png', import.meta.url).href,
    new URL('../assets/music/canon.png', import.meta.url).href,
    new URL('../assets/music/plain-day.png', import.meta.url).href,
    new URL('../assets/music/ylang-ylang.png', import.meta.url).href,
    new URL('../assets/music/warm-healing.png', import.meta.url).href,
    new URL('../assets/music/my-treasure.png', import.meta.url).href
] as const;

const parseDurationMs = (duration: string) => {
    const [minutes = '0', seconds = '0'] = duration.split(':');

    return (Number(minutes) * 60 + Number(seconds)) * 1000;
};

const formatSongId = (order: number) =>
    `song_${String(order).padStart(2, '0')}`;

const createMusicTrack = (
    item: (typeof songCatalog.items)[number],
    index: number
): MusicTrack => ({
    active: index === 0,
    coverImageUrl:
        musicCoverImageUrls[index % musicCoverImageUrls.length] ??
        musicCoverImageUrls[0],
    durationLabel: item.duration,
    durationMs: parseDurationMs(item.duration),
    id: formatSongId(item.order),
    meta: item.description.replaceAll('｜', ' | '),
    mood: item.mood,
    scenes: item.scenes,
    sourceUrl: songAudioUrlsByFileName.get(item.fileName) ?? '',
    tempo: item.tempo,
    title: item.title
});

const createVoicePreset = ({
    description,
    selected,
    title
}: {
    description: string;
    selected: boolean;
    title: string;
}) => {
    const option = voiceOptionByLabel.get(title);

    return {
        actionIcon: 'play',
        description,
        previewAudioUrl: option
            ? voicePreviewAudioUrlByFileName.get(option.previewAudioFileName)
            : undefined,
        selected,
        title,
        voiceType: option?.voiceType
    } as const;
};

export const editorConfigMode: ConfigMode = 'visual';

export const musicLibraryTracks = songCatalog.items.map(createMusicTrack);

export const defaultMusicSettings = {
    enabled: true,
    selectedTrackId: musicLibraryTracks[0]?.id ?? 'song_01',
    volume: 0.6
} satisfies MusicSettings;

export const visualConfigPanel = {
    timestamp: '6月10日 17:42',
    contextTitle: '0:00-0:25 开场问题',
    contextSummary:
        '大家好，很多前端同学现在都在焦虑一件事：\nAI到底应该怎么学。我先问一下大家，如果...',
    tags: [
        { label: '视频画面', value: '智能匹配素材' },
        { label: '旁白配音', value: '温婉学姐' },
        { label: '创作倾向', value: 'AI智能创作（默认）' }
    ],
    analysis:
        '我来分析你的文稿，这是一份关于“前端AI进阶学习路线”的教学内容，时间线清晰、结构完整。让我先加载制片技能来完成方案设计。\n\n我已经加载了制片技能。现在分析你的文稿：\n\n这是一份完整的技术教学口播稿，主题聚焦“前端AI进阶学习路线”，包含4个时间段的内容：\n\n•  开场问题引入（0:00-0:25）\n•  为什么不能直接学AI（0:25-0:55）\n•  三个月学习路线详解（0:55-2:45）\n•  收尾总结（2:45-3:05）',
    returnAction: '回到底部',
    quickAdjust: {
        title: '快捷调整',
        placeholder: '输入你的任何想法',
        linkedShot: '分镜 01'
    }
} satisfies VisualConfigData;

export const voiceConfigPanel = {
    header: {
        title: '口播配音',
        subtitle: '为当前分镜生成旁白音轨'
    },
    section: {
        title: '选择音色',
        subtitle: '系统音色与自定义音色库 · 支持试听'
    },
    presets: [
        createVoicePreset({
            title: '温婉学姐',
            description: '自然女声 · 推荐',
            selected: true
        }),
        createVoicePreset({
            title: '沉稳男声',
            description: '低频清晰',
            selected: false
        }),
        createVoicePreset({
            title: '新闻播报',
            description: '稳重正式',
            selected: false
        }),
        createVoicePreset({
            title: '活力讲解',
            description: '节奏明快',
            selected: false
        })
    ],
    uploadCard: {
        title: '自定义音色库',
        description: '上传 10 s 内音频，保存后可直接作为音色使用',
        buttonIcon: 'plus'
    },
    sliders: [
        {
            label: '音量',
            max: 100,
            min: 0,
            numericValue: 82,
            step: 1,
            value: '82%',
            icon: 'volume-2',
            trackWidthClassName: 'w-[250px]',
            progressWidthClassName: 'w-[186px]',
            thumbLeftClassName: 'left-[178px]'
        },
        {
            label: '语速',
            max: 2,
            min: 0.5,
            numericValue: 1.05,
            step: 0.01,
            value: '1.05x',
            icon: 'gauge',
            trackWidthClassName: 'w-[250px]',
            progressWidthClassName: 'w-[154px]',
            thumbLeftClassName: 'left-[146px]'
        }
    ],
    actionLabel: '生成口播音轨'
} satisfies VoiceConfigData;

export const defaultSubtitleSettings = {
    fontSizePx: 24,
    isVisible: true,
    outlineColor: '#000000',
    presetLabel: '白字黑边',
    textColor: '#F5F7FA'
} as const satisfies SubtitleSettings;

export const subtitleConfigPanel = {
    header: {
        title: '字幕设置',
        subtitle: '调整当前字幕轨显示样式'
    },
    visibility: {
        label: '显示字幕',
        enabled: true
    },
    size: {
        label: '字号',
        max: 72,
        min: 12,
        numericValue: 42,
        step: 1,
        value: '42 px',
        trackWidthClassName: 'w-[260px]',
        progressWidthClassName: 'w-[130px]',
        thumbLeftClassName: 'left-[122px]'
    },
    style: {
        title: '字幕样式',
        subtitle: '应用到当前字幕轨',
        presets: [
            {
                label: '白字黑边',
                active: true,
                backgroundColor: '#0D201B',
                borderColor: '#343841',
                outerTextColor: '#000000',
                innerTextColor: '#F5F7FA'
            },
            {
                label: '经典白字',
                active: false,
                backgroundColor: '#111214',
                borderColor: '#4A4C52',
                outerTextColor: '#35373C',
                innerTextColor: '#F5F7FA'
            },
            {
                label: '黄字黑边',
                active: false,
                backgroundColor: '#111214',
                borderColor: '#343841',
                outerTextColor: '#050505',
                innerTextColor: '#FFD400'
            },
            {
                label: '红字白边',
                active: false,
                backgroundColor: '#111214',
                borderColor: '#343841',
                outerTextColor: '#FFFFFF',
                innerTextColor: '#F05F73'
            },
            {
                label: '青灰字幕',
                active: false,
                backgroundColor: '#111214',
                borderColor: '#343841',
                outerTextColor: '#14181D',
                innerTextColor: '#9ADFE5'
            },
            {
                label: '粉色字幕',
                active: false,
                backgroundColor: '#111214',
                borderColor: '#343841',
                outerTextColor: '#FFFFFF',
                innerTextColor: '#FF6EA5'
            },
            {
                label: '蓝色字幕',
                active: false,
                backgroundColor: '#111214',
                borderColor: '#343841',
                outerTextColor: '#0A0E12',
                innerTextColor: '#24CFF2'
            }
        ],
        activePresetLabel: '白字黑边'
    }
} satisfies SubtitleConfigData;

export const musicConfigPanel = {
    header: {
        title: '音乐设置',
        subtitle: '控制背景音乐与推荐曲库',
        toggleLabel: '开启',
        toggleEnabled: true
    },
    current: {
        sectionTitle: '当前音乐',
        trackTitle: 'Eutopia',
        artistLine: 'Mika Chen · 平静 / 社会题材',
        metaLine: '偏慢 · 02:01 · 已对齐时间线',
        coverImageUrl: musicLibraryTracks[0]?.coverImageUrl ?? ''
    },
    volume: {
        label: '音量',
        value: '60%',
        icon: 'volume-2',
        trackWidthClassName: 'w-[260px]',
        progressWidthClassName: 'w-[156px]',
        thumbLeftClassName: 'left-[148px]'
    },
    recommendations: {
        title: '推荐音乐',
        categories: [
            { label: '全部', active: true },
            ...Array.from(
                new Set(musicLibraryTracks.map((track) => track.mood))
            ).map((label) => ({ label, active: false })),
            { label: '更多', active: false }
        ],
        tracks: musicLibraryTracks
    }
} satisfies MusicConfigData;
