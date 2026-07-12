import { contextBridge, ipcRenderer } from 'electron';

import { IPC, type MiaomaAPI } from '../shared/ipc';

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
        // 返回取消订阅函数，供 React useEffect 清理
        return () => ipcRenderer.removeListener(IPC.MENU_COMMAND, wrapped);
    }
};

contextBridge.exposeInMainWorld('miaomaAPI', api);
