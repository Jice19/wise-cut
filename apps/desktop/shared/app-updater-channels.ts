/* */
export const appUpdaterIpcChannels = {
    checkForUpdate: 'app-updater:check-for-update',
    openReleasePage: 'app-updater:open-release-page'
} as const;

export type AppUpdaterIpcChannel =
    (typeof appUpdaterIpcChannels)[keyof typeof appUpdaterIpcChannels];

export type AppUpdateCheckResult = {
    hasUpdate: boolean;
    latestVersion: string;
    error?: string;
    releaseUrl?: string;
};
