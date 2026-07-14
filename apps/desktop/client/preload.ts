import { contextBridge, ipcRenderer, type IpcRendererEvent } from 'electron';

import {
    type AgentRunEvent,
    IPC,
    type MiaomaAPI,
    type VideoCreationInput
} from '../shared/ipc';

// preload 脚本运行在独立 context,负责把 Electron 主进程的 IPC 能力
// 桥接到渲染层的 window.miaomaAPI。原则:只暴露 safe API,不直接传
// ipcRenderer 给 renderer。
const api: MiaomaAPI = {
    getVersion: () => ipcRenderer.invoke(IPC.APP_GET_VERSION),
    getPlatform: () => ipcRenderer.invoke(IPC.APP_GET_PLATFORM),
    minimize: () => ipcRenderer.invoke(IPC.WINDOW_MINIMIZE),
    maximize: () => ipcRenderer.invoke(IPC.WINDOW_MAXIMIZE),
    close: () => ipcRenderer.invoke(IPC.WINDOW_CLOSE),
    onMenuCommand: (handler) => {
        const wrapped = (_event: unknown, command: string): void =>
            handler(command);
        ipcRenderer.on(IPC.MENU_COMMAND, wrapped);
        // 返回取消订阅函数,供 React useEffect 清理
        return () => ipcRenderer.removeListener(IPC.MENU_COMMAND, wrapped);
    },

    // video-agent — 5 invoke 把渲染层操作转发给主进程 controller,
    // 1 onEvent 订阅主进程推送的 AgentRunEvent 流。
    startVideoAgent: (input: VideoCreationInput) =>
        ipcRenderer.invoke(IPC.VIDEO_AGENT_START, input),
    approveVideoAgent: (input: { runId: string; approved: boolean }) =>
        ipcRenderer.invoke(IPC.VIDEO_AGENT_APPROVE, input),
    cancelVideoAgent: (input: { runId: string }) =>
        ipcRenderer.invoke(IPC.VIDEO_AGENT_CANCEL, input),
    regenerateVideoAgentScene: (input: {
        runId: string;
        sceneId: string;
        feedback?: string;
    }) => ipcRenderer.invoke(IPC.VIDEO_AGENT_REGENERATE_SCENE, input),
    regenerateVideoAgentVoices: (input: { runId: string }) =>
        ipcRenderer.invoke(IPC.VIDEO_AGENT_REGENERATE_VOICES, input),
    // 主进程通过 IPC.VIDEO_AGENT_EVENT 推 AgentRunEvent,
    // renderer 端用 switch(event.type) 分发到 reducer。
    onVideoAgentEvent: (handler) => {
        const wrapped = (_event: IpcRendererEvent, evt: AgentRunEvent): void =>
            handler(evt);
        ipcRenderer.on(IPC.VIDEO_AGENT_EVENT, wrapped);
        return () => ipcRenderer.removeListener(IPC.VIDEO_AGENT_EVENT, wrapped);
    },
    // 序号断号时由 renderer 主动调,主进程从 MemorySaver 拉完整 state。
    requestVideoAgentFullState: (input: { runId: string }) =>
        ipcRenderer.invoke(IPC.VIDEO_AGENT_REQUEST_FULL_STATE, input),

    // export —— commit 6/9 接 handler,preload 先 wire 占位
    startExport: (input: {
        projectId: string;
        quality: '2k' | '1080p' | '4k' | '720p';
    }) => ipcRenderer.invoke(IPC.EXPORT_START, input),
    cancelExport: (input: { runId: string }) =>
        ipcRenderer.invoke(IPC.EXPORT_CANCEL, input),
    onExportProgress: (handler) => {
        const wrapped = (
            _event: IpcRendererEvent,
            evt: { percent: number; phase: string; runId: string }
        ): void => handler(evt);
        ipcRenderer.on(IPC.EXPORT_PROGRESS, wrapped);
        return () => ipcRenderer.removeListener(IPC.EXPORT_PROGRESS, wrapped);
    }
};

// 把 api 对象挂到 window.miaomaAPI,渲染层 TypeScript 通过
// declare global { interface Window { miaomaAPI: MiaomaAPI } } 拿到类型。
contextBridge.exposeInMainWorld('miaomaAPI', api);
