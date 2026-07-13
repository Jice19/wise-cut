# API 联通性 Probe

> 阶段 0(plan 文档 §0 之后、阶段 1 之前的预检):  
> 在动 LangGraph / ffmpeg 之前,**先确认 M3 多模态 LLM 与火山 Agent Plan TTS 真实可用**。

## 这是什么

两个独立 TS 脚本,直接调 MiniMax-M3 与火山方舟 Agent Plan,验证凭据 + 协议 + 多模态支持。  
**不依赖 packages/video-agent/ 骨架**(骨架还没建),**不依赖 Electron**(纯 Node)。

## 文件

| 文件                      | 验证什么                                           |
| ------------------------- | -------------------------------------------------- |
| `probe-minimax-m3.ts`     | M3 OpenAI 兼容 chat/completions + 多模态 image_url |
| `probe-volcengine-tts.ts` | 火山 WebSocket 单流 TTS 协议 + 中文合成            |
| `tsconfig.json`           | 给 IDE / tsx 用的独立 tsconfig(类型仅 node)        |
| `../.env.local`           | 凭据(仓库根,不入仓)                                |

## 准备

```bash
# 1. 填凭据到仓库根 .env.local(已存在,API_KEY 已填,TTS key 待填)
$EDITOR ../.env.local

# 2. 装新增的 devDependencies
cd ../..  # 回到 apps/desktop/
pnpm install
```

新增依赖:`tsx` / `dotenv` / `ws` / `@types/node` / `@types/ws`。

## 跑

```bash
# M3 多模态 probe
pnpm probe:m3 -- /path/to/sample.jpg "请描述这张图"

# 火山 TTS probe(默认中文女声,sample text)
pnpm probe:tts -- "你好,这是火山方舟 Agent Plan TTS 的连通性测试。"

# 一次跑两个
pnpm probe:all
```

## 期望输出

### `probe:m3`

```
[probe:m3 ...] provider.configured { baseUrl, model }
[probe:m3 ...] loading image /path/to/sample.jpg
[probe:m3 ...] image data url length 12345
[probe:m3 ...] invoking chat/completions (multimodal)...
[probe:m3 ...] M3 responded { length, model, promptTokens, totalTokens }
=== M3 response ===
<中文视觉描述>
=== end ===
[probe:m3 ...] ✅ multimodal probe PASSED
```

### `probe:tts`

```
[probe:tts ...] tts.configured { endpoint, resourceId, speaker }
[probe:tts ...] connecting ws...
[probe:tts ...] ws open, sending full client request
[probe:tts ...] ws closed { chunks: N }
[probe:tts ...] ✅ TTS probe PASSED { audioPath, bytes }
```

输出 mp3 写到 `scripts/api-probe/.probe-out/tts.mp3`,QuickTime / VLC 可播。

## 失败排查

| 现象                                                 | 可能原因                             | 排查                                                  |
| ---------------------------------------------------- | ------------------------------------ | ----------------------------------------------------- |
| `Missing env API_KEY`                                | `.env.local` 没填 / 没保存           | `cat ../.env.local` 确认                              |
| `M3 chat completions 401`                            | API_KEY 错 / 无效                    | 控制台重新申请                                        |
| `M3 chat completions 400 - model not support vision` | M3 当前不支持 image_url              | 走 plan §6.5 降级方案 A/B/C                           |
| `TTS server error code=...`                          | X-Api-Key / X-Api-Resource-Id 不匹配 | 火山方舟控制台确认 Resource ID = `seed-tts-2.0`       |
| TTS 返回 0 chunks                                    | 协议层解析错                         | 看 ws message 日志,确认 frame 类型位                  |
| `WebSocket is not a constructor`                     | `ws` 没装 / 没 import 对             | `pnpm install` 重试,确认 `import WebSocket from 'ws'` |

## 后续

两个 probe 都 PASSED 后:

1. 删除 `scripts/api-probe/` 或保留作 sanity check
2. 进入 `docs/student-implementation-plan.md` **阶段 1:Graph 骨架**
