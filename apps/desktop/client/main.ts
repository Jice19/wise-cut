import { app, BrowserWindow, dialog, ipcMain, safeStorage } from 'electron';
import started from 'electron-squirrel-startup';
import path from 'node:path';

import { createAgentDatabase } from '@wise-cut/video-agent';

import { registerApiConfigIpc } from './api-config-ipc';
import { createApiConfigStore } from './api-config-store';
import { createAgentDatabaseHelpers } from './agent-database-helpers';
import { registerCustomVoiceIpc } from './custom-voice-ipc';
import { createCustomVoiceLibrary } from './custom-voice-library';
import { registerFileSelectIpc } from './file-select-ipc';
import {
    registerMediaProtocol,
    registerMediaProtocolSchemePrivileges
} from './media-protocol';
import {
    createLangGraphVideoAgentController,
    registerVideoAgentIpc
} from './video-agent-ipc';
import { registerVideoExportIpc } from './video-export-ipc';
import {
    createVideoExportRenderer,
    selectVideoExportOutputPath
} from './video-export-service';
import {
    createDefaultVideoProjectStore,
    registerVideoProjectIpc
} from './video-project-ipc';
import { createMainWindowOptions } from './window-options';

if (started) {
    app.quit();
}

registerMediaProtocolSchemePrivileges();

// 模块级 ref:agentDatabase 句柄在 app.whenReady 里创建,
// before-quit 钩子里需要能访问到它来关掉。闭包 + 提早声明避免循环依赖。
let agentDatabaseHandle: ReturnType<typeof createAgentDatabase> | undefined;
const closeAgentDatabase = () => {
    if (agentDatabaseHandle) {
        agentDatabaseHandle.close();
        agentDatabaseHandle = undefined;
    }
};

const createWindow = () => {
    const mainWindow = new BrowserWindow(
        createMainWindowOptions({
            preloadPath: path.join(__dirname, 'preload.js')
        })
    );

    if (MAIN_WINDOW_VITE_DEV_SERVER_URL) {
        mainWindow.loadURL(MAIN_WINDOW_VITE_DEV_SERVER_URL);
        return;
    }

    mainWindow.loadFile(
        path.join(__dirname, `../renderer/${MAIN_WINDOW_VITE_NAME}/index.html`)
    );
};

app.whenReady().then(() => {
    const videoProjectStore = createDefaultVideoProjectStore();
    const agentRunDirectory = path.join(app.getPath('userData'), 'agent-runs');
    const customVoiceLibrary = createCustomVoiceLibrary({
        rootDirectory: path.join(app.getPath('userData'), 'custom-voices')
    });

    // API 配置:开发阶段只让用户在 UI 里填 API Key,其他 3 个
    // (BASE_URL / LLM_MODEL / TTS_MODEL) 是常量,直接 hardcode 在
    // 这里。后续要支持 UI 改的话再加进 store,现阶段没必要。
    const DEFAULT_API_CONFIG = {
        baseUrl: 'https://ark.cn-beijing.volces.com/api/plan/v3',
        llmModel: 'doubao-seed-2.0-pro',
        ttsModel: 'seed-tts-2.0'
    } as const;

    // 启动时从 safeStorage 加密配置里读 api config,注入到
    // process.env,让下游的 loadAgentEnv 拿得到。这条必须在所有
    // 创建 agent / IPC 的代码之前跑。.env 不再是 single source of
    // truth — UI 配置说了算,见 packages/video-agent/src/config/
    // load-agent-env.ts 顶部注释。
    const apiConfigStore = createApiConfigStore({
        onCorruptConfig: (error) => {
            // eslint-disable-next-line no-console
            console.warn(
                `[apiConfig] 存储配置已损坏,当作未配置处理(走 onboarding):${
                    error instanceof Error ? error.message : String(error)
                }`
            );
        },
        safeStorage,
        userDataPath: app.getPath('userData')
    });
    const storedApiConfig = apiConfigStore.read();

    // 总是注入 BASE_URL / LLM_MODEL / TTS_MODEL(用默认值),
    // 只有 API_KEY 来自 safeStorage。这样 loadAgentEnv 在没有 key
    // 的时候能 throw 出来明确的"缺 API_KEY"错,而不是 4 个都缺。
    process.env.BASE_URL = DEFAULT_API_CONFIG.baseUrl;
    process.env.LLM_MODEL = DEFAULT_API_CONFIG.llmModel;
    process.env.TTS_MODEL = DEFAULT_API_CONFIG.ttsModel;
    process.env.API_KEY = storedApiConfig?.apiKey ?? '';

    // API 配置 IPC — 渲染层用来检测 / 写入 / 清除 API Key。
    // 写入时立即更新 process.env.API_KEY,下次 agent run(第一次
    // 调 loadAgentEnv 时)就拿到新 key,不用重启 App。
    // 静态 import + 同步注册 — 之前用 await import + void 包装
    // 会让 Vite tree-shake 出问题,IPC handler 没注册上,renderer
    // 调 getStatus 时报 "No handler registered"。
    //
    // getStatus 实时读 store(不走启动时的 storedApiConfig 闭包)
    // — 否则用户在 app 运行时改 key,section re-mount 后 getStatus
    // 还是返回启动时的旧值,看起来 key 没保存,实际是 stale data。
    registerApiConfigIpc({
        clear: () => {
            apiConfigStore.clear();
            process.env.API_KEY = '';
        },
        getStatus: () => {
            const current = apiConfigStore.read();

            return { isConfigured: Boolean(current?.apiKey) };
        },
        ipcMain,
        set: ({ apiKey }) => {
            apiConfigStore.write({
                apiKey,
                baseUrl: DEFAULT_API_CONFIG.baseUrl,
                llmModel: DEFAULT_API_CONFIG.llmModel,
                ttsModel: DEFAULT_API_CONFIG.ttsModel
            });
            process.env.API_KEY = apiKey;
        }
    });

    // 启动本地 sqlite,记录 agent 运行历史。
    // 路径:macOS = ~/Library/Application Support/wise-cut/agent.sqlite
    //       Windows = %APPDATA%\wise-cut\agent.sqlite
    // 用 try/catch 包住:sqlite 写失败不应该阻塞 App 启动(本地
    // 持久化是 best-effort,IPC 路径仍然把事件推到 renderer)。
    let agentDatabaseHelpers:
        | ReturnType<typeof createAgentDatabaseHelpers>
        | undefined;
    try {
        const agentDatabase = createAgentDatabase({
            filename: path.join(app.getPath('userData'), 'agent.sqlite')
        });
        agentDatabaseHandle = agentDatabase; // 模块级 ref,before-quit 用来关
        agentDatabaseHelpers = createAgentDatabaseHelpers({
            database: agentDatabase.database
        });
    } catch (error) {
        // eslint-disable-next-line no-console
        console.warn(
            `[agentDatabase] 启动失败,继续运行但 agent_runs 不持久化:${
                error instanceof Error ? error.message : String(error)
            }`
        );
    }

    registerMediaProtocol({
        customVoiceReferenceResolver: customVoiceLibrary.resolveReferencePath,
        store: videoProjectStore
    });
    registerCustomVoiceIpc({
        dialog,
        ipcMain,
        library: customVoiceLibrary
    });
    registerFileSelectIpc();
    registerVideoProjectIpc({ ipcMain, store: videoProjectStore });
    registerVideoExportIpc({
        createRenderer: (emitProgress) =>
            createVideoExportRenderer({
                app,
                dialog,
                emitProgress
            }),
        ipcMain,
        selectOutputPath: (input) =>
            selectVideoExportOutputPath({
                app,
                dialog,
                input
            })
    });
    registerVideoAgentIpc({
        controller: createLangGraphVideoAgentController({
            agentDatabase: agentDatabaseHelpers,
            customVoiceReferenceResolver:
                customVoiceLibrary.resolveReferencePath,
            store: videoProjectStore,
            voiceOutputDirectory: path.join(agentRunDirectory, 'voices')
        }),
        ipcMain
    });
    createWindow();

    app.on('activate', () => {
        if (BrowserWindow.getAllWindows().length === 0) {
            createWindow();
        }
    });
});

app.on('window-all-closed', () => {
    if (process.platform !== 'darwin') {
        app.quit();
    }
});

// best-effort 关闭本地 sqlite 连接,避免开发期热重载 / 升级期间文件被锁。
// `node:sqlite` 是同步句柄,OS 退出时会回收,但显式 close 是个好习惯。
// 挂在 before-quit 而不是 will-quit,这样还能给异步操作一个完成窗口。
app.on('before-quit', () => {
    try {
        closeAgentDatabase();
    } catch (error) {
        // eslint-disable-next-line no-console
        console.warn(
            `[agentDatabase] before-quit 关闭失败(进程退出时会自动回收):${
                error instanceof Error ? error.message : String(error)
            }`
        );
    }
});
