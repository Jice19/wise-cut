# WiseCut 视频文件上传方案 — 从"路径输入"到"大文件上传"

## 一、现状分析

### 1.1 当前流程

```
用户手动粘贴本地目录路径 → 文本输入框 → IPC 传给主进程 → 主进程用 fs.readdir 扫描目录 → FFprobe 分析 → 抽帧 → Agent 匹配
```

**关键代码路径：**

| 文件                                              | 职责                                                   |
| ------------------------------------------------- | ------------------------------------------------------ |
| `renderer/components/create/CreateInputPanel.tsx` | 文本输入框，用户手动粘贴路径                           |
| `shared/video-agent.ts`                           | `sourceAssetDirectory: string` 类型定义                |
| `client/video-agent-ipc.ts`                       | IPC handler，校验 `sourceAssetDirectory` 非空          |
| `client/video-agent-tools.ts` → `scanAssets`      | `readdir(sourceAssetDirectory)` 扫描目录，FFprobe 抽帧 |

### 1.2 当前问题

| 问题                 | 严重程度 | 说明                                                  |
| -------------------- | -------- | ----------------------------------------------------- |
| **用户体验差**       | 高       | 用户必须手动粘贴路径，无法通过文件选择器/拖拽选择文件 |
| **无法选择单个文件** | 高       | 只能选择"目录"，无法选择单个或多个视频文件            |
| **路径错误无提示**   | 中       | 输入错误路径后，直到 Agent 运行时才报错               |
| **不安全**           | 中       | 用户可输入任意路径，存在安全隐患                      |
| **无上传进度**       | 低       | 本地文件不存在"上传"概念，但缺少文件扫描进度反馈      |

### 1.3 关键约束

> **本项目是纯本地桌面应用，所有视频处理都在本地完成。** 没有远程服务器接收文件，不需要"上传到云端"。

这意味着"大文件上传"在本项目中的含义是：**用户通过文件选择器/拖拽选择本地视频文件，应用获取文件路径后进行处理**。而非真正的网络传输上传。

---

## 二、方案调研

### 2.1 市面主流大文件上传方案对比

| 方案                               | 类型              | 适用场景                | 优势                         | 劣势                        | 适合本项目？ |
| ---------------------------------- | ----------------- | ----------------------- | ---------------------------- | --------------------------- | ------------ |
| **tus-js-client**                  | 开源协议库        | Web 端上传到 tus 服务器 | 断点续传、标准协议、生态成熟 | 需要后端 tus 服务器         | ❌ 不适合    |
| **Uppy**                           | 开源 UI 组件      | Web 端文件选择+上传     | UI 美观、插件丰富、支持 tus  | 主要面向 Web 上传场景       | ❌ 不适合    |
| **vue-upload-component**           | Vue 组件          | Web 端分片上传          | 分片上传、支持目录           | 依赖 Vue、面向 Web 上传     | ❌ 不适合    |
| **Electron dialog.showOpenDialog** | Electron 原生 API | 本地文件选择            | 原生体验、支持多选/目录/过滤 | 无 UI 定制能力              | ✅ 适合      |
| **Electron 拖拽 (Drag & Drop)**    | Electron 原生 API | 本地文件拖入            | 直觉化操作、支持多文件       | 需要额外处理 `file://` 协议 | ✅ 适合      |
| **自定义文件选择器**               | 自研              | 高度定制需求            | 完全可控                     | 开发成本高                  | ⚠️ 备选      |

### 2.2 核心结论

**本项目不需要"大文件上传"（网络传输），而是需要"本地文件选择"（文件导入）。**

所有需要后端服务器的方案（tus、Uppy、vue-upload-component）都不适用。本项目是纯本地桌面应用，视频文件始终在用户本地，不需要通过网络传输到任何服务器。

---

## 三、推荐方案

### 3.1 方案：Electron 原生文件选择 + 拖拽导入

**核心思路：** 将"粘贴路径"改为"选择文件/目录"的交互方式，利用 Electron 的原生能力，不引入任何第三方上传库。

```
用户点击"选择文件"按钮 / 拖拽文件 → dialog.showOpenDialog 或 ondrop 事件 → 获取文件路径列表 → IPC 传给主进程 → 后续处理不变
```

### 3.2 改动清单

#### 改动 1：新增 IPC 通道 — 选择视频文件/目录

**文件：** `shared/video-agent.ts`（或新建 `shared/file-select-channels.ts`）

```ts
// 新增 IPC 通道
export const fileSelectIpcChannels = {
    selectVideoFiles: 'file-select:select-video-files',
    selectVideoDirectory: 'file-select:select-video-directory'
} as const;

export type FileSelectResult = {
    canceled: boolean;
    // 选择的文件路径列表
    filePaths: string[];
    // 选择的目录路径（如果选的是目录）
    directoryPath?: string;
};
```

#### 改动 2：主进程 — 注册文件选择 IPC

**文件：** 新建 `client/file-select-ipc.ts`

```ts
import { ipcMain, dialog, BrowserWindow } from 'electron';

const videoExtensions = [
    'mp4',
    'mov',
    'avi',
    'mkv',
    'webm',
    'flv',
    'wmv',
    'm4v'
];

export function registerFileSelectIpc() {
    // 选择单个或多个视频文件
    ipcMain.handle(fileSelectIpcChannels.selectVideoFiles, async () => {
        const win = BrowserWindow.getFocusedWindow();
        if (!win) return { canceled: true, filePaths: [] };

        const result = await dialog.showOpenDialog(win, {
            filters: [
                {
                    extensions: videoExtensions,
                    name: '视频文件'
                }
            ],
            properties: ['openFile', 'multiSelections'],
            title: '选择视频素材'
        });

        return {
            canceled: result.canceled,
            filePaths: result.filePaths
        };
    });

    // 选择视频目录
    ipcMain.handle(fileSelectIpcChannels.selectVideoDirectory, async () => {
        const win = BrowserWindow.getFocusedWindow();
        if (!win)
            return { canceled: true, filePaths: [], directoryPath: undefined };

        const result = await dialog.showOpenDialog(win, {
            properties: ['openDirectory'],
            title: '选择视频素材目录'
        });

        return {
            canceled: result.canceled,
            directoryPath: result.canceled ? undefined : result.filePaths[0],
            filePaths: result.canceled ? [] : result.filePaths
        };
    });
}
```

#### 改动 3：Preload — 暴露文件选择 API

**文件：** `client/preload.ts`

```ts
// 在 miaomaAPI 中新增 fileSelect 命名空间
fileSelect: {
    selectVideoFiles: () => ipcRenderer.invoke(fileSelectIpcChannels.selectVideoFiles),
    selectVideoDirectory: () => ipcRenderer.invoke(fileSelectIpcChannels.selectVideoDirectory),
},
```

#### 改动 4：前端 — 改造输入面板

**文件：** `renderer/components/create/CreateInputPanel.tsx`

**改造前：** 纯文本输入框，用户手动粘贴路径

**改造后：**

```
┌─────────────────────────────────────────────────────┐
│  📁 本地素材                                        │
│  ┌─────────────────────────────────┐  ┌──────────┐  │
│  │  已选择 3 个视频文件              │  │ 选择文件  │  │
│  │  video1.mp4, video2.mp4, ...    │  │ 选择目录  │  │
│  └─────────────────────────────────┘  └──────────┘  │
│  💡 也可以拖拽文件到此处                              │
└─────────────────────────────────────────────────────┘
```

**交互逻辑：**

1. **选择文件按钮** → 调用 `window.miaomaAPI.fileSelect.selectVideoFiles()` → 弹出原生文件选择对话框（支持多选）
2. **选择目录按钮** → 调用 `window.miaomaAPI.fileSelect.selectVideoDirectory()` → 弹出原生目录选择对话框
3. **拖拽区域** → 监听 `ondrop` 事件，从 `event.dataTransfer.files` 中获取文件路径
4. **选择结果展示** → 显示已选择的文件数量和文件名

#### 改动 5：类型定义 — 支持文件路径列表

**文件：** `shared/video-agent.ts`

```ts
// VideoAgentStartInput 改造
export type VideoAgentStartInput = {
    canvas?: VideoAgentCanvasConfig;
    prompt: string;
    selectedVoice: string;
    selectedVoiceType?: string;
    // 新增：直接传文件路径列表
    sourceFilePaths?: string[];
    // 保留：兼容目录模式
    sourceAssetDirectory?: string;
    voiceSpeed?: number;
    voiceVolume?: number;
};
```

#### 改动 6：Agent Tools — 适配文件列表

**文件：** `client/video-agent-tools.ts`

```ts
// scanAssets 节点适配
scanAssets: async ({ input }) => {
    // 模式 1：直接传了文件路径列表
    if (input.sourceFilePaths?.length) {
        // 直接使用传入的文件路径，无需 readdir
        const videoEntries = input.sourceFilePaths
            .filter((p) =>
                supportedVideoExtensions.has(path.extname(p).toLowerCase())
            )
            .map((p) => ({ name: path.basename(p), fullPath: p }));
        // ... 后续抽帧逻辑不变
    }

    // 模式 2：传了目录路径（向后兼容）
    if (input.sourceAssetDirectory) {
        // 原有 readdir 逻辑不变
    }
};
```

#### 改动 7：拖拽支持

**文件：** `renderer/components/create/CreateInputPanel.tsx`

```tsx
// Electron 渲染进程的拖拽需要特殊处理
const handleDrop = (event: React.DragEvent) => {
    event.preventDefault();
    event.stopPropagation();

    const files = event.dataTransfer.files;
    const filePaths: string[] = [];
    for (let i = 0; i < files.length; i++) {
        // Electron 的 File 对象有 path 属性
        const file = files[i] as File & { path?: string };
        if (file.path) {
            filePaths.push(file.path);
        }
    }

    if (filePaths.length > 0) {
        setSourceFilePaths(filePaths);
    }
};
```

> **注意：** Electron 渲染进程中的 `File` 对象扩展了 `path` 属性，这是 Electron 特有的。需要在 `window.d.ts` 中声明。

### 3.3 改动范围总结

| 文件                                              | 改动类型 | 改动量 |
| ------------------------------------------------- | -------- | ------ |
| `shared/video-agent.ts`                           | 修改类型 | 小     |
| `shared/file-select-channels.ts`                  | 新建     | 小     |
| `client/file-select-ipc.ts`                       | 新建     | 小     |
| `client/preload.ts`                               | 新增 API | 小     |
| `client/main.ts`                                  | 注册 IPC | 1 行   |
| `renderer/components/create/CreateInputPanel.tsx` | 重构 UI  | 中     |
| `renderer/types/window.d.ts`                      | 新增类型 | 小     |
| `client/video-agent-tools.ts`                     | 适配逻辑 | 中     |
| `client/video-agent-ipc.ts`                       | 适配输入 | 小     |

### 3.4 不需要改动的部分

- **FFmpeg/FFprobe 处理** — 始终基于本地文件路径操作，不受影响
- **LangGraph Agent 流程** — 不变
- **视频导出** — 不变
- **自定义协议 (miaoma-media://)** — 不变
- **数据库/存储** — 不变

---

## 四、为什么不选"真正的网络上传"方案

| 考虑           | 分析                                                  |
| -------------- | ----------------------------------------------------- |
| **产品定位**   | WiseCut 是免费开源本地工具，BYOK 模式，没有后端服务器 |
| **用户隐私**   | 视频文件是用户私有的，不应上传到第三方                |
| **成本**       | 云存储/CDN 需要持续付费，与"免费开源"定位矛盾         |
| **文件大小**   | 视频文件动辄几百 MB～几 GB，上传到云端成本高、体验差  |
| **技术复杂度** | tus/分片上传需要后端配合，增加大量运维成本            |

**如果未来产品需要支持云端协作**，再考虑引入 tus 协议 + 对象存储方案。当前阶段，本地文件选择是最佳方案。

---

## 五、实施计划

| 步骤 | 内容                                                     | 预估工时 |
| ---- | -------------------------------------------------------- | -------- |
| 1    | 新建 IPC 通道和主进程 handler                            | 0.5h     |
| 2    | Preload 暴露 API + 类型声明                              | 0.5h     |
| 3    | 改造 CreateInputPanel UI（选择文件/目录按钮 + 拖拽区域） | 1.5h     |
| 4    | 适配 VideoAgentStartInput 类型 + scanAssets 逻辑         | 1h       |
| 5    | 适配 video-agent-ipc.ts 的 normalizeStartInput           | 0.5h     |
| 6    | 测试验证                                                 | 1h       |

**总计：约 5 小时**

---

## 六、风险与注意事项

1. **Electron 拖拽安全** — 渲染进程的 `ondrop` 默认被 Electron 禁止，需要在 `webPreferences` 中设置或在主进程中处理 `will-navigate` 事件
2. **文件路径跨平台** — Windows 使用反斜杠，macOS/Linux 使用正斜杠，统一使用 `path.normalize()`
3. **大文件列表** — 如果用户选择了一个包含数百个文件的目录，UI 需要展示摘要而非全部文件名
4. **权限问题** — macOS 沙箱模式下，选择文件需要通过 `dialog` API 获取安全访问权限
5. **向后兼容** — 保留 `sourceAssetDirectory` 字段，确保旧的项目文件仍可正常打开
