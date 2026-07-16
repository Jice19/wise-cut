/* */
import type { ReactNode } from 'react';

type RootLayoutProps = {
    children: ReactNode;
};

export default function RootLayout({ children }: RootLayoutProps) {
    return (
        <html lang="zh-CN">
            <body>{children}</body>
        </html>
    );
}
