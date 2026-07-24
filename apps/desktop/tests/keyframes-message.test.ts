/* */
import { describe, expect, it } from 'vitest';

import { createAgentConversationViewModel } from '../renderer/mappers/agent-run-conversation';

const buildKeyframeEvent = ({
    assetId,
    fileName,
    frames,
    totalCompleted,
    totalScanned,
    sequence
}: {
    assetId: string;
    fileName: string;
    frames: {
        dataUrl: string;
        index: number;
        timestampMs: number;
    }[];
    sequence: number;
    totalCompleted: number;
    totalScanned: number;
}) => ({
    assetId,
    createdAt: '2026-07-24T14:00:00.000Z',
    fileName,
    keyframes: frames,
    runId: 'run_test_001',
    sequence,
    totalCompleted,
    totalScanned,
    type: 'asset_scan_progress' as const
});

describe('KeyframesMessage mapper', () => {
    it('emits a chat message per asset with keyframes block', () => {
        const events = [
            buildKeyframeEvent({
                assetId: 'video_asset_run_test_001_001',
                fileName: '视频1.mp4',
                frames: [
                    {
                        dataUrl: 'data:image/jpeg;base64,aaa',
                        index: 0,
                        timestampMs: 0
                    },
                    {
                        dataUrl: 'data:image/jpeg;base64,bbb',
                        index: 1,
                        timestampMs: 2000
                    }
                ],
                sequence: 1,
                totalCompleted: 1,
                totalScanned: 2
            }),
            buildKeyframeEvent({
                assetId: 'video_asset_run_test_001_002',
                fileName: '视频2.mp4',
                frames: [
                    {
                        dataUrl: 'data:image/jpeg;base64,ccc',
                        index: 0,
                        timestampMs: 0
                    }
                ],
                sequence: 2,
                totalCompleted: 2,
                totalScanned: 2
            })
        ];

        const viewModel = createAgentConversationViewModel({ events });

        // 找到 keyframes 消息:sourceEventType === 'asset_scan_progress'
        const keyframesMessages = viewModel.messages.filter(
            (m) => m.sourceEventType === 'asset_scan_progress'
        );

        expect(keyframesMessages).toHaveLength(2);
        expect(keyframesMessages[0]?.role).toBe('assistant');
        expect(keyframesMessages[0]?.tone).toBe('running');
        expect(keyframesMessages[1]?.tone).toBe('completed');
        expect(keyframesMessages[0]?.content).toContain('视频1.mp4');
        expect(keyframesMessages[0]?.content).toContain('2 帧');
        expect(keyframesMessages[1]?.content).toContain('视频2.mp4');

        // blocks 里应该有一个 keyframes block,assets 数组只有一个元素
        const block0 = keyframesMessages[0]?.blocks?.find(
            (b) => b.type === 'keyframes'
        );
        expect(block0?.type).toBe('keyframes');
        if (block0?.type === 'keyframes') {
            expect(block0.assets).toHaveLength(1);
            expect(block0.assets[0]?.fileName).toBe('视频1.mp4');
            expect(block0.assets[0]?.frames).toHaveLength(2);
        }
    });

    it('overwrites message in place when same assetId emits again', () => {
        const events = [
            buildKeyframeEvent({
                assetId: 'video_asset_run_test_001_001',
                fileName: '视频1.mp4',
                frames: [
                    {
                        dataUrl: 'data:image/jpeg;base64,old1',
                        index: 0,
                        timestampMs: 0
                    }
                ],
                sequence: 1,
                totalCompleted: 1,
                totalScanned: 1
            }),
            buildKeyframeEvent({
                assetId: 'video_asset_run_test_001_001',
                fileName: '视频1.mp4',
                frames: [
                    {
                        dataUrl: 'data:image/jpeg;base64,new1',
                        index: 0,
                        timestampMs: 0
                    },
                    {
                        dataUrl: 'data:image/jpeg;base64,new2',
                        index: 1,
                        timestampMs: 2000
                    }
                ],
                sequence: 2,
                totalCompleted: 1,
                totalScanned: 1
            })
        ];

        const viewModel = createAgentConversationViewModel({ events });
        const keyframesMessages = viewModel.messages.filter(
            (m) => m.sourceEventType === 'asset_scan_progress'
        );

        expect(keyframesMessages).toHaveLength(1);

        const block = keyframesMessages[0]?.blocks?.find(
            (b) => b.type === 'keyframes'
        );

        if (block?.type === 'keyframes') {
            expect(block.assets[0]?.frames).toHaveLength(2);
            expect(block.assets[0]?.frames[0]?.dataUrl).toBe(
                'data:image/jpeg;base64,new1'
            );
        }
    });

    it('produces no keyframes message when no asset_scan_progress events', () => {
        const events = [
            {
                createdAt: '2026-07-24T14:00:00.000Z',
                nodeName: 'asset_scan',
                runId: 'run_test_001',
                sequence: 0,
                type: 'node.started' as const
            }
        ];

        const viewModel = createAgentConversationViewModel({ events });
        const keyframesMessages = viewModel.messages.filter(
            (m) => m.sourceEventType === 'asset_scan_progress'
        );

        expect(keyframesMessages).toHaveLength(0);
    });

    it('marks tone=completed when totalCompleted equals totalScanned', () => {
        const events = [
            buildKeyframeEvent({
                assetId: 'video_asset_run_test_001_001',
                fileName: '视频1.mp4',
                frames: [
                    {
                        dataUrl: 'data:image/jpeg;base64,aaa',
                        index: 0,
                        timestampMs: 0
                    }
                ],
                sequence: 1,
                totalCompleted: 3,
                totalScanned: 3
            })
        ];

        const viewModel = createAgentConversationViewModel({ events });
        const msg = viewModel.messages.find(
            (m) => m.sourceEventType === 'asset_scan_progress'
        );

        expect(msg?.tone).toBe('completed');
    });

    it('marks tone=running when totalCompleted < totalScanned', () => {
        const events = [
            buildKeyframeEvent({
                assetId: 'video_asset_run_test_001_001',
                fileName: '视频1.mp4',
                frames: [
                    {
                        dataUrl: 'data:image/jpeg;base64,aaa',
                        index: 0,
                        timestampMs: 0
                    }
                ],
                sequence: 1,
                totalCompleted: 1,
                totalScanned: 3
            })
        ];

        const viewModel = createAgentConversationViewModel({ events });
        const msg = viewModel.messages.find(
            (m) => m.sourceEventType === 'asset_scan_progress'
        );

        expect(msg?.tone).toBe('running');
    });
});
