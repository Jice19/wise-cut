import type { SVGProps } from 'react';

/**
 * Lucide 内联图标占位。生产应换成 `lucide-react`，当前 pnpm install 时网络
 * 不稳定（github.com:443 不通），先以内联 SVG 保证可运行。
 * 颜色继承 currentColor，字号随父元素 / Tailwind text-* 走。
 *
 * 名称集合从 Pencil .pen 屏幕提取（编辑器 Bx8VF 涉及最多）。
 */

type IconName =
    | 'search'
    | 'plus'
    | 'chevrons-up-down'
    | 'pointer'
    | 'scissors'
    | 'gauge'
    | 'type'
    | 'sparkles'
    | 'music'
    | 'zoom-out'
    | 'zoom-in'
    | 'monitor'
    | 'maximize-2'
    | 'maximize'
    | 'layers'
    | 'mic'
    | 'image'
    | 'sliders-horizontal'
    | 'volume-2'
    | 'skip-back'
    | 'square'
    | 'skip-forward'
    | 'play'
    | 'ellipsis'
    | 'upload'
    | 'layout-dashboard'
    | 'help-circle'
    | 'bell';

const PATHS: Record<IconName, JSX.Element> = {
    search: (
        <>
            <circle cx="11" cy="11" r="7" />
            <line x1="21" y1="21" x2="16.65" y2="16.65" />
        </>
    ),
    plus: (
        <>
            <line x1="12" y1="5" x2="12" y2="19" />
            <line x1="5" y1="12" x2="19" y2="12" />
        </>
    ),
    'chevrons-up-down': (
        <>
            <polyline points="7 13 12 18 17 13" />
            <polyline points="7 6 12 11 17 6" />
        </>
    ),
    pointer: (
        <>
            <path d="M22 14a8 8 0 0 1-8 8" />
            <path d="M18 11v-1a2 2 0 0 0-2-2v-1c0-.5-.5-1-1-1h-1V4a2 2 0 0 0-2-2h-1V1l-4 4v15a2 2 0 0 0 2 2h1l2 4h2l1-4h2a2 2 0 0 0 2-2v-2a2 2 0 0 0-2-2h-2z" />
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
    gauge: (
        <>
            <path d="M12 14l4-4" />
            <path d="M3.34 19a10 10 0 1 1 17.32 0" />
        </>
    ),
    type: (
        <>
            <polyline points="4 7 4 4 20 4 20 7" />
            <line x1="9" y1="20" x2="15" y2="20" />
            <line x1="12" y1="4" x2="12" y2="20" />
        </>
    ),
    sparkles: (
        <>
            <path d="M12 3v3M12 18v3M3 12h3M18 12h3M5.6 5.6l2.1 2.1M16.3 16.3l2.1 2.1M5.6 18.4l2.1-2.1M16.3 7.7l2.1-2.1" />
            <circle cx="12" cy="12" r="3" />
        </>
    ),
    music: (
        <>
            <path d="M9 18V5l12-2v13" />
            <circle cx="6" cy="18" r="3" />
            <circle cx="18" cy="16" r="3" />
        </>
    ),
    'zoom-out': (
        <>
            <circle cx="11" cy="11" r="7" />
            <line x1="21" y1="21" x2="16.65" y2="16.65" />
            <line x1="8" y1="11" x2="14" y2="11" />
        </>
    ),
    'zoom-in': (
        <>
            <circle cx="11" cy="11" r="7" />
            <line x1="21" y1="21" x2="16.65" y2="16.65" />
            <line x1="11" y1="8" x2="11" y2="14" />
            <line x1="8" y1="11" x2="14" y2="11" />
        </>
    ),
    monitor: (
        <>
            <rect x="2" y="3" width="20" height="14" rx="2" />
            <line x1="8" y1="21" x2="16" y2="21" />
            <line x1="12" y1="17" x2="12" y2="21" />
        </>
    ),
    'maximize-2': (
        <>
            <polyline points="15 3 21 3 21 9" />
            <polyline points="9 21 3 21 3 15" />
            <line x1="21" y1="3" x2="14" y2="10" />
            <line x1="3" y1="21" x2="10" y2="14" />
        </>
    ),
    maximize: (
        <>
            <path d="M8 3H5a2 2 0 0 0-2 2v3" />
            <path d="M21 8V5a2 2 0 0 0-2-2h-3" />
            <path d="M3 16v3a2 2 0 0 0 2 2h3" />
            <path d="M16 21h3a2 2 0 0 0 2-2v-3" />
        </>
    ),
    layers: (
        <>
            <polygon points="12 2 2 7 12 12 22 7 12 2" />
            <polyline points="2 17 12 22 22 17" />
            <polyline points="2 12 12 17 22 12" />
        </>
    ),
    mic: (
        <>
            <path d="M12 2a3 3 0 0 0-3 3v7a3 3 0 0 0 6 0V5a3 3 0 0 0-3-3z" />
            <path d="M19 10v2a7 7 0 0 1-14 0v-2" />
            <line x1="12" y1="19" x2="12" y2="22" />
        </>
    ),
    image: (
        <>
            <rect x="3" y="3" width="18" height="18" rx="2" />
            <circle cx="9" cy="9" r="2" />
            <path d="M21 15l-5-5L5 21" />
        </>
    ),
    'sliders-horizontal': (
        <>
            <line x1="21" y1="6" x2="14" y2="6" />
            <line x1="10" y1="6" x2="3" y2="6" />
            <line x1="21" y1="12" x2="12" y2="12" />
            <line x1="8" y1="12" x2="3" y2="12" />
            <line x1="21" y1="18" x2="16" y2="18" />
            <line x1="12" y1="18" x2="3" y2="18" />
            <circle cx="12" cy="6" r="2" />
            <circle cx="10" cy="12" r="2" />
            <circle cx="14" cy="18" r="2" />
        </>
    ),
    'volume-2': (
        <>
            <polygon points="11 5 6 9 2 9 2 15 6 15 11 19 11 5" />
            <path d="M19.07 4.93a10 10 0 0 1 0 14.14M15.54 8.46a5 5 0 0 1 0 7.07" />
        </>
    ),
    'skip-back': (
        <>
            <polygon points="19 20 9 12 19 4 19 20" />
            <line x1="5" y1="19" x2="5" y2="5" />
        </>
    ),
    square: <rect x="6" y="6" width="12" height="12" />,
    'skip-forward': (
        <>
            <polygon points="5 4 15 12 5 20 5 4" />
            <line x1="19" y1="5" x2="19" y2="19" />
        </>
    ),
    play: <polygon points="6 4 20 12 6 20 6 4" />,
    ellipsis: (
        <>
            <circle cx="12" cy="12" r="1" />
            <circle cx="19" cy="12" r="1" />
            <circle cx="5" cy="12" r="1" />
        </>
    ),
    'layout-dashboard': (
        <>
            <rect x="3" y="3" width="7" height="9" />
            <rect x="14" y="3" width="7" height="5" />
            <rect x="14" y="12" width="7" height="9" />
            <rect x="3" y="16" width="7" height="5" />
        </>
    ),
    'help-circle': (
        <>
            <circle cx="12" cy="12" r="9" />
            <path d="M9.09 9a3 3 0 0 1 5.83 1c0 2-3 3-3 3" />
            <line x1="12" y1="17" x2="12.01" y2="17" />
        </>
    ),
    bell: (
        <>
            <path d="M18 8a6 6 0 0 0-12 0c0 7-3 9-3 9h18s-3-2-3-9" />
            <path d="M13.73 21a2 2 0 0 1-3.46 0" />
        </>
    ),
    upload: (
        <>
            <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" />
            <polyline points="17 8 12 3 7 8" />
            <line x1="12" y1="3" x2="12" y2="15" />
        </>
    )
};

interface IconProps extends Omit<SVGProps<SVGSVGElement>, 'name'> {
    name: IconName;
    /** boxSize 5 → 20px。 */
    boxSize?: 4 | 5 | 6 | 8 | 10 | 12;
}

export const Icon = ({
    name,
    boxSize = 5,
    className,
    ...rest
}: IconProps): JSX.Element => {
    const sz = boxSize * 4;
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
