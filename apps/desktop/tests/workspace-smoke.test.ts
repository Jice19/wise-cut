import { VIDEO_AGENT_PACKAGE_NAME } from '@miaoma-magicut/video-agent';
import { VIDEO_PROJECT_PACKAGE_NAME } from '@miaoma-magicut/video-project';
import { describe, expect, it } from 'vitest';

describe('workspace smoke', () => {
    it('loads both workspace packages from apps/desktop', () => {
        expect(VIDEO_AGENT_PACKAGE_NAME).toBe('@miaoma-magicut/video-agent');
        expect(VIDEO_PROJECT_PACKAGE_NAME).toBe(
            '@miaoma-magicut/video-project'
        );
    });
});
