/* */
import { parse } from 'dotenv';
import { existsSync, readFileSync } from 'node:fs';
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

export const loadAgentEnv = ({
    envFilePath,
    processEnv = process.env
}: {
    envFilePath?: string;
    processEnv?: EnvironmentValues;
} = {}): AgentEnv => {
    const dotenvValues =
        envFilePath && existsSync(envFilePath)
            ? parse(readFileSync(envFilePath))
            : {};
    const parsed = AgentEnvSchema.safeParse({
        ...dotenvValues,
        ...processEnv
    });

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
