import type { Metadata } from 'next';
import type { ReactNode } from 'react';

export const metadata: Metadata = {
    title: 'AI智能剪辑平台服务端',
    description: '妙码智能剪辑平台 - 服务端占位'
};

export default function RootLayout({ children }: { children: ReactNode }) {
    return (
        <html lang="zh-CN">
            <body>{children}</body>
        </html>
    );
}
