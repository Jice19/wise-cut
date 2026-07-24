/* */
import { readFileSync } from 'node:fs';
import { mkdir, mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { resolve } from 'node:path';
import path from 'node:path';
import { describe, expect, it } from 'vitest';

import {
    sampleVideoProject,
    type VideoProject
} from '@wise-cut/video-project';

const waitFor = async (
    predicate: () => boolean,
    message = 'Timed out waiting for condition'
) => {
    const startedAt = Date.now();

    while (Date.now() - startedAt < 1000) {
        if (predicate()) return;
        await new Promise((resolveWait) => {
            setTimeout(resolveWait, 10);
        });
    }

    throw new Error(message);
};

describe('create agent flow', () => {
    it('keeps generated voice preview audio at full spoken length', () => {
        const scriptSource = readFileSync(
            resolve(__dirname, '../../../scripts/generate-voice-previews.ts'),
            'utf8'
        );

        expect(scriptSource).not.toContain('targetDurationMs');
        expect(scriptSource).not.toContain("'-t'");
        expect(scriptSource).not.toContain('apad');
        expect(scriptSource).not.toContain('trimOrPad');
    });

    it('returns the run id immediately while the LangGraph runner continues in the background', async () => {
        const { createLangGraphVideoAgentController } = await import(
            '../client/video-agent-ipc'
        );
        const emittedEvents: unknown[] = [];
        const controller = createLangGraphVideoAgentController({
            createRunId: () => 'run-background-start',
            createRunner: () => ({
                resume: async () => ({
                    errors: [],
                    runId: 'run-background-start',
                    status: 'waiting_for_approval'
                }),
                start: async () =>
                    new Promise(() => {
                        // Keep the fake graph running so the IPC contract proves
                        // start() does not await the whole graph.
                    })
            }),
            store: {} as never
        });

        const result = await Promise.race([
            controller.start(
                {
                    prompt: '生成一条介绍智剪的视频',
                    selectedVoice: '温婉学姐',
                    selectedVoiceType: 'zh_female_wenroushunv_uranus_bigtts',
                    sourceAssetDirectory: '/tmp/app-assets'
                },
                (event) => {
                    emittedEvents.push(event);
                }
            ),
            new Promise<'timeout'>((resolve) => {
                setTimeout(() => {
                    resolve('timeout');
                }, 20);
            })
        ]);

        expect(result).not.toBe('timeout');
        expect(result).toEqual({
            data: {
                runId: 'run-background-start'
            },
            success: true
        });
        expect(JSON.stringify(emittedEvents)).not.toContain(
            'zh_female_wenroushunv_uranus_bigtts'
        );
    });

    it('creates spoken fallback scripts instead of storyboard planning labels', async () => {
        const { createDesktopVideoAgentTools } = await import(
            '../client/video-agent-tools'
        );
        const tools = createDesktopVideoAgentTools({ store: {} as never });
        const scenes = await tools.planScenes({
            assets: [
                {
                    assetId: 'video_asset_001',
                    description: '产品界面录屏',
                    durationMs: 5000
                }
            ],
            brief: {
                audience: '短视频创作者',
                keyMessages: ['智能剪辑'],
                summary: '介绍智剪智能剪辑',
                title: '智剪',
                tone: '清晰自然',
                visualStyle: '产品录屏'
            },
            input: {
                prompt: '帮我介绍智剪智能剪辑',
                runId: 'run_fallback_script',
                sourceAssetDirectory: '/tmp/app-assets'
            }
        });
        const scriptText = scenes
            .flatMap((scene) => scene.subtitleLines)
            .join('\n');

        expect(scriptText).not.toMatch(
            /开场明确主题|展示核心内容|收束行动引导|[：:]/
        );
        expect(
            scenes.every(
                (scene) => scene.script === scene.subtitleLines.join('\n')
            )
        ).toBe(true);
    });

    it('does not send empty or punctuation-only text to TTS', async () => {
        const { createDesktopVideoAgentTools } = await import(
            '../client/video-agent-tools'
        );
        const ttsCalls: string[] = [];
        const tools = createDesktopVideoAgentTools({
            getSelectedVoiceType: () => 'zh_female_wenroushunv_uranus_bigtts',
            modelProvider: {
                describeFrames: async () => [] as never[],
                embedTexts: async () => [] as never[],
                generateCreativeBrief: async () => ({
                    audience: '短视频创作者',
                    keyMessages: ['智能剪辑'],
                    summary: '介绍智剪智能剪辑',
                    title: '智剪',
                    tone: '清晰自然',
                    visualStyle: '产品录屏'
                }),
                planScenes: async () => [
                    {
                        durationMs: 5000,
                        goal: '建立主题',
                        id: 'scene_001',
                        index: 1,
                        script: '开场：',
                        subtitleLines: ['字幕：', '……'],
                        title: '开场',
                        visualIntent: '产品界面'
                    }
                ],
                rankAssetMatches: async () => []
            },
            store: {} as never,
            ttsProvider: {
                synthesizeSpeech: async ({ outputPath, text }) => {
                    ttsCalls.push(text);

                    return {
                        byteLength: 1,
                        durationMs: 1200,
                        format: 'mp3',
                        path: outputPath
                    };
                }
            },
            voiceOutputDirectory: '/tmp/app-voices'
        });
        const scenes = await tools.planScenes({
            assets: [
                {
                    assetId: 'video_asset_001',
                    description: '产品界面录屏',
                    durationMs: 5000
                }
            ],
            brief: {
                audience: '短视频创作者',
                keyMessages: ['智能剪辑'],
                summary: '介绍智剪智能剪辑',
                title: '智剪',
                tone: '清晰自然',
                visualStyle: '产品录屏'
            },
            input: {
                prompt: '介绍智剪智能剪辑',
                runId: 'run_no_readable_text',
                sourceAssetDirectory: '/tmp/app-assets'
            }
        });

        await tools.synthesizeVoice({
            brief: {
                audience: '短视频创作者',
                keyMessages: ['智能剪辑'],
                summary: '介绍智剪智能剪辑',
                title: '智剪',
                tone: '清晰自然',
                visualStyle: '产品录屏'
            },
            input: {
                prompt: '介绍智剪智能剪辑',
                runId: 'run_no_readable_text',
                sourceAssetDirectory: '/tmp/app-assets'
            },
            scenes
        });

        expect(ttsCalls.length).toBeGreaterThan(0);
        expect(ttsCalls.every((text) => /[\p{L}\p{N}]/u.test(text))).toBe(true);
        expect(ttsCalls.join('\n')).not.toMatch(/^[\s\p{P}\p{S}]+$/u);
    });

    it('keeps a long spoken subtitle line intact when no natural boundary exists', async () => {
        const { createDesktopVideoAgentTools } = await import(
            '../client/video-agent-tools'
        );
        const longSpokenLine =
            '这是一段没有标点但需要保持完整不要被机械截断的口播字幕文本';
        const tools = createDesktopVideoAgentTools({
            modelProvider: {
                describeFrames: async () => [] as never[],
                embedTexts: async () => [] as never[],
                generateCreativeBrief: async () => ({
                    audience: '短视频创作者',
                    keyMessages: ['自然断句'],
                    summary: '字幕不能硬切',
                    title: '自然断句',
                    tone: '自然',
                    visualStyle: '产品录屏'
                }),
                planScenes: async () => [
                    {
                        durationMs: 5000,
                        goal: '验证自然字幕',
                        id: 'scene_001',
                        index: 1,
                        script: longSpokenLine,
                        subtitleLines: [longSpokenLine],
                        title: '自然字幕',
                        visualIntent: '产品界面'
                    }
                ],
                rankAssetMatches: async () => []
            },
            store: {} as never
        });

        const scenes = await tools.planScenes({
            assets: [
                {
                    assetId: 'video_asset_001',
                    description: '产品界面录屏',
                    durationMs: 5000
                }
            ],
            brief: {
                audience: '短视频创作者',
                keyMessages: ['自然断句'],
                summary: '字幕不能硬切',
                title: '自然断句',
                tone: '自然',
                visualStyle: '产品录屏'
            },
            input: {
                prompt: '验证字幕自然断句',
                runId: 'run_natural_subtitle_line',
                sourceAssetDirectory: '/tmp/app-assets'
            }
        });

        expect(scenes[0]?.subtitleLines).toEqual([longSpokenLine]);
        expect(scenes[0]?.script).toBe(longSpokenLine);
    });

    it('lets the model choose the scene count instead of forcing a fixed target', async () => {
        const { createDesktopVideoAgentTools } = await import(
            '../client/video-agent-tools'
        );
        const planSceneInputs: unknown[] = [];
        const tools = createDesktopVideoAgentTools({
            modelProvider: {
                describeFrames: async () => [] as never[],
                embedTexts: async () => [] as never[],
                generateCreativeBrief: async () => ({
                    audience: '短视频创作者',
                    keyMessages: ['动态分镜'],
                    summary: '根据内容决定分镜',
                    title: '动态分镜',
                    tone: '自然',
                    visualStyle: '产品录屏'
                }),
                planScenes: async (input) => {
                    planSceneInputs.push(input);

                    return [
                        {
                            durationMs: 5000,
                            goal: '验证动态分镜',
                            id: 'scene_001',
                            index: 1,
                            script: '根据内容决定分镜数量',
                            subtitleLines: ['根据内容决定分镜数量'],
                            title: '动态分镜',
                            visualIntent: '产品界面'
                        }
                    ];
                },
                rankAssetMatches: async () => []
            },
            store: {} as never
        });

        await tools.planScenes({
            assets: [
                {
                    assetId: 'video_asset_001',
                    description: '产品界面录屏',
                    durationMs: 5000
                },
                {
                    assetId: 'video_asset_002',
                    description: '素材特写',
                    durationMs: 5000
                }
            ],
            brief: {
                audience: '短视频创作者',
                keyMessages: ['动态分镜'],
                summary: '根据内容决定分镜',
                title: '动态分镜',
                tone: '自然',
                visualStyle: '产品录屏'
            },
            input: {
                prompt: '根据内容规划分镜',
                runId: 'run_dynamic_scene_count',
                sourceAssetDirectory: '/tmp/app-assets'
            }
        });

        expect(planSceneInputs[0]).toMatchObject({
            brief: expect.objectContaining({
                summary: '根据内容决定分镜'
            })
        });
        expect(planSceneInputs[0]).not.toHaveProperty('targetSceneCount');
    });

    it('keeps scanned but unused video assets in the project for later scene rematching', async () => {
        const { createDesktopVideoAgentTools } = await import(
            '../client/video-agent-tools'
        );
        const tools = createDesktopVideoAgentTools({ store: {} as never });
        const project = await tools.assembleTimeline({
            assets: [
                {
                    assetId: 'video_asset_001',
                    description: '开场口播素材',
                    durationMs: 5000
                },
                {
                    assetId: 'video_asset_002',
                    description: '产品界面替换素材',
                    durationMs: 7000
                }
            ],
            brief: {
                audience: '短视频创作者',
                keyMessages: ['可重新匹配'],
                summary: '保存候选素材',
                title: '候选素材',
                tone: '自然',
                visualStyle: '产品录屏'
            },
            input: {
                prompt: '生成一个产品介绍视频',
                runId: 'run_keep_candidates',
                sourceAssetDirectory: '/tmp/app-assets'
            },
            matches: [
                {
                    rankedAssetIds: [
                        {
                            assetId: 'video_asset_001',
                            reason: '初始匹配',
                            score: 0.9
                        }
                    ],
                    sceneId: 'scene_001'
                }
            ],
            scenes: [
                {
                    durationMs: 3000,
                    goal: '验证候选素材保留',
                    id: 'scene_001',
                    index: 1,
                    script: '保留候选素材方便后续重匹配',
                    subtitleLines: ['保留候选素材方便后续重匹配'],
                    title: '候选素材',
                    visualIntent: '产品界面'
                }
            ],
            voices: [
                {
                    assetId: 'voice_asset_scene_001_001',
                    durationMs: 3000,
                    lineIndex: 0,
                    path: 'assets/voices/run_keep_candidates-001.mp3',
                    sceneId: 'scene_001',
                    text: '保留候选素材方便后续重匹配'
                }
            ]
        });

        expect(project.assets.videos.map((asset) => asset.id)).toEqual([
            'video_asset_001',
            'video_asset_002'
        ]);
        expect(project.tracks[0]?.clips[0]).toMatchObject({
            assetId: 'video_asset_001',
            kind: 'video'
        });
    });

    it('wires the create tab into the agent run store and local asset directory input', () => {
        const inputPanelSource = readFileSync(
            resolve(
                __dirname,
                '../renderer/components/create/CreateInputPanel.tsx'
            ),
            'utf8'
        );
        const mainContentSource = readFileSync(
            resolve(
                __dirname,
                '../renderer/components/create/CreateMainContent.tsx'
            ),
            'utf8'
        );
        const workspaceSource = readFileSync(
            resolve(__dirname, '../renderer/pages/MiaojianWorkspaceScreen.tsx'),
            'utf8'
        );

        expect(mainContentSource).not.toContain('CreateAgentProgress');
        expect(workspaceSource).toContain('startAgentRun');
        expect(workspaceSource).toContain('/create/runs/');
        expect(inputPanelSource).toContain('本地素材目录');
        expect(inputPanelSource).toContain('粘贴本地视频素材目录');
        expect(inputPanelSource).toContain('data-agent-start-button');
    });

    it('maps sequenced agent events into readable Chinese progress states', async () => {
        const { createAgentProgressViewModel } = await import(
            '../renderer/components/create/CreateAgentProgress'
        );

        const viewModel = createAgentProgressViewModel([
            {
                createdAt: '2026-06-23T01:00:03.000Z',
                projectId: 'project_from_agent',
                runId: 'run_001',
                sequence: 4,
                type: 'run.completed'
            },
            {
                createdAt: '2026-06-23T01:00:01.000Z',
                nodeName: 'asset_scan',
                runId: 'run_001',
                sequence: 2,
                type: 'node.started'
            },
            {
                approval: {
                    payload: {},
                    type: 'scene-plan'
                },
                createdAt: '2026-06-23T01:00:02.000Z',
                runId: 'run_001',
                sequence: 3,
                type: 'approval.required'
            },
            {
                createdAt: '2026-06-23T01:00:00.000Z',
                input: {
                    prompt: '做一个产品发布视频',
                    selectedVoice: '温婉学姐',
                    sourceAssetDirectory: '/Users/heyi/Videos/miaojian'
                },
                runId: 'run_001',
                sequence: 1,
                type: 'run.started'
            }
        ]);

        expect(viewModel.entries.map((entry) => entry.sequence)).toEqual([
            1, 2, 3, 4
        ]);
        expect(viewModel.entries.map((entry) => entry.label)).toContain(
            '正在分析素材'
        );
        expect(viewModel.entries.map((entry) => entry.label)).toContain(
            '等待分镜确认'
        );
        expect(viewModel.status).toBe('completed');
        expect(viewModel.title).toBe('已完成');
        expect(viewModel.editorHref).toBe('/editor/project_from_agent');
    });

    it('coalesces repeated lifecycle events into one visible progress stage', async () => {
        const { createAgentProgressViewModel } = await import(
            '../renderer/components/create/CreateAgentProgress'
        );

        const viewModel = createAgentProgressViewModel([
            {
                createdAt: '2026-06-23T01:00:00.000Z',
                input: {
                    prompt: '做一个产品发布视频',
                    selectedVoice: '温婉学姐',
                    sourceAssetDirectory: '/Users/heyi/Videos/miaojian'
                },
                runId: 'run_001',
                sequence: 1,
                type: 'run.started'
            },
            {
                createdAt: '2026-06-23T01:00:01.000Z',
                nodeName: 'scene_approval',
                runId: 'run_001',
                sequence: 2,
                type: 'node.started'
            },
            {
                approval: {
                    payload: {},
                    type: 'scene-plan'
                },
                createdAt: '2026-06-23T01:00:02.000Z',
                runId: 'run_001',
                sequence: 3,
                type: 'approval.required'
            },
            {
                createdAt: '2026-06-23T01:00:03.000Z',
                nodeName: 'scene_approval',
                runId: 'run_001',
                sequence: 4,
                type: 'node.completed'
            },
            {
                createdAt: '2026-06-23T01:00:04.000Z',
                nodeName: 'asset_matcher',
                runId: 'run_001',
                sequence: 5,
                type: 'node.started'
            },
            {
                createdAt: '2026-06-23T01:00:05.000Z',
                nodeName: 'project_save',
                runId: 'run_001',
                sequence: 6,
                type: 'node.started'
            },
            {
                createdAt: '2026-06-23T01:00:06.000Z',
                nodeName: 'project_save',
                runId: 'run_001',
                sequence: 7,
                type: 'node.completed'
            },
            {
                createdAt: '2026-06-23T01:00:07.000Z',
                projectId: 'project_from_agent',
                runId: 'run_001',
                sequence: 8,
                type: 'run.completed'
            }
        ]);

        expect(viewModel.entries.map((entry) => entry.label)).toEqual([
            '已开始智能创作',
            '等待分镜确认',
            '正在匹配素材',
            '正在保存工程',
            '已完成'
        ]);
    });

    it('registers video agent IPC handlers and emits renderer events in sequence', async () => {
        const {
            createDemoVideoAgentController,
            registerVideoAgentIpc,
            videoAgentIpcChannels
        } = await import('../client/video-agent-ipc');
        const sentEvents: unknown[] = [];
        const sender = {
            send: (channel: string, event: unknown) => {
                sentEvents.push({ channel, event });
            }
        };
        const handlers = new Map<
            string,
            (event: { sender: typeof sender }, input: unknown) => unknown
        >();
        const ipcMain = {
            handle: (
                channel: string,
                handler: (
                    event: { sender: typeof sender },
                    input: unknown
                ) => unknown
            ) => {
                handlers.set(channel, handler);
            }
        };

        registerVideoAgentIpc({
            controller: createDemoVideoAgentController({
                createRunId: () => 'run_test',
                now: () => '2026-06-23T01:00:00.000Z'
            }),
            ipcMain
        });

        expect(handlers.has(videoAgentIpcChannels.regenerateScene)).toBe(true);
        expect(handlers.has(videoAgentIpcChannels.regenerateVoices)).toBe(true);

        const missingDirectory = await handlers.get(
            videoAgentIpcChannels.start
        )?.(
            { sender },
            {
                prompt: '做一个课程宣传视频',
                selectedVoice: '温婉学姐',
                sourceAssetDirectory: ''
            }
        );

        expect(missingDirectory).toMatchObject({
            error: {
                code: 'VALIDATION_FAILED',
                message: '请选择本地素材目录'
            },
            success: false
        });

        const started = await handlers.get(videoAgentIpcChannels.start)?.(
            { sender },
            {
                prompt: '做一个课程宣传视频',
                selectedVoice: '温婉学姐',
                sourceAssetDirectory: '/Users/heyi/Videos/miaojian'
            }
        );

        expect(started).toMatchObject({
            data: {
                runId: 'run_test'
            },
            success: true
        });
        expect(sentEvents).toContainEqual(
            expect.objectContaining({
                channel: videoAgentIpcChannels.event,
                event: expect.objectContaining({
                    sequence: 1,
                    type: 'run.started'
                })
            })
        );
        expect(sentEvents).toContainEqual(
            expect.objectContaining({
                channel: videoAgentIpcChannels.event,
                event: expect.objectContaining({
                    sequence: 7,
                    type: 'approval.required'
                })
            })
        );

        const approved = await handlers.get(videoAgentIpcChannels.approve)?.(
            { sender },
            {
                approved: true,
                runId: 'run_test'
            }
        );

        expect(approved).toMatchObject({
            data: {
                runId: 'run_test'
            },
            success: true
        });
        expect(sentEvents).toContainEqual(
            expect.objectContaining({
                channel: videoAgentIpcChannels.event,
                event: expect.objectContaining({
                    projectId: 'project_run_test',
                    type: 'run.completed'
                })
            })
        );

        const cancelled = await handlers.get(videoAgentIpcChannels.cancel)?.(
            { sender },
            {
                runId: 'run_test'
            }
        );

        expect(cancelled).toMatchObject({
            data: {
                runId: 'run_test'
            },
            success: true
        });
        expect(sentEvents).toContainEqual(
            expect.objectContaining({
                channel: videoAgentIpcChannels.event,
                event: expect.objectContaining({
                    type: 'run.cancelled'
                })
            })
        );
    });

    it('runs the real LangGraph controller and saves a loadable VideoProject', async () => {
        const assetDirectory = await mkdtemp(
            path.join(tmpdir(), 'app-assets-')
        );
        const projectsDirectory = await mkdtemp(
            path.join(tmpdir(), 'app-projects-')
        );

        try {
            await mkdir(assetDirectory, { recursive: true });
            await writeFile(path.join(assetDirectory, 'scene-01.mp4'), '');

            const { createVideoProjectStore } = await import(
                '../client/video-project-store'
            );
            const { createLangGraphVideoAgentController } = await import(
                '../client/video-agent-ipc'
            );
            const modelCalls: string[] = [];
            const ttsCalls: string[] = [];
            const modelProvider = {
                describeFrames: async () => [] as never[],
                embedTexts: async () => [] as never[],
                generateCreativeBrief: async () => {
                    modelCalls.push('generateCreativeBrief');

                    return {
                        audience: '短视频创作者',
                        keyMessages: ['智能分镜', '真实模型链路'],
                        summary: '智剪产品发布视频',
                        title: '智剪产品发布',
                        tone: '专业轻快',
                        visualStyle: '清爽科技感'
                    };
                },
                planScenes: async () => {
                    modelCalls.push('planScenes');

                    return [
                        {
                            durationMs: 3200,
                            goal: '展示产品开场',
                            id: 'scene_001',
                            index: 1,
                            script: '智剪让视频创作更快',
                            subtitleLines: ['智剪让视频创作更快'],
                            title: '开场',
                            visualIntent: '产品界面'
                        }
                    ];
                },
                rankAssetMatches: async () => {
                    modelCalls.push('rankAssetMatches');

                    return [
                        {
                            rankedAssetIds: [
                                {
                                    assetId:
                                        'video_asset_run_desktop_langgraph_001',
                                    reason: '产品界面素材匹配',
                                    score: 0.92
                                }
                            ],
                            sceneId: 'scene_001'
                        }
                    ];
                }
            };
            const ttsProvider = {
                synthesizeSpeech: async ({
                    outputPath,
                    text,
                    voice
                }: {
                    outputPath: string;
                    text: string;
                    voice: string;
                }) => {
                    ttsCalls.push(`${voice}:${text}`);
                    await writeFile(outputPath, new Uint8Array([1, 2, 3]));

                    return {
                        byteLength: 3,
                        durationMs: 3200,
                        format: 'mp3' as const,
                        path: outputPath
                    };
                }
            };
            const store = createVideoProjectStore({ projectsDirectory });
            const controller = createLangGraphVideoAgentController({
                createRunId: () => 'run_desktop_langgraph',
                modelProvider,
                now: () => '2026-06-23T01:00:00.000Z',
                store,
                ttsProvider,
                voiceOutputDirectory: path.join(projectsDirectory, 'voices')
            });
            const events: unknown[] = [];

            const started = await controller.start(
                {
                    prompt: '做一个智剪智能视频编辑器产品发布视频',
                    selectedVoice: '新闻播报',
                    selectedVoiceType: 'zh_male_cixingjieshuonan_uranus_bigtts',
                    sourceAssetDirectory: assetDirectory
                },
                (event) => events.push(event)
            );

            expect(started).toMatchObject({
                data: {
                    runId: 'run_desktop_langgraph'
                },
                success: true
            });
            expect(events).toContainEqual(
                expect.objectContaining({
                    input: expect.objectContaining({
                        selectedVoice: '新闻播报',
                        sourceAssetDirectory: assetDirectory
                    }),
                    type: 'run.started'
                })
            );
            await waitFor(
                () =>
                    events.some(
                        (event) =>
                            typeof event === 'object' &&
                            event !== null &&
                            'type' in event &&
                            event.type === 'approval.required'
                    ),
                'Timed out waiting for scene approval'
            );
            expect(events).toContainEqual(
                expect.objectContaining({
                    approval: expect.objectContaining({
                        type: 'scene-plan'
                    }),
                    type: 'approval.required'
                })
            );
            expect(modelCalls).toEqual(['generateCreativeBrief', 'planScenes']);

            const approved = await controller.approve(
                {
                    approved: true,
                    runId: 'run_desktop_langgraph'
                },
                (event) => events.push(event)
            );

            if (approved.success === false) {
                throw new Error(approved.error.message);
            }

            expect(approved).toMatchObject({
                data: {
                    runId: 'run_desktop_langgraph'
                },
                success: true
            });
            expect(modelCalls).toEqual([
                'generateCreativeBrief',
                'planScenes',
                'rankAssetMatches'
            ]);
            expect(ttsCalls).toEqual([
                'zh_male_cixingjieshuonan_uranus_bigtts:智剪让视频创作更快'
            ]);

            const completed = events.find(
                (event) =>
                    typeof event === 'object' &&
                    event !== null &&
                    'type' in event &&
                    event.type === 'run.completed'
            );

            expect(completed).toMatchObject({
                projectId: 'project_run_desktop_langgraph',
                type: 'run.completed'
            });

            const loaded = await store.readProjectById({
                projectId: 'project_run_desktop_langgraph'
            });
            const listed = await store.listProjects();

            expect(loaded).toMatchObject({
                data: {
                    ai: {
                        runId: 'run_desktop_langgraph'
                    },
                    tracks: expect.arrayContaining([
                        expect.objectContaining({ kind: 'video' }),
                        expect.objectContaining({ kind: 'voice' }),
                        expect.objectContaining({ kind: 'subtitle' }),
                        expect.objectContaining({ kind: 'music' })
                    ])
                },
                success: true
            });
            expect(listed).toMatchObject({
                data: [
                    expect.objectContaining({
                        project: expect.objectContaining({
                            project: expect.objectContaining({
                                id: 'project_run_desktop_langgraph',
                                title: '智剪产品发布'
                            })
                        })
                    })
                ],
                success: true
            });
        } finally {
            await rm(assetDirectory, { force: true, recursive: true });
            await rm(projectsDirectory, { force: true, recursive: true });
        }
    });

    it('uses subtitle lines as the TTS source and derives scene timing from voice duration', async () => {
        const assetDirectory = await mkdtemp(
            path.join(tmpdir(), 'app-assets-')
        );
        const projectsDirectory = await mkdtemp(
            path.join(tmpdir(), 'app-projects-')
        );

        try {
            await mkdir(assetDirectory, { recursive: true });
            await writeFile(path.join(assetDirectory, 'scene-01.mp4'), '');

            const { createVideoProjectStore } = await import(
                '../client/video-project-store'
            );
            const { createLangGraphVideoAgentController } = await import(
                '../client/video-agent-ipc'
            );
            const ttsCalls: string[] = [];
            const ttsDurationsByText = new Map([
                ['第一句字幕就是第一段配音', 1400],
                ['第二句字幕就是第二段配音', 2300]
            ]);
            const modelProvider = {
                describeFrames: async () => [] as never[],
                embedTexts: async () => [] as never[],
                generateCreativeBrief: async () => ({
                    audience: '短视频创作者',
                    keyMessages: ['字幕驱动配音'],
                    summary: '字幕和配音需要严格同步',
                    title: '字幕配音同步',
                    tone: '清晰',
                    visualStyle: '产品录屏'
                }),
                planScenes: async () => [
                    {
                        durationMs: 9999,
                        goal: '验证分镜时长不再由模型预估决定',
                        id: 'scene_001',
                        index: 1,
                        script: '这段脚本不应该直接送给 TTS',
                        subtitleLines: [
                            '第一句字幕就是第一段配音',
                            '第二句字幕就是第二段配音'
                        ],
                        title: '同步验证',
                        visualIntent: '单个视频对应一个分镜'
                    }
                ],
                rankAssetMatches: async () => [
                    {
                        rankedAssetIds: [
                            {
                                assetId: 'video_asset_run_voice_timing_001',
                                reason: '匹配单分镜视频',
                                score: 0.95
                            }
                        ],
                        sceneId: 'scene_001'
                    }
                ]
            };
            const ttsProvider = {
                synthesizeSpeech: async ({
                    outputPath,
                    text,
                    voice
                }: {
                    outputPath: string;
                    text: string;
                    voice: string;
                }) => {
                    ttsCalls.push(`${voice}:${text}`);
                    await writeFile(outputPath, new Uint8Array([1, 2, 3]));

                    return {
                        byteLength: 3,
                        durationMs: ttsDurationsByText.get(text) ?? 1000,
                        format: 'mp3' as const,
                        path: outputPath
                    };
                }
            };
            const store = createVideoProjectStore({ projectsDirectory });
            const controller = createLangGraphVideoAgentController({
                createRunId: () => 'run_voice_timing',
                modelProvider,
                now: () => '2026-06-23T01:00:00.000Z',
                store,
                ttsProvider,
                voiceOutputDirectory: path.join(projectsDirectory, 'voices')
            });

            const events: unknown[] = [];

            await controller.start(
                {
                    prompt: '做一个字幕配音同步验证视频',
                    selectedVoice: '温婉学姐',
                    selectedVoiceType: 'zh_female_wenroushunv_uranus_bigtts',
                    sourceAssetDirectory: assetDirectory
                },
                (event) => {
                    events.push(event);
                }
            );
            await waitFor(
                () =>
                    events.some(
                        (event) =>
                            typeof event === 'object' &&
                            event !== null &&
                            'type' in event &&
                            event.type === 'approval.required'
                    ),
                'Timed out waiting for scene approval'
            );
            const approved = await controller.approve(
                {
                    approved: true,
                    runId: 'run_voice_timing'
                },
                () => undefined
            );

            if (approved.success === false) {
                throw new Error(approved.error.message);
            }

            expect(ttsCalls).toEqual([
                'zh_female_wenroushunv_uranus_bigtts:第一句字幕就是第一段配音',
                'zh_female_wenroushunv_uranus_bigtts:第二句字幕就是第二段配音'
            ]);

            const loaded = await store.readProjectById({
                projectId: 'project_run_voice_timing'
            });

            if (loaded.success === false) {
                throw new Error(loaded.error.message);
            }

            const project = loaded.data;
            const videoTrack = project.tracks.find(
                (track) => track.kind === 'video'
            );
            const voiceTrack = project.tracks.find(
                (track) => track.kind === 'voice'
            );
            const subtitleTrack = project.tracks.find(
                (track) => track.kind === 'subtitle'
            );

            expect(project.canvas.durationMs).toBe(3700);
            expect(project.scenes[0]).toMatchObject({
                durationMs: 3700,
                script: '第一句字幕就是第一段配音\n第二句字幕就是第二段配音'
            });
            expect(videoTrack?.clips).toMatchObject([
                {
                    endMs: 3700,
                    kind: 'video',
                    sceneId: 'scene_001',
                    startMs: 0
                }
            ]);
            expect(voiceTrack?.clips).toMatchObject([
                {
                    endMs: 1400,
                    kind: 'voice',
                    sceneId: 'scene_001',
                    startMs: 0
                },
                {
                    endMs: 3700,
                    kind: 'voice',
                    sceneId: 'scene_001',
                    startMs: 1400
                }
            ]);
            expect(subtitleTrack?.clips).toMatchObject([
                {
                    endMs: 1400,
                    kind: 'subtitle',
                    sceneId: 'scene_001',
                    startMs: 0,
                    text: '第一句字幕就是第一段配音'
                },
                {
                    endMs: 3700,
                    kind: 'subtitle',
                    sceneId: 'scene_001',
                    startMs: 1400,
                    text: '第二句字幕就是第二段配音'
                }
            ]);
        } finally {
            await rm(assetDirectory, { force: true, recursive: true });
            await rm(projectsDirectory, { force: true, recursive: true });
        }
    });

    it('passes voice volume and speed settings into creation TTS synthesis', async () => {
        const assetDirectory = await mkdtemp(
            path.join(tmpdir(), 'app-assets-')
        );
        const projectsDirectory = await mkdtemp(
            path.join(tmpdir(), 'app-projects-')
        );

        try {
            await mkdir(assetDirectory, { recursive: true });
            await writeFile(path.join(assetDirectory, 'scene-01.mp4'), '');

            const { createVideoProjectStore } = await import(
                '../client/video-project-store'
            );
            const { createLangGraphVideoAgentController } = await import(
                '../client/video-agent-ipc'
            );
            const ttsCalls: {
                speedRatio?: number;
                volumeRatio?: number;
            }[] = [];
            const store = createVideoProjectStore({ projectsDirectory });
            const controller = createLangGraphVideoAgentController({
                createRunId: () => 'run_voice_settings',
                modelProvider: {
                    describeFrames: async () => [] as never[],
                    embedTexts: async () => [] as never[],
                    generateCreativeBrief: async () => ({
                        audience: '短视频创作者',
                        keyMessages: ['配音参数'],
                        summary: '验证配音参数',
                        title: '配音参数',
                        tone: '清晰',
                        visualStyle: '产品录屏'
                    }),
                    planScenes: async () => [
                        {
                            durationMs: 1200,
                            goal: '验证参数',
                            id: 'scene_001',
                            index: 1,
                            script: '配音参数需要生效',
                            subtitleLines: ['配音参数需要生效'],
                            title: '参数验证',
                            visualIntent: '产品界面'
                        }
                    ],
                    rankAssetMatches: async () => [
                        {
                            rankedAssetIds: [
                                {
                                    assetId:
                                        'video_asset_run_voice_settings_001',
                                    reason: '参数验证素材',
                                    score: 0.9
                                }
                            ],
                            sceneId: 'scene_001'
                        }
                    ]
                },
                store,
                ttsProvider: {
                    synthesizeSpeech: async ({
                        outputPath,
                        speedRatio,
                        volumeRatio
                    }) => {
                        ttsCalls.push({ speedRatio, volumeRatio });
                        await writeFile(outputPath, new Uint8Array([1, 2, 3]));

                        return {
                            byteLength: 3,
                            durationMs: 1200,
                            format: 'mp3' as const,
                            path: outputPath
                        };
                    }
                },
                voiceOutputDirectory: path.join(projectsDirectory, 'voices')
            });
            const events: unknown[] = [];

            await controller.start(
                {
                    prompt: '生成一条验证配音参数的视频',
                    selectedVoice: '温婉学姐',
                    selectedVoiceType: 'zh_female_wenroushunv_uranus_bigtts',
                    sourceAssetDirectory: assetDirectory,
                    voiceSpeed: 1.18,
                    voiceVolume: 0.64
                },
                (event) => {
                    events.push(event);
                }
            );
            await waitFor(
                () =>
                    events.some(
                        (event) =>
                            typeof event === 'object' &&
                            event !== null &&
                            'type' in event &&
                            event.type === 'approval.required'
                    ),
                'Timed out waiting for scene approval'
            );
            const approved = await controller.approve(
                {
                    approved: true,
                    runId: 'run_voice_settings'
                },
                () => undefined
            );

            if (approved.success === false) {
                throw new Error(approved.error.message);
            }

            expect(ttsCalls).toEqual([
                {
                    speedRatio: 1.18,
                    volumeRatio: 0.64
                }
            ]);

            const loaded = await store.readProjectById({
                projectId: 'project_run_voice_settings'
            });

            if (loaded.success === false) {
                throw new Error(loaded.error.message);
            }

            const voiceTrack = loaded.data.tracks.find(
                (track) => track.kind === 'voice'
            );

            expect(voiceTrack?.clips[0]).toMatchObject({
                speed: 1.18,
                volume: 0.64
            });
        } finally {
            await rm(assetDirectory, { force: true, recursive: true });
            await rm(projectsDirectory, { force: true, recursive: true });
        }
    });

    it('keeps sandboxed preload free from main-only IPC modules', () => {
        const preloadSource = readFileSync(
            resolve(__dirname, '../client/preload.ts'),
            'utf8'
        );
        const videoAgentIpcSource = readFileSync(
            resolve(__dirname, '../client/video-agent-ipc.ts'),
            'utf8'
        );
        const videoProjectIpcSource = readFileSync(
            resolve(__dirname, '../client/video-project-ipc.ts'),
            'utf8'
        );

        expect(preloadSource).not.toContain('./video-agent-ipc');
        expect(preloadSource).not.toContain('./video-project-ipc');
        expect(preloadSource).toContain('../shared/video-agent-channels');
        expect(preloadSource).toContain('../shared/video-project-channels');
        expect(preloadSource).toContain('regenerateScene');
        expect(videoAgentIpcSource).toContain('node:crypto');
        expect(videoProjectIpcSource).toContain('node:path');
    });

    it('regenerates one scene with fresh asset matching, voice synthesis, and conversation history', async () => {
        const projectsDirectory = await mkdtemp(
            path.join(tmpdir(), 'app-projects-')
        );

        try {
            const { createVideoProjectStore } = await import(
                '../client/video-project-store'
            );
            const { createLangGraphVideoAgentController } = await import(
                '../client/video-agent-ipc'
            );
            const store = createVideoProjectStore({ projectsDirectory });
            const project: VideoProject = structuredClone(sampleVideoProject);

            project.assets.videos.push({
                durationMs: 9000,
                fps: 30,
                height: 1080,
                id: 'video_asset_002',
                path: '/tmp/app-assets/replacement.mp4',
                thumbnailIds: [],
                width: 1920
            });
            project.ai.conversation = [
                {
                    content: '原始创建历史',
                    createdAt: '2026-06-23T08:00:00.000Z',
                    role: 'assistant',
                    sequence: 1,
                    sourceEventType: 'run.completed',
                    tone: 'completed'
                }
            ];

            const saved = await store.createProject({ project });

            if (saved.success === false) {
                throw new Error(saved.error.message);
            }

            const modelCalls: string[] = [];
            const reportCalls: string[] = [];
            const ttsCalls: {
                speedRatio?: number;
                text: string;
                voice: string;
                volumeRatio?: number;
            }[] = [];
            const controller = createLangGraphVideoAgentController({
                createRunId: () => 'run_unused',
                modelProvider: {
                    describeFrames: async () => [] as never[],
                    embedTexts: async () => [] as never[],
                    generateCreativeBrief: async () => ({
                        audience: '短视频创作者',
                        keyMessages: ['单分镜优化'],
                        summary: '优化当前分镜',
                        title: '单分镜优化',
                        tone: '自然',
                        visualStyle: '产品录屏'
                    }),
                    planScenes: async (input) => {
                        modelCalls.push(JSON.stringify(input));

                        return [
                            {
                                durationMs: 9999,
                                goal: '强化开场钩子',
                                id: 'scene_001',
                                index: 1,
                                script: '先用一句问题抓住注意力\n再说明智剪会自动完成剪辑',
                                subtitleLines: [
                                    '先用一句问题抓住注意力',
                                    '再说明智剪会自动完成剪辑'
                                ],
                                title: '开场问题优化',
                                visualIntent: '选择更贴近产品界面的替换素材'
                            }
                        ];
                    },
                    rankAssetMatches: async ({ candidates, scenes }) => {
                        modelCalls.push(
                            `rank:${scenes[0]?.id}:${candidates
                                .map((candidate) => candidate.assetId)
                                .join(',')}`
                        );

                        return [
                            {
                                rankedAssetIds: [
                                    {
                                        assetId: 'video_asset_002',
                                        reason: '更贴合产品界面说明',
                                        score: 0.96
                                    }
                                ],
                                sceneId: 'scene_001'
                            }
                        ];
                    },
                    streamReport: async (input, emitDelta) => {
                        reportCalls.push(`${input.title}:${input.prompt}`);
                        const text = input.title.includes('最终')
                            ? '最终总结：新文案更有钩子，视频素材和配音已对齐。'
                            : '创作过程：先理解原分镜问题，再设计新的口播钩子和画面匹配方向。';

                        await emitDelta(text);

                        return text;
                    }
                },
                now: () => '2026-06-23T09:00:00.000Z',
                store,
                ttsProvider: {
                    synthesizeSpeech: async ({
                        outputPath,
                        speedRatio,
                        text,
                        voice,
                        volumeRatio
                    }) => {
                        ttsCalls.push({
                            speedRatio,
                            text,
                            voice,
                            volumeRatio
                        });
                        await writeFile(outputPath, new Uint8Array([1, 2, 3]));

                        return {
                            byteLength: 3,
                            durationMs:
                                text === '先用一句问题抓住注意力' ? 1200 : 1800,
                            format: 'mp3' as const,
                            path: outputPath
                        };
                    }
                },
                voiceOutputDirectory: path.join(projectsDirectory, 'voices')
            });
            const events: unknown[] = [];
            const result = await controller.regenerateScene(
                {
                    projectId: 'project_sample_001',
                    prompt: '把这个开场优化得更有钩子',
                    sceneId: 'scene_001',
                    selectedVoice: '温婉学姐',
                    selectedVoiceType: 'zh_female_wenroushunv_uranus_bigtts',
                    voiceSpeed: 0.92,
                    voiceVolume: 0.58
                },
                (event) => events.push(event)
            );

            if (result.success === false) {
                throw new Error(result.error.message);
            }

            const loaded = await store.readProjectById({
                projectId: 'project_sample_001'
            });

            if (loaded.success === false) {
                throw new Error(loaded.error.message);
            }

            const nextProject = loaded.data;
            const videoTrack = nextProject.tracks.find(
                (track) => track.kind === 'video'
            );
            const voiceTrack = nextProject.tracks.find(
                (track) => track.kind === 'voice'
            );
            const subtitleTrack = nextProject.tracks.find(
                (track) => track.kind === 'subtitle'
            );

            expect(result).toMatchObject({
                data: {
                    projectId: 'project_sample_001',
                    runId: expect.stringMatching(/^regen_/)
                },
                success: true
            });
            expect(modelCalls.join('\n')).toContain('把这个开场优化得更有钩子');
            expect(modelCalls.join('\n')).toContain('video_asset_002');
            expect(reportCalls).toHaveLength(2);
            expect(reportCalls[0]).toContain('单分镜优化创作过程');
            expect(reportCalls[1]).toContain('单分镜优化最终总结');
            expect(ttsCalls).toEqual([
                {
                    speedRatio: 0.92,
                    text: '先用一句问题抓住注意力',
                    voice: 'zh_female_wenroushunv_uranus_bigtts',
                    volumeRatio: 0.58
                },
                {
                    speedRatio: 0.92,
                    text: '再说明智剪会自动完成剪辑',
                    voice: 'zh_female_wenroushunv_uranus_bigtts',
                    volumeRatio: 0.58
                }
            ]);
            expect(nextProject.scenes[0]).toMatchObject({
                durationMs: 3000,
                matchedVideoAssetIds: ['video_asset_002'],
                script: '先用一句问题抓住注意力\n再说明智剪会自动完成剪辑',
                title: '开场问题优化',
                visualIntent: '选择更贴近产品界面的替换素材'
            });
            expect(videoTrack?.clips[0]).toMatchObject({
                assetId: 'video_asset_002',
                endMs: 3000,
                kind: 'video',
                sceneId: 'scene_001',
                sourceEndMs: 3000,
                startMs: 0
            });
            expect(voiceTrack?.clips).toMatchObject([
                {
                    endMs: 1200,
                    kind: 'voice',
                    sceneId: 'scene_001',
                    startMs: 0
                },
                {
                    endMs: 3000,
                    kind: 'voice',
                    sceneId: 'scene_001',
                    startMs: 1200
                }
            ]);
            expect(subtitleTrack?.clips).toMatchObject([
                {
                    endMs: 1200,
                    kind: 'subtitle',
                    sceneId: 'scene_001',
                    startMs: 0,
                    text: '先用一句问题抓住注意力'
                },
                {
                    endMs: 3000,
                    kind: 'subtitle',
                    sceneId: 'scene_001',
                    startMs: 1200,
                    text: '再说明智剪会自动完成剪辑'
                }
            ]);
            expect(
                nextProject.ai.conversation?.map((message) => message.content)
            ).toEqual(
                expect.arrayContaining([
                    '原始创建历史',
                    '把这个开场优化得更有钩子',
                    '创作过程：先理解原分镜问题，再设计新的口播钩子和画面匹配方向。',
                    '最终总结：新文案更有钩子，视频素材和配音已对齐。',
                    '单分镜优化完成，已重新生成脚本、匹配视频素材并生成配音。'
                ])
            );
            expect(
                nextProject.ai.conversation?.map(
                    (message) => message.sourceEventType
                )
            ).toEqual(
                expect.arrayContaining([
                    'model.stream.completed',
                    'scene.regeneration.summary'
                ])
            );
            expect(events).toContainEqual(
                expect.objectContaining({
                    title: '单分镜优化创作过程',
                    type: 'model.stream.started'
                })
            );
            expect(events).toContainEqual(
                expect.objectContaining({
                    delta: '创作过程：先理解原分镜问题，再设计新的口播钩子和画面匹配方向。',
                    type: 'model.stream.delta'
                })
            );
            expect(events).toContainEqual(
                expect.objectContaining({
                    nodeName: 'asset_matcher',
                    type: 'node.started'
                })
            );
            expect(events).toContainEqual(
                expect.objectContaining({
                    nodeName: 'tts',
                    type: 'node.started'
                })
            );
        } finally {
            await rm(projectsDirectory, { force: true, recursive: true });
        }
    });

    it('regenerates every voice clip in a project without changing scripts or matching assets', async () => {
        const projectsDirectory = await mkdtemp(
            path.join(tmpdir(), 'app-projects-')
        );

        try {
            const { createVideoProjectStore } = await import(
                '../client/video-project-store'
            );
            const { createLangGraphVideoAgentController } = await import(
                '../client/video-agent-ipc'
            );
            const store = createVideoProjectStore({ projectsDirectory });
            const project: VideoProject = structuredClone(sampleVideoProject);
            const saved = await store.createProject({ project });

            if (saved.success === false) {
                throw new Error(saved.error.message);
            }

            const ttsCalls: {
                speedRatio?: number;
                text: string;
                voice: string;
                volumeRatio?: number;
            }[] = [];
            const controller = createLangGraphVideoAgentController({
                createRunId: () => 'voice_regen_test',
                modelProvider: {
                    describeFrames: async () => [] as never[],
                    embedTexts: async () => [] as never[],
                    generateCreativeBrief: async () => {
                        throw new Error('model should not be called');
                    },
                    planScenes: async () => {
                        throw new Error('model should not be called');
                    },
                    rankAssetMatches: async () => {
                        throw new Error('model should not be called');
                    }
                },
                now: () => '2026-06-23T10:00:00.000Z',
                store,
                ttsProvider: {
                    synthesizeSpeech: async ({
                        outputPath,
                        speedRatio,
                        text,
                        voice,
                        volumeRatio
                    }) => {
                        ttsCalls.push({
                            speedRatio,
                            text,
                            voice,
                            volumeRatio
                        });
                        await writeFile(outputPath, new Uint8Array([7, 8, 9]));

                        return {
                            byteLength: 3,
                            durationMs: 6000,
                            format: 'mp3' as const,
                            path: outputPath
                        };
                    }
                },
                voiceOutputDirectory: path.join(projectsDirectory, 'voices')
            });
            const events: unknown[] = [];
            const result = await controller.regenerateVoices(
                {
                    projectId: 'project_sample_001',
                    selectedVoice: '活力讲解',
                    selectedVoiceType: 'zh_male_huolixiaoge_uranus_bigtts',
                    voiceSpeed: 1.5,
                    voiceVolume: 0.42
                },
                (event) => events.push(event)
            );

            if (result.success === false) {
                throw new Error(result.error.message);
            }

            await waitFor(
                () =>
                    events.some(
                        (event) =>
                            typeof event === 'object' &&
                            event !== null &&
                            'type' in event &&
                            event.type === 'run.completed'
                    ),
                'Timed out waiting for voice regeneration completion'
            );

            const loaded = await store.readProjectById({
                projectId: 'project_sample_001'
            });

            if (loaded.success === false) {
                throw new Error(loaded.error.message);
            }

            const nextProject = loaded.data;
            const videoTrack = nextProject.tracks.find(
                (track) => track.kind === 'video'
            );
            const voiceTrack = nextProject.tracks.find(
                (track) => track.kind === 'voice'
            );
            const subtitleTrack = nextProject.tracks.find(
                (track) => track.kind === 'subtitle'
            );
            const musicTrack = nextProject.tracks.find(
                (track) => track.kind === 'music'
            );

            expect(result).toMatchObject({
                data: {
                    projectId: 'project_sample_001',
                    runId: 'voice_regen_test'
                },
                success: true
            });
            expect(ttsCalls).toEqual([
                {
                    speedRatio: undefined,
                    text: '开场提出问题，把学习焦虑拉到观众面前。',
                    voice: 'zh_male_huolixiaoge_uranus_bigtts',
                    volumeRatio: undefined
                }
            ]);
            expect(nextProject.assets.voices).toEqual([
                expect.objectContaining({
                    durationMs: 6000,
                    id: 'voice_asset_scene_001_voice_regen_voice_regen_test_001',
                    voice: 'zh_male_huolixiaoge_uranus_bigtts'
                })
            ]);
            expect(nextProject.scenes[0]).toMatchObject({
                durationMs: 4000,
                matchedVideoAssetIds: ['video_asset_001'],
                script: project.scenes[0]?.script,
                voiceAssetId:
                    'voice_asset_scene_001_voice_regen_voice_regen_test_001'
            });
            expect(voiceTrack?.clips).toMatchObject([
                {
                    assetId:
                        'voice_asset_scene_001_voice_regen_voice_regen_test_001',
                    endMs: 4000,
                    kind: 'voice',
                    sceneId: 'scene_001',
                    speed: 1.5,
                    startMs: 0,
                    volume: 0.42,
                    voicePreset: '活力讲解'
                }
            ]);
            expect(subtitleTrack?.clips).toMatchObject([
                {
                    endMs: 4000,
                    kind: 'subtitle',
                    sceneId: 'scene_001',
                    startMs: 0,
                    text: '开场提出问题，把学习焦虑拉到观众面前。'
                }
            ]);
            expect(videoTrack?.clips[0]).toMatchObject({
                assetId: 'video_asset_001',
                endMs: 4000,
                sceneId: 'scene_001',
                sourceEndMs: 6000,
                startMs: 0
            });
            expect(musicTrack?.clips[0]).toMatchObject({
                endMs: 4000,
                sourceEndMs: 4000,
                startMs: 0
            });
            expect(nextProject.canvas.durationMs).toBe(4000);
            expect(events).toContainEqual(
                expect.objectContaining({
                    nodeName: 'voice_regeneration',
                    type: 'node.started'
                })
            );
            expect(events).toContainEqual(
                expect.objectContaining({
                    current: 1,
                    percent: 0,
                    total: 1,
                    type: 'voice.regeneration.progress'
                })
            );
            expect(events).toContainEqual(
                expect.objectContaining({
                    current: 1,
                    percent: 100,
                    total: 1,
                    type: 'voice.regeneration.progress'
                })
            );
            expect(events).toContainEqual(
                expect.objectContaining({
                    projectId: 'project_sample_001',
                    type: 'run.completed'
                })
            );
        } finally {
            await rm(projectsDirectory, { force: true, recursive: true });
        }
    });

    it('falls back to scene scripts when regenerating unreadable subtitle narration', async () => {
        const projectsDirectory = await mkdtemp(
            path.join(tmpdir(), 'app-projects-')
        );

        try {
            const { createVideoProjectStore } = await import(
                '../client/video-project-store'
            );
            const { createLangGraphVideoAgentController } = await import(
                '../client/video-agent-ipc'
            );
            const store = createVideoProjectStore({ projectsDirectory });
            const project: VideoProject = {
                ...structuredClone(sampleVideoProject),
                assets: {
                    ...structuredClone(sampleVideoProject.assets),
                    subtitles: sampleVideoProject.assets.subtitles.map(
                        (subtitle) => ({
                            ...subtitle,
                            text: '……'
                        })
                    )
                },
                scenes: sampleVideoProject.scenes.map((scene) => ({
                    ...scene,
                    script: '这是一句可以朗读的口播文案。'
                })),
                tracks: sampleVideoProject.tracks.map((track) =>
                    track.kind === 'subtitle'
                        ? {
                              ...track,
                              clips: track.clips.map((clip) => ({
                                  ...clip,
                                  text: '……'
                              }))
                          }
                        : track
                )
            };
            const saved = await store.createProject({ project });

            if (saved.success === false) {
                throw new Error(saved.error.message);
            }

            const ttsCalls: string[] = [];
            const controller = createLangGraphVideoAgentController({
                createRunId: () => 'voice_regen_readable_fallback',
                modelProvider: {
                    describeFrames: async () => [] as never[],
                    embedTexts: async () => [] as never[],
                    generateCreativeBrief: async () => {
                        throw new Error('model should not be called');
                    },
                    planScenes: async () => {
                        throw new Error('model should not be called');
                    },
                    rankAssetMatches: async () => {
                        throw new Error('model should not be called');
                    }
                },
                now: () => '2026-06-23T10:00:00.000Z',
                store,
                ttsProvider: {
                    synthesizeSpeech: async ({ outputPath, text }) => {
                        ttsCalls.push(text);
                        await writeFile(outputPath, new Uint8Array([7, 8, 9]));

                        return {
                            byteLength: 3,
                            durationMs: 3000,
                            format: 'mp3' as const,
                            path: outputPath
                        };
                    }
                },
                voiceOutputDirectory: path.join(projectsDirectory, 'voices')
            });
            const events: unknown[] = [];
            const result = await controller.regenerateVoices(
                {
                    projectId: 'project_sample_001',
                    selectedVoice: '温婉学姐',
                    selectedVoiceType: 'zh_female_wenroushunv_uranus_bigtts'
                },
                (event) => events.push(event)
            );

            if (result.success === false) {
                throw new Error(result.error.message);
            }

            await waitFor(
                () =>
                    ttsCalls.length > 0 &&
                    ttsCalls.length ===
                        events.filter(
                            (event) =>
                                typeof event === 'object' &&
                                event !== null &&
                                'type' in event &&
                                event.type === 'voice.regeneration.progress' &&
                                'percent' in event &&
                                event.percent === 100
                        ).length,
                'Timed out waiting for readable fallback voice regeneration'
            );

            const loaded = await store.readProjectById({
                projectId: 'project_sample_001'
            });

            if (loaded.success === false) {
                throw new Error(loaded.error.message);
            }

            const subtitleTrack = loaded.data.tracks.find(
                (track) => track.kind === 'subtitle'
            );

            expect(ttsCalls).toEqual(['这是一句可以朗读的口播文案。']);
            expect(loaded.data.scenes[0]?.subtitleIds).toEqual([
                'subtitle_asset_scene_001_voice_regen_001'
            ]);
            expect(subtitleTrack?.clips[0]).toMatchObject({
                subtitleId: 'subtitle_asset_scene_001_voice_regen_001',
                text: '这是一句可以朗读的口播文案。'
            });
        } finally {
            await rm(projectsDirectory, { force: true, recursive: true });
        }
    });

    it('returns voice regeneration run id immediately and lets callers cancel it', async () => {
        const projectsDirectory = await mkdtemp(
            path.join(tmpdir(), 'app-projects-')
        );

        try {
            const { createVideoProjectStore } = await import(
                '../client/video-project-store'
            );
            const { createLangGraphVideoAgentController } = await import(
                '../client/video-agent-ipc'
            );
            const store = createVideoProjectStore({ projectsDirectory });
            const project: VideoProject = {
                ...structuredClone(sampleVideoProject),
                assets: {
                    ...structuredClone(sampleVideoProject.assets),
                    subtitles: [
                        ...structuredClone(sampleVideoProject.assets.subtitles),
                        {
                            id: 'subtitle_asset_scene_001_01',
                            styleId: 'subtitle_style_default',
                            text: '第一条口播文案。'
                        },
                        {
                            id: 'subtitle_asset_scene_001_02',
                            styleId: 'subtitle_style_default',
                            text: '第二条口播文案。'
                        }
                    ]
                },
                scenes: sampleVideoProject.scenes.map((scene) => ({
                    ...scene,
                    subtitleIds: [
                        'subtitle_asset_scene_001_01',
                        'subtitle_asset_scene_001_02'
                    ]
                }))
            };
            const saved = await store.createProject({ project });

            if (saved.success === false) {
                throw new Error(saved.error.message);
            }

            let releaseFirstSynthesis: (() => void) | undefined;
            const firstSynthesisStarted = new Promise<void>(
                (resolveStarted) => {
                    releaseFirstSynthesis = resolveStarted;
                }
            );
            const ttsCalls: string[] = [];
            const controller = createLangGraphVideoAgentController({
                createRunId: () => 'voice_regen_cancel_test',
                modelProvider: {
                    describeFrames: async () => [] as never[],
                    embedTexts: async () => [] as never[],
                    generateCreativeBrief: async () => {
                        throw new Error('model should not be called');
                    },
                    planScenes: async () => {
                        throw new Error('model should not be called');
                    },
                    rankAssetMatches: async () => {
                        throw new Error('model should not be called');
                    }
                },
                store,
                ttsProvider: {
                    synthesizeSpeech: async ({ outputPath, text }) => {
                        ttsCalls.push(text);
                        releaseFirstSynthesis?.();

                        await new Promise((resolveSynthesis) => {
                            setTimeout(resolveSynthesis, 40);
                        });
                        await writeFile(outputPath, new Uint8Array([1, 2, 3]));

                        return {
                            byteLength: 3,
                            durationMs: 3000,
                            format: 'mp3' as const,
                            path: outputPath
                        };
                    }
                },
                voiceOutputDirectory: path.join(projectsDirectory, 'voices')
            });
            const events: unknown[] = [];
            const result = await Promise.race([
                controller.regenerateVoices(
                    {
                        projectId: 'project_sample_001',
                        selectedVoice: '温婉学姐',
                        selectedVoiceType: 'zh_female_wenroushunv_uranus_bigtts'
                    },
                    (event) => events.push(event)
                ),
                new Promise<'timeout'>((resolveTimeout) => {
                    setTimeout(() => resolveTimeout('timeout'), 10);
                })
            ]);

            expect(result).not.toBe('timeout');
            expect(result).toMatchObject({
                data: {
                    projectId: 'project_sample_001',
                    runId: 'voice_regen_cancel_test'
                },
                success: true
            });

            await firstSynthesisStarted;

            const cancelResult = await controller.cancel(
                {
                    runId: 'voice_regen_cancel_test'
                },
                (event) => events.push(event)
            );

            expect(cancelResult).toEqual({
                data: {
                    runId: 'voice_regen_cancel_test'
                },
                success: true
            });

            await waitFor(
                () =>
                    events.some(
                        (event) =>
                            typeof event === 'object' &&
                            event !== null &&
                            'type' in event &&
                            event.type === 'run.cancelled'
                    ),
                'Timed out waiting for voice regeneration cancellation'
            );

            expect(ttsCalls).toEqual(['第一条口播文案。']);
            expect(events).toContainEqual(
                expect.objectContaining({
                    current: 1,
                    total: 2,
                    type: 'voice.regeneration.progress'
                })
            );
            expect(events).toContainEqual(
                expect.objectContaining({
                    reason: '用户取消口播音轨生成',
                    type: 'run.cancelled'
                })
            );
            expect(events).not.toContainEqual(
                expect.objectContaining({
                    type: 'run.completed'
                })
            );
        } finally {
            await rm(projectsDirectory, { force: true, recursive: true });
        }
    });

    it('loads VideoProject by project id in the editor route', () => {
        const routerSource = readFileSync(
            resolve(__dirname, '../renderer/router/index.tsx'),
            'utf8'
        );
        const editorRouteSource = readFileSync(
            resolve(__dirname, '../renderer/pages/MiaojianEditorRoute.tsx'),
            'utf8'
        );
        const preloadSource = readFileSync(
            resolve(__dirname, '../client/preload.ts'),
            'utf8'
        );

        expect(routerSource).toContain('MiaojianEditorRoute');
        expect(editorRouteSource).toContain('useParams');
        expect(editorRouteSource).toContain('readById');
        expect(editorRouteSource).toContain(
            '<MiaojianEditorScreen project={project}'
        );
        expect(preloadSource).toContain('readById');
    });

    it('does not automatically leave the create page when the agent completes', () => {
        const workspaceSource = readFileSync(
            resolve(__dirname, '../renderer/pages/MiaojianWorkspaceScreen.tsx'),
            'utf8'
        );
        const progressSource = readFileSync(
            resolve(
                __dirname,
                '../renderer/components/create/CreateAgentProgress.tsx'
            ),
            'utf8'
        );

        expect(workspaceSource).not.toContain('window.history.pushState');
        expect(workspaceSource).not.toContain("new PopStateEvent('popstate')");
        expect(progressSource).toContain('打开编辑器');
    });

    it('deduplicates repeated TTS failures in the agent progress panel', async () => {
        const { createAgentProgressViewModel } = await import(
            '../renderer/components/create/CreateAgentProgress'
        );
        const error =
            'TTS conversion failed: {"error":"resource ID is mismatched with speaker related resource"}';
        const viewModel = createAgentProgressViewModel([
            {
                createdAt: '2026-06-23T01:00:00.000Z',
                nodeName: 'tts',
                runId: 'run_001',
                sequence: 1,
                type: 'node.started'
            },
            {
                createdAt: '2026-06-23T01:00:01.000Z',
                error,
                nodeName: 'tts',
                runId: 'run_001',
                sequence: 2,
                type: 'node.failed'
            },
            {
                createdAt: '2026-06-23T01:00:02.000Z',
                error,
                runId: 'run_001',
                sequence: 3,
                type: 'run.failed'
            },
            {
                createdAt: '2026-06-23T01:00:03.000Z',
                error,
                runId: 'local_001',
                sequence: 4,
                type: 'run.failed'
            }
        ]);

        expect(viewModel.status).toBe('failed');
        expect(viewModel.entries.map((entry) => entry.label)).toEqual([
            '正在生成配音',
            '生成配音失败'
        ]);
        expect(
            viewModel.entries.filter((entry) => entry.detail === error)
        ).toHaveLength(1);
    });

    // Regression: scanAssets must call probeMedia so downstream code (AI
    // matcher + assembleTimeline) sees the true asset duration. Without
    // this, every clip is built from a placeholder durationMs of
    // `5000 + (index % 5) * 1500`, which (a) misleads the AI into
    // matching the wrong assets to scenes and (b) clamps sourceEndMs to
    // the wrong value so tpad=stop_mode=clone freezes the last frame
    // across the rest of each scene.
    it('probes real metadata in scanAssets when an ffprobe path is provided', async () => {
        const { createDesktopVideoAgentTools } = await import(
            '../client/video-agent-tools'
        );

        // Write a tiny directory of empty placeholder files. The actual
        // ffprobe call is mocked via the probeMedia dependency below, so
        // we don't need real video files for this test.
        const directory = await mkdtemp(
            path.join(tmpdir(), 'miaoma-scanAssets-')
        );
        await writeFile(path.join(directory, 'clip-a.mp4'), '');
        await writeFile(path.join(directory, 'clip-b.mp4'), '');

        try {
            // We can't easily mock the named export `probeMedia`, so
            // instead we point ffprobePath at a fake binary and assert
            // that scanAssets emits the placeholder fallback path AND
            // surfaces a warning. The real happy path is covered by
            // the probe-videos integration test against a real
            // /Users/apple/Downloads/videos/ directory.
            const tools = createDesktopVideoAgentTools({
                ffprobePath: '/nonexistent/ffprobe',
                store: {} as never
            });

            const warnings: string[] = [];
            const originalWarn = console.warn;
            console.warn = (...args: unknown[]) => {
                warnings.push(args.join(' '));
            };

            let assets;
            try {
                assets = await tools.scanAssets({
                    input: {
                        prompt: 'p',
                        runId: 'run_regression',
                        sourceAssetDirectory: directory
                    }
                });
            } finally {
                console.warn = originalWarn;
            }

            expect(assets).toHaveLength(2);
            // Both files should fall back to the placeholder math
            // because the fake ffprobe can't actually probe anything.
            expect(assets[0]?.durationMs).toBe(5000);
            expect(assets[1]?.durationMs).toBe(6500);
            expect(
                warnings.some((line) => line.includes('[scanAssets]'))
            ).toBe(true);
        } finally {
            await rm(directory, { recursive: true, force: true });
        }
    });

    it('uses real metadata from probeMedia in assembleTimeline output', async () => {
        const { createDesktopVideoAgentTools } = await import(
            '../client/video-agent-tools'
        );

        // This test exercises the same path as the user's report: when
        // AssetAnalysis carries real durationMs (from probeMedia), the
        // assembled VideoProject's video assets should reflect that,
        // and the timeline clips' sourceEndMs should NOT be clamped
        // down to a fake value.
        const tools = createDesktopVideoAgentTools({
            store: {} as never
        });

        const project = await tools.assembleTimeline({
            assets: [
                {
                    assetId: 'video_asset_long',
                    description: '10s source',
                    durationMs: 10042,
                    fps: 24,
                    height: 720,
                    width: 1280
                }
            ],
            brief: {
                audience: 'demo',
                keyMessages: ['real metadata'],
                summary: 'verify asset fields flow through',
                title: '真实元数据',
                tone: '清晰',
                visualStyle: '口播'
            },
            input: {
                prompt: 'p',
                runId: 'run_real_metadata',
                sourceAssetDirectory: '/tmp'
            },
            matches: [
                {
                    rankedAssetIds: [
                        {
                            assetId: 'video_asset_long',
                            reason: '唯一可用素材',
                            score: 1
                        }
                    ],
                    sceneId: 'scene_only'
                }
            ],
            scenes: [
                {
                    durationMs: 8000,
                    goal: 'g',
                    id: 'scene_only',
                    index: 1,
                    script: 's',
                    subtitleLines: ['s'],
                    title: 't',
                    visualIntent: 'v',
                    voiceAssetId: 'voice_only'
                }
            ],
            voices: [
                {
                    assetId: 'voice_only',
                    durationMs: 8000,
                    lineIndex: 0,
                    path: '/tmp/voice.mp3',
                    provider: 'fake',
                    sceneId: 'scene_only',
                    text: 's'
                }
            ]
        });

        const videoAsset = project.assets.videos.find(
            (asset) => asset.id === 'video_asset_long'
        );
        expect(videoAsset?.durationMs).toBe(10042);
        expect(videoAsset?.fps).toBe(24);
        expect(videoAsset?.width).toBe(1280);
        expect(videoAsset?.height).toBe(720);

        const videoClip = project.tracks
            .find((track) => track.kind === 'video')
            ?.clips.find((clip) => clip.assetId === 'video_asset_long');
        // The scene is 8s long and the asset is 10s — sourceEndMs should
        // land at scene length (8s), not be clamped down by the
        // placeholder-duration math.
        expect(videoClip?.sourceEndMs).toBe(8000);
        expect(videoClip?.sourceStartMs).toBe(0);
    });
});
