/* */
import { describe, expect, it } from 'vitest';

import {
    sampleVideoProject,
    validateVideoProject,
    type VideoProject
} from '@wise-cut/video-project';

import type { AgentRunEvent } from '../src/events/agent-run-event';
import {
    createVideoCreationGraph,
    type VideoAgentTools
} from '../src/graph/create-video-creation-graph';
import type {
    AssetAnalysis,
    AssetMatchResult,
    VoiceSynthesisResult
} from '../src/tools/video-agent-tools';

const runInput = {
    prompt: '生成一条智剪产品介绍短片',
    runId: 'run-test-001',
    sourceAssetDirectory: '/Users/heyi/Movies/MiaoMa素材/demo/raw'
};

const brief = {
    audience: '短视频创作者',
    keyMessages: ['智能分镜', '素材匹配', '自动配音'],
    summary: '智剪产品介绍短片',
    title: '智剪智能剪辑',
    tone: '专业轻快',
    visualStyle: '明亮科技感'
};

const scenes = [
    {
        durationMs: 3000,
        goal: '展示产品开场',
        id: 'scene-001',
        index: 1,
        script: '智剪让视频创作更快',
        subtitleLines: ['智剪让视频创作更快'],
        title: '开场',
        visualIntent: '产品界面和时间线'
    }
];

const assets: AssetAnalysis[] = [
    {
        assetId: 'video-001',
        description: '产品界面录屏',
        durationMs: 3000
    }
];

const matches: AssetMatchResult[] = [
    {
        rankedAssetIds: [
            {
                assetId: 'video-001',
                reason: '与产品界面分镜匹配',
                score: 0.96
            }
        ],
        sceneId: 'scene-001'
    }
];

const voices: VoiceSynthesisResult[] = [
    {
        assetId: 'voice-001',
        durationMs: 3000,
        lineIndex: 0,
        path: '/tmp/miaoma/voice-001.mp3',
        sceneId: 'scene-001',
        text: '智剪让视频创作更快'
    }
];

const createFakeTools = ({
    invalidProject = false
}: {
    invalidProject?: boolean;
} = {}) => {
    const calls: string[] = [];
    const tools: VideoAgentTools = {
        analyzeAssets: async () => {
            calls.push('analyzeAssets');
            return assets;
        },
        assembleTimeline: async () => {
            calls.push('assembleTimeline');

            if (invalidProject) {
                return {
                    ...sampleVideoProject,
                    schemaVersion: 'invalid-version'
                } as unknown as VideoProject;
            }

            return sampleVideoProject;
        },
        generateCreativeBrief: async () => {
            calls.push('generateCreativeBrief');
            return brief;
        },
        matchAssets: async () => {
            calls.push('matchAssets');
            return matches;
        },
        planScenes: async () => {
            calls.push('planScenes');
            return scenes;
        },
        saveProject: async ({ project }) => {
            calls.push('saveProject');
            return {
                path: `/tmp/miaoma/${project.project.id}.json`,
                project
            };
        },
        scanAssets: async () => {
            calls.push('scanAssets');
            return assets;
        },
        streamReport: async ({ title }, emitDelta) => {
            calls.push(`streamReport:${title}`);
            emitDelta(`报告-${title}-1`);
            emitDelta(`报告-${title}-2`);

            return `报告-${title}-1报告-${title}-2`;
        },
        synthesizeVoice: async () => {
            calls.push('synthesizeVoice');
            return voices;
        },
        validateProject: async ({ project }) => {
            calls.push('validateProject');
            const result = validateVideoProject(project);

            if (!result.success) {
                return {
                    error: result.issues[0] ?? 'Invalid project',
                    success: false
                };
            }

            return { success: true };
        }
    };

    return { calls, tools };
};

const collectEvents = () => {
    const events: AgentRunEvent[] = [];

    return {
        emit: (event: AgentRunEvent) => {
            events.push(event);
        },
        events
    };
};

describe('video creation graph', () => {
    it('pauses for scene approval before matching assets', async () => {
        const { calls, tools } = createFakeTools();
        const { emit, events } = collectEvents();
        const graph = createVideoCreationGraph({ emit, tools });

        const result = await graph.start(runInput);

        expect(result.status).toBe('waiting_for_approval');
        expect(result.approval?.type).toBe('scene-plan');
        expect(result.state?.scenes).toEqual(scenes);
        expect(calls).toEqual([
            'scanAssets',
            'analyzeAssets',
            'streamReport:内容理解',
            'generateCreativeBrief',
            'streamReport:文稿拆解为可执行分镜',
            'planScenes'
        ]);
        expect(events.map((event) => event.type)).toContain(
            'approval.required'
        );
        expect(events[0]).toMatchObject({
            runId: 'run-test-001',
            sequence: 1,
            type: 'run.started'
        });
    });

    it('resumes after scene approval and outputs a valid VideoProject', async () => {
        const { calls, tools } = createFakeTools();
        const { emit, events } = collectEvents();
        const graph = createVideoCreationGraph({ emit, tools });

        await graph.start(runInput);
        const result = await graph.resume({
            approval: {
                approved: true
            },
            runId: runInput.runId
        });

        expect(result.status).toBe('completed');
        expect(validateVideoProject(result.project).success).toBe(true);
        expect(result.savedProjectPath).toBe(
            `/tmp/miaoma/${sampleVideoProject.project.id}.json`
        );
        expect(calls).toContain('matchAssets');
        expect(calls).toContain('synthesizeVoice');
        expect(calls).toContain('saveProject');
        expect(calls).toEqual(
            expect.arrayContaining([
                'streamReport:素材匹配与配音生成',
                'streamReport:口播配音生成',
                'streamReport:视频生成与工程整理'
            ])
        );
        expect(events.map((event) => event.type)).toEqual(
            expect.arrayContaining([
                'run.started',
                'node.started',
                'node.completed',
                'approval.required',
                'run.completed'
            ])
        );
    });

    it('returns readable validation errors and emits run.failed', async () => {
        const { tools } = createFakeTools({ invalidProject: true });
        const { emit, events } = collectEvents();
        const graph = createVideoCreationGraph({ emit, tools });

        await graph.start(runInput);
        const result = await graph.resume({
            approval: {
                approved: true
            },
            runId: runInput.runId
        });

        expect(result.status).toBe('failed');
        expect(result.errors[0]).toContain('schemaVersion');
        expect(events.at(-1)).toMatchObject({
            runId: runInput.runId,
            type: 'run.failed'
        });
    });

    it('redacts API-like secrets from failed event payloads', async () => {
        const { tools } = createFakeTools();
        const { emit, events } = collectEvents();
        const graph = createVideoCreationGraph({
            emit,
            tools: {
                ...tools,
                matchAssets: async () => {
                    throw new Error(
                        'provider failed with ark-sensitive-token-123456'
                    );
                }
            }
        });

        await graph.start(runInput);
        const result = await graph.resume({
            approval: {
                approved: true
            },
            runId: runInput.runId
        });

        expect(result.status).toBe('failed');
        expect(JSON.stringify(events)).not.toContain(
            'ark-sensitive-token-123456'
        );
        expect(JSON.stringify(events)).toContain('[REDACTED]');
    });

    it('emits public model stream reports across planning and generation stages', async () => {
        const { calls, tools } = createFakeTools();
        const { emit, events } = collectEvents();
        const graph = createVideoCreationGraph({ emit, tools });

        await graph.start(runInput);
        await graph.resume({
            approval: {
                approved: true
            },
            runId: runInput.runId
        });

        expect(calls).toEqual([
            'scanAssets',
            'analyzeAssets',
            'streamReport:内容理解',
            'generateCreativeBrief',
            'streamReport:文稿拆解为可执行分镜',
            'planScenes',
            'streamReport:素材匹配与配音生成',
            'matchAssets',
            'streamReport:口播配音生成',
            'synthesizeVoice',
            'streamReport:视频生成与工程整理',
            'assembleTimeline',
            'validateProject',
            'saveProject'
        ]);
        expect(events).toEqual(
            expect.arrayContaining([
                expect.objectContaining({
                    messageId: 'creative_brief-content-understanding',
                    nodeName: 'creative_brief',
                    title: '内容理解',
                    type: 'model.stream.started'
                }),
                expect.objectContaining({
                    delta: '报告-内容理解-1',
                    messageId: 'creative_brief-content-understanding',
                    nodeName: 'creative_brief',
                    type: 'model.stream.delta'
                }),
                expect.objectContaining({
                    messageId: 'creative_brief-content-understanding',
                    nodeName: 'creative_brief',
                    type: 'model.stream.completed'
                }),
                expect.objectContaining({
                    messageId: 'scene_planner-storyboard-breakdown',
                    nodeName: 'scene_planner',
                    title: '文稿拆解为可执行分镜',
                    type: 'model.stream.started'
                }),
                expect.objectContaining({
                    messageId: 'asset_matcher-voice-strategy',
                    nodeName: 'asset_matcher',
                    title: '素材匹配与配音生成',
                    type: 'model.stream.started'
                }),
                expect.objectContaining({
                    messageId: 'timeline_assemble-finalization',
                    nodeName: 'timeline_assemble',
                    title: '视频生成与工程整理',
                    type: 'model.stream.started'
                })
            ])
        );
    });
});
