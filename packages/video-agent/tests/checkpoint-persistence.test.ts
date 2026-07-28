/* */
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';

import {
    sampleVideoProject,
    validateVideoProject,
    type VideoProject
} from '@wise-cut/video-project';
import { describe, expect, it } from 'vitest';

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
    runId: 'run-persist-001',
    sourceAssetDirectory: '/tmp/fake-assets'
};

const brief = {
    audience: '短视频创作者',
    keyMessages: ['智能分镜', '素材匹配'],
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

const createFakeTools = (): VideoAgentTools => ({
    analyzeAssets: async () => assets,
    assembleTimeline: async () => sampleVideoProject as unknown as VideoProject,
    generateCreativeBrief: async () => brief,
    matchAssets: async () => matches,
    planScenes: async () => scenes,
    saveProject: async ({ project }) => ({
        path: `/tmp/miaoma/${project.project.id}.json`,
        project
    }),
    scanAssets: async () => assets,
    streamReport: async ({ title }, emitDelta) => {
        emitDelta(`报告-${title}-1`);
        emitDelta(`报告-${title}-2`);
        return `报告-${title}-1报告-${title}-2`;
    },
    synthesizeVoice: async () => voices,
    validateProject: async ({ project }) => {
        const result = validateVideoProject(project);
        return result.success
            ? { success: true }
            : { error: result.issues[0] ?? 'Invalid', success: false };
    }
});

const collectEvents = () => {
    const events: AgentRunEvent[] = [];
    return {
        emit: (event: AgentRunEvent) => {
            events.push(event);
        },
        events
    };
};

describe('checkpoint persistence', () => {
    it('persists state across runner restarts when using a SQLite file', async () => {
        const tmpDir = mkdtempSync(path.join(tmpdir(), 'video-agent-ckpt-'));
        const dbPath = path.join(tmpDir, 'checkpoints.db');

        try {
            // 第一次启动:跑到 scene_approval 后挂起
            const tools = createFakeTools();
            const { emit: emit1 } = collectEvents();
            const graph1 = createVideoCreationGraph({
                checkpointerDbPath: dbPath,
                emit: emit1,
                tools
            });
            const firstStart = await graph1.start(runInput);

            expect(firstStart.status).toBe('waiting_for_approval');
            expect(firstStart.approval?.type).toBe('scene-plan');

            // 模拟"进程退出 + 重启":丢弃 graph1,重新创建一个新 graph 实例
            // 用同一个 dbPath,LangGraph 通过 thread_id 自动找到上次的状态
            const { emit: emit2 } = collectEvents();
            const graph2 = createVideoCreationGraph({
                checkpointerDbPath: dbPath,
                emit: emit2,
                tools
            });

            const finalResult = await graph2.resume({
                approval: { approved: true },
                runId: runInput.runId
            });

            expect(finalResult.status).toBe('completed');
            expect(finalResult.project).toBeDefined();
            expect(validateVideoProject(finalResult.project).success).toBe(
                true
            );
        } finally {
            rmSync(tmpDir, { force: true, recursive: true });
        }
    });

    it('falls back to in-memory when no dbPath is provided', async () => {
        const tools = createFakeTools();
        const { emit } = collectEvents();
        const graph = createVideoCreationGraph({ emit, tools });
        const first = await graph.start(runInput);

        expect(first.status).toBe('waiting_for_approval');

        const final = await graph.resume({
            approval: { approved: true },
            runId: runInput.runId
        });

        expect(final.status).toBe('completed');
    });
});
