/* */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import {
    defaultMusicSettings,
    defaultSubtitleSettings
} from '../constants/config';
import type { MusicSettings, SubtitleSettings } from '../types/config';

import {
    getUserPreferencesSnapshot,
    isUserPreferences,
    setUserPreferenceMusicSettings,
    setUserPreferenceSubtitleSettings,
    subscribeToUserPreferences
} from './user-preferences-store';

// 每次测试用 fresh localStorage 状态(避免 test 间的污染)。
// 原 store 在 module load 时就读 localStorage,所以必须在 import
// 之前先 mock localStorage — 用 vi.stubGlobal + import。
const installMockLocalStorage = () => {
    const store = new Map<string, string>();

    const localStorage = {
        clear: () => store.clear(),
        getItem: (key: string) => store.get(key) ?? null,
        key: (index: number) => Array.from(store.keys())[index] ?? null,
        get length() {
            return store.size;
        },
        removeItem: (key: string) => {
            store.delete(key);
        },
        setItem: (key: string, value: string) => {
            store.set(key, value);
        }
    };

    vi.stubGlobal('localStorage', localStorage);

    return {
        clear: () => store.clear(),
        localStorage,
        raw: store
    };
};

describe('isUserPreferences', () => {
    it('returns true for a complete state object', () => {
        expect(
            isUserPreferences({
                musicSettings: defaultMusicSettings,
                subtitleSettings: defaultSubtitleSettings
            })
        ).toBe(true);
    });

    it('returns false when musicSettings is missing', () => {
        expect(isUserPreferences({ subtitleSettings: {} })).toBe(false);
        expect(isUserPreferences({})).toBe(false);
    });

    it('returns false when subtitleSettings is missing', () => {
        expect(isUserPreferences({ musicSettings: {} })).toBe(false);
    });

    it('returns false for non-object values', () => {
        expect(isUserPreferences(null)).toBe(false);
        expect(isUserPreferences(undefined)).toBe(false);
        expect(isUserPreferences('string')).toBe(false);
        expect(isUserPreferences(42)).toBe(false);
    });
});

describe('user-preferences-store with mocked localStorage', () => {
    beforeEach(() => {
        // 强制 reload store module,触发 module 顶层 loadFromStorage()
        vi.resetModules();
        installMockLocalStorage();
    });

    afterEach(() => {
        vi.unstubAllGlobals();
    });

    it('returns default state when localStorage is empty', async () => {
        const { getUserPreferencesSnapshot: getSnapshot } = await import(
            './user-preferences-store'
        );
        const snapshot = getSnapshot();
        expect(snapshot.musicSettings).toEqual(defaultMusicSettings);
        expect(snapshot.subtitleSettings).toEqual(defaultSubtitleSettings);
    });

    it('returns default state when localStorage has invalid JSON', async () => {
        localStorage.setItem('wise-cut.user-preferences', 'not-json{');
        const { getUserPreferencesSnapshot: getSnapshot } = await import(
            './user-preferences-store'
        );
        expect(getSnapshot().musicSettings).toEqual(defaultMusicSettings);
    });

    it('returns default state when stored version is stale', async () => {
        localStorage.setItem(
            'wise-cut.user-preferences',
            JSON.stringify({
                state: { musicSettings: {}, subtitleSettings: {} },
                version: 999
            })
        );
        const { getUserPreferencesSnapshot: getSnapshot } = await import(
            './user-preferences-store'
        );
        expect(getSnapshot().musicSettings).toEqual(defaultMusicSettings);
    });

    it('persists setter changes to localStorage', async () => {
        const { setUserPreferenceMusicSettings: setMusic } = await import(
            './user-preferences-store'
        );
        const customMusic: MusicSettings = {
            enabled: false,
            selectedTrackId: 'song_99',
            volume: 0.42
        };

        setMusic(customMusic);

        const stored = localStorage.getItem('wise-cut.user-preferences');
        expect(stored).toBeTruthy();
        const parsed = JSON.parse(stored!);
        expect(parsed.state.musicSettings).toEqual(customMusic);
        expect(parsed.version).toBe(1);
    });

    it('notifies subscribers on setter change', async () => {
        const {
            setUserPreferenceMusicSettings: setMusic,
            subscribeToUserPreferences: subscribe
        } = await import('./user-preferences-store');
        const callback = vi.fn();

        const unsubscribe = subscribe(callback);
        setMusic({ enabled: false, selectedTrackId: 'x', volume: 0 });

        expect(callback).toHaveBeenCalledTimes(1);

        // 再次设置不同值,应该再次通知
        setMusic({ enabled: true, selectedTrackId: 'y', volume: 1 });
        expect(callback).toHaveBeenCalledTimes(2);

        // 同样的值再 set 也通知(setter 不做 shallow equal,简化)
        setMusic({ enabled: true, selectedTrackId: 'y', volume: 1 });
        expect(callback).toHaveBeenCalledTimes(3);

        // 取消订阅,不再通知
        unsubscribe();
        setMusic({ enabled: false, selectedTrackId: 'z', volume: 0.5 });
        expect(callback).toHaveBeenCalledTimes(3);
    });

    it('round-trips both music and subtitle settings', async () => {
        const {
            setUserPreferenceMusicSettings: setMusic,
            setUserPreferenceSubtitleSettings: setSubtitle,
            getUserPreferencesSnapshot: getSnapshot
        } = await import('./user-preferences-store');

        const newMusic: MusicSettings = {
            enabled: true,
            selectedTrackId: 'song_02',
            volume: 0.75
        };
        const newSubtitle: SubtitleSettings = {
            fontSizePx: 32,
            isVisible: false,
            outlineColor: '#FFFFFF',
            presetLabel: '自定义',
            textColor: '#000000'
        };

        setMusic(newMusic);
        setSubtitle(newSubtitle);

        const snapshot = getSnapshot();
        expect(snapshot.musicSettings).toEqual(newMusic);
        expect(snapshot.subtitleSettings).toEqual(newSubtitle);
    });
});
