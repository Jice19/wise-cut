/* */
export const fileSelectIpcChannels = {
    selectVideoFiles: 'file-select:select-video-files',
    selectVideoDirectory: 'file-select:select-video-directory'
} as const;

export type FileSelectIpcChannel =
    (typeof fileSelectIpcChannels)[keyof typeof fileSelectIpcChannels];

export type FileSelectResult = {
    canceled: boolean;
    directoryPath?: string;
    filePaths: string[];
};
