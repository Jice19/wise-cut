
import path from 'node:path';

export type VideoExportBinaryPlatform = typeof process.platform;

export type ResolveVideoExportBinariesInput = {
    appPath: string;
    isPackaged: boolean;
    platform: VideoExportBinaryPlatform;
    resourcesPath: string;
};

export type VideoExportBinaries = {
    ffmpegPath: string;
    ffprobePath: string;
};

const supportedPlatforms = new Set<VideoExportBinaryPlatform>([
    'darwin',
    'linux',
    'win32'
]);

const toExecutableName = ({
    name,
    platform
}: {
    name: 'ffmpeg' | 'ffprobe';
    platform: VideoExportBinaryPlatform;
}) => (platform === 'win32' ? `${name}.exe` : name);

export const resolveVideoExportBinDirectory = ({
    appPath,
    isPackaged,
    platform,
    resourcesPath
}: ResolveVideoExportBinariesInput) => {
    if (!supportedPlatforms.has(platform)) {
        throw new Error(`Unsupported FFmpeg platform: ${platform}`);
    }

    return path.join(isPackaged ? resourcesPath : appPath, 'bin', platform);
};

export const resolveVideoExportBinaries = (
    input: ResolveVideoExportBinariesInput
): VideoExportBinaries => {
    const binDirectory = resolveVideoExportBinDirectory(input);

    return {
        ffmpegPath: path.join(
            binDirectory,
            toExecutableName({
                name: 'ffmpeg',
                platform: input.platform
            })
        ),
        ffprobePath: path.join(
            binDirectory,
            toExecutableName({
                name: 'ffprobe',
                platform: input.platform
            })
        )
    };
};
