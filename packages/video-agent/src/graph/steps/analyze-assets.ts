/**
 * analyze-assets 步骤 —— 把每个视频素材的真实元数据 + 帧描述写到 AssetAnalysis。
 *
 * 流程(plan §2.5):
 *   1. probeMedia → 真实 width/height/fps/durationMs/hasAudio
 *   2. extractKeyframes → 抽帧 jpg + 真实 timestampMs
 *   3. 读每帧 jpg 为 base64 data URL(走 VideoAgentTools)
 *   4. modelProvider.describeFrames → 中文画面描述
 *   5. 用 frame.timestampMs 对齐 LLM 描述,写到 AssetAnalysis.frames
 *
 * 失败策略(plan §2.5):
 *   - 任意一个 asset 失败 → 该 asset frames: [] 但不抛错,允许 pipeline 继续
 *   - audio-only 文件(NoVideoStreamError)同样 frames: []
 */

import { readFile } from 'node:fs/promises';

import {
    type AssetAnalysis,
    AssetAnalysisSchema
} from '../../../../video-project/src/index.ts';
import {
    extractKeyframes,
    ExtractKeyframesError
} from '../../media/extract-keyframes.ts';
import {
    NoVideoStreamError,
    probeMedia,
    ProbeMediaError
} from '../../media/probe-media.ts';
import type { ModelProvider } from '../../providers/model-provider.ts';
import type { VideoAgentTools } from '../../tools/video-agent-tools.ts';

export type AnalyzeAssetsInput = {
    /**
     * 上游 scanAssets 产出的素材列表(已有 assetId / filePath)。
     * 元数据 / 描述此时尚未填充。
     */
    assets: readonly { assetId: string; filePath: string }[];

    /**
     * 抽帧参数(plan §2.5 默认值)。
     */
    extractKeyframesOptions?: {
        maxFrames?: number;
        sampleIntervalSec?: number;
    };

    ffmpegPath: string;
    ffprobePath: string;
    frameOutputDirectory: string;
    modelProvider: ModelProvider;
    tools: VideoAgentTools;
};

/**
 * 单个 asset 失败时,产出一个"空描述"的 AssetAnalysis,让 pipeline 继续。
 */
const buildDegradedAssetAnalysis = (input: {
    assetId: string;
    filePath: string;
    reason: string;
}): AssetAnalysis =>
    AssetAnalysisSchema.parse({
        assetId: input.assetId,
        description: '',
        durationMs: 0,
        filePath: input.filePath,
        fps: 0,
        frames: [],
        height: 0,
        width: 0
    });

export const analyzeAssets = async (
    input: AnalyzeAssetsInput
): Promise<AssetAnalysis[]> => {
    const sampleIntervalSec =
        input.extractKeyframesOptions?.sampleIntervalSec ?? 2;
    const maxFrames = input.extractKeyframesOptions?.maxFrames ?? 6;

    const results: AssetAnalysis[] = [];

    for (const asset of input.assets) {
        try {
            const metadata = await probeMedia({
                ffprobePath: input.ffprobePath,
                filePath: asset.filePath
            });

            const keyframes = await extractKeyframes({
                ffmpegPath: input.ffmpegPath,
                filePath: asset.filePath,
                maxFrames,
                outputDirectory: input.frameOutputDirectory,
                sampleIntervalSec
            });

            // 抽帧失败但 probe 成功,降级
            if (keyframes.length === 0) {
                results.push(
                    buildDegradedAssetAnalysis({
                        assetId: asset.assetId,
                        filePath: asset.filePath,
                        reason: 'no keyframes extracted'
                    })
                );
                continue;
            }

            // 读每帧 jpg 为 base64 → 调 M3 → 写回 frame.timestampMs 对齐
            const framesForLlm = await Promise.all(
                keyframes.map(async (kf, idx) => {
                    const base64 = await input.tools.readImageAsBase64DataUrl({
                        mimeType: 'image/jpeg',
                        path: kf.path
                    });
                    const fallbackFrameId = `${asset.assetId}-f${String(idx + 1).padStart(3, '0')}`;
                    const frameId =
                        kf.index !== undefined
                            ? `${asset.assetId}-${kf.index}`
                            : fallbackFrameId;

                    return { base64DataUrl: base64, frameId };
                })
            );

            const descriptions = await input.modelProvider.describeFrames({
                frames: framesForLlm.map((f) => ({
                    base64DataUrl: f.base64DataUrl,
                    frameId: f.frameId,
                    mimeType: 'image/jpeg'
                }))
            });

            const alignedFrames = descriptions.map((desc, idx) => {
                const matchedTimestamp = keyframes[idx]?.timestampMs ?? 0;

                return {
                    description: desc.description,
                    frameId: desc.frameId,
                    mood: desc.mood,
                    objects: desc.objects,
                    timestampMs: matchedTimestamp
                };
            });

            const firstDescription = alignedFrames[0]?.description ?? '';

            results.push(
                AssetAnalysisSchema.parse({
                    assetId: asset.assetId,
                    description: firstDescription,
                    durationMs: metadata.durationMs,
                    filePath: asset.filePath,
                    fps: metadata.fps,
                    frames: alignedFrames,
                    height: metadata.height,
                    width: metadata.width
                })
            );
        } catch (error) {
            // 区分业务错:NoVideoStreamError / ExtractKeyframesError / ProbeMediaError
            // 全部降级处理,不打断流水线
            const reason =
                error instanceof NoVideoStreamError
                    ? 'audio-only file'
                    : error instanceof ExtractKeyframesError
                      ? 'extract failed'
                      : error instanceof ProbeMediaError
                        ? 'probe failed'
                        : 'unknown error';

            // 仅在开发环境 console.error 一次,生产静默
            // eslint-disable-next-line no-console
            console.error(
                `[analyze-assets] degrade ${asset.assetId}: ${reason}`
            );

            results.push(
                buildDegradedAssetAnalysis({
                    assetId: asset.assetId,
                    filePath: asset.filePath,
                    reason
                })
            );
        }
    }

    return results;
};

/**
 * 默认的 VideoAgentTools 实现 —— 仅依赖 Node fs,跑在主进程或 vitest 都行。
 * 主进程端可以包一层,加 path 白名单 / 错误聚合,这里给最简版。
 *
 * writeMp3 / writeProject 在 commit 6.5 阶段 stub 化(只写占位文件),
 * 真正接 TTS provider / video-project-store 留 commit 9+ 整合。
 */
export const createFsVideoAgentTools = (): VideoAgentTools => ({
    async readImageAsBase64DataUrl({ mimeType = 'image/jpeg', path }) {
        const bytes = await readFile(path);
        return `data:${mimeType};base64,${bytes.toString('base64')}`;
    },
    async writeMp3({ audioFilePath, narration, voiceId }) {
        // commit 6.5 stub:写一个 JSON 占位文件,真 TTS 留 commit 9 接 volcengine
        const { writeFile, mkdir } = await import('node:fs/promises');
        const { dirname } = await import('node:path');
        await mkdir(dirname(audioFilePath), { recursive: true });
        await writeFile(
            audioFilePath,
            JSON.stringify({ narration, voiceId, stub: true }, null, 2),
            'utf-8'
        );
    },
    async writeProject({ outputDir, projectId, projectJson }) {
        const { mkdir, writeFile } = await import('node:fs/promises');
        const { join } = await import('node:path');
        await mkdir(outputDir, { recursive: true });
        const filePath = join(outputDir, `${projectId}.json`);
        await writeFile(
            filePath,
            JSON.stringify(projectJson, null, 2),
            'utf-8'
        );
        return filePath;
    }
});
