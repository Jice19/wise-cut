/* */
import { BrowserWindow, dialog, ipcMain } from 'electron';

import {
    fileSelectIpcChannels,
    type FileSelectResult
} from '../shared/file-select-channels';

const videoExtensions = [
    'mp4',
    'mov',
    'avi',
    'mkv',
    'webm',
    'flv',
    'wmv',
    'm4v',
    '3gp',
    'ts'
];

export const registerFileSelectIpc = () => {
    // 选择单个或多个视频文件
    ipcMain.handle(
        fileSelectIpcChannels.selectVideoFiles,
        async (): Promise<FileSelectResult> => {
            const win = BrowserWindow.getFocusedWindow();
            if (!win) {
                return { canceled: true, filePaths: [] };
            }

            const result = await dialog.showOpenDialog(win, {
                filters: [
                    {
                        extensions: videoExtensions,
                        name: '视频文件'
                    }
                ],
                properties: ['openFile', 'multiSelections'],
                title: '选择视频素材'
            });

            return {
                canceled: result.canceled,
                filePaths: result.filePaths
            };
        }
    );

    // 选择视频目录
    ipcMain.handle(
        fileSelectIpcChannels.selectVideoDirectory,
        async (): Promise<FileSelectResult> => {
            const win = BrowserWindow.getFocusedWindow();
            if (!win) {
                return { canceled: true, filePaths: [] };
            }

            const result = await dialog.showOpenDialog(win, {
                properties: ['openDirectory'],
                title: '选择视频素材目录'
            });

            return {
                canceled: result.canceled,
                directoryPath: result.canceled
                    ? undefined
                    : result.filePaths[0],
                filePaths: result.canceled ? [] : result.filePaths
            };
        }
    );
};
