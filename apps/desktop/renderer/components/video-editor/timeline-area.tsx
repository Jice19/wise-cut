/**
 * Pencil `LzeXM TimelineArea` 拆解后的两部分：
 * - TimeRuler：顶部刻度尺 (Sa2K5)
 * - TimelineTracks：三条 V1/A1/V2 轨道 + playhead (gKltV)
 */

import type { ReactNode } from 'react';

const TICK_LABELS: readonly string[] = [
    '00:00',
    '00:05',
    '00:10',
    '00:15',
    '00:20',
    '00:25',
    '00:30'
];

export const TimeRuler = (): JSX.Element => (
    <div role="presentation" className="flex h-6 items-end bg-bg-sunken">
        {TICK_LABELS.map((label) => (
            <div
                key={label}
                role="presentation"
                className="flex h-6 w-[160px] flex-col items-start justify-end gap-0.5 pl-1"
            >
                <div className="h-1.5 w-px bg-text-tertiary" />
                <span className="font-mono text-[9px] text-text-tertiary">
                    {label}
                </span>
            </div>
        ))}
    </div>
);

interface TrackSegment {
    color: string;
    label?: string;
    width: number;
}

interface TrackProps {
    label: string;
    /** Pencil 中 V1/A1/V2 轨道的色块数（高度 80，含 chip clips）。 */
    segments: readonly TrackSegment[];
}

const Track = ({ label, segments }: TrackProps): JSX.Element => (
    <div className="flex h-20 w-full border-b border-border-subtle">
        {/* 左侧轨道 label */}
        <div
            role="presentation"
            className="flex w-[100px] flex-col items-center justify-center gap-1 border-r border-border-subtle bg-bg-elevated"
        >
            <span className="font-mono text-[10px] text-text-tertiary">
                {label}
            </span>
        </div>
        {/* 右侧轨道区域，clip blocks */}
        <div className="flex flex-1 items-center gap-1.5 bg-bg-base p-2">
            {segments.map((s, i) => (
                <div
                    key={i}
                    role="presentation"
                    className="flex h-12 items-center justify-center rounded text-[10px] font-semibold text-text-primary"
                    style={{
                        width: `${s.width}%`,
                        background: s.color
                    }}
                >
                    {s.label}
                </div>
            ))}
        </div>
    </div>
);

interface PlayheadProps {
    /** 距左侧的百分比（0–100）。 */
    pct: number;
}

export const Playhead = ({ pct }: PlayheadProps): JSX.Element => {
    // 20–80 范围内夹紧，避免越界
    const clamped = Math.max(8, Math.min(92, pct));
    return (
        <div
            aria-hidden="true"
            className="pointer-events-none absolute"
            style={{
                top: '64px',
                bottom: 0,
                left: `${clamped}%`,
                width: '1px',
                background: 'var(--color-danger)'
            }}
        >
            {/* 顶部三角形 + glow */}
            <span
                className="absolute -top-2 -left-[6px] flex h-3.5 w-3.5 items-center justify-center rounded-sm bg-brand text-[9px] font-bold text-text-on-brand"
                style={{ left: '-6px' }}
            >
                ▾
            </span>
        </div>
    );
};

/** 三轨默认配置，对应 Pencil V1/A1/V2。 */
export const DEFAULT_TRACKS: readonly {
    label: string;
    segments: readonly TrackSegment[];
}[] = [
    {
        label: 'V1',
        segments: [
            { color: '#3FCB7A', label: '开场 · 黑场渐入', width: 18 },
            { color: '#7B5CFF', label: '樱花大道 · 全景', width: 22 },
            { color: '#FF8A4A', label: '樱花特写 · 慢镜头', width: 28 }
        ]
    },
    {
        label: 'A1',
        segments: [{ color: '#FFB547', label: 'BGM', width: 68 }]
    },
    {
        label: 'V2',
        segments: [
            { color: '#00E7FF', label: '字幕', width: 32 },
            { color: '#FF5C5C', label: '角标', width: 14 }
        ]
    }
];

export interface TimelineAreaProps {
    tracks?: typeof DEFAULT_TRACKS;
    playheadPct?: number;
    ruler?: ReactNode;
}

export const TimelineArea = ({
    tracks = DEFAULT_TRACKS,
    playheadPct = 55
}: TimelineAreaProps): JSX.Element => (
    <section className="relative flex h-full flex-col border-t border-border-subtle bg-bg-elevated">
        <ToolsRow />
        <TimeRuler />
        <div className="flex-1 overflow-auto">
            {tracks.map((t) => (
                <Track key={t.label} label={t.label} segments={t.segments} />
            ))}
        </div>
        <Playhead pct={playheadPct} />
    </section>
);

import { ToolsBar } from './tools-bar';
const ToolsRow = (): JSX.Element => <ToolsBar active="选择" />;
