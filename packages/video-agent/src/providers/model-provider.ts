/**
 * ModelProvider 抽象接口 —— 视频 Agent 层只依赖这个 interface,
 * 不用关心底层是 M3 / GPT-4 / Claude / mock。
 *
 * 视频项目里核心能力:
 *   - describeFrames:多模态,base64 → 文字描述
 *   - generateText:纯文本生成,给 creative_brief / plan_scenes / match_assets
 *     三个 LLM 节点用
 */

import type { FrameDescription } from '@miaoma-magicut/video-project';

export type FrameImage = {
    base64DataUrl: string;
    frameId: string;
    mimeType: string;
};

export type DescribeFramesInput = {
    frames: readonly FrameImage[];
    maxTokens?: number;
    temperature?: number;
};

export type GenerateTextInput = {
    /** 任意 system prompt 字符串 */
    system: string;
    /** 任意 user prompt 字符串(已包含占位符替换) */
    user: string;
    maxTokens?: number;
    temperature?: number;
};

export type GenerateTextResult = {
    /** 模型原始输出文本(后续由 extractJsonFromLlmResponse 抠 JSON) */
    text: string;
    /** 总 token 数(可选) */
    totalTokens?: number;
};

export interface ModelProvider {
    describeFrames(input: DescribeFramesInput): Promise<FrameDescription[]>;
    generateText(input: GenerateTextInput): Promise<GenerateTextResult>;
}
