import { create } from 'zustand';

interface AppState {
    /** 应用启动后由主进程拉取的版本号。 */
    version: string;
    /** 平台标识（darwin / win32 / linux）。 */
    platform: NodeJS.Platform | 'unknown';
    /** 是否完成首次主进程握手。 */
    ready: boolean;

    setVersion: (v: string) => void;
    setPlatform: (p: NodeJS.Platform) => void;
    markReady: () => void;
}

export const useAppStore = create<AppState>((set) => ({
    version: '0.0.0',
    platform: 'unknown',
    ready: false,

    setVersion: (version) => set({ version }),
    setPlatform: (platform) => set({ platform }),
    markReady: () => set({ ready: true })
}));
