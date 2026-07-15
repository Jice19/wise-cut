/**
 * wordTimestampsToSrt + estimateWordTimestamps 单元测试 —— commit 13。
 */

import { describe, expect, it } from 'vitest';

import {
    estimateWordTimestamps,
    type WordTimestamp,
    wordTimestampsToSrt
} from '../src/tools/video-agent-tools.ts';

describe('wordTimestampsToSrt', () => {
    it('空数组 → 空字符串', () => {
        expect(wordTimestampsToSrt([])).toBe('');
    });

    it('单字 → 1 条字幕', () => {
        const words: WordTimestamp[] = [
            { endMs: 1500, startMs: 0, word: '你好' }
        ];
        const srt = wordTimestampsToSrt(words);
        expect(srt).toContain('1\n');
        expect(srt).toContain('00:00:00,000 --> 00:00:01,500\n');
        expect(srt).toContain('你好\n');
    });

    it('多字按 4 字分组', () => {
        const words: WordTimestamp[] = [
            { endMs: 1000, startMs: 0, word: '一' },
            { endMs: 2000, startMs: 1000, word: '二' },
            { endMs: 3000, startMs: 2000, word: '三' },
            { endMs: 4000, startMs: 3000, word: '四' },
            { endMs: 5000, startMs: 4000, word: '五' }
        ];
        const srt = wordTimestampsToSrt(words);
        const groups = srt.split('\n\n');
        expect(groups).toHaveLength(2);
        expect(groups[0]).toContain('一 二 三 四');
        expect(groups[1]).toContain('五');
    });

    it('sceneStartMs offset 应用到时间戳', () => {
        const words: WordTimestamp[] = [
            { endMs: 1000, startMs: 0, word: '好' }
        ];
        const srt = wordTimestampsToSrt(words, { sceneStartMs: 5000 });
        expect(srt).toContain('00:00:05,000 --> 00:00:06,000');
    });

    it('时间戳格式 hh:mm:ss,mmm', () => {
        const words: WordTimestamp[] = [
            { endMs: 3661500, startMs: 3600000, word: '一小时后' }
        ];
        const srt = wordTimestampsToSrt(words);
        expect(srt).toContain('01:00:00,000 --> 01:01:01,500');
    });
});

describe('estimateWordTimestamps', () => {
    it('中文按字均分', () => {
        const ts = estimateWordTimestamps('你好世界', 4000);
        expect(ts).toHaveLength(4);
        expect(ts[0]?.word).toBe('你');
        expect(ts[0]?.startMs).toBe(0);
        expect(ts[0]?.endMs).toBe(1000);
        expect(ts[3]?.word).toBe('界');
        expect(ts[3]?.endMs).toBe(4000);
    });

    it('英文按词均分', () => {
        const ts = estimateWordTimestamps('Hello world test', 3000);
        expect(ts).toHaveLength(3);
        expect(ts[0]?.word).toBe('Hello');
        expect(ts[1]?.word).toBe('world');
        expect(ts[2]?.word).toBe('test');
        expect(ts[2]?.endMs).toBe(3000);
    });

    it('混合中文 + 英文 + 数字', () => {
        const ts = estimateWordTimestamps('AI 时代 2026', 4000);
        expect(ts.length).toBeGreaterThanOrEqual(3);
        expect(ts.find((t) => t.word === 'AI')).toBeDefined();
        expect(ts.find((t) => t.word === '2026')).toBeDefined();
    });

    it('空字符串 → 空数组', () => {
        expect(estimateWordTimestamps('', 1000)).toEqual([]);
    });
});
