import { app, BrowserWindow, ipcMain } from 'electron';

import { IPC } from '../shared/ipc';

const waitForServer = async (
    url: string,
    retries = 60,
    intervalMs = 500
): Promise<void> => {
    // 最长 30 秒窗口，匹配 vite dev server 冷启动时长（首次 esbuild + 依赖预构建）。
    for (let i = 0; i < retries; i += 1) {
        try {
            await fetch(url);
            return;
        } catch {
            await new Promise((r) => setTimeout(r, intervalMs));
        }
    }
    throw new Error(`Vite dev server ${url} did not become reachable`);
};

const loadDevServerWithRetry = async (
    win: BrowserWindow,
    url: string
): Promise<void> => {
    try {
        await waitForServer(url);
        await win.loadURL(url);
    } catch (err) {
        // eslint-disable-next-line no-console
        console.error('[main] cannot reach dev server', url, err);
    }
};

const createMainWindow = (): BrowserWindow => {
    const win = new BrowserWindow({
        title: 'AI智能剪辑平台',
        width: 1480,
        height: 940,
        minWidth: 1024,
        minHeight: 640,
        show: false,
        autoHideMenuBar: false,
        // macOS 隐藏系统 native title bar —— 否则它会叠加在 React TopBar
        // 之上形成两条。traffic-light 由 React 端 pl-20 避开。
        // 'hiddenInset'：保留 inset 飘带（仅有 28px 顶部）但隐藏文字
        // 'hidden'：完全移除顶部条 —— 但 traffic-light 也会被隐藏，需要
        //   走 setWindowButtonPosition / 自绘按钮。优先选 hiddenInset 实用。
        // Win/Linux 不识别此字段，原生标题栏仍然存在。
        ...(process.platform === 'darwin'
            ? {
                  titleBarStyle: 'hiddenInset' as const,
                  trafficLightPosition: { x: 12, y: 14 } as {
                      x: number;
                      y: number;
                  }
              }
            : {}),
        webPreferences: {
            preload: `${__dirname}/preload.js`,
            contextIsolation: true,
            nodeIntegration: false,
            sandbox: false
        }
    });
    // 诊断：每次主进程启动时打印当前 title bar 风格，便于排查双 topbar。
    // eslint-disable-next-line no-console
    console.log(
        '[main] BrowserWindow created',
        `platform=${process.platform}`,
        'titleBarStyle=hiddenInset (mac) or default (others)'
    );

    // 加载渲染层（开发态由 vite dev server 提供，生产态读本地 .vite/build/renderer/...html）
    // MAIN_WINDOW_VITE_DEV_SERVER_URL / MAIN_WINDOW_VITE_NAME 由 @electron-forge/plugin-vite
    // 通过 vite define 在主进程构建期替换为字符串字面量，无需 process.env 包裹。
    if (MAIN_WINDOW_VITE_DEV_SERVER_URL) {
        // vite define 注入的就是字符串字面量 'http://localhost:5173/'，
        // 但 Electron 启动早于 vite dev server 监听端口。重试直到成功，避免冷启动闪烁。
        void loadDevServerWithRetry(win, MAIN_WINDOW_VITE_DEV_SERVER_URL);
    } else {
        void win.loadFile(
            `${__dirname}/../renderer/${MAIN_WINDOW_VITE_NAME}/index.html`
        );
    }

    win.once('ready-to-show', () => {
        win.show();
        // 开发态自动打开 DevTools，方便观察 renderer 控制台与 IPC 数据流。
        if (!app.isPackaged) win.webContents.openDevTools({ mode: 'detach' });
    });

    return win;
};

const registerIpcHandlers = (): void => {
    ipcMain.handle(IPC.APP_GET_VERSION, () => app.getVersion());
    ipcMain.handle(IPC.APP_GET_PLATFORM, () => process.platform);

    ipcMain.handle(IPC.WINDOW_MINIMIZE, (event) => {
        BrowserWindow.fromWebContents(event.sender)?.minimize();
    });
    ipcMain.handle(IPC.WINDOW_MAXIMIZE, (event) => {
        const w = BrowserWindow.fromWebContents(event.sender);
        if (!w) return;
        if (w.isMaximized()) w.unmaximize();
        else w.maximize();
    });
    ipcMain.handle(IPC.WINDOW_CLOSE, (event) => {
        BrowserWindow.fromWebContents(event.sender)?.close();
    });

    // video-agent — 批 1 commit 0c stub,handler 都抛 "not implemented"。
    // 真功能在 commit 5(demo controller)和 commit 6(LangGraph 真接)落。
    // 这一步的目的是把整条 IPC 链路打通,renderer 调 invoke 不会再因为
    // "No handler registered" 而崩溃,便于后续 commit 渐进式替换实现。
    ipcMain.handle(IPC.VIDEO_AGENT_START, () => {
        throw new Error('videoAgent.start not implemented (commit 5+)');
    });
    ipcMain.handle(IPC.VIDEO_AGENT_APPROVE, () => {
        throw new Error('videoAgent.approve not implemented (commit 5+)');
    });
    ipcMain.handle(IPC.VIDEO_AGENT_CANCEL, () => {
        throw new Error('videoAgent.cancel not implemented (commit 5+)');
    });
    ipcMain.handle(IPC.VIDEO_AGENT_REGENERATE_SCENE, () => {
        throw new Error(
            'videoAgent.regenerateScene not implemented (commit 5+)'
        );
    });
    ipcMain.handle(IPC.VIDEO_AGENT_REGENERATE_VOICES, () => {
        throw new Error(
            'videoAgent.regenerateVoices not implemented (commit 5+)'
        );
    });
    ipcMain.handle(IPC.VIDEO_AGENT_REQUEST_FULL_STATE, () => {
        throw new Error(
            'videoAgent.requestFullState not implemented (commit 6+)'
        );
    });
};

app.whenReady().then(() => {
    registerIpcHandlers();
    createMainWindow();

    app.on('activate', () => {
        if (BrowserWindow.getAllWindows().length === 0) {
            createMainWindow();
        }
    });
});

app.on('window-all-closed', () => {
    if (process.platform !== 'darwin') app.quit();
});
