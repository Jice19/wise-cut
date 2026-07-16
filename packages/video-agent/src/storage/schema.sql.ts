/* */
export const agentDatabaseSchemaStatements = [
    `create table if not exists projects (
        id text primary key,
        title text not null,
        project_path text not null,
        created_at text not null,
        updated_at text not null
    )`,
    `create table if not exists agent_runs (
        id text primary key,
        project_id text not null,
        status text not null,
        started_at text not null,
        completed_at text,
        error_message text,
        foreign key (project_id) references projects(id)
    )`,
    `create table if not exists asset_segments (
        id text primary key,
        project_id text not null,
        asset_id text not null,
        media_type text not null,
        source_path text not null,
        start_ms integer not null,
        end_ms integer not null,
        description text,
        metadata_json text not null,
        foreign key (project_id) references projects(id)
    )`,
    `create table if not exists asset_embeddings (
        id text primary key,
        segment_id text not null,
        model text not null,
        embedding_json text not null,
        created_at text not null,
        foreign key (segment_id) references asset_segments(id)
    )`,
    `create table if not exists graph_checkpoints (
        id text primary key,
        run_id text not null,
        checkpoint_json text not null,
        created_at text not null,
        foreign key (run_id) references agent_runs(id)
    )`,
    `create table if not exists ai_decisions (
        id text primary key,
        run_id text not null,
        node_name text not null,
        decision_json text not null,
        created_at text not null,
        foreign key (run_id) references agent_runs(id)
    )`
] as const;
