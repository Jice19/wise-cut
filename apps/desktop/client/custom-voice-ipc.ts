
import type { OpenDialogReturnValue } from 'electron';

import type {
    CustomVoiceImportInput,
    CustomVoiceOperationResult
} from '../shared/custom-voice';
import { customVoiceIpcChannels } from '../shared/custom-voice-channels';

import type { CustomVoiceLibrary } from './custom-voice-library';

type CustomVoiceIpcEvent = unknown;

type CustomVoiceIpcMain = {
    handle: (
        channel: string,
        handler: (
            event: CustomVoiceIpcEvent,
            input: unknown
        ) => Promise<unknown> | unknown
    ) => void;
};

type CustomVoiceDialog = {
    showOpenDialog: (options: {
        filters: {
            extensions: string[];
            name: string;
        }[];
        properties: 'openFile'[];
        title: string;
    }) => Promise<OpenDialogReturnValue>;
};

const success = <T>(data: T): CustomVoiceOperationResult<T> => ({
    data,
    success: true
});

const failure = <T>({
    code,
    message
}: {
    code:
        | 'IMPORT_CANCELLED'
        | 'IMPORT_FAILED'
        | 'READ_FAILED'
        | 'SERVICE_UNAVAILABLE';
    message: string;
}): CustomVoiceOperationResult<T> => ({
    error: {
        code,
        message
    },
    success: false
});

const serializeError = (error: unknown) =>
    error instanceof Error ? error.message : String(error);

export const registerCustomVoiceIpc = ({
    dialog,
    ipcMain,
    library
}: {
    dialog: CustomVoiceDialog;
    ipcMain: CustomVoiceIpcMain;
    library: CustomVoiceLibrary;
}) => {
    ipcMain.handle(customVoiceIpcChannels.checkIndexTts2, async () =>
        success(await library.checkIndexTts2())
    );

    ipcMain.handle(customVoiceIpcChannels.list, async () => {
        try {
            return success(await library.list());
        } catch (error) {
            return failure({
                code: 'READ_FAILED',
                message: serializeError(error)
            });
        }
    });

    ipcMain.handle(
        customVoiceIpcChannels.importReferenceAudio,
        async (_event, rawInput) => {
            const input = (rawInput ?? {}) as CustomVoiceImportInput;
            let filePath = input.filePath;

            if (!filePath) {
                const selected = await dialog.showOpenDialog({
                    filters: [
                        {
                            extensions: [
                                'wav',
                                'mp3',
                                'm4a',
                                'aac',
                                'flac',
                                'ogg'
                            ],
                            name: '音频文件'
                        }
                    ],
                    properties: ['openFile'],
                    title: '选择原始音色音频'
                });

                if (selected.canceled || !selected.filePaths[0]) {
                    return failure({
                        code: 'IMPORT_CANCELLED',
                        message: '已取消上传自定义音色'
                    });
                }

                filePath = selected.filePaths[0];
            }

            try {
                return success(
                    await library.importReferenceAudio({
                        filePath
                    })
                );
            } catch (error) {
                return failure({
                    code: 'IMPORT_FAILED',
                    message: serializeError(error)
                });
            }
        }
    );
};
