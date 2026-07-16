/* */
import type {
    AgentConversationBlock,
    AgentConversationMessage
} from '@wise-cut/video-project';

import { cx } from '../../../utils/classNames';

type ProgressBlock = Extract<AgentConversationBlock, { type: 'progress' }>;
type TableBlock = Extract<AgentConversationBlock, { type: 'table' }>;

const roleLabel = {
    assistant: '智能体',
    system: '流程',
    user: '我'
} satisfies Record<AgentConversationMessage['role'], string>;

const messageShellClassName = {
    assistant: 'pr-10',
    system: 'pr-10',
    user: 'pl-10'
} satisfies Record<AgentConversationMessage['role'], string>;

const messageBodyClassName = {
    assistant: 'py-1',
    system: 'py-1',
    user: 'rounded-[12px] border border-[#1A1D24] bg-[#111418] p-3'
} satisfies Record<AgentConversationMessage['role'], string>;

const progressStatusClassName = {
    cancelled: 'bg-[#57534E]',
    completed: 'bg-[#D97706]',
    failed: 'bg-[#D97706]',
    running: 'bg-[#F59E0B]',
    waiting: 'bg-[#57534E]'
} satisfies Record<ProgressBlock['items'][number]['status'], string>;

const sortConversationMessages = (messages: AgentConversationMessage[]) =>
    [...messages].sort((first, second) => first.sequence - second.sequence);

const getMeaningfulMessages = (messages: AgentConversationMessage[]) =>
    sortConversationMessages(messages).filter(
        (message) =>
            message.content.trim().length > 0 ||
            (message.blocks?.length ?? 0) > 0
    );

const TextBlock = ({ text }: { text: string }) => (
    <p className="whitespace-pre-wrap break-words text-[12px] font-[500] leading-[18px] text-white">
        {text}
    </p>
);

const ProgressBlockView = ({ block }: { block: ProgressBlock }) => (
    <div className="grid gap-2">
        {block.items.map((item) => (
            <div
                key={item.label}
                className="grid grid-cols-[8px_minmax(0,1fr)] gap-2"
            >
                <span
                    className={cx(
                        'mt-[5px] h-2 w-2 rounded-full',
                        progressStatusClassName[item.status]
                    )}
                />
                <div className="min-w-0">
                    <div className="truncate text-[12px] font-[800] leading-[16px] text-[#1C1917]">
                        {item.label}
                    </div>
                    {item.detail ? (
                        <div className="mt-0.5 line-clamp-2 text-[11px] font-[500] leading-[15px] text-[#8A93A3]">
                            {item.detail}
                        </div>
                    ) : null}
                </div>
            </div>
        ))}
    </div>
);

const TableBlockView = ({ block }: { block: TableBlock }) => (
    <div className="grid gap-2">
        {block.rows.map((row, rowIndex) => (
            <div
                key={`${row[0] ?? 'row'}-${rowIndex}`}
                className="rounded-[10px] border border-[#30343C] bg-[#15171B] p-2.5"
            >
                <div className="truncate text-[12px] font-[850] leading-[16px] text-[#1C1917]">
                    {row[0] ?? `分镜 ${rowIndex + 1}`}
                </div>
                <div className="mt-2 grid gap-1.5">
                    {block.columns.slice(1).map((column, columnIndex) => {
                        const value = row[columnIndex + 1];

                        if (!value) return null;

                        return (
                            <div key={column} className="grid gap-0.5">
                                <span className="text-[10px] font-[700] leading-[14px] text-[#57534E]">
                                    {column}
                                </span>
                                <span className="whitespace-pre-wrap break-words text-[11px] font-[600] leading-[16px] text-[#C9D0DA]">
                                    {value}
                                </span>
                            </div>
                        );
                    })}
                </div>
            </div>
        ))}
    </div>
);

const ConversationBlockView = ({
    block
}: {
    block: AgentConversationBlock;
}) => {
    if (block.type === 'heading') {
        return (
            <h3 className="text-[12px] font-[850] leading-[16px] text-[#1C1917]">
                {block.text}
            </h3>
        );
    }

    if (block.type === 'paragraph') {
        return <TextBlock text={block.text} />;
    }

    if (block.type === 'bullets') {
        return (
            <ul className="grid gap-1">
                {block.items.map((item) => (
                    <li
                        key={item}
                        className="flex gap-2 text-[11.5px] font-[500] leading-[17px] text-[#C9D0DA]"
                    >
                        <span className="mt-[7px] h-1 w-1 shrink-0 rounded-full bg-[#78716C]" />
                        <span className="min-w-0 break-words">{item}</span>
                    </li>
                ))}
            </ul>
        );
    }

    if (block.type === 'key-values') {
        return (
            <div className="grid gap-1.5">
                {block.items.map((item) => (
                    <div
                        key={item.key}
                        className="flex min-w-0 gap-2 rounded-[7px] bg-[#25272B] px-2 py-1.5"
                    >
                        <span className="shrink-0 text-[10px] font-[800] leading-[14px] text-[#8A93A3]">
                            {item.key}
                        </span>
                        <span className="min-w-0 break-words text-[10.5px] font-[650] leading-[14px] text-[#1C1917]">
                            {item.value}
                        </span>
                    </div>
                ))}
            </div>
        );
    }

    if (block.type === 'progress') {
        return <ProgressBlockView block={block} />;
    }

    return <TableBlockView block={block} />;
};

const ConversationMessageCard = ({
    message
}: {
    message: AgentConversationMessage;
}) => {
    const blocks = message.blocks ?? [];
    const shouldRenderContent =
        blocks.length === 0 && message.content.trim().length > 0;

    return (
        <article
            data-visual-conversation-message={message.role}
            className={cx(messageShellClassName[message.role], 'min-w-0')}
        >
            <div className={messageBodyClassName[message.role]}>
                <div className="mb-2 flex items-center justify-between gap-2">
                    <span className="text-[11px] font-[850] leading-none text-[#1C1917]">
                        {roleLabel[message.role]}
                    </span>
                    {message.tone ? (
                        <span className="text-[10px] font-[700] leading-none text-[#78716C]">
                            {message.tone}
                        </span>
                    ) : null}
                </div>
                <div className="grid gap-2">
                    {shouldRenderContent ? (
                        <TextBlock text={message.content} />
                    ) : (
                        blocks.map((block, index) => (
                            <ConversationBlockView
                                key={`${message.sequence}-${block.type}-${index}`}
                                block={block}
                            />
                        ))
                    )}
                </div>
            </div>
        </article>
    );
};

export const VisualConversationFeed = ({
    conversation
}: {
    conversation: AgentConversationMessage[];
}) => {
    const messages = getMeaningfulMessages(conversation);

    if (messages.length === 0) return null;

    return (
        <section
            data-visual-conversation-feed="true"
            className="mx-2 mt-[18px] grid gap-2.5"
        >
            <div className="flex items-center justify-between">
                <h2 className="text-[13px] font-[850] leading-none text-[#1C1917]">
                    创建过程
                </h2>
                <span className="font-['Geist_Mono'] text-[10px] font-[700] leading-none text-[#57534E]">
                    {messages.length} 条
                </span>
            </div>
            <div className="grid gap-2.5">
                {messages.map((message) => (
                    <ConversationMessageCard
                        key={`${message.sequence}-${message.role}`}
                        message={message}
                    />
                ))}
            </div>
        </section>
    );
};
