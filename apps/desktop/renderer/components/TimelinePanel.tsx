
import {
    type MouseEvent as ReactMouseEvent,
    type PointerEvent as ReactPointerEvent,
    type RefObject,
    useEffect,
    useRef,
    useState
} from 'react';

import {
    timelineClipsByTrack,
    timelineLayout,
    timelinePanel,
    timelineTicks,
    timelineToolActions,
    timelineTracks
} from '../constants/editor-screen';
import type {
    TimelineClip,
    TimelineData,
    TimelineToolAction,
    TimelineTrack
} from '../types/editor-screen';
import { cx } from '../utils/classNames';

import { Icon } from './Icon';
import { IconButton } from './IconButton';
import { Waveform } from './Waveform';

const trackToneClassNames: Record<TimelineTrack['tone'], string> = {
    primary: 'bg-[#111318]',
    muted: 'bg-[#0E1014]'
};

const trackContentClassNames: Record<TimelineTrack['id'], string> = {
    video: 'bg-[#15171B]',
    voice: 'bg-[#101216]',
    subtitle: 'bg-[#15171B]',
    music: 'bg-[#101216]'
};

const clipTextClassNames: Record<TimelineClip['kind'], string> = {
    video: 'text-[11px] font-extrabold text-[#F5F7FA]',
    voice: 'text-[11px] font-bold text-[#F5F7FA]',
    subtitle: 'text-[11px] font-bold text-[#F5F7FA]',
    music: 'text-[11px] font-bold text-[#DCE7FF]'
};

const timelineTrackRowStartClassNames = [
    'row-start-2',
    'row-start-3',
    'row-start-4',
    'row-start-5'
] as const;
const PLAYHEAD_CONTENT_START_PX = 200;
const PLAYHEAD_LINE_OFFSET_PX = 9;
const PLAYHEAD_SCROLL_LEADING_PADDING_PX = 24;
const PLAYHEAD_SCROLL_TRAILING_PADDING_PX = 96;
const PLAYHEAD_TOP_PX = 35;
const TIMELINE_TITLE_BAR_HEIGHT_PX = 42;
const TIMELINE_RULER_HEIGHT_PX = 30;
const TIMELINE_TRACK_HEIGHT_PX = 50;
const FALLBACK_TIMELINE_DURATION_MS = 90_000;

type TimelineSceneSelectInput = {
    sceneId: string;
    startMs: number;
};

type TimelineMetrics = {
    contentGridTemplateRows: string;
    contentHeightPx: number;
    contentRowCount: number;
    playheadHeightPx: number;
    playheadLineHeightPx: number;
    sectionHeightPx: number;
};

const createTimelineMetrics = (trackCount: number): TimelineMetrics => {
    const visibleTrackCount = Math.max(trackCount, 0);
    const contentRowCount = visibleTrackCount + 1;
    const contentHeightPx =
        TIMELINE_RULER_HEIGHT_PX + visibleTrackCount * TIMELINE_TRACK_HEIGHT_PX;
    const sectionHeightPx = TIMELINE_TITLE_BAR_HEIGHT_PX + contentHeightPx;
    const playheadHeightPx = Math.max(0, sectionHeightPx - PLAYHEAD_TOP_PX);

    return {
        contentGridTemplateRows: `${TIMELINE_RULER_HEIGHT_PX}px repeat(${visibleTrackCount}, ${TIMELINE_TRACK_HEIGHT_PX}px)`,
        contentHeightPx,
        contentRowCount,
        playheadHeightPx,
        playheadLineHeightPx: Math.max(0, playheadHeightPx - 7),
        sectionHeightPx
    };
};

const fallbackTimelineData: TimelineData = {
    clipsByTrack: timelineClipsByTrack,
    layout: timelineLayout,
    panel: timelinePanel,
    playhead: {
        currentTimeMs: 0,
        progress: 0
    },
    ticks: timelineTicks,
    tracks: timelineTracks
};

export const calculateTimelineScrollLeft = ({
    contentWidthPx,
    currentScrollLeft,
    playheadX,
    viewportWidth
}: {
    contentWidthPx: number;
    currentScrollLeft: number;
    playheadX: number;
    viewportWidth: number;
}) => {
    if (viewportWidth <= 0) return currentScrollLeft;

    const maxScrollLeft = Math.max(0, contentWidthPx - viewportWidth);
    const visibleStart = currentScrollLeft + PLAYHEAD_SCROLL_LEADING_PADDING_PX;
    const visibleEnd =
        currentScrollLeft + viewportWidth - PLAYHEAD_SCROLL_TRAILING_PADDING_PX;

    if (playheadX < visibleStart) {
        return Math.max(0, playheadX - PLAYHEAD_SCROLL_LEADING_PADDING_PX);
    }

    if (playheadX > visibleEnd) {
        return Math.min(
            maxScrollLeft,
            playheadX - viewportWidth + PLAYHEAD_SCROLL_TRAILING_PADDING_PX
        );
    }

    return currentScrollLeft;
};

export const calculateTimelinePointerTimeMs = ({
    clientX,
    contentWidthPx,
    durationMs,
    scrollContainerLeft,
    scrollLeft
}: {
    clientX: number;
    contentWidthPx: number;
    durationMs: number;
    scrollContainerLeft: number;
    scrollLeft: number;
}) => {
    if (contentWidthPx <= 0 || durationMs <= 0) return 0;

    const pointerX = clientX - scrollContainerLeft + scrollLeft;
    const clampedPointerX = Math.min(Math.max(pointerX, 0), contentWidthPx);

    return Math.round((clampedPointerX / contentWidthPx) * durationMs);
};

const formatTimelinePointerTime = (timeMs: number) => {
    const totalSeconds = Math.floor(timeMs / 1000);
    const minutes = Math.floor(totalSeconds / 60);
    const seconds = totalSeconds % 60;

    return `${String(minutes).padStart(2, '0')}:${String(seconds).padStart(
        2,
        '0'
    )}`;
};

const ThumbnailStrip = () => {
    return (
        <div className="ml-auto flex gap-[2px]" aria-hidden="true">
            {Array.from({ length: 4 }, (_, index) => (
                <span
                    key={index}
                    className={cx(
                        'h-2 w-2 rounded',
                        index % 2 === 0 ? 'bg-white/15' : 'bg-black/20'
                    )}
                />
            ))}
        </div>
    );
};

const TrackLabel = ({
    track,
    className
}: {
    track: TimelineTrack;
    className?: string;
}) => {
    return (
        <div
            className={cx(
                'flex h-full items-center gap-3 border-r border-b border-[#2A2F38] px-[18px]',
                className,
                trackToneClassNames[track.tone]
            )}
        >
            <Icon
                name={track.icon}
                className="h-[18px] w-[18px] text-[#A9AFBA]"
            />
            <div className="grid gap-1">
                <span className="text-sm font-bold text-[#F5F7FA]">
                    {track.title}
                </span>
                <span className="font-['Geist'] text-[10px] text-[#6F7784]">
                    {track.meta}
                </span>
            </div>
        </div>
    );
};

const TimelineClipItem = ({
    clip,
    onSceneSelect
}: {
    clip: TimelineClip;
    onSceneSelect?: (input: TimelineSceneSelectInput) => void;
}) => {
    const canSelectScene =
        typeof clip.sceneId === 'string' && typeof clip.startMs === 'number';

    return (
        <button
            type="button"
            data-timeline-clip-kind={clip.kind}
            data-timeline-clip-start-ms={clip.startMs}
            data-timeline-scene-id={clip.sceneId}
            data-duration-seconds={clip.durationSeconds}
            data-width-px={clip.widthPx}
            disabled={!canSelectScene}
            onClick={(event) => {
                if (!canSelectScene || !clip.sceneId) return;

                event.stopPropagation();
                onSceneSelect?.({
                    sceneId: clip.sceneId,
                    startMs: clip.startMs ?? 0
                });
            }}
            title={clip.caption ?? clip.label}
            className={cx(
                'flex h-[28px] shrink-0 items-center gap-1.5 overflow-hidden rounded-md border px-2',
                canSelectScene ? 'cursor-pointer' : 'cursor-default',
                clip.colorClassName,
                clipTextClassNames[clip.kind]
            )}
            style={{ width: clip.widthPx }}
        >
            {clip.kind === 'video' ? (
                <span className="h-3 w-0.5 shrink-0 rounded-full bg-white/70" />
            ) : null}
            {clip.kind === 'subtitle' ? (
                <Icon
                    name="captions"
                    className="h-3 w-3 shrink-0 text-[#F6B84B]"
                />
            ) : null}
            {clip.kind === 'music' ? (
                <Icon
                    name="music"
                    className="h-3 w-3 shrink-0 text-[#8EA2FF]"
                />
            ) : null}
            <span className="truncate">{clip.label}</span>
            {clip.bars ? <Waveform bars={clip.bars} size="compact" /> : null}
            {clip.showThumbnails ? <ThumbnailStrip /> : null}
        </button>
    );
};

const timelineToolButtonVariant: Record<
    TimelineToolAction['tone'],
    'timeline' | 'timelineActive'
> = {
    default: 'timeline',
    active: 'timelineActive'
};

const TimelineZoomControl = () => {
    return (
        <div className="flex h-[14px] w-[136px] items-center gap-2">
            <Icon name="minus" className="h-[14px] w-[14px] text-[#6F7784]" />
            <div className="relative h-1 w-[92px] rounded-full bg-[#2A2F38]">
                <span className="absolute left-0 top-0 h-1 w-[54px] rounded-full bg-white" />
                <span className="absolute left-[50px] top-[-4px] h-3 w-3 rounded-full bg-white" />
            </div>
            <Icon name="plus" className="h-[14px] w-[14px] text-[#6F7784]" />
        </div>
    );
};

const TimelineEditToolbar = () => {
    return (
        <div className="flex items-center gap-2.5">
            {timelineToolActions.map((action) => (
                <IconButton
                    key={action.label}
                    label={action.label}
                    icon={action.icon}
                    variant={timelineToolButtonVariant[action.tone]}
                    className="h-7 w-7"
                    iconClassName="h-[15px] w-[15px]"
                />
            ))}
            <TimelineZoomControl />
        </div>
    );
};

const TimelineTitleBar = ({ data }: { data: TimelineData }) => {
    return (
        <div
            className={cx(
                'flex h-[42px] w-full items-center justify-between border-b border-[#2A2F38] bg-[#15171B] px-3 py-[6px]',
                timelineLayout.titleBarHeightClassName
            )}
        >
            <div className="flex items-center gap-4">
                <h2 className="font-sm">{data.panel.title}</h2>
                <span className="font-['Geist_Mono'] text-xs text-[#A9AFBA]">
                    {data.panel.timecode}
                </span>
            </div>
            <TimelineEditToolbar />
        </div>
    );
};

const TimelineTrackContentRow = ({
    clips,
    onSceneSelect,
    track,
    rowStartClassName
}: {
    clips: TimelineClip[];
    onSceneSelect?: (input: TimelineSceneSelectInput) => void;
    track: TimelineTrack;
    rowStartClassName: string;
}) => {
    return (
        <div
            data-timeline-track={track.id}
            className={cx(
                'min-h-0 border-b border-[#2A2F38]',
                rowStartClassName,
                trackContentClassNames[track.id]
            )}
        >
            <div className="flex h-full items-center gap-0">
                {clips.map((clip) => (
                    <TimelineClipItem
                        key={`${clip.kind}-${clip.sceneId ?? clip.label}-${clip.startMs ?? clip.label}`}
                        clip={clip}
                        onSceneSelect={onSceneSelect}
                    />
                ))}
            </div>
        </div>
    );
};

const TimelineGrid = ({
    data,
    durationMs,
    metrics,
    onPointerTimeClear,
    onPointerTimeCommit,
    onPointerTimePreview,
    onSceneSelect,
    onScrollLeftChange,
    scrollContainerRef
}: {
    data: TimelineData;
    durationMs: number;
    metrics: TimelineMetrics;
    onPointerTimeClear?: () => void;
    onPointerTimeCommit?: (timeMs: number) => void;
    onPointerTimePreview?: (timeMs: number) => void;
    onSceneSelect?: (input: TimelineSceneSelectInput) => void;
    onScrollLeftChange: (scrollLeft: number) => void;
    scrollContainerRef: RefObject<HTMLDivElement | null>;
}) => {
    const calculateEventTimeMs = (
        event:
            | ReactMouseEvent<HTMLDivElement>
            | ReactPointerEvent<HTMLDivElement>
    ) => {
        const scrollContainer = event.currentTarget;
        const rect = scrollContainer.getBoundingClientRect();

        return calculateTimelinePointerTimeMs({
            clientX: event.clientX,
            contentWidthPx: data.layout.contentWidthPx ?? 1728,
            durationMs,
            scrollContainerLeft: rect.left,
            scrollLeft: scrollContainer.scrollLeft
        });
    };

    return (
        <div
            className={cx(
                'grid min-h-0 flex-1 w-full',
                data.layout.contentGridClassName,
                data.layout.contentRowsClassName
            )}
            style={{ gridTemplateRows: metrics.contentGridTemplateRows }}
        >
            <div className="col-start-1 row-start-1 border-r border-b border-[#2A2F38] bg-[#111318]" />
            {data.tracks.map((track, index) => (
                <TrackLabel
                    key={track.title}
                    track={track}
                    className={cx(
                        'col-start-1',
                        timelineTrackRowStartClassNames[index]
                    )}
                />
            ))}
            <div
                ref={scrollContainerRef}
                data-timeline-scroll-container="true"
                className="col-start-2 row-start-1 min-w-0 cursor-crosshair overflow-x-auto overflow-y-hidden"
                style={{ gridRow: `1 / span ${metrics.contentRowCount}` }}
                onClick={(event) => {
                    onPointerTimeCommit?.(calculateEventTimeMs(event));
                }}
                onPointerLeave={onPointerTimeClear}
                onPointerMove={(event) => {
                    onPointerTimePreview?.(calculateEventTimeMs(event));
                }}
                onScroll={(event) => {
                    onScrollLeftChange(event.currentTarget.scrollLeft);
                }}
            >
                <div
                    className={cx(
                        'grid h-full',
                        data.layout.contentRowsClassName,
                        data.layout.contentMinWidthClassName
                    )}
                    style={
                        data.layout.contentWidthPx
                            ? {
                                  gridTemplateRows:
                                      metrics.contentGridTemplateRows,
                                  minWidth: `max(100%, ${data.layout.contentWidthPx}px)`,
                                  width: `max(100%, ${data.layout.contentWidthPx}px)`
                              }
                            : {
                                  gridTemplateRows:
                                      metrics.contentGridTemplateRows
                              }
                    }
                >
                    <div className="row-start-1 relative flex h-full border-b border-[#2A2F38] bg-[#121418]">
                        {data.ticks.map((tick, index) => (
                            <div
                                key={tick}
                                className={cx(
                                    'relative border-l border-[#313741]',
                                    data.layout.tickWidthClassName,
                                    index === 0 && 'border-l-0'
                                )}
                                style={
                                    data.layout.tickWidthPx
                                        ? { width: data.layout.tickWidthPx }
                                        : undefined
                                }
                            >
                                <span className="absolute left-2 top-2 font-['Geist_Mono'] text-[10px] text-[#6F7784]">
                                    {tick}
                                </span>
                            </div>
                        ))}
                    </div>
                    {data.tracks.map((track, index) => (
                        <TimelineTrackContentRow
                            key={track.id}
                            clips={data.clipsByTrack[track.id]}
                            onSceneSelect={onSceneSelect}
                            track={track}
                            rowStartClassName={
                                timelineTrackRowStartClassNames[index] ??
                                'row-start-2'
                            }
                        />
                    ))}
                </div>
            </div>
        </div>
    );
};

const TimelineHoverPlayhead = ({
    contentWidthPx,
    durationMs,
    hoverTimeMs,
    metrics,
    scrollLeftPx
}: {
    contentWidthPx: number;
    durationMs: number;
    hoverTimeMs?: number;
    metrics: TimelineMetrics;
    scrollLeftPx: number;
}) => {
    if (hoverTimeMs === undefined || durationMs <= 0) return null;

    const clampedTimeMs = Math.min(Math.max(hoverTimeMs, 0), durationMs);
    const progress = clampedTimeMs / durationMs;
    const visiblePlayheadX = contentWidthPx * progress - scrollLeftPx;

    return (
        <div
            data-timeline-hover-playhead="true"
            data-hover-time-ms={clampedTimeMs}
            className="pointer-events-none absolute top-[35px] h-[237px] w-5 will-change-transform"
            style={{
                height: metrics.playheadHeightPx,
                left: `calc(${PLAYHEAD_CONTENT_START_PX}px - ${PLAYHEAD_LINE_OFFSET_PX}px)`,
                top: PLAYHEAD_TOP_PX,
                transform: `translateX(${visiblePlayheadX}px)`
            }}
        >
            <span className="absolute left-1/2 top-[-28px] -translate-x-1/2 rounded-md border border-[#F6B84B]/50 bg-[#1B1710] px-1.5 py-0.5 font-['Geist_Mono'] text-[10px] font-bold text-[#F6B84B] shadow-[0_8px_18px_rgba(0,0,0,0.32)]">
                {formatTimelinePointerTime(clampedTimeMs)}
            </span>
            <span className="absolute left-[6px] top-0 h-[14px] w-[8px] rounded-full bg-[#F6B84B]" />
            <span
                className="absolute left-[9px] top-[7px] h-[230px] w-0.5 bg-[#F6B84B]/80"
                style={{ height: metrics.playheadLineHeightPx }}
            />
        </div>
    );
};

const Playhead = ({
    data,
    metrics,
    scrollLeftPx
}: {
    data: TimelineData;
    metrics: TimelineMetrics;
    scrollLeftPx: number;
}) => {
    const progress = data.playhead.progress;
    const contentWidthPx = data.layout.contentWidthPx ?? 1728;
    const visiblePlayheadX = contentWidthPx * progress - scrollLeftPx;

    return (
        <div
            data-playhead-progress={progress}
            data-playhead-scroll-left={scrollLeftPx}
            className="absolute top-[35px] h-[237px] w-5 will-change-transform"
            style={{
                height: metrics.playheadHeightPx,
                left: `calc(${PLAYHEAD_CONTENT_START_PX}px - ${PLAYHEAD_LINE_OFFSET_PX}px)`,
                top: PLAYHEAD_TOP_PX,
                transform: `translateX(${visiblePlayheadX}px)`
            }}
        >
            <span className="absolute left-[3px] top-0 h-[14px] w-[14px] rounded-full border-[3px] border-[#06372F] bg-[#F05F73]" />
            <span
                className="absolute left-[9px] top-[7px] h-[230px] w-0.5 bg-[#F05F73]"
                style={{ height: metrics.playheadLineHeightPx }}
            />
        </div>
    );
};

export const TimelinePanel = ({
    data = fallbackTimelineData,
    durationMs = FALLBACK_TIMELINE_DURATION_MS,
    hoverTimeMs,
    onPointerTimeClear,
    onPointerTimeCommit,
    onPointerTimePreview,
    onSceneSelect
}: {
    data?: TimelineData;
    durationMs?: number;
    hoverTimeMs?: number;
    onPointerTimeClear?: () => void;
    onPointerTimeCommit?: (timeMs: number) => void;
    onPointerTimePreview?: (timeMs: number) => void;
    onSceneSelect?: (input: TimelineSceneSelectInput) => void;
}) => {
    const scrollContainerRef = useRef<HTMLDivElement>(null);
    const [scrollLeftPx, setScrollLeftPx] = useState(0);
    const contentWidthPx = data.layout.contentWidthPx ?? 1728;
    const metrics = createTimelineMetrics(data.tracks.length);
    const playheadX = Math.round(contentWidthPx * data.playhead.progress);

    useEffect(() => {
        const scrollContainer = scrollContainerRef.current;

        if (!scrollContainer) return;

        const nextScrollLeft = calculateTimelineScrollLeft({
            contentWidthPx,
            currentScrollLeft: scrollContainer.scrollLeft,
            playheadX,
            viewportWidth: scrollContainer.clientWidth
        });

        if (Math.abs(nextScrollLeft - scrollContainer.scrollLeft) <= 1) {
            return;
        }

        scrollContainer.scrollTo({
            behavior: 'smooth',
            left: nextScrollLeft
        });
        setScrollLeftPx(nextScrollLeft);
    }, [contentWidthPx, playheadX]);

    return (
        <section
            className={cx(
                'relative flex min-h-0 flex-col overflow-hidden border-t border-[#2A2F38] bg-[#121418]',
                data.layout.sectionHeightClassName
            )}
            style={{ height: metrics.sectionHeightPx }}
            aria-label="时间线"
        >
            <TimelineTitleBar data={data} />
            <TimelineGrid
                data={data}
                durationMs={durationMs}
                metrics={metrics}
                onPointerTimeClear={onPointerTimeClear}
                onPointerTimeCommit={onPointerTimeCommit}
                onPointerTimePreview={onPointerTimePreview}
                onSceneSelect={onSceneSelect}
                scrollContainerRef={scrollContainerRef}
                onScrollLeftChange={setScrollLeftPx}
            />
            <Playhead
                data={data}
                metrics={metrics}
                scrollLeftPx={scrollLeftPx}
            />
            <TimelineHoverPlayhead
                contentWidthPx={contentWidthPx}
                durationMs={durationMs}
                hoverTimeMs={hoverTimeMs}
                metrics={metrics}
                scrollLeftPx={scrollLeftPx}
            />
        </section>
    );
};
