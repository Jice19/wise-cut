/* */
import { mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import {
    AgentEnvValidationError,
    loadAgentEnv
} from '../src/config/load-agent-env';

describe('loadAgentEnv', () => {
    let tempDirectory: string;

    beforeEach(async () => {
        tempDirectory = await mkdtemp(path.join(tmpdir(), 'app-env-'));
    });

    afterEach(async () => {
        await rm(tempDirectory, { force: true, recursive: true });
    });

    it('loads model provider settings from dotenv without mutating process env', async () => {
        const envFilePath = path.join(tempDirectory, '.env.local');
        await writeFile(
            envFilePath,
            [
                'LLM_MODEL=doubao-seed-2.0-pro',
                'TTS_MODEL=seed-tts-2.0',
                'BASE_URL=https://ark.cn-beijing.volces.com/api/plan/v3',
                'API_KEY=test-api-key'
            ].join('\n')
        );

        const env = loadAgentEnv({
            envFilePath,
            processEnv: {}
        });

        expect(env).toEqual({
            API_KEY: 'test-api-key',
            BASE_URL: 'https://ark.cn-beijing.volces.com/api/plan/v3',
            LLM_MODEL: 'doubao-seed-2.0-pro',
            TTS_MODEL: 'seed-tts-2.0'
        });
        expect(process.env.API_KEY).not.toBe('test-api-key');
    });

    it('returns a structured configuration error for missing required settings', () => {
        expect(() =>
            loadAgentEnv({
                processEnv: {
                    LLM_MODEL: 'doubao-seed-2.0-pro'
                }
            })
        ).toThrow(AgentEnvValidationError);

        try {
            loadAgentEnv({
                processEnv: {
                    LLM_MODEL: 'doubao-seed-2.0-pro'
                }
            });
        } catch (error) {
            expect(error).toBeInstanceOf(AgentEnvValidationError);
            expect((error as AgentEnvValidationError).issues).toEqual([
                {
                    field: 'TTS_MODEL',
                    message:
                        'Invalid input: expected string, received undefined'
                },
                {
                    field: 'BASE_URL',
                    message:
                        'Invalid input: expected string, received undefined'
                },
                {
                    field: 'API_KEY',
                    message:
                        'Invalid input: expected string, received undefined'
                }
            ]);
        }
    });
});
