/* */
import { afterEach, describe, expect, it } from 'vitest';

import {
    AgentEnvValidationError,
    loadAgentEnv
} from '../src/config/load-agent-env';

const completeEnv = {
    API_KEY: 'test-api-key',
    BASE_URL: 'https://ark.cn-beijing.volces.com/api/plan/v3',
    LLM_MODEL: 'doubao-seed-2.0-pro',
    TTS_MODEL: 'seed-tts-2.0'
};

describe('loadAgentEnv', () => {
    const originalApiKey = process.env.API_KEY;

    afterEach(() => {
        // 保留原始 API_KEY,免得污染 host 环境。
        if (originalApiKey === undefined) {
            delete process.env.API_KEY;
        } else {
            process.env.API_KEY = originalApiKey;
        }
    });

    it('returns the validated agent env from process.env', () => {
        const env = loadAgentEnv({ processEnv: completeEnv });

        expect(env).toEqual(completeEnv);
    });

    it('does not mutate process.env when reading from an injected env', () => {
        const before = process.env.API_KEY;
        loadAgentEnv({ processEnv: completeEnv });

        expect(process.env.API_KEY).toBe(before);
    });

    it('throws AgentEnvValidationError with structured issues when fields are missing', () => {
        expect(() =>
            loadAgentEnv({
                processEnv: { LLM_MODEL: 'doubao-seed-2.0-pro' }
            })
        ).toThrow(AgentEnvValidationError);

        try {
            loadAgentEnv({
                processEnv: { LLM_MODEL: 'doubao-seed-2.0-pro' }
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

    it('rejects an invalid BASE_URL (not a url)', () => {
        expect(() =>
            loadAgentEnv({
                processEnv: {
                    ...completeEnv,
                    BASE_URL: 'not-a-url'
                }
            })
        ).toThrow(AgentEnvValidationError);
    });

    it('rejects empty string fields', () => {
        expect(() =>
            loadAgentEnv({
                processEnv: { ...completeEnv, API_KEY: '' }
            })
        ).toThrow(AgentEnvValidationError);
    });
});
