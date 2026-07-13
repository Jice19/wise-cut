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

    // 主进程 → 渲染(send)
    MENU_COMMAND: 'menu:command',

    // video-agent 流水线(plan §2.6)
    VIDEO_AGENT_START: 'video-agent:start',
    VIDEO_AGENT_APPROVE: 'video-agent:approve',
    VIDEO_AGENT_CANCEL: 'video-agent:cancel',
    VIDEO_AGENT_REGENERATE_SCENE: 'video-agent:regenerate-scene',
    VIDEO_AGENT_REGENERATE_VOICES: 'video-agent:regenerate-voices',

    // video-agent 主 → 渲染 推送(plan §2.6:状态流 + 日志流)
    VIDEO_AGENT_STATUS: 'video-agent:status',
    VIDEO_AGENT_LOG: 'video-agent:log',

    // 导出流水线(plan §4)
    EXPORT_START: 'export:start',
    EXPORT_PROGRESS: 'export:progress',
    EXPORT_CANCEL: 'export:cancel'
} as const;

export type IpcChannel = (typeof IPC)[keyof typeof IPC];

/**
 * video-agent 流水线状态阶段(plan §6 + §4.6 phase 字段)。
 *
 *   idle    - 未启动
 *   scanning-  scan_assets
 *   analyzing  analyze_assets(probeMedia + extractKeyframes + describeFrames)
 *   briefing  creative_brief
 *   planning   plan_scenes
 *   scoring    quality_scoring
 *   matching   match_assets
 *   voicing    synthesize_voice
 *   bgm        auto_bgm
 *   cutting    beat_cut
 *   assembling assemble_timeline
 *   awaiting-approval - 7 个 step 都跑完,等用户在 UI 点"批准"
 *   completed - 用户已批准,VideoProject 落盘
 *   cancelled - 用户中途取消
 *   failed    - 任一 step 失败
 */
export type VideoAgentPhase =
    | 'analyzing'
    | 'assembling'
    | 'awaiting-approval'
    | 'bgm'
    | 'briefing'
    | 'cancelled'
    | 'completed'
    | 'cutting'
    | 'failed'
    | 'idle'
    | 'matching'
    | 'planning'
    | 'scanning'
    | 'scoring'
    | 'voicing';

export type VideoAgentStatusEvent = {
    phase: VideoAgentPhase;
    progress: number; // 0..1
    runId: string;
};

export type VideoAgentLogEvent = {
    level: 'debug' | 'error' | 'info' | 'warn';
    message: string;
    runId: string;
    step?: string;
    timestampMs: number;
};

export type ExportPhase =
    | 'cancelled'
    | 'completed'
    | 'failed'
    | 'preparing'
    | 'rendering';

export type ExportProgressEvent = {
    /** 0..100,与 ffmpeg `-progress pipe:1` 的 out_time 同步 */
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

    // video-agent —— 本阶段(commit 4)只声明类型,不接主进程实现
    // 主进程侧 video-agent-ipc.ts 在 commit 5+ 落,届时 invoke 才不抛 "no handler"
    startVideoAgent: (input: { brief: string; runId: string }) => Promise<void>;
    approveVideoAgent: (input: { runId: string }) => Promise<void>;
    cancelVideoAgent: (input: { runId: string }) => Promise<void>;
    regenerateVideoAgentScene: (input: {
        runId: string;
        sceneId: string;
    }) => Promise<void>;
    regenerateVideoAgentVoices: (input: { runId: string }) => Promise<void>;
    onVideoAgentStatus: (
        handler: (event: VideoAgentStatusEvent) => void
    ) => () => void;
    onVideoAgentLog: (
        handler: (event: VideoAgentLogEvent) => void
    ) => () => void;

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
