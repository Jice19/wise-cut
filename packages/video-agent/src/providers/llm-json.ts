/**
 * 从 LLM 文本响应里抠 JSON —— 给 unit test 直接 import。
 *
 * 兼容三种情形(plan §2.4 prompt 显式禁止 markdown 但容错必须有):
 *   1. 纯 JSON(期望路径)
 *   2. ```json ... ``` 代码块包裹(模型未遵守 prompt)
 *   3. 前后杂有解释文字(部分模型习惯)
 */

export const extractJsonFromLlmResponse = (text: string): unknown => {
    const fencedMatch = text.match(/```(?:json)?\s*([\s\S]*?)```/);
    const candidate = fencedMatch ? fencedMatch[1]! : text;
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
