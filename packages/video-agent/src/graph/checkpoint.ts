/**
 * LangGraph checkpoint 工厂 —— 老师项目规范:
 *   - export `createVideoCreationCheckpointer()` 返回 MemorySaver 实例
 *   - commit 6 阶段用 MemorySaver (进程退出即丢),Phase 5 评估是否升级到 SqliteSaver
 */

import { MemorySaver } from '@langchain/langgraph';

export type VideoCreationCheckpointer = MemorySaver;

export const createVideoCreationCheckpointer = (): VideoCreationCheckpointer =>
    new MemorySaver();
