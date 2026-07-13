# 长时任务进度上报与取消机制

> 截图标题:**§9 长时任务进度上报与取消机制**(蒋佳俊水印)
>
> 核心问题:智能体生成视频是 1-5 分钟的长时任务,用户点"开始"后必须能看到进度,不然会以为程序卡死。
>
> 一个好的事件系统需要满足:**有序不丢失、结构化、支持流式输出、支持中断、支持取消**。

---

## 1. 目标

把 LangGraph 内部节点的事件,实时推给 Electron renderer,并支持中途取消。

| 维度                    | 现状                 | 本设计目标                                          |
| ----------------------- | -------------------- | --------------------------------------------------- |
| 事件类型                | commit 4 只声明 2 种 | 13 种 discriminated union                           |
| 序号                    | 无                   | 单调递增,前端检测 gap                               |
| 中断(human-in-the-loop) | 无                   | `interrupt()` 触发,emit `approval.required`         |
| 取消                    | 无                   | AbortController kill ffmpeg/llm/tts 进程            |
| 全量重同步              | 无                   | 序号 gap 时自动调 `requestFullState()` 拉完整 state |

---

## 2. 事件类型设计(13 种)

plan §4 已列完整列表,本节给字段细节:

```ts
type AgentRunEvent =
    // 任务生命周期
    | { type: 'run.started'; runId: string; input: VideoCreationInput }
    | {
          type: 'run.completed';
          runId: string;
          projectPath: string;
          durationMs: number;
      }
    | { type: 'run.failed'; runId: string; error: string; stage?: string }
    | { type: 'run.cancelled'; runId: string }
    // 节点生命周期
    | {
          type: 'node.started';
          runId: string;
          nodeName: string;
          nodeLabel: string;
      }
    | {
          type: 'node.completed';
          runId: string;
          nodeName: string;
          durationMs: number;
      }
    | { type: 'node.failed'; runId: string; nodeName: string; error: string }
    | {
          type: 'node.progress';
          runId: string;
          nodeName: string;
          progress: number;
          message: string;
      }
    // LLM 流式
    | { type: 'llm.chunk'; runId: string; nodeName: string; content: string }
    | {
          type: 'llm.completed';
          runId: string;
          nodeName: string;
          tokenCount: number;
      }
    // 局部重生成进度
    | {
          type: 'voice.regeneration.progress';
          runId: string;
          current: number;
          total: number;
          percent: number;
      }
    // 等待用户中断
    | {
          type: 'interrupt';
          runId: string;
          interruptType: 'scene_approval';
          payload: SceneApprovalRequest;
      }
    | { type: 'interrupt.resumed'; runId: string; interruptType: string };
```

### 2.1 元字段(每事件带)

```ts
type AgentRunEventMeta = {
    runId: string; // 关联一次 run
    seq: number; // 单调递增,0 开始
    timestamp: number; // Date.now()
};
```

**所有事件继承** + `type` 字段做 discriminated union。

---

## 3. 事件发射器实现

### 3.1 带序号的事件发射器

```ts
// packages/video-agent/src/events/event-emitter.ts
class AgentRunEventEmitter {
    private emitter = new EventEmitter();
    private sequence = 0;

    constructor(private runId: string) {}

    emit(event: Omit<AgentRunEvent, 'runId' | 'seq'>) {
        const eventWithMeta = {
            ...event,
            runId: this.runId,
            seq: this.sequence++,
            timestamp: Date.now()
        } as AgentRunEvent & { seq: number; timestamp: number };

        this.emitter.emit('event', eventWithMeta);
    }

    on(listener: (event: AgentRunEvent & { seq: number }) => void) {
        this.emitter.on('event', listener);
        return () => this.emitter.off('event', listener);
    }
}
```

### 3.2 顺序保证

- **单 run 内**:序号严格递增,Node.js EventEmitter 同步分发,保证事件按 emit 顺序到达 listener
- **跨 run**:每个 run 独立 emitter,独立序号,前端用 `runId` 区分

---

## 4. 序号 gap 检测 + 全量重同步

### 4.1 问题场景

网络抖动 → IPC 事件丢失 → 前端 state.scenes 不完整 → 用户看到的进度条错位

### 4.2 前端检测算法

```ts
// apps/desktop/renderer/hooks/useVideoAgent.ts
window.electron.ipcRenderer.on('video-agent:event', (event: any) => {
    if (event.seq !== this.state.lastSeq + 1 && this.state.lastSeq !== -1) {
        // 序号不连续 → 丢事件了
        console.warn(
            `Event sequence gap: expected ${this.state.lastSeq + 1}, got ${event.seq}`
        );
        this.requestFullState(); // 拉完整 state 重新同步
    }

    this.state.lastSeq = event.seq;
    this.handleEvent(event);
});
```

### 4.3 主进程响应全量重同步请求

```ts
ipcMain.handle('video-agent:request-full-state', (event, { runId }) => {
    const state = getStateFromCheckpointer(runId); // MemorySaver 拿
    return state;
});
```

### 4.4 为什么不是 100% 触发

MemorySaver 的 state 序列化有性能开销,只在确实丢事件时触发,而不是每次连接都同步。

---

## 5. 中断(interrupt)事件流

### 5.1 scene_approval 中断流程

```
[node.plan_scenes 跑完]
   ↓
[node.scene_approval 入口]
   ↓
emit('node.started', nodeName: 'scene_approval')
   ↓
LangGraph interrupt({ type: 'scene-plan', payload: { brief, scenes } })
   ↓
[LangGraph 把 state 序列化到 checkpoint]
[LangGraph 返回 result.__interrupt__ = [{ value: { type, payload } }]]
   ↓
[controller 检测 __interrupt__]
emit('interrupt', payload)
   ↓
[renderer 收到]
   ↓
SceneApprovalDialog 弹窗,渲染 scenes
   ↓
用户点 "批准"
   ↓
renderer 调 miaomaAPI.videoAgent.approve({ runId, approved: true })
   ↓
[主进程 controller.approve]
   ↓
app.invoke(new Command({ resume: { approved: true } }), { thread_id: runId })
   ↓
emit('interrupt.resumed')
   ↓
[match_assets 节点开始跑]
emit('node.started', nodeName: 'match_assets')
...
```

### 5.2 关键代码

```ts
// 主进程 controller
async function approve({ runId, approved }, emit) {
    emit({ type: 'interrupt.resumed', runId, interruptType: 'scene_approval' });

    const result = await app.invoke(new Command({ resume: { approved } }), {
        configurable: { thread_id: runId }
    });

    // 后续 node 跑完的事件继续通过 emit 推
    return { status: 'completed' };
}
```

---

## 6. 取消机制

### 6.1 用户主动取消

```ts
// renderer
miaomaAPI.videoAgent.cancel({ runId });

// 主进程 controller
async function cancel({ runId }) {
    // 1. AbortController 触发
    controller.abort();

    // 2. emit run.cancelled
    emit({ type: 'run.cancelled', runId });

    // 3. 清理 LangGraph checkpoint
    await checkpointer.delete(runId);

    // 4. 关闭 LLM stream
    llmStreamController?.abort();

    // 5. 关闭 ffmpeg 进程
    ffmpegProcess?.kill('SIGTERM');

    // 6. 清理临时文件
    await rm(tempDir, { recursive: true });
}
```

### 6.2 取消的传播链路

```
user click "取消"
   ↓
miaomaAPI.videoAgent.cancel({ runId })
   ↓
主进程 controller.cancel({ runId })
   ↓
controller.abort()  // AbortController
   ↓
[LangGraph 节点检测 AbortSignal]
   ↓
[所有进行中的 IO 抛出 AbortError]
   ↓
[catch AbortError → emit run.cancelled]
   ↓
[前端 reducer 收到 run.cancelled → 清理 UI state]
```

### 6.3 AbortController 在 ffmpeg 中的使用

```ts
const controller = new AbortController();
const ffmpegProcess = spawn('ffmpeg', args, { signal: controller.signal });

ffmpegProcess.on('error', (error) => {
    if (error.name === 'AbortError') {
        emit({ type: 'run.cancelled', runId });
    } else {
        emit({ type: 'run.failed', runId, error: error.message });
    }
});

// 用户取消
controller.abort(); // ffmpeg 进程被 SIGTERM,kill
```

### 6.4 AbortController 在 fetch(LLM)中的使用

```ts
const controller = new AbortController();
const response = await fetch(M3_ENDPOINT, {
  ...,
  signal: controller.signal
});

// LLM 流式接收
const reader = response.body.getReader();
const { done, value } = await reader.read();
```

---

## 7. 前端 useVideoAgent Hook

```ts
// apps/desktop/renderer/hooks/useVideoAgent.ts
class VideoAgentStore {
    status: 'idle' | 'running' | 'waiting_approval' | 'completed' | 'failed' =
        'idle';
    currentNode: string = '';
    currentNodeLabel: string = '';
    progress: number = 0;
    nodeProgress: number = 0;
    message: string = '';
    logs: Array<{
        time: string;
        message: string;
        type: 'info' | 'success' | 'error';
    }> = [];
    llmOutput: string = '';
    interruptPayload: SceneApprovalRequest | null = null;
    error: string = '';
    lastSeq: number = -1;

    private listeners = new Set<() => void>();

    constructor() {
        // 监听主进程事件
        window.electron.ipcRenderer.on('video-agent:event', (event: any) => {
            // 序号检查:如果事件序号不连续,说明丢失了事件,请求全量状态
            if (
                event.seq !== this.state.lastSeq + 1 &&
                this.state.lastSeq !== -1
            ) {
                console.warn(
                    `Event sequence gap: expected ${this.state.lastSeq + 1}, got ${event.seq}`
                );
                this.requestFullState();
            }

            this.state.lastSeq = event.seq;
            this.handleEvent(event);
        });
    }

    private handleEvent(event: AgentRunEvent) {
        switch (event.type) {
            case 'run.started':
                this.state.status = 'running';
                this.state.logs.push({
                    time: now(),
                    message: '开始生成',
                    type: 'info'
                });
                break;
            case 'node.started':
                this.state.currentNode = event.nodeName;
                this.state.currentNodeLabel = event.nodeLabel;
                this.state.nodeProgress = 0;
                break;
            case 'node.progress':
                this.state.nodeProgress = event.progress;
                this.state.message = event.message;
                break;
            case 'node.completed':
                this.state.logs.push({
                    time: now(),
                    message: `${event.nodeLabel} 完成 (${event.durationMs}ms)`,
                    type: 'success'
                });
                break;
            case 'node.failed':
                this.state.logs.push({
                    time: now(),
                    message: `${event.nodeLabel} 失败: ${event.error}`,
                    type: 'error'
                });
                break;
            case 'interrupt':
                this.state.status = 'waiting_approval';
                this.state.interruptPayload = event.payload;
                break;
            case 'run.completed':
                this.state.status = 'completed';
                this.state.progress = 100;
                this.state.logs.push({
                    time: now(),
                    message: `生成完成: ${event.projectPath}`,
                    type: 'success'
                });
                break;
            case 'run.failed':
                this.state.status = 'failed';
                this.state.error = event.error;
                break;
            case 'run.cancelled':
                this.state.status = 'idle';
                this.state.logs.push({
                    time: now(),
                    message: '已取消',
                    type: 'info'
                });
                break;
            case 'llm.chunk':
                this.state.llmOutput += event.content;
                break;
        }
        this.notify();
    }

    private async requestFullState() {
        const state = await window.electron.ipcRenderer.invoke(
            'video-agent:request-full-state'
        );
        // 用返回的 state 重置 this.state
    }

    private notify() {
        this.listeners.forEach((l) => l());
    }
}
```

---

## 8. 模块划分

### 8.1 新增

- `packages/video-agent/src/events/event-emitter.ts` —— `AgentRunEventEmitter`
- `packages/video-agent/src/events/agent-run-event.ts` —— 13 种事件 Zod union
- `apps/desktop/renderer/hooks/useVideoAgent.ts` —— 前端 store
- `apps/desktop/shared/video-agent-event.ts` —— renderer 端的 IPC 类型(与 main 端区分)

### 8.2 修改

- `apps/desktop/shared/ipc.ts` —— 加 `VIDEO_AGENT_REQUEST_FULL_STATE` channel
- `apps/desktop/client/main.ts` —— 注册 handler,接 `request-full-state`
- `apps/desktop/client/preload.ts` —— wire onEvent + 暴露 requestFullState
- `apps/desktop/renderer/pages/create-screen.tsx` —— 用 useVideoAgent 替代占位 UI

---

## 9. 测试矩阵

| 测试                                       | 覆盖                                               |
| ------------------------------------------ | -------------------------------------------------- |
| `event-emitter.test.ts:sequence`           | 连续 emit,seq 0/1/2/3/...                          |
| `event-emitter.test.ts:multi-run`          | 2 个 run 并发,seq 各自独立                         |
| `event-emitter.test.ts:gap-detect`         | 前端检测 seq 跳号,触发 requestFullState            |
| `event-emitter.test.ts:request-full-state` | 主进程返回完整 state,前端重置                      |
| `event-emitter.test.ts:cancel-abort`       | AbortController.abort() 触发 emit('run.cancelled') |
| `event-emitter.test.ts:cancel-ffmpeg`      | ffmpeg 进程被 kill,临时文件清理                    |
| `event-emitter.test.ts:interrupt-resume`   | scene_approval interrupt → emit → 批 → resume      |
| `event-emitter.test.ts:llm-stream`         | llm.chunk 流式拼接,llm.completed 触发              |

---

## 10. 风险

1. **MemorySaver 丢事件**:进程重启后 state 丢失,前端 seq 跳号也无法补救。本阶段可接受。
2. **AbortController 跨进程**:LLM 调用通过 fetch,支持 AbortController;但 ffmpeg 进程是子进程,kill 信号要 SIGTERM 而非默认 SIGKILL(允许清理)。
3. **序号 gap 误判**:网络延迟可能导致事件乱序到达,前端要按 timestamp 排序后再合并。
4. **requestFullState 性能**:state 50KB,IPC 同步调用没问题;但 checkpoint 序列化本身要 10ms,频繁调用会卡 UI。
5. **取消与中断的区别**:cancel 是用户主动,interrupt 是 LangGraph 暂停等待输入,UI 上要区分("等待审批" vs "已取消")。

---

## 11. 引用清单

- **LangGraph interrupt** — https://langchain-ai.github.io/langgraphjs/how-tos/human_in_the_loop/
- **AbortController** — https://developer.mozilla.org/en-US/docs/Web/API/AbortController
- **Node.js fetch + AbortSignal** — https://nodejs.org/api/globals.html#abortsignal
- **EventEmitter** — https://nodejs.org/api/events.html
- **plan §4 事件流** — `docs/plan-2.0-langgraph.md`
- **智能体工作流** — `docs/agent-workflow.md`
- **局部重生成** — `docs/scene-regeneration.md`
