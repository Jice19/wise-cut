/* */
import { useEffect, useRef, useState } from 'react';

import { voiceConfigPanel } from '../../../constants/config';
import type {
    ConfigPanelContext,
    VoicePresetCard
} from '../../../types/config';
import { ConfigHeader } from '../shared/ConfigHeader';
import { ConfigPanelShell } from '../shared/ConfigPanelShell';
import { ConfigPrimaryButton } from '../shared/ConfigPrimaryButton';
import { ConfigSectionShell } from '../shared/ConfigSectionShell';
import { ConfigSelectableCard } from '../shared/ConfigSelectableCard';
import { ConfigSliderRow } from '../shared/ConfigSliderRow';
import { ConfigUploadCard } from '../shared/ConfigUploadCard';

const formatVolume = (value: number) => `${Math.round(value)}%`;

const formatSpeed = (value: number) => `${value.toFixed(2)}x`;

const formatVoiceRegenerationProgress = ({
    current,
    percent,
    total
}: {
    current: number;
    percent: number;
    total: number;
}) =>
    total > 0
        ? `第 ${Math.min(current, total)} / ${total} 条 · ${percent}%`
        : `${percent}%`;

const createVoiceSelectionKey = (
    card: Pick<VoicePresetCard, 'title' | 'voiceType'>
) => card.voiceType ?? card.title;

export const VoiceConfigPanel = ({
    context = {}
}: {
    context?: ConfigPanelContext;
}) => {
    const audioRef = useRef<HTMLAudioElement>(null);
    const initialPreset =
        voiceConfigPanel.presets.find((preset) => preset.selected) ??
        voiceConfigPanel.presets[0];
    const defaultVoiceKey = initialPreset
        ? createVoiceSelectionKey(initialPreset)
        : '';
    const [localSelectedVoiceKey, setLocalSelectedVoiceKey] =
        useState(defaultVoiceKey);
    const volumeValue = Math.round(
        (context.voiceSettings?.voiceVolume ?? 0.82) * 100
    );
    const speedValue = context.voiceSettings?.voiceSpeed ?? 1.05;
    const customVoiceCards: VoicePresetCard[] = (
        context.customVoices ?? []
    ).map((voice) => ({
        actionIcon: 'play',
        description: '自定义',
        previewAudioUrl: voice.previewAudioUrl,
        selected: false,
        title: voice.title,
        voiceType: voice.voiceType
    }));
    const selectedVoiceKey =
        context.selectedVoice?.voiceType ??
        context.selectedVoice?.title ??
        localSelectedVoiceKey;
    const presets = [...voiceConfigPanel.presets, ...customVoiceCards].map(
        (card) => ({
            ...card,
            selected: createVoiceSelectionKey(card) === selectedVoiceKey
        })
    );
    const selectedPreset =
        presets.find((preset) => preset.selected) ?? presets[0];
    const customVoiceStatusLabel = context.isUploadingCustomVoice
        ? '正在导入原始音色音频'
        : context.customVoiceStatus?.available
          ? '本地 IndexTTS2 已就绪，上传后可用于生成口播'
          : context.customVoiceStatus
            ? '启动本地 IndexTTS2 后可上传自定义音色'
            : '正在检测本地 IndexTTS2 服务';
    const voiceRegenerationProgress = context.voiceRegenerationProgress;
    const voiceRegenerationProgressLabel = voiceRegenerationProgress
        ? formatVoiceRegenerationProgress(voiceRegenerationProgress)
        : '准备中';
    const actionLabel = context.isRegeneratingVoices
        ? `取消生成 · ${voiceRegenerationProgressLabel}`
        : voiceConfigPanel.actionLabel;

    const stopVoicePreviewAudio = () => {
        const audio = audioRef.current;

        if (!audio) return;

        audio.pause();
    };

    useEffect(() => {
        if (!context.voicePreviewStopSignal) return;

        stopVoicePreviewAudio();
    }, [context.voicePreviewStopSignal]);

    useEffect(
        () => () => {
            stopVoicePreviewAudio();
        },
        []
    );

    const updateVoiceSettings = ({
        speed = speedValue,
        volume = volumeValue
    }: {
        speed?: number;
        volume?: number;
    }) => {
        context.onVoiceSettingsChange?.({
            voiceSpeed: speed,
            voiceVolume: volume / 100
        });

        if (audioRef.current) {
            audioRef.current.volume = Math.min(Math.max(volume / 100, 0), 1);
            audioRef.current.playbackRate = Math.min(Math.max(speed, 0.5), 2);
        }
    };

    const selectVoice = (card: VoicePresetCard) => {
        setLocalSelectedVoiceKey(createVoiceSelectionKey(card));
        context.onVoiceSelectionChange?.({
            title: card.title,
            voiceType: card.voiceType
        });
    };

    const handlePreview = (card: VoicePresetCard) => {
        selectVoice(card);
        if (!card.previewAudioUrl || !audioRef.current) return;

        audioRef.current.pause();
        audioRef.current.src = card.previewAudioUrl;
        audioRef.current.currentTime = 0;
        audioRef.current.volume = Math.min(Math.max(volumeValue / 100, 0), 1);
        audioRef.current.playbackRate = Math.min(Math.max(speedValue, 0.5), 2);
        void audioRef.current.play().catch((): void => undefined);
    };

    const sliders = voiceConfigPanel.sliders.map((slider) => {
        if (slider.label === '音量') {
            return {
                ...slider,
                numericValue: volumeValue,
                value: formatVolume(volumeValue)
            };
        }

        if (slider.label === '语速') {
            return {
                ...slider,
                numericValue: speedValue,
                value: formatSpeed(speedValue)
            };
        }

        return slider;
    });

    return (
        <ConfigPanelShell
            className="w-[320px]"
            contentClassName="flex min-h-0 flex-col"
            footerClassName="border-t border-[#1A1D24] bg-[#0E0F12] px-[16px] pb-[16px] pt-[12px]"
            footer={
                <div className="grid gap-2">
                    {context.isRegeneratingVoices ? (
                        <div
                            data-voice-regeneration-progress="true"
                            className="grid gap-1.5"
                        >
                            <div className="flex items-center justify-between text-[11px] font-semibold text-white">
                                <span>正在生成口播音轨</span>
                                <span>{voiceRegenerationProgressLabel}</span>
                            </div>
                            <div className="h-1.5 overflow-hidden rounded-full bg-[#252932]">
                                <div
                                    className="h-full rounded-full bg-[#F05F73] transition-[width] duration-300 ease-out"
                                    style={{
                                        width: `${voiceRegenerationProgress?.percent ?? 0}%`
                                    }}
                                />
                            </div>
                        </div>
                    ) : null}
                    <ConfigPrimaryButton
                        disabled={!selectedPreset}
                        isLoading={context.isRegeneratingVoices}
                        label={actionLabel}
                        icon="mic"
                        onClick={() => {
                            if (context.isRegeneratingVoices) {
                                void context.onCancelRegenerateVoices?.();
                                return;
                            }

                            if (!selectedPreset) return;

                            void context.onRegenerateVoices?.({
                                selectedVoice: selectedPreset.title,
                                selectedVoiceType: selectedPreset.voiceType
                            });
                        }}
                    />
                </div>
            }
        >
            <div className="flex h-full min-w-0 min-h-0 flex-col px-[16px] pt-[16px]">
                <ConfigHeader
                    title={voiceConfigPanel.header.title}
                    subtitle={voiceConfigPanel.header.subtitle}
                    titleClassName="text-[20px] font-[800] leading-none text-white"
                    subtitleClassName="text-[11px] font-semibold leading-none text-[#88909C]"
                    className="text-left"
                />

                <div className="min-h-0 flex-1 overflow-y-auto pb-3">
                    <ConfigSectionShell className="mt-[14px]">
                        <ConfigHeader
                            title={voiceConfigPanel.section.title}
                            subtitle={voiceConfigPanel.section.subtitle}
                            className="text-left"
                        />
                        <div className="mt-[13px] grid grid-cols-2 gap-2">
                            {presets.map((card) => (
                                <ConfigSelectableCard
                                    key={createVoiceSelectionKey(card)}
                                    card={card}
                                    onPreview={handlePreview}
                                    onSelect={(nextCard) => {
                                        selectVoice(nextCard);
                                    }}
                                />
                            ))}
                        </div>
                        {selectedPreset?.previewAudioUrl ? (
                            <audio
                                ref={audioRef}
                                data-voice-preview-audio="true"
                                preload="metadata"
                                src={selectedPreset.previewAudioUrl}
                            />
                        ) : null}
                        <div className="mt-[10px]">
                            <ConfigUploadCard
                                card={voiceConfigPanel.uploadCard}
                                disabled={context.isUploadingCustomVoice}
                                statusLabel={customVoiceStatusLabel}
                                onClick={() => {
                                    void context
                                        .onImportCustomVoice?.()
                                        .then((voice) => {
                                            if (!voice) return;

                                            setLocalSelectedVoiceKey(
                                                voice.voiceType
                                            );
                                            context.onVoiceSelectionChange?.({
                                                title: voice.title,
                                                voiceType: voice.voiceType
                                            });
                                        });
                                }}
                            />
                        </div>
                    </ConfigSectionShell>

                    <ConfigSectionShell className="mt-[12px]">
                        <ConfigHeader
                            title="参数调整"
                            className="text-left"
                            titleClassName="text-[14px] font-[800] leading-none"
                        />
                        <div className="mt-[18px] grid gap-4">
                            {sliders.map((slider) => (
                                <ConfigSliderRow
                                    key={slider.label}
                                    slider={slider}
                                    onValueChange={(value) => {
                                        if (slider.label === '音量') {
                                            updateVoiceSettings({
                                                volume: value
                                            });
                                            return;
                                        }

                                        updateVoiceSettings({
                                            speed: value
                                        });
                                    }}
                                />
                            ))}
                        </div>
                    </ConfigSectionShell>
                </div>
            </div>
        </ConfigPanelShell>
    );
};
