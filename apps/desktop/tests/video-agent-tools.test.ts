/* */
import { describe, expect, it, vi } from 'vitest';

import type {
    CreativeBrief,
    DescribedImage,
    ModelProvider,
    PlannedScene
} from '@wise-cut/video-agent';

import { createDesktopVideoAgentTools } from '../client/video-agent-tools';
import type { VideoProjectStore } from '../client/video-project-store';

const brief: CreativeBrief = {
    audience: '短视频创作者',
    keyMessages: ['智剪', '智能分镜'],
    summary: '介绍智剪能力',
    title: '智剪',
    tone: '专业轻快',
    visualStyle: '清爽科技感'
};

const makeFakeModelProvider = (): {
    modelProvider: ModelProvider;
    planScenesCalls: Array<Parameters<ModelProvider['planScenes']>[0]>;
} => {
    const planScenesCalls: Array<Parameters<ModelProvider['planScenes']>[0]> =
        [];
    const fakeScenes: PlannedScene[] = [
        {
            durationMs: 5000,
            goal: '开场',
            id: 'scene_001',
            index: 1,
            script: '先把重点说清楚',
            subtitleLines: ['先把重点说清楚'],
            title: '开场',
            visualIntent: '素材[video_asset_run_001] 镜头前讲解产品'
        }
    ];

    return {
        modelProvider: {
            describeFrames: vi.fn(),
            embedTexts: vi.fn(),
            generateCreativeBrief: vi.fn(),
            planScenes: vi.fn(async (input) => {
                planScenesCalls.push(input);

                return fakeScenes;
            }),
            rankAssetMatches: vi.fn(),
            streamReport: vi.fn()
        },
        planScenesCalls
    };
};

const makeStore = (): VideoProjectStore =>
    ({
        createProject: vi.fn(),
        loadProject: vi.fn(),
        listProjects: vi.fn()
    }) as unknown as VideoProjectStore;

describe('createDesktopVideoAgentTools.planScenes', () => {
    it('passes the creative brief through and falls back to scan descriptions when no understanding exists', async () => {
        const { modelProvider, planScenesCalls } = makeFakeModelProvider();
        const tools = createDesktopVideoAgentTools({
            modelProvider,
            store: makeStore()
        });

        await tools.planScenes({
            assets: [
                {
                    assetId: 'video_asset_run_001',
                    description: '本地视频素材 scene-01.mp4',
                    durationMs: 5000
                }
            ],
            brief,
            input: {
                prompt: '介绍智剪',
                runId: 'run_001',
                sourceAssetDirectory: '/tmp/videos'
            }
        });

        expect(planScenesCalls).toHaveLength(1);
        expect(planScenesCalls[0]?.brief).toBe(brief);
        expect(planScenesCalls[0]?.sourceAssets).toEqual([
            {
                actions: undefined,
                assetId: 'video_asset_run_001',
                description: '本地视频素材 scene-01.mp4',
                mood: undefined,
                objects: undefined,
                suggestedSceneType: undefined
            }
        ]);
    });

    it('overrides scan description with multimodal understanding when the getter returns a result', async () => {
        const { modelProvider, planScenesCalls } = makeFakeModelProvider();
        const understanding: DescribedImage = {
            actions: ['讲解', '演示'],
            description: '一个人在镜头前讲解产品,画面偏专业感',
            mood: '专注专业',
            objects: ['人物', '产品', '屏幕'],
            promptMatchReason: '匹配',
            promptMatchScore: 0.86,
            suggestedSceneType: '口播讲解分镜'
        };
        const getAssetUnderstanding = (
            runId: string,
            assetId: string
        ): DescribedImage | undefined => {
            if (runId === 'run_001' && assetId === 'video_asset_run_001') {
                return understanding;
            }

            return undefined;
        };
        const tools = createDesktopVideoAgentTools({
            getAssetUnderstanding,
            modelProvider,
            store: makeStore()
        });

        await tools.planScenes({
            assets: [
                {
                    assetId: 'video_asset_run_001',
                    description: '本地视频素材 scene-01.mp4', // scan 占位
                    durationMs: 5000
                },
                {
                    assetId: 'video_asset_run_002', // 没有 understanding
                    description: '本地视频素材 scene-02.mp4',
                    durationMs: 4000
                }
            ],
            brief,
            input: {
                prompt: '介绍智剪',
                runId: 'run_001',
                sourceAssetDirectory: '/tmp/videos'
            }
        });

        expect(planScenesCalls).toHaveLength(1);
        expect(planScenesCalls[0]?.sourceAssets).toEqual([
            {
                actions: understanding.actions,
                assetId: 'video_asset_run_001',
                description: understanding.description, // 用 understanding
                mood: understanding.mood,
                objects: understanding.objects,
                suggestedSceneType: understanding.suggestedSceneType
            },
            {
                actions: undefined,
                assetId: 'video_asset_run_002',
                description: '本地视频素材 scene-02.mp4', // 回退到 scan
                mood: undefined,
                objects: undefined,
                suggestedSceneType: undefined
            }
        ]);
    });

    it('skips source assets section entirely when no assets are provided', async () => {
        const { modelProvider, planScenesCalls } = makeFakeModelProvider();
        const tools = createDesktopVideoAgentTools({
            modelProvider,
            store: makeStore()
        });

        await tools.planScenes({
            assets: [],
            brief,
            input: {
                prompt: '介绍智剪',
                runId: 'run_001',
                sourceAssetDirectory: '/tmp/videos'
            }
        });

        expect(planScenesCalls).toHaveLength(1);
        // sourceAssets 仍然是空数组,而不是 undefined,这样 LLM 至少看到结构
        expect(planScenesCalls[0]?.sourceAssets).toEqual([]);
    });
});
