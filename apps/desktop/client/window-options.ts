
import type { BrowserWindowConstructorOptions } from 'electron';

type CreateMainWindowOptionsInput = {
    preloadPath: string;
};

export const createMainWindowOptions = ({
    preloadPath
}: CreateMainWindowOptionsInput): BrowserWindowConstructorOptions => ({
    width: 1480,
    height: 940,
    minWidth: 1480,
    minHeight: 940,
    frame: false,
    titleBarStyle: 'hidden',
    autoHideMenuBar: true,
    backgroundColor: '#0E0F12',
    webPreferences: {
        preload: preloadPath
    }
});
