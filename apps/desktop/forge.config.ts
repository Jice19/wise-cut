
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
        // packagerConfig.name 是打包后的可执行文件名/目录名,
        // 用 ASCII 避免跨平台路径问题。productName 在 package.json 里
        // 控制显示名称。
        name: 'WiseCut',
        // 打包后忽略 devDependencies,减小产物体积。
        // 原生模块(better-sqlite3)由 electron-rebuild 处理。
        prune: true,
        // macOS 图标
        icon: 'renderer/assets/icon'
    },
    rebuildConfig: {
        // electron-forge 会自动检测 better-sqlite3 等原生模块
        // 并用 electron-rebuild 重新编译
    },
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
