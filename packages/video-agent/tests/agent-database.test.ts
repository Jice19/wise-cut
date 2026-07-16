/* */
import { describe, expect, it } from 'vitest';

import { createAgentDatabase } from '../src/storage/create-agent-database';

describe('agent database', () => {
    it('initializes the local agent tables in SQLite', () => {
        const agentDatabase = createAgentDatabase({
            filename: ':memory:'
        });

        try {
            const tables = agentDatabase.database
                .prepare(
                    "select name from sqlite_master where type = 'table' order by name"
                )
                .all()
                .map((row) => String(row.name));

            expect(tables).toEqual([
                'agent_runs',
                'ai_decisions',
                'asset_embeddings',
                'asset_segments',
                'graph_checkpoints',
                'projects'
            ]);
        } finally {
            agentDatabase.close();
        }
    });

    it('supports inserting project and run records', () => {
        const agentDatabase = createAgentDatabase({
            filename: ':memory:'
        });

        try {
            agentDatabase.database
                .prepare(
                    'insert into projects (id, title, project_path, created_at, updated_at) values (?, ?, ?, ?, ?)'
                )
                .run(
                    'project_001',
                    '测试项目',
                    '/tmp/project.miaojian.json',
                    '2026-06-23T00:00:00.000Z',
                    '2026-06-23T00:00:00.000Z'
                );
            agentDatabase.database
                .prepare(
                    'insert into agent_runs (id, project_id, status, started_at, completed_at, error_message) values (?, ?, ?, ?, ?, ?)'
                )
                .run(
                    'run_001',
                    'project_001',
                    'running',
                    '2026-06-23T00:00:01.000Z',
                    null,
                    null
                );

            const run = agentDatabase.database
                .prepare('select status from agent_runs where id = ?')
                .get('run_001');

            expect(run).toEqual({ status: 'running' });
        } finally {
            agentDatabase.close();
        }
    });
});
