
// 注意:这个文件刻意用 .mjs(原生 ESM)而不是 .ts。
//
// 原因(见 docs/plan.md §2.2):electron-forge 对 .ts/.mts/.cts 配置走 jiti
// 转译成 CJS 再加载,一旦依赖链里出现 ESM-only 的包,就会报
// "Cannot use 'import.meta' outside a module",而且是否触发取决于
// Node 版本/缓存状态——"时灵时不灵",极难排查。
// .js/.mjs/.cjs 走原生 dynamic import,ESM 语法天然合法,不会踩这个坑。

import { MakerDeb } from '@electron-forge/maker-deb';
import { MakerRpm } from '@electron-forge/maker-rpm';
import { MakerSquirrel } from '@electron-forge/maker-squirrel';
import { MakerZIP } from '@electron-forge/maker-zip';
import { VitePlugin } from '@electron-forge/plugin-vite';

const config = {
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
        })
        // 刻意不使用 FusesPlugin:@electron-forge/plugin-fuses@7.10.2 的
        // peerDependency 是 @electron/fuses@^1.0.0,而 2.x 是 ESM-only,
        // 同样会触发上面的 CJS/ESM 问题。
        // 想恢复产物加固:把 @electron/fuses 钉到 ^1.8.0 再加回来。
    ]
};

export default config;
