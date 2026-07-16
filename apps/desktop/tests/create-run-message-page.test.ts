/* */
import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';

import { AgentConversationTimeline } from '../renderer/components/agent/AgentConversationTimeline';
import {
    type AgentRunConversationEvent,
    createAgentConversationViewModel
} from '../renderer/mappers/agent-run-conversation';
import { MiaojianCreateRunScreen } from '../renderer/pages/MiaojianCreateRunScreen';
import { appRoutes } from '../renderer/router';
import type { DesktopAgentRunEvent } from '../shared/video-agent';

const baseEvent = {
    createdAt: '2026-06-23T10:00:00.000Z',
    runId: 'run-message-001'
};

const runStartedEvent: DesktopAgentRunEvent = {
    ...baseEvent,
    input: {
        prompt: '生成一条介绍智剪智能剪辑的视频',
        selectedVoice: '温婉学姐',
        selectedVoiceType: 'zh_female_wenroushunv_uranus_bigtts',
        sourceAssetDirectory: '/Users/heyi/Movies/magicut'
    },
    sequence: 1,
    type: 'run.started'
};

describe('create run message page', () => {
    it('registers /create/runs/:runId and renders the Pencil message-page shell', () => {
        expect(
            appRoutes.some((route) => route.path === '/create/runs/:runId')
        ).toBe(true);

        const html = renderToStaticMarkup(
            createElement(MiaojianCreateRunScreen, {
                runId: 'run-message-001'
            })
        );

        expect(html).toContain('data-create-run-message-page="true"');
        expect(html).toContain('data-window-drag-region="true"');
        expect(html).toContain('h-10');
        expect(html).toContain('[app-region:drag]');
        expect(html).toContain('bg-[#08090D]');
        expect(html).toContain('data-create-run-chat-shell="true"');
        expect(html).toContain('data-create-run-chat-body="true"');
        expect(html).toContain('data-agent-stage-nav="true"');
        expect(html).toContain('fixed right-8 top-[88px]');
        expect(html).not.toContain('w-[1168px]');
        expect(html).toContain('w-[860px]');
        expect(html).toContain('gap-[14px]');
        expect(html).not.toContain('智能创作执行中');
        expect(html).not.toContain('继续补充创作要求，或要求智能体修改分镜');
        expect(html).not.toContain(
            '例如：缩短到 90 秒、加重技术感、换成沉稳男声'
        );
        expect(html).not.toContain('输入你的回复');
        expect(html).not.toContain('aria-label="发送"');
        expect(html).not.toContain('CreateAgentProgress');
    });

    it('aggregates model stream deltas into one assistant message and keeps structured progress separate', () => {
        const messages = createAgentConversationViewModel({
            events: [
                runStartedEvent,
                {
                    ...baseEvent,
                    messageId: 'creative_brief-content-understanding',
                    nodeName: 'creative_brief',
                    sequence: 2,
                    title: '内容理解',
                    type: 'model.stream.started'
                },
                {
                    ...baseEvent,
                    delta: '我会先提炼主题，',
                    messageId: 'creative_brief-content-understanding',
                    nodeName: 'creative_brief',
                    sequence: 3,
                    type: 'model.stream.delta'
                },
                {
                    ...baseEvent,
                    delta: '再拆解分镜。',
                    messageId: 'creative_brief-content-understanding',
                    nodeName: 'creative_brief',
                    sequence: 4,
                    type: 'model.stream.delta'
                },
                {
                    ...baseEvent,
                    messageId: 'creative_brief-content-understanding',
                    nodeName: 'creative_brief',
                    sequence: 5,
                    type: 'model.stream.completed'
                },
                {
                    ...baseEvent,
                    nodeName: 'asset_scan',
                    sequence: 6,
                    type: 'node.started'
                },
                {
                    ...baseEvent,
                    nodeName: 'asset_scan',
                    sequence: 7,
                    type: 'node.completed'
                }
            ] as AgentRunConversationEvent[]
        }).messages;

        expect(messages).toEqual(
            expect.arrayContaining([
                expect.objectContaining({
                    content: '生成一条介绍智剪智能剪辑的视频',
                    role: 'user'
                }),
                expect.objectContaining({
                    content: '我会先提炼主题，再拆解分镜。',
                    nodeName: 'creative_brief',
                    role: 'assistant',
                    sourceEventType: 'model.stream.completed'
                }),
                expect.objectContaining({
                    blocks: expect.arrayContaining([
                        expect.objectContaining({
                            items: expect.arrayContaining([
                                expect.objectContaining({
                                    detail: '加载制片规范与文稿',
                                    label: '01 准备阶段',
                                    status: 'completed'
                                }),
                                expect.objectContaining({
                                    detail: '生成分镜并等待确认',
                                    label: '02 创建分镜',
                                    status: 'waiting'
                                }),
                                expect.objectContaining({
                                    detail: '合成口播并匹配素材',
                                    label: '03 配音生成',
                                    status: 'waiting'
                                }),
                                expect.objectContaining({
                                    detail: '输出预览并进入编辑',
                                    label: '04 视频生成',
                                    status: 'waiting'
                                })
                            ]),
                            type: 'progress'
                        })
                    ]),
                    content:
                        '我已收到创作需求。接下来会按即时协作流程推进：先拆解目标受众与叙事节奏，再生成分镜规划、匹配素材、选择口播音色，最后进入编辑器等待你确认细节。',
                    role: 'system'
                })
            ])
        );
    });

    it('dedupes repeated run events and turns scene-plan approval into a confirmation table', () => {
        const approvalEvent: DesktopAgentRunEvent = {
            ...baseEvent,
            approval: {
                payload: {
                    scenes: [
                        {
                            durationMs: 3200,
                            goal: '建立主题',
                            id: 'scene_001',
                            index: 1,
                            script: '智剪让视频创作更快',
                            subtitleLines: ['智剪让视频创作更快'],
                            title: '开场',
                            visualIntent: '产品界面'
                        }
                    ]
                },
                type: 'scene-plan'
            },
            sequence: 8,
            type: 'approval.required'
        };
        const messages = createAgentConversationViewModel({
            events: [
                runStartedEvent,
                approvalEvent,
                approvalEvent,
                {
                    ...baseEvent,
                    approved: true,
                    content: '确认分镜，继续生成',
                    sequence: 9,
                    type: 'user.reply'
                }
            ]
        }).messages;

        const approvalMessage = messages.find(
            (message) => message.tone === 'waiting'
        );

        expect(
            messages.filter((message) => message.tone === 'waiting')
        ).toHaveLength(1);
        expect(approvalMessage?.blocks).toEqual(
            expect.arrayContaining([
                expect.objectContaining({
                    columns: ['分镜', '画面意图', '口播字幕', '时长'],
                    rows: [['开场', '产品界面', '智剪让视频创作更快', '3.2s']],
                    type: 'table'
                })
            ])
        );
        expect(messages.at(-1)).toMatchObject({
            content: '确认分镜，继续生成',
            role: 'user',
            sourceEventType: 'user.reply'
        });
    });

    it('renders user request, running plan, confirmation reply, and completion overview in the Pencil chat structure', () => {
        const viewModel = createAgentConversationViewModel({
            events: [
                runStartedEvent,
                {
                    ...baseEvent,
                    nodeName: 'asset_scan',
                    sequence: 2,
                    type: 'node.started'
                },
                {
                    ...baseEvent,
                    messageId: 'creative_brief-content-understanding',
                    nodeName: 'creative_brief',
                    sequence: 3,
                    title: '内容理解',
                    type: 'model.stream.started'
                },
                {
                    ...baseEvent,
                    approval: {
                        payload: {
                            scenes: [
                                {
                                    durationMs: 3200,
                                    id: 'scene_001',
                                    script: '智剪让视频创作更快',
                                    subtitleLines: ['智剪让视频创作更快'],
                                    title: '开场',
                                    visualIntent: '产品界面'
                                }
                            ]
                        },
                        type: 'scene-plan'
                    },
                    sequence: 4,
                    type: 'approval.required'
                },
                {
                    ...baseEvent,
                    approved: true,
                    content: '确认并继续',
                    sequence: 5,
                    type: 'user.reply'
                },
                {
                    ...baseEvent,
                    projectId: 'project_run-message-001',
                    savedProjectPath: '/tmp/project.json',
                    sequence: 6,
                    type: 'run.completed'
                }
            ]
        });
        const html = renderToStaticMarkup(
            createElement(AgentConversationTimeline, {
                viewModel
            })
        );

        expect(html).toContain('data-message-kind="user-request"');
        expect(html).toContain('w-[760px]');
        expect(html).toContain('视频画面');
        expect(html).toContain('智能匹配素材');
        expect(html).toContain('旁白配音');
        expect(html).toContain('温婉学姐');
        expect(html).toContain('data-message-kind="assistant-report"');
        expect(html).toContain('agent-typing-placeholder');
        expect(html).toContain('data-message-kind="execution-plan"');
        expect(html).toContain('01 准备阶段');
        expect(html).toContain('02 创建分镜');
        expect(html).toContain('03 配音生成');
        expect(html).toContain('04 视频生成');
        expect(html).toContain('data-message-kind="user-reply"');
        expect(html).toContain('确认并继续');
        expect(html).toContain('data-message-kind="video-overview"');
        expect(html).toContain('视频概览');
        expect(html).toContain('视频制作完成，可进入编辑器预览并微调轨道。');
    });

    it('renders typewriter stream output, async loading messages, and the fixed stage directory', () => {
        const viewModel = createAgentConversationViewModel({
            events: [
                runStartedEvent,
                {
                    ...baseEvent,
                    messageId: 'scene_planner-storyboard-breakdown',
                    nodeName: 'scene_planner',
                    sequence: 2,
                    title: '文稿拆解为可执行分镜',
                    type: 'model.stream.started'
                },
                {
                    ...baseEvent,
                    delta: '我会把文稿拆成镜头目标、画面意图和口播字幕。',
                    messageId: 'scene_planner-storyboard-breakdown',
                    nodeName: 'scene_planner',
                    sequence: 3,
                    type: 'model.stream.delta'
                },
                {
                    ...baseEvent,
                    nodeName: 'tts',
                    sequence: 4,
                    type: 'node.started'
                }
            ] as AgentRunConversationEvent[]
        });

        const html = renderToStaticMarkup(
            createElement(AgentConversationTimeline, {
                viewModel
            })
        );

        expect(viewModel.stageItems).toEqual(
            expect.arrayContaining([
                expect.objectContaining({
                    label: '01 准备阶段',
                    status: 'completed'
                }),
                expect.objectContaining({
                    label: '02 创建分镜',
                    status: 'completed'
                }),
                expect.objectContaining({
                    label: '03 配音生成',
                    status: 'running'
                }),
                expect.objectContaining({
                    label: '04 视频生成',
                    status: 'waiting'
                })
            ])
        );
        expect(html).toContain('文稿拆解为可执行分镜');
        expect(html).toContain('data-typewriter-active="true"');
        expect(html).toContain('data-message-kind="operation-status"');
        expect(html).toContain('agent-loading-placeholder');
        expect(html).toContain('正在生成口播配音音频');
    });
});
