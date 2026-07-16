/* */
import { describe, expect, it } from 'vitest';

import {
    sampleVideoProject,
    type VideoProject
} from '@wise-cut/video-project';

import {
    applySceneRegenerationStreamEvent,
    createSceneRegenerationPendingConversation,
    resolveSceneVoiceOption
} from '../renderer/mappers/scene-regeneration-conversation';

describe('scene regeneration conversation helpers', () => {
    it('applies regeneration stream events into assistant messages', () => {
        const started = applySceneRegenerationStreamEvent({
            conversation: [],
            event: {
                createdAt: '2026-06-23T09:00:00.000Z',
                messageId: 'regen_001:process',
                nodeName: 'scene_planner',
                runId: 'regen_001',
                sequence: 1,
                title: '单分镜优化创作过程',
                type: 'model.stream.started'
            }
        });
        const withDelta = applySceneRegenerationStreamEvent({
            conversation: started,
            event: {
                createdAt: '2026-06-23T09:00:01.000Z',
                delta: '先分析原分镜，再设计新的口播钩子。',
                messageId: 'regen_001:process',
                nodeName: 'scene_planner',
                runId: 'regen_001',
                sequence: 2,
                type: 'model.stream.delta'
            }
        });
        const completed = applySceneRegenerationStreamEvent({
            conversation: withDelta,
            event: {
                createdAt: '2026-06-23T09:00:02.000Z',
                messageId: 'regen_001:process',
                nodeName: 'scene_planner',
                runId: 'regen_001',
                sequence: 3,
                type: 'model.stream.completed'
            }
        });

        expect(completed).toEqual([
            expect.objectContaining({
                blocks: [
                    {
                        text: '单分镜优化创作过程',
                        type: 'heading'
                    },
                    {
                        text: '先分析原分镜，再设计新的口播钩子。',
                        type: 'paragraph'
                    }
                ],
                content: '先分析原分镜，再设计新的口播钩子。',
                nodeName: 'scene_planner',
                role: 'assistant',
                sourceEventType: 'model.stream.completed',
                tone: 'completed'
            })
        ]);
    });

    it('appends the user prompt and a running assistant loading message', () => {
        const conversation = createSceneRegenerationPendingConversation({
            conversation: [
                {
                    content: '原始创建历史',
                    createdAt: '2026-06-23T08:00:00.000Z',
                    role: 'assistant',
                    sequence: 4,
                    sourceEventType: 'run.completed',
                    tone: 'completed'
                }
            ],
            now: () => '2026-06-23T09:00:00.000Z',
            prompt: '把这一段讲得更有冲击力',
            sceneLabel: '分镜 02'
        });

        expect(conversation.map((message) => message.content)).toEqual([
            '原始创建历史',
            '把这一段讲得更有冲击力',
            '正在优化分镜 02，重新生成脚本、匹配视频素材并生成配音。'
        ]);
        expect(conversation.at(-1)).toMatchObject({
            role: 'assistant',
            sequence: 6,
            sourceEventType: 'scene.regeneration.loading',
            tone: 'running'
        });
        expect(conversation.at(-1)?.blocks).toEqual([
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
        ]);
    });

    it('uses the selected scene old voice instead of the first project voice', () => {
        const project: VideoProject = structuredClone(sampleVideoProject);

        project.scenes.push({
            durationMs: 3000,
            goal: '第二分镜',
            id: 'scene_002',
            index: 2,
            matchedVideoAssetIds: ['video_asset_001'],
            notes: '',
            script: '第二分镜文稿',
            subtitleIds: ['subtitle_asset_001'],
            title: '第二分镜',
            visualIntent: '产品界面',
            voiceAssetId: 'voice_asset_002'
        });
        project.assets.voices.push({
            durationMs: 3000,
            id: 'voice_asset_002',
            path: 'assets/voices/scene-02.mp3',
            provider: 'volcengine-seed-tts',
            voice: 'zh_male_huolixiaoge_uranus_bigtts'
        });
        project.tracks[1]?.clips.push({
            assetId: 'voice_asset_002',
            endMs: 11000,
            id: 'voice_clip_002',
            kind: 'voice',
            sceneId: 'scene_002',
            startMs: 8000,
            voicePreset: 'zh_male_huolixiaoge_uranus_bigtts'
        });

        expect(
            resolveSceneVoiceOption({
                project,
                sceneId: 'scene_002'
            })
        ).toEqual({
            selectedVoice: '活力讲解',
            selectedVoiceType: 'zh_male_huolixiaoge_uranus_bigtts'
        });
    });
});
