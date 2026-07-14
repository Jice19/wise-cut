/**
 * 各 LLM 节点的 payload 类型 —— LLM 输出的 raw JSON 结构,
 * nodes 里 .parse 后转成正式 schema 对象。
 */

import type { CreativeBrief, Scene } from '@miaoma-magicut/video-project';

export type CreativeBriefPayload = {
    audience: string;
    keyMessages: string[];
    summary: string;
    title: string;
    tone: string;
} & CreativeBrief;

export type ScenePlannerPayload = {
    scenes: {
        endMs: number;
        narration: string;
        order?: number;
        sceneId: string;
        startMs: number;
        subtitleLines: { endMs: number; startMs: number; text: string }[];
        visualBrief: string;
    }[];
} & { scenes: Scene[] };

export type AssetMatcherPayload = {
    matches: {
        matchedAssetId: string;
        ranking: number;
        sceneId: string;
        score: number;
    }[];
};

/**
 * scene_approval interrupt payload / resume —— LangGraph interrupt<>() 用。
 */
export type SceneApprovalRequest = {
    payload: {
        brief?: {
            audience: string;
            keyMessages: string[];
            summary: string;
            title: string;
            tone: string;
        };
        scenes: {
            endMs: number;
            narration: string;
            sceneId: string;
            startMs: number;
            visualBrief: string;
        }[];
    };
    type: 'scene-plan';
};

export type SceneApprovalResume = { approved: boolean; feedback?: string };
