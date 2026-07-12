import { AppShell } from '@/components/app-shell';
import {
    SceneColumnHeader,
    SceneSearchBar
} from '@/components/video-editor/column-header';
import {
    ColumnLayout,
    MiddleColumn,
    RightColumn,
    SceneColumn
} from '@/components/video-editor/columns';
import {
    type AssetCardProps,
    type FilterChipProps,
    LibraryPanel,
    type TabChipProps
} from '@/components/video-editor/library-panel';
import {
    PreviewFrame,
    PreviewHeader
} from '@/components/video-editor/preview-frame';
import {
    type SceneCardProps,
    SceneList
} from '@/components/video-editor/scene-list';
import { TimelineArea } from '@/components/video-editor/timeline-area';
import { TransportBar } from '@/components/video-editor/transport-bar';

const SCENES: readonly SceneCardProps[] = [
    {
        id: '01',
        title: '开场 · 黑场渐入',
        thumbBg: 'linear-gradient(135deg, #1A1A1C 0%, #3D3D42 100%)',
        meta: (
            <>
                <span className="font-mono text-[10px]">02:13</span>
                <span>·</span>
                <span className="font-mono text-[10px]">已生成</span>
            </>
        )
    },
    {
        id: '02',
        title: '樱花大道 · 全景',
        thumbBg: 'linear-gradient(135deg, #FFB8C8 0%, #7DB4E0 100%)',
        meta: (
            <>
                <span className="font-mono text-[10px]">04:08</span>
                <span>·</span>
                <span className="font-mono text-[10px]">渲染中</span>
            </>
        )
    },
    {
        id: '03',
        title: '樱花特写 · 慢镜头',
        thumbBg: 'linear-gradient(135deg, #FFC1D8 0%, #FFE8B0 100%)',
        meta: (
            <>
                <span className="font-mono text-[10px]">00:06</span>
                <span>·</span>
                <span className="font-mono text-[10px]">● 播放中</span>
            </>
        ),
        active: true,
        playing: true
    },
    {
        id: '04',
        title: '花瓣飘落 · 转场',
        thumbBg: 'linear-gradient(135deg, #F08456 0%, #FFD27D 100%)',
        meta: (
            <>
                <span className="font-mono text-[10px]">02:04</span>
                <span>·</span>
                <span className="font-mono text-[10px]">已生成</span>
            </>
        )
    },
    {
        id: '05',
        title: '公园步道 · 中景',
        thumbBg: 'linear-gradient(135deg, #A8D8B9 0%, #7DB4E0 100%)',
        meta: (
            <>
                <span className="font-mono text-[10px]">01:36</span>
                <span>·</span>
                <span className="font-mono text-[10px]">已生成</span>
            </>
        )
    },
    {
        id: '06',
        title: '人物背影 · 慢移',
        thumbBg: 'linear-gradient(135deg, #5B6FFF 0%, #00E7FF 100%)',
        meta: (
            <>
                <span className="font-mono text-[10px]">03:11</span>
                <span>·</span>
                <span className="font-mono text-[10px]">已生成</span>
            </>
        )
    }
];

const ASSETS: readonly AssetCardProps[] = [
    {
        name: '樱花飘落',
        thumbBg: 'linear-gradient(135deg, #FFB1D1 0%, #FFD49B 100%)',
        selected: true
    },
    {
        name: '光斑闪烁',
        thumbBg: 'linear-gradient(135deg, #FFE89B 0%, #FFB1E0 100%)'
    },
    {
        name: '粒子光效',
        thumbBg: 'linear-gradient(135deg, #7B5CFF 0%, #00E7FF 100%)'
    },
    {
        name: '镜头光晕',
        thumbBg: 'linear-gradient(135deg, #FFB89B 0%, #FFD49B 100%)'
    },
    {
        name: '景深模糊',
        thumbBg: 'linear-gradient(135deg, #9BCBFF 0%, #9BFFD9 100%)'
    },
    {
        name: '慢动作回放',
        thumbBg: 'linear-gradient(135deg, #FF9B9B 0%, #FFD49B 100%)'
    },
    {
        name: '胶片颗粒',
        thumbBg: 'linear-gradient(135deg, #C5B5A5 0%, #8B857A 100%)'
    },
    {
        name: '春日暖阳',
        thumbBg: 'linear-gradient(135deg, #FFD49B 0%, #FFB1A8 100%)'
    }
];

const TABS: readonly TabChipProps[] = [
    { icon: 'layers', label: '视频', count: 86 },
    { icon: 'mic', label: '音频', count: 42 },
    { icon: 'image', label: '贴图', count: 56 },
    { icon: 'type', label: '字幕', count: 38 },
    { icon: 'sparkles', label: '特效', count: 16, active: true }
];

const FILTER_CHIPS: readonly FilterChipProps[] = [
    { label: '推荐', active: true },
    { label: 'AI生成' },
    { label: '片头' },
    { label: '转场' },
    { label: '滤镜' }
];

/**
 * 编辑器 Screen —— Pencil `Bx8VF`。
 *
 * 当前渲染的 3 列布局：
 * - 左：分镜列表（uDWwv）
 * - 中：预览 + 时间线（jcCrz）
 * - 右：素材库（f2yO2）
 *
 * 顶部 Modal（导出）保留为占位。
 */
export const EditorScreen = (): JSX.Element => {
    return (
        <AppShell pageLabel="编辑器">
            <ColumnLayout>
                <SceneColumn>
                    <SceneColumnHeader />
                    <SceneSearchBar />
                    <SceneList scenes={SCENES} activeId="03" />
                </SceneColumn>

                <MiddleColumn>
                    <PreviewHeader
                        sceneNum={3}
                        totalScenes={12}
                        title="樱花特写 · 慢镜头"
                    />
                    <PreviewFrame />
                    <TransportBar />
                    <TimelineArea />
                </MiddleColumn>

                <RightColumn>
                    <LibraryPanel
                        tabs={TABS}
                        activeTab="特效"
                        chips={FILTER_CHIPS}
                        assets={ASSETS}
                        selectedAssetName="樱花飘落"
                    />
                </RightColumn>
            </ColumnLayout>
        </AppShell>
    );
};
