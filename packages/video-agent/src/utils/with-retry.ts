/* */

/**
 * 错误是否值得重试:
 * - network 错误(ECONNRESET / ETIMEDOUT / fetch failed)
 * - HTTP 5xx
 * - HTTP 429 (rate limit)
 * 不重试:
 * - HTTP 4xx 其他(客户端错误,重试也白搭)
 * - 业务/解析错误(zod 失败、返回非 JSON 等,跟网络无关)
 */
export const isRetryableError = (error: unknown): boolean => {
    if (!(error instanceof Error)) {
        return false;
    }

    // fetch 抛出的 network 错误
    if (
        error.name === 'TypeError' &&
        /fetch failed|network|aborted/i.test(error.message)
    ) {
        return true;
    }

    // node-fetch / undici 的特定错误码
    const retryableCodes = new Set([
        'ECONNRESET',
        'ECONNREFUSED',
        'ETIMEDOUT',
        'ENOTFOUND',
        'EAI_AGAIN',
        'UND_ERR_SOCKET',
        'UND_ERR_CONNECT_TIMEOUT'
    ]);
    const cause = (error as Error & { cause?: { code?: string } }).cause;
    if (cause && retryableCodes.has(cause.code ?? '')) {
        return true;
    }

    // 我们的 describeImages 抛出的 `HTTP {status}` 错误
    const httpMatch = /HTTP\s+(\d{3})/.exec(error.message);
    if (httpMatch) {
        const status = Number(httpMatch[1]);
        return status >= 500 || status === 429;
    }

    return false;
};

export type WithRetryOptions = {
    /**
     * 最大重试次数(不含首次调用)。默认 2,总共最多 3 次。
     */
    maxRetries?: number;
    /**
     * 基础退避毫秒,指数退避 2^n * baseDelay,加 0-baseDelay 随机抖动。
     * 默认 500ms:第一次重试等 ~500ms,第二次等 ~1s。
     */
    baseDelayMs?: number;
    /**
     * 哪些错误值得重试,默认用 isRetryableError。
     * 测试可注入自定义判定。
     */
    shouldRetry?: (error: unknown) => boolean;
    /**
     * 退避 + 随机因子用的随机源,默认 Math.random,测试可注入。
     */
    random?: () => number;
    /**
     * 可选:每次重试前调,用于上报 metric / 决定取消。
     * 抛错会立即终止重试。
     */
    onRetry?: (info: {
        attempt: number;
        delayMs: number;
        error: unknown;
    }) => void;
    /**
     * 异步 sleep,默认 setTimeout 包 promise。测试可注入立即 resolve。
     */
    sleep?: (ms: number) => Promise<void>;
};

const defaultSleep = (ms: number) =>
    new Promise<void>((resolve) => {
        setTimeout(resolve, ms);
    });

/**
 * 给任意可能因网络抖动失败的 async 操作加重试 + 指数退避。
 * 退避计算:baseDelay * 2^attempt + 随机抖动([0, baseDelay))。
 * 不重试 throw 出去;不重试 isRetryableError=false 的错误。
 */
export const withRetry = async <T>(
    operation: () => Promise<T>,
    {
        maxRetries = 2,
        baseDelayMs = 500,
        shouldRetry = isRetryableError,
        random = Math.random,
        onRetry,
        sleep = defaultSleep
    }: WithRetryOptions = {}
): Promise<T> => {
    let lastError: unknown;

    for (let attempt = 0; attempt <= maxRetries; attempt += 1) {
        try {
            return await operation();
        } catch (error) {
            lastError = error;

            if (attempt >= maxRetries || !shouldRetry(error)) {
                throw error;
            }

            const delayMs =
                baseDelayMs * 2 ** attempt + Math.floor(random() * baseDelayMs);

            onRetry?.({ attempt: attempt + 1, delayMs, error });
            await sleep(delayMs);
        }
    }

    // 循环里要么 return 要么 throw,这里 unreachable,但 TS 编译器要兜底
    throw lastError;
};
