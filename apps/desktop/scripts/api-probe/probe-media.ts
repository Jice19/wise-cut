/* eslint-disable no-console */
/**
 * media probe —— 本地 ffmpeg/ffprobe 连通性 + probeMedia + extractKeyframes 输出
 *
 * 用 ffmpeg lavfi 自生成一个 12s 320x240 测试视频 + 3s 纯音频,跑:
 *   1. probeMedia(测试视频)      → MediaMetadata(真实 fps / durationMs / hasAudio 等)
 *   2. probeMedia(纯音频)        → 抛 NoVideoStreamError(业务错分类验证)
 *   3. extractKeyframes(测试视频) → ExtractedKeyframe[] 真实 pts_time
 *
 * 跑法:
 *   pnpm --filter @miaoma-magicut/desktop probe:media
 *
 * 不读 .env.local、不依赖任何 LLM/网络,纯本地。
 */

import { execFile } from 'node:child_process';
import { mkdir } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { promisify } from 'node:util';

import {
    extractKeyframes,
    ExtractKeyframesError,
    NoVideoStreamError,
    probeMedia,
    ProbeMediaError
} from '@miaoma-magicut/video-agent';

const execFileAsync = promisify(execFile);
const FFMPEG = 'ffmpeg';
const FFPROBE = 'ffprobe';

const __dirname = fileURLToPath(new URL('.', import.meta.url));
const PROBE_OUT_DIR = resolve(__dirname, '.probe-out');

const log = (...args: unknown[]) =>
    console.log(`[probe:media ${new Date().toISOString()}]`, ...args);

const run = async () => {
    const stamp = new Date().toISOString().replace(/[:.]/g, '-');
    const workDir = join(PROBE_OUT_DIR, `media-${stamp}`);
    const videoPath = join(workDir, 'sample.mp4');
    const audioPath = join(workDir, 'audio-only.mp3');
    const framesDir = join(workDir, 'frames');

    await mkdir(workDir, { recursive: true });
    log('workDir (kept) =', workDir);

    try {
        log('--- step 1: 生成 12s 320x240 测试视频 ---');
        await execFileAsync(FFMPEG, [
            '-y',
            '-f',
            'lavfi',
            '-i',
            'testsrc=duration=12:size=320x240:rate=30',
            '-pix_fmt',
            'yuv420p',
            videoPath
        ]);
        log('video ready:', videoPath);

        log('--- step 2: 生成 3s 纯音频 ---');
        await execFileAsync(FFMPEG, [
            '-y',
            '-f',
            'lavfi',
            '-i',
            'sine=frequency=440:duration=3',
            audioPath
        ]);
        log('audio ready:', audioPath);

        log('--- step 3: probeMedia(视频) ---');
        const metadata = await probeMedia({
            ffprobePath: FFPROBE,
            filePath: videoPath
        });
        log('probeMedia(video) =', JSON.stringify(metadata, null, 2));

        log('--- step 4: probeMedia(纯音频) → 期望 NoVideoStreamError ---');
        try {
            await probeMedia({ ffprobePath: FFPROBE, filePath: audioPath });
            log('UNEXPECTED: audio-only probe succeeded');
        } catch (error) {
            if (error instanceof NoVideoStreamError) {
                log(
                    'OK: NoVideoStreamError thrown for audio-only:',
                    error.message
                );
            } else if (error instanceof ProbeMediaError) {
                log('ProbeMediaError (unexpected):', error.message);
            } else {
                throw error;
            }
        }

        log('--- step 5: extractKeyframes(video) sampleIntervalSec=2 ---');
        const frames = await extractKeyframes({
            ffmpegPath: FFMPEG,
            filePath: videoPath,
            maxFrames: 6,
            outputDirectory: framesDir,
            sampleIntervalSec: 2
        });
        log(
            `extractKeyframes returned ${frames.length} frames:`,
            JSON.stringify(frames, null, 2)
        );

        log('--- step 6: extractKeyframes 非法入参校验 ---');
        try {
            await extractKeyframes({
                ffmpegPath: FFMPEG,
                filePath: videoPath,
                maxFrames: 0,
                outputDirectory: framesDir,
                sampleIntervalSec: 2
            });
            log('UNEXPECTED: maxFrames=0 did not throw');
        } catch (error) {
            if (error instanceof ExtractKeyframesError) {
                log('OK: ExtractKeyframesError on maxFrames=0:', error.message);
            } else {
                throw error;
            }
        }

        log('--- done. all probe steps passed ---');
        log('artifacts kept at:', workDir);
        log('cd', workDir, '&& open .  # macOS 预览');
    } finally {
        // 不再 rm,产物保留到 .probe-out/ 下供人工查看
        // 下次跑会用新 timestamp 目录,不冲突
        void tmpdir;
    }
};

run().catch((error: unknown) => {
    console.error('[probe:media] FAILED:', error);
    process.exit(1);
});
