
import type { IpcMain } from 'electron';

import type {
    VideoExportOperationResult,
    VideoExportProgressEvent,
    VideoExportRenderInput,
    VideoExportSelectOutputPathInput
} from '../shared/video-export';
import { videoExportIpcChannels } from '../shared/video-export-channels';

export { videoExportIpcChannels };

export type VideoExportRenderer = (
    input: VideoExportRenderInput
) => Promise<VideoExportOperationResult>;

export type VideoExportProgressEmitter = (
    event: VideoExportProgressEvent
) => void;

export const registerVideoExportIpc = ({
    createRenderer,
    ipcMain,
    selectOutputPath
}: {
    createRenderer: (
        emitProgress: VideoExportProgressEmitter
    ) => VideoExportRenderer;
    ipcMain: Pick<IpcMain, 'handle'>;
    selectOutputPath: (
        input: VideoExportSelectOutputPathInput
    ) => Promise<VideoExportOperationResult>;
}) => {
    ipcMain.handle(
        videoExportIpcChannels.selectOutputPath,
        async (_event, input: VideoExportSelectOutputPathInput) =>
            selectOutputPath(input)
    );

    ipcMain.handle(
        videoExportIpcChannels.render,
        async (event, input: VideoExportRenderInput) => {
            const render = createRenderer((progress) => {
                event.sender.send(videoExportIpcChannels.progress, progress);
            });

            return render(input);
        }
    );
};
