/**
 * 渲染层 ↔ 主进程 共享的 IPC channel 常量。
 * 双向引用：主进程 ipcMain.handle / webContents.send 与渲染层 window.miaomaAPI.* 使用同名常量。
 */
export const IPC = {
    // 渲染 → 主进程（invoke）
    APP_GET_VERSION: 'app:get-version',
    APP_GET_PLATFORM: 'app:get-platform',
    WINDOW_MINIMIZE: 'window:minimize',
    WINDOW_MAXIMIZE: 'window:maximize',
    WINDOW_CLOSE: 'window:close',

    // 主进程 → 渲染（send）
    MENU_COMMAND: 'menu:command'
} as const;

export type IpcChannel = (typeof IPC)[keyof typeof IPC];

/** 渲染层可调用的 miaomaAPI 方法类型声明，preload 中通过 contextBridge.exposeInMainWorld 暴露。 */
export interface MiaomaAPI {
    getVersion: () => Promise<string>;
    getPlatform: () => Promise<NodeJS.Platform>;
    minimize: () => Promise<void>;
    maximize: () => Promise<void>;
    close: () => Promise<void>;
    onMenuCommand: (handler: (command: string) => void) => () => void;
}

declare global {
    interface Window {
        miaomaAPI: MiaomaAPI;
    }
}
