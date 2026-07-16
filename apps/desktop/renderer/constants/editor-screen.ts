
import type {
    AssistantTag,
    RailMode,
    StoryboardItem,
    TimelineClip,
    TimelineToolAction,
    TimelineTrack,
    TimelineTrackKind
} from '../types/editor-screen';

export const editorHeader = {
    ariaLabel: 'AI智能视频编辑器-画面',
    productName: 'AI Magicut',
    productDescription: '智能视频剪辑工具',
    homeHref: '/workspace',
    homeLabel: '返回首页',
    title: '口播短片自动剪辑工程',
    status: '2 分钟前更新 · 已自动保存',
    primaryAction: '渲染导出'
};

export const storyboardSummary = {
    title: '文稿字幕',
    meta: '9 段分镜 · 01:30 · 当前 00:08-00:20'
};

export const storyboardItems: StoryboardItem[] = [
    {
        title: '分镜 01',
        time: '00:00-00:10',
        body: '开场提出问题，\n把学习焦虑拉到观众面前。',
        tone: 'default'
    },
    {
        title: '分镜 02',
        time: '00:08-00:20',
        body: '解释为什么不能直接跳进 AI，\n先补齐前端工程基础。',
        tone: 'current'
    },
    {
        title: '分镜 03',
        time: '00:20-00:30',
        body: '展示第一个月路线，\n从组件、状态到接口联调。',
        tone: 'default'
    },
    {
        title: '分镜 04',
        time: '00:26-00:41',
        body: '切到第二个月路线，\n把模型能力接入真实业务。',
        tone: 'default'
    },
    {
        title: '分镜 05',
        time: '00:41-00:50',
        body: '拆解第三个月目标，\n强调工程化与可维护架构。',
        tone: 'default'
    },
    {
        title: '分镜 06',
        time: '00:50-01:00',
        body: '加入案例对比，\n让学习路径更具体。',
        tone: 'default'
    },
    {
        title: '分镜 07',
        time: '01:00-01:14',
        body: '展示项目产出，\n从 Demo 过渡到作品集。',
        tone: 'default'
    },
    {
        title: '分镜 08',
        time: '01:14-01:21',
        body: '补充常见误区，\n避免工具堆叠式学习。',
        tone: 'default'
    },
    {
        title: '分镜 09',
        time: '01:21-01:30',
        body: '收尾总结，\n引导观众保存路线图。',
        tone: 'default'
    }
];

export const previewPanel = {
    timecode: '00:00:00 / 00:01:30',
    imageAlt: '当前口播短片的视频预览画面'
};

export const assistantPanel = {
    timestamp: '6月10日 17:42',
    contextTitle: '0:00-0:25 开场问题',
    contextSummary:
        '大家好，很多前端同学现在都在焦虑一件事：\nAI到底应该怎么学。我先问一下大家，如果...',
    analysis:
        '我来分析你的文稿，这是一份关于“前端AI进阶学习路线”的教学内容，时间线清晰、结构完整。让我先加载制片技能来完成方案设计。\n\n我已经加载了制片技能。现在分析你的文稿：\n\n这是一份完整的技术教学口播稿，主题聚焦“前端AI进阶学习路线”，包含4个时间段的内容：\n\n•  开场问题引入（0:00-0:25）\n•  为什么不能直接学AI（0:25-0:55）\n•  三个月学习路线详解（0:55-2:45）\n•  收尾总结（2:45-3:05）',
    returnAction: '回到底部',
    quickEditTitle: '快捷调整',
    quickEditPlaceholder: '输入你的任何想法',
    linkedShot: '分镜 01'
};

export const assistantTags: AssistantTag[] = [
    { label: '视频画面', value: '智能匹配素材' },
    { label: '旁白配音', value: '温婉学姐' },
    { label: '创作倾向', value: 'AI智能创作（默认）' }
];

export const railModes: RailMode[] = [
    {
        label: '画面',
        icon: 'image',
        tone: 'current',
        mode: 'visual'
    },
    {
        label: '口播',
        icon: 'mic',
        tone: 'default',
        mode: 'voice'
    },
    {
        label: '字幕',
        icon: 'captions',
        tone: 'default',
        mode: 'subtitle'
    },
    {
        label: '音乐',
        icon: 'music',
        tone: 'default',
        mode: 'music'
    }
];

export const timelinePanel = {
    title: '时间线',
    timecode: '00:00:00 / 00:01:30'
};

export const timelineLayout = {
    sectionHeightClassName: 'h-[272px]',
    contentGridClassName: 'grid-cols-[200px_minmax(0,1fr)]',
    contentRowsClassName: 'grid-rows-[30px_50px_50px_50px_50px]',
    contentMinWidthClassName: 'min-w-[max(100%,1728px)] w-[1728px]',
    titleBarHeightClassName: 'h-[42px]',
    tickWidthClassName: 'w-[192px]'
};

export const timelineToolActions: TimelineToolAction[] = [
    { label: '吸附', icon: 'magnet', tone: 'active' },
    { label: '波纹', icon: 'audio-lines', tone: 'default' }
];

export const timelineTracks: TimelineTrack[] = [
    {
        id: 'video',
        icon: 'image',
        title: '视频',
        meta: '9 个分镜',
        tone: 'primary'
    },
    {
        id: 'voice',
        icon: 'mic',
        title: '配音',
        meta: '9 段旁白',
        tone: 'muted'
    },
    {
        id: 'subtitle',
        icon: 'captions',
        title: '字幕',
        meta: '18 段字幕',
        tone: 'primary'
    },
    {
        id: 'music',
        icon: 'music',
        title: '音乐',
        meta: 'Eutopia · 01:30',
        tone: 'primary'
    }
];

export const timelineTicks = [
    '00:00',
    '00:10',
    '00:20',
    '00:30',
    '00:40',
    '00:50',
    '01:00',
    '01:10',
    '01:20'
];

const timelineVideoClipColors = [
    'bg-[#1F6158] border-[#25D0B1]',
    'bg-[#294673] border-white/20',
    'bg-[#503984] border-white/20',
    'bg-[#74313E] border-white/20',
    'bg-[#3D3F45] border-white/20',
    'bg-[#315B49] border-white/20',
    'bg-[#4D5270] border-white/20',
    'bg-[#6A4A32] border-white/20',
    'bg-[#2E5166] border-white/20'
];

const timelineScenes = [
    { durationSeconds: 8, widthPx: 154 },
    { durationSeconds: 12, widthPx: 230 },
    { durationSeconds: 6, widthPx: 115 },
    { durationSeconds: 15, widthPx: 288 },
    { durationSeconds: 9, widthPx: 173 },
    { durationSeconds: 10, widthPx: 192 },
    { durationSeconds: 14, widthPx: 269 },
    { durationSeconds: 7, widthPx: 134 },
    { durationSeconds: 9, widthPx: 173 }
].map((scene, index) => ({
    ...scene,
    colorClassName: timelineVideoClipColors[index],
    number: String(index + 1).padStart(2, '0'),
    subtitleSegments: storyboardItems[index]?.body.split('\n') ?? []
}));

const splitWidthBySegment = ({
    segmentCount,
    segmentIndex,
    widthPx
}: {
    segmentCount: number;
    segmentIndex: number;
    widthPx: number;
}) => {
    const baseWidth = Math.floor(widthPx / segmentCount);
    const remainder = widthPx % segmentCount;
    return baseWidth + (segmentIndex < remainder ? 1 : 0);
};

export const timelineClipsByTrack: Record<TimelineTrackKind, TimelineClip[]> = {
    video: timelineScenes.map((scene) => ({
        kind: 'video',
        label: `分镜${scene.number}`,
        widthPx: scene.widthPx,
        durationSeconds: scene.durationSeconds,
        colorClassName: scene.colorClassName,
        showThumbnails: true
    })),
    voice: timelineScenes.map((scene) => ({
        kind: 'voice',
        label: `旁白${scene.number}`,
        widthPx: scene.widthPx,
        durationSeconds: scene.durationSeconds,
        colorClassName: 'bg-[#245A34] border-white/10',
        bars: 12
    })),
    subtitle: timelineScenes.flatMap((scene) =>
        scene.subtitleSegments.map((subtitle, segmentIndex) => ({
            kind: 'subtitle',
            label: `字幕${scene.number}-${String(segmentIndex + 1).padStart(2, '0')}`,
            widthPx: splitWidthBySegment({
                segmentCount: scene.subtitleSegments.length,
                segmentIndex,
                widthPx: scene.widthPx
            }),
            durationSeconds:
                scene.durationSeconds / scene.subtitleSegments.length,
            colorClassName: 'bg-[#6B471E] border-white/10',
            caption: subtitle
        }))
    ),
    music: [
        {
            kind: 'music',
            label: 'Eutopia · 全片背景音乐',
            widthPx: 1728,
            durationSeconds: 90,
            colorClassName: 'bg-[#263A66] border-[#5E7BFF]/50',
            bars: 32
        }
    ]
};
