# 分镜局部重生成设计

> 截图描述:**为什么需要局部重生成:AI 一次性生成的结果很难 100% 符合用户预期,常见情况是大部分分镜都满意,只有某一个分镜的画面不对,或者某一句配音的语气不好。如果每次不满意都要从头重新生成整个视频,不仅要等很久,还会浪费大量 LLM token 和 TTS 调用费用,而且之前满意的部分也会被改掉,用户体验很差。所以我们需要细粒度的局部重生成功能:用户可以单独修改某一个分镜的文案、单独重新生成某一个分镜的画面、单独重新生成某一句配音,其他已经满意的部分完全保持不变。这是 AI 生成类产品核心体验优化。**

---

## 1. 目标

提供 3 种细粒度的局部重生成入口,**只重跑变更部分,保留其他不变**,降低重生成成本。

| 粒度         | 触发场景                                         | 重跑范围                                                               | 耗时    |
| ------------ | ------------------------------------------------ | ---------------------------------------------------------------------- | ------- |
| 单分镜重生成 | 用户改了一个分镜的 narration / visualBrief       | LLM 改写 1 个 scene + matchAssets + synthesizeVoice + assembleTimeline | 5-10 秒 |
| 单句配音重生 | 用户改了一个分镜的 narration 文本,只想重配这一句 | synthesizeVoice 1 次(命中缓存可跳过)                                   | 1-2 秒  |
| 文案编辑     | 用户直接在 UI 改了 narration 文本                | synthesizeVoice 1 次(若 text 变了)                                     | 1-2 秒  |

**核心思想**:增量更新,而不是增量重跑整张图。

---

## 2. 完整流程图

```
[分镜审批页]
   ↓
用户操作:4 个按钮
   ├─ "重新生成该分镜"(全重)
   ├─ "重新生成配音"(只 TTS)
   ├─ "编辑分镜文案"(手改 narration)
   └─ "确认所有分镜满意"(全部 commit)
   ↓
   ↓ 任选一个操作
   ↓
[主进程对应 handler]
   ├─ regenerateScene → 增量更新 state.scenes[i] + 重跑 match + TTS + assemble
   ├─ regenerateVoice → 只重跑 synthesize_voice
   ├─ editSceneNarration → 更新 narration + 重跑 synthesize_voice(若文本变)
   └─ approveAll → emit run.completed
   ↓
[emit progress 事件]
   ↓
[前端 useVideoAgent 接收 → 更新 UI]
```

---

## 3. 单分镜重生成(全重)

### 3.1 入口

renderer: `miaomaAPI.videoAgent.regenerateScene({ runId, sceneId, feedback })`

### 3.2 主进程 handler

```ts
// apps/desktop/client/video-agent-scene-regeneration.ts
export const regenerateScene = async ({
    projectId,
    sceneId,
    feedback,
    state,
    tools,
    emit
}: RegenerateSceneInput): Promise<VideoCreationState> => {
    // 1. 找到要修改的分镜,校验存在
    const sceneIndex = state.scenes.findIndex((s) => s.id === sceneId);
    if (sceneIndex === -1) throw new Error('要修改的分镜不存在');
    const originalScene = state.scenes[sceneIndex];

    emit({
        type: 'node.started',
        nodeName: 'regenerate_scene',
        runId: state.runId
    });
    emit({
        type: 'node.progress',
        nodeName: 'regenerate_scene',
        message: '正在重新生成分镜...'
    });

    // 2. 重新调用 LLM 改写该分镜(用 feedback 引导)
    const newScene = await tools.rewriteScene({
        originalScene,
        feedback,
        context: {
            brief: state.brief,
            otherScenes: state.scenes.filter((_, i) => i !== sceneIndex)
        }
    });

    emit({
        type: 'node.progress',
        progress: 33,
        message: '已重新生成分镜文案'
    });

    // 3. 更新 state.scenes(只更新这一个)
    state.scenes[sceneIndex] = newScene;

    // 4. 重新匹配素材(只这一个分镜)
    state.matches[sceneIndex] = await tools.matchAssetsForScene({
        scene: newScene,
        assets: state.assets
    });

    emit({ type: 'node.progress', progress: 66, message: '已重新匹配素材' });

    // 5. 重新合成配音(只这一句,可能命中 TTS 缓存)
    state.voices[sceneIndex] = await tools.synthesizeVoiceForScene({
        scene: newScene,
        voiceConfig: state.input.voiceConfig
    });

    emit({ type: 'node.progress', progress: 90, message: '已重新合成配音' });

    // 6. 重新组装时间线(整条,但只受这一个 scene 影响)
    state.project = await tools.assembleTimeline({ ...state });

    // 7. 落盘
    await tools.saveProject({ project: state.project, projectId });

    emit({ type: 'node.progress', progress: 100, message: '重新生成分镜完成' });
    emit({
        type: 'node.completed',
        nodeName: 'regenerate_scene',
        runId: state.runId
    });

    return state;
};
```

### 3.3 LLM rewrite prompt

```ts
async function rewriteScene({
    originalScene,
    feedback,
    context
}: RewriteSceneInput): Promise<PlannedScene> {
    const prompt = `你是视频分镜改写助手。

## 原始分镜
narration: ${originalScene.narration}
visualBrief: ${originalScene.visualBrief}
startMs: ${originalScene.startMs}
endMs: ${originalScene.endMs}

## 其他分镜(供上下文)
${context.otherScenes.map((s) => `  - [${s.startMs}-${s.endMs}] ${s.narration}`).join('\n')}

## 用户反馈
${feedback}

## 任务
基于用户反馈,改写这个分镜。要求:
1. narration 必须仍然符合整段分镜的节奏(不要与其他分镜重复或矛盾)
2. visualBrief 要具体到画面、镜头、动作(便于素材匹配阶段执行)
3. startMs / endMs 保持不变
4. 输出严格 JSON:{ sceneId, narration, visualBrief }
5. 不要 Markdown 包裹 JSON`;

    const text = await modelProvider.generateText({
        messages: [{ role: 'user', content: prompt }]
    });
    return SceneSchema.parse(JSON.parse(text));
}
```

---

## 4. 单句配音重生(只 TTS)

### 4.1 入口

renderer: `miaomaAPI.videoAgent.regenerateVoice({ runId, sceneId })`

### 4.2 主进程 handler

```ts
// apps/desktop/client/video-agent-voice-regeneration.ts
export const regenerateVoice = async ({
    projectId,
    sceneId,
    state,
    tools,
    emit
}: RegenerateVoiceInput): Promise<VideoCreationState> => {
    // 1. 找到分镜
    const sceneIndex = state.scenes.findIndex((s) => s.id === sceneId);
    if (sceneIndex === -1) throw new Error('分镜不存在');
    const scene = state.scenes[sceneIndex];

    emit({ type: 'voice.regeneration.started', runId: state.runId, sceneId });

    // 2. 重新调 TTS(text 不变,可能命中缓存!)
    const voice = await tools.synthesizeVoiceForScene({
        scene,
        voiceConfig: state.input.voiceConfig
    });

    state.voices[sceneIndex] = voice;

    emit({
        type: 'voice.regeneration.progress',
        current: 1,
        total: 1,
        percent: 100
    });

    // 3. 重新组装时间线(只替换 mp3 文件)
    state.project = await tools.assembleTimeline({ ...state });

    // 4. 落盘
    await tools.saveProject({ project: state.project, projectId });

    emit({ type: 'voice.regeneration.completed', runId: state.runId, sceneId });

    return state;
};
```

### 4.3 缓存命中场景

- 用户已经改过 narration 跑过一次 TTS → 缓存有
- 用户点了"重新生成配音"(没改 narration) → **缓存命中**,实际 TTS 调用 0 次
- 用户改 narration 后再点 → **缓存失效**,重新调一次

---

## 5. 文案编辑(用户手改)

### 5.1 入口

renderer 直接更新 `state.scenes[i].narration`,**不调 LLM**,只跑后续步骤:

```ts
// 触发:用户在 SceneApprovalDialog 里直接修改文本框
async function handleNarrationEdit(sceneId: string, newNarration: string) {
    const sceneIndex = state.scenes.findIndex((s) => s.id === sceneId);
    const scene = state.scenes[sceneIndex];

    // 1. 更新 narration(LLM 不参与)
    scene.narration = newNarration;

    // 2. 重新跑 TTS(若 narration 真变了)
    if (scene.narration !== originalNarration) {
        state.voices[sceneIndex] = await tools.synthesizeVoiceForScene({
            scene,
            voiceConfig
        });
    }

    // 3. 重新组装 + 落盘
    state.project = await tools.assembleTimeline({ ...state });
    await tools.saveProject({ project: state.project, projectId });
}
```

---

## 6. 增量更新原理

### 6.1 为什么"不重跑整张图"

每次整张图重跑的成本:

- LLM 调 4 次(brief / planScenes / matchAssets / synthesizeVoice × N)
- TTS 调 6 次(每个 scene 一段)
- ffmpeg 重跑拼接 ~ 3-5 秒
- **总计**:~30-60 秒 + 大量 token/费用

### 6.2 局部重生的成本

- 重生一个分镜:**5-10 秒**(改写 + 重 match + 重 TTS + 重组装)
- 只重 TTS:**1-2 秒**(若命中缓存 < 100ms)
- 编辑文案:**1-2 秒**

**节省 80-95% 时间**。

### 6.3 副作用处理

| 操作       | 副作用                                       | 处理                         |
| ---------- | -------------------------------------------- | ---------------------------- |
| 单分镜重   | state.scenes[i] / matches[i] / voices[i] 变  | 同步更新 + 落盘              |
| 单句配音重 | state.voices[i] 变 + project.tracks 替换 mp3 | assembleTimeline 重跑 + 落盘 |
| 文案编辑   | scene.narration 变 + voices[i] 重            | 同步更新 + 落盘              |
| 全部通过   | 不变                                         | 只 emit 事件,不重算          |

---

## 7. 与 LangGraph checkpoint 配合

### 7.1 regenerateScene 后更新 checkpoint

```ts
async function regenerateSceneWithCheckpoint(...) {
  // 1. 加载当前 state
  let state = await checkpointer.get(threadId);

  // 2. 执行增量更新
  state = await regenerateScene({ ..., state });

  // 3. 写回 checkpoint(下次 LangGraph 内部 invoke 也用这个 state)
  await checkpointer.put(threadId, state);
}
```

**好处**:用户多次 regenerate 后,checkpoint 始终是最新的,LangGraph 重新 invoke 时不会用旧 state。

### 7.2 与主流程的关系

```
[LangGraph 主流程: scan → analyze → brief → plan → approval → match → voice → assemble → save]
   ↓
[用户批准后,主流程完成]
   ↓
[用户进入"局部重生成"模式]
   ↓
[不再走 LangGraph,而是直接调 scene-regeneration / voice-regeneration 工具函数]
   ↓
[所有更新直接写到 checkpointer,确保状态一致]
```

---

## 8. UI 入口设计

```
分镜审批页 SceneApprovalDialog
   ├─ 卡片 1 [分镜 1 内容...] [编辑按钮] [重新生成配音] [重新生成分镜]
   ├─ 卡片 2 [分镜 2 内容...] [...]
   ├─ 卡片 3 [...]
   ├─ 卡片 4 [...]
   ├─ 卡片 5 [...]
   ├─ 卡片 6 [...]
   └─ 底部 [全部确认满意] [取消]
```

每个卡片 3 个操作:

- **编辑文案**:内联 textarea 改 narration,失焦自动保存
- **重新生成配音**:只重 TTS 这一句
- **重新生成分镜**:全重(LLM 改 + match + TTS + assemble)

---

## 9. 模块划分

### 9.1 新增

- `packages/video-agent/src/graph/scene-regeneration.ts` —— `regenerateScene / regenerateVoice / editSceneNarration` 纯函数
- `apps/desktop/client/video-agent-scene-regeneration.ts` —— 主进程 controller 集成
- `apps/desktop/client/video-agent-voice-regeneration.ts` —— 同上
- `apps/desktop/client/video-agent-narration-edit.ts` —— 同上

### 9.2 修改

- `apps/desktop/shared/ipc.ts` —— `VIDEO_AGENT_REGENERATE_SCENE / REGENERATE_VOICES` handler 接通(commit 4 已声明)
- `apps/desktop/renderer/components/SceneApprovalDialog.tsx` —— 加 3 个按钮 + 编辑态

---

## 10. 测试矩阵

| 测试                                                | 覆盖                                                       |
| --------------------------------------------------- | ---------------------------------------------------------- |
| `scene-regeneration.test.ts:regenerate-one-scene`   | 修改 scenes[2] 后,只 scenes[2] / matches[2] / voices[2] 变 |
| `scene-regeneration.test.ts:other-scenes-untouched` | scenes[0,1,3,4,5] 完全不变                                 |
| `scene-regeneration.test.ts:voice-cache-hit`        | narration 不变 → 缓存命中,TTS 0 调用                       |
| `scene-regeneration.test.ts:voice-cache-miss`       | narration 变 → 缓存失效,TTS 1 调用                         |
| `scene-regeneration.test.ts:invalid-scene-id`       | sceneId 不存在 → 抛错                                      |
| `scene-regeneration.test.ts:checkpoint-updated`     | regenerate 后 checkpointer state 更新                      |
| `scene-regeneration.test.ts:narration-edit-cascade` | 改 narration 后触发 TTS + assemble                         |
| `scene-regeneration.test.ts:all-confirmed`          | 全部确认满意 → emit run.completed,不重算                   |

---

## 11. 风险

1. **state 一致性**:多次 regenerate 后 state 可能乱序更新,需要 serial 更新(每次 await 上一次完成才能开始下一次)。
2. **并发点击**:用户同时点两个"重新生成分镜",需要前端去抖 / 主进程锁。
3. **TTS 缓存失效边界**:用户改了文案哪怕一个字,hash 都变,缓存失效。要评估是否值得引入"模糊匹配"。
4. **assembleTimeline 整条重跑**:即使只改 1 个 scene,也要重跑整个 timeline 拼接。Plan §3 提到的"incremental assemble"留到 Phase 5。
5. **checkpoint 写冲突**:regenerate 时 LangGraph 可能在跑(虽然概率低),需要互斥锁。

---

## 12. 引用清单

- **plan §3 局部重生成动机** — `docs/plan-2.0-langgraph.md`
- **流式 TTS 缓存** — `docs/streaming-tts.md`
- **拼接 + 字幕** — `docs/assemble-and-subtitle.md`
- **LangGraph Checkpoint** — `docs/agent-workflow.md`
- **长时任务事件流** — `docs/long-task-event-stream.md`
