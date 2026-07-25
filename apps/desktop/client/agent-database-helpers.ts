/* */
import type { DatabaseSync } from 'node:sqlite';

import type { AgentDatabase } from '@wise-cut/video-agent';

export type AgentRunStatus =
    | 'completed'
    | 'cancelled'
    | 'failed'
    | 'running'
    | 'waiting_for_approval';

const isAgentRunStatus = (value: unknown): value is AgentRunStatus =>
    value === 'running' ||
    value === 'completed' ||
    value === 'failed' ||
    value === 'cancelled' ||
    value === 'waiting_for_approval';

/**
 * 把 LangGraph `createVideoCreationGraph` 用的 `status` 字符串映射到
 * `agent_runs.status` 字段。当前 graph 只在 result 里用 `completed |
 * failed | waiting_for_approval`,我们额外补 `running` 和 `cancelled`。
 */
export const toAgentRunStatus = (status: string): AgentRunStatus => {
    if (isAgentRunStatus(status)) {
        return status;
    }

    return 'failed';
};

export type ProjectRecord = {
    createdAt: string;
    id: string;
    projectPath: string;
    title: string;
    updatedAt: string;
};

export type AgentRunRecord = {
    completedAt: string | null;
    errorMessage: string | null;
    id: string;
    projectId: string | null;
    startedAt: string;
    status: AgentRunStatus;
};

const requireDatabase = ({
    database
}: {
    database: DatabaseSync;
}): DatabaseSync => {
    if (!database) {
        throw new Error('Agent database is not initialized');
    }

    return database;
};

const insertProject = ({
    database,
    project
}: {
    database: DatabaseSync;
    project: ProjectRecord;
}) => {
    requireDatabase({ database })
        .prepare(
            `insert into projects (
                id,
                title,
                project_path,
                created_at,
                updated_at
            ) values (?, ?, ?, ?, ?)
            on conflict (id) do update set
                title = excluded.title,
                project_path = excluded.project_path,
                updated_at = excluded.updated_at`
        )
        .run(
            project.id,
            project.title,
            project.projectPath,
            project.createdAt,
            project.updatedAt
        );
};

const findProjectById = ({
    database,
    projectId
}: {
    database: DatabaseSync;
    projectId: string;
}): ProjectRecord | null => {
    const row = requireDatabase({ database })
        .prepare(
            `select
                id,
                title,
                project_path as projectPath,
                created_at as createdAt,
                updated_at as updatedAt
            from projects
            where id = ?`
        )
        .get(projectId) as
        | {
              createdAt: string;
              id: string;
              projectPath: string;
              title: string;
              updatedAt: string;
          }
        | undefined;

    if (!row) {
        return null;
    }

    return {
        createdAt: row.createdAt,
        id: row.id,
        projectPath: row.projectPath,
        title: row.title,
        updatedAt: row.updatedAt
    };
};

const listProjects = ({
    database,
    limit = 200
}: {
    database: DatabaseSync;
    limit?: number;
}): ProjectRecord[] => {
    const rows = requireDatabase({ database })
        .prepare(
            `select
                id,
                title,
                project_path as projectPath,
                created_at as createdAt,
                updated_at as updatedAt
            from projects
            order by updated_at desc
            limit ?`
        )
        .all(limit) as Array<{
        createdAt: string;
        id: string;
        projectPath: string;
        title: string;
        updatedAt: string;
    }>;

    return rows.map((row) => ({
        createdAt: row.createdAt,
        id: row.id,
        projectPath: row.projectPath,
        title: row.title,
        updatedAt: row.updatedAt
    }));
};

const recordRunStarted = ({
    database,
    run
}: {
    database: DatabaseSync;
    run: {
        id: string;
        startedAt: string;
    };
}) => {
    requireDatabase({ database })
        .prepare(
            `insert into agent_runs (
                id,
                project_id,
                status,
                started_at,
                completed_at,
                error_message
            ) values (?, null, ?, ?, null, null)`
        )
        .run(run.id, 'running', run.startedAt);
};

const recordRunFinished = ({
    database,
    run
}: {
    database: DatabaseSync;
    run: {
        completedAt: string;
        errorMessage?: string | null;
        id: string;
        projectId?: string | null;
        status: AgentRunStatus;
    };
}) => {
    requireDatabase({ database })
        .prepare(
            `update agent_runs
            set
                project_id = coalesce(?, project_id),
                status = ?,
                completed_at = ?,
                error_message = ?
            where id = ?`
        )
        .run(
            run.projectId ?? null,
            run.status,
            run.completedAt,
            run.errorMessage ?? null,
            run.id
        );
};

const findAgentRun = ({
    database,
    runId
}: {
    database: DatabaseSync;
    runId: string;
}): AgentRunRecord | null => {
    const row = requireDatabase({ database })
        .prepare(
            `select
                id,
                project_id as projectId,
                status,
                started_at as startedAt,
                completed_at as completedAt,
                error_message as errorMessage
            from agent_runs
            where id = ?`
        )
        .get(runId) as
        | {
              completedAt: string | null;
              errorMessage: string | null;
              id: string;
              projectId: string;
              startedAt: string;
              status: string;
          }
        | undefined;

    if (!row) {
        return null;
    }

    return {
        completedAt: row.completedAt,
        errorMessage: row.errorMessage,
        id: row.id,
        projectId: row.projectId,
        startedAt: row.startedAt,
        status: toAgentRunStatus(row.status)
    };
};

const listAgentRuns = ({
    database,
    limit = 100,
    projectId
}: {
    database: DatabaseSync;
    limit?: number;
    projectId?: string;
}): AgentRunRecord[] => {
    const rows = projectId
        ? (requireDatabase({ database })
              .prepare(
                  `select
                    id,
                    project_id as projectId,
                    status,
                    started_at as startedAt,
                    completed_at as completedAt,
                    error_message as errorMessage
                from agent_runs
                where project_id = ?
                order by started_at desc
                limit ?`
              )
              .all(projectId, limit) as Array<{
              completedAt: string | null;
              errorMessage: string | null;
              id: string;
              projectId: string;
              startedAt: string;
              status: string;
          }>)
        : (requireDatabase({ database })
              .prepare(
                  `select
                    id,
                    project_id as projectId,
                    status,
                    started_at as startedAt,
                    completed_at as completedAt,
                    error_message as errorMessage
                from agent_runs
                order by started_at desc
                limit ?`
              )
              .all(limit) as Array<{
              completedAt: string | null;
              errorMessage: string | null;
              id: string;
              projectId: string;
              startedAt: string;
              status: string;
          }>);

    return rows.map((row) => ({
        completedAt: row.completedAt,
        errorMessage: row.errorMessage,
        id: row.id,
        projectId: row.projectId,
        startedAt: row.startedAt,
        status: toAgentRunStatus(row.status)
    }));
};

export const createAgentDatabaseHelpers = ({
    database
}: {
    database: AgentDatabase['database'];
}) => ({
    findAgentRun: (runId: string) => findAgentRun({ database, runId }),
    findProjectById: (projectId: string) =>
        findProjectById({ database, projectId }),
    insertProject: (project: ProjectRecord) =>
        insertProject({ database, project }),
    listAgentRuns: (input?: { limit?: number; projectId?: string }) =>
        listAgentRuns({ database, ...(input ?? {}) }),
    listProjects: (input?: { limit?: number }) =>
        listProjects({ database, ...(input ?? {}) }),
    recordRunFinished: (input: {
        completedAt: string;
        errorMessage?: string | null;
        id: string;
        projectId?: string | null;
        status: AgentRunStatus;
    }) => recordRunFinished({ database, run: input }),
    recordRunStarted: (input: { id: string; startedAt: string }) =>
        recordRunStarted({ database, run: input })
});

export type AgentDatabaseHelpers = ReturnType<
    typeof createAgentDatabaseHelpers
>;
