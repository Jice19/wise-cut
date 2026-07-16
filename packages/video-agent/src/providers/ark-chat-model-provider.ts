/* */
import { z, type ZodIssue, type ZodType } from 'zod';

import { ChatOpenAI } from '@langchain/openai';

import type { AgentEnv } from '../config/load-agent-env';
import {
    type AssetMatchCandidate,
    type AssetMatchRanking,
    AssetMatchResponseSchema,
    buildAssetMatcherPrompt
} from '../prompts/asset-matcher';
import {
    buildCreativeBriefPrompt,
    type CreativeBrief,
    type CreativeBriefInput,
    CreativeBriefSchema
} from '../prompts/creative-brief';
import {
    buildFrameDescriptionPrompt,
    type FrameDescription,
    type FrameDescriptionInput,
    FrameDescriptionResponseSchema
} from '../prompts/frame-description';
import {
    buildScenePlannerPrompt,
    type PlannedScene,
    type ScenePlanInput,
    ScenePlanResponseSchema
} from '../prompts/scene-planner';

import type {
    ModelProvider,
    ModelReportInput,
    TextEmbedding
} from './model-provider';

type ModelProviderTask =
    | 'assetMatcher'
    | 'creativeBrief'
    | 'frameDescription'
    | 'scenePlanner'
    | 'textEmbedding';

export type ArkProviderEvent = {
    baseURL: string;
    model: string;
    provider: 'ark';
    type: 'provider.configured';
};

export type StructuredChatModel = {
    stream?: (
        prompt: string
    ) => AsyncIterable<unknown> | Promise<AsyncIterable<unknown>>;
    withStructuredOutput: <T>(
        schema: ZodType<T>,
        config: StructuredOutputOptions
    ) => {
        invoke: (prompt: string) => Promise<unknown>;
    };
};

export type StructuredOutputMethod =
    | 'functionCalling'
    | 'jsonMode'
    | 'jsonSchema';

export type StructuredOutputOptions = {
    method: StructuredOutputMethod;
    strict?: boolean;
};

export type ArkChatModelOptions = {
    apiKey: string;
    configuration: {
        baseURL: string;
    };
    maxRetries?: number;
    model: string;
    streamUsage: false;
    timeout?: number;
};

export class ModelProviderSchemaError extends Error {
    public readonly issues: Pick<ZodIssue, 'message' | 'path'>[];
    public readonly task: ModelProviderTask;

    constructor({
        issues,
        task
    }: {
        issues: Pick<ZodIssue, 'message' | 'path'>[];
        task: ModelProviderTask;
    }) {
        super(`Model output failed schema validation for ${task}`);
        this.name = 'ModelProviderSchemaError';
        this.issues = issues;
        this.task = task;
    }
}

const createDefaultChatModel = (options: ArkChatModelOptions) =>
    new ChatOpenAI(options);

const TextEmbeddingResponseSchema = z.object({
    embeddings: z.array(
        z.object({
            embedding: z.array(z.number()),
            text: z.string().min(1)
        })
    )
});

const parseStructuredOutput = <T>({
    raw,
    schema,
    task
}: {
    raw: unknown;
    schema: ZodType<T>;
    task: ModelProviderTask;
}): T => {
    const parsed = schema.safeParse(raw);

    if (!parsed.success) {
        throw new ModelProviderSchemaError({
            issues: parsed.error.issues.map((issue) => ({
                message: issue.message,
                path: issue.path
            })),
            task
        });
    }

    return parsed.data;
};

const isZodErrorLike = (
    error: unknown
): error is { issues: Pick<ZodIssue, 'message' | 'path'>[] } =>
    Boolean(
        error &&
            typeof error === 'object' &&
            'issues' in error &&
            Array.isArray((error as { issues?: unknown }).issues)
    );

const normalizeStructuredOutputError = ({
    error,
    task
}: {
    error: unknown;
    task: ModelProviderTask;
}): never => {
    if (error instanceof ModelProviderSchemaError) {
        throw error;
    }

    if (isZodErrorLike(error)) {
        throw new ModelProviderSchemaError({
            issues: error.issues.map((issue) => ({
                message: issue.message,
                path: issue.path
            })),
            task
        });
    }

    throw error;
};

const createStructuredOutputOptions = ({
    method = 'jsonSchema',
    strict = true
}: Partial<StructuredOutputOptions> = {}): StructuredOutputOptions => {
    if (method === 'jsonMode') {
        return { method };
    }

    return {
        method,
        strict
    };
};

const isTextContentPart = (part: unknown): part is { text: string } =>
    Boolean(
        part &&
            typeof part === 'object' &&
            'text' in part &&
            typeof (part as { text?: unknown }).text === 'string'
    );

const extractStreamContent = (chunk: unknown): string => {
    const content =
        chunk && typeof chunk === 'object' && 'content' in chunk
            ? (chunk as { content?: unknown }).content
            : chunk;

    if (typeof content === 'string') {
        return content;
    }

    if (Array.isArray(content)) {
        return content
            .map((part) => {
                if (typeof part === 'string') return part;
                if (isTextContentPart(part)) return part.text;

                return '';
            })
            .join('');
    }

    return '';
};

const buildPublicReportPrompt = ({
    context,
    prompt,
    title
}: ModelReportInput) =>
    [
        `你是智剪 Magicut 的视频创作智能体，请生成“${title}”阶段的可公开创作报告。`,
        '只输出给用户看的阶段说明，内容必须依赖用户输入、当前阶段上下文和工具/模型已产生的信息。',
        '不要套用固定标题，不要机械输出“内容理解 / 方案推导 / 执行说明 / 结果摘要”等固定结构。',
        '不要输出隐藏推理链、内部思考、自我校验过程或任何密钥。',
        '文风简洁、具体，使用中文自然段和短列表即可。',
        context ? `上下文：${context}` : undefined,
        `用户输入：${prompt}`
    ]
        .filter(Boolean)
        .join('\n');

export class ArkChatModelProvider implements ModelProvider {
    public readonly providerName = 'ark';
    private readonly model: StructuredChatModel;
    private readonly structuredOutput: StructuredOutputOptions;

    constructor({
        createModel = createDefaultChatModel,
        emit,
        env,
        maxRetries,
        model,
        structuredOutput,
        timeout
    }: {
        createModel?: (options: ArkChatModelOptions) => StructuredChatModel;
        emit?: (event: ArkProviderEvent) => void;
        env: AgentEnv;
        maxRetries?: number;
        model?: StructuredChatModel;
        structuredOutput?: Partial<StructuredOutputOptions>;
        timeout?: number;
    }) {
        const options: ArkChatModelOptions = {
            apiKey: env.API_KEY,
            configuration: {
                baseURL: env.BASE_URL
            },
            maxRetries,
            model: env.LLM_MODEL,
            streamUsage: false,
            timeout
        };

        this.model = model ?? createModel(options);
        this.structuredOutput = createStructuredOutputOptions(structuredOutput);
        emit?.({
            baseURL: env.BASE_URL,
            model: env.LLM_MODEL,
            provider: 'ark',
            type: 'provider.configured'
        });
    }

    async generateCreativeBrief(
        input: CreativeBriefInput
    ): Promise<CreativeBrief> {
        return this.invokeStructured({
            prompt: buildCreativeBriefPrompt(input),
            schema: CreativeBriefSchema,
            task: 'creativeBrief'
        });
    }

    async planScenes(input: ScenePlanInput): Promise<PlannedScene[]> {
        const response = await this.invokeStructured({
            prompt: buildScenePlannerPrompt(input),
            schema: ScenePlanResponseSchema,
            task: 'scenePlanner'
        });

        return response.scenes;
    }

    async describeFrames({
        frames
    }: {
        frames: FrameDescriptionInput[];
    }): Promise<FrameDescription[]> {
        const response = await this.invokeStructured({
            prompt: buildFrameDescriptionPrompt({ frames }),
            schema: FrameDescriptionResponseSchema,
            task: 'frameDescription'
        });

        return response.frames;
    }

    async rankAssetMatches({
        candidates,
        scenes
    }: {
        candidates: AssetMatchCandidate[];
        scenes: PlannedScene[];
    }): Promise<AssetMatchRanking[]> {
        const response = await this.invokeStructured({
            prompt: buildAssetMatcherPrompt({ candidates, scenes }),
            schema: AssetMatchResponseSchema,
            task: 'assetMatcher'
        });
        const candidateAssetIds = new Set(
            candidates.map((candidate) => candidate.assetId)
        );
        const issues = response.matches.flatMap((match, matchIndex) =>
            match.rankedAssetIds.flatMap((rankedAsset, rankedAssetIndex) =>
                candidateAssetIds.has(rankedAsset.assetId)
                    ? []
                    : [
                          {
                              message: `Matched asset id ${rankedAsset.assetId} is not in candidates`,
                              path: [
                                  'matches',
                                  matchIndex,
                                  'rankedAssetIds',
                                  rankedAssetIndex,
                                  'assetId'
                              ]
                          }
                      ]
            )
        );

        if (issues.length > 0) {
            throw new ModelProviderSchemaError({
                issues,
                task: 'assetMatcher'
            });
        }

        return response.matches;
    }

    async embedTexts({ texts }: { texts: string[] }): Promise<TextEmbedding[]> {
        if (texts.length === 0) {
            return [];
        }

        const response = await this.invokeStructured({
            prompt: [
                '为输入文本生成可用于素材检索的 embedding JSON。',
                '输出严格 JSON，不要包含 Markdown。',
                'JSON 字段：embeddings，每项包含 text 和 embedding。',
                `文本：${JSON.stringify(texts)}`
            ].join('\n'),
            schema: TextEmbeddingResponseSchema,
            task: 'textEmbedding'
        });

        return response.embeddings;
    }

    async streamReport(
        input: ModelReportInput,
        emitDelta: (delta: string) => void | Promise<void>
    ): Promise<string> {
        if (!this.model.stream) {
            throw new Error('Chat model does not support streaming');
        }

        const chunks: string[] = [];
        const stream = await this.model.stream(buildPublicReportPrompt(input));

        for await (const chunk of stream) {
            const delta = extractStreamContent(chunk);

            if (!delta) continue;

            chunks.push(delta);
            await emitDelta(delta);
        }

        return chunks.join('');
    }

    private async invokeStructured<T>({
        prompt,
        schema,
        task
    }: {
        prompt: string;
        schema: ZodType<T>;
        task: ModelProviderTask;
    }): Promise<T> {
        let raw: unknown;

        try {
            raw = await this.model
                .withStructuredOutput(schema, this.structuredOutput)
                .invoke(prompt);
        } catch (error) {
            normalizeStructuredOutputError({ error, task });
        }

        return parseStructuredOutput({
            raw,
            schema,
            task
        });
    }
}
