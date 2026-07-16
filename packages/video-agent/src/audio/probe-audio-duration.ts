/* */
import { execFile as execFileCallback } from 'node:child_process';
import { promisify } from 'node:util';

const execFileAsync = promisify(execFileCallback);

type ExecFileResult = {
    stderr: string;
    stdout: string;
};

type ExecFile = (file: string, args: string[]) => Promise<ExecFileResult>;

type FfprobeAudioOutput = {
    format?: {
        duration?: string;
    };
};

export const probeAudioDuration = async ({
    execFile = execFileAsync,
    ffprobePath,
    filePath
}: {
    execFile?: ExecFile;
    ffprobePath: string;
    filePath: string;
}): Promise<number> => {
    const { stdout } = await execFile(ffprobePath, [
        '-v',
        'error',
        '-print_format',
        'json',
        '-show_format',
        filePath
    ]);
    const output = JSON.parse(stdout) as FfprobeAudioOutput;
    const seconds = Number(output.format?.duration);

    if (!Number.isFinite(seconds)) {
        throw new Error(`Audio duration is missing in ${filePath}`);
    }

    return Math.round(seconds * 1000);
};
