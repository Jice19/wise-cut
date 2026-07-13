# 自定义音色库设计

> 范围:Phase 4/5 接入,本阶段只抽象接口 + 火山预置音色默认实现。
>
> TTS 后端选型:**火山方舟 Agent Plan TTS**(本仓 commit 1 已封装的 `VolcengineTtsProvider`)。
>
> 火山方舟的限制:**不支持用户上传参考音频做音色克隆**(只支持预置音色)。所以本阶段"自定义"含义是:
>
> - **抽象 `VoiceProvider` 接口**(本仓上层不绑定火山)
> - **火山预置音色池**作为默认实现,提供几十个音色
> - **用户收藏列表**(在本地选火山预置音色加入"我的音色")
> - **预留 `IndexTts2Adapter` 接口**(后续接开源 TTS 时实现,本阶段 stub)

---

## 1. 目标

把"用什么 TTS、能不能自定义、怎么管理"三个问题从业务代码里抽出来,变成可替换的 Provider 层。

### 1.1 当前 commit 1 已有的

- `VolcengineTtsProvider` 封装 WebSocket 流式 TTS,支持预置 `voice` 参数
- `tts-protocol/` 协议层完整
- `probe:tts` 脚本验证

### 1.2 当前**没有**的

- ❌ 用户音色偏好管理(选过哪些音色、收藏夹)
- ❌ Provider 抽象层(直接耦合火山)
- ❌ 多 TTS 后端切换机制
- ❌ 用户自定义音色元数据(name / avatar / tags)

---

## 2. VoiceProvider 接口

### 2.1 抽象接口

```ts
// packages/video-agent/src/audio/voice-provider.ts
export type VoiceInfo = {
    voiceId: string; // 全局唯一 ID
    displayName: string; // "桃籽-女声"
    language: 'zh' | 'en' | 'multi';
    gender?: 'female' | 'male' | 'neutral';
    ageRange?: 'child' | 'young' | 'middle' | 'old';
    styleTags: string[]; // ['warm', 'news', 'asmr']
    previewAudioUrl?: string; // 试听 mp3 路径
    provider: string; // 'volcengine-seed-tts' | 'index-tts2' | 'cosy-voice'
    isCustom: boolean; // true = 用户自建音色
    metadata?: Record<string, unknown>; // 厂商私有字段
};

export interface VoiceProvider {
    readonly providerName: string;

    /**
     * 列出所有可用音色(预置 + 用户自定义合并)
     */
    listVoices(): Promise<VoiceInfo[]>;

    /**
     * 列出预置音色(用户选收藏时的源池)
     */
    listBuiltinVoices(): Promise<VoiceInfo[]>;

    /**
     * 列出用户自定义音色(收藏的预置 + 后续可能的 reference audio 克隆)
     */
    listCustomVoices(): Promise<VoiceInfo[]>;

    /**
     * 添加用户自定义音色(收藏预置 / 上传 reference audio)
     */
    addCustomVoice(input: AddCustomVoiceInput): Promise<VoiceInfo>;

    /**
     * 删除用户自定义音色
     */
    removeCustomVoice(input: { voiceId: string }): Promise<void>;

    /**
     * 用指定 voice 合成音频(委托给具体的 TTS 引擎)
     */
    synthesize(input: {
        text: string;
        voiceId: string;
        speedRatio?: number;
        volumeRatio?: number;
        outputPath: string;
    }): Promise<{ byteLength: number; durationMs: number; fromCache: boolean }>;
}
```

### 2.2 工厂模式切换

```ts
// packages/video-agent/src/audio/voice-provider-factory.ts
export const createVoiceProvider = async (config: {
    provider?: 'volcengine-seed-tts' | 'index-tts2'; // 默认 volcengine-seed-tts
    apiKey?: string;
    userDataDir: string;
}): Promise<VoiceProvider> => {
    switch (config.provider) {
        case 'index-tts2':
            return new IndexTts2Adapter(config);
        case 'volcengine-seed-tts':
        default:
            return new VolcengineTtsAdapter({
                apiKey: config.apiKey,
                customVoicesPath: path.join(
                    config.userDataDir,
                    'custom-voices.json'
                )
            });
    }
};
```

---

## 3. 火山方舟预置音色池(default)

### 3.1 音色来源

火山方舟 Agent Plan TTS 提供几十个预置音色,每个音色有 `voice_id`(如 `BV001_streaming`、`BV002_streaming`)。

**预置音色清单**通过 API 获取:

```ts
class VolcengineBuiltinVoiceCatalog {
    async listBuiltin(): Promise<VoiceInfo[]> {
        const response = await fetch(`${this.baseUrl}/voice/list`, {
            headers: { Authorization: `Bearer; ${this.token}` }
        });
        const data = await response.json();
        return data.voices.map(this.toVoiceInfo);
    }
}
```

### 3.2 预置音色元数据(本仓扩展)

火山 API 返回的音色数据字段有限,本仓**自己补全**:

- `displayName`(中文友好名,如 "桃籽-女声")
- `styleTags`(用途标签:新闻/配音/asmr)
- `previewAudioUrl`(从 `assets/song/voice-previews/` 取)
- `gender / ageRange`(手动标注,无 API 字段)

### 3.3 音色试听

每个预置音色在 `apps/desktop/renderer/assets/voice-previews/` 有一份试听 mp3(几秒一句样本):

```
apps/desktop/renderer/assets/voice-previews/
├── BV001_streaming.mp3
├── BV002_streaming.mp3
├── BV003_streaming.mp3
└── ...
```

**生成方式**(`apps/desktop/scripts/generate-voice-previews.ts`):

```ts
// 跑一次,把每个火山预置音色合成一句样本
for (const voiceId of BUILTIN_VOICE_IDS) {
    await volcengineTts.synthesize({
        text: '你好,这是一段音色试听样本。',
        voice: voiceId,
        outputPath: `apps/desktop/renderer/assets/voice-previews/${voiceId}.mp3`
    });
}
```

**手工生成,不入 git**(每个 mp3 几十 KB,加起来几 MB)。

---

## 4. 用户自定义音色 = 收藏夹

### 4.1 数据结构

`userData/custom-voices.json`:

```ts
type CustomVoicesConfig = {
    version: '1.0';
    voices: CustomVoice[];
};

type CustomVoice = {
    voiceId: string; // 全局唯一,UUID
    sourceVoiceId: string; // 引用的预置音色 voiceId,如 'BV001_streaming'
    displayName: string; // "我的桃籽-女声"
    language: 'zh' | 'en' | 'multi';
    speedRatio?: number; // 用户个性化默认速度
    volumeRatio?: number; // 用户个性化默认音量
    styleTags: string[]; // 用户自加标签
    createdAt: number;
    lastUsedAt: number;
    useCount: number; // 使用次数,便于排序
};
```

### 4.2 API

```ts
// 用户收藏一个预置音色
await voiceProvider.addCustomVoice({
    sourceVoiceId: 'BV001_streaming',
    displayName: '我的桃籽-女声',
    styleTags: ['warm', 'asmr']
});

// 列出用户自定义
const customs = await voiceProvider.listCustomVoices();

// 删除
await voiceProvider.removeCustomVoice({ voiceId: 'xxx' });
```

### 4.3 持久化

```
userData/
└── custom-voices.json    ← CustomVoicesConfig JSON
```

加载时机:VoiceProvider 初始化时;保存时机:addCustomVoice / removeCustomVoice 时。

---

## 5. 完整目录布局

```
apps/desktop/
├── renderer/assets/
│   └── voice-previews/         ← 火山预置音色试听 mp3(手工生成)
│       ├── BV001_streaming.mp3
│       ├── BV002_streaming.mp3
│       └── ...
├── scripts/
│   └── generate-voice-previews.ts  ← 一次性脚本,生成所有预置音色试听

packages/video-agent/src/audio/
├── voice-provider.ts            ← 接口定义
├── voice-provider-factory.ts    ← 工厂
├── volcengine-tts-adapter.ts    ← 火山默认实现
├── index-tts2-adapter.ts        ← IndexTts2 stub(Phase 5)
└── tts-cache.ts                 ← 缓存层(见 streaming-tts.md)

userData/
├── custom-voices.json            ← 用户收藏夹
└── ...
```

---

## 6. UI 集成

### 6.1 音色选择器(VoicePicker)

放在 `/create` 页面的 brief 表单附近:

```
音色: [▼ 我的桃籽-女声 (warm) ]
     [ ] 显示全部预置音色
     [浏览所有音色...]
```

点"浏览所有音色"弹窗:

- 左侧:预置音色列表(几十个,带试听按钮)
- 右侧:我的收藏(可重命名 / 删除 / 调整默认速度音量)

### 6.2 试听交互

点击试听按钮 → 调 `miaomaAPI.customVoice.preview({ voiceId })` → 主进程查 `voice-previews/<voiceId>.mp3` → renderer 播放(已存在本地,不需要 TTS 调用)

试听 mp3 **预生成**而非实时合成,避免用户每次点试听都付 TTS 费用。

---

## 7. 模块划分

### 7.1 新增(`packages/video-agent/src/audio/`)

- `voice-provider.ts` —— `VoiceProvider` interface + `VoiceInfo` type
- `voice-provider-factory.ts` —— `createVoiceProvider()` 工厂
- `volcengine-tts-adapter.ts` —— 火山默认实现(包含预置音色查询 + custom-voices.json 管理)
- `index-tts2-adapter.ts` —— stub(Phase 5 实现)

### 7.2 新增(`apps/desktop/`)

- `scripts/generate-voice-previews.ts` —— 一次性脚本
- `renderer/components/VoicePicker.tsx` —— 音色选择 UI
- `renderer/components/VoicePickerDialog.tsx` —— 浏览所有音色弹窗
- `renderer/assets/voice-previews/BVxxx.mp3` —— 预置音色试听

### 7.3 修改

- `apps/desktop/shared/ipc.ts` —— 加 `CUSTOM_VOICE:*` channel
- `apps/desktop/client/main.ts` —— 注册 handler
- `apps/desktop/client/preload.ts` —— wire 5 个方法
- `apps/desktop/renderer/pages/create-screen.tsx` —— 用 VoicePicker 替换占位
- `packages/video-agent/src/index.ts` —— barrel 暴露 VoiceProvider
- `packages/video-agent/src/tools/video-agent-tools.ts` —— 把 `synthesizeVoiceForScene` 改调 voiceProvider 而非直接调 volcengine

---

## 8. 测试矩阵

| 测试                                                | 覆盖                                     |
| --------------------------------------------------- | ---------------------------------------- |
| `voice-provider.test.ts:list-builtin`               | 列预置音色,每项含 displayName + voiceId  |
| `voice-provider.test.ts:add-custom`                 | 添加用户音色 → 写 custom-voices.json     |
| `voice-provider.test.ts:remove-custom`              | 删除 → 从 custom-voices.json 移除        |
| `voice-provider.test.ts:list-custom-merged`         | 列用户收藏(从 JSON 读)                   |
| `voice-provider.test.ts:factory-default`            | 不传 provider → 默认 volcengine-seed-tts |
| `voice-provider.test.ts:factory-index-tts2`         | 传 index-tts2 → 返回 stub                |
| `voice-provider.test.ts:synthesize-cache-hit`       | 同 voiceId + text → 命中缓存,0 调用      |
| `voice-provider.test.ts:voice-uniqueness`           | voiceId 全局唯一,无重复                  |
| `voice-provider.test.ts:custom-voice-default-speed` | 用户音色 speedRatio → 默认值             |

---

## 9. 风险

1. **火山预置音色 ID 不稳定**:火山可能改 voice_id 命名。补救:用 displayName 而非 voiceId 作为用户标识。
2. **预置试听生成依赖 API**:一次性脚本跑时需要 `VOLCENGINE_TTS_APP_ID`。失败时跳过,UI 仍可用只是没试听。
3. **用户音色滥用**:用户收藏 1000 个音色 → custom-voices.json 变大。补救:上限 100 个 + LRU。
4. **跨设备同步**:用户在设备 A 收藏 5 个音色,设备 B 没有。补救:Phase 5 L2 DB 同步。
5. **IndexTts2 adapter 复杂度**:Phase 5 落地时,IndexTts2 需要部署 GPU 服务器,成本高。本阶段 stub。
6. **音色删除与历史项目**:用户删了一个音色,但之前用这个音色生成的项目还在。补救:删除时检查项目引用,有引用则警告"删除后历史项目配音将无法重生成"。

---

## 10. 引用清单

- **plan §3 synthesize_voice** — `docs/plan-2.0-langgraph.md`
- **流式 TTS 缓存** — `docs/streaming-tts.md`
- **火山方舟 TTS 协议** — `apps/desktop/scripts/api-probe/tts-protocol/`
- **VolcengineTtsProvider 现有封装** — `apps/desktop/scripts/api-probe/providers/volcengine-tts-provider.ts`
- **Electron userData 路径** — https://www.electronjs.org/docs/latest/api/app#appgetpathname
- **数据分层 L1/L2/L3** — `docs/data-storage-strategy.md`
