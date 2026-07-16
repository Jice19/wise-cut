/* */
import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import {
    assertVideoProject,
    sampleVideoProject
} from '@wise-cut/video-project';

import {
    createVideoProjectStore,
    type VideoProjectStore
} from '../client/video-project-store';

describe('video project store', () => {
    let tempDirectory: string;
    let store: VideoProjectStore;

    beforeEach(async () => {
        tempDirectory = await mkdtemp(
            path.join(tmpdir(), 'app-video-project-')
        );
        store = createVideoProjectStore({
            projectsDirectory: tempDirectory
        });
    });

    afterEach(async () => {
        await rm(tempDirectory, { force: true, recursive: true });
    });

    it('creates a project json file that can be read back and validated', async () => {
        const created = await store.createProject({
            project: sampleVideoProject
        });

        expect(created.success).toBe(true);
        if (created.success === false) {
            throw new Error(created.error.message);
        }

        expect(created.data.project.project.id).toBe(
            sampleVideoProject.project.id
        );
        expect(created.data.filePath.endsWith('.miaojian.json')).toBe(true);

        const read = await store.readProject({
            filePath: created.data.filePath
        });

        expect(read.success).toBe(true);
        if (read.success) {
            expect(read.data.project.id).toBe(sampleVideoProject.project.id);
            expect(() => assertVideoProject(read.data)).not.toThrow();
        }
    });

    it('reads a saved project by project id', async () => {
        const project = {
            ...sampleVideoProject,
            project: {
                ...sampleVideoProject.project,
                id: 'project_from_langgraph_runner'
            }
        };

        const created = await store.createProject({ project });
        const read = await store.readProjectById({
            projectId: project.project.id
        });

        expect(created).toMatchObject({ success: true });
        expect(read).toMatchObject({
            data: {
                project: {
                    id: 'project_from_langgraph_runner'
                }
            },
            success: true
        });
    });

    it('lists saved projects sorted by latest update time and ignores invalid files', async () => {
        const olderProject = structuredClone(sampleVideoProject);
        olderProject.project.id = 'project_older';
        olderProject.project.title = '较早创建的真实项目';
        olderProject.project.createdAt = '2026-06-20T08:00:00.000Z';
        olderProject.project.updatedAt = '2026-06-20T08:00:00.000Z';

        const latestProject = structuredClone(sampleVideoProject);
        latestProject.project.id = 'project_latest';
        latestProject.project.title = '最新创建的真实项目';
        latestProject.project.createdAt = '2026-06-23T08:00:00.000Z';
        latestProject.project.updatedAt = '2026-06-23T08:30:00.000Z';

        await store.createProject({ project: olderProject });
        await store.createProject({ project: latestProject });
        await writeFile(
            path.join(tempDirectory, 'broken.miaojian.json'),
            '{ "schemaVersion": "1.0.0" }',
            'utf8'
        );
        await writeFile(
            path.join(tempDirectory, 'notes.txt'),
            'not a project',
            'utf8'
        );

        const listed = await store.listProjects();

        expect(listed).toMatchObject({
            data: [
                {
                    project: {
                        project: {
                            id: 'project_latest',
                            title: '最新创建的真实项目'
                        }
                    }
                },
                {
                    project: {
                        project: {
                            id: 'project_older',
                            title: '较早创建的真实项目'
                        }
                    }
                }
            ],
            success: true
        });
    });

    it('saves a valid project json over an existing file', async () => {
        const created = await store.createProject({
            project: sampleVideoProject
        });

        if (created.success === false) {
            throw new Error(created.error.message);
        }

        const nextProject = structuredClone(sampleVideoProject);
        nextProject.project.title = '更新后的项目标题';

        const saved = await store.saveProject({
            filePath: created.data.filePath,
            project: nextProject
        });

        expect(saved.success).toBe(true);
        if (saved.success) {
            expect(saved.data.project.title).toBe('更新后的项目标题');
        }
    });

    it('deletes a saved project json by project id', async () => {
        const project = structuredClone(sampleVideoProject);
        project.project.id = 'project_to_delete';

        const created = await store.createProject({ project });

        expect(created).toMatchObject({ success: true });

        const deleted = await store.deleteProject({
            projectId: project.project.id
        });
        const listed = await store.listProjects();
        const read = await store.readProjectById({
            projectId: project.project.id
        });

        expect(deleted).toMatchObject({
            data: {
                projectId: 'project_to_delete'
            },
            success: true
        });
        expect(listed).toMatchObject({
            data: [],
            success: true
        });
        expect(read).toMatchObject({
            error: {
                code: 'READ_FAILED'
            },
            success: false
        });
    });

    it('returns a structured validation error for invalid project json', async () => {
        const invalidProject = structuredClone(sampleVideoProject);
        invalidProject.tracks[0]!.clips[0]!.endMs =
            invalidProject.tracks[0]!.clips[0]!.startMs;

        const result = await store.createProject({
            project: invalidProject
        });

        expect(result.success).toBe(false);
        if (result.success === false) {
            expect(result.error.code).toBe('VALIDATION_FAILED');
            expect(result.error.message).toContain(
                'Clip endMs must be greater than startMs'
            );
        }
    });

    it('rejects invalid json content when reading a project file', async () => {
        const filePath = path.join(tempDirectory, 'broken.miaojian.json');
        await writeFile(filePath, '{ "schemaVersion": "1.0.0" }', 'utf8');

        const result = await store.readProject({ filePath });

        expect(result.success).toBe(false);
        if (result.success === false) {
            expect(result.error.code).toBe('VALIDATION_FAILED');
        }
    });

    it('validateProject returns sanitized validation results without touching the filesystem', async () => {
        const result = store.validateProject({
            project: sampleVideoProject
        });

        expect(result.success).toBe(true);
        await expect(readFile(tempDirectory)).rejects.toThrow();
    });

    it('exposes project listing through IPC and preload contracts', async () => {
        const { registerVideoProjectIpc, videoProjectIpcChannels } =
            await import('../client/video-project-ipc');
        const preloadSource = await readFile(
            path.resolve(__dirname, '../client/preload.ts'),
            'utf8'
        );
        const envTypesSource = await readFile(
            path.resolve(__dirname, '../miaoma.env.d.ts'),
            'utf8'
        );
        const handlers = new Map<
            string,
            Parameters<
                Parameters<
                    typeof registerVideoProjectIpc
                >[0]['ipcMain']['handle']
            >[1]
        >();
        const ipcMain: Parameters<
            typeof registerVideoProjectIpc
        >[0]['ipcMain'] = {
            handle: (channel, handler) => {
                handlers.set(channel, handler);
            }
        };

        registerVideoProjectIpc({ ipcMain, store });

        expect(videoProjectIpcChannels.delete).toBe('videoProject:delete');
        expect(handlers.has(videoProjectIpcChannels.delete)).toBe(true);
        expect(videoProjectIpcChannels.list).toBe('videoProject:list');
        expect(handlers.has(videoProjectIpcChannels.list)).toBe(true);
        expect(
            await handlers.get(videoProjectIpcChannels.list)?.({} as never)
        ).toEqual({
            data: [],
            success: true
        });
        expect(preloadSource).toContain('videoProjectIpcChannels.delete');
        expect(preloadSource).toContain('delete: async (projectId: string)');
        expect(preloadSource).toContain('videoProjectIpcChannels.list');
        expect(preloadSource).toContain('list: async ()');
        expect(envTypesSource).toContain('delete: (');
        expect(envTypesSource).toContain('list: () => Promise');
    });
});
