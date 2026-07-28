/* */
import Database from 'better-sqlite3';
import { MemorySaver } from '@langchain/langgraph';
import { SqliteSaver } from '@langchain/langgraph-checkpoint-sqlite';

import type { BaseCheckpointSaver } from '@langchain/langgraph';

export type CreateVideoCreationCheckpointerOptions = {
    /**
     * 可选:SQLite 文件路径。提供后用 SqliteSaver 持久化 checkpoint;
     * 不提供则降级用 MemorySaver(用于单测等不依赖磁盘的场景)。
     */
    dbPath?: string;
};

export const createVideoCreationCheckpointer = ({
    dbPath
}: CreateVideoCreationCheckpointerOptions = {}): BaseCheckpointSaver => {
    if (!dbPath) {
        return new MemorySaver();
    }

    // 手动管理 better-sqlite3 连接:这样连接的生命周期归我们管,
    // 不会撞 SqliteSaver.fromConnString() 在某些版本里返回 context manager
    // 的坑。SqliteSaver 内部依赖 better-sqlite3 提供的同步 sqlite binding,
    // 调用方负责在程序退出时 close(进程退出 OS 也会回收)。
    const conn = new Database(dbPath);
    return new SqliteSaver(conn);
};
