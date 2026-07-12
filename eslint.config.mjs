// @ts-check
import js from '@eslint/js';
import tseslint from 'typescript-eslint';
import prettier from 'eslint-plugin-prettier';
import simpleImportSort from 'eslint-plugin-simple-import-sort';
import globals from 'globals';

const sharedPlugins = {
    'simple-import-sort': simpleImportSort,
    prettier
};

export default tseslint.config(
    // ---------- 1. 全局忽略 ----------
    {
        ignores: [
            '**/node_modules/**',
            '**/coverage/**',
            '**/build/**',
            '**/es/**',
            '**/dist/**',
            '**/out/**',
            '**/.vite/**',
            '**/.vite-node/**',
            '**/apps/server/.next/**',
            '**/apps/server/app/generated/**',
            '**/pnpm-lock.yaml'
        ]
    },

    // ---------- 2. 全局推荐规则 ----------
    js.configs.recommended,

    // ---------- 3. TS 推荐规则（作用全仓库 .ts/.tsx/.mjs） ----------
    ...tseslint.configs.recommended,

    // ---------- 4. TS / TSX 配置 ----------
    {
        files: ['**/*.{ts,tsx,mts,cts}'],
        languageOptions: {
            ecmaVersion: 2022,
            sourceType: 'module',
            globals: {
                ...globals.browser,
                ...globals.node,
                // electron-forge VitePlugin 注入的 env
                MAIN_WINDOW_VITE_DEV_SERVER_URL: 'readonly',
                MAIN_WINDOW_VITE_NAME: 'readonly',
                // preload 暴露到渲染层的全局 API
                miaomaAPI: 'readonly'
            }
        },
        plugins: sharedPlugins,
        rules: {
            // 类型
            '@typescript-eslint/array-type': 'error',
            '@typescript-eslint/no-for-in-array': 'error',
            '@typescript-eslint/no-explicit-any': 'off',
            'no-console': 'error',

            // import 排序（5 段分组）
            'simple-import-sort/imports': [
                'error',
                {
                    groups: [
                        ['^node:'], // 1. node 内置
                        ['^@?\\w'], // 2. 第三方（@scope 或普通）
                        ['^@/'], // 3. 路径别名 @
                        ['^\\u0000'], // 4. 副作用 import
                        ['^\\.\\.?(?!/?$)', '^\\.?\\/'], // 5. 相对父 / 同级
                        ['^$'] // 收尾空行
                    ]
                }
            ],
            'simple-import-sort/exports': 'error',

            // 格式化
            'prettier/prettier': 'error',

            // 类型优先：no-undef 交给 TS
            'no-undef': 'off'
        }
    },

    // ---------- 5. 配置文件（含 .mjs）仅开 no-console + prettier ----------
    {
        files: [
            '**/*.config.{ts,js,mjs,cjs}',
            'apps/desktop/forge.config.ts',
            'apps/desktop/vite.*.config.{ts,mjs}',
            'apps/desktop/vitest.config.ts',
            'eslint.config.mjs'
        ],
        languageOptions: {
            sourceType: 'module',
            globals: {
                ...globals.node,
                ...globals.browser,
                MAIN_WINDOW_VITE_DEV_SERVER_URL: 'readonly',
                MAIN_WINDOW_VITE_NAME: 'readonly'
            }
        },
        plugins: sharedPlugins,
        rules: {
            'no-console': 'error',
            'prettier/prettier': 'error',
            '@typescript-eslint/no-explicit-any': 'off',
            '@typescript-eslint/no-unused-vars': [
                'warn',
                { argsIgnorePattern: '^_', varsIgnorePattern: '^_' }
            ]
        }
    },

    // ---------- 6. 测试文件放宽 ----------
    {
        files: ['**/*.{test,spec}.{ts,tsx}', '**/vitest.config.ts'],
        languageOptions: {
            globals: {
                ...globals.browser,
                ...globals.node
            }
        },
        rules: {
            'no-console': 'off',
            '@typescript-eslint/no-explicit-any': 'off'
        }
    }
);
