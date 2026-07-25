/* */
import { useEffect, useState } from 'react';

type SaveState =
    | { kind: 'idle' }
    | { kind: 'saving' }
    | { kind: 'error'; message: string };

/**
 * 开发期专用的 API Key 输入遮罩。`.env` 弃用之后,用户得在 UI 里
 * 填 key,没填就开不了 agent run。Modal 全屏覆盖,不能跳过。
 *
 * 后续要做正式 Settings 页时,这个组件可以从"强制蒙层"降级为
 * "用户主动打开的对话框",其他逻辑不动。
 */
export const ApiConfigModal = ({
    initialApiKey,
    onClose,
    onSave
}: {
    initialApiKey?: string;
    onClose?: () => void;
    onSave: (apiKey: string) => Promise<{ success: boolean }>;
}) => {
    const [apiKey, setApiKey] = useState(initialApiKey ?? '');
    const [showKey, setShowKey] = useState(false);
    const [saveState, setSaveState] = useState<SaveState>({ kind: 'idle' });

    useEffect(() => {
        if (initialApiKey) setApiKey(initialApiKey);
    }, [initialApiKey]);

    const handleSave = async () => {
        if (!apiKey.trim()) {
            setSaveState({
                kind: 'error',
                message: 'API Key 不能为空'
            });

            return;
        }

        setSaveState({ kind: 'saving' });

        try {
            const result = await onSave(apiKey.trim());

            if (result.success) {
                setSaveState({ kind: 'idle' });
            } else {
                setSaveState({
                    kind: 'error',
                    message: '保存失败,请重试'
                });
            }
        } catch (error) {
            setSaveState({
                kind: 'error',
                message: error instanceof Error ? error.message : '保存失败'
            });
        }
    };

    return (
        <div
            data-api-config-modal="true"
            className="fixed inset-0 z-50 grid place-items-center bg-black/45 p-6"
        >
            <div className="grid w-[480px] max-w-full gap-4 rounded-2xl border border-[#E7E5E0] bg-white p-6 shadow-[0_24px_60px_rgba(28,25,23,0.18)]">
                <div className="grid gap-1">
                    <div className="flex items-start justify-between gap-3">
                        <h2 className="text-[18px] font-bold text-[#1C1917]">
                            配置 ARK API Key
                        </h2>
                        {onClose ? (
                            <button
                                type="button"
                                data-api-config-close="true"
                                onClick={onClose}
                                aria-label="关闭"
                                className="-mr-1 -mt-1 grid h-7 w-7 place-items-center rounded-full text-[#78716C] hover:bg-[#F1EFEC] hover:text-[#1C1917]"
                            >
                                ✕
                            </button>
                        ) : null}
                    </div>
                    <p className="text-[13px] leading-[1.5] text-[#57534E]">
                        Miaoma 用火山引擎 ARK 的 LLM + TTS。Key 加密存到
                        本机,只你用得到。还没 key?去{' '}
                        <a
                            href="https://www.volcengine.com/docs/82379"
                            target="_blank"
                            rel="noopener noreferrer"
                            className="text-[#D97706] underline"
                        >
                            火山引擎控制台
                        </a>{' '}
                        申请一个(走「方舟」服务)。
                    </p>
                </div>

                <div className="grid gap-1.5">
                    <label
                        htmlFor="api-key-input"
                        className="text-[12px] font-semibold text-[#1C1917]"
                    >
                        API Key
                    </label>
                    <div className="flex items-stretch gap-2">
                        <input
                            id="api-key-input"
                            data-api-config-input="true"
                            type={showKey ? 'text' : 'password'}
                            value={apiKey}
                            onChange={(event) => {
                                setApiKey(event.target.value);
                                if (saveState.kind === 'error') {
                                    setSaveState({ kind: 'idle' });
                                }
                            }}
                            placeholder="粘贴你的 ARK API Key"
                            autoComplete="off"
                            spellCheck={false}
                            className="flex-1 rounded-lg border border-[#E7E5E0] bg-white px-3 py-2 text-[14px] outline-none focus:border-[#D97706]"
                        />
                        <button
                            type="button"
                            data-api-config-toggle-visibility="true"
                            onClick={() => setShowKey((value) => !value)}
                            className="rounded-lg border border-[#E7E5E0] bg-white px-3 text-[12px] font-medium text-[#57534E] hover:bg-[#F1EFEC]"
                        >
                            {showKey ? '隐藏' : '显示'}
                        </button>
                    </div>
                </div>

                {saveState.kind === 'error' ? (
                    <p
                        data-api-config-error="true"
                        className="rounded-md bg-[#FEE2E2] px-3 py-2 text-[12px] font-medium text-[#B91C1C]"
                    >
                        {saveState.message}
                    </p>
                ) : null}

                <div className="flex items-center justify-between gap-4">
                    <p className="text-[11px] leading-[1.4] text-[#78716C]">
                        BASE_URL / LLM / TTS 模型用默认值,后续要做 UI 再加。
                    </p>
                    <button
                        type="button"
                        data-api-config-save="true"
                        disabled={saveState.kind === 'saving'}
                        onClick={handleSave}
                        className="rounded-lg bg-[#D97706] px-5 py-2 text-[14px] font-bold text-white shadow-[0_4px_12px_rgba(217,119,6,0.25)] transition-colors hover:bg-[#B45309] disabled:cursor-not-allowed disabled:opacity-60"
                    >
                        {saveState.kind === 'saving' ? '保存中…' : '保存'}
                    </button>
                </div>
            </div>
        </div>
    );
};
