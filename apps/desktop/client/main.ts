
import { app, BrowserWindow, dialog, ipcMain } from 'electron';
import started from 'electron-squirrel-startup';
import path from 'node:path';

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
