import { Icon } from './icons';

/** Pencil `JVeXR TransportBar` — 播放器下方播放控制条 + 时间显示 + 音量。 */

export interface TransportBarProps {
    current?: string;
    total?: string;
}

export const TransportBar = ({
    current = '00:01:24',
    total = '00:06:00'
}: TransportBarProps): JSX.Element => (
    <div className="flex items-center justify-center bg-bg-base px-6 py-2">
        <div className="flex h-11 items-center gap-3 rounded-[22px] border border-border-subtle bg-bg-elevated px-4">
            <TransportBtn name="skip-back" />
            <TransportBtn name="square" />
            <button
                type="button"
                aria-label="播放"
                className="flex h-8 w-8 items-center justify-center rounded-full bg-brand text-text-on-brand"
            >
                <Icon name="play" boxSize={4} className="translate-x-[1px]" />
            </button>
            <TransportBtn name="skip-forward" />

            {/* 时间码 */}
            <span className="font-mono text-xs text-text-primary tabular-nums">
                {current}
            </span>
            <span className="font-mono text-xs text-text-tertiary">
                {' / '}
            </span>
            <span className="font-mono text-xs text-text-tertiary tabular-nums">
                {total}
            </span>

            <div className="flex-1" />

            <div className="flex h-7 items-center gap-2">
                <Icon
                    name="volume-2"
                    boxSize={4}
                    className="text-text-secondary"
                />
                <div className="h-1 w-16 rounded-sm bg-bg-sunken" />
            </div>
            <TransportBtn name="maximize" />
        </div>
    </div>
);

const TransportBtn = ({
    name
}: {
    name: 'skip-back' | 'square' | 'skip-forward' | 'maximize';
}): JSX.Element => (
    <button
        type="button"
        aria-label={name}
        className="flex h-7 w-7 items-center justify-center text-text-secondary hover:text-text-primary"
    >
        <Icon name={name} boxSize={4} />
    </button>
);
