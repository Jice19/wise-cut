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
        // macOS：隐藏系统标题栏但保留 traffic-light（红黄绿按钮）。
        // 避免 macOS native title bar 与 React `<TopBar>` 在窗口顶端重叠。
        // Win/Linux 不识别此字段，原生标题栏仍然存在 —— 但 React TopBar 会位于内容区顶部。
        ...(process.platform === 'darwin'
            ? {
                  titleBarStyle: 'hiddenInset' as const,
                  trafficLightPosition: { x: 12, y: 16 }
              }
            : {}),
        webPreferences: {
            preload: `${__dirname}/preload.js`,
            contextIsolation: true,
            nodeIntegration: false,
            sandbox: false
        }
    });

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
