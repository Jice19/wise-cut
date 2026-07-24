/*
 * Commitlint 共享配置:
 *  1. type 限定为 conventional commits 标准子集
 *  2. scope 允许的命名空间
 *  3. subject 不超过 100 字
 */
module.exports = {
    extends: ['@commitlint/config-conventional'],
    rules: {
        'header-max-length': [2, 'always', 100],
        'scope-enum': [
            2,
            'always',
            [
                'agent',
                'desktop',
                'editor',
                'electron',
                'export',
                'project',
                'renderer',
                'tts',
                'workspace'
            ]
        ]
    }
};
