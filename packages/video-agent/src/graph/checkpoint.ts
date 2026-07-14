/**
 * LangGraph checkpoint 工厂 —— commit 6 阶段用 MemorySaver (内存,
 * 进程退出即丢),Phase 5 评估是否升级到 SqliteSaver。
 *
 * 单一职责:把 `MemorySaver` 包一层,让上层 import 路径稳定。
 */

import { MemorySaver } from '@langchain/langgraph';

export type VideoCreationCheckpointer = MemorySaver;

export const createMemoryCheckpointer = (): VideoCreationCheckpointer =>
    new MemorySaver();
