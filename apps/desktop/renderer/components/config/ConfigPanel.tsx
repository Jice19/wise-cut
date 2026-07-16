/* */
import type { ReactElement } from 'react';

import { editorConfigMode } from '../../constants/config';
import type { ConfigMode, ConfigPanelContext } from '../../types/config';

import { MusicConfigPanel } from './music/MusicConfigPanel';
import { SubtitleConfigPanel } from './subtitle/SubtitleConfigPanel';
import { VisualConfigPanel } from './visual/VisualConfigPanel';
import { VoiceConfigPanel } from './voice/VoiceConfigPanel';

const panelStrategies = {
    visual: VisualConfigPanel,
    voice: VoiceConfigPanel,
    subtitle: SubtitleConfigPanel,
    music: MusicConfigPanel
} satisfies Record<
    ConfigMode,
    (props: { context: ConfigPanelContext }) => ReactElement
>;

export const ConfigPanel = ({
    conversation,
    customVoiceStatus,
    customVoices,
    isRegeneratingScene,
    isRegeneratingVoices,
    isUploadingCustomVoice,
    mode = editorConfigMode,
    onClearSelectedScene,
    onCancelRegenerateVoices,
    onMusicSettingsChange,
    onImportCustomVoice,
    onRegenerateScene,
    onRegenerateVoices,
    onSubtitleSettingsChange,
    onVoiceSelectionChange,
    onVoiceSettingsChange,
    selectedScene,
    selectedVoice,
    musicSettings,
    subtitleSettings,
    voicePreviewStopSignal,
    voiceRegenerationProgress,
    voiceSettings
}: {
    conversation?: ConfigPanelContext['conversation'];
    customVoiceStatus?: ConfigPanelContext['customVoiceStatus'];
    customVoices?: ConfigPanelContext['customVoices'];
    isRegeneratingScene?: ConfigPanelContext['isRegeneratingScene'];
    isRegeneratingVoices?: ConfigPanelContext['isRegeneratingVoices'];
    isUploadingCustomVoice?: ConfigPanelContext['isUploadingCustomVoice'];
    mode?: ConfigMode;
    onClearSelectedScene?: ConfigPanelContext['onClearSelectedScene'];
    onCancelRegenerateVoices?: ConfigPanelContext['onCancelRegenerateVoices'];
    onMusicSettingsChange?: ConfigPanelContext['onMusicSettingsChange'];
    onImportCustomVoice?: ConfigPanelContext['onImportCustomVoice'];
    onRegenerateScene?: ConfigPanelContext['onRegenerateScene'];
    onRegenerateVoices?: ConfigPanelContext['onRegenerateVoices'];
    onSubtitleSettingsChange?: ConfigPanelContext['onSubtitleSettingsChange'];
    onVoiceSelectionChange?: ConfigPanelContext['onVoiceSelectionChange'];
    onVoiceSettingsChange?: ConfigPanelContext['onVoiceSettingsChange'];
    selectedScene?: ConfigPanelContext['selectedScene'];
    selectedVoice?: ConfigPanelContext['selectedVoice'];
    musicSettings?: ConfigPanelContext['musicSettings'];
    subtitleSettings?: ConfigPanelContext['subtitleSettings'];
    voicePreviewStopSignal?: ConfigPanelContext['voicePreviewStopSignal'];
    voiceRegenerationProgress?: ConfigPanelContext['voiceRegenerationProgress'];
    voiceSettings?: ConfigPanelContext['voiceSettings'];
}) => {
    const Panel = panelStrategies[mode];

    return (
        <Panel
            context={{
                conversation,
                customVoiceStatus,
                customVoices,
                isRegeneratingScene,
                isRegeneratingVoices,
                isUploadingCustomVoice,
                musicSettings,
                onCancelRegenerateVoices,
                onClearSelectedScene,
                onImportCustomVoice,
                onMusicSettingsChange,
                onRegenerateScene,
                onRegenerateVoices,
                onSubtitleSettingsChange,
                onVoiceSelectionChange,
                onVoiceSettingsChange,
                selectedScene,
                selectedVoice,
                subtitleSettings,
                voicePreviewStopSignal,
                voiceRegenerationProgress,
                voiceSettings
            }}
        />
    );
};
