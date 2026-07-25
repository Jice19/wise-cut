/* */
import { useSyncExternalStore } from 'react';

import {
    defaultMusicSettings,
    defaultSubtitleSettings
} from '../constants/config';
import type { MusicSettings, SubtitleSettings } from '../types/config';

/**
 * 用户级偏好(per-user,per-machine),跨项目 / 跨会话保留。
 *
 * 跟 VideoProject 内部字段的区别:
 * - VideoProject 里也有 musicSettings / subtitleSettings 字段(per-project)
 *   那些是项目级导出配置,跟着 project 走。
 * - 这里的 musicSettings / subtitleSettings 是**用户偏好**,改了下次开
 *   任何项目都用,关 App / 重启也保留(写到 localStorage)。
 *
 * 之前这些设置只在 MiaojianEditorScreen 的 useState 里活着,加载新项目
 * 时被 useEffect([project]) 强制重置成 default(见 apps/desktop/renderer/
 * pages/MiaojianEditorScreen.tsx 旧版 line 263-264)。改用这个 store 后,
 * 加载项目不再覆盖用户偏好。
 *
 * 存储:localStorage(key = 'wise-cut.user-preferences'),仅渲染层可读。
 * 主进程拿不到(需要的话走 electron-store / IPC,不在此范围)。
 *
 * 实现风格跟 agent-run-store.ts 一致 — useSyncExternalStore + 模块级
 * state,不引入 zustand(项目里现有 store 都是手写的)。
 */

const STORAGE_KEY = 'wise-cut.user-preferences';
const STORAGE_VERSION = 1;

export type UserPreferences = {
    musicSettings: MusicSettings;
    subtitleSettings: SubtitleSettings;
};

const createDefaultState = (): UserPreferences => ({
    musicSettings: defaultMusicSettings,
    subtitleSettings: defaultSubtitleSettings
});

const isUserPreferences = (value: unknown): value is UserPreferences => {
    if (!value || typeof value !== 'object') return false;
    const candidate = value as Record<string, unknown>;

    return (
        typeof candidate.musicSettings === 'object' &&
        candidate.musicSettings !== null &&
        typeof candidate.subtitleSettings === 'object' &&
        candidate.subtitleSettings !== null
    );
};

export { isUserPreferences };

const loadFromStorage = (): UserPreferences => {
    if (typeof localStorage === 'undefined') {
        return createDefaultState();
    }

    try {
        const raw = localStorage.getItem(STORAGE_KEY);

        if (!raw) {
            return createDefaultState();
        }

        const parsed = JSON.parse(raw) as {
            state?: unknown;
            version?: number;
        };

        if (
            parsed.version === STORAGE_VERSION &&
            isUserPreferences(parsed.state)
        ) {
            return parsed.state;
        }
    } catch {
        // localStorage 不可用 / parse 失败,降级到 default
    }

    return createDefaultState();
};

let state: UserPreferences = loadFromStorage();
const listeners = new Set<() => void>();

const setState = (patch: Partial<UserPreferences>) => {
    state = { ...state, ...patch };

    if (typeof localStorage !== 'undefined') {
        try {
            localStorage.setItem(
                STORAGE_KEY,
                JSON.stringify({
                    state,
                    version: STORAGE_VERSION
                })
            );
        } catch {
            // localStorage 满了 / 不可用(隐私模式),降级到内存存储,
            // 用户偏好这次会话内还有效,跨会话失效
        }
    }

    listeners.forEach((listener) => listener());
};

export const useUserPreferences = <T>(
    selector: (state: UserPreferences) => T
): T =>
    useSyncExternalStore(
        (listener) => {
            listeners.add(listener);

            return () => {
                listeners.delete(listener);
            };
        },
        () => selector(state)
    );

// setter 用 module-level stable reference,不会因为 state 变化换 ref,
// 调用方可以放心在依赖数组 / useEffect deps 里用。
export const setUserPreferenceMusicSettings = (musicSettings: MusicSettings) =>
    setState({ musicSettings });

export const setUserPreferenceSubtitleSettings = (
    subtitleSettings: SubtitleSettings
) => setState({ subtitleSettings });

// 内部 subscribe / getSnapshot 暴露给测试用(非 React 场景也能订阅)。
// 生产代码应该用 useUserPreferences React hook。
export const subscribeToUserPreferences = (listener: () => void) => {
    listeners.add(listener);

    return () => {
        listeners.delete(listener);
    };
};

export const getUserPreferencesSnapshot = (): UserPreferences => state;

// 内部 helper:测试在 vi.resetModules 后,新 module 实例的 state 又
// 会从 localStorage 重新 load 一遍。导出让测试可以验证 module-level
// 单例假设。
export const __resetUserPreferencesForTest = () => {
    state = createDefaultState();
    listeners.clear();
};
