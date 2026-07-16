
import { FuseV1Options, FuseVersion } from '@electron/fuses';
import { MakerDeb } from '@electron-forge/maker-deb';
import { MakerRpm } from '@electron-forge/maker-rpm';
import { MakerSquirrel } from '@electron-forge/maker-squirrel';
import { MakerZIP } from '@electron-forge/maker-zip';
import { FusesPlugin } from '@electron-forge/plugin-fuses';
import { VitePlugin } from '@electron-forge/plugin-vite';
import type { ForgeConfig } from '@electron-forge/shared-types';

const config: ForgeConfig = {
    packagerConfig: {
        extraResource: ['bin', 'renderer/assets/song'],
        name: 'AI智能剪辑平台',
        prune: false
    },
    rebuildConfig: {},
    makers: [
        new MakerSquirrel({}),
        new MakerZIP({}, ['darwin', 'win32']),
        new MakerRpm({}),
        new MakerDeb({})
    ],
    plugins: [
        new VitePlugin({
            build: [
                {
                    entry: 'client/main.ts',
                    config: 'vite.main.config.ts',
                    target: 'main'
                },
                {
                    entry: 'client/preload.ts',
                    config: 'vite.preload.config.ts',
                    target: 'preload'
                }
            ],
            renderer: [
                {
                    name: 'main_window',
                    config: 'vite.renderer.config.ts'
                }
            ]
        }),
        new FusesPlugin({
            version: FuseVersion.V1,
            [FuseV1Options.RunAsNode]: false,
            [FuseV1Options.EnableCookieEncryption]: true,
            [FuseV1Options.EnableNodeOptionsEnvironmentVariable]: false,
            [FuseV1Options.EnableNodeCliInspectArguments]: false,
            [FuseV1Options.EnableEmbeddedAsarIntegrityValidation]: true
        })
    ]
};

export default config;
