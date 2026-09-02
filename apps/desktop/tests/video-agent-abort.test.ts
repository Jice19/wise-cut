/* */
import { describe, expect, it } from 'vitest';

import type {
    VideoAgentApprovalInput,
    VideoAgentStartInput
} from '../shared/video-agent';

const waitFor = async (
    predicate: () => boolean,
    timeoutMs = 2000
): Promise<void> => {
    const deadline = Date.now() + timeoutMs;

    while (Date.now() < deadline) {
        if (predicate()) return;
        await new Promise((resolve) => setTimeout(resolve, 10));
    }

    throw new Error('waitFor timed out');
};

const startInput = (): VideoAgentStartInput => ({
    prompt: '生成一条介绍智剪的视频',
    selectedVoice: '温婉学姐',
    selectedVoiceType: 'zh_female_wenroushunv_uranus_bigtts',
    sourceAssetDirectory: '/tmp/app-assets'
});

describe('video agent abort (AbortController wiring)', () => {
    it('keeps the same abort signal alive across the approval pause and aborts it on cancel', async () => {
        const { createLangGraphVideoAgentController } = await import(
            '../client/video-agent-ipc'
        );
        const signals: {
            phase: 'approve' | 'start';
            signal?: AbortSignal;
        }[] = [];
        const controller = createLangGraphVideoAgentController({
            createRunId: () => 'run-abort-lifecycle',
            createRunner: () => ({
                resume: async (_input, options) => {
                    signals.push({
                        phase: 'approve',
                        signal: options?.signal
                    });

                    return {
                        errors: [],
                        runId: 'run-abort-lifecycle',
                        status: 'waiting_for_approval' as const
                    };
                },
                start: async (_input, options) => {
                    signals.push({
                        phase: 'start',
                        signal: options?.signal
                    });

                    return {
                        errors: [],
                        runId: 'run-abort-lifecycle',
                        status: 'waiting_for_approval' as const
                    };
                }
            }),
            store: {} as never
        });
        const emit = () => {};

        await controller.start(startInput(), emit);
        await waitFor(() => signals.some((item) => item.phase === 'start'));

        const startSignal = signals.find((item) => item.phase === 'start')!
            .signal;

        // run 停在 waiting_for_approval(interrupt 语义)后,abort controller
        // 必须还活着(第 2 轮修复:start 的 finally 不再删 controller)。
        expect(startSignal).toBeDefined();

        await controller.approve(
            { approved: true, runId: 'run-abort-lifecycle' } satisfies
                VideoAgentApprovalInput,
            emit
        );
        await waitFor(() =>
            signals.some((item) => item.phase === 'approve')
        );

        const resumeSignal = signals.find((item) => item.phase === 'approve')!
            .signal;

        // resume 拿到的是 start 同一个 AbortController 的 signal →
        // 用户在 resume 阶段取消时真的能 abort 到图执行。
        expect(resumeSignal).toBe(startSignal);

        const cancelResult = await controller.cancel(
            { runId: 'run-abort-lifecycle' },
            emit
        );

        expect(cancelResult).toEqual({
            data: { runId: 'run-abort-lifecycle' },
            success: true
        });
        expect(startSignal?.aborted).toBe(true);
    });

    it('does not emit run.failed when the graph rejects after a user cancel', async () => {
        const { createLangGraphVideoAgentController } = await import(
            '../client/video-agent-ipc'
        );
        const emittedEvents: { type: string }[] = [];
        const controller = createLangGraphVideoAgentController({
            createRunId: () => 'run-abort-suppress',
            createRunner: () => ({
                resume: async () => ({
                    errors: [],
                    runId: 'run-abort-suppress',
                    status: 'waiting_for_approval' as const
                }),
                // 模拟一个卡在网络调用里的 run:等 abort 信号后才结束,结束方式是抛错
                // (真实场景 LangGraph invoke 会因 abort 抛 AbortError)。
                start: async (_input, options) =>
                    new Promise((_resolve, reject) => {
                        const signal = options?.signal;

                        if (signal?.aborted) {
                            reject(new Error('fake abort'));
                            return;
                        }

                        signal?.addEventListener(
                            'abort',
                            () => reject(new Error('fake inner abort')),
                            { once: true }
                        );
                    })
            }),
            store: {} as never
        });
        const emit = (event: { type: string }) => {
            emittedEvents.push(event);
        };

        const startResult = await controller.start(startInput(), emit);

        expect(startResult).toEqual({
            data: { runId: 'run-abort-suppress' },
            success: true
        });

        await controller.cancel({ runId: 'run-abort-suppress' }, emit);

        // 等 runInBackground 的 catch 跑完(取消路径不补 run.failed)
        await new Promise((resolve) => setTimeout(resolve, 100));

        expect(
            emittedEvents.some((event) => event.type === 'run.failed')
        ).toBe(false);
        expect(
            emittedEvents.some((event) => event.type === 'run.cancelled')
        ).toBe(true);
    });
});
