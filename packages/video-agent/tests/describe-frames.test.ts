/**
 * describeFrames 单元测试 —— mock MinimaxM3ChatProvider.chat 返回固定响应,
 * 验证 base64 → messages 拼装 + JSON 解析 + schema 校验整条链路。
 *
 * 不打真实 LLM,纯算法 / schema 路径。
 */

import { describe, expect, it } from 'vitest';

import { extractJsonFromLlmResponse } from '../src/providers/llm-json.ts';
import {
    FrameDescriptionSchemaError,
    MinimaxM3ModelProvider
} from '../src/providers/m3-chat-model-provider.ts';

class StubChat {
    nextResponse: string | Error = '{}';

    async chat(): Promise<string> {
        if (this.nextResponse instanceof Error) {
            throw this.nextResponse;
        }

        return this.nextResponse;
    }
}

const fakeFrame = {
    base64DataUrl: 'data:image/jpeg;base64,/9j/4AAQSkZJRgABAQAASABIAAD',
    frameId: 'f-001',
    mimeType: 'image/jpeg'
};

const fakeTwoFrames = [fakeFrame, { ...fakeFrame, frameId: 'f-002' }];

describe('extractJsonFromLlmResponse', () => {
    it('parses raw JSON without markdown', () => {
        const result = extractJsonFromLlmResponse(
            '{"frames":[{"frameId":"f-1","description":"hi"}]}'
        );
        expect(result).toEqual({
            frames: [{ description: 'hi', frameId: 'f-1' }]
        });
    });

    it('parses JSON inside ```json ... ``` fence', () => {
        const result = extractJsonFromLlmResponse(
            '```json\n{"frames":[{"frameId":"f-1","description":"hi"}]}\n```'
        );
        expect(result).toEqual({
            frames: [{ description: 'hi', frameId: 'f-1' }]
        });
    });

    it('parses JSON surrounded by chatty text', () => {
        const result = extractJsonFromLlmResponse(
            '好的,以下是结果:\n\n{"frames":[{"frameId":"f-1"}]}\n\n如有需要请告诉我。'
        );
        expect(result).toEqual({ frames: [{ frameId: 'f-1' }] });
    });

    it('throws when no JSON object present', () => {
        expect(() => extractJsonFromLlmResponse('no json here')).toThrow(
            /No JSON object/
        );
    });

    it('throws on malformed JSON', () => {
        expect(() => extractJsonFromLlmResponse('{not valid json}')).toThrow(
            /Failed to parse JSON/
        );
    });
});

describe('MinimaxM3ModelProvider.describeFrames', () => {
    const makeProvider = (response: string | Error) => {
        const stub = new StubChat();
        stub.nextResponse = response;
        return {
            provider: new MinimaxM3ModelProvider({
                apiKey: 'fake',
                m3ChatProvider: stub as unknown as Parameters<
                    typeof MinimaxM3ModelProvider
                >[0]['m3ChatProvider']
            }),
            stub
        };
    };

    it('returns empty array for empty input', async () => {
        const { provider } = makeProvider('{}');
        const result = await provider.describeFrames({ frames: [] });
        expect(result).toEqual([]);
    });

    it('parses a valid LLM response into FrameDescription[]', async () => {
        const llmResponse = JSON.stringify({
            frames: [
                {
                    actions: ['walking'],
                    description: '一个人在街边行走',
                    frameId: 'f-001',
                    mood: '平静',
                    objects: ['人', '街道']
                }
            ]
        });
        const { provider } = makeProvider(llmResponse);
        const result = await provider.describeFrames({ frames: [fakeFrame] });
        expect(result).toHaveLength(1);
        expect(result[0]?.frameId).toBe('f-001');
        expect(result[0]?.description).toBe('一个人在街边行走');
    });

    it('parses ```json fenced LLM response', async () => {
        const llmResponse =
            '```json\n' +
            JSON.stringify({
                frames: [
                    {
                        actions: [],
                        description: '画面信息不足',
                        frameId: 'f-001',
                        mood: 'unknown',
                        objects: []
                    }
                ]
            }) +
            '\n```';
        const { provider } = makeProvider(llmResponse);
        const result = await provider.describeFrames({ frames: [fakeFrame] });
        expect(result[0]?.mood).toBe('unknown');
    });

    it('throws FrameDescriptionSchemaError when frame id missing', async () => {
        const { provider } = makeProvider(
            JSON.stringify({
                frames: [
                    {
                        actions: [],
                        description: 'no id',
                        frameId: 'WRONG-ID',
                        mood: 'neutral',
                        objects: []
                    }
                ]
            })
        );
        await expect(
            provider.describeFrames({ frames: [fakeFrame] })
        ).rejects.toBeInstanceOf(FrameDescriptionSchemaError);
    });

    it('throws FrameDescriptionSchemaError when frame count mismatches', async () => {
        const { provider } = makeProvider(
            JSON.stringify({
                frames: [
                    {
                        actions: [],
                        description: 'one',
                        frameId: 'f-001',
                        mood: 'neutral',
                        objects: []
                    },
                    {
                        actions: [],
                        description: 'two',
                        frameId: 'f-002',
                        mood: 'neutral',
                        objects: []
                    }
                ]
            })
        );
        await expect(
            provider.describeFrames({ frames: [fakeFrame] })
        ).rejects.toBeInstanceOf(FrameDescriptionSchemaError);
    });

    it('throws when LLM returns invalid JSON', async () => {
        const { provider } = makeProvider('totally not json');
        await expect(
            provider.describeFrames({ frames: [fakeFrame] })
        ).rejects.toBeInstanceOf(FrameDescriptionSchemaError);
    });

    it('preserves input order across multiple frames', async () => {
        const llmResponse = JSON.stringify({
            frames: [
                {
                    actions: [],
                    description: 'second frame',
                    frameId: 'f-002',
                    mood: '平静',
                    objects: []
                },
                {
                    actions: [],
                    description: 'first frame',
                    frameId: 'f-001',
                    mood: '紧张',
                    objects: []
                }
            ]
        });
        const { provider } = makeProvider(llmResponse);
        // 输入顺序 f-001, f-002,期望 provider 校验失败(因为输出顺序与输入不一致)
        await expect(
            provider.describeFrames({ frames: fakeTwoFrames })
        ).rejects.toBeInstanceOf(FrameDescriptionSchemaError);
    });
});
