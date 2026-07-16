
import type {
    AgentConversationMessage,
    VideoProject,
    VoiceClip
} from '@wise-cut/video-project';

import type { DesktopAgentRunEvent } from '../../shared/video-agent';
import {
    defaultVideoAgentVoice,
    videoAgentVoiceOptions
} from '../../shared/video-agent-voices';

const isVoiceClip = (
    clip: VideoProject['tracks'][number]['clips'][number]
): clip is VoiceClip => clip.kind === 'voice';

type SceneRegenerationStreamEvent = Extract<
    DesktopAgentRunEvent,
    {
        type:
            | 'model.stream.completed'
            | 'model.stream.delta'
            | 'model.stream.started';
    }
>;

const getNextSequence = (conversation: AgentConversationMessage[]) =>
    Math.max(0, ...conversation.map((message) => message.sequence)) + 1;

const findStreamMessageIndex = ({
    conversation,
    event
}: {
    conversation: AgentConversationMessage[];
    event: SceneRegenerationStreamEvent;
}) =>
    conversation.findIndex(
        (message) =>
            message.nodeName === event.nodeName &&
            message.sourceEventType?.startsWith('model.stream') === true
    );

export const applySceneRegenerationStreamEvent = ({
    conversation,
    event
}: {
    conversation: AgentConversationMessage[];
    event: SceneRegenerationStreamEvent;
}): AgentConversationMessage[] => {
    if (event.type === 'model.stream.started') {
        const existingIndex = findStreamMessageIndex({
            conversation,
            event
        });

        if (existingIndex >= 0) return conversation;

        return [
            ...conversation,
            {
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
                sequence: getNextSequence(conversation),
                sourceEventType: event.type,
                tone: 'running'
            }
        ];
    }

    const existingIndex = findStreamMessageIndex({
        conversation,
        event
    });

    if (existingIndex < 0) return conversation;

    return conversation.map((message, index) => {
        if (index !== existingIndex) return message;

        if (event.type === 'model.stream.completed') {
            return {
                ...message,
                sourceEventType: event.type,
                tone: 'completed'
            };
        }

        const nextContent = `${message.content}${event.delta}`;
        const headingBlocks =
            message.blocks?.filter((block) => block.type === 'heading') ?? [];

        return {
            ...message,
            blocks: [
                ...headingBlocks,
                {
                    text: nextContent,
                    type: 'paragraph'
                }
            ],
            content: nextContent,
            sourceEventType: event.type
        };
    });
};

export const createSceneRegenerationPendingConversation = ({
    conversation,
    now,
    prompt,
    sceneLabel
}: {
    conversation: AgentConversationMessage[];
    now: () => string;
    prompt: string;
    sceneLabel: string;
}): AgentConversationMessage[] => {
    const nextSequence = getNextSequence(conversation);
    const createdAt = now();

    return [
        ...conversation,
        {
            content: prompt,
            createdAt,
            role: 'user',
            sequence: nextSequence,
            sourceEventType: 'scene.regeneration.request'
        },
        {
            blocks: [
                {
                    items: [
                        {
                            detail: '等待智能体返回新的脚本、素材匹配和配音结果',
                            label: '单分镜优化中',
                            status: 'running'
                        }
                    ],
                    type: 'progress'
                }
            ],
            content: `正在优化${sceneLabel}，重新生成脚本、匹配视频素材并生成配音。`,
            createdAt,
            nodeName: 'scene_regeneration',
            role: 'assistant',
            sequence: nextSequence + 1,
            sourceEventType: 'scene.regeneration.loading',
            tone: 'running'
        }
    ];
};

export const resolveSceneVoiceOption = ({
    project,
    sceneId
}: {
    project: VideoProject;
    sceneId: string;
}) => {
    const voiceTrack = project.tracks.find((track) => track.kind === 'voice');
    const voiceClip = voiceTrack?.clips
        .filter(isVoiceClip)
        .find((clip) => clip.sceneId === sceneId);
    const scene = project.scenes.find((item) => item.id === sceneId);
    const voiceAsset = project.assets.voices.find(
        (asset) =>
            asset.id === voiceClip?.assetId || asset.id === scene?.voiceAssetId
    );
    const voiceType =
        voiceAsset?.voice ??
        (voiceClip?.voicePreset.startsWith('zh_')
            ? voiceClip.voicePreset
            : undefined);
    const matchedOption = videoAgentVoiceOptions.find(
        (option) => option.voiceType === voiceType
    );

    if (matchedOption) {
        return {
            selectedVoice: matchedOption.label,
            selectedVoiceType: matchedOption.voiceType
        };
    }

    return {
        selectedVoice:
            voiceClip?.voicePreset && !voiceClip.voicePreset.startsWith('zh_')
                ? voiceClip.voicePreset
                : defaultVideoAgentVoice.label,
        selectedVoiceType: voiceType ?? defaultVideoAgentVoice.voiceType
    };
};
