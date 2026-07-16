/* */
import { useState } from 'react';

import {
    defaultMusicSettings,
    musicConfigPanel,
    musicLibraryTracks
} from '../../../constants/config';
import type { ConfigPanelContext, MusicTrack } from '../../../types/config';
import { cx } from '../../../utils/classNames';
import { ConfigHeader } from '../shared/ConfigHeader';
import { ConfigPanelShell } from '../shared/ConfigPanelShell';
import { ConfigSectionShell } from '../shared/ConfigSectionShell';
import { ConfigSliderRow } from '../shared/ConfigSliderRow';
import { ConfigToggleRow } from '../shared/ConfigToggleRow';

const MusicCover = ({
    src,
    alt,
    className = 'h-[56px] w-[56px]'
}: {
    src: string;
    alt: string;
    className?: string;
}) => {
    return (
        <div
            className={cx(
                'overflow-hidden rounded-[10px] bg-[#1A1D22]',
                className
            )}
        >
            <img src={src} alt={alt} className="h-full w-full object-cover" />
        </div>
    );
};

const MusicCategoryChip = ({
    label,
    active,
    onClick
}: {
    label: string;
    active: boolean;
    onClick?: () => void;
}) => {
    return (
        <button
            type="button"
            aria-pressed={active}
            onClick={onClick}
            className={cx(
                'shrink-0 whitespace-nowrap rounded-[8px] border px-2 text-[11.5px] font-[800] transition-all duration-200 hover:-translate-y-[1px] cursor-pointer',
                active
                    ? 'border-[#F05F73] bg-[#F05F73]/20 text-[#F05F73] hover:bg-[#F05F73]/30'
                    : 'border-[#1A1D24] bg-[#1A1D24] text-white hover:bg-[#252B33]'
            )}
        >
            {label}
        </button>
    );
};

export const filterMusicTracksByCategory = ({
    category,
    tracks
}: {
    category: string;
    tracks: MusicTrack[];
}) => {
    if (category === '全部' || category === '更多') return tracks;

    return tracks.filter((track) => track.mood === category);
};

const MusicTrackRow = ({
    active,
    onSelect,
    track
}: {
    active: boolean;
    onSelect?: (track: MusicTrack) => void;
    track: MusicTrack;
}) => {
    return (
        <button
            type="button"
            aria-pressed={active}
            data-music-source-url={track.sourceUrl}
            data-music-track-id={track.id}
            onClick={() => {
                onSelect?.(track);
            }}
            className={cx(
                'flex h-[40px] w-full items-center gap-2.5 rounded-[10px] px-0 text-left transition-all duration-200 hover:-translate-y-[1px] cursor-pointer',
                active
                    ? 'bg-[#111418] hover:bg-[#1A1D24]'
                    : 'bg-transparent hover:bg-[#1A1D24]'
            )}
        >
            <MusicCover
                src={track.coverImageUrl}
                alt={track.title}
                className="h-[38px] w-[38px]"
            />
            <div className="min-w-0 flex-1">
                <div className="flex items-center gap-1.5">
                    <span className="truncate text-[12px] font-[800] text-white">
                        {track.title}
                    </span>
                    {active ? (
                        <span className="flex h-[18px] items-center rounded-[4px] bg-[#1A1D24] px-1.5 text-[9px] font-[700] text-[#88909C]">
                            使用中
                        </span>
                    ) : null}
                </div>
                <div className="truncate text-[10px] font-semibold text-[#6B7385]">
                    {track.meta}
                </div>
            </div>
        </button>
    );
};

const MusicCurrentCard = ({ track }: { track: MusicTrack }) => {
    return (
        <ConfigSectionShell className="p-[12px_14px]">
            <div className="flex items-center justify-between">
                <ConfigHeader
                    title={musicConfigPanel.current.sectionTitle}
                    className="text-left"
                    titleClassName="text-[14px] font-[800] leading-none"
                />
            </div>
            <div className="mt-[12px] flex items-center gap-3">
                <MusicCover src={track.coverImageUrl} alt={track.title} />
                <div className="min-w-0 flex-1">
                    <div className="truncate text-[17px] font-[850] text-white">
                        {track.title}
                    </div>
                    <div className="mt-1 truncate text-[11px] font-semibold text-[#88909C]">
                        {musicConfigPanel.current.artistLine}
                    </div>
                    <div className="mt-1 truncate font-['Geist_Mono'] text-[10px] font-[700] text-[#6B7385]">
                        {`${track.tempo} · ${track.durationLabel} · 已对齐时间线`}
                    </div>
                </div>
            </div>
        </ConfigSectionShell>
    );
};

const MusicRecommendationCard = ({
    onCategorySelect,
    onTrackSelect,
    selectedCategory,
    selectedTrackId
}: {
    onCategorySelect?: (category: string) => void;
    onTrackSelect?: (track: MusicTrack) => void;
    selectedCategory: string;
    selectedTrackId: string;
}) => {
    const tracks = filterMusicTracksByCategory({
        category: selectedCategory,
        tracks: musicConfigPanel.recommendations.tracks
    });

    return (
        <ConfigSectionShell className="p-[12px_14px]">
            <ConfigHeader
                title={musicConfigPanel.recommendations.title}
                className="text-left"
                titleClassName="text-[14px] font-[800] leading-none"
            />

            <div className="mt-[12px] min-w-0">
                <div className="w-full min-w-0 overflow-x-auto">
                    <div className="flex w-max min-w-full flex-nowrap gap-1 py-2">
                        {musicConfigPanel.recommendations.categories.map(
                            (category) => (
                                <MusicCategoryChip
                                    key={category.label}
                                    active={category.label === selectedCategory}
                                    label={category.label}
                                    onClick={() => {
                                        onCategorySelect?.(category.label);
                                    }}
                                />
                            )
                        )}
                    </div>
                </div>
            </div>

            <div className="mt-[10px] grid gap-2">
                {tracks.map((track) => (
                    <MusicTrackRow
                        key={track.id}
                        active={track.id === selectedTrackId}
                        onSelect={onTrackSelect}
                        track={track}
                    />
                ))}
            </div>
        </ConfigSectionShell>
    );
};

const formatMusicVolume = (value: number) => `${Math.round(value * 100)}%`;

export const MusicConfigPanel = ({
    context = {}
}: {
    context?: ConfigPanelContext;
}) => {
    const musicSettings = context.musicSettings ?? defaultMusicSettings;
    const [selectedCategory, setSelectedCategory] = useState('全部');
    const selectedTrack =
        musicLibraryTracks.find(
            (track) => track.id === musicSettings.selectedTrackId
        ) ??
        musicLibraryTracks[0] ??
        musicConfigPanel.recommendations.tracks[0];
    const volumePercent = Math.round(musicSettings.volume * 100);
    const volumeSlider = {
        ...musicConfigPanel.volume,
        numericValue: volumePercent,
        value: formatMusicVolume(musicSettings.volume)
    };
    const updateMusicSettings = (
        nextSettings: Partial<typeof musicSettings>
    ) => {
        context.onMusicSettingsChange?.({
            ...musicSettings,
            ...nextSettings
        });
    };

    return (
        <ConfigPanelShell
            className="w-[320px]"
            contentClassName="flex min-h-0 flex-col"
        >
            <div className="flex h-full min-w-0 min-h-0 flex-col p-[16px]">
                <div className="flex items-center justify-between gap-4">
                    <ConfigHeader
                        title={musicConfigPanel.header.title}
                        subtitle={musicConfigPanel.header.subtitle}
                        titleClassName="text-[20px] font-[850] leading-none"
                        subtitleClassName="text-[11px] font-semibold leading-none text-[#6F7784]"
                        className="text-left"
                    />
                    <ConfigToggleRow
                        label={musicConfigPanel.header.toggleLabel}
                        enabled={musicSettings.enabled}
                        onToggle={() => {
                            updateMusicSettings({
                                enabled: !musicSettings.enabled
                            });
                        }}
                    />
                </div>

                <div className="min-h-0 flex-1 overflow-y-auto pb-3">
                    <div className="mt-[14px] flex flex-col gap-[12px]">
                        <MusicCurrentCard track={selectedTrack} />

                        <ConfigSectionShell className="p-[12px_14px]">
                            <ConfigSliderRow
                                slider={volumeSlider}
                                onValueChange={(value) => {
                                    updateMusicSettings({
                                        volume: value / 100
                                    });
                                }}
                            />
                        </ConfigSectionShell>

                        <MusicRecommendationCard
                            selectedCategory={selectedCategory}
                            selectedTrackId={selectedTrack.id}
                            onCategorySelect={setSelectedCategory}
                            onTrackSelect={(track) => {
                                updateMusicSettings({
                                    enabled: true,
                                    selectedTrackId: track.id
                                });
                            }}
                        />
                    </div>
                </div>
            </div>
        </ConfigPanelShell>
    );
};
