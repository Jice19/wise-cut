/* */
import { ipcMain, type IpcMain } from 'electron';

import {
    apiConfigIpcChannels,
    type ApiConfigSetInput,
    type ApiConfigStatus
} from '../shared/api-config-channels';

export type RegisterApiConfigIpcInput = {
    clear: () => void;
    getStatus: () => ApiConfigStatus;
    ipcMain: IpcMain;
    set: (input: ApiConfigSetInput) => void;
};

export const registerApiConfigIpc = ({
    clear,
    getStatus,
    ipcMain,
    set
}: RegisterApiConfigIpcInput) => {
    ipcMain.handle(apiConfigIpcChannels.getStatus, () => getStatus());
    ipcMain.handle(
        apiConfigIpcChannels.set,
        (_event, input: ApiConfigSetInput) => {
            set(input);

            return { success: true };
        }
    );
    ipcMain.handle(apiConfigIpcChannels.clear, () => {
        clear();

        return { success: true };
    });
};
