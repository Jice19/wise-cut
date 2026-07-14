/**
 * video-agent controller 工厂 —— commit 5 阶段。
 *
 * 按 env 变量 `VIDEO_AGENT_PROVIDER` 切换实现:
 *   - demo (默认):createDemoVideoAgentController
 *   - langgraph (Phase 5/6):createLangGraphVideoAgentController
 *
 * 渲染层跟 main.ts 都不感知具体是哪个,只需要 import createVideoAgentController
 * 拿到 VideoAgentController 实例。
 */

import { join } from 'node:path';

import { app } from 'electron';

import {
    createDemoVideoAgentController,
    type VideoAgentController
} from './video-agent-ipc';

export type VideoAgentProvider = 'demo' | 'langgraph';

export const createVideoAgentController = (): VideoAgentController => {
    const provider = (process.env.VIDEO_AGENT_PROVIDER ??
        'demo') as VideoAgentProvider;

    // outputBaseDir:userData/video-projects/<runId>/
    // commit 5 阶段落盘到 userData/video-projects/<projectId>.json,
    // commit 7 起把 ProjectStore 抽到 video-project-store.ts 单独持久化
    const outputBaseDir = join(app.getPath('userData'), 'video-projects');

    switch (provider) {
        case 'langgraph':
            // Phase 5/6 真 LangGraph 接入,fallback 到 demo 避免未实现时崩溃
            // eslint-disable-next-line no-console
            console.warn(
                '[video-agent] VIDEO_AGENT_PROVIDER=langgraph not implemented, falling back to demo'
            );
            return createDemoVideoAgentController({ outputBaseDir });
        case 'demo':
        default:
            return createDemoVideoAgentController({ outputBaseDir });
    }
};
