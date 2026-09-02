/* */
import { ipcMain, shell } from 'electron';

import { appUpdaterIpcChannels } from '../shared/app-updater-channels';

export type RegisterAppUpdaterIpcInput = {
    currentVersion: string;
    ipcMain: typeof ipcMain;
    repoOwner: string;
    repoName: string;
    shell: typeof shell;
};

type GitHubRelease = {
    html_url: string;
    tag_name: string;
};

const GITHUB_API_BASE = 'https://api.github.com/repos';

export const registerAppUpdaterIpc = ({
    currentVersion,
    ipcMain: ipc,
    repoOwner,
    repoName,
    shell: shellModule
}: RegisterAppUpdaterIpcInput) => {
    ipc.handle(appUpdaterIpcChannels.checkForUpdate, async () => {
        try {
            const url = `${GITHUB_API_BASE}/${repoOwner}/${repoName}/releases/latest`;
            const response = await fetch(url, {
                headers: { 'User-Agent': 'WiseCut-Desktop' }
            });

            if (!response.ok) {
                return {
                    hasUpdate: false,
                    latestVersion: currentVersion,
                    error: `GitHub API 返回 ${response.status}`
                } as const;
            }

            const release = (await response.json()) as GitHubRelease;
            const latestVersion = release.tag_name.replace(/^v/, '');

            // 简单的 semver 比较
            const hasUpdate =
                compareVersions(latestVersion, currentVersion) > 0;

            return {
                hasUpdate,
                latestVersion,
                releaseUrl: release.html_url
            } as const;
        } catch (error) {
            return {
                hasUpdate: false,
                latestVersion: currentVersion,
                error: error instanceof Error ? error.message : '网络错误'
            } as const;
        }
    });

    ipc.handle(
        appUpdaterIpcChannels.openReleasePage,
        async (_event, url: string) => {
            await shellModule.openExternal(url);
        }
    );
};

/**
 * 简单的 semver 比较: a > b 返回 1, a < b 返回 -1, 相等返回 0
 * 只比较 major.minor.patch
 */
const compareVersions = (a: string, b: string): number => {
    const parseVersion = (v: string) =>
        v
            .split('.')
            .map((part) => {
                const num = parseInt(part, 10);

                return isNaN(num) ? 0 : num;
            })
            .slice(0, 3);

    const aParts = parseVersion(a);
    const bParts = parseVersion(b);

    for (let i = 0; i < 3; i++) {
        const aVal = aParts[i] ?? 0;
        const bVal = bParts[i] ?? 0;

        if (aVal > bVal) return 1;
        if (aVal < bVal) return -1;
    }

    return 0;
};
