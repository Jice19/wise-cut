import { useEffect, useState } from 'react';

export const HomeScreen = (): JSX.Element => {
    const [version, setVersion] = useState('…');

    useEffect(() => {
        // 通过 preload 暴露的 miaomaAPI 调用主进程，验证 IPC 链路畅通
        void window.miaomaAPI
            .getVersion()
            .then(setVersion)
            .catch(() => setVersion('unknown'));
    }, []);

    return (
        <main className="flex h-full flex-col items-center justify-center gap-4 p-8">
            <h1 className="text-3xl font-semibold">AI智能剪辑平台</h1>
            <p className="text-slate-600">AI 智能剪辑 · 桌面端已就绪</p>
            <p className="text-sm text-slate-400">Electron {version}</p>
        </main>
    );
};
