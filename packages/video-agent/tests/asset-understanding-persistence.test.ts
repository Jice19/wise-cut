/* */
import { describe, expect, it } from 'vitest';

import { createAgentDatabase } from '../src/storage/create-agent-database';

import {
    createAgentDatabaseHelpers,
    type AgentDatabaseHelpers
} from '../../../apps/desktop/client/agent-database-helpers';

const createFreshDatabase = (): {
    close: () => void;
    helpers: AgentDatabaseHelpers;
} => {
    const db = createAgentDatabase({ filename: ':memory:' });
    const helpers = createAgentDatabaseHelpers({ database: db.database });

    return {
        close: () => {
            db.close();
        },
        helpers
    };
};

const seedRun = (helpers: AgentDatabaseHelpers, runId: string) => {
    helpers.recordRunStarted({
        id: runId,
        startedAt: '2026-07-28T10:00:00.000Z'
    });
};

describe('asset understanding persistence', () => {
    it('upserts and reads back multimodal understanding for an asset', () => {
        const { close, helpers } = createFreshDatabase();
        try {
            seedRun(helpers, 'run_001');

            helpers.upsertAssetUnderstanding({
                actions: ['typing on keyboard', 'looking at screen'],
                assetId: 'video_asset_001',
                description: '产品界面录屏,展示 AI 剪辑操作流程',
                mood: '专注专业',
                objects: ['laptop', 'screen', 'mouse'],
                promptMatchReason: '完全契合,展示产品功能',
                promptMatchScore: 0.95,
                runId: 'run_001',
                suggestedSceneType: 'tutorial'
            });

            const record = helpers.findAssetUnderstanding({
                assetId: 'video_asset_001',
                runId: 'run_001'
            });

            expect(record).not.toBeNull();
            expect(record?.description).toBe(
                '产品界面录屏,展示 AI 剪辑操作流程'
            );
            expect(record?.objects).toEqual(['laptop', 'screen', 'mouse']);
            expect(record?.actions).toEqual([
                'typing on keyboard',
                'looking at screen'
            ]);
            expect(record?.suggestedSceneType).toBe('tutorial');
            expect(record?.promptMatchScore).toBeCloseTo(0.95);
        } finally {
            close();
        }
    });

    it('overwrites existing record on second upsert (same run + asset)', () => {
        const { close, helpers } = createFreshDatabase();
        try {
            seedRun(helpers, 'run_001');

            helpers.upsertAssetUnderstanding({
                actions: ['walking'],
                assetId: 'video_asset_001',
                description: '第一版描述',
                mood: 'old mood',
                objects: ['shoe'],
                promptMatchReason: 'old',
                promptMatchScore: 0.5,
                runId: 'run_001',
                suggestedSceneType: 'walk'
            });

            helpers.upsertAssetUnderstanding({
                actions: ['driving'],
                assetId: 'video_asset_001',
                description: '更新后的描述',
                mood: 'new mood',
                objects: ['car', 'steering wheel'],
                promptMatchReason: 'updated reason',
                promptMatchScore: 0.88,
                runId: 'run_001',
                suggestedSceneType: 'demo'
            });

            const records = helpers.listAssetUnderstandingsByRun({
                runId: 'run_001'
            });

            expect(records).toHaveLength(1);
            expect(records[0].description).toBe('更新后的描述');
            expect(records[0].actions).toEqual(['driving']);
            expect(records[0].promptMatchScore).toBeCloseTo(0.88);
        } finally {
            close();
        }
    });

    it('isolates understandings between different runs', () => {
        const { close, helpers } = createFreshDatabase();
        try {
            seedRun(helpers, 'run_A');
            seedRun(helpers, 'run_B');

            helpers.upsertAssetUnderstanding({
                actions: ['a'],
                assetId: 'asset_1',
                description: 'A 的描述',
                mood: 'A',
                objects: ['x'],
                promptMatchReason: 'r',
                promptMatchScore: 0.5,
                runId: 'run_A',
                suggestedSceneType: 's'
            });
            helpers.upsertAssetUnderstanding({
                actions: ['b'],
                assetId: 'asset_1',
                description: 'B 的描述',
                mood: 'B',
                objects: ['y'],
                promptMatchReason: 'r',
                promptMatchScore: 0.5,
                runId: 'run_B',
                suggestedSceneType: 's'
            });

            expect(
                helpers.findAssetUnderstanding({
                    runId: 'run_A',
                    assetId: 'asset_1'
                })?.description
            ).toBe('A 的描述');
            expect(
                helpers.findAssetUnderstanding({
                    runId: 'run_B',
                    assetId: 'asset_1'
                })?.description
            ).toBe('B 的描述');
        } finally {
            close();
        }
    });

    it('survives across helpers instances pointing at the same DB file (process restart simulation)', () => {
        // 用临时文件模拟持久化:先在一个 helpers 里写,
        // 然后销毁,新建一个 helpers 实例指向同一个文件,验证能读出来
        const tmpPath = `/tmp/agent-understanding-test-${Date.now()}-${Math.random()
            .toString(36)
            .slice(2)}.sqlite`;

        try {
            // 第一次启动
            {
                const db1 = createAgentDatabase({ filename: tmpPath });
                const helpers1 = createAgentDatabaseHelpers({
                    database: db1.database
                });
                helpers1.recordRunStarted({
                    id: 'run_persist',
                    startedAt: '2026-07-28T10:00:00.000Z'
                });
                helpers1.upsertAssetUnderstanding({
                    actions: ['saving checkpoint'],
                    assetId: 'video_001',
                    description: '持久化后的描述',
                    mood: 'satisfied',
                    objects: ['database'],
                    promptMatchReason: 'r',
                    promptMatchScore: 0.7,
                    runId: 'run_persist',
                    suggestedSceneType: 'tutorial'
                });
                db1.close();
            }

            // 模拟进程重启
            {
                const db2 = createAgentDatabase({ filename: tmpPath });
                const helpers2 = createAgentDatabaseHelpers({
                    database: db2.database
                });
                const records = helpers2.listAssetUnderstandingsByRun({
                    runId: 'run_persist'
                });
                expect(records).toHaveLength(1);
                expect(records[0].description).toBe('持久化后的描述');
                expect(records[0].actions).toEqual(['saving checkpoint']);
                expect(records[0].suggestedSceneType).toBe('tutorial');
                db2.close();
            }
        } finally {
            try {
                // 清理临时文件
                // eslint-disable-next-line @typescript-eslint/no-require-imports
                require('node:fs').unlinkSync(tmpPath);
            } catch {
                // ignore
            }
        }
    });
});
