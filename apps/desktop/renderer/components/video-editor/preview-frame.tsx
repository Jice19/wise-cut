import { Icon } from './icons';

/** Pencil `FVvrT PreviewHeader` + `lScWz PlayerArea` + `vyb2d PlayerFrame`。 */

export interface PreviewHeaderProps {
    sceneNum: number;
    totalScenes: number;
    title: string;
    duration?: string;
}

export const PreviewHeader = ({
    sceneNum,
    totalScenes,
    title,
    duration = '00:06'
}: PreviewHeaderProps): JSX.Element => (
    <header className="flex h-12 items-center gap-3 border-b border-border-subtle bg-bg-base px-6">
        <span className="font-mono text-[11px] text-text-tertiary">分镜</span>
        <span className="font-mono text-sm font-bold text-brand tabular-nums">
            {String(sceneNum).padStart(2, '0')}
        </span>
        <span className="font-mono text-xs text-text-tertiary">/</span>
        <span className="font-mono text-xs text-text-tertiary">
            {String(totalScenes).padStart(2, '0')}
        </span>
        <span className="text-text-tertiary">·</span>
        <span className="text-sm font-semibold text-text-primary">{title}</span>
        <span className="text-text-tertiary">·</span>
        <span className="font-mono text-xs text-brand tabular-nums">
            {duration}
        </span>

        <div className="flex-1" />

        <Pill icon="monitor" label="1920×1080 · 30fps" />
        <ZoomBox />
        <IconBtn icon="maximize-2" />
    </header>
);

const Pill = ({
    icon,
    label
}: {
    icon: 'monitor';
    label: string;
}): JSX.Element => (
    <div className="flex h-7 items-center gap-1.5 rounded-md border border-border-subtle bg-bg-elevated px-2.5 text-[10px] text-text-secondary">
        <Icon name={icon} boxSize={4} />
        <span className="font-mono">{label}</span>
    </div>
);

const ZoomBox = (): JSX.Element => (
    <div className="flex h-7 items-center gap-0.5 rounded-md border border-border-subtle bg-bg-elevated p-0.5">
        <button
            type="button"
            aria-label="缩小"
            className="flex h-6 w-6 items-center justify-center rounded text-text-secondary hover:bg-bg-hover"
        >
            −
        </button>
        <div className="flex h-6 items-center justify-center rounded px-1.5 text-[10px] text-text-secondary">
            100%
        </div>
        <button
            type="button"
            aria-label="放大"
            className="flex h-6 w-6 items-center justify-center rounded text-text-secondary hover:bg-bg-hover"
        >
            +
        </button>
    </div>
);

const IconBtn = ({ icon }: { icon: 'maximize-2' }): JSX.Element => (
    <button
        type="button"
        aria-label="最大化"
        className="flex h-7 w-7 items-center justify-center rounded-md border border-border-subtle bg-bg-elevated text-text-secondary hover:bg-bg-hover"
    >
        <Icon name={icon} boxSize={4} />
    </button>
);

/** Pencil `lScWz PlayerArea` 黑色视频外框。背景视频占位 + 中央 play 按钮 + 4 个 corner shadow + 角标 TC。 */
export const PreviewFrame = ({
    sceneLabel = '分镜 03 · 樱花特写 · 慢镜头'
}: {
    sceneLabel?: string;
}): JSX.Element => (
    <div className="flex flex-1 items-center justify-center bg-bg-base px-6">
        <div
            className="relative flex aspect-video w-full max-w-[720px] items-center justify-center overflow-hidden rounded-lg border border-border-strong"
            style={{
                background:
                    'linear-gradient(135deg, #0A0A0C 0%, #1F1F22 50%, #0A0A0C 100%)'
            }}
        >
            <CornerTL />
            <CornerTR />
            <CornerBL />
            <CornerBR />

            {/* 中央播放按钮（Pencil PlayBtn + glow） */}
            <button
                type="button"
                aria-label="播放"
                className="relative z-10 flex h-16 w-16 items-center justify-center rounded-full bg-brand"
                style={{ boxShadow: '0 0 24px #00E7FF66' }}
            >
                <Icon name="play" boxSize={6} className="text-text-on-brand" />
            </button>

            {/* 角标（左上 REC） */}
            <div className="absolute left-3 top-3 flex items-center gap-1.5 rounded bg-black/70 px-2 py-0.5">
                <span className="inline-block h-1.5 w-1.5 rounded-full bg-danger" />
                <span className="font-mono text-[10px] font-semibold text-text-primary">
                    REC
                </span>
            </div>
            {/* 角标（右上 分辨率） */}
            <div className="absolute right-3 top-3 rounded bg-black/70 px-2 py-0.5 font-mono text-[10px] text-text-primary">
                1080P · 30fps
            </div>
            {/* 角标（右下 时间码） */}
            <div className="absolute bottom-3 right-3 rounded bg-black/70 px-2 py-0.5 font-mono text-[10px] text-text-primary">
                00:01:24:15 / 00:06:00:00
            </div>
            {/* 角标（左下场景说明） */}
            <div className="absolute bottom-3 left-6 text-[11px] text-white/50">
                {sceneLabel}
            </div>
        </div>
    </div>
);

/* 四个角的 radial gradient overlay (Pencil Corner_TL/TR/BL/BR) */
const CornerTL = (): JSX.Element => (
    <span
        aria-hidden="true"
        className="absolute left-0 top-0 h-20 w-20"
        style={{
            background:
                'radial-gradient(circle at 0 0, #000 0%, transparent 40%)'
        }}
    />
);
const CornerTR = (): JSX.Element => (
    <span
        aria-hidden="true"
        className="absolute right-0 top-0 h-20 w-20"
        style={{
            background:
                'radial-gradient(circle at 100% 0, #000 0%, transparent 40%)'
        }}
    />
);
const CornerBL = (): JSX.Element => (
    <span
        aria-hidden="true"
        className="absolute bottom-0 left-0 h-20 w-20"
        style={{
            background:
                'radial-gradient(circle at 0 100%, #000 0%, transparent 40%)'
        }}
    />
);
const CornerBR = (): JSX.Element => (
    <span
        aria-hidden="true"
        className="absolute bottom-0 right-0 h-20 w-20"
        style={{
            background:
                'radial-gradient(circle at 100% 100%, #000 0%, transparent 40%)'
        }}
    />
);
