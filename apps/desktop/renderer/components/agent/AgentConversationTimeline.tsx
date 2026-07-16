
import { useEffect, useState } from 'react';

import type {
    AgentConversationBlock,
    AgentConversationMessage
} from '@wise-cut/video-project';

import type { AgentConversationViewModel } from '../../mappers/agent-run-conversation';
import { cx } from '../../utils/classNames';
import { Icon } from '../Icon';
import { ClientRouteLink } from '../workspace/ClientRouteLink';

type KeyValuesBlock = Extract<AgentConversationBlock, { type: 'key-values' }>;
type ParagraphBlock = Extract<AgentConversationBlock, { type: 'paragraph' }>;
type ProgressBlock = Extract<AgentConversationBlock, { type: 'progress' }>;
type TableBlock = Extract<AgentConversationBlock, { type: 'table' }>;

const progressToneClassName = {
    cancelled: {
        dot: 'bg-[#6F7784]',
        label: 'text-[#6F7784]',
        text: '已取消'
    },
    completed: {
        dot: 'bg-[#25D0B1]',
        label: 'text-[#25D0B1]',
        text: '已完成'
    },
    failed: {
        dot: 'bg-[#F05F73]',
        label: 'text-[#F05F73]',
        text: '失败'
    },
    running: {
        dot: 'bg-[#F6B84B]',
        label: 'text-[#F6B84B]',
        text: '进行中'
    },
    waiting: {
        dot: 'bg-[#6F7784]',
        label: 'text-[#737C8C]',
        text: '待确认'
    }
} satisfies Record<
    ProgressBlock['items'][number]['status'],
    { dot: string; label: string; text: string }
>;

const getKeyValue = (message: AgentConversationMessage, key: string) => {
    const block = message.blocks?.find(
        (item): item is KeyValuesBlock => item.type === 'key-values'
    );

    return block?.items.find((item) => item.key === key)?.value;
};

const getParagraphs = (message: AgentConversationMessage) =>
    message.blocks?.filter(
        (block): block is ParagraphBlock => block.type === 'paragraph'
    ) ?? [];

const getProgressBlock = (message: AgentConversationMessage) =>
    message.blocks?.find(
        (block): block is ProgressBlock => block.type === 'progress'
    );

const getTableBlocks = (message: AgentConversationMessage) =>
    message.blocks?.filter(
        (block): block is TableBlock => block.type === 'table'
    ) ?? [];

const useTypewriterText = ({
    active,
    text
}: {
    active: boolean;
    text: string;
}) => {
    const [visibleText, setVisibleText] = useState(() => (active ? '' : text));

    useEffect(() => {
        if (!active) {
            setVisibleText(text);
            return undefined;
        }

        setVisibleText((currentText) =>
            text.startsWith(currentText) ? currentText : ''
        );

        const timer = window.setInterval(() => {
            setVisibleText((currentText) => {
                const stablePrefix = text.startsWith(currentText)
                    ? currentText
                    : '';

                if (stablePrefix.length >= text.length) {
                    return text;
                }

                return text.slice(
                    0,
                    Math.min(text.length, stablePrefix.length + 2)
                );
            });
        }, 18);

        return () => {
            window.clearInterval(timer);
        };
    }, [active, text]);

    return visibleText;
};

const TypewriterParagraph = ({
    active,
    text
}: {
    active: boolean;
    text: string;
}) => {
    const visibleText = useTypewriterText({ active, text });

    return (
        <span data-typewriter-active={active ? 'true' : 'false'}>
            {active ? visibleText : text}
        </span>
    );
};

const renderParagraph = (
    text: string,
    key: string,
    options?: { typewriter?: boolean }
) => (
    <p
        key={key}
        className="whitespace-pre-wrap text-[13px] font-[400] leading-[20px] text-[#FFFFFF]"
    >
        <TypewriterParagraph
            active={options?.typewriter ?? false}
            text={text}
        />
    </p>
);

const UserRequestMessage = ({
    message
}: {
    message: AgentConversationMessage;
}) => {
    const voiceLabel = getKeyValue(message, '音色') ?? '默认音色';
    const sourceDirectory = getKeyValue(message, '素材目录') ?? '本地素材';

    return (
        <article
            data-message-kind="user-request"
            className="flex w-[860px] justify-start overflow-hidden pl-[100px]"
        >
            <div className="flex w-[760px] flex-col gap-[14px] rounded-[14px] border border-[#2A2F38] bg-[#1A1C22] px-5 py-[18px] shadow-[0_18px_42px_rgba(0,0,0,0.33)]">
                <div className="flex h-[38px] items-center justify-between">
                    <div className="flex h-7 items-center gap-2">
                        <div className="h-6 w-6 rounded-full bg-[linear-gradient(135deg,#5B8CFF_0%,#25D0B1_100%)]" />
                        <span className="text-[14px] font-[650] leading-5 text-[#F5F7FA]">
                            你
                        </span>
                    </div>
                    <Icon
                        name="chevron-down"
                        className="h-[18px] w-[18px] text-[#737C8C]"
                    />
                </div>
                <p className="whitespace-pre-wrap text-[14px] font-[400] leading-[21px] text-[#DCE2EA]">
                    {message.content}
                </p>
                <div className="flex flex-col items-start gap-2">
                    <div className="flex overflow-hidden rounded-[6px] bg-[#3D4045]">
                        <span className="px-2.5 py-1.5 text-[12px] font-[400] leading-[17px] text-[#C5CBD6]">
                            视频画面
                        </span>
                        <span className="bg-[#222833] px-2.5 py-1.5 text-[12px] font-[400] leading-[17px] text-[#C5CBD6]">
                            智能匹配素材
                        </span>
                    </div>
                    <div className="flex overflow-hidden rounded-[6px] bg-[#3D4045]">
                        <span className="px-2.5 py-1.5 text-[12px] font-[400] leading-[17px] text-[#C5CBD6]">
                            旁白配音
                        </span>
                        <span className="bg-[#222833] px-2.5 py-1.5 text-[12px] font-[400] leading-[17px] text-[#C5CBD6]">
                            {voiceLabel}
                        </span>
                    </div>
                    <span className="max-w-full truncate text-[11px] font-[400] leading-[15px] text-[#737C8C]">
                        {sourceDirectory}
                    </span>
                </div>
            </div>
        </article>
    );
};

const AssistantReportMessage = ({
    message
}: {
    message: AgentConversationMessage;
}) => {
    const paragraphs = getParagraphs(message);
    const heading = message.blocks?.find((block) => block.type === 'heading');
    const showPlaceholder =
        message.tone === 'running' &&
        message.content.trim().length === 0 &&
        paragraphs.length === 0;
    const shouldTypewrite =
        message.tone === 'running' &&
        message.sourceEventType === 'model.stream.delta';

    return (
        <article
            data-message-kind="assistant-report"
            className="flex w-[860px] flex-col gap-[14px] rounded-[14px] py-[18px]"
        >
            {heading?.type === 'heading' ? (
                <h2 className="text-[14px] font-[700] leading-[20px] text-[#F5F7FA]">
                    {heading.text}
                </h2>
            ) : null}
            {paragraphs.length > 0
                ? paragraphs.map((paragraph, index) =>
                      renderParagraph(
                          paragraph.text,
                          `${message.sequence}-${index}`,
                          {
                              typewriter: shouldTypewrite
                          }
                      )
                  )
                : null}
            {showPlaceholder ? (
                <div
                    data-agent-typing-placeholder="true"
                    className="agent-typing-placeholder flex h-[42px] w-fit items-center gap-2 rounded-[10px] border border-[#252B35] bg-[#0D1015] px-4 text-[13px] font-[400] leading-[20px] text-[#C9D0DA]"
                >
                    <span>正在组织创作说明</span>
                    <span className="flex gap-1" aria-hidden="true">
                        <span className="h-1.5 w-1.5 animate-pulse rounded-full bg-[#737C8C]" />
                        <span className="h-1.5 w-1.5 animate-pulse rounded-full bg-[#737C8C] [animation-delay:120ms]" />
                        <span className="h-1.5 w-1.5 animate-pulse rounded-full bg-[#737C8C] [animation-delay:240ms]" />
                    </span>
                </div>
            ) : null}
        </article>
    );
};

const UserReplyMessage = ({
    message
}: {
    message: AgentConversationMessage;
}) => (
    <article
        data-message-kind="user-reply"
        className="flex w-[860px] justify-end"
    >
        <div className="w-fit rounded-[14px] border border-[#334155] bg-[#1E2633] px-4 py-3 text-[14px] font-[650] leading-none text-[#EAF7FF]">
            {message.content}
        </div>
    </article>
);

const ExecutionPlanMessage = ({
    message
}: {
    message: AgentConversationMessage;
}) => {
    const progress = getProgressBlock(message);

    if (!progress) return null;

    return (
        <article
            data-message-kind="execution-plan"
            className="flex w-[860px] flex-col gap-[14px] rounded-[14px] pb-[18px] pt-5"
        >
            {renderParagraph(message.content, `${message.sequence}-intro`)}
            <div className="flex w-full flex-col gap-1.5">
                {progress.items.map((item) => {
                    const tone = progressToneClassName[item.status];

                    return (
                        <div
                            key={item.label}
                            className="flex h-11 w-full items-center gap-2.5"
                        >
                            <span
                                className={cx(
                                    'h-2 w-2 shrink-0 rounded-full',
                                    tone.dot
                                )}
                            />
                            <div className="min-w-0 flex-1">
                                <p className="truncate text-[13px] font-[700] leading-[19px] text-[#F5F7FA]">
                                    {item.label}
                                </p>
                                <p className="truncate text-[12px] font-[400] leading-[17px] text-[#737C8C]">
                                    {item.detail}
                                </p>
                            </div>
                            <span
                                className={cx(
                                    'text-[12px] font-[400] leading-[17px]',
                                    tone.label
                                )}
                            >
                                {tone.text}
                            </span>
                        </div>
                    );
                })}
            </div>
        </article>
    );
};

const TablePreview = ({ table }: { table: TableBlock }) => (
    <div className="flex w-full flex-col gap-2 rounded-[10px] border border-[#252B35] bg-[#0D1015] p-3">
        <div className="overflow-hidden rounded-[8px] border border-[#252B35] bg-[#11161D] shadow-[0_8px_20px_rgba(0,0,0,0.2)]">
            <div
                className="grid bg-[#1C2733]"
                style={{
                    gridTemplateColumns: `repeat(${table.columns.length}, minmax(0, 1fr))`
                }}
            >
                {table.columns.map((column, index) => (
                    <div
                        key={column}
                        className={cx(
                            'min-w-0 border-r border-[#11161D] px-3 py-2 text-[10.5px] font-[800] leading-none text-[#DDEBFF] last:border-r-0',
                            index === 0 && 'bg-[#223244]'
                        )}
                    >
                        {column}
                    </div>
                ))}
            </div>
            {table.rows.map((row, rowIndex) => (
                <div
                    key={`${row.join('-')}-${rowIndex}`}
                    className="grid border-t border-[#11161D]"
                    style={{
                        gridTemplateColumns: `repeat(${table.columns.length}, minmax(0, 1fr))`
                    }}
                >
                    {table.columns.map((column, columnIndex) => (
                        <div
                            key={`${column}-${columnIndex}`}
                            className={cx(
                                'min-w-0 border-r border-[#11161D] px-3 py-2 text-[11px] font-[400] leading-[16px] text-[#C8CED8] last:border-r-0',
                                columnIndex === 0 &&
                                    'bg-[#151B23] font-[700] text-[#F5F7FA]'
                            )}
                        >
                            <span className="line-clamp-3 whitespace-pre-wrap">
                                {row[columnIndex] ?? ''}
                            </span>
                        </div>
                    ))}
                </div>
            ))}
        </div>
    </div>
);

const ApprovalMessage = ({
    canApprove,
    message,
    onApprove,
    onCancel
}: {
    canApprove: boolean;
    message: AgentConversationMessage;
    onApprove?: () => void;
    onCancel?: () => void;
}) => {
    const paragraphs = getParagraphs(message);
    const tables = getTableBlocks(message);

    return (
        <article
            data-message-kind="approval"
            className="flex w-[860px] flex-col gap-[14px] rounded-[14px] py-[18px]"
        >
            {paragraphs.length > 0
                ? paragraphs.map((paragraph, index) =>
                      renderParagraph(
                          paragraph.text,
                          `${message.sequence}-${index}`
                      )
                  )
                : renderParagraph(
                      message.content,
                      `${message.sequence}-content`
                  )}
            {tables.map((table, index) => (
                <TablePreview key={index} table={table} />
            ))}
            {canApprove ? (
                <div className="flex justify-end gap-2">
                    <button
                        type="button"
                        className="h-9 rounded-[10px] border border-[#334155] bg-[#101216] px-4 text-[13px] font-[650] text-[#A9AFBA] transition-colors duration-200 hover:border-[#4B5563] hover:text-[#EAF7FF]"
                        onClick={onCancel}
                    >
                        取消
                    </button>
                    <button
                        type="button"
                        className="h-9 rounded-[10px] bg-[#EAF7FF] px-4 text-[13px] font-[800] text-[#0F172A] transition-transform duration-200 hover:-translate-y-0.5"
                        onClick={onApprove}
                    >
                        确认分镜
                    </button>
                </div>
            ) : null}
        </article>
    );
};

const VideoOverviewMessage = ({
    editorHref,
    message
}: {
    editorHref?: string;
    message: AgentConversationMessage;
}) => {
    const projectId = getKeyValue(message, '项目 ID') ?? '已生成';
    const projectPath = getKeyValue(message, '工程文件') ?? '工程 JSON';
    const metrics = [
        ['成片时长', '按配音时长生成', 'text-[#5B8CFF]'],
        ['视频风格', '智能素材剪辑', 'text-[#8B6AF7]'],
        ['工程文件', projectId, 'text-[#25D0B1]'],
        ['导出状态', '预览已生成', 'text-[#F6B84B]']
    ] as const;

    return (
        <article
            data-message-kind="video-overview"
            className="flex w-[860px] flex-col gap-3 rounded-[14px] border border-[#242933] bg-[#111318] px-5 py-[18px]"
        >
            <h2 className="text-[15px] font-[700] leading-none text-[#F5F7FA]">
                视频概览
            </h2>
            <p className="text-[13px] font-[400] leading-[19px] text-[#C9D0DA]">
                整个制作流程已完成。智能体已经完成文稿确认、成片需求、分镜规划、配音生成和视频生成，下面是当前视频概览。
            </p>
            <div className="grid grid-cols-4 gap-2.5">
                {metrics.map(([label, value, valueClassName]) => (
                    <div
                        key={label}
                        className="min-w-0 rounded-[10px] border border-[#2A2F38] bg-[#171A20] p-3"
                    >
                        <p className="text-[11px] font-[400] leading-none text-[#737C8C]">
                            {label}
                        </p>
                        <p
                            className={cx(
                                'mt-1.5 truncate text-[13px] font-[700] leading-none',
                                valueClassName
                            )}
                            title={value}
                        >
                            {value}
                        </p>
                    </div>
                ))}
            </div>
            <div className="flex h-11 items-center justify-between gap-3 rounded-[10px] border border-[#1D5747] bg-[#122821] px-3">
                <div className="flex min-w-0 items-center gap-2">
                    <Icon
                        name="check"
                        className="h-[18px] w-[18px] shrink-0 text-[#25D0B1]"
                    />
                    <span className="truncate text-[13px] font-[650] leading-none text-[#D8FFF5]">
                        视频制作完成，可进入编辑器预览并微调轨道。
                    </span>
                </div>
                {editorHref ? (
                    <ClientRouteLink
                        href={editorHref}
                        className="shrink-0 rounded-[8px] bg-[#EAF7FF] px-3 py-2 text-[12px] font-[800] leading-none text-[#0F172A] transition-transform duration-200 hover:-translate-y-0.5"
                    >
                        打开编辑器
                    </ClientRouteLink>
                ) : null}
            </div>
            <p className="truncate text-[11px] font-[400] leading-none text-[#737C8C]">
                {projectPath}
            </p>
        </article>
    );
};

const OperationStatusMessage = ({
    message
}: {
    message: AgentConversationMessage;
}) => {
    const isRunning = message.tone === 'running';

    return (
        <article
            data-message-kind="operation-status"
            className="flex w-[860px] justify-start"
        >
            <div className="agent-loading-placeholder flex min-h-[42px] max-w-[760px] items-center gap-2.5 rounded-[10px] border border-[#252B35] bg-[#0D1015] px-4 text-[13px] font-[400] leading-[20px] text-[#C9D0DA]">
                {isRunning ? (
                    <span className="flex gap-1" aria-hidden="true">
                        <span className="h-1.5 w-1.5 animate-pulse rounded-full bg-[#F6B84B]" />
                        <span className="h-1.5 w-1.5 animate-pulse rounded-full bg-[#F6B84B] [animation-delay:120ms]" />
                        <span className="h-1.5 w-1.5 animate-pulse rounded-full bg-[#F6B84B] [animation-delay:240ms]" />
                    </span>
                ) : (
                    <Icon
                        name={message.tone === 'failed' ? 'x' : 'check'}
                        className={cx(
                            'h-4 w-4 shrink-0',
                            message.tone === 'failed'
                                ? 'text-[#F05F73]'
                                : 'text-[#25D0B1]'
                        )}
                    />
                )}
                <span>{message.content}</span>
            </div>
        </article>
    );
};

const EmptyConversation = () => (
    <div className="rounded-[14px] border border-[#2A2F38] bg-[#111318] px-5 py-5 text-[14px] text-[#A9AFBA]">
        当前运行记录不可用
    </div>
);

const renderMessage = ({
    canApprove,
    editorHref,
    message,
    onApprove,
    onCancel
}: {
    canApprove: boolean;
    editorHref?: string;
    message: AgentConversationMessage;
    onApprove?: () => void;
    onCancel?: () => void;
}) => {
    if (message.sourceEventType === 'run.started') {
        return <UserRequestMessage message={message} />;
    }

    if (message.sourceEventType === 'user.reply') {
        return <UserReplyMessage message={message} />;
    }

    if (message.sourceEventType === 'run.completed') {
        return (
            <VideoOverviewMessage editorHref={editorHref} message={message} />
        );
    }

    if (
        message.sourceEventType === 'node.completed' ||
        message.sourceEventType === 'node.failed' ||
        message.sourceEventType === 'node.started'
    ) {
        return <OperationStatusMessage message={message} />;
    }

    if (message.sourceEventType === 'approval.required') {
        return (
            <ApprovalMessage
                canApprove={canApprove}
                message={message}
                onApprove={onApprove}
                onCancel={onCancel}
            />
        );
    }

    if (getProgressBlock(message)) {
        return <ExecutionPlanMessage message={message} />;
    }

    if (message.role === 'assistant') {
        return <AssistantReportMessage message={message} />;
    }

    return (
        <article className="w-[860px] rounded-[14px] border border-[#2A2F38] bg-[#111318] px-5 py-4 text-[13px] leading-[20px] text-[#C9D0DA]">
            {message.content}
        </article>
    );
};

export const AgentConversationTimeline = ({
    onApprove,
    onCancel,
    viewModel
}: {
    onApprove?: () => void;
    onCancel?: () => void;
    viewModel: AgentConversationViewModel;
}) => {
    return (
        <div
            data-create-run-chat-body="true"
            className="flex w-[860px] flex-col items-start gap-[14px]"
        >
            {viewModel.messages.length > 0 ? (
                viewModel.messages.map((message, index) => (
                    <div
                        key={`${message.sequence}-${message.sourceEventType ?? index}`}
                    >
                        {renderMessage({
                            canApprove: viewModel.canApprove,
                            editorHref: viewModel.editorHref,
                            message,
                            onApprove,
                            onCancel
                        })}
                    </div>
                ))
            ) : (
                <EmptyConversation />
            )}
        </div>
    );
};
