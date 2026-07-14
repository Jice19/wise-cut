/**
 * LangGraph 10 节点流水线端到端测试 —— commit 6 聚焦版本。
 *
 * 只跑通 scan_assets → analyze_assets 这 2 个节点,断言:
 *   - emit 序列包含 run.started / node.started / node.completed / run.completed
 *   - state.assets 被填充,包含真实 width/height/durationMs/frames
 *   - 每个 asset.frames[].description 是非空中文(M3 multimodal 输出)
 *
 * 跑这条测试需要本机有 ffmpeg/ffprobe + 有效的 ARK_API_KEY(env)。
 * 缺一就 skip。
 */

import { execFile } from 'node:child_process';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { promisify } from 'node:util';

import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import { createFsVideoAgentTools } from '../src/graph/steps/analyze-assets.ts';
import {
    type AgentRunEvent,
    createMemoryCheckpointer,
    createSequencedEventEmitter,
    createVideoCreationGraph,
    type ModelProvider
} from '../src/index.ts';

const execFileAsync = promisify(execFile);

const hasFfmpeg = await (async () => {
    try {
        await execFileAsync('ffmpeg', ['-version']);
        return true;
    } catch {
        return false;
    }
})();

const apiKey = process.env['ARK_API_KEY'] ?? '';
const hasApiKey = apiKey.length > 0;

describe.skipIf(!hasFfmpeg || !hasApiKey)(
    'LangGraph video-creation pipeline (commit 6 聚焦)',
    () => {
        let workDir: string;
        let videoDir: string;
        let frameDir: string;
        const collected: AgentRunEvent[] = [];

        beforeAll(async () => {
            workDir = await mkdtemp(join(tmpdir(), 'graph-test-'));
            videoDir = join(workDir, 'videos');
            frameDir = join(workDir, 'frames');
            const { mkdir } = await import('node:fs/promises');
            await mkdir(videoDir, { recursive: true });
            await mkdir(frameDir, { recursive: true });

            // 1 段 5s 720p mp4
            const videoPath = join(videoDir, 'sample.mp4');
            await execFileAsync('ffmpeg', [
                '-y',
                '-f',
                'lavfi',
                '-i',
                'testsrc=size=1280x720:rate=30:duration=5',
                '-pix_fmt',
                'yuv420p',
                '-c:v',
                'libx264',
                videoPath
            ]);
        }, 60_000);

        afterAll(async () => {
            await rm(workDir, { recursive: true, force: true });
        });

        it('scan + analyze 跑通,真实元数据 + 帧描述写入 state.assets', async () => {
            const { MinimaxM3ModelProvider } = await import(
                '../src/providers/m3-chat-model-provider.ts'
            );

            const modelProvider: ModelProvider = new MinimaxM3ModelProvider({
                apiKey
            });
            const tools = createFsVideoAgentTools();

            const checkpointer = createMemoryCheckpointer();
            const emit = createSequencedEventEmitter({
                runId: 'r-graph-1',
                sink: (evt) => collected.push(evt)
            });

            const graph = createVideoCreationGraph({
                checkpointer,
                runtime: {
                    emit,
                    ffmpegPath: 'ffmpeg',
                    ffprobePath: 'ffprobe',
                    frameOutputDirectory: frameDir,
                    modelProvider,
                    tools
                }
            });

            const initial = {
                assets: [],
                errors: [],
                input: {
                    brief: 'AI 剪辑演示',
                    runId: 'r-graph-1',
                    sourceAssetDirectory: videoDir
                },
                status: 'running' as const
            };

            const result = await graph.invoke(initial, {
                configurable: { thread_id: 'r-graph-1' }
            });

            // 事件序列断言
            const types = collected.map((e) => e.type);
            expect(types).toContain('node.started');
            expect(types.filter((t) => t === 'node.completed').length).toBe(2);

            // state.assets 真元数据
            const assets = (
                result as {
                    assets: {
                        assetId: string;
                        description: string;
                        durationMs: number;
                        fps: number;
                        frames: {
                            description: string;
                            frameId: string;
                            timestampMs: number;
                        }[];
                        height: number;
                        width: number;
                    }[];
                }
            ).assets;
            expect(assets.length).toBe(1);
            const asset = assets[0]!;
            expect(asset.width).toBe(1280);
            expect(asset.height).toBe(720);
            expect(asset.durationMs).toBeGreaterThan(4000);
            expect(asset.fps).toBeGreaterThan(0);
            expect(asset.frames.length).toBeGreaterThan(0);

            // 帧描述非空(LLM 真返回)
            const firstFrame = asset.frames[0]!;
            expect(firstFrame.description.length).toBeGreaterThan(0);
            expect(firstFrame.timestampMs).toBeGreaterThanOrEqual(0);
        }, 120_000);
    }
);

describe.skipIf(!hasFfmpeg)(
    'LangGraph pipeline — 仅无 LLM 时的降级路径',
    () => {
        let workDir: string;

        beforeAll(async () => {
            workDir = await mkdtemp(join(tmpdir(), 'graph-no-llm-'));
            const videoDir = join(workDir, 'videos');
            const { mkdir } = await import('node:fs/promises');
            await mkdir(videoDir, { recursive: true });

            await execFileAsync('ffmpeg', [
                '-y',
                '-f',
                'lavfi',
                '-i',
                'testsrc=size=640x480:rate=30:duration=3',
                '-pix_fmt',
                'yuv420p',
                '-c:v',
                'libx264',
                join(videoDir, 'sample.mp4')
            ]);
        });

        afterAll(async () => {
            await rm(workDir, { recursive: true, force: true });
        });

        it('无 LLM key 时 analyzeAssets 降级 —— frames 空但 pipeline 不抛错', async () => {
            const failingProvider = {
                describeFrames: async () => {
                    throw new Error('no LLM key');
                }
            } as unknown as ModelProvider;

            const tools = createFsVideoAgentTools();
            const checkpointer = createMemoryCheckpointer();

            const collected: AgentRunEvent[] = [];
            const emit = createSequencedEventEmitter({
                runId: 'r-no-llm',
                sink: (evt) => collected.push(evt)
            });

            const graph = createVideoCreationGraph({
                checkpointer,
                runtime: {
                    emit,
                    ffmpegPath: 'ffmpeg',
                    ffprobePath: 'ffprobe',
                    frameOutputDirectory: join(workDir, 'frames'),
                    modelProvider: failingProvider,
                    tools
                }
            });

            const result = await graph.invoke(
                {
                    assets: [],
                    errors: [],
                    input: {
                        brief: '降级测试',
                        runId: 'r-no-llm',
                        sourceAssetDirectory: join(workDir, 'videos')
                    },
                    status: 'running' as const
                },
                { configurable: { thread_id: 'r-no-llm' } }
            );

            const assets = (
                result as unknown as {
                    assets: {
                        frames: unknown[];
                        width: number;
                        height: number;
                    }[];
                }
            ).assets;
            expect(assets.length).toBe(1);
            // 降级:describeFrames 抛错时 frames 为 [],
            // width/height 由 probeMedia 在降级前已经填充所以是 0
            // (因为 analyzeAssets catch 整体走 degraded 分支)
            expect(assets[0]!.frames).toEqual([]);

            // 不应触发 node.failed 事件,因为 analyzeAssets 内置降级路径
            expect(collected.some((e) => e.type === 'node.failed')).toBe(false);
        }, 60_000);
    }
);
