/* */
import { useEffect, useState } from 'react';

import { ApiConfigModal } from './ApiConfigModal';

type Status = 'loading' | 'configured' | 'unconfigured';

/**
 * 首页(create 视图)底部的小模块 — 显示当前 API Key 配置状态,
 * 点了"修改"按钮调起 ApiConfigModal 改 key。
 *
 * 复用 ApiConfigGate 已经写好的 IPC + Modal 逻辑,这里只是个壳。
 * 状态查询挂 onMount,失败时静默降级显示"未配置",不让 UI 卡住。
 */
export const ApiKeyConfigSection = () => {
    const [status, setStatus] = useState<Status>('loading');
    const [isModalOpen, setIsModalOpen] = useState(false);

    useEffect(() => {
        let cancelled = false;

        const check = async () => {
            try {
                const result = await window.miaomaAPI.apiConfig.getStatus();

                if (cancelled) return;

                setStatus(result.isConfigured ? 'configured' : 'unconfigured');
            } catch {
                if (cancelled) return;

                setStatus('unconfigured');
            }
        };

        void check();

        return () => {
            cancelled = true;
        };
    }, []);

    const handleOpen = () => {
        setIsModalOpen(true);
    };

    const handleClose = () => {
        setIsModalOpen(false);
        // 关掉后重新拉一次状态,确保 "已配置 / 未配置" 显示跟实际一致
        void (async () => {
            try {
                const result = await window.miaomaAPI.apiConfig.getStatus();
                setStatus(result.isConfigured ? 'configured' : 'unconfigured');
            } catch {
                // 静默
            }
        })();
    };

    const handleSave = async (apiKey: string) => {
        const result = await window.miaomaAPI.apiConfig.set({ apiKey });

        if (result.success) {
            setStatus('configured');
            setIsModalOpen(false);
        }

        return result;
    };

    return (
        <>
            <section
                data-api-key-config-section="true"
                className="flex w-[480px] max-w-[calc(100%-80px)] items-center justify-between gap-3 rounded-2xl border border-[#E7E5E0] bg-white/95 px-4 py-2.5 shadow-[0_4px_18px_rgba(28,25,23,0.08)] backdrop-blur"
            >
                <div className="grid gap-0.5">
                    <p className="text-[12px] font-semibold leading-none text-[#1C1917]">
                        API Key 配置
                    </p>
                    <p
                        data-api-key-config-status="true"
                        className="text-[11px] leading-none text-[#78716C]"
                    >
                        {status === 'loading'
                            ? '检测中…'
                            : status === 'configured'
                              ? '已配置 · LLM / TTS 用默认模型'
                              : '未配置 · agent run 会被阻断'}
                    </p>
                </div>
                <button
                    type="button"
                    data-api-key-config-open="true"
                    onClick={handleOpen}
                    className="rounded-lg border border-[#E7E5E0] bg-white px-3 py-1.5 text-[12px] font-semibold text-[#1C1917] transition-colors hover:bg-[#F1EFEC]"
                >
                    {status === 'configured' ? '修改' : '去配置'}
                </button>
            </section>

            {isModalOpen ? (
                <ApiConfigModal onSave={handleSave} onClose={handleClose} />
            ) : null}
        </>
    );
};
