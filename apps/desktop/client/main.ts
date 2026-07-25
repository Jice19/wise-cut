import { app, BrowserWindow, dialog, ipcMain } from 'electron';
import started from 'electron-squirrel-startup';
import path from 'node:path';

import { createAgentDatabase } from '@wise-cut/video-agent';

import { createAgentDatabaseHelpers } from './agent-database-helpers';
import { registerCustomVoiceIpc } from './custom-voice-ipc';
import { createCustomVoiceLibrary } from './custom-voice-library';
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
