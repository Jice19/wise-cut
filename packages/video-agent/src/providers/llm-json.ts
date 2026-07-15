/**
 * 从 LLM 文本响应里抠 JSON —— 给 unit test 直接 import。
 *
 * 兼容多种 reasoning-model 输出(plan §2.4 prompt 显式禁止 markdown 但容错必须有):
 *   1. 纯 JSON(期望路径)
 *   2. ```json ... ``` 代码块包裹(模型未遵守 prompt)
 *   3. 前后杂有解释文字(部分模型习惯)
 *   4. commit 22:reasoning model(DeepSeek-V3 / R1 类)输出 `` 块,
 *      后面再接 JSON —— 剥掉 thinking 块后再找 { }
 *   5. 多层围栏嵌套(```json ...``` 里再含 ``,只剥最外层)
 */

const STRIP_THINKING_BLOCK = (text: string): string =>
    text.replace(/<\s*\/?[Tt]hink(?:ing)?(?:\s[^>]*)?>/g, '');

export const extractJsonFromLlmResponse = (text: string): unknown => {
    // commit 22:先剥掉 thinking 块(豆包/DeepSeek-V3/R1 等 reasoning 模型
    // 会在 JSON 前面输出 `` 块,indexOf('{') 落到 thinking 文本里失败)。
    const withoutThinking = STRIP_THINKING_BLOCK(text);

    const fencedMatch = withoutThinking.match(/```(?:json)?\s*([\s\S]*?)```/);
    const candidate = fencedMatch ? fencedMatch[1]! : withoutThinking;
    const firstBrace = candidate.indexOf('{');
    const lastBrace = candidate.lastIndexOf('}');

    if (firstBrace < 0 || lastBrace <= firstBrace) {
        throw new Error(
            `No JSON object found in LLM response: ${text.slice(0, 200)}`
        );
    }

    try {
        return JSON.parse(candidate.slice(firstBrace, lastBrace + 1));
    } catch (error) {
        throw new Error(
            `Failed to parse JSON from LLM response: ${(error as Error).message}`
        );
    }
};
