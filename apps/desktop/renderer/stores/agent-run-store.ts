
import { useSyncExternalStore } from 'react';

import type { AgentConversationMessage } from '@wise-cut/video-project';

import type {
    DesktopAgentRunEvent,
    VideoAgentOperationResult,
    VideoAgentResultData,
    VideoAgentStartInput
} from '../../shared/video-agent';
import {
    type AgentConversationViewModel,
    type AgentRunConversationEvent,
    createAgentConversationViewModel,
    type UserReplyConversationEvent
} from '../mappers/agent-run-conversation';

type AgentRunSnapshot = {
    activeRunId?: string;
    events: AgentRunConversationEvent[];
    viewModel: AgentConversationViewModel;
};

const eventsByRunId = new Map<string, AgentRunConversationEvent[]>();
const listeners = new Set<() => void>();
let activeRunId: string | undefined;
let eventSubscription: (() => void) | undefined;
let lastSubmitInput: VideoAgentStartInput | undefined;
let version = 0;

const notify = () => {
    version += 1;
    listeners.forEach((listener) => {
        listener();
    });
};

const subscribe = (listener: () => void) => {
    listeners.add(listener);

    return () => {
        listeners.delete(listener);
    };
};

const getVersion = () => version;

const getEvents = (runId: string) => eventsByRunId.get(runId) ?? [];

const setEvents = (runId: string, events: AgentRunConversationEvent[]) => {
    eventsByRunId.set(runId, events);
    notify();
};

const getNextLocalSequence = (runId: string) =>
    Math.max(0, ...getEvents(runId).map((event) => event.sequence)) + 1;

const isSameEvent = (
    first: AgentRunConversationEvent,
    second: AgentRunConversationEvent
) =>
    first.runId === second.runId &&
    first.sequence === second.sequence &&
    first.type === second.type;

const persistConversation = async ({
    conversation,
    projectId
}: {
    conversation: AgentConversationMessage[];
    projectId: string;
}) => {
    if (typeof window === 'undefined' || !window.miaomaAPI?.videoProject) {
        return;
    }

    const listResult = await window.miaomaAPI.videoProject.list();

    if (listResult.success === false) return;

    const projectFile = listResult.data.find(
        (item) => item.project.project.id === projectId
    );

    if (!projectFile) return;

    await window.miaomaAPI.videoProject.save({
        filePath: projectFile.filePath,
        project: {
            ...projectFile.project,
            ai: {
                ...projectFile.project.ai,
                conversation
            }
        }
    });
};

export const addAgentRunEvent = (event: DesktopAgentRunEvent) => {
    const currentEvents = getEvents(event.runId);
    const withoutOptimisticStarted =
        event.type === 'run.started'
            ? currentEvents.filter(
                  (currentEvent) =>
                      !(
                          currentEvent.type === 'run.started' &&
                          currentEvent.sequence === 0
                      )
              )
            : currentEvents;

    if (
        withoutOptimisticStarted.some((currentEvent) =>
            isSameEvent(currentEvent, event)
        )
    ) {
        return;
    }

    const nextEvents = [...withoutOptimisticStarted, event];

    activeRunId = event.runId;
    setEvents(event.runId, nextEvents);

    if (event.type === 'run.completed') {
        const viewModel = createAgentConversationViewModel({
            events: nextEvents
        });

        void persistConversation({
            conversation: viewModel.messages,
            projectId: event.projectId
        });
    }
};

export const ensureAgentRunEventSubscription = () => {
    if (eventSubscription) return;
    if (typeof window === 'undefined') return;

    eventSubscription = window.miaomaAPI?.videoAgent?.onEvent((event) => {
        addAgentRunEvent(event);
    });
};

export const startAgentRun = async (
    input: VideoAgentStartInput
): Promise<VideoAgentOperationResult<VideoAgentResultData>> => {
    lastSubmitInput = input;
    ensureAgentRunEventSubscription();

    if (typeof window === 'undefined' || !window.miaomaAPI?.videoAgent) {
        return {
            error: {
                code: 'RUN_FAILED',
                message: '智能体接口尚未就绪'
            },
            success: false
        };
    }

    const result = await window.miaomaAPI.videoAgent.start(input);

    if (result.success) {
        activeRunId = result.data.runId;

        if (
            !getEvents(result.data.runId).some(
                (event) => event.type === 'run.started'
            )
        ) {
            setEvents(result.data.runId, [
                {
                    createdAt: new Date().toISOString(),
                    input: {
                        prompt: input.prompt,
                        selectedVoice: input.selectedVoice,
                        selectedVoiceType: input.selectedVoiceType,
                        sourceAssetDirectory: input.sourceAssetDirectory
                    },
                    runId: result.data.runId,
                    sequence: 0,
                    type: 'run.started'
                }
            ]);
        } else {
            notify();
        }
    }

    return result;
};

export const addAgentRunUserReply = ({
    approved,
    content,
    runId
}: {
    approved: boolean;
    content: string;
    runId: string;
}) => {
    const event: UserReplyConversationEvent = {
        approved,
        content,
        createdAt: new Date().toISOString(),
        runId,
        sequence: getNextLocalSequence(runId),
        type: 'user.reply'
    };

    setEvents(runId, [...getEvents(runId), event]);
};

export const approveAgentRun = async (runId: string) => {
    addAgentRunUserReply({
        approved: true,
        content: '确认分镜，继续生成',
        runId
    });

    return window.miaomaAPI.videoAgent.approve({
        approved: true,
        runId
    });
};

export const cancelAgentRun = async (runId: string) => {
    addAgentRunUserReply({
        approved: false,
        content: '取消本次创作',
        runId
    });

    return window.miaomaAPI.videoAgent.cancel({ runId });
};

export const getAgentRunSnapshot = (runId?: string): AgentRunSnapshot => {
    const resolvedRunId = runId ?? activeRunId;
    const events = resolvedRunId ? getEvents(resolvedRunId) : [];

    return {
        activeRunId: resolvedRunId,
        events,
        viewModel: createAgentConversationViewModel({ events })
    };
};

export const getLastAgentSubmitInput = () => lastSubmitInput;

export const useAgentRunSnapshot = (runId?: string): AgentRunSnapshot => {
    useSyncExternalStore(subscribe, getVersion, getVersion);

    return getAgentRunSnapshot(runId);
};
