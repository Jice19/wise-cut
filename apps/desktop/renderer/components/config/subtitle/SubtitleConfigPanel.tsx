/* */
import {
    defaultSubtitleSettings,
    subtitleConfigPanel
} from '../../../constants/config';
import type {
    ConfigPanelContext,
    SubtitleSettings
} from '../../../types/config';
import { ConfigHeader } from '../shared/ConfigHeader';
import { ConfigPanelShell } from '../shared/ConfigPanelShell';
import { ConfigPresetSwatch } from '../shared/ConfigPresetSwatch';
import { ConfigSectionShell } from '../shared/ConfigSectionShell';
import { ConfigSliderRow } from '../shared/ConfigSliderRow';
import { ConfigToggleRow } from '../shared/ConfigToggleRow';

const formatFontSize = (fontSizePx: number) => `${Math.round(fontSizePx)} px`;

const createSubtitleSettingsFromPreset = ({
    fontSizePx,
    isVisible,
    preset
}: {
    fontSizePx: number;
    isVisible: boolean;
    preset: (typeof subtitleConfigPanel.style.presets)[number];
}): SubtitleSettings => ({
    fontSizePx,
    isVisible,
    outlineColor: preset.outerTextColor,
    presetLabel: preset.label,
    textColor: preset.innerTextColor
});

const fallbackSubtitlePanelSettings = createSubtitleSettingsFromPreset({
    fontSizePx:
        subtitleConfigPanel.size.numericValue ??
        defaultSubtitleSettings.fontSizePx,
    isVisible: subtitleConfigPanel.visibility.enabled,
    preset: subtitleConfigPanel.style.presets[0]
});

export const SubtitleConfigPanel = ({
    context = {}
}: {
    context?: ConfigPanelContext;
}) => {
    const settings = context.subtitleSettings ?? fallbackSubtitlePanelSettings;
    const activePreset =
        subtitleConfigPanel.style.presets.find(
            (preset) => preset.label === settings.presetLabel
        ) ?? subtitleConfigPanel.style.presets[0];
    const presets = subtitleConfigPanel.style.presets.map((preset) => ({
        ...preset,
        active: preset.label === activePreset.label
    }));
    const sizeSlider = {
        ...subtitleConfigPanel.size,
        numericValue: settings.fontSizePx,
        value: formatFontSize(settings.fontSizePx)
    };
    const updateSettings = (nextSettings: SubtitleSettings) => {
        context.onSubtitleSettingsChange?.(nextSettings);
    };

    return (
        <ConfigPanelShell
            className="w-[320px]"
            contentClassName="flex min-h-0 flex-col"
        >
            <div className="flex h-full min-h-0 flex-col p-[16px]">
                <div className="flex items-center justify-between">
                    <ConfigHeader
                        title={subtitleConfigPanel.header.title}
                        subtitle={subtitleConfigPanel.header.subtitle}
                        titleClassName="text-[20px] font-[850] leading-none"
                        subtitleClassName="text-[11px] font-semibold leading-none text-[#6F7784]"
                        className="text-left"
                    />
                    <ConfigToggleRow
                        label={subtitleConfigPanel.visibility.label}
                        enabled={settings.isVisible}
                        onToggle={() => {
                            updateSettings({
                                ...settings,
                                isVisible: !settings.isVisible
                            });
                        }}
                    />
                </div>

                <div className="min-h-0 flex-1 overflow-y-auto pb-3">
                    <div className="mt-[14px] flex flex-col gap-[14px]">
                        <ConfigSectionShell className="p-[12px_14px]">
                            <ConfigSliderRow
                                slider={sizeSlider}
                                onValueChange={(fontSizePx) => {
                                    updateSettings({
                                        ...settings,
                                        fontSizePx
                                    });
                                }}
                            />
                        </ConfigSectionShell>

                        <ConfigSectionShell className="p-[12px_14px]">
                            <div className="grid gap-3">
                                <span className="text-[14px] font-[800] text-white">
                                    {subtitleConfigPanel.style.title}
                                </span>
                                <div className="grid grid-cols-7 gap-1.5">
                                    {presets.map((preset) => (
                                        <ConfigPresetSwatch
                                            key={preset.label}
                                            label={preset.label}
                                            active={preset.active}
                                            backgroundColor={
                                                preset.backgroundColor
                                            }
                                            borderColor={preset.borderColor}
                                            outerTextColor={
                                                preset.outerTextColor
                                            }
                                            innerTextColor={
                                                preset.innerTextColor
                                            }
                                            onClick={() => {
                                                updateSettings(
                                                    createSubtitleSettingsFromPreset(
                                                        {
                                                            fontSizePx:
                                                                settings.fontSizePx,
                                                            isVisible:
                                                                settings.isVisible,
                                                            preset
                                                        }
                                                    )
                                                );
                                            }}
                                        />
                                    ))}
                                </div>

                                <div className="flex items-center justify-between">
                                    <span className="text-[12px] font-[750] text-white">
                                        {activePreset.label}
                                    </span>
                                    <span className="text-[11px] font-semibold text-[#88909C]">
                                        {subtitleConfigPanel.style.subtitle}
                                    </span>
                                </div>
                            </div>
                        </ConfigSectionShell>
                    </div>
                </div>
            </div>
        </ConfigPanelShell>
    );
};
