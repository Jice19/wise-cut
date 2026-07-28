/* */
import { describe, expect, it } from 'vitest';

import { isRetryableError, withRetry } from '../src/utils/with-retry';

describe('isRetryableError', () => {
    it('retries on fetch network errors', () => {
        expect(isRetryableError(new TypeError('fetch failed'))).toBe(true);
    });

    it('retries on HTTP 5xx', () => {
        expect(isRetryableError(new Error('HTTP 500: server error'))).toBe(
            true
        );
        expect(isRetryableError(new Error('HTTP 502: bad gateway'))).toBe(true);
        expect(isRetryableError(new Error('HTTP 503: unavailable'))).toBe(true);
    });

    it('retries on HTTP 429 (rate limit)', () => {
        expect(isRetryableError(new Error('HTTP 429: too many requests'))).toBe(
            true
        );
    });

    it('does not retry on HTTP 4xx (client error)', () => {
        expect(isRetryableError(new Error('HTTP 400: bad request'))).toBe(
            false
        );
        expect(isRetryableError(new Error('HTTP 401: unauthorized'))).toBe(
            false
        );
        expect(isRetryableError(new Error('HTTP 404: not found'))).toBe(false);
    });

    it('does not retry on Zod / business errors', () => {
        expect(isRetryableError(new Error('Invalid input'))).toBe(false);
        expect(isRetryableError(new Error('Schema validation failed'))).toBe(
            false
        );
    });

    it('retries on ECONNRESET-style errors', () => {
        const error = new Error('connect ECONNRESET') as Error & {
            cause?: { code: string };
        };
        error.cause = { code: 'ECONNRESET' };
        expect(isRetryableError(error)).toBe(true);
    });

    it('does not retry on non-Error values', () => {
        expect(isRetryableError('plain string')).toBe(false);
        expect(isRetryableError(null)).toBe(false);
        expect(isRetryableError(undefined)).toBe(false);
    });
});

describe('withRetry', () => {
    it('returns immediately on success', async () => {
        let calls = 0;
        const result = await withRetry(async () => {
            calls += 1;
            return 'ok';
        });
        expect(result).toBe('ok');
        expect(calls).toBe(1);
    });

    it('retries until success', async () => {
        let calls = 0;
        const result = await withRetry(
            async () => {
                calls += 1;
                if (calls < 3) {
                    throw new TypeError('fetch failed');
                }
                return 'ok';
            },
            { maxRetries: 5, baseDelayMs: 0, random: () => 0 }
        );
        expect(result).toBe('ok');
        expect(calls).toBe(3);
    });

    it('stops after maxRetries and throws the last error', async () => {
        let calls = 0;
        const lastError = new TypeError('fetch failed');
        let caught: unknown;

        try {
            await withRetry(
                async () => {
                    calls += 1;
                    throw lastError;
                },
                { maxRetries: 2, baseDelayMs: 0, random: () => 0 }
            );
        } catch (error) {
            caught = error;
        }

        expect(calls).toBe(3); // 1 + 2 retries
        expect(caught).toBe(lastError);
    });

    it('does not retry on non-retryable errors', async () => {
        let calls = 0;
        try {
            await withRetry(
                async () => {
                    calls += 1;
                    throw new Error('Invalid input');
                },
                { maxRetries: 5, baseDelayMs: 0, random: () => 0 }
            );
        } catch {
            // expected
        }
        expect(calls).toBe(1);
    });

    it('calls onRetry with attempt and delay info', async () => {
        const retries: Array<{ attempt: number; delayMs: number }> = [];
        let calls = 0;

        try {
            await withRetry(
                async () => {
                    calls += 1;
                    throw new TypeError('fetch failed');
                },
                {
                    maxRetries: 2,
                    baseDelayMs: 100,
                    random: () => 0,
                    sleep: async () => {
                        // 不真的睡,测试快
                    },
                    onRetry: (info) => {
                        retries.push({
                            attempt: info.attempt,
                            delayMs: info.delayMs
                        });
                    }
                }
            );
        } catch {
            // expected
        }

        expect(retries).toHaveLength(2);
        expect(retries[0]).toEqual({ attempt: 1, delayMs: 100 }); // 100 * 2^0 + 0
        expect(retries[1]).toEqual({ attempt: 2, delayMs: 200 }); // 100 * 2^1 + 0
    });
});
