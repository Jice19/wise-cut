/* */
import { z } from 'zod';

const AgentEnvSchema = z.object({
    LLM_MODEL: z.string().min(1),
    TTS_MODEL: z.string().min(1),
    BASE_URL: z.string().url(),
    API_KEY: z.string().min(1)
});

export type AgentEnv = z.infer<typeof AgentEnvSchema>;

export type AgentEnvIssue = {
    field: string;
    message: string;
};

type EnvironmentValues = Record<string, string | undefined>;

export class AgentEnvValidationError extends Error {
    public readonly issues: AgentEnvIssue[];

    constructor(issues: AgentEnvIssue[]) {
        super('Invalid video agent environment configuration');
        this.name = 'AgentEnvValidationError';
        this.issues = issues;
    }
}

/**
 * 从 process.env 里读 video agent 需要的 4 个环境变量(LLM_MODEL /
 * TTS_MODEL / BASE_URL / API_KEY),schema 校验后返回。
 *
 * 之前还支持读 .env 文件,现在弃用 — 配置改由 Electron 主进程从
 * safeStorage 加密配置里读出来,在调本函数之前注入 process.env。
 * 这样 .env 文件不再是 single source of truth,UI 配置说了算。
 */
export const loadAgentEnv = ({
    processEnv = process.env
}: {
    processEnv?: EnvironmentValues;
} = {}): AgentEnv => {
    const parsed = AgentEnvSchema.safeParse(processEnv);

    if (!parsed.success) {
        throw new AgentEnvValidationError(
            parsed.error.issues.map((issue) => ({
                field: String(issue.path[0] ?? 'root'),
                message: issue.message
            }))
        );
    }

    return parsed.data;
};
