/* */
import type { DesktopAgentRunEvent } from '../../../shared/video-agent';
import { cx } from '../../utils/classNames';
import { ClientRouteLink } from '../workspace/ClientRouteLink';

type AgentProgressStatus =
    | 'cancelled'
    | 'completed'
    | 'failed'
    | 'idle'
    | 'running'
    | 'waiting';

export type AgentProgressEntry = {
    detail?: string;
    label: string;
    sequence: number;
    tone: AgentProgressStatus;
};

export type AgentProgressViewModel = {
    canApprove: boolean;
    canCancel: boolean;
    canRetry: boolean;
    editorHref?: string;
    entries: AgentProgressEntry[];
    status: AgentProgressStatus;
    title: string;
};

const nodeStageLabels: Record<string, string> = {
    asset_matcher: '正在匹配素材',
    asset_scan: '正在分析素材',
    asset_understand: '正在分析素材',
    creative_brief: '正在生成分镜',
    project_save: '正在保存工程',
    scene_approval: '等待分镜确认',
    scene_planner: '正在生成分镜',
    timeline_assemble: '正在组装时间线',
    tts: '正在生成配音',
    validation: '正在校验工程'
};

export const sortAgentRunEvents = (events: DesktopAgentRunEvent[]) => {
    return [...events].sort(
        (first, second) => first.sequence - second.sequence
    );
};

const getEventLabel = (event: DesktopAgentRunEvent) => {
    if (event.type === 'run.started') return '已开始智能创作';
    if (event.type === 'approval.required') {
        if (event.approval.type === 'scene-plan') return '等待分镜确认';

        return '等待人工确认';
    }
    if (event.type === 'model.delta') return '模型流式输出';
    if (event.type === 'run.completed') return '已完成';
    if (event.type === 'run.failed') return '已失败';
    if (event.type === 'run.cancelled') return '已取消';
    if (event.type === 'voice.regeneration.progress') {
        return event.message ?? `正在生成口播音轨 · ${event.percent}%`;
    }
    if (event.type === 'node.failed') {
        const stageLabel = nodeStageLabels[event.nodeName] ?? event.nodeName;

        return `${stageLabel.replace(/^正在/, '')}失败`;
    }

    if (
        event.type === 'node.started' ||
        event.type === 'node.completed'
    ) {
        return nodeStageLabels[event.nodeName] ?? event.nodeName;
    }

    return event.type;
};

const getEventDetail = (event: DesktopAgentRunEvent) => {
    if (event.type === 'run.started') {
        return `${event.input.selectedVoice} · ${event.input.sourceAssetDirectory}`;
    }
    if (event.type === 'node.failed') return event.error;
    if (event.type === 'model.delta') return event.delta;
    if (event.type === 'voice.regeneration.progress') return event.text;
    if (event.type === 'run.failed') return event.error;
    if (event.type === 'run.cancelled') return event.reason;
    if (event.type === 'run.completed') return event.savedProjectPath;

    return undefined;
};

const getEventTone = (event: DesktopAgentRunEvent): AgentProgressStatus => {
    if (event.type === 'run.completed') return 'completed';
    if (event.type === 'run.failed' || event.type === 'node.failed') {
        return 'failed';
    }
    if (event.type === 'run.cancelled') return 'cancelled';
    if (event.type === 'approval.required') return 'waiting';

    return 'running';
};

const getTitle = (status: AgentProgressStatus) => {
    if (status === 'completed') return '已完成';
    if (status === 'failed') return '已失败';
    if (status === 'cancelled') return '已取消';
    if (status === 'waiting') return '等待确认';
    if (status === 'running') return '智能体运行中';

    return '等待创建指令';
};

const shouldDisplayProgressEvent = (event: DesktopAgentRunEvent) => {
    return event.type !== 'node.completed';
};

const shouldCoalesceProgressEntries = (
    previous: AgentProgressEntry,
    current: AgentProgressEntry
) => {
    if (previous.label !== current.label) return false;

    if (previous.tone === 'failed' || current.tone === 'failed') {
        return previous.detail === current.detail;
    }

    return true;
};

const coalesceProgressEntries = (entries: AgentProgressEntry[]) => {
    return entries.reduce<AgentProgressEntry[]>((coalescedEntries, entry) => {
        const previousEntry = coalescedEntries.at(-1);

        if (
            previousEntry &&
            shouldCoalesceProgressEntries(previousEntry, entry)
        ) {
            return [...coalescedEntries.slice(0, -1), entry];
        }

        return [...coalescedEntries, entry];
    }, []);
};

export const createAgentProgressViewModel = (
    events: DesktopAgentRunEvent[]
): AgentProgressViewModel => {
    const sortedEvents = sortAgentRunEvents(events);
    const latestEvent = sortedEvents.at(-1);
    const status = latestEvent ? getEventTone(latestEvent) : 'idle';
    const seenFailureDetails = new Set<string>();
    const progressEntries = sortedEvents.flatMap((event) => {
        if (!shouldDisplayProgressEvent(event)) return [];

        const detail = getEventDetail(event);
        const isFailure =
            event.type === 'node.failed' || event.type === 'run.failed';

        if (isFailure && detail) {
            if (seenFailureDetails.has(detail)) return [];

            seenFailureDetails.add(detail);
        }

        return [
            {
                detail,
                label: getEventLabel(event),
                sequence: event.sequence,
                tone: getEventTone(event)
            }
        ];
    });
    const entries = coalesceProgressEntries(progressEntries);

    return {
        canApprove: latestEvent?.type === 'approval.required',
        canCancel: status === 'running' || status === 'waiting',
        canRetry: status === 'cancelled' || status === 'failed',
        editorHref:
            latestEvent?.type === 'run.completed'
                ? `/editor/${latestEvent.projectId}`
                : undefined,
        entries,
        status,
        title: getTitle(status)
    };
};

export const CreateAgentProgress = ({
    events,
    onApprove,
    onCancel,
    onRetry
}: {
    events: DesktopAgentRunEvent[];
    onApprove?: () => void;
    onCancel?: () => void;
    onRetry?: () => void;
}) => {
    const viewModel = createAgentProgressViewModel(events);
    const visibleEntries = viewModel.entries.slice(-4);

    return (
        <aside
            aria-live="polite"
            className="create-agent-progress overflow-hidden rounded-[18px] border border-[rgba(217,119,6,0.12)] bg-[#171821CC] px-4 py-3 shadow-[0_18px_48px_rgba(0,0,0,0.26)] backdrop-blur-[18px]"
        >
            <div className="flex items-center justify-between gap-4">
                <div className="min-w-0">
                    <p className="text-[13px] font-[750] leading-none text-[#9A99A4]">
                        智能体执行过程
                    </p>
                    <h3 className="mt-1 truncate text-[18px] font-[850] leading-tight text-[#F4F2FA]">
                        {viewModel.title}
                    </h3>
                </div>
                <div className="flex shrink-0 items-center gap-2">
                    {viewModel.canApprove ? (
                        <button
                            type="button"
                            className="h-9 rounded-[11px] bg-[#FFFFFFE8] px-3 text-[13px] font-[850] text-[#181820] transition-colors duration-200 hover:bg-white"
                            onClick={onApprove}
                        >
                            确认分镜
                        </button>
                    ) : null}
                    {viewModel.canRetry ? (
                        <button
                            type="button"
                            className="h-9 rounded-[11px] border border-[rgba(217,119,6,0.12)] px-3 text-[13px] font-[850] text-[#E7E2F3] transition-colors duration-200 hover:bg-[#FFFFFF14]"
                            onClick={onRetry}
                        >
                            重试
                        </button>
                    ) : null}
                    {viewModel.canCancel ? (
                        <button
                            type="button"
                            className="h-9 rounded-[11px] border border-[rgba(217,119,6,0.12)] px-3 text-[13px] font-[800] text-[#AFAAB9] transition-colors duration-200 hover:bg-[#FFFFFF0F] hover:text-white"
                            onClick={onCancel}
                        >
                            取消
                        </button>
                    ) : null}
                    {viewModel.editorHref ? (
                        <ClientRouteLink
                            href={viewModel.editorHref}
                            className="grid h-9 place-items-center rounded-[11px] bg-[#8B6AF7] px-3 text-[13px] font-[850] text-white transition-colors duration-200 hover:bg-[#9C7DFF]"
                        >
                            打开编辑器
                        </ClientRouteLink>
                    ) : null}
                </div>
            </div>
            <ol className="mt-3 grid gap-1.5">
                {visibleEntries.length > 0 ? (
                    visibleEntries.map((entry) => (
                        <li
                            key={entry.sequence}
                            className="flex min-w-0 items-center gap-2 text-[12px] leading-[1.35]"
                        >
                            <span
                                className={cx(
                                    'h-1.5 w-1.5 shrink-0 rounded-full',
                                    entry.tone === 'completed' &&
                                        'bg-[#76F7B7]',
                                    entry.tone === 'failed' && 'bg-[#FF6B6B]',
                                    entry.tone === 'cancelled' &&
                                        'bg-[#AFAAB9]',
                                    entry.tone === 'waiting' && 'bg-[#FFD166]',
                                    entry.tone === 'running' && 'bg-[#8B6AF7]'
                                )}
                            />
                            <span className="shrink-0 font-[800] text-[#EAE7F2]">
                                {entry.label}
                            </span>
                            {entry.detail ? (
                                <span className="truncate text-[#8F8B9C]">
                                    {entry.detail}
                                </span>
                            ) : null}
                        </li>
                    ))
                ) : (
                    <li className="text-[12px] font-[700] text-[#8F8B9C]">
                        等待创建指令
                    </li>
                )}
            </ol>
        </aside>
    );
};
