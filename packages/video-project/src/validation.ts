/* */
import type { ZodIssue } from 'zod';

import { VideoProjectSchema } from './schema';
import type { VideoProjectValidationResult } from './types';

export class VideoProjectValidationError extends Error {
    constructor(readonly issues: string[]) {
        super(issues.join('\n'));
        this.name = 'VideoProjectValidationError';
    }
}

const formatIssue = (issue: ZodIssue): string => {
    const path = issue.path.map(String).join('.') || 'project';

    return `${path}: ${issue.message}`;
};

export const validateVideoProject = (
    value: unknown
): VideoProjectValidationResult => {
    const result = VideoProjectSchema.safeParse(value);

    if (!result.success) {
        return {
            issues: result.error.issues.map(formatIssue),
            success: false
        };
    }

    return {
        data: result.data,
        success: true
    };
};

export const assertVideoProject = (value: unknown) => {
    const result = validateVideoProject(value);

    if (result.success === false) {
        throw new VideoProjectValidationError(result.issues);
    }

    return result.data;
};
