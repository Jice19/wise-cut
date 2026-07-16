/* */
import { describe, expect, it } from 'vitest';
import type { ZodType } from 'zod';

import type { AgentEnv } from '../src/config/load-agent-env';
import { buildScenePlannerPrompt } from '../src/prompts/scene-planner';
import {
    ArkChatModelProvider,
    ModelProviderSchemaError,
    type StructuredChatModel
} from '../src/providers/ark-chat-model-provider';

const agentEnv: AgentEnv = {
    API_KEY: 'test-provider-token',
    BASE_URL: 'https://ark.cn-beijing.volces.com/api/plan/v3',
    LLM_MODEL: 'doubao-seed-2.0-pro',
    TTS_MODEL: 'seed-tts-2.0'
};

class FakeStructuredChatModel implements StructuredChatModel {
    public readonly prompts: string[] = [];
    public readonly structuredOutputCalls: {
        config: unknown;
        schema: unknown;
    }[] = [];

    constructor(private readonly outputs: unknown[]) {}

    withStructuredOutput<T>(schema: ZodType<T>, config: unknown) {
        this.structuredOutputCalls.push({ config, schema });

        return {
            invoke: async (prompt: string) => {
                this.prompts.push(prompt);
                const output = this.outputs.shift();

                return schema.parse(output);
            }
        };
    }

    async invoke() {
        throw new Error(
            'FakeStructuredChatModel.invoke should not be called directly'
        );
    }
}

class FakeRawChatModel implements StructuredChatModel {
    public readonly prompts: string[] = [];
    public readonly structuredOutputCalls: {
        config: unknown;
        schema: unknown;
    }[] = [];

    constructor(private readonly outputs: unknown[]) {}

    withStructuredOutput<T>(schema: ZodType<T>, config: unknown) {
        this.structuredOutputCalls.push({ config, schema });

        return {
            invoke: async (prompt: string) => {
                this.prompts.push(prompt);

                return this.outputs.shift();
            }
        };
    }

    async invoke() {
        throw new Error(
            'FakeRawChatModel.invoke should not be called directly'
        );
    }
}

class FakeStreamingChatModel extends FakeRawChatModel {
    public readonly streamPrompts: string[] = [];

    constructor({
        outputs,
        streamChunks
    }: {
        outputs: unknown[];
        streamChunks: unknown[];
    }) {
        super(outputs);
        this.streamChunks = streamChunks;
    }

    private readonly streamChunks: unknown[];

    async *stream(prompt: string) {
        this.streamPrompts.push(prompt);

        for (const chunk of this.streamChunks) {
            yield chunk;
        }
    }
}

class FakeUnavailableStructuredOutputModel implements StructuredChatModel {
    async invoke() {
        throw new Error(
            'Legacy direct invoke is intentionally unsupported for structured output'
        );
    }

    withStructuredOutput(): never {
        throw new Error('withStructuredOutput is unavailable');
    }
}

const expectJsonSchemaCall = (model: {
    structuredOutputCalls: { config: unknown; schema: unknown }[];
}) => {
    expect(model.structuredOutputCalls[0]?.config).toEqual({
        method: 'jsonSchema',
        strict: true
    });
};

describe('ArkChatModelProvider', () => {
    it('instructs scene planning to output spoken narration copy for subtitle lines', () => {
        const prompt = buildScenePlannerPrompt({
            brief: {
                summary: '介绍智剪智能剪辑'
            },
            targetSceneCount: 3
        });

        expect(prompt).toContain(
            'subtitleLines 必须是可以直接朗读给 TTS 的口播稿'
        );
        expect(prompt).toContain(
            '不要写分镜说明、镜头动作、标题、编号、冒号式结构'
        );
        expect(prompt).toContain('script 必须等于 subtitleLines 按换行拼接');
        expect(prompt).toContain('分镜数量不要固定');
        expect(prompt).toContain('每个分镜通常保留 1 到 3 条 subtitleLines');
    });

    it('uses LangChain structured output for creative brief generation', async () => {
        const model = new FakeStructuredChatModel([
            {
                audience: '创业者',
                keyMessages: ['节省剪辑时间', '自动生成分镜'],
                summary: '一条介绍智剪智能剪辑能力的产品短片',
                title: '智剪智能剪辑',
                tone: '专业可信',
                visualStyle: '明亮科技感'
            }
        ]);
        const provider = new ArkChatModelProvider({
            env: agentEnv,
            model
        });

        const brief = await provider.generateCreativeBrief({
            prompt: '做一个产品发布视频',
            sourceAssetSummaries: ['产品界面录屏', '人物口播']
        });

        expect(brief.title).toBe('智剪智能剪辑');
        expect(brief.keyMessages).toEqual(['节省剪辑时间', '自动生成分镜']);
        expect(model.prompts[0]).toContain('做一个产品发布视频');
        expectJsonSchemaCall(model);
    });

    it('normalizes structured output schema errors', async () => {
        const provider = new ArkChatModelProvider({
            env: agentEnv,
            model: new FakeStructuredChatModel([
                {
                    title: '缺字段'
                }
            ])
        });

        await expect(
            provider.generateCreativeBrief({
                prompt: '做一个产品发布视频',
                sourceAssetSummaries: []
            })
        ).rejects.toMatchObject({
            issues: expect.arrayContaining([
                expect.objectContaining({
                    path: ['summary']
                })
            ]),
            task: 'creativeBrief'
        });
        await expect(
            provider.generateCreativeBrief({
                prompt: '做一个产品发布视频',
                sourceAssetSummaries: []
            })
        ).rejects.toBeInstanceOf(ModelProviderSchemaError);
    });

    it('keeps provider boundary validation after LangChain structured output returns data', async () => {
        const provider = new ArkChatModelProvider({
            env: agentEnv,
            model: new FakeRawChatModel([
                {
                    title: '缺字段'
                }
            ])
        });

        await expect(
            provider.generateCreativeBrief({
                prompt: '做一个产品发布视频',
                sourceAssetSummaries: []
            })
        ).rejects.toBeInstanceOf(ModelProviderSchemaError);
    });

    it('rejects ranked asset matches that reference assets outside the candidate set', async () => {
        const model = new FakeStructuredChatModel([
            {
                matches: [
                    {
                        rankedAssetIds: [
                            {
                                assetId: 'video-missing',
                                reason: '看起来相关',
                                score: 0.91
                            }
                        ],
                        sceneId: 'scene-001'
                    }
                ]
            }
        ]);
        const provider = new ArkChatModelProvider({
            env: agentEnv,
            model
        });

        await expect(
            provider.rankAssetMatches({
                candidates: [
                    {
                        assetId: 'video-001',
                        description: '产品界面',
                        durationMs: 3000
                    }
                ],
                scenes: [
                    {
                        durationMs: 3000,
                        goal: '展示产品',
                        id: 'scene-001',
                        index: 1,
                        script: '智剪让剪辑更快',
                        subtitleLines: ['智剪让剪辑更快'],
                        title: '开场',
                        visualIntent: '产品界面'
                    }
                ]
            })
        ).rejects.toMatchObject({
            issues: expect.arrayContaining([
                expect.objectContaining({
                    message:
                        'Matched asset id video-missing is not in candidates'
                })
            ]),
            task: 'assetMatcher'
        });
        expectJsonSchemaCall(model);
    });

    it('allows jsonMode fallback to be configured for OpenAI-compatible providers', async () => {
        const model = new FakeRawChatModel([
            {
                audience: '创业者',
                keyMessages: ['节省剪辑时间'],
                summary: '一条产品短片',
                title: '智剪',
                tone: '专业',
                visualStyle: '科技感'
            }
        ]);
        const provider = new ArkChatModelProvider({
            env: agentEnv,
            model,
            structuredOutput: {
                method: 'jsonMode'
            }
        });

        await provider.generateCreativeBrief({
            prompt: '做一个产品发布视频',
            sourceAssetSummaries: []
        });

        expect(model.structuredOutputCalls[0]?.config).toEqual({
            method: 'jsonMode'
        });
    });

    it('fails fast when a model does not expose withStructuredOutput', async () => {
        const provider = new ArkChatModelProvider({
            env: agentEnv,
            model: new FakeUnavailableStructuredOutputModel()
        });

        await expect(
            provider.generateCreativeBrief({
                prompt: '做一个产品发布视频',
                sourceAssetSummaries: []
            })
        ).rejects.toThrow('withStructuredOutput is unavailable');
    });

    it('initializes ChatOpenAI-compatible options and emits sanitized provider events', () => {
        const events: unknown[] = [];
        const provider = new ArkChatModelProvider({
            createModel: (options) => {
                expect(options).toMatchObject({
                    apiKey: 'test-provider-token',
                    configuration: {
                        baseURL: 'https://ark.cn-beijing.volces.com/api/plan/v3'
                    },
                    model: 'doubao-seed-2.0-pro',
                    streamUsage: false
                });

                return new FakeStructuredChatModel([]);
            },
            emit: (event) => {
                events.push(event);
            },
            env: agentEnv
        });

        expect(provider.providerName).toBe('ark');
        expect(JSON.stringify(events)).not.toContain('test-provider-token');
        expect(events).toEqual([
            {
                baseURL: 'https://ark.cn-beijing.volces.com/api/plan/v3',
                model: 'doubao-seed-2.0-pro',
                provider: 'ark',
                type: 'provider.configured'
            }
        ]);
    });

    it('streams public creation reports without using the text as structured project data', async () => {
        const model = new FakeStreamingChatModel({
            outputs: [
                {
                    audience: '创业者',
                    keyMessages: ['提炼卖点'],
                    summary: '产品发布视频',
                    title: '智剪产品发布',
                    tone: '专业',
                    visualStyle: '科技感'
                }
            ],
            streamChunks: [
                { content: '我会先理解主题，' },
                { content: [{ type: 'text', text: '再拆解分镜。' }] }
            ]
        });
        const provider = new ArkChatModelProvider({
            env: agentEnv,
            model
        });
        const deltas: string[] = [];

        const report = await provider.streamReport(
            {
                prompt: '做一条智剪产品发布视频',
                title: '内容理解'
            },
            (delta) => {
                deltas.push(delta);
            }
        );
        const brief = await provider.generateCreativeBrief({
            prompt: '做一条智剪产品发布视频',
            sourceAssetSummaries: []
        });

        expect(deltas).toEqual(['我会先理解主题，', '再拆解分镜。']);
        expect(report).toBe('我会先理解主题，再拆解分镜。');
        expect(model.streamPrompts[0]).toContain('内容理解');
        expect(model.streamPrompts[0]).toContain('不要输出隐藏推理链');
        expect(model.streamPrompts[0]).toContain('不要套用固定标题');
        expect(model.streamPrompts[0]).not.toContain(
            '内容理解、方案推导、执行说明和结果摘要'
        );
        expect(brief.title).toBe('智剪产品发布');
        expectJsonSchemaCall(model);
    });
});
