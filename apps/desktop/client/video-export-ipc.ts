
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
    input: VideoExportRenderInput,
    options?: { signal?: AbortSignal }
) => Promise<VideoExportOperationResult>;

export type VideoExportProgressEmitter = (
    event: VideoExportProgressEvent
) => void;

export type VideoExportIpcRegistration = {
    /**
     * 中止当前正在进行的导出(杀掉 ffmpeg 子进程)。没有活动导出时是
     * no-op。挂在 before-quit 上,避免 App 退出后 ffmpeg 残留。
     */
    cancelActiveExport: () => void;
};

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
}): VideoExportIpcRegistration => {
    // 渲染层一次只有一个导出在跑:render handler 把本次的 AbortController
    // 挂在闭包里,cancel handler(和 before-quit 兜底)通过 abort 杀掉 ffmpeg。
    let activeExportAbort: AbortController | undefined;

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

            const abortController = new AbortController();
            activeExportAbort = abortController;

            try {
                return await render(input, {
                    signal: abortController.signal
                });
            } finally {
                if (activeExportAbort === abortController) {
                    activeExportAbort = undefined;
                }
            }
        }
    );

    ipcMain.handle(videoExportIpcChannels.cancel, () => {
        const active = activeExportAbort;

        if (!active) {
            return false;
        }

        active.abort();

        return true;
    });

    return {
        cancelActiveExport: () => {
            activeExportAbort?.abort();
        }
    };
};
