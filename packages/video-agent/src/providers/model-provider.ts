/**
 * ModelProvider 抽象接口 —— 视频 Agent 层只依赖这个 interface,
 * 不用关心底层是 M3 / GPT-4 / Claude / mock。
 *
 * 视频项目里核心能力:
 *   - describeFrames:多模态,base64 → 文字描述
 *   - 后续 commit 5 会扩 generateCreativeBrief / planScenes / rankAssetMatches 等纯文本能力
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

export interface ModelProvider {
    describeFrames(input: DescribeFramesInput): Promise<FrameDescription[]>;
}
