/* */
import { describe, expect, it } from 'vitest';

import { createMainWindowOptions } from '../client/window-options';

describe('createMainWindowOptions', () => {
    it('creates a frameless window without native toolbar on macOS and Windows', () => {
        const options = createMainWindowOptions({
            preloadPath: '/tmp/preload.js'
        });

        expect(options.frame).toBe(false);
        expect(options.titleBarStyle).toBe('hidden');
        expect(options.autoHideMenuBar).toBe(true);
        expect(options.width).toBe(1480);
        expect(options.height).toBe(940);
        expect(options.minWidth).toBe(1480);
        expect(options.minHeight).toBe(940);
        expect(options.webPreferences?.preload).toBe('/tmp/preload.js');
    });
});
