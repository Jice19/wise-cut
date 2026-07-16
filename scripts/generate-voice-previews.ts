import { existsSync } from 'node:fs';
import { mkdir } from 'node:fs/promises';
import path from 'node:path';

import {
    loadAgentEnv,
    probeAudioDuration,
    VolcengineTtsProvider
} from '../packages/video-agent/src';

import { videoAgentVoiceOptions } from '../apps/desktop/shared/video-agent-voices';

const sampleText =
    '大家好，今天我们来一起学习的是智能剪辑 Agent 开发';
const outputDirectory = path.resolve(
    'apps/desktop/renderer/assets/voice-previews'
);

const findEnvFilePath = () => {
    const candidates = [process.cwd()];
    let currentDirectory = process.cwd();

    for (let index = 0; index < 4; index += 1) {
        const parentDirectory = path.dirname(currentDirectory);

        if (parentDirectory === currentDirectory) break;

        candidates.push(parentDirectory);
        currentDirectory = parentDirectory;
    }

    for (const directory of candidates) {
        for (const fileName of ['.env.local', '.env']) {
            const filePath = path.join(directory, fileName);

            if (existsSync(filePath)) return filePath;
        }
    }

    return undefined;
};

const main = async () => {
    await mkdir(outputDirectory, { recursive: true });

    const env = loadAgentEnv({ envFilePath: findEnvFilePath() });
    const provider = new VolcengineTtsProvider({ env });

    for (const option of videoAgentVoiceOptions) {
        const outputPath = path.join(
            outputDirectory,
            option.previewAudioFileName
        );

        const result = await provider.synthesizeSpeech({
            outputPath,
            text: sampleText,
            voice: option.voiceType
        });
        const durationMs = await probeAudioDuration({
            filePath: outputPath,
            ffprobePath: 'ffprobe'
        });

        console.log(
            `${option.label} -> ${outputPath} (${Math.round(durationMs)}ms, raw ${result.durationMs}ms)`
        );
    }
};

await main();
