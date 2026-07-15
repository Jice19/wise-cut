import { describe, expect, it } from 'vitest';

import { extractJsonFromLlmResponse } from '../src/providers/llm-json';

describe('extractJsonFromLlmResponse', () => {
    it('纯 JSON 响应解析出对象', () => {
        expect(extractJsonFromLlmResponse('{"a":1}')).toEqual({ a: 1 });
    });

    it('json code fence 包裹解析出对象', () => {
        expect(extractJsonFromLlmResponse('```json\n{"a":1}\n```')).toEqual({
            a: 1
        });
    });

    it('commit 22:reasoning model 先输出 thinking 块,后接 JSON —— 也能解析', () => {
        const text = `Let me think about this carefully.

The user wants me to create a storyboard for a video about cherry blossoms. Let me start with the JSON output.

\`\`\`json
{"scenes":[{"sceneId":"s-1","order":0,"startMs":0,"endMs":3000,"narration":"test","visualBrief":"test","subtitleLines":[{"startMs":0,"endMs":3000,"text":"test"}]}]}
\`\`\``;
        expect(extractJsonFromLlmResponse(text)).toEqual({
            scenes: [
                {
                    endMs: 3000,
                    narration: 'test',
                    order: 0,
                    sceneId: 's-1',
                    startMs: 0,
                    subtitleLines: [{ endMs: 3000, startMs: 0, text: 'test' }],
                    visualBrief: 'test'
                }
            ]
        });
    });

    it('thinking 块在前面,JSON 紧跟其后,无 fence', () => {
        const text = `Let me plan this carefully.

{"scenes":[]}`;
        expect(extractJsonFromLlmResponse(text)).toEqual({ scenes: [] });
    });

    it('找不到 JSON 对象时抛 No JSON', () => {
        expect(() =>
            extractJsonFromLlmResponse('just some text without braces')
        ).toThrow(/No JSON object found/);
    });
});
