/** @type {import('@commitlint/types').UserConfig} */
module.exports = {
    extends: ['@commitlint/config-conventional'],
    parserPreset: {
        parserOpts: {
            headerPattern: /^(\w*)(?:\((.*)\))?!?: (.*)$/,
            headerCorrespondence: ['type', 'scope', 'subject']
        }
    },
    rules: {
        'header-max-length': [2, 'always', 72],
        'body-max-line-length': [2, 'always', 100],
        'type-enum': [
            2,
            'always',
            [
                'feat',
                'fix',
                'docs',
                'style',
                'refactor',
                'perf',
                'test',
                'build',
                'ci',
                'chore',
                'revert'
            ]
        ],
        'type-case': [2, 'always', 'lower-case'],
        'subject-case': [2, 'always', 'lower-case'],
        'subject-full-stop': [0, 'never'],
        'subject-empty': [2, 'never']
    },
    prompt: {
        useEmoji: true,
        confirmColorize: true,
        emojiAlign: 'center',
        types: [
            { value: 'feat', name: 'feat:        ✨  新功能', emoji: '✨' },
            { value: 'fix', name: 'fix:         🐛  修 bug', emoji: '🐛' },
            { value: 'docs', name: 'docs:        📝  文档', emoji: '📝' },
            { value: 'style', name: 'style:       💄  代码格式', emoji: '💄' },
            {
                value: 'refactor',
                name: 'refactor:    📦️  重构（不新增功能、修复 bug）',
                emoji: '📦️'
            },
            { value: 'perf', name: 'perf:        🚀  性能', emoji: '🚀' },
            { value: 'test', name: 'test:        🚨  测试', emoji: '🚨' },
            { value: 'build', name: 'build:       🛠  构建', emoji: '🛠' },
            { value: 'ci', name: 'ci:          🎡  CI', emoji: '🎡' },
            { value: 'chore', name: 'chore:       🔨  杂项', emoji: '🔨' },
            { value: 'revert', name: 'revert:      ⏪️  回滚', emoji: '⏪️' }
        ],
        scope: {
            name: 'scope',
            description: '本次变更的影响范围（例：desktop/renderer、desktop/client、server/api）',
            optional: true
        },
        messages: {
            type: '选择本次提交的变更类型（必填）：',
            scope: '声明本次变更的影响范围（可留空）：',
            subject: '简短描述（必填，使用祈使句、不超过 72 字符、不加句号）：',
            body: '详细说明此次变更动机（可留空，使用 "|" 换行）：',
            breaking: '列出 BREAKING CHANGE（可留空）：',
            footer: '关联 issue 编号（可留空，例：#123）：',
            confirmCommit: '确认提交？'
        },
        settings: {
            scopes: [
                { name: 'desktop', value: 'desktop', description: 'Electron 桌面端' },
                { name: 'desktop/renderer', value: 'desktop/renderer', description: '渲染层（React）' },
                { name: 'desktop/client', value: 'desktop/client', description: '主进程' },
                { name: 'desktop/preload', value: 'desktop/preload', description: '预加载' },
                { name: 'desktop/shared', value: 'desktop/shared', description: 'IPC 共享常量' },
                { name: 'desktop/forge', value: 'desktop/forge', description: 'electron-forge 配置' },
                { name: 'server', value: 'server', description: 'Next.js 服务端' },
                { name: 'root', value: 'root', description: '仓库根' }
            ]
        }
    }
};
