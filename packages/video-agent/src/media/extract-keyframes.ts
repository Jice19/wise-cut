/* */
import { execFile } from 'node:child_process';
import { mkdir, readdir } from 'node:fs/promises';
import path from 'node:path';
import { promisify } from 'node:util';

const execFileAsync = promisify(execFile);

export type ExtractedKeyframe = {
    index: number;
    path: string;
    timestampMs: number;
};

export const extractKeyframes = async ({
    ffmpegPath,
    filePath,
    frameCount,
    outputDirectory
}: {
    ffmpegPath: string;
    filePath: string;
    frameCount: number;
    outputDirectory: string;
}): Promise<ExtractedKeyframe[]> => {
    if (frameCount < 1) {
        throw new Error('frameCount must be greater than 0');
    }

    await mkdir(outputDirectory, { recursive: true });

    await execFileAsync(ffmpegPath, [
        '-hide_banner',
        '-loglevel',
        'error',
        '-i',
        filePath,
        '-frames:v',
        String(frameCount),
        '-q:v',
        '2',
        '-y',
        path.join(outputDirectory, 'keyframe-%03d.jpg')
    ]);

    const generatedFiles = (await readdir(outputDirectory))
        .filter((fileName) => fileName.startsWith('keyframe-'))
        .sort();

    return generatedFiles.map((fileName, index) => ({
        index: index + 1,
        path: path.join(outputDirectory, fileName),
        timestampMs: 0
    }));
};
