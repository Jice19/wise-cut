import type { SVGProps } from 'react';

/**
 * Lucide 内联图标占位。生产应换成 `lucide-react`，但当前 pnpm install 时网络
 * 不稳定（github.com:443 不通），先以内联 SVG 保证可运行。
 * 颜色继承 currentColor，字号随父元素 / Tailwind text-* 走。
 */

type IconName =
    | 'layout-dashboard'
    | 'sparkles'
    | 'scissors'
    | 'upload'
    | 'search'
    | 'bell'
    | 'help-circle';

const PATHS: Record<IconName, JSX.Element> = {
    'layout-dashboard': (
        <>
            <rect x="3" y="3" width="7" height="9" />
            <rect x="14" y="3" width="7" height="5" />
            <rect x="14" y="12" width="7" height="9" />
            <rect x="3" y="16" width="7" height="5" />
        </>
    ),
    sparkles: (
        <>
            <path d="M12 3v3M12 18v3M3 12h3M18 12h3M5.6 5.6l2.1 2.1M16.3 16.3l2.1 2.1M5.6 18.4l2.1-2.1M16.3 7.7l2.1-2.1" />
            <circle cx="12" cy="12" r="3" />
        </>
    ),
    scissors: (
        <>
            <circle cx="6" cy="6" r="3" />
            <circle cx="6" cy="18" r="3" />
            <line x1="20" y1="4" x2="8.12" y2="15.88" />
            <line x1="14.47" y1="14.48" x2="20" y2="20" />
            <line x1="8.12" y1="8.12" x2="12" y2="12" />
        </>
    ),
    upload: (
        <>
            <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" />
            <polyline points="17 8 12 3 7 8" />
            <line x1="12" y1="3" x2="12" y2="15" />
        </>
    ),
    search: (
        <>
            <circle cx="11" cy="11" r="7" />
            <line x1="21" y1="21" x2="16.65" y2="16.65" />
        </>
    ),
    bell: (
        <>
            <path d="M18 8a6 6 0 0 0-12 0c0 7-3 9-3 9h18s-3-2-3-9" />
            <path d="M13.73 21a2 2 0 0 1-3.46 0" />
        </>
    ),
    'help-circle': (
        <>
            <circle cx="12" cy="12" r="9" />
            <path d="M9.09 9a3 3 0 0 1 5.83 1c0 2-3 3-3 3" />
            <line x1="12" y1="17" x2="12.01" y2="17" />
        </>
    )
};

interface IconProps extends Omit<SVGProps<SVGSVGElement>, 'name'> {
    name: IconName;
    /** Tailwind size token, e.g. `size-5` => 20px / `size-4` => 16px。 */
    boxSize?: 4 | 5 | 6 | 8 | 10 | 12;
}

export const Icon = ({
    name,
    boxSize = 5,
    className,
    ...rest
}: IconProps): JSX.Element => {
    const sz = boxSize * 4; // boxSize 5 → 20px
    return (
        <svg
            viewBox="0 0 24 24"
            width={sz}
            height={sz}
            fill="none"
            stroke="currentColor"
            strokeWidth={1.6}
            strokeLinecap="round"
            strokeLinejoin="round"
            className={className}
            {...rest}
        >
            {PATHS[name]}
        </svg>
    );
};
