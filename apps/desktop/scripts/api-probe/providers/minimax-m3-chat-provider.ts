/**
 * MiniMax-M3 多模态 chat —— Provider 封装。
 *
 * 协议:OpenAI 兼容 chat/completions。
 *   - endpoint: {baseUrl}/chat/completions
 *   - model:    MiniMax-M3(原生多模态,1M context)
 *   - 图片在 messages[].content[].image_url.url(base64 data URL 或 https URL)
 *   - 文本 / 图片混合 content:content 数组里追加多个 part
 *
 * 设计取舍:
 *   - 不引入 @langchain/openai 依赖(避免拖 LangChain 整条链),用原生 fetch
 *   - 不依赖 SSE 解析库,streamChat 用 ReadableStream + TextDecoder 手解
 *     (OpenAI SSE 协议:`data: {json}\n\n`,结束为 `data: [DONE]`),代码 ~20 行
 *   - chat() / streamChat() 同步返回纯文本,业务侧直接拿
 */

export type ChatRole = 'system' | 'user' | 'assistant';

export type ChatContentPart =
    | { type: 'text'; text: string }
    | {
          type: 'image_url';
          image_url: { detail?: 'low' | 'default' | 'high'; url: string };
      };

export type ChatMessage = {
    content: string | ChatContentPart[];
    role: ChatRole;
};

export type ChatInput = {
    messages: ChatMessage[];
    maxTokens?: number;
    temperature?: number;
};

type ChatCompletionResponse = {
    choices?: {
        finish_reason?: string;
        index: number;
        message: { content?: string; role?: string };
    }[];
    error?: { code?: string; message: string; type?: string };
    model?: string;
    usage?: {
        completion_tokens?: number;
        prompt_tokens?: number;
        total_tokens?: number;
    };
};

const DEFAULT_BASE_URL = 'https://api.minimaxi.com/v1';
const DEFAULT_MODEL = 'MiniMax-M3';
const DEFAULT_TIMEOUT_MS = 60_000;

export class MinimaxM3ChatProviderError extends Error {
    constructor(
        message: string,
        readonly options: { status?: number } = {}
    ) {
        super(message);
        this.name = 'MinimaxM3ChatProviderError';
    }
}

export type MinimaxM3ChatProviderOptions = {
    apiKey: string;
    baseUrl?: string;
    model?: string;
    timeoutMs?: number;
};

export class MinimaxM3ChatProvider {
    readonly providerName = 'minimax-m3';

    private readonly apiKey: string;
    private readonly baseUrl: string;
    private readonly model: string;
    private readonly timeoutMs: number;

    constructor({
        apiKey,
        baseUrl = DEFAULT_BASE_URL,
        model = DEFAULT_MODEL,
        timeoutMs = DEFAULT_TIMEOUT_MS
    }: MinimaxM3ChatProviderOptions) {
        if (!apiKey) {
            throw new MinimaxM3ChatProviderError(
                'MinimaxM3ChatProvider requires `apiKey`'
            );
        }
        this.apiKey = apiKey;
        this.baseUrl = baseUrl.replace(/\/$/, '');
        this.model = model;
        this.timeoutMs = timeoutMs;
    }

    /**
     * 单次 chat completion —— 返回首条 choice 的文本内容。
     * 不走 stream(便于上层 retry / 输出对齐)。
     */
    async chat({
        messages,
        maxTokens,
        temperature
    }: ChatInput): Promise<string> {
        const response = await this.fetchCompletion({
            maxTokens,
            messages,
            stream: false,
            temperature
        });

        const text = response.choices?.[0]?.message?.content ?? '';

        if (!text) {
            throw new MinimaxM3ChatProviderError(
                `Empty response from ${this.model}: ${
                    response.error?.message ?? 'no content'
                }`
            );
        }

        return text;
    }

    /**
     * 流式 chat completion —— 按 SSE chunk 回调 `onDelta`,返回完整拼接文本。
     * 用 AbortSignal + timeoutMs 保证不会无限挂起。
     */
    async streamChat(
        input: ChatInput & {
            onDelta: (delta: string) => void | Promise<void>;
        }
    ): Promise<string> {
        const { onDelta, ...rest } = input;
        const controller = new AbortController();
        const timer = setTimeout(() => controller.abort(), this.timeoutMs);

        try {
            const response = await fetch(`${this.baseUrl}/chat/completions`, {
                body: JSON.stringify({
                    max_tokens: rest.maxTokens,
                    messages: rest.messages,
                    model: this.model,
                    stream: true,
                    temperature: rest.temperature
                }),
                headers: {
                    Authorization: `Bearer ${this.apiKey}`,
                    'Content-Type': 'application/json'
                },
                method: 'POST',
                signal: controller.signal
            });

            if (!response.ok || !response.body) {
                const body = await response.text();
                throw new MinimaxM3ChatProviderError(
                    `M3 stream ${response.status}: ${body.slice(0, 500)}`,
                    { status: response.status }
                );
            }

            const reader = response.body.getReader();
            const decoder = new TextDecoder();
            let buffer = '';
            const pieces: string[] = [];

            while (true) {
                const { done, value } = await reader.read();

                if (done) break;

                buffer += decoder.decode(value, { stream: true });

                let sepIndex = buffer.indexOf('\n\n');

                while (sepIndex >= 0) {
                    const event = buffer.slice(0, sepIndex);
                    buffer = buffer.slice(sepIndex + 2);

                    const delta = parseSseDelta(event);

                    if (delta) {
                        pieces.push(delta);
                        await onDelta(delta);
                    }

                    sepIndex = buffer.indexOf('\n\n');
                }
            }

            return pieces.join('');
        } catch (error) {
            if (error instanceof MinimaxM3ChatProviderError) {
                throw error;
            }

            throw new MinimaxM3ChatProviderError(
                error instanceof Error ? error.message : String(error)
            );
        } finally {
            clearTimeout(timer);
        }
    }

    private async fetchCompletion({
        maxTokens,
        messages,
        stream,
        temperature
    }: ChatInput & { stream: boolean }): Promise<ChatCompletionResponse> {
        const controller = new AbortController();
        const timer = setTimeout(() => controller.abort(), this.timeoutMs);

        try {
            const response = await fetch(`${this.baseUrl}/chat/completions`, {
                body: JSON.stringify({
                    max_tokens: maxTokens,
                    messages,
                    model: this.model,
                    stream,
                    temperature
                }),
                headers: {
                    Authorization: `Bearer ${this.apiKey}`,
                    'Content-Type': 'application/json'
                },
                method: 'POST',
                signal: controller.signal
            });

            const text = await response.text();

            if (!response.ok) {
                throw new MinimaxM3ChatProviderError(
                    `M3 chat completions ${response.status}: ${text.slice(
                        0,
                        500
                    )}`,
                    { status: response.status }
                );
            }

            return JSON.parse(text) as ChatCompletionResponse;
        } finally {
            clearTimeout(timer);
        }
    }
}

const parseSseDelta = (event: string): string => {
    for (const line of event.split('\n')) {
        if (!line.startsWith('data:')) continue;
        const payload = line.slice(5).trim();

        if (payload === '[DONE]') return '';

        try {
            const json = JSON.parse(payload) as {
                choices?: {
                    delta?: { content?: string | null };
                }[];
            };
            const delta = json.choices?.[0]?.delta?.content;

            if (typeof delta === 'string' && delta.length > 0) {
                return delta;
            }
        } catch {
            /* ignore malformed chunk, keep reading */
        }
    }

    return '';
};
