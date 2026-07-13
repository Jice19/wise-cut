# 数据分层存储设计(本机 vs 服务端)

> 范围:为后续上线路径做数据分层规划。当前阶段(Phase 2/3)只跑本机 Electron,**全部数据存 userData**;上线后需要把不同敏感度/共享度的数据分别落到本机磁盘和服务端数据库。
>
> 文档原则:本阶段**不写代码**,只做决策表 + 迁移路径,等 Phase 4 末尾或 Phase 5 真正落地时参考。

---

## 1. 现状(本阶段,全部在本机)

当前所有持久化都在 `app.getPath('userData')` 下:

```
userData/
├── video-projects/<id>.json             ← VideoProject 完整时间线
├── video-projects/<id>/scan-cache.json  ← 增量扫描缓存
├── tts-cache/<hash>.{json,mp3}          ← TTS 合成缓存
├── agent-runs/                          ← LangGraph checkpoint(本阶段空,Phase 5 SqliteSaver)
├── custom-voices/                       ← 用户上传的自定义音色文件
└── ...
```

**所有数据是单用户、单设备、本地专属**。

---

## 2. 上线后的存储分层原则

### 2.1 三层存储划分

| 层               | 物理位置                         | 适合数据类型                         |
| ---------------- | -------------------------------- | ------------------------------------ |
| **L1 本机磁盘**  | `app.getPath('userData')`        | 大文件、隐私数据、离线可用           |
| **L2 服务端 DB** | Postgres / MySQL / SQLite-server | 用户元数据、共享数据、关系型数据     |
| **L3 对象存储**  | S3 / OSS / MinIO                 | 海量文件(视频、生成的 mp4、用户素材) |

### 2.2 划分原则

```
                ┌────────────────────────────────────┐
                │ 是否用户私有                       │
                │ 是 → 本机磁盘优先                  │
                │ 否 → 是否大文件                    │
                │     是 → 对象存储                  │
                │     否 → 服务端 DB                │
                └────────────────────────────────────┘
```

具体规则:

| 数据类型                   | 是否用户私有 | 是否大文件    | 落在哪                                             |
| -------------------------- | ------------ | ------------- | -------------------------------------------------- |
| 用户上传的原始视频         | 是           | 是(>100MB)    | **L1 本机磁盘** + **L3 对象存储** 备份             |
| 生成的 mp4 输出            | 是           | 是            | **L1 本机磁盘** + 可选 L3 备份                     |
| VideoProject JSON          | 是           | 否(几 KB)     | **L1 本机磁盘**(单设备),可选同步到 L2              |
| TTS 缓存 mp3               | 否(可共享)   | 中(100KB-1MB) | **L3 对象存储**(按 hash 去重,跨用户复用)           |
| 增量扫描缓存               | 是           | 否(几 KB)     | **L1 本机磁盘**                                    |
| 用户元数据(账号/订阅/历史) | 否           | 否            | **L2 服务端 DB**                                   |
| Agent run 历史(checkpoint) | 是           | 中(几十 KB)   | **L1 本机磁盘**(隐私) + **L2** 备份(跨设备续跑)    |
| 自定义音色文件             | 是           | 中(几 MB)     | **L1 本机磁盘** + **L2 DB**(元数据) + **L3**(备份) |
| BGM 库(m4a)                | 否           | 是            | **L3 对象存储**(共享)+ L2 DB 元数据                |
| 审计日志                   | 否           | 中            | **L2 服务端 DB**                                   |

---

## 3. 上线后 userData 目录重构

```
userData/
├── local/                                  ← 仅本机,不同步
│   ├── cache/
│   │   ├── tts-cache/<hash>.{json,mp3}    ← 用户本地缓存,不上云
│   │   └── scan-cache/<projectId>.json   ← 增量扫描本机缓存
│   └── logs/
│       └── app.log                        ← 本机日志
├── projects/<projectId>/                  ← 私有项目,可同步到云
│   ├── project.json
│   ├── audio/                              ← TTS 合成产物
│   ├── video/                              ← 拼接生成的 mp4
│   └── thumbnails/
├── custom-voices/                          ← 自定义音色
├── preferences.json                        ← 用户偏好(同步到 L2)
└── checkpoint/
    └── <runId>.sqlite                      ← LangGraph SqliteSaver(Phase 5)
```

---

## 4. 服务端数据库 Schema(Postgres 选型)

### 4.1 用户表(users)

```sql
CREATE TABLE users (
  id UUID PRIMARY KEY,
  email TEXT UNIQUE NOT NULL,
  display_name TEXT NOT NULL,
  subscription_tier TEXT NOT NULL DEFAULT 'free',  -- free / pro / enterprise
  api_quota_used INT NOT NULL DEFAULT 0,
  api_quota_limit INT NOT NULL DEFAULT 100,
  created_at TIMESTAMP DEFAULT NOW(),
  updated_at TIMESTAMP DEFAULT NOW()
);
```

### 4.2 项目表(projects)—— 服务端视角

```sql
CREATE TABLE projects (
  id UUID PRIMARY KEY,
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  title TEXT NOT NULL,
  description TEXT,
  status TEXT NOT NULL DEFAULT 'draft',  -- draft / generating / awaiting_approval / completed / archived
  duration_ms INT,
  thumbnail_url TEXT,                   -- L3 路径
  project_json_url TEXT,                 -- L3 路径(VideoProject JSON 备份)
  created_at TIMESTAMP DEFAULT NOW(),
  updated_at TIMESTAMP DEFAULT NOW()
);

CREATE INDEX idx_projects_user_status ON projects(user_id, status, updated_at DESC);
```

**注意**:服务端**不存**完整 `VideoProject JSON`(太大且隐私),只存**元数据 + L3 路径**。完整 JSON 在用户 L1 本机磁盘。

### 4.3 素材表(assets)—— 服务端视角

```sql
CREATE TABLE assets (
  id UUID PRIMARY KEY,
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  project_id UUID NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  file_name TEXT NOT NULL,
  storage_url TEXT NOT NULL,             -- L3 对象存储路径
  thumbnail_url TEXT,
  mime_type TEXT NOT NULL,
  size_bytes BIGINT NOT NULL,
  duration_ms INT,
  fps NUMERIC(6, 2),
  width INT,
  height INT,
  has_audio BOOLEAN,
  description TEXT,                       -- M3 多模态 LLM 生成的中文描述
  uploaded_at TIMESTAMP DEFAULT NOW()
);

CREATE INDEX idx_assets_project ON assets(project_id);
```

### 4.4 BGM 表(bgm_tracks)—— 全局共享

```sql
CREATE TABLE bgm_tracks (
  id UUID PRIMARY KEY,
  title TEXT NOT NULL,
  mood TEXT NOT NULL,                     -- peaceful / uplifting / tense / romantic / epic / neutral
  bpm INT,
  duration_sec INT NOT NULL,
  storage_url TEXT NOT NULL,             -- L3 路径
  license TEXT NOT NULL,                  -- 版权信息
  is_active BOOLEAN DEFAULT TRUE,
  created_at TIMESTAMP DEFAULT NOW()
);

CREATE INDEX idx_bgm_mood ON bgm_tracks(mood, is_active);
```

### 4.5 自定义音色表(custom_voices)—— 用户私有 + 元数据上云

```sql
CREATE TABLE custom_voices (
  id UUID PRIMARY KEY,
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  name TEXT NOT NULL,                     -- "我的小奶音"
  reference_audio_url TEXT NOT NULL,     -- L3 备份路径(主在 L1)
  index_tts2_id TEXT,                     -- IndexTts2 服务端索引 ID
  language TEXT DEFAULT 'zh',
  sample_text TEXT,
  created_at TIMESTAMP DEFAULT NOW()
);

CREATE INDEX idx_custom_voices_user ON custom_voices(user_id);
```

### 4.6 Agent Run 历史表(agent_runs)—— 用于跨设备续跑

```sql
CREATE TABLE agent_runs (
  id UUID PRIMARY KEY,
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  project_id UUID REFERENCES projects(id) ON DELETE CASCADE,
  status TEXT NOT NULL,                   -- running / waiting_approval / completed / failed / cancelled
  thread_id TEXT NOT NULL,                -- LangGraph thread_id(=runId)
  state_url TEXT,                         -- L3 存 LangGraph checkpoint 序列化结果(SqliteSaver 备份)
  brief TEXT,                             -- 用户 prompt
  started_at TIMESTAMP DEFAULT NOW(),
  completed_at TIMESTAMP
);

CREATE INDEX idx_agent_runs_user_status ON agent_runs(user_id, status, started_at DESC);
```

**Phase 5 SqliteSaver 升级**:把 SqliteSaver 输出的 sqlite 文件同步到 L3,跨设备续跑。

### 4.7 审计日志(audit_logs)

```sql
CREATE TABLE audit_logs (
  id BIGSERIAL PRIMARY KEY,
  user_id UUID REFERENCES users(id),
  action TEXT NOT NULL,                   -- video_agent_start / project_save / voice_import
  resource_type TEXT,                     -- run / project / voice
  resource_id UUID,
  metadata JSONB,
  ip_address INET,
  created_at TIMESTAMP DEFAULT NOW()
);

CREATE INDEX idx_audit_logs_user_time ON audit_logs(user_id, created_at DESC);
```

---

## 5. 对象存储(L3)布局

```
s3://miaoma-bucket/
├── users/
│   └── <userId>/
│       ├── projects/<projectId>/
│       │   ├── source/<assetId>.<ext>        ← 用户上传原始视频
│       │   ├── output/<runId>.mp4            ← 生成的最终视频
│       │   └── thumbnail/<assetId>.jpg
│       └── voices/
│           └── <voiceId>/reference.wav       ← 自定义音色参考音频
├── shared/
│   └── bgm/<trackId>.m4a                     ← 全局 BGM 库
└── tts-cache/
    └── <sha256-prefix>.mp3                   ← TTS 跨用户共享缓存
```

**访问控制**:

- `users/<userId>/`:用户私有,Pre-signed URL 临时授权
- `shared/bgm/`:公开可读,写入需 admin 权限
- `tts-cache/`:按 hash 命名,公开读(去重)

---

## 6. 同步策略

### 6.1 本机 → 服务端 同步触发点

| 数据              | 触发点                     | 同步策略                      |
| ----------------- | -------------------------- | ----------------------------- |
| VideoProject JSON | save_project 节点          | 增量 push(只 push diff)       |
| 生成的 mp4        | export 完成                | 完整 push 到 L3               |
| 原始素材          | 用户上传                   | 完整 push 到 L3               |
| 自定义音色        | import 完成                | 完整 push + 元数据上 DB       |
| TTS 缓存          | synthesize_voice 命中时    | 不主动 push(被动命中其他用户) |
| Agent run 历史    | run.completed / run.failed | push 到 DB(仅元数据)          |

### 6.2 服务端 → 本机 拉取触发点

| 场景           | 触发                                  |
| -------------- | ------------------------------------- |
| 用户登录新设备 | 拉取 projects 元数据,用户选哪个拉哪个 |
| 跨设备续跑     | 拉 SqliteSaver checkpoint state       |
| BGM 库更新     | 启动时拉最新版(song.json)             |
| 用户更新头像   | 拉 L3 头像                            |

### 6.3 离线优先

```
本地有数据 → 用本地,后台静默 sync
本地无 + 在线 → 拉服务端,继续工作
本地无 + 离线 → 提示"需要联网",但允许纯本地功能
```

---

## 7. 数据所有权和删除

### 7.1 用户删除项目

- L1 本机:`rm -rf userData/projects/<id>/` + 删 scan-cache
- L3 对象存储:`aws s3 rm --recursive s3://bucket/users/<userId>/projects/<id>/`
- L2 DB:`UPDATE projects SET status='deleted' WHERE id=?`(软删,30 天后物理删除,合规备份)
- Agent runs:同步软删

### 7.2 用户注销账号

- 30 天宽限期(L1 数据保留,只读)
- 30 天后 L1 + L3 全部物理删除
- L2 audit_logs 保留(合规要求,匿名化)

### 7.3 GDPR / 合规

- 用户可导出所有数据(L1 打包 zip)
- 用户可一键删除(7.1 + 7.2 流程)
- 所有 L3 文件访问走 Pre-signed URL,1 小时过期

---

## 8. 迁移路径

### Phase 2/3(本阶段,✅ 已在做)

```
所有数据 → L1 本机磁盘
单用户、单设备、离线可用
```

### Phase 4(多档分辨率导出)

```
新增 L1 数据:
├── export/<runId>.mp4                    ← export 产物
└── export/<runId>/thumbs/                ← 视频缩略图

依然 L1 only,无服务端
```

### Phase 5(账号 + 跨设备)

```
新增:
├── L2 服务端 Postgres(用户表、项目表、素材表)
├── L2/L3 同步任务(异步 worker)
├── Auth 模块(注册/登录/Token 刷新)
├── L1 → L2 push 逻辑(项目保存、run 完成时)
└── SqliteSaver 升级(SqliteSaver 文件同步到 L3)
```

### Phase 6+(企业版)

```
新增:
├── team / org 表(多人协作)
├── project 共享 / 权限
├── 审计日志全量上报
└── 分布式 SqliteSaver → PostgresSaver
```

---

## 9. 当前 Phase 2/3 设计文档的存储层对应

把所有已有文档的"存到 userData"标记对齐到三层模型:

| 文档                                            | 现状位置                                                 | 上线后位置                         |
| ----------------------------------------------- | -------------------------------------------------------- | ---------------------------------- |
| `assemble-and-subtitle.md` §6 subtitle.srt 落盘 | L1 `userData/video-projects/<id>/subtitle.srt`           | **保留 L1**(临时文件),也可 L3 备份 |
| `incremental-scan.md` §3 scan-cache.json        | L1 `userData/video-projects/<projectId>/scan-cache.json` | **保留 L1** + 可选同步 L2          |
| `streaming-tts.md` §3.3 tts-cache               | L1 `userData/tts-cache/<hash>.{json,mp3}`                | **迁移到 L3**(跨用户共享)          |
| `agent-workflow.md` §4 Checkpoint MemorySaver   | L1 `MemorySaver`                                         | Phase 5 SqliteSaver → L3           |
| `scene-regeneration.md` §3 落盘                 | L1 `userData/video-projects/<id>.json`                   | **保留 L1** + 同步 L2 元数据       |
| `long-task-event-stream.md` §4 MemorySaver      | L1                                                       | Phase 5 L3                         |

---

## 10. 风险与决策待定

### 10.1 风险

1. **同步延迟**:用户保存项目 → 同步到 L3 需要时间,断网时本地能用但云端缺失。补救:本地先写,网络恢复后异步 sync,失败重试。
2. **L3 成本**:每个用户素材存 L3,1 万用户 × 10 个 100MB 视频 = 10TB。补救:用户主动"归档"的项目移到冷存储(Glacier / 归档存储)。
3. **跨设备一致性**:用户 A 在设备 1 编辑,设备 2 同时编辑 → 冲突。补救:last-write-wins + 冲突检测(基于 updated_at + 项目 JSON hash)。
4. **SqliteSaver 同步完整性**:LangGraph checkpoint 序列化包含 state 引用(指针?),同步到 L3 后反序列化失败。补救:序列化时 deep clone,反序列化时重建。
5. **TTS 缓存跨用户隐私**:用户 A 合成的 TTS 被用户 B 命中,语义可能敏感(医疗/法律)。补救:hash 命名 + 不存原文本 + 7 天自动清理。

### 10.2 决策待定

1. **Auth 方案**:自建 JWT vs Auth0 vs Clerk?(影响 Phase 5)
2. **数据库选型**:Postgres(强关系) vs MongoDB(灵活) vs Supabase(快速)?
3. **对象存储**:S3(贵但稳) vs OSS(便宜,国内快) vs 自建 MinIO(数据自主)?
4. **同步方式**:push vs pull vs 双向 CRDT?Phase 5 决策
5. **TTS 缓存跨用户策略**:全共享 vs 仅同音色共享 vs 完全隔离?

### 10.3 当前不需要回答

本阶段(Phase 2/3)**只需要单用户单设备**,所有上述问题在 Phase 5 之前不需要拍板。但**架构要预留扩展点**:

| 预留点                 | 现状     | 未来扩展                                   |
| ---------------------- | -------- | ------------------------------------------ | ---------- |
| VideoProject JSON 结构 | 单设备   | 加 `version` + `lastSyncedAt` 字段         |
| 素材引用               | 文件路径 | 加 `storageProvider: 'local'               | 's3'` 字段 |
| 用户标识               | 无       | 加 `userId: UUID` 顶层字段                 |
| API 调用               | 无 Auth  | 预留 `Authorization: Bearer` header 注入点 |

---

## 11. 引用清单

- **Electron app.getPath** — https://www.electronjs.org/docs/latest/api/app#appgetpathname
- **AWS S3 Pre-signed URL** — https://docs.aws.amazon.com/AmazonS3/latest/userguide/PresignedUrlUploadObject.html
- **Postgres JSONB** — https://www.postgresql.org/docs/current/datatype-json.html
- **GDPR Right to be Forgotten** — https://gdpr-info.eu/art-17-gdpr/
- **plan §6 video-project-store** — `docs/plan-2.0-langgraph.md`
- **增量扫描** — `docs/incremental-scan.md`
- **流式 TTS 缓存** — `docs/streaming-tts.md`
- **智能体工作流 Checkpoint** — `docs/agent-workflow.md`
