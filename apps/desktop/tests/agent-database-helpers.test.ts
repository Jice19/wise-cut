/* */
import { describe, expect, it } from 'vitest';

import { createAgentDatabase } from '@wise-cut/video-agent';

import {
    createAgentDatabaseHelpers,
    toAgentRunStatus
} from '../client/agent-database-helpers';

const createInMemoryDatabase = () => {
    const agentDatabase = createAgentDatabase({ filename: ':memory:' });

    return {
        close: () => agentDatabase.close(),
        helpers: createAgentDatabaseHelpers({
            database: agentDatabase.database
        })
    };
};

// 测试 helper:在 helper 里有 `recordRunFinished({ projectId: 'project_xxx' })`
// 这种依赖 FK 约束的测试,要先在 projects 表里插一行,否则会触发
// FOREIGN KEY constraint failed。
const insertTestProject = (
    helpers: ReturnType<typeof createAgentDatabaseHelpers>,
    id: string
) =>
    helpers.insertProject({
        createdAt: '2026-07-25T09:00:00.000Z',
        id,
        projectPath: `/tmp/${id}.miaojian.json`,
        title: id,
        updatedAt: '2026-07-25T09:00:00.000Z'
    });

describe('toAgentRunStatus', () => {
    it('passes through known statuses', () => {
        expect(toAgentRunStatus('running')).toBe('running');
        expect(toAgentRunStatus('completed')).toBe('completed');
        expect(toAgentRunStatus('failed')).toBe('failed');
        expect(toAgentRunStatus('cancelled')).toBe('cancelled');
        expect(toAgentRunStatus('waiting_for_approval')).toBe(
            'waiting_for_approval'
        );
    });

    it('falls back to failed for unknown statuses', () => {
        expect(toAgentRunStatus('something-weird')).toBe('failed');
    });
});

describe('agent database helpers — projects', () => {
    it('inserts and finds projects', () => {
        const { close, helpers } = createInMemoryDatabase();
        try {
            helpers.insertProject({
                createdAt: '2026-07-25T10:00:00.000Z',
                id: 'project_001',
                projectPath: '/tmp/project_001.miaojian.json',
                title: '测试项目',
                updatedAt: '2026-07-25T10:00:00.000Z'
            });

            const found = helpers.findProjectById('project_001');

            expect(found).toEqual({
                createdAt: '2026-07-25T10:00:00.000Z',
                id: 'project_001',
                projectPath: '/tmp/project_001.miaojian.json',
                title: '测试项目',
                updatedAt: '2026-07-25T10:00:00.000Z'
            });
        } finally {
            close();
        }
    });

    it('upserts when inserting a project with the same id (updates title / path / updated_at)', () => {
        const { close, helpers } = createInMemoryDatabase();
        try {
            helpers.insertProject({
                createdAt: '2026-07-25T10:00:00.000Z',
                id: 'project_001',
                projectPath: '/tmp/a.json',
                title: 'A',
                updatedAt: '2026-07-25T10:00:00.000Z'
            });
            helpers.insertProject({
                createdAt: '2026-07-25T10:00:00.000Z',
                id: 'project_001',
                projectPath: '/tmp/b.json',
                title: 'B',
                updatedAt: '2026-07-25T11:00:00.000Z'
            });

            expect(helpers.findProjectById('project_001')).toMatchObject({
                id: 'project_001',
                projectPath: '/tmp/b.json',
                title: 'B',
                updatedAt: '2026-07-25T11:00:00.000Z'
            });
        } finally {
            close();
        }
    });

    it('returns null when project does not exist', () => {
        const { close, helpers } = createInMemoryDatabase();
        try {
            expect(helpers.findProjectById('nope')).toBeNull();
        } finally {
            close();
        }
    });

    it('lists projects ordered by updated_at desc', () => {
        const { close, helpers } = createInMemoryDatabase();
        try {
            helpers.insertProject({
                createdAt: '2026-07-25T09:00:00.000Z',
                id: 'project_001',
                projectPath: '/tmp/a.json',
                title: 'A',
                updatedAt: '2026-07-25T09:00:00.000Z'
            });
            helpers.insertProject({
                createdAt: '2026-07-25T10:00:00.000Z',
                id: 'project_002',
                projectPath: '/tmp/b.json',
                title: 'B',
                updatedAt: '2026-07-25T10:00:00.000Z'
            });

            expect(helpers.listProjects().map((p) => p.id)).toEqual([
                'project_002',
                'project_001'
            ]);
        } finally {
            close();
        }
    });
});

describe('agent database helpers — agent_runs', () => {
    it('records a started run with project_id null and finds it', () => {
        const { close, helpers } = createInMemoryDatabase();
        try {
            helpers.recordRunStarted({
                id: 'run_001',
                startedAt: '2026-07-25T10:00:00.000Z'
            });

            const run = helpers.findAgentRun('run_001');

            expect(run).toEqual({
                completedAt: null,
                errorMessage: null,
                id: 'run_001',
                projectId: null,
                startedAt: '2026-07-25T10:00:00.000Z',
                status: 'running'
            });
        } finally {
            close();
        }
    });

    it('records a finished run with status + project_id + completed_at', () => {
        const { close, helpers } = createInMemoryDatabase();
        try {
            insertTestProject(helpers, 'project_001');
            helpers.recordRunStarted({
                id: 'run_001',
                startedAt: '2026-07-25T10:00:00.000Z'
            });
            helpers.recordRunFinished({
                completedAt: '2026-07-25T10:05:00.000Z',
                id: 'run_001',
                projectId: 'project_001',
                status: 'completed'
            });

            const run = helpers.findAgentRun('run_001');

            expect(run).toEqual({
                completedAt: '2026-07-25T10:05:00.000Z',
                errorMessage: null,
                id: 'run_001',
                projectId: 'project_001',
                startedAt: '2026-07-25T10:00:00.000Z',
                status: 'completed'
            });
        } finally {
            close();
        }
    });

    it('finishes a run without crashing when the project row is missing (FK fallback)', () => {
        const { close, helpers } = createInMemoryDatabase();
        try {
            helpers.recordRunStarted({
                id: 'run_001',
                startedAt: '2026-07-25T10:00:00.000Z'
            });

            // projects 表没有 project_999(insertProject 无生产调用者,
            // 这是真实运行里的常见状态):不能触发 FK 崩溃/刷 warn。
            expect(() =>
                helpers.recordRunFinished({
                    completedAt: '2026-07-25T10:05:00.000Z',
                    id: 'run_001',
                    projectId: 'project_999',
                    status: 'completed'
                })
            ).not.toThrow();

            const run = helpers.findAgentRun('run_001');

            expect(run?.status).toBe('completed');
            expect(run?.completedAt).toBe('2026-07-25T10:05:00.000Z');
            // 降级:project 行不存在时不写 project_id(留 NULL),记录仍完整
            expect(run?.projectId).toBeNull();
        } finally {
            close();
        }
    });

    it('records failed run with error_message', () => {
        const { close, helpers } = createInMemoryDatabase();
        try {
            insertTestProject(helpers, 'project_001');
            helpers.recordRunStarted({
                id: 'run_001',
                startedAt: '2026-07-25T10:00:00.000Z'
            });
            helpers.recordRunFinished({
                completedAt: '2026-07-25T10:00:01.000Z',
                errorMessage: '网络错误',
                id: 'run_001',
                projectId: 'project_001',
                status: 'failed'
            });

            const run = helpers.findAgentRun('run_001');

            expect(run?.status).toBe('failed');
            expect(run?.errorMessage).toBe('网络错误');
            expect(run?.projectId).toBe('project_001');
        } finally {
            close();
        }
    });

    it('records cancelled run with project_id null (rejection path)', () => {
        const { close, helpers } = createInMemoryDatabase();
        try {
            helpers.recordRunStarted({
                id: 'run_001',
                startedAt: '2026-07-25T10:00:00.000Z'
            });
            helpers.recordRunFinished({
                completedAt: '2026-07-25T10:00:02.000Z',
                id: 'run_001',
                projectId: null,
                status: 'cancelled'
            });

            expect(helpers.findAgentRun('run_001')?.status).toBe('cancelled');
        } finally {
            close();
        }
    });

    it('preserves existing project_id when recordRunFinished is called without one', () => {
        // Graph 跑 save_project 节点时,run.completed 事件带 projectId
        // 写一次 recordRunFinished(只 status + completedAt);之后再收到
        // 其他事件(理论上不会,但 schema 容错),不要把 project_id 清空。
        const { close, helpers } = createInMemoryDatabase();
        try {
            insertTestProject(helpers, 'project_001');
            helpers.recordRunStarted({
                id: 'run_001',
                startedAt: '2026-07-25T10:00:00.000Z'
            });
            helpers.recordRunFinished({
                completedAt: '2026-07-25T10:05:00.000Z',
                id: 'run_001',
                projectId: 'project_001',
                status: 'completed'
            });
            // 再次调用,不传 projectId,应该保留已写的(coalesce 语义)
            helpers.recordRunFinished({
                completedAt: '2026-07-25T10:06:00.000Z',
                id: 'run_001',
                status: 'failed'
            });

            expect(helpers.findAgentRun('run_001')?.projectId).toBe(
                'project_001'
            );
        } finally {
            close();
        }
    });

    it('lists agent runs ordered by started_at desc with optional project_id filter', () => {
        const { close, helpers } = createInMemoryDatabase();
        try {
            insertTestProject(helpers, 'project_001');
            insertTestProject(helpers, 'project_002');
            helpers.recordRunStarted({
                id: 'run_001',
                startedAt: '2026-07-25T10:00:00.000Z'
            });
            helpers.recordRunFinished({
                completedAt: '2026-07-25T10:05:00.000Z',
                id: 'run_001',
                projectId: 'project_001',
                status: 'completed'
            });
            helpers.recordRunStarted({
                id: 'run_002',
                startedAt: '2026-07-25T11:00:00.000Z'
            });
            helpers.recordRunFinished({
                completedAt: '2026-07-25T11:05:00.000Z',
                id: 'run_002',
                projectId: 'project_002',
                status: 'completed'
            });

            // 不带过滤
            expect(helpers.listAgentRuns().map((r) => r.id)).toEqual([
                'run_002',
                'run_001'
            ]);

            // 按 projectId 过滤
            expect(
                helpers
                    .listAgentRuns({ projectId: 'project_001' })
                    .map((r) => r.id)
            ).toEqual(['run_001']);
        } finally {
            close();
        }
    });
});
