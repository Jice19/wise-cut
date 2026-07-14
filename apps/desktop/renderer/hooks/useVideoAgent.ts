/**
 * useVideoAgent —— renderer 端订阅 miaomaAPI.videoAgent 事件流的 hook。
 *
 * 设计:
 *   - useEffect 调 miaomaAPI.onVideoAgentEvent(handler) 拿 unsubscribe
 *   - reducer 按 AgentRunEvent.type 分派,维护:
 *       - runStatus: idle / running / awaiting_approval / completed / failed / cancelled
 *       - nodes: Record<nodeName, { status: 'pending'|'running'|'completed'|'failed', progress?, durationMs?, error? }>
 *       - interrupt: SceneApprovalRequest | null(最近一次未处理)
 *       - projectPath / errorMessage
 *   - start(input) / approve(approved) / cancel() 包装 miaomaAPI 调用
 *
 * commit 8 聚焦:hook + reducer + 跟 miaomaAPI 的订阅。SceneApprovalDialog
 * 是消费 interrupt 的纯组件,在 agent-run-screen.tsx 里条件渲染。
 */

import { useCallback, useEffect, useReducer, useRef } from 'react';

import type {
    AgentRunEvent,
    SceneApprovalRequest,
    VideoCreationInput
} from '../../shared/ipc';

export type NodeStatus = 'pending' | 'running' | 'completed' | 'failed';

export type NodeState = {
    durationMs?: number;
    error?: string;
    label?: string;
    progress?: number;
    status: NodeStatus;
};

export type RunStatus =
    | 'idle'
    | 'running'
    | 'awaiting_approval'
    | 'completed'
    | 'failed'
    | 'cancelled';

export type VideoAgentState = {
    errorMessage?: string;
    interrupt: SceneApprovalRequest | null;
    nodes: Record<string, NodeState>;
    projectPath?: string;
    runId: string | null;
    runStatus: RunStatus;
};

const INITIAL_STATE: VideoAgentState = {
    interrupt: null,
    nodes: {},
    runId: null,
    runStatus: 'idle'
};

const upsertNode = (
    nodes: Record<string, NodeState>,
    name: string,
    patch: Partial<NodeState>
): Record<string, NodeState> => ({
    ...nodes,
    [name]: { ...nodes[name], ...patch }
});

export type Action = { event: AgentRunEvent } | { type: 'reset' };

export const videoAgentReducer = (
    state: VideoAgentState,
    action: Action
): VideoAgentState => {
    if (action.type === 'reset') return INITIAL_STATE;

    const evt = action.event;
    switch (evt.type) {
        case 'run.started':
            return {
                ...INITIAL_STATE,
                runId: evt.runId,
                runStatus: 'running'
            };

        case 'node.started':
            return {
                ...state,
                nodes: upsertNode(state.nodes, evt.nodeName, {
                    label: evt.nodeLabel,
                    progress: 0,
                    status: 'running'
                })
            };

        case 'node.progress':
            return {
                ...state,
                nodes: upsertNode(state.nodes, evt.nodeName, {
                    progress: evt.progress,
                    status: 'running'
                })
            };

        case 'node.completed':
            return {
                ...state,
                nodes: upsertNode(state.nodes, evt.nodeName, {
                    durationMs: evt.durationMs,
                    progress: 100,
                    status: 'completed'
                })
            };

        case 'node.failed':
            return {
                ...state,
                nodes: upsertNode(state.nodes, evt.nodeName, {
                    error: evt.error,
                    status: 'failed'
                })
            };

        case 'interrupt':
            return {
                ...state,
                interrupt: evt.payload,
                runStatus: 'awaiting_approval'
            };

        case 'interrupt.resumed':
            return {
                ...state,
                interrupt: null,
                runStatus: 'running'
            };

        case 'run.completed':
            return {
                ...state,
                projectPath: evt.projectPath,
                runStatus: 'completed'
            };

        case 'run.failed':
            return {
                ...state,
                errorMessage: evt.error,
                runStatus: 'failed'
            };

        case 'run.cancelled':
            return {
                ...state,
                runStatus: 'cancelled'
            };

        // voice regen / llm 流式事件 commit 6.5/8 才用,先 no-op
        case 'llm.chunk':
        case 'llm.completed':
        case 'voice.regeneration.progress':
            return state;

        default: {
            // exhaustiveness check
            const _exhaustive: never = evt;
            return state;
        }
    }
};

export type UseVideoAgentResult = {
    approve: (approved: boolean) => Promise<void>;
    cancel: () => Promise<void>;
    errorMessage?: string;
    interrupt: SceneApprovalRequest | null;
    nodes: Record<string, NodeState>;
    projectPath?: string;
    runId: string | null;
    runStatus: RunStatus;
    start: (input: VideoCreationInput) => Promise<void>;
};

/**
 * miaomaAPI 注入点 —— 测试时可注入 stub。生产从 window.miaomaAPI 拿。
 */
type MiaomaVideoAgentBridge = Pick<
    Window['miaomaAPI'],
    | 'approveVideoAgent'
    | 'cancelVideoAgent'
    | 'onVideoAgentEvent'
    | 'startVideoAgent'
>;

const defaultBridge = (): MiaomaVideoAgentBridge => {
    if (typeof window === 'undefined' || !window.miaomaAPI) {
        throw new Error('miaomaAPI not available — invoke from renderer only');
    }
    const api = window.miaomaAPI;
    return {
        approveVideoAgent: api.approveVideoAgent.bind(api),
        cancelVideoAgent: api.cancelVideoAgent.bind(api),
        onVideoAgentEvent: api.onVideoAgentEvent.bind(api),
        startVideoAgent: api.startVideoAgent.bind(api)
    };
};

export const useVideoAgent = (
    options: { bridge?: MiaomaVideoAgentBridge } = {}
): UseVideoAgentResult => {
    const bridge = options.bridge ?? defaultBridge();
    const [state, dispatch] = useReducer(videoAgentReducer, INITIAL_STATE);
    const runIdRef = useRef<string | null>(null);

    useEffect(() => {
        const unsubscribe = bridge.onVideoAgentEvent((event) => {
            dispatch({ event });
            runIdRef.current = event.runId;
        });
        return unsubscribe;
    }, [bridge]);

    const start = useCallback(
        async (input: VideoCreationInput): Promise<void> => {
            runIdRef.current = input.runId;
            await bridge.startVideoAgent(input);
        },
        [bridge]
    );

    const approve = useCallback(
        async (approved: boolean): Promise<void> => {
            const runId = runIdRef.current;
            if (!runId) return;
            await bridge.approveVideoAgent({ approved, runId });
        },
        [bridge]
    );

    const cancel = useCallback(async (): Promise<void> => {
        const runId = runIdRef.current;
        if (!runId) return;
        await bridge.cancelVideoAgent({ runId });
    }, [bridge]);

    return {
        approve,
        cancel,
        errorMessage: state.errorMessage,
        interrupt: state.interrupt,
        nodes: state.nodes,
        projectPath: state.projectPath,
        runId: state.runId,
        runStatus: state.runStatus,
        start
    };
};
