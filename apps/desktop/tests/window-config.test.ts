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
        expect(options.minWidth).toBe(1280);
        expect(options.webPreferences?.preload).toBe('/tmp/preload.js');
    });
});
