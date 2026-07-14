import { app, BrowserWindow, ipcMain } from 'electron';

import { IPC } from '../shared/ipc';
import { createVideoAgentController } from './video-agent-controller-factory';
import {
    registerVideoAgentIpc,
    type VideoAgentController
} from './video-agent-ipc';

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

const registerIpcHandlers = (controller: VideoAgentController): void => {
    ipcMain.handle(IPC.APP_GET_VERSION, () => app.getVersion());
    ipcMain.handle(IPC.APP_GET_PLATFORM, () => process.platform);

    // 原生选目录对话框 —— commit 9 暴露给 renderer 让 UI 选素材目录
    ipcMain.handle(
        IPC.DIALOG_SELECT_DIRECTORY,
        async (event, input: { title?: string }) => {
            const { dialog } = await import('electron');
            const win = BrowserWindow.fromWebContents(event.sender);
            const result = await dialog.showOpenDialog(win ?? undefined!, {
                properties: ['openDirectory', 'createDirectory'],
                title: input?.title ?? '选择素材目录'
            });
            if (result.canceled || result.filePaths.length === 0) return null;
            return result.filePaths[0];
        }
    );

    // video-project:read —— 从 userData/video-projects/ 读 + schema 校验
    ipcMain.handle(
        IPC.VIDEO_PROJECT_READ,
        async (_event, input: { projectId: string }) => {
            const { readFile } = await import('node:fs/promises');
            const { join } = await import('node:path');
            const { VideoProjectSchema } = await import(
                '@miaoma-magicut/video-project'
            );
            const path = join(
                app.getPath('userData'),
                'video-projects',
                `${input.projectId}.json`
            );
            try {
                const content = await readFile(path, 'utf-8');
                return VideoProjectSchema.parse(JSON.parse(content));
            } catch (error) {
                throw new Error(
                    `readProject ${input.projectId} failed: ${(error as Error).message}`
                );
            }
        }
    );

    // video-project:list —— 扫 userData/video-projects/*.json
    ipcMain.handle(IPC.VIDEO_PROJECT_LIST, async () => {
        const { readdir, readFile } = await import('node:fs/promises');
        const { join } = await import('node:path');
        const dir = join(app.getPath('userData'), 'video-projects');
        try {
            const entries = await readdir(dir);
            const projects = await Promise.all(
                entries
                    .filter((e) => e.endsWith('.json'))
                    .map(async (file) => {
                        try {
                            const content = await readFile(
                                join(dir, file),
                                'utf-8'
                            );
                            const json = JSON.parse(content);
                            return {
                                projectId:
                                    json.metadata?.projectId ??
                                    file.replace('.json', ''),
                                title: json.metadata?.title ?? 'untitled',
                                createdAt: json.metadata?.createdAt,
                                updatedAt: json.metadata?.updatedAt,
                                durationMs: json.canvas?.durationMs
                            };
                        } catch {
                            return null;
                        }
                    })
            );
            return projects
                .filter((p): p is NonNullable<typeof p> => p !== null)
                .sort((a, b) => (b.updatedAt ?? 0) - (a.updatedAt ?? 0));
        } catch {
            return [];
        }
    });

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

    // video-agent — commit 5 接入 demo controller,把 6 个 stub
    // 替换成真 handler(emit 事件流到 renderer)。
    // commit 6 起 factory 切到 langgraph,这里不变。
    registerVideoAgentIpc({ controller, handle: ipcMain.handle });
};

app.whenReady().then(() => {
    const controller = createVideoAgentController();
    registerIpcHandlers(controller);
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
