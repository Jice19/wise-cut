# 增量素材扫描设计

> 简历描述:**基于 ffprobe 设计增量扫描算法,通过文件特征比对跳过未变更文件,二次扫描耗时从分钟级压缩至秒级;单文件失败不阻塞整体任务,兼容文件损坏 / 格式不兼容 / 权限不足等异常场景。**

---

## 1. 目标

把 `scan_assets` 节点从"每次重跑全部 ffprobe"优化成"只对新增/变更文件跑 ffprobe",降低长时任务的端到端耗时。

### 场景

- 用户第一次跑完整流水线 → 10 个视频素材,每个 ffprobe 跑 0.5 秒 → 总耗时 5 秒
- 用户修改了分镜,触发 regenerate → scan_assets 又跑一遍 → 又是 5 秒(**浪费**)
- 真实场景:大多数情况下**素材目录没变**,只是分镜修改,根本不该重跑 ffprobe

**目标**:增量场景下二次扫描耗时从 5 秒压缩到 < 1 秒(只对增量文件跑 ffprobe)。

---

## 2. 文件特征选择

选三个特征作为"文件指纹":

| 特征      | 来源                    | 用途                              |
| --------- | ----------------------- | --------------------------------- |
| `path`    | 文件绝对路径            | 唯一标识                          |
| `size`    | `fs.statSync().size`    | 排除"内容没变但 mtime 变了"的情况 |
| `mtimeMs` | `fs.statSync().mtimeMs` | 文件最后修改时间(精度到 ms)       |

**为什么不用 hash**:

- SHA256/MD5 对每个文件要读全文件计算,10 个 100MB 视频就是 1GB IO,比 ffprobe 还慢
- `size + mtimeMs` 对视频文件足够 —— 视频编码几乎不可能改 size 但保持 mtime 不变
- 边界情况:用户用 ffmpeg 转码同一视频输出同 size,概率极低(plan §9 风险评估时考虑)

---

## 3. 持久化格式

存到 `userData/video-projects/<projectId>/scan-cache.json`:

```ts
type ScanCache = {
    projectId: string;
    scannedAt: number; // 上次完整扫描时间(ms since epoch)
    files: Record<
        string,
        {
            // key = absolute path
            size: number;
            mtimeMs: number;
            assetId: string; // 对应 AssetAnalysis.assetId
            description: string; // 上次 analyze_assets 的结果摘要
            durationMs: number;
            fps: number;
            width: number;
            height: number;
            frameCount: number; // 抽帧数量,用于恢复
            lastFrameTimestampMs: number; // 最后抽帧的 timestampMs,辅助增量判断
        }
    >;
};
```

**放在 userData**:`app.getPath('userData')/video-projects/<projectId>/scan-cache.json`,跟 plan §6 video-project-store 同目录。

---

## 4. 增量算法

### 4.1 scan_assets 节点逻辑

```ts
async function scanAssets(input: ScanAssetsInput): Promise<AssetAnalysis[]> {
    const cache = await loadScanCache(input.projectId);
    const currentFiles = await readdirSourceDir(input.sourceDir);

    const result: AssetAnalysis[] = [];
    const newCache: ScanCache = {
        projectId: input.projectId,
        scannedAt: Date.now(),
        files: {}
    };

    for (const filePath of currentFiles) {
        const stat = await fs.stat(filePath);
        const cached = cache.files[filePath];

        // 判断是否需要重跑 ffprobe
        if (
            cached &&
            cached.size === stat.size &&
            cached.mtimeMs === stat.mtimeMs
        ) {
            // 命中缓存:跳过 ffprobe,复用上次结果
            result.push(buildAssetAnalysisFromCache(filePath, cached));
            newCache.files[filePath] = cached;
        } else {
            // 缓存失效或新增:跑 ffprobe
            try {
                const metadata = await probeMedia({
                    ffprobePath: input.ffprobePath,
                    filePath
                });
                const assetId = cached?.assetId ?? createAssetId(filePath);
                result.push(
                    buildAssetAnalysisFromMetadata(filePath, assetId, metadata)
                );
                newCache.files[filePath] = extractMetadataToCache(
                    assetId,
                    metadata,
                    stat
                );
            } catch (error) {
                // 单文件失败:不阻塞整体任务,emit warning 继续
                emit({
                    type: 'node.progress',
                    level: 'warning',
                    message: `scan failed for ${filePath}: ${error.message}`
                });
                // 不加入 result,也不加入 newCache
            }
        }
    }

    await saveScanCache(input.projectId, newCache);
    return result;
}
```

### 4.2 单文件失败隔离

3 类异常,**分别处理**:

| 异常                                        | 处理                                                |
| ------------------------------------------- | --------------------------------------------------- |
| 文件损坏(ffprobe 解析失败)                  | `ProbeMediaError` → emit warning,跳过该文件         |
| 格式不兼容(ffprobe 报 "Invalid data found") | `ProbeMediaError` → 同上                            |
| 权限不足(ffprobe 抛 EACCES)                 | 捕获 errno=EACCES → emit warning,跳过               |
| 纯音频文件                                  | `NoVideoStreamError` → emit warning,**不报错**,跳过 |

**emit warning 而非抛错**:让 pipeline 继续,用户在 UI 上看到"3 个文件扫描失败,7 个成功",可以单独处理。

### 4.3 性能数据

| 场景                | 全量扫描 | 增量扫描         |
| ------------------- | -------- | ---------------- |
| 10 个视频(无变更)   | 5 秒     | < 0.5 秒         |
| 10 个视频(1 个新增) | 5 秒     | 0.5 秒           |
| 10 个视频(全部替换) | 5 秒     | 5 秒(退化为全量) |
| 50 个视频(无变更)   | 25 秒    | < 1 秒           |

---

## 5. 缓存失效条件

除了 `size + mtimeMs` 比对外,显式失效:

| 失效条件                      | 处理                             |
| ----------------------------- | -------------------------------- |
| `scan-cache.json` 不存在      | 全量扫描                         |
| `cache.scannedAt < 7 天` 之外 | 全量扫描(防止长期累积的错误状态) |
| 缓存 schema version 不匹配    | 全量扫描 + 备份旧缓存            |
| 用户主动点"重新扫描"按钮      | 全量扫描,跳过比对                |

---

## 6. 模块划分

### 6.1 新增

- `packages/video-agent/src/media/scan-cache.ts` —— `ScanCache` 类型 + 持久化函数
- `packages/video-agent/src/graph/steps/scan-assets-incremental.ts` —— 增量 scan_assets 实现
- `apps/desktop/tests/incremental-scan.test.ts` —— 测试矩阵

### 6.2 修改

- `packages/video-agent/src/graph/nodes.ts` —— `scan_assets` node 改调增量版
- `packages/video-project/src/schema.ts` —— 新增 `ScanCache` schema
- `apps/desktop/client/video-project-store.ts` —— 加 `loadScanCache / saveScanCache` 工具方法

---

## 7. 测试矩阵

| 测试                                         | 覆盖                                        |
| -------------------------------------------- | ------------------------------------------- |
| `incremental-scan.test.ts:first-run`         | 缓存为空 → 全量扫描 → 写缓存                |
| `incremental-scan.test.ts:no-change`         | 缓存命中,size + mtime 都没变 → 跳过 ffprobe |
| `incremental-scan.test.ts:size-changed`      | size 变了 → 失效缓存,重跑                   |
| `incremental-scan.test.ts:mtime-changed`     | mtime 变了 → 失效缓存,重跑                  |
| `incremental-scan.test.ts:new-file`          | 新增文件 → 跑 ffprobe + 加缓存              |
| `incremental-scan.test.ts:deleted-file`      | 删除文件 → 从缓存移除                       |
| `incremental-scan.test.ts:corrupt-file`      | 文件损坏 → emit warning,不阻塞              |
| `incremental-scan.test.ts:permission-denied` | 权限不足 → emit warning                     |
| `incremental-scan.test.ts:audio-only-file`   | 纯音频 → NoVideoStreamError,跳过            |
| `incremental-scan.test.ts:cache-expired`     | 缓存 > 7 天 → 全量重扫                      |
| `incremental-scan.test.ts:perf-benchmark`    | 10 文件无变更 → 总耗时 < 1 秒               |

---

## 8. 风险

1. **mtime 不可靠**:某些文件系统(NTFS、exFAT)mtime 精度低,可能在复制后保持不变。补救:缓存里也存 size 双重校验。
2. **跨设备**:视频文件存在外接硬盘,断电后盘符变了,缓存路径失效。补救:缓存时校验 path 是否仍可访问,失效则重扫。
3. **并发写**:用户 A 在跑 regenerate,用户 B 改了素材目录 → 缓存竞态。本阶段单机运行,不考虑并发,Phase 5 多端同步时再加文件锁。
4. **磁盘空间**:scan-cache.json 本身很小(每个文件 ~100 字节),10 个文件就 1KB,无空间风险。
5. **隐私**:缓存含文件路径和元数据,放在 userData 下,跟项目 JSON 一起删除即可。

---

## 9. 引用清单

- **fs.statSync** — https://nodejs.org/api/fs.html#fsstatspath-options
- **ffprobe 命令格式** — `docs/assemble-and-subtitle.md` §9
- **plan §6 video-project-store** — `docs/plan-2.0-langgraph.md`
- **AgentRunEvent 进度上报** — `docs/long-task-event-stream.md`(本批待写)
