# WiseCut(智剪)面试准备手册

> 适用岗位:前端 / Electron 桌面端 / AI Agent 应用开发
> 核心原则:面试官想听到的是「**你做过什么决策、为什么、遇到什么坑、怎么验证**」,而不是罗列技术名词。

---

## 0. 一句话定位(先背熟)

> **WiseCut 是一个本地桌面端 AI 剪辑工具:用户输入一段文字(选题或口播稿),一个由 LangGraph 编排的 Agent 流水线自动完成「选题 → 分镜 → 素材匹配 → 配音 → 字幕 → 合成」,产出可发布的成片。全过程数据不出端,用户可以在关键节点干预。**

三个关键定语(面试官最容易被勾住的点):

1. **不是"调 API 生成视频"的 demo** —— 是主进程 + 渲染层 + 本地 FFmpeg 的完整桌面产品,Agent 只是其中一层。
2. **Agent 不是"顺序调几次 LLM"** —— 是有状态的状态机:human-in-the-loop、断点续跑、reject 反馈回路。
3. **Agent 真的"看"素材** —— 多模态理解结果喂给分镜规划,不是凭空写脚本。

---

## 1. 90 秒项目讲述(勾起兴趣版)

> 讲的时候注意节奏:先抛结果 → 再讲一个具体行为 → 最后落到工程深度。

**开场(10s)**:我做了一个叫 WiseCut 的桌面端 AI 剪辑工具,输入一段文字就能出一条带配音、字幕、素材的成片。技术栈是 Electron + React + LangGraph + 本地 FFmpeg,Monorepo 结构。

**钩子一 · 用户不是旁观者(30s)**:市面上很多"文字生成视频"是黑盒,我们的 Agent 跑完分镜规划后会**停下来等用户确认**——LangGraph 的 `interrupt()` 挂起执行,把分镜方案推到前端;用户可以直接批准,也可以**打回并附一句反馈**,Agent 会跳回 `plan_scenes` 节点按反馈重新拆分镜(`Command({ goto })`),而不是从头重跑。

**钩子二 · 跑一半关掉 App 也能接着跑(20s)**:LangGraph 的 checkpoint 用 `SqliteSaver` 落盘到 `checkpoints.db`;App 崩溃、重启后,用同一个 `thread_id` resume,从断点继续。多模态理解结果也单独持久化,重启后热加载回内存,**不会重复调用 LLM 烧 token**。

**钩子三 · Agent 真的看过素材(20s)**:扫描素材时 ffmpeg 抽帧,用户选代表帧,多模态模型描述画面内容(氛围/物体/动作/建议分镜类型),结果直接喂给分镜节点——所以它写的分镜是**落到具体素材画面**上的,不是凭空编。

**落点 · 工程深度(10s)**:这些只是功能面。真正花功夫的是边界处理——LLM 调用按错误类型分类重试、事件流单调序列化防乱序、内存治理防长跑 OOM、API Key 用 Electron safeStorage 加密、媒体文件走自定义 `media://` 协议而不是裸文件路径。如果面试官有兴趣,我可以展开讲任何一个。

---

## 1.5 简历逐条核对表(面试风险地图)⚠️ 先看这里

> 面试官一定会**顺着简历逐条深挖**。下表把简历每条 claim 对照仓库代码核实,标注风险等级。**红色条目必须改,否则一问就崩。**

| 简历 claim | 代码证据 | 核实 | 风险 |
|---|---|---|---|
| 技术栈 TS/Electron/React19/LangGraph.js/FFmpeg/Zod/Forge/pnpm | 仓库全对得上 | ✅ 属实 | 无 |
| 垂类智能体,自然语言一键生成短视频 | 10 节点 graph 流水线 | ✅ 属实 | 无 |
| 混合云架构(在线+本地) | `VolcengineTtsProvider`(seed-tts)+ `IndexTts2Provider` + `RoutingTtsProvider` 分流 | ✅ 属实 | 低,但会被追问 Routing 规则和降级 |
| 本地零样本音色克隆 | IndexTTS2(本地 Gradio 服务,`http://127.0.0.1:7860`)+ custom-voice-library 参考音频 | ✅ 属实 | 低,追问:本地服务怎么启、不可用怎么办 |
| 四层架构(界面/智能体/音视频/桌面底层) | renderer / packages/video-agent / video-export-ffmpeg / client+main | ✅ 划分合理 | 无 |
| Zod 全链路数据校验 | video-project schema、load-agent-env、三个 prompt 全用 zod | ✅ 属实 | 无 |
| **格式错误率降低 90% 以上** | 校验机制存在,但**仓库里没有任何基线数据/度量** | ⚠️ 数字存疑 | 🔴 高危:被问"怎么测出 90%"就崩 |
| Checkpoint 断点续跑,保留中间状态 | SqliteSaver → checkpoints.db,resume 带 thread_id | ✅ 属实 | 无 |
| 类型安全 FFmpeg 命令构建器 | `createVideoExportFfmpegCommand` 纯函数,返回 args + filterComplex | ✅ 属实 | 无 |
| atempo/PTS/Windows 转义/字体跨平台 | video-export-ffmpeg.ts 全部有实现 | ✅ 属实 | 无 |
| stderr 进度解析 + 百分比/剩余时间 | `out_time_us` / `time=` 解析 → percent;`ExportProgressDialog` 已实现「预计剩余」ETA(EMA 平滑) | ✅ 属实(已实现) | 无 |
| **AbortController 全链路取消** | 导出链路 AbortController + SIGTERM;**Agent 图已实现**:每 run 一个 AbortController,`cancel` → abort → LangGraph invoke 抛 AbortError → 'cancelled' 终态(不误报 failed) | ✅ 已实现 | 低,追问见 Q12/Q35 |
| 自动清理临时文件,不残留僵尸进程 | `mkdtemp` + finally `rm` + `child.kill('SIGTERM')` + before-quit 兜底 | ✅ 属实(导出链路) | 无 |
| **基于内容哈希的语音缓存 + LRU 淘汰** | **已实现**:`TtsCacheProvider`(sha256 内容键 + LRU 128 条 + manifest 落盘恢复 + 并发去重 + 孤儿清理),包在云端 Volcengine 外层 | ✅ 已实现(仅云端) | 低,追问见 Q33 |
| Vibe Coding + Spec Driven 混合流程 | docs/superpowers 下有 plan/spec 文档,README 有 roadmap | ✅ 属实 | 无,但要说清怎么平衡 |

> **实现状态说明**:「语音缓存 + LRU」「导出剩余时间」「Agent 图 AbortController 取消」三条已在本仓库实现(2025,含单测),面试时可以大胆讲,但注意细节——语音缓存**只包云端 TTS**(本地 IndexTTS2 零成本且依赖参考音频,不做缓存,见 Q33);「格式错误率 90%」依然没有基线数据,别给数字。

### 三条红色 claim 的改写建议(照抄进简历)

1. **「内容哈希语音缓存 + LRU + 10 倍提速」→ 删除,换成真实存在的能力:**
   > 「多模态理解结果按 `(run_id, asset_id)` 持久化并启动热加载,相同素材不重复调用多模态模型,节省 token 与等待时间。」
   > (这是代码里真实存在的:agent.sqlite 的 `asset_understandings` 表 + `ON CONFLICT DO UPDATE` + 未终态 run 热加载。)
   > 如果想留"缓存"这个词,就说「素材理解结果缓存复用」,别说是语音、别说是 LRU、别提 10 倍。

2. **「格式错误率降低 90% 以上」→ 去掉数字,讲机制:**
   > 「所有 LLM 结构化输出在 provider 层用 Zod 解析即校验,工程产物另有完整 schema 双重复核,非法输出在进入下一节点前就被拦截,坏数据流不到下游。」
   > (面试官若追问数字,回答:没有做 A/B 基线度量,这是我没量化到位的地方,机制本身是拦截式的。)

3. **「AbortController 全链路取消」→ 限定范围:**
   > 「FFmpeg 导出链路实现 AbortController 全链路取消与临时文件清理;Agent 图执行采用协作式取消(runId 状态隔离 + 事件丢弃)。」
   > (诚实交代两条路径的差异,反而展示你对取消语义的理解深度,见 Q12。)

---

## 2. 系统全景(30 秒内讲清)

```
用户输入文字 + 素材目录
      ↓
Renderer (React + Vite, 4 个页面:工作区/创建/编辑器/导出)
      ↓ 类型化 IPC (contextBridge 暴露 window.miaomaAPI)
Main Process (Node + LangGraph 状态机)
      ├─ scan_assets → analyze_assets → creative_brief → plan_scenes
      ├─ scene_approval ←(interrupt 等用户确认 / reject 打回 plan_scenes)
      ├─ match_assets → synthesize_voice → assemble_timeline
      └─ validate_project → save_project → END
      ↓
本地 FFmpeg 渲染成片(字幕烧录 + BGM 叠加 + 短源自动 loop)
```

**数据边界(必答)**:三个独立存储,职责互不耦合——

| 存储 | 内容 | 归谁管 |
|---|---|---|
| `checkpoints.db` | LangGraph 图状态快照 | LangGraph SqliteSaver |
| `agent.sqlite` | run 历史 / 资产元数据 / 多模态理解 | 应用自己的 schema + DAO |
| `VideoProject` JSON | 视频工程(分镜/时间线/字幕/配音) | video-project-store |

---

## 3. Agent 架构类问题

### Q1. 为什么用 LangGraph,而不是自己写一个流程编排?
**考察点**:技术选型的理由,是否理解状态机 vs 硬编码流程的差别。
**答题要点**:
- 流程是**有环的**:`scene_approval` reject 要跳回 `plan_scenes` 重跑,不是一条直线;自研循环 + 断点恢复成本高。
- 需要**持久化执行状态**:checkpoint + resume 是 LangGraph 一等公民(`SqliteSaver`),自研要自己管序列化。
- **human-in-the-loop 原语**:`interrupt()` / `Command({ resume })` 官方支持,不用自己造挂起/恢复机制。
- 节点是**纯函数式**的(state in → update out),天然可测试、可单节点调试。
- 补充:也付出了代价——版本 API 变动大、抽象层厚,出问题要读源码;我们通过 `createInstrumentedNode` 包装器统一加事件埋点,屏蔽了部分复杂度。

### Q2. 这个图有 10 个节点,每个节点是干什么的?为什么这个顺序?
**考察点**:对业务链路和依赖关系的理解。
**答题要点**:按数据流讲一遍(见第 2 节全景),强调顺序的依赖逻辑:先看有什么素材(`scan`)→ 理解素材(`analyze`)→ 定创作基调(`brief`)→ 拆分镜(`plan`)→ **人审(interrupt)** → 素材匹配(`match`)→ 配音(`tts`)→ 拼时间线(`assemble`)→ 双重校验(`validate`)→ 落盘(`save`)。人审放在最贵/最不可逆的工作(配音、匹配)之前,是刻意的:越早让用户纠偏,浪费越少。

### Q3. 解释一下 interrupt / Command({ goto }) 这个 human-in-the-loop 是怎么实现的?
**考察点**:是否真正理解 LangGraph 的执行模型,而不只是"用过"。
**答题要点**:
- `sceneApproval` 节点调用 `interrupt<Req, Resume>({ payload: { scenes } })`:执行挂起,返回值变成 `waiting_for_approval`,事件流发出 `approval.required`。
- 前端调用 IPC `approve`,主进程用 `app.invoke(new Command({ resume: approval }), { configurable: { thread_id: runId } })` 恢复执行。
- reject 时节点返回 `new Command({ goto: 'plan_scenes', update: { sceneApprovalFeedback, scenes: [] } })`——**跳图且带 state 更新**,feedback 透传给 LLM 作为下次拆分镜的输入,`scenes` 清空避免脏数据。
- 关键细节:approved 后 `sceneApprovalFeedback` **不清空**(保留便于调试和 regenerate 复用);空反馈(trim 后为空)会省略,行为等同首次拆分镜。

### Q4. 断点续跑是怎么实现的?App 重启后数据从哪来?
**考察点**:状态持久化的完整闭环。
**答题要点**:
- 图本身:checkpoint 由 `SqliteSaver` 落到 `userData/checkpoints.db`,按 `thread_id`(即 runId)存,重启后 `invoke` 带同一 thread_id 自动恢复。
- 图之外(关键!):checkpoint 只存图状态,**不存** keyframes、用户精选帧、多模态理解这些旁路数据。我们的解法是:
  - `analyzeAsset` 的多模态结果 upsert 到 `agent.sqlite` 的 `asset_understandings` 表(`ON CONFLICT (run_id, asset_id) DO UPDATE`);
  - 控制器启动时只对**未终态**的 run 热加载 understanding 回内存——解决"等待审批期间重启 → plan_scenes 拿不到多模态输入"的 UX 漏洞。
- 诚实补充:keyframes 是 dataURL(体积大),当前只活在内存,重启后丢失;但理解结果持久化了,plan_scenes 不受影响。这是设计取舍,改进方向是把代表帧抽到磁盘文件。

### Q5. 多模态理解结果是怎么参与分镜的?
**考察点**:LLM 之间如何协作、数据如何流转。
**答题要点**:
- 链路:`scan` 时 ffmpeg 抽 N 帧 → 用户选代表帧 → `analyzeAsset` 调 `modelProvider.describeImages()` 得到 description/mood/objects/actions/suggestedSceneType/promptMatchScore → 缓存 + 持久化 → `planScenes` 工具读 `getAssetUnderstanding(runId, assetId)` 作为 LLM 上下文。
- 设计要点:**先缓存再 emit**,保证 UI 事件推过去时 plan_scenes 一定能拿到,避免 race。
- 失败降级:多模态调用失败只 console.warn + 返回失败,**不阻塞**后续节点,卡片保持原 description。
- promptMatchScore 用于给素材匹配节点提供"这个素材和创作意图匹不匹配"的先验。

### Q6. 如果用户 reject 后 feedback 传回 LLM,怎么防止 LLM 忘掉之前的上下文?
**考察点**:状态管理、上下文拼接。
**答题要点**:feedback 写进 `sceneApprovalFeedback` 字段,`planScenes` 节点重跑时把「创作标题 + 核心信息 + 用户反馈」拼进 streamReport 的 context;同时 `scenes: []` 清空旧方案,避免"新方案 + 旧方案"混杂。节点重跑时 brief、assets 等上游产物仍在 state 里,不需要重新生成。

### Q7. 为什么人审(interrupt)放在 plan_scenes 之后、match_assets 之前?
**考察点**:产品 sense + 流程设计。
**答题要点**:素材匹配和配音是最贵的两步(多模态 + TTS 调用、生成文件),先让人确认分镜方向,避免"方向错了,钱全花在错的地方"。这是经典的「在不可逆操作之前设 checkpoint」思想。

### Q8. 事件流是怎么推给前端的?怎么保证不乱序?
**考察点**:异步事件设计。
**答题要点**:
- 图节点经 `createInstrumentedNode` 包装,统一 emit `node.started/completed/failed`、`model.stream.delta`、`approval.required` 等类型化事件。
- **双序列机制**:图内事件由 `createSequencedEventEmitter` 按 run 分配单调 sequence;tools 内部 emit 的 sequence=0 事件,由 IPC 层的 `lastSequences` 统一补号——保证同 run 内单调递增。
- 渲染端按 sequence 重组 timeline,`isSameEvent`(runId+sequence+type)去重;`per-runId snapshot 缓存` 保证别的 run 的事件不会触发当前 run 的 re-render。
- 流式文本用 `model.stream.delta` 做打字机效果。

### Q9. 多个 run 并发会互相干扰吗?
**考察点**:并发隔离。
**答题要点**:所有旁路状态全部按 runId 分 Map(`runs` / `activeEmitters` / `lastSequences` / `keyframesByRunId` / `understandingByRunId`…),事件按 runId 路由,渲染端 store 也按 runId 隔离。唯一共享的是 provider 实例和 runner(无状态、惰性单例)。

---

## 4. 流程边界处理类问题

### Q10. 主进程和渲染层之间怎么通讯?为什么这么设计?
**考察点**:Electron 安全模型 + 分层。
**答题要点**:
- preload 用 `contextBridge.exposeInMainWorld('miaomaAPI', …)` 暴露**白名单 API**(fileSelect/apiConfig/customVoice/videoAgent/videoExport/videoProject),渲染层拿不到 ipcRenderer 本体。
- 通道定义在 `shared/` 目录,**主进程和渲染层共用一份类型**(channel 名 + 入参出参类型),改一处编译期全链路可见。
- invoke/handle(请求-响应)+ on/emit(事件流)两种模式:命令用 invoke,agent 进度用 onEvent 订阅。
- 事件 payload 过 IPC 会被结构化克隆,所以 dataURL 的 keyframes 可以直接传——这也是为什么 keyframes 走 IPC 内存缓存而不是落盘。

### Q11. 一个 agent run 从发起到结束,状态机在主进程怎么管理?内存怎么治理?
**考察点**:长生命周期资源的生命周期管理。
**答题要点**:
- `runWithEmitter` 把 renderer 的 emit 回调注册进 `activeEmitters`,操作结束 `finally` 里删除。
- **终态清理**:`run.completed / run.failed / run.cancelled` 时 `cleanupRunState(runId)` 删掉所有按 run 的 Map 缓存(原来 6+ 个 Map 只 set 不 delete,跑 50 个 run 内存涨 50 倍)。
- sqlite 写失败不阻塞 emit(本地持久化 best-effort,console.warn 留痕)。
- 渲染端 `agent-run-store` 用 FIFO 容量上限 `MAX_RETAINED_RUNS = 20`,超了淘汰最老 run(**当前 active 的不淘汰**);终态对话已持久化到 project 的 `ai.conversation`,丢 UI 历史不丢数据。

### Q12. 用户点取消,一个正在跑的 run 会发生什么?
**考察点**:取消语义(是否真的杀进程)。
**答题要点**:
- **图级真实中止**:每 run 一个 AbortController,`cancel` → `abort()` → LangGraph invoke(`app.invoke` 的 `signal` 配置)立即抛 AbortError,runner 返回新终态 **`'cancelled'`**(不 emit run.failed);controller 的 catch 检查 `signal.aborted` 不再补发失败事件,UI 只看到一次"已取消"。
- 事件与内存:先 emit `run.cancelled` → `cleanupRunState` 清缓存,再 abort 持引用(先拿引用再 emit,因为 cleanup 会删 map 条目)。
- **诚实边界**:在飞的那次 LLM fetch 无法撤回,会自然跑完;若它恰好抛可重试错误,provider 内部 withRetry 最多再重试 2 次(signal 没贯穿到 provider 层);**后续节点不会再启动**。这是"编排层强中止 + HTTP 层自然收敛"的务实解。
- TTS 音轨再生成是另一套:`isCancelled()` 标志轮询 + `cancelEventEmitted` 去重(真·协作取消)。
- 追问应对:若问"为什么 signal 没贯穿到 provider 的 withRetry",答:provider 是跨 run 单例,per-run signal 要穿过工具层才能注入,当前用图级 abort + 事件丢弃覆盖了用户可感知的全部路径,在飞请求的 1-2 次重试是已知的小残留,改进方向是给工具链注入 per-run signal。

### Q13. 错误处理:一个节点抛异常会怎样?
**考察点**:失败传播。
**答题要点**:节点被 `createInstrumentedNode` 包裹,异常会 emit `node.failed`(带 `serializeError` 序列化 + **secret 脱敏**——`redactSecrets` 会把 `ark-xxx` 形式的 key 替换成 `[REDACTED]`,防止 API Key 进日志/进 UI),然后 rethrow;runner 的 `failRun` 捕获后 emit `run.failed` 并返回 `{ status: 'failed', errors: [...] }`,IPC 层转成 `RUN_FAILED` 错误码。用户看到的是"哪一步挂了 + 原因",而不是白屏。

### Q14. LLM 输出可能不合法(不是 JSON、字段缺失),怎么处理?
**考察点**:LLM 输出校验。
**答题要点**:双保险——
- provider 层解析 + Zod 校验,解析失败/校验失败属于**业务错误,不重试**(重试也白搭);
- 工程输出有 `validateVideoProject` 本地 schema 校验 + 工具级校验,`validate_project` 节点里任一失败直接 throw,run 终态 failed;
- 分镜/素材匹配等结构化输出同样有类型约束,坏数据不会流到下一节点。

### Q15. API Key 存哪?怎么保证安全?
**考察点**:Electron 安全实践。
**答题要点**:
- Electron `safeStorage` 加密(底层走 macOS Keychain / Windows DPAPI),密文写 `userData/api-config.bin`,文件权限 `0o600`;
- `isEncryptionAvailable` 不可用时抛 `safe_storage_unavailable` 错误,不静默降级;
- 解密失败/JSON 损坏/版本不符 → 当作"未配置"走 onboarding,不阻塞启动;
- **弃用 .env**:main.ts 启动时从 store 读,注入 `process.env.API_KEY`,UI 里改了立即更新 env,不用重启 App;
- 其他常量(BASE_URL/LLM_MODEL/TTS_MODEL)直接 hardcode 在 main.ts,用户不可改,减少配置面。

### Q16. 本地媒体文件怎么给渲染层播放?为什么不直接 file:// ?
**考察点**:Electron 自定义协议 + 安全边界。
**答题要点**:
- 注册自定义 `media://` 协议(`registerSchemesAsPrivileged`,开 secure/standard/stream/supportFetchAPI);
- URL 是结构化的 `media://assets/{projectId}/{kind}/{assetId}`,handler **不直接读任意路径**,而是通过 project store 查出该项目下该资产的真实路径再 `net.fetch(pathToFileURL(...))` 回传——项目查不到返回 404;
- 好处:规避 `file://` 在 Chromium 里的安全限制和 CORS 问题,同时路径解析收口在受控代码里,不是任意文件读取。自定义音色预览走同协议的另一分支,voiceId 经 resolver 解析。

---

## 5. 边界情况 / 鲁棒性类问题

### Q17. LLM 调用失败(5xx/429/网络抖动)怎么处理?
**考察点**:重试策略设计。
**答题要点**:
- `withRetry` 统一包装:**指数退避 `500ms * 2^n` + 随机抖动**(防 thundering herd);
- **错误分类**:只重试网络错误(ECONNRESET/ETIMEDOUT/fetch failed)、5xx、429;**不重试**其他 4xx、JSON 解析失败、Zod 校验失败——这些重试也白搭;
- 默认最多 2 次重试(共 3 次尝试),全部参数可注入(`shouldRetry` / `random` / `sleep` / `onRetry`),单测用注入的假 sleep 覆盖,不真睡;
- `onRetry` 可上报 metric 或实现全局取消。

### Q18. 源视频比分镜短(5s 源 + 8s 分镜)怎么办?
**考察点**:预览与导出语义一致性。
**答题要点**:
- 导出:ffmpeg 加 `-stream_loop -1` 让源无限循环,`setpts` 偏移到 sourceStartSec,外层 `trim=duration` 截到分镜时长——循环出来的是**真实运动画面**,不是复制最后一帧;
- 预览:HTML5 `<video>` 的 loop 属性,语义一致;
- 不 loop 的场景用 `tpad=stop_mode=clone` 补冻结帧;
- 关键陷阱(踩过的坑):loop 输入**不能**用 `trim=end=sourceEndSec`,那会在第一轮循环就截断;要跳过 source 偏移 + 让外层 trim 控制总时长。两条路径语义对齐,不会出现"导出的正常、编辑器卡最后一帧"。

### Q19. 一个 run 的完整生命周期里,哪些状态存在内存、哪些在磁盘?
**考察点**:对状态持久化的全局理解(面试高频)。
**答题要点**:
- 磁盘:checkpoint(图状态)、agent_runs 表(run 元数据)、asset_understandings(多模态)、VideoProject(工程)、voices(TTS 音频文件)、api-config.bin(密钥)。
- 内存:keyframes(dataURL)、selectedFrames(用户精选)、understanding 热加载缓存、activeEmitters、sequence 计数器。
- 原则:**可重算的不持久化**(keyframes 可重新抽帧),**贵的结果必须持久化**(多模态理解要省钱省时间),**敏感信息加密持久化**。

### Q20. 用户没选任何素材 / 只传了单个文件 / 目录是空的,会怎样?
**考察点**:输入边界。
**答题要点**:IPC 入口统一 `normalizeStartInput`(trim、filter(Boolean)、补 voice 设置默认值),`start` 校验「有目录或文件 + 有 prompt」否则返回 `VALIDATION_FAILED`;`scan_assets` 同时支持目录和文件列表,`sourceFilePaths` 优先于目录。

### Q21. 字幕/歌词/路径里有特殊字符(引号、中文、盘符)怎么办?
**考察点**:ffmpeg filter 转义(很容易翻车)。
**答题要点**:filter_complex 是字符串拼接,风险高——
- 字幕路径 `escapeSubtitleFilterPath`:`\`→`/`、盘符 `C:`→`C\:`、`'`→`\'`;
- 颜色 hex→ASS `&H00BBGGRR` 格式转换,非法 hex 回退默认;
- 字体按平台选(Mac PingFang SC / Win Microsoft YaHei),描边宽度按字号分档;
- 播放速度 clamp 到 [0.5, 2](atempo 的合法区间),防止用户输入 0 倍速/10 倍速生成坏视频。

### Q22. 导出的总时长怎么算?会不会音频比视频长?
**考察点**:时间线语义。
**答题要点**:`resolveVideoExportDurationMs` = max(所有 scene 时长之和, 非音乐轨所有 clip 的 endMs 最大值),兜底 canvas.durationMs;视频轨空隙用 `color=black` 补黑场,音轨空隙用 `anullsrc` 静音补,concat 后 `amix` 归一;最后 `-t` 强制总时长,防止 BGM/旁白溢出。

### Q23. App 升级/退出时,SQLite 连接和 ffmpeg 子进程怎么处理?
**考察点**:进程生命周期。
**答题要点**:`app.on('before-quit')` 里**先** `cancelActiveVideoExport()`(abort 是同步的,杀掉 ffmpeg 子进程防止残留)再显式 `close()` sqlite 连接,不依赖 GC;选 before-quit 而非 will-quit,给异步操作完成窗口。sqlite 用 `node:sqlite`/better-sqlite3 同步句柄,OS 退出也会回收,显式 close 是防止热重载/升级时文件锁。

---

## 6. Electron 桌面端类问题

### Q24. 你的 Electron 应用三层(preload/main/renderer)各自职责?
**考察点**:Electron 安全模型基本功。
**答题要点**:main = Node 侧全部能力(agent 编排、ffmpeg、sqlite、safeStorage、文件系统);renderer = 纯 UI(React + zustand,无 Node 能力);preload = 唯一桥梁,`contextBridge` 白名单暴露 API,**不暴露 ipcRenderer 本体**(防 renderer 被 XSS 后直接调任意 IPC)。所有 IPC handler 侧也做输入 normalize + 校验,不只信任前端。

### Q25. 开发态和生产态的资源加载怎么切换?
**考察点**:Electron + Vite 打包细节。
**答题要点**:`MAIN_WINDOW_VITE_DEV_SERVER_URL` 存在时 `loadURL` 开发服务器,否则 `loadFile` 打包产物;`resolveVideoExportBinaries` 用 `app.isPackaged` + `process.resourcesPath` 区分开发/打包环境找 ffmpeg/ffprobe 二进制;打包后媒体资源路径也走 `resourcesPath`。

### Q26. 踩过哪些 Electron 相关的坑?
**考察点**:真实经验(加分题,一定要准备)。
**答题要点**:
1. **Vite tree-shaking 吃掉 IPC 注册**:之前 `await import()` + `void` 包装注册 handler,被 tree-shake 掉导致 renderer 报 "No handler registered"——改**静态 import + 同步注册**;
2. **`nodeLinker: hoisted` 不能改**:isolated 模式下主进程 `require('electron')` 拿到的是 npm 包字符串而不是 runtime 注入的 API;
3. **safeStorage 不是所有环境都可用**(Linux 无 keychain 时 `isEncryptionAvailable()` 为 false),要做显式检测和降级文案;
4. **ffmpeg 77MB 跟仓库走**(GitHub 100MB 限额内),计划拆 `extraResources` 瘦身——大二进制进 git 是仓库卫生问题;
5. **Windows 打包用 Squirrel**(electron-forge maker),启动时 `electron-squirrel-startup` 先判断,否则安装/卸载事件会误开主窗口;
6. **getStatus 必须实时读 store**:如果读启动时的闭包,用户运行中改 key 后 UI 显示"没保存"(stale data)。

### Q27. 自定义协议注册为什么要 `registerSchemesAsPrivileged`?
**考察点**:Electron 协议安全模型。
**答题要点**:privileges 要在 `app.whenReady` 之前(模块顶层)注册;我们开了 secure/standard/stream/supportFetchAPI——secure 让该 scheme 被视为安全上下文(能跑 fetch/媒体 API),stream 支持渐进式流式响应(视频播放不卡),standard 让它能参与 URL 解析标准。

### Q28. 多平台(macOS/Windows)差异处理了哪些?
**答题点**:路径(`app.getPath('userData')` 平台自动差异,不用硬编码)、字体选择、ffmpeg 二进制按平台分目录(`bin/darwin` vs `bin/win32`)、`window-all-closed` 时 macOS 不退出(符合平台习惯)、Squirrel 安装事件、Windows 字幕路径转义(盘符)。

### Q29. 为什么不把 agent 跑在远程服务,而是本地主进程?
**考察点**:架构取舍。
**答题要点**:数据不出端是卖点(素材可能敏感);本地 ffmpeg 渲染便宜;主进程有完整 Node 能力(文件系统/sqlite/safeStorage)。代价是打包体积、平台分发成本、用户机器性能要求。未来若要做账号/云渲染,架构上 agent 编排层已从 UI 解耦(IPC 接口形态),可以替换成远程 runner。

---

## 7. 工程化与测试类问题

### Q30. 测试怎么写的?难测的地方怎么测?
**考察点**:测试理念(可测试性设计)。
**答题要点**:
- 全链路测试:LangGraph `start → interrupt → resume → 完成` + `reject → 重跑 → 再 interrupt`,覆盖最核心的人机交互路径;
- **依赖注入是核心手段**:withRetry 注入假 sleep/random,不用真睡;api-config-store 注入 fake safeStorage,不用启 Electron;checkpointer 不传 dbPath 自动降级 MemorySaver;
- 当前 `video-agent` 64/64 用例通过;IPC 控制器 7 个 channel 的集成测试在路线图里(目前 0 测,诚实说明)。

### Q31. commit 规范为什么这么严?
**考察点**:团队工程习惯。
**答题要点**:commitlint 强制 conventional commits,scope 白名单限定 9 个(agent/desktop/editor/electron/export/project/renderer/tts/workspace);subject-case 强制小写;husky pre-commit 只对 staged 文件跑 prettier(刻意不引入 lint-staged 依赖);TSC 0 错是硬验收。

### Q32. 为什么拆成 packages/video-agent 和 packages/video-project?
**考察点**:Monorepo 分层。
**答题要点**:`video-agent` = 纯 AI 编排(图/节点/provider/重试/事件),不依赖 Electron;`video-project` = 工程数据 schema + 校验;`apps/desktop` = Electron 壳 + IPC + 渲染层。**核心收益:video-agent 可以在纯 Node 环境单测**(不需要 Electron),且未来换壳(CLI/Web)时编排层直接复用。

---

## 7.5 简历专项追问(简历写了什么,这里就会问什么)

### Q33. TTS 混合云架构怎么设计的?为什么「在线 + 本地」两套?
**考察点**:架构抽象、隐私与成本的权衡。
**答题要点**:
- 统一抽象:`TtsProvider` 接口(`synthesizeVoice(input) → 结果`),所有 provider 带 `providerName`,厂商无关;测试可注入 fake provider;
- `RoutingTtsProvider` 分流:**自定义音色**(voiceId 带 `custom:index-tts2:` 前缀)走本地 IndexTTS2,**默认音色**走火山 seed-tts;
- 为什么分流:在线保证音质和并发;自定义音色是用户隐私资产——参考音频**不能上传云端**,只能本地零样本克隆;
- 代价与降级:本地依赖 Gradio 服务(`http://127.0.0.1:7860`),有 `checkIndexTts2` 探活;服务不可用时要有失败路径和 UI 提示。

### Q34. 零样本音色克隆的链路是怎么样的?
**考察点**:功能闭环 + 边界。
**答题要点**:
- custom-voice-library 管理参考音频文件(用户上传/录制),`resolveReferencePath(voiceId)` 解析到本地路径;
- IndexTTS2 是零样本 TTS 模型——**几秒参考音频就能克隆音色**,不需要训练;
- `IndexTts2Provider` 把参考音频 + 文本发到本地 Gradio 接口合成,结果落盘为 voice asset;
- 预览走 `media://` 协议的自定义分支(`parseCustomVoicePreviewUrl`),跟工程媒体同协议、同安全模型;
- 音色在 project 里以 `voiceType` 引用,导出时经 provider 再合成。

### Q35. FFmpeg 进度解析和取消具体怎么实现的?
**考察点**:子进程管理细节(很容易翻车,答出来很加分)。
**答题要点**:
- 进度:`-progress pipe:2` 走 stderr,解析 `out_time_us`(优先)/ `time=HH:MM:SS.mmm` 转 ms,除以**预估总时长**(`resolveVideoExportDurationMs`,先算好进度才准)得 percent,clamp 到 0-100;
- 取消:`AbortSignal` 监听 abort → `child.kill('SIGTERM')`;Windows 下 libuv 把 kill 映射成 TerminateProcess,而 ffmpeg 不派生子进程,单杀即可、**没有孤儿风险**;
- 防误判:`close` 事件里**先判 `signal?.aborted` 再判 exit code**——否则用户取消时 ffmpeg 退出码非 0,会被误报成"导出失败",注释里专门写了"Killed stderr 误判成用户取消"这个坑;
- 清理:`mkdtemp` 建临时目录(字幕 srt 等),finally 里 `rm`;主进程 `before-quit` 还会 `cancelActiveVideoExport()` 兜底杀进程,退出不留残留。

### Q36. Zod 校验怎么落地?怎么系统化防 LLM 输出不稳定?
**考察点**:LLM 应用的关键工程问题。
**答题要点**:
- **入口层**:所有 LLM 结构化输出(creative-brief / scene-planner / asset-matcher)都是 zod schema,provider 解析即校验,失败抛业务错误;
- **出口层**:`VideoProject` 有完整 zod schema + `validateVideoProject`,`validate_project` 节点双重校验(本地 schema + 工具校验),任一失败直接 throw → run 终态 failed 带原因;
- **配置层**:环境变量也过 zod(load-agent-env),启动即失败快;
- 关键设计:**校验失败不重试**(业务错误,重试也白搭,见 Q17),坏数据不会流到下一节点;
- ⚠️ 被问"降低多少错误率"时,别给数字——说"拦截式校验保证非法输出不进下游,没有做 A/B 度量"。

### Q37. 四层架构为什么这么切?依赖方向?
**考察点**:架构分层意识。
**答题要点**:界面层(React + zustand,不碰 Node 能力)/ 智能体层(`video-agent`,纯编排,不依赖 Electron,可在纯 Node 跑单测)/ 音视频层(ffmpeg 命令构建 + 抽帧 + 进度解析,纯函数可测)/ 桌面底层(Electron 壳、IPC、sqlite、safeStorage)。依赖单向:底层 → 智能体层 → 音视频层;界面层只通过**类型化 IPC**(shared/ 目录共享通道定义)跟主进程对话。收益:换壳(CLI/Web/远程服务)时智能体层与音视频层直接复用。

### Q38. Vibe Coding 和 Spec Driven 怎么平衡的?AI 写代码怎么控质量?
**考察点**:AI 时代的工程判断(面试官很爱听这个,尤其现在)。
**答题要点**:
- 阶段切换:**探索期**(方向不明、验证可行性)用 Vibe Coding 快速跑通最小闭环,追求速度和方向验证;
- **稳定期**(接口定了、要工程质量)切 Spec Driven——先写 plan/spec(需求、设计、验收)再实现,仓库里 docs/superpowers 就是这套产物;
- 工程护栏兜底:commitlint 强制规范、husky pre-commit prettier、TSC 0 错验收、功能优先补单测——**这些护栏让 AI 生成的代码不会烂掉**;
- 核心观点:AI 提效最大的风险是技术债务失控,「探索快 + 稳定严 + 护栏硬」是控制手段,而不是只喊"我们用 AI 写代码"。

---

## 8. 深度追问(陷阱题)标准答案

### T1. "checkpoint 落盘了,那 keyframes/用户精选帧呢?重启后还能继续吗?"
答:checkpoint 只存图状态。keyframes(内存 dataURL)和用户精选帧重启后丢失,**需要重新抽帧**;但多模态理解结果已持久化到 agent.sqlite 并热加载,plan_scenes 不依赖 keyframes,所以「等待审批 → 重启 → resume」这条主路径是通的。这是明确的取舍:dataURL 体积大不值得持久化,改进方向是代表帧落盘为文件、持久化 selectedFrames 的引用。

### T2. "一个 run 被 cancel 后,底层还在跑,会不会浪费资源/产生副作用?"
答:图级已真实中止——AbortController abort → LangGraph invoke 抛 AbortError → 返回 'cancelled' 终态,**后续节点不再执行**,事件被丢弃、内存已清理、不误报失败。已知残留:在飞的那次 LLM fetch 自然跑完(HTTP 不可撤回),若恰好出错,provider 的 withRetry 最多再重试 2 次(signal 未贯穿到 provider 层)。TTS 再生成链路用 `isCancelled()` 轮询,是真取消。改进方向:把 per-run signal 注入工具→provider 调用链,让 withRetry 在取消时立即抛 AbortError。

### T3. "interrupt 后如果用户永远不确认,资源会怎样?"
答:run 停留在 waiting_for_approval,checkpoint 在磁盘,不占活跃内存(终态清理只针对终态,但 waiting 状态的旁路缓存仍在内存 Map 里)。启动时热加载也只拉未终态的 run——也就是说,长期挂起的 run 每次启动都会热加载一遍 understanding。改进方向:对超时未确认的 run 做 TTL 归档。

### T4. "为什么 approve 之后 sceneApprovalFeedback 不清空?"
答:设计上是故意的——留着方便调试和 regenerate 时复用(regenerateScene 走独立通道,不在图内,但字段语义一致)。如果下一次 run 复用了同一状态,feedback 会污染新 run——但每个 run 有独立 runId 和独立 checkpoint,实际不会串。面试官若追问,可以说"当前实现里 run 间隔离,字段清空与否不影响正确性,留着是刻意为之"。

### T5. "两个 sqlite 文件,为什么不合成一个?"
答:职责隔离。checkpoints.db 的格式归 LangGraph 库管(升级/清空状态不影响业务数据),agent.sqlite 的 schema 归应用管(可以随意演进)。合并的话,LangGraph 升级带来的 schema 迁移风险会波及业务表。这就是 README 里写的「关键隔离」。

### T6. "withRetry 里 `sleep` 可注入,测试怎么验证退避次数?"
答:注入立即 resolve 的 sleep,注入记录调用序列的 onRetry,断言「第 1 次 500ms、第 2 次 1000ms + jitter 在 [0,500)」;注入永不重试的 shouldRetry 断言直接抛。**不 sleep、不 mock timer,靠依赖注入**——这是这套设计的核心目的。

### T7. "渲染端收到 100 个事件,每次都 re-render 不卡吗?"
答:三层防护——(1) `isSameEvent` 去重 + 乐观 run.started 占位替换;(2) `per-runId snapshot 缓存`,无关 run 的事件不触发当前组件 re-render(`useSyncExternalStore` 拿稳定引用);(3) FIFO cap 20 个 run。路线图还有 `@tanstack/react-virtual` 列表虚拟化处理长 run 的 DOM 数量。

### T8. "如果用户同时开了两个 App 实例?"
答:两个进程各写各的 sqlite(同一文件),better-sqlite3 同步连接会有锁竞争风险,当前**没有**做单实例锁(`app.requestSingleInstanceLock` 没接)。诚实说这是缺口,改进方向明确。面试官问到这个说明很懂,答"没做,这是已知短板"反而加分。

---

## 9. 你可以反问面试官的问题(选 2-3 个)

1. 贵司的 AI 功能目前是规则编排还是 Agent 化?有没有 human-in-the-loop 的交互场景?(展示你懂 Agent 落地的复杂度)
2. 桌面端的媒体/大文件处理(素材、导出)目前有没有性能瓶颈在排?(暗示你懂 ffmpeg/内存治理)
3. 团队怎么看待"LLM 输出不可靠"这个问题?校验/重试/降级是产品层还是工程层负责?
4. 你们现在 Electron 打包和自动更新链路是什么样的?(展示你对桌面工程化的关注)
5. 如果我要做「分镜单节点编辑」这个功能,你们预期交互是让用户改 JSON 还是可视化?(抛出你路线图里的单分镜编辑,展示产品思考)

---

## 10. 禁忌与提醒

- ❌ 不要说"AI 自动生成,用户等着就行"——本项目最值钱的就是**人机协同**(interrupt 确认、reject 反馈、帧选择)。
- ❌ 不要只背名词(LangGraph/SqliteSaver/safeStorage)——每个名词都要配一句"我为什么用它 + 踩了什么坑"。
- ❌ 不要吹"全链路 100% 鲁棒"——README 和路线图里明确列着未完成项(analyze_assets 图内节点未接通、IPC 集成测试 0、单实例锁缺失),主动说出短板并给出改进方向,是 Senior 信号。
- ✅ 讲任何一点都尽量落到「决策 → 权衡 → 验证」三段式。
- ✅ 项目里已完成的硬指标可以随时抛:64/64 测试、TSC 0 错、双 sqlite 隔离、5xx/429 重试分类、内存清理从"50 run 涨 50 倍"修到"终态即清"。

---

## 附:一句话速查(面试前 5 分钟扫一遍)

- 技术栈:Electron 38 + React 19 + Vite + Tailwind v4 + zustand + LangGraph 1.x + better-sqlite3 + 本地 FFmpeg,Monorepo(pnpm)
- 图:10 节点,`interrupt` 等人审,`Command({goto})` 支持 reject 打回
- 断点:SqliteSaver → checkpoints.db;多模态理解 → agent.sqlite 热加载
- 重试:只重试 5xx/429/网络,指数退避 + jitter,参数全可注入
- 事件:双序列机制保证单调,per-runId 隔离 + snapshot 缓存防乱序防串扰
- 安全:contextBridge 白名单、media:// 协议收口路径解析、safeStorage 加密密钥、日志脱敏
- 边界:短源 -stream_loop 预览导出语义一致、filter 转义、播放速度 clamp、总时长归一
- 治理:终态 cleanupRunState、渲染层 FIFO 20、before-quit 关 sqlite + 杀 ffmpeg
- TTS:RoutingTtsProvider 按 voiceId 前缀分流,IndexTTS2 本地零样本克隆(隐私)、seed-tts 在线(音质)
- 导出:`-progress pipe:2` 解析 out_time_us、AbortController → SIGTERM、mkdtemp + rm 无残留
- 校验:Zod provider 层解析即校验 + 工程层 schema 双重复核,坏数据不进下游
- 架构:四层单向依赖,界面层只走类型化 IPC;智能体层不依赖 Electron,纯 Node 可测
- 流程:探索期 Vibe Coding + 稳定期 Spec Driven + 护栏(commitlint/TSC 0 错/补测试)
- 诚实短板:单实例锁未做、graph 取消是协作式、IPC 集成测试 0、keyframes 不持久化
- **简历红线**:语音 LRU 缓存 / 90% 错误率 / 「全链路」取消——这三个说法代码里没有,面试前必须改(见 §1.5)
