/* */
import { describe, expect, it } from 'vitest';

import { sampleVideoProject } from '@wise-cut/video-project';

import type { VideoProjectStore } from '../client/video-project-store';

describe('media protocol', () => {
    it('declares a secure streaming custom protocol for preview media', async () => {
        const { mediaProtocolPrivilege } = await import(
            '../client/media-protocol'
        );

        expect(mediaProtocolPrivilege).toEqual({
            privileges: {
                secure: true,
                standard: true,
                stream: true,
                supportFetchAPI: true
            },
            scheme: 'app-media'
        });
    });

    it('resolves project media URLs to files inside the main process only', async () => {
        const project = structuredClone(sampleVideoProject);
        const fetchedFiles: string[] = [];

        project.project.id = 'project_media';
        project.assets.videos[0]!.path = '/Users/heyi/Videos/scene-01.mp4';
        project.assets.voices[0]!.path =
            '/Users/heyi/Library/Application Support/app/voice-01.mp3';
        project.assets.thumbnails[0]!.path =
            '/Users/heyi/Library/Application Support/app/scene-01.jpg';

        const store = {
            readProjectById: async ({ projectId }) => {
                expect(projectId).toBe('project_media');

                return {
                    data: project,
                    success: true
                };
            }
        } as VideoProjectStore;
        const { createMediaProtocolHandler } = await import(
            '../client/media-protocol'
        );
        const handler = createMediaProtocolHandler({
            fetchMediaFile: async ({ filePath }) => {
                fetchedFiles.push(filePath);

                return new Response('media');
            },
            store
        });

        const video = await handler(
            new Request(
                'app-media://project/project_media/video/video_asset_001'
            )
        );
        const voice = await handler(
            new Request(
                'app-media://project/project_media/voice/voice_asset_001'
            )
        );
        const thumbnail = await handler(
            new Request(
                'app-media://project/project_media/thumbnail/thumbnail_asset_001'
            )
        );

        expect(await video.text()).toBe('media');
        expect(await voice.text()).toBe('media');
        expect(await thumbnail.text()).toBe('media');
        expect(fetchedFiles).toEqual([
            '/Users/heyi/Videos/scene-01.mp4',
            '/Users/heyi/Library/Application Support/app/voice-01.mp3',
            '/Users/heyi/Library/Application Support/app/scene-01.jpg'
        ]);
    });

    it('resolves custom voice preview URLs through the media protocol', async () => {
        const fetchedFiles: string[] = [];
        const { createMediaProtocolHandler } = await import(
            '../client/media-protocol'
        );
        const handler = createMediaProtocolHandler({
            customVoiceReferenceResolver: async (voiceId) => {
                expect(voiceId).toBe('voice_001');

                return '/Users/heyi/Library/Application Support/app/custom-voices/voice_001/reference.wav';
            },
            fetchMediaFile: async ({ filePath }) => {
                fetchedFiles.push(filePath);

                return new Response('custom voice');
            },
            store: {
                readProjectById: async () => {
                    throw new Error('project store should not be called');
                }
            } as unknown as VideoProjectStore
        });
        const response = await handler(
            new Request('app-media://custom-voice/voice_001/reference')
        );

        expect(await response.text()).toBe('custom voice');
        expect(fetchedFiles).toEqual([
            '/Users/heyi/Library/Application Support/app/custom-voices/voice_001/reference.wav'
        ]);
    });

    it('rejects malformed media URLs before touching the filesystem', async () => {
        const readProjectById = async () => {
            throw new Error('store should not be called');
        };
        const { createMediaProtocolHandler } = await import(
            '../client/media-protocol'
        );
        const handler = createMediaProtocolHandler({
            fetchMediaFile: async () => new Response('media'),
            store: {
                readProjectById
            } as unknown as VideoProjectStore
        });
        const response = await handler(
            new Request('app-media://project/project_media/other/asset_001')
        );

        expect(response.status).toBe(400);
    });
});
