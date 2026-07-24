
import type {
    AgentConversationBlock,
    AgentConversationMessage
} from '@wise-cut/video-project';

import type { DesktopAgentRunEvent } from '../../shared/video-agent';

export type UserReplyConversationEvent = {
    approved: boolean;
    content: string;
    createdAt: string;
    runId: string;
    sequence: number;
    type: 'user.reply';
};

export type AgentRunConversationEvent =
    | DesktopAgentRunEvent
    | UserReplyConversationEvent;

export type KeyframeViewModel = {
    dataUrl: string;
    index: number;
    timestampMs: number;
};

export type AssetKeyframesViewModel = {
    assetId: string;
    fileName: string;
    frames: KeyframeViewModel[];
};

export type AgentConversationViewModel = {
    canApprove: boolean;
    canCancel: boolean;
    editorHref?: string;
    messages: AgentConversationMessage[];
    stageItems: AgentRunStageItem[];
    status:
        | 'cancelled'
        | 'completed'
        | 'failed'
        | 'idle'
        | 'running'
        | 'waiting';
};

type ProgressBlock = Extract<AgentConversationBlock, { type: 'progress' }>;
type ProgressStatus = ProgressBlock['items'][number]['status'];
type StageId = 'prepare' | 'scenes' | 'voice' | 'video';
export type AgentRunStageItem = ProgressBlock['items'][number];

const progressIntro =
    '我已收到创作需求。接下来会按即时协作流程推进：先拆解目标受众与叙事节奏，再生成分镜规划、匹配素材、选择口播音色，最后进入编辑器等待你确认细节。';

const progressStages: {
    detail: string;
    id: StageId;
    label: string;
    nodes: string[];
}[] = [
    {
        detail: '加载制片规范与文稿',
        id: 'prepare',
        label: '01 准备阶段',
        nodes: ['asset_scan', 'asset_understand', 'creative_brief']
    },
    {
        detail: '生成分镜并等待确认',
        id: 'scenes',
        label: '02 创建分镜',
        nodes: ['scene_planner', 'scene_approval']
    },
    {
        detail: '合成口播并匹配素材',
        id: 'voice',
        label: '03 配音生成',
        nodes: ['asset_matcher', 'tts']
    },
    {
        detail: '输出预览并进入编辑',
        id: 'video',
        label: '04 视频生成',
        nodes: ['timeline_assemble', 'validation', 'project_save']
    }
];

const stageByNodeName = new Map(
    progressStages.flatMap((stage) =>
        stage.nodes.map((nodeName) => [nodeName, stage.id] as const)
    )
);

const operationMessages: Record<
    string,
    {
        completed: string;
        failed: string;
        running: string;
    }
> = {
    asset_matcher: {
        completed: '素材匹配已完成，已为分镜找到候选视频片段。',
        failed: '素材匹配失败。',
        running: '正在根据分镜意图匹配本地视频素材。'
    },
    asset_scan: {
        completed: '本地素材扫描完成。',
        failed: '本地素材扫描失败。',
        running: '正在扫描本地素材目录，读取可用视频片段。'
    },
    asset_understand: {
        completed: '素材内容分析完成。',
        failed: '素材内容分析失败。',
        running: '正在分析素材内容，提取可用于分镜匹配的画面信息。'
    },
    creative_brief: {
        completed: '内容理解已完成。',
        failed: '内容理解生成失败。',
        running: '正在理解创作目标、受众和叙事重点。'
    },
    project_save: {
        completed: '工程文件已保存。',
        failed: '工程文件保存失败。',
        running: '正在保存工程 JSON，准备进入编辑器。'
    },
    scene_approval: {
        completed: '分镜方案已确认。',
        failed: '分镜确认未通过。',
        running: '正在等待你确认分镜方案。'
    },
    scene_planner: {
        completed: '可执行分镜已生成。',
        failed: '分镜拆解失败。',
        running: '正在把文稿拆成可执行分镜，生成镜头目标、画面意图和口播字幕。'
    },
    timeline_assemble: {
        completed: '视频时间线组装完成。',
        failed: '视频时间线组装失败。',
        running: '正在组装视频、配音、字幕和音乐轨道。'
    },
    tts: {
        completed: '口播配音生成完成。',
        failed: '口播配音生成失败。',
        running: '正在生成口播配音音频，等待 TTS 返回音频片段。'
    },
    validation: {
        completed: '工程结构校验完成。',
        failed: '工程结构校验失败。',
        running: '正在校验工程结构和轨道引用。'
    }
};

const sortAndDedupeEvents = (events: AgentRunConversationEvent[]) => {
    const seen = new Set<string>();

    return [...events]
        .sort((first, second) => first.sequence - second.sequence)
        .filter((event) => {
            const key = `${event.runId}:${event.sequence}:${event.type}`;

            if (seen.has(key)) return false;

            seen.add(key);
            return true;
        });
};

const createMessage = ({
    blocks,
    content,
    createdAt,
    nodeName,
    role,
    sequence,
    sourceEventType,
    tone
}: AgentConversationMessage): AgentConversationMessage => ({
    blocks,
    content,
    createdAt,
    nodeName,
    role,
    sequence,
    sourceEventType,
    tone
});

const formatDuration = (durationMs: unknown) => {
    if (typeof durationMs !== 'number' || !Number.isFinite(durationMs)) {
        return '-';
    }

    return `${(durationMs / 1000).toFixed(1)}s`;
};

const getSceneString = (scene: unknown, key: string) => {
    if (!scene || typeof scene !== 'object' || !(key in scene)) return '';

    const value = (scene as Record<string, unknown>)[key];

    return typeof value === 'string' ? value : '';
};

const getSceneSubtitle = (scene: unknown) => {
    if (!scene || typeof scene !== 'object') return '';

    const subtitleLines = (scene as { subtitleLines?: unknown }).subtitleLines;

    if (
        Array.isArray(subtitleLines) &&
        subtitleLines.every((line) => typeof line === 'string')
    ) {
        return subtitleLines.join('\n');
    }

    return getSceneString(scene, 'script');
};

const getApprovalScenes = (payload: unknown) => {
    if (!payload || typeof payload !== 'object') return [];

    const scenes = (payload as { scenes?: unknown }).scenes;

    return Array.isArray(scenes) ? scenes : [];
};

const createApprovalBlocks = (
    event: Extract<DesktopAgentRunEvent, { type: 'approval.required' }>
): AgentConversationBlock[] => {
    if (event.approval.type !== 'scene-plan') {
        return [
            {
                text: '需要你确认后继续执行。',
                type: 'paragraph'
            }
        ];
    }

    const rows = getApprovalScenes(event.approval.payload).map((scene) => [
        getSceneString(scene, 'title') || getSceneString(scene, 'id'),
        getSceneString(scene, 'visualIntent'),
        getSceneSubtitle(scene),
        formatDuration((scene as { durationMs?: unknown }).durationMs)
    ]);

    return [
        {
            text: '分镜方案确认',
            type: 'heading'
        },
        {
            text: '我已经把文稿拆成可执行分镜。确认后会继续匹配视频素材、生成配音并组装时间线。',
            type: 'paragraph'
        },
        {
            columns: ['分镜', '画面意图', '口播字幕', '时长'],
            rows,
            type: 'table'
        }
    ];
};

const getRunStatus = (event?: AgentRunConversationEvent) => {
    if (!event) return 'idle';
    if (event.type === 'approval.required') return 'waiting';
    if (event.type === 'run.completed') return 'completed';
    if (event.type === 'run.failed' || event.type === 'node.failed') {
        return 'failed';
    }
    if (event.type === 'run.cancelled') return 'cancelled';

    return 'running';
};

const createProgressItems = (
    statuses: Record<StageId, ProgressStatus>
): ProgressBlock['items'] =>
    progressStages.map((stage) => ({
        detail: stage.detail,
        label: stage.label,
        status: statuses[stage.id]
    }));

const createInitialProgressStatuses = (): Record<StageId, ProgressStatus> => ({
    prepare: 'waiting',
    scenes: 'waiting',
    video: 'waiting',
    voice: 'waiting'
});

const getStageIndex = (stageId: StageId) =>
    progressStages.findIndex((stage) => stage.id === stageId);

const completePreviousStages = (
    statuses: Record<StageId, ProgressStatus>,
    stageId: StageId
) => {
    const stageIndex = getStageIndex(stageId);

    progressStages.slice(0, stageIndex).forEach((stage) => {
        if (
            statuses[stage.id] === 'running' ||
            statuses[stage.id] === 'waiting'
        ) {
            statuses[stage.id] = 'completed';
        }
    });
};

export const createAgentConversationViewModel = ({
    events
}: {
    events: AgentRunConversationEvent[];
}): AgentConversationViewModel => {
    const sortedEvents = sortAndDedupeEvents(events);
    const messages: AgentConversationMessage[] = [];
    const operationStatusMessages = new Map<string, AgentConversationMessage>();
    const streamMessages = new Map<string, AgentConversationMessage>();
    const progressStatuses = createInitialProgressStatuses();
    let progressMessage: AgentConversationMessage | undefined;
    // 每段视频一条 keyframes 消息,后到的覆盖先到的(进度追加)。
    const keyframeMessagesByAssetId = new Map<
        string,
        AgentConversationMessage
    >();

    const ensureProgressMessage = (event: AgentRunConversationEvent) => {
        if (progressMessage) return progressMessage;

        progressMessage = createMessage({
            blocks: [
                {
                    items: createProgressItems(progressStatuses),
                    type: 'progress'
                }
            ],
            content: progressIntro,
            createdAt: event.createdAt,
            role: 'system',
            sequence: event.sequence,
            sourceEventType: 'run.progress',
            tone: 'running'
        });
        messages.push(progressMessage);

        return progressMessage;
    };

    const refreshProgressMessage = (event: AgentRunConversationEvent) => {
        const message = ensureProgressMessage(event);

        message.blocks = [
            {
                items: createProgressItems(progressStatuses),
                type: 'progress'
            }
        ];
        message.sourceEventType = 'run.progress';
    };

    const updateStage = ({
        event,
        stageId,
        status
    }: {
        event: AgentRunConversationEvent;
        stageId: StageId;
        status: ProgressStatus;
    }) => {
        completePreviousStages(progressStatuses, stageId);
        progressStatuses[stageId] = status;
        refreshProgressMessage(event);
    };

    const updateOperationStatusMessage = (
        event: Extract<
            AgentRunConversationEvent,
            { type: 'node.completed' | 'node.failed' | 'node.started' }
        >
    ) => {
        const copy = operationMessages[event.nodeName];

        if (!copy) return;

        const tone =
            event.type === 'node.completed'
                ? 'completed'
                : event.type === 'node.failed'
                  ? 'failed'
                  : 'running';
        const content =
            event.type === 'node.completed'
                ? copy.completed
                : event.type === 'node.failed'
                  ? `${copy.failed}${event.error ? ` ${event.error}` : ''}`
                  : copy.running;
        const existing = operationStatusMessages.get(event.nodeName);

        if (existing) {
            existing.content = content;
            existing.sourceEventType = event.type;
            existing.tone = tone;
            return;
        }

        const message = createMessage({
            content,
            createdAt: event.createdAt,
            nodeName: event.nodeName,
            role: 'system',
            sequence: event.sequence,
            sourceEventType: event.type,
            tone
        });

        operationStatusMessages.set(event.nodeName, message);
        messages.push(message);
    };

    sortedEvents.forEach((event) => {
        if (event.type === 'run.started') {
            messages.push(
                createMessage({
                    blocks: [
                        {
                            items: [
                                {
                                    key: '音色',
                                    value: event.input.selectedVoice
                                },
                                {
                                    key: '素材目录',
                                    value: event.input.sourceAssetDirectory
                                }
                            ],
                            type: 'key-values'
                        }
                    ],
                    content: event.input.prompt,
                    createdAt: event.createdAt,
                    role: 'user',
                    sequence: event.sequence,
                    sourceEventType: event.type
                })
            );
            ensureProgressMessage(event);
            return;
        }

        if (event.type === 'model.stream.started') {
            const stageId = stageByNodeName.get(event.nodeName);

            if (stageId) {
                updateStage({
                    event,
                    stageId,
                    status: 'running'
                });
            }

            const message = createMessage({
                blocks: [
                    {
                        text: event.title,
                        type: 'heading'
                    }
                ],
                content: '',
                createdAt: event.createdAt,
                nodeName: event.nodeName,
                role: 'assistant',
                sequence: event.sequence,
                sourceEventType: event.type,
                tone: 'running'
            });

            streamMessages.set(event.messageId, message);
            messages.push(message);
            return;
        }

        if (event.type === 'model.stream.delta') {
            const message = streamMessages.get(event.messageId);

            if (!message) return;

            message.content = `${message.content}${event.delta}`;
            message.blocks = [
                ...(message.blocks?.filter(
                    (block) => block.type !== 'paragraph'
                ) ?? []),
                {
                    text: message.content,
                    type: 'paragraph'
                }
            ];
            message.sourceEventType = event.type;
            return;
        }

        if (event.type === 'model.stream.completed') {
            const message = streamMessages.get(event.messageId);

            if (!message) return;

            message.sourceEventType = event.type;
            message.tone = 'completed';
            return;
        }

        if (
            event.type === 'node.started' ||
            event.type === 'node.completed' ||
            event.type === 'node.failed'
        ) {
            const stageId = stageByNodeName.get(event.nodeName);

            if (!stageId) return;

            updateStage({
                event,
                stageId,
                status:
                    event.type === 'node.completed'
                        ? 'completed'
                        : event.type === 'node.failed'
                          ? 'failed'
                          : 'running'
            });

            if (progressMessage) {
                progressMessage.tone =
                    event.type === 'node.failed' ? 'failed' : 'running';
            }
            updateOperationStatusMessage(event);

            return;
        }

        if (event.type === 'approval.required') {
            updateStage({
                event,
                stageId: 'scenes',
                status: 'waiting'
            });
            messages.push(
                createMessage({
                    blocks: createApprovalBlocks(event),
                    content:
                        event.approval.type === 'scene-plan'
                            ? '请确认分镜方案'
                            : '请确认后继续',
                    createdAt: event.createdAt,
                    role: 'assistant',
                    sequence: event.sequence,
                    sourceEventType: event.type,
                    tone: 'waiting'
                })
            );
            return;
        }

        if (event.type === 'user.reply') {
            if (event.approved) {
                updateStage({
                    event,
                    stageId: 'scenes',
                    status: 'completed'
                });
            }
            messages.push(
                createMessage({
                    content: event.content,
                    createdAt: event.createdAt,
                    role: 'user',
                    sequence: event.sequence,
                    sourceEventType: event.type
                })
            );
            return;
        }

        if (event.type === 'run.completed') {
            progressStages.forEach((stage) => {
                progressStatuses[stage.id] = 'completed';
            });
            refreshProgressMessage(event);
            if (progressMessage) {
                progressMessage.tone = 'completed';
            }

            messages.push(
                createMessage({
                    blocks: [
                        {
                            items: [
                                {
                                    key: '项目 ID',
                                    value: event.projectId
                                },
                                ...(event.savedProjectPath
                                    ? [
                                          {
                                              key: '工程文件',
                                              value: event.savedProjectPath
                                          }
                                      ]
                                    : [])
                            ],
                            type: 'key-values'
                        }
                    ],
                    content: '视频制作完成，可进入编辑器预览并微调轨道。',
                    createdAt: event.createdAt,
                    role: 'assistant',
                    sequence: event.sequence,
                    sourceEventType: event.type,
                    tone: 'completed'
                })
            );
            return;
        }

        if (event.type === 'run.failed') {
            if (progressMessage) {
                progressMessage.tone = 'failed';
            }
            messages.push(
                createMessage({
                    content: event.error,
                    createdAt: event.createdAt,
                    role: 'system',
                    sequence: event.sequence,
                    sourceEventType: event.type,
                    tone: 'failed'
                })
            );
            return;
        }

        if (event.type === 'run.cancelled') {
            if (progressMessage) {
                progressMessage.tone = 'cancelled';
            }
            messages.push(
                createMessage({
                    content: event.reason ?? '已取消智能创作任务。',
                    createdAt: event.createdAt,
                    role: 'system',
                    sequence: event.sequence,
                    sourceEventType: event.type,
                    tone: 'cancelled'
                })
            );
            return;
        }

        if (event.type === 'asset_scan_progress') {
            // 为每段视频生成一条 chat 消息。后续同 assetId 进来覆盖。
            // 选中状态(selectedFrameIndices)由 KeyframesMessage 组件内部
            // useState 管理,messages 数据本身不带选中。
            const message = createMessage({
                blocks: [
                    {
                        text: `已抽取 ${event.fileName} 的 ${event.keyframes.length} 帧关键帧，请选择代表帧（默认 3 张，最多 5 张）`,
                        type: 'paragraph'
                    },
                    {
                        assets: [
                            {
                                assetId: event.assetId,
                                fileName: event.fileName,
                                frames: event.keyframes
                            }
                        ],
                        type: 'keyframes'
                    }
                ],
                content: `已抽取 ${event.fileName} 的 ${event.keyframes.length} 帧关键帧`,
                createdAt: event.createdAt,
                role: 'assistant',
                sequence: event.sequence,
                sourceEventType: 'asset_scan_progress',
                tone: event.totalCompleted === event.totalScanned
                    ? 'completed'
                    : 'running'
            });

            const existing = keyframeMessagesByAssetId.get(event.assetId);

            if (existing) {
                Object.assign(existing, message);
            } else {
                keyframeMessagesByAssetId.set(event.assetId, message);
                messages.push(message);
            }

            return;
        }

        if (event.type === 'asset_understood') {
            // 画面理解结果(多模态):绿色"已完成"卡片 + key-values 摘要
            // (description / mood / objects / actions / suggestedSceneType /
            // 匹配度)。pending 阶段(description === "正在调用多模态模型…")
            // 显示 running 提示,完成后变 completed。
            const isPending =
                event.understanding.description === '正在调用多模态模型…';
            const message = createMessage({
                blocks: [
                    {
                        items: [
                            {
                                key: '画面描述',
                                value: event.understanding.description
                            },
                            ...(event.understanding.mood
                                ? [
                                      {
                                          key: '整体氛围',
                                          value: event.understanding.mood
                                      }
                                  ]
                                : []),
                            ...(event.understanding.suggestedSceneType
                                ? [
                                      {
                                          key: '建议分镜',
                                          value: event.understanding
                                              .suggestedSceneType
                                      }
                                  ]
                                : []),
                            ...(event.understanding.objects.length > 0
                                ? [
                                      {
                                          key: '关键物体',
                                          value: event.understanding.objects.join(
                                              '、'
                                          )
                                      }
                                  ]
                                : []),
                            ...(event.understanding.actions.length > 0
                                ? [
                                      {
                                          key: '关键动作',
                                          value: event.understanding.actions.join(
                                              '、'
                                          )
                                      }
                                  ]
                                : []),
                            ...(event.promptMatchScore > 0
                                ? [
                                      {
                                          key: '匹配度',
                                          value: `${(
                                              event.promptMatchScore * 100
                                          ).toFixed(0)}%${event.promptMatchReason ? ` · ${event.promptMatchReason}` : ''}`
                                      }
                                  ]
                                : [])
                        ],
                        type: 'key-values'
                    }
                ],
                content: isPending
                    ? `正在进行 ${event.fileName} 的画面理解`
                    : `已完成 ${event.fileName} 的画面理解`,
                createdAt: event.createdAt,
                role: 'assistant',
                sequence: event.sequence,
                sourceEventType: 'asset_understood',
                tone: isPending ? 'running' : 'completed'
            });

            const existing = keyframeMessagesByAssetId.get(event.assetId);

            if (existing) {
                // 跟 KeyframesMessage 同源覆盖 — 找到之前的同 assetId keyframes 消息,
                // 把它替换成 understood 卡片,让时间线更紧凑。
                const index = messages.indexOf(existing);

                if (index >= 0) {
                    messages[index] = message;
                }
                keyframeMessagesByAssetId.set(event.assetId, message);
            } else {
                keyframeMessagesByAssetId.set(event.assetId, message);
                messages.push(message);
            }

            return;
        }
    });

    const latestEvent = sortedEvents.at(-1);
    const status = getRunStatus(latestEvent);
    const completionEvent = sortedEvents.findLast(
        (
            event
        ): event is Extract<DesktopAgentRunEvent, { type: 'run.completed' }> =>
            event.type === 'run.completed'
    );

    return {
        canApprove: latestEvent?.type === 'approval.required',
        canCancel: status === 'running' || status === 'waiting',
        editorHref: completionEvent
            ? `/editor/${completionEvent.projectId}`
            : undefined,
        messages,
        stageItems: createProgressItems(progressStatuses),
        status
    };
};
