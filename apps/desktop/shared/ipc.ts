/**
 * 渲染层 ↔ 主进程 共享的 IPC channel 常量。
 * 双向引用:主进程 ipcMain.handle / webContents.send 与渲染层 window.miaomaAPI.* 使用同名常量。
 */
export const IPC = {
    // 渲染 → 主进程(invoke)
    APP_GET_VERSION: 'app:get-version',
    APP_GET_PLATFORM: 'app:get-platform',
    WINDOW_MINIMIZE: 'window:minimize',
    WINDOW_MAXIMIZE: 'window:maximize',
    WINDOW_CLOSE: 'window:close',
    DIALOG_SELECT_DIRECTORY: 'dialog:select-directory',

    // 主进程 → 渲染(send)
    MENU_COMMAND: 'menu:command',

    // video-agent 流水线 invoke
    VIDEO_AGENT_START: 'video-agent:start',
    VIDEO_AGENT_APPROVE: 'video-agent:approve',
    VIDEO_AGENT_CANCEL: 'video-agent:cancel',
    VIDEO_AGENT_REGENERATE_SCENE: 'video-agent:regenerate-scene',
    VIDEO_AGENT_REGENERATE_VOICES: 'video-agent:regenerate-voices',

    // video-agent 主 → 渲染 推送(commit 0a 合并为单 channel + 13 事件 union)
    VIDEO_AGENT_EVENT: 'video-agent:event',
    VIDEO_AGENT_REQUEST_FULL_STATE: 'video-agent:request-full-state',

    // 导出流水线
    EXPORT_START: 'export:start',
    EXPORT_PROGRESS: 'export:progress',
    EXPORT_CANCEL: 'export:cancel'
} as const;

export type IpcChannel = (typeof IPC)[keyof typeof IPC];

/**
 * video-agent 流水线 13 种事件 discriminated union(plan §4 / long-task-event-stream.md §2)
 *
 * 所有事件继承 base 字段:{ runId, seq, timestamp }。
 * 单一 channel `VIDEO_AGENT_EVENT` 推所有事件,前端按 `type` discriminated switch。
 */
export type AgentRunEventBase = {
    runId: string;
    seq: number;
    timestamp: number;
};

export type AgentRunEvent = AgentRunEventBase &
    (
        | { type: 'run.started'; input: VideoCreationInput }
        | { type: 'run.completed'; projectPath: string; durationMs: number }
        | { type: 'run.failed'; error: string; stage?: string }
        | { type: 'run.cancelled' }
        | { type: 'node.started'; nodeName: string; nodeLabel: string }
        | { type: 'node.completed'; nodeName: string; durationMs: number }
        | { type: 'node.failed'; nodeName: string; error: string }
        | {
              type: 'node.progress';
              nodeName: string;
              progress: number;
              message: string;
          }
        | { type: 'llm.chunk'; nodeName: string; content: string }
        | { type: 'llm.completed'; nodeName: string; tokenCount: number }
        | {
              type: 'voice.regeneration.progress';
              current: number;
              total: number;
              percent: number;
          }
        | {
              type: 'interrupt';
              interruptType: 'scene_approval';
              payload: SceneApprovalRequest;
          }
        | { type: 'interrupt.resumed'; interruptType: string }
    );

/**
 * scene_approval interrupt payload(plan §3 / long-task-event-stream.md §5)
 */
export type SceneApprovalRequest = {
    type: 'scene-plan';
    payload: {
        brief?: {
            title: string;
            summary: string;
            audience: string;
            tone: string;
            keyMessages: string[];
        };
        scenes: {
            sceneId: string;
            startMs: number;
            endMs: number;
            narration: string;
            visualBrief: string;
        }[];
    };
};

export type SceneApprovalResume = { approved: boolean };

/**
 * 用户输入(commit 6 起 VideoCreationInput 完整版落 schema)
 */
export type VideoCreationInput = {
    brief: string;
    runId: string;
    sourceAssetDirectory: string;
    voiceConfig?: {
        provider: 'volcengine-seed-tts';
        voiceId: string;
    };
};

export type ExportPhase =
    | 'cancelled'
    | 'completed'
    | 'failed'
    | 'preparing'
    | 'rendering';

export type ExportProgressEvent = {
    percent: number;
    phase: ExportPhase;
    runId: string;
};

/** 渲染层可调用的 miaomaAPI 方法类型声明,preload 中通过 contextBridge.exposeInMainWorld 暴露。 */
export interface MiaomaAPI {
    getVersion: () => Promise<string>;
    getPlatform: () => Promise<NodeJS.Platform>;
    minimize: () => Promise<void>;
    maximize: () => Promise<void>;
    close: () => Promise<void>;
    onMenuCommand: (handler: (command: string) => void) => () => void;
    /** 弹原生选目录对话框,返回选中路径或 null(用户取消) */
    selectDirectory: (input: { title?: string }) => Promise<string | null>;

    // video-agent
    startVideoAgent: (input: VideoCreationInput) => Promise<void>;
    approveVideoAgent: (input: {
        runId: string;
        approved: boolean;
    }) => Promise<void>;
    cancelVideoAgent: (input: { runId: string }) => Promise<void>;
    regenerateVideoAgentScene: (input: {
        runId: string;
        sceneId: string;
        feedback?: string;
    }) => Promise<void>;
    regenerateVideoAgentVoices: (input: { runId: string }) => Promise<void>;
    onVideoAgentEvent: (handler: (event: AgentRunEvent) => void) => () => void;
    requestVideoAgentFullState: (input: { runId: string }) => Promise<unknown>;

    // export —— commit 6/9 落
    startExport: (input: {
        projectId: string;
        quality: '2k' | '1080p' | '4k' | '720p';
    }) => Promise<void>;
    cancelExport: (input: { runId: string }) => Promise<void>;
    onExportProgress: (
        handler: (event: ExportProgressEvent) => void
    ) => () => void;
}

declare global {
    interface Window {
        miaomaAPI: MiaomaAPI;
    }
}
