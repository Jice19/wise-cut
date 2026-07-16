/* */
import { mkdtemp, readFile, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

describe('custom voice library', () => {
    it('imports reference audio into app storage and returns a custom IndexTTS2 voice type', async () => {
        const { createCustomVoiceLibrary } = await import(
            '../client/custom-voice-library'
        );
        const rootDirectory = await mkdtemp(join(tmpdir(), 'app-voices-'));
        const sourcePath = join(rootDirectory, 'source.wav');

        await writeFile(sourcePath, new Uint8Array([1, 2, 3, 4]));

        const library = createCustomVoiceLibrary({
            createId: () => 'voice_001',
            now: () => '2026-06-28T01:02:03.000Z',
            rootDirectory
        });
        const imported = await library.importReferenceAudio({
            filePath: sourcePath
        });
        const voices = await library.list();

        expect(imported.voice).toMatchObject({
            createdAt: '2026-06-28T01:02:03.000Z',
            id: 'voice_001',
            provider: 'index-tts2',
            previewAudioUrl: 'app-media://custom-voice/voice_001/reference',
            sourceFileName: 'source.wav',
            title: 'source',
            voiceType: 'custom:index-tts2:voice_001'
        });
        expect(voices).toEqual([imported.voice]);
        expect(
            await library.resolveReferencePath(imported.voice.voiceType)
        ).toContain('reference.wav');
        expect([
            ...new Uint8Array(
                await readFile(
                    await library.resolveReferencePath(imported.voice.voiceType)
                )
            )
        ]).toEqual([1, 2, 3, 4]);
    });

    it('reports IndexTTS2 availability from the local server probe', async () => {
        const { createCustomVoiceLibrary } = await import(
            '../client/custom-voice-library'
        );
        const rootDirectory = await mkdtemp(join(tmpdir(), 'app-voices-'));
        const library = createCustomVoiceLibrary({
            fetch: async (url) => {
                expect(String(url)).toBe(
                    'http://127.0.0.1:7860/gradio_api/info'
                );

                return new Response('{}', { status: 200 });
            },
            rootDirectory
        });

        await expect(library.checkIndexTts2()).resolves.toMatchObject({
            available: true,
            provider: 'index-tts2',
            serverUrl: 'http://127.0.0.1:7860'
        });
    });
});
