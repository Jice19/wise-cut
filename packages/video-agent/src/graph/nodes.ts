/**
 * LangGraph 节点工厂 —— commit 6 聚焦版,只有 scan_assets + analyze_assets 两个节点。
 * 其它 8 个节点 (creative_brief / plan_scenes / scene_approval /
 * match_assets / synthesize_voice / assemble_timeline / validate_project /
 * save_project) 留 commit 6.5 补。
 *
 * 每个 node 接受 (state, config),config 里可拿 runtime(emit + checkpoint)
 * 工具。每个 node 自己负责 emit node.started / node.completed / node.failed
 * 事件,异常抛 GraphBubbleUp 让 LangGraph 自动捕获并 stop graph。
 */

import { readdir } from 'node:fs/promises';
import { extname, join } from 'node:path';

import type { AssetAnalysis } from '@miaoma-magicut/video-project';

import type { NodeRuntime } from './node-runtime.ts';
import type { VideoCreationInput, VideoCreationStateType } from './state.ts';
import {
    analyzeAssets,
    type AnalyzeAssetsInput
} from './steps/analyze-assets.ts';

/**
 * 媒体文件后缀白名单 —— commit 6 阶段简单按后缀过滤。
 */
const VIDEO_EXTENSIONS = new Set(['.mp4', '.mov', '.mkv', '.webm', '.avi']);

const isVideoFile = (filename: string): boolean =>
    VIDEO_EXTENSIONS.has(extname(filename).toLowerCase());

/**
 * scan_assets —— 扫目录,产出 assetId+filePath 骨架(完整元数据由 analyze_assets 填)。
 */
export const scanAssetsNode = async (
    state: VideoCreationStateType,
    runtime: NodeRuntime
): Promise<Partial<VideoCreationStateType>> => {
    runtime.emit({
        type: 'node.started',
        nodeName: 'scan_assets',
        nodeLabel: '扫描素材'
    });

    const start = Date.now();

    const input: VideoCreationInput = state.input;
    const directory = input.sourceAssetDirectory;

    const entries = await readdir(directory, { withFileTypes: true });
    const videoFiles = entries
        .filter((e) => e.isFile() && isVideoFile(e.name))
        .map((e) => e.name)
        .sort();

    const skeleton: AssetAnalysis[] = videoFiles.map((name, idx) => ({
        assetId: `${input.runId}-asset-${idx + 1}`,
        description: '',
        durationMs: 0,
        filePath: join(directory, name),
        fps: 0,
        frames: [],
        height: 0,
        width: 0
    }));

    runtime.emit({
        type: 'node.completed',
        durationMs: Date.now() - start,
        nodeName: 'scan_assets'
    });

    return { assets: skeleton };
};

/**
 * analyze_assets —— 调 analyzeAssets 纯函数填充每个 asset 的真实元数据 +
 * 帧描述(M3 multimodal)。
 *
 * 需要的运行时依赖从 runtime 拿(ffmpeg / ffprobe / frameOutputDirectory /
 * modelProvider / tools)。
 */
export const analyzeAssetsNode = async (
    state: VideoCreationStateType,
    runtime: NodeRuntime
): Promise<Partial<VideoCreationStateType>> => {
    runtime.emit({
        type: 'node.started',
        nodeName: 'analyze_assets',
        nodeLabel: 'AI 理解画面'
    });

    const start = Date.now();

    const input: AnalyzeAssetsInput = {
        assets: state.assets.map((a) => ({
            assetId: a.assetId,
            filePath: a.filePath
        })),
        ffmpegPath: runtime.ffmpegPath,
        ffprobePath: runtime.ffprobePath,
        frameOutputDirectory: runtime.frameOutputDirectory,
        modelProvider: runtime.modelProvider,
        tools: runtime.tools
    };

    try {
        const enriched = await analyzeAssets(input);

        runtime.emit({
            type: 'node.completed',
            durationMs: Date.now() - start,
            nodeName: 'analyze_assets'
        });

        return { assets: enriched };
    } catch (error) {
        runtime.emit({
            type: 'node.failed',
            error: (error as Error).message,
            nodeName: 'analyze_assets'
        });
        throw error;
    }
};
