/* */
import { useEffect, useState } from 'react';

type UpdateState =
    | { kind: 'idle' }
    | { kind: 'checking' }
    | { kind: 'up-to-date' }
    | { kind: 'available'; latestVersion: string; releaseUrl: string }
    | { kind: 'error'; message: string };

/**
 * 首页底部的版本检查模块 — 显示当前版本号,"检查更新"按钮,
 * 有新版本时提示用户去 GitHub Releases 下载。
 */
export const AppUpdateSection = () => {
    const [state, setState] = useState<UpdateState>({ kind: 'idle' });

    const handleCheck = async () => {
        setState({ kind: 'checking' });

        try {
            const result = await window.miaomaAPI.appUpdater.checkForUpdate();

            if (result.hasUpdate && result.releaseUrl) {
                setState({
                    kind: 'available',
                    latestVersion: result.latestVersion,
                    releaseUrl: result.releaseUrl
                });
            } else if (result.error) {
                setState({ kind: 'error', message: result.error });
            } else {
                setState({ kind: 'up-to-date' });
            }
        } catch {
            setState({ kind: 'error', message: '网络错误' });
        }
    };

    const handleOpenRelease = async () => {
        if (state.kind === 'available') {
            await window.miaomaAPI.appUpdater.openReleasePage(state.releaseUrl);
        }
    };

    // 3 秒后自动恢复 idle（避免 up-to-date / error 状态一直显示）
    useEffect(() => {
        if (state.kind === 'up-to-date' || state.kind === 'error') {
            const timer = setTimeout(() => {
                setState({ kind: 'idle' });
            }, 3000);

            return () => clearTimeout(timer);
        }
    }, [state]);

    return (
        <div className="flex items-center gap-2 text-[11px] text-[#78716C]">
            {state.kind === 'idle' && (
                <button
                    type="button"
                    onClick={handleCheck}
                    className="transition-colors hover:text-[#1C1917]"
                >
                    检查更新
                </button>
            )}
            {state.kind === 'checking' && <span>检查中…</span>}
            {state.kind === 'up-to-date' && (
                <span className="text-[#16a34a]">已是最新版本</span>
            )}
            {state.kind === 'available' && (
                <button
                    type="button"
                    onClick={handleOpenRelease}
                    className="font-medium text-[#D97706] transition-colors hover:text-[#B45309]"
                >
                    新版本 v{state.latestVersion} 可用 →
                </button>
            )}
            {state.kind === 'error' && (
                <span className="text-[#B91C1C]">检查失败</span>
            )}
        </div>
    );
};
