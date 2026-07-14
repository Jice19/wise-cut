/**
 * video-agent controller 工厂 —— commit 6 阶段。
 *
 * 按 env 变量 `VIDEO_AGENT_PROVIDER` 切换实现:
 *   - demo (默认):createDemoVideoAgentController
 *   - langgraph:createLangGraphVideoAgentController(走 LangGraph 真实跑
 *     scan_assets + analyze_assets 两个节点,真解析视频元数据 + 帧描述)
 *
 * 渲染层跟 main.ts 都不感知具体是哪个,只需要 import createVideoAgentController
 * 拿到 VideoAgentController 实例。
 *
 * commit 6 聚焦阶段 langgraph 实现只跑 scan + analyze 两个节点,其它 8 个
 * 节点留 commit 6.5 补。
 */

import { join } from 'node:path';

import { app } from 'electron';

import {
    createDemoVideoAgentController,
    createLangGraphVideoAgentController,
    type VideoAgentController
} from './video-agent-ipc';

export type VideoAgentProvider = 'demo' | 'langgraph';

export const createVideoAgentController = (options?: {
    provider?: VideoAgentProvider;
}): VideoAgentController => {
    const provider =
        options?.provider ??
        (process.env.VIDEO_AGENT_PROVIDER as VideoAgentProvider | undefined) ??
        'demo';

    // outputBaseDir:userData/video-projects/<runId>/
    const outputBaseDir = join(app.getPath('userData'), 'video-projects');

    switch (provider) {
        case 'langgraph':
            return createLangGraphVideoAgentController({ outputBaseDir });
        case 'demo':
        default:
            return createDemoVideoAgentController({ outputBaseDir });
    }
};
