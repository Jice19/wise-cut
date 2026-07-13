/**
 * 单帧画面理解 prompt —— 给 M3 的中文指令 + 严格 JSON schema。
 *
 * 关键约定(plan §2.4):
 *   - 不让模型用 Markdown 包裹 JSON(用 "严格 JSON,不要 Markdown" 显式禁止)
 *   - schema 示例用中文,description 限 ≤80 字
 *   - 用 `<frames>` 占位符,运行时由调用方替换成 base64 image_url part 列表
 *
 * 调用方:
 *   - model-provider 包装层把 prompt 注入到 messages[0].content,
 *     然后把 frames 列表作为后续 image_url parts 追加
 */

export const FRAME_DESCRIPTION_SYSTEM_PROMPT = `你是视频关键帧理解智能体。请逐帧输出画面内容,严格遵守以下规则:

1. 只输出 JSON,不要 Markdown 代码块包裹,不要任何解释性文字
2. 严格 JSON 语法:用双引号、不允许尾随逗号
3. 输出 schema:
{
  "frames": [
    {
      "frameId": "f-001",
      "description": "≤80 字的画面描述,中文,主谓宾完整",
      "objects": ["画面中物体名词,数组,可空"],
      "actions": ["画面中发生的动作,数组,可空"],
      "mood": "整体情绪,1~6 字,如 温馨 / 紧张 / 平静 / 欢快"
    }
  ]
}
4. 每个 frameId 必须出现在输出里,顺序与输入一致
5. 画面信息不足时,description 写"画面信息不足",objects / actions 留空数组,mood 写"unknown"`;

export const FRAME_DESCRIPTION_USER_PROMPT_TEMPLATE = `请按以下顺序逐帧描述:

<frames>`;

/**
 * 把"按帧顺序"的 frameId 列表插到 user prompt 里,让模型知道输入顺序与 frameId 映射。
 * 模型从 image_url 列表拿画面,prompt 文本只是元数据。
 */
export const buildFrameIdList = (frameIds: readonly string[]): string =>
    frameIds.map((id, i) => `${i + 1}. ${id}`).join('\n');
