/* */
import { type ChangeEvent, type FormEvent, useState } from 'react';

import type {
    CreateAgentSubmitInput,
    CreatePageContent
} from '../../types/create';
import { Icon } from '../Icon';

import { CreateModeSwitch } from './CreateModeSwitch';
import { VoiceSelect } from './VoiceSelect';

export const CreateInputPanel = ({
    content,
    disabled = false,
    onSubmit
}: {
    content: CreatePageContent;
    disabled?: boolean;
    onSubmit?: (input: CreateAgentSubmitInput) => void;
}) => {
    const [manuscript, setManuscript] = useState('');
    const [sourceAssetDirectory, setSourceAssetDirectory] = useState('');
    const [selectedVoice, setSelectedVoice] = useState(
        content.voiceOptions[0]?.label ?? ''
    );
    const selectedVoiceOption =
        content.voiceOptions.find((option) => option.label === selectedVoice) ??
        content.voiceOptions[0];

    const handleManuscriptChange = (
        event: ChangeEvent<HTMLTextAreaElement>
    ) => {
        setManuscript(event.target.value);
    };

    const handleAssetDirectoryChange = (
        event: ChangeEvent<HTMLInputElement>
    ) => {
        setSourceAssetDirectory(event.target.value);
    };

    const handleSubmit = (event: FormEvent<HTMLFormElement>) => {
        event.preventDefault();
        onSubmit?.({
            prompt: manuscript,
            selectedVoice,
            selectedVoiceType: selectedVoiceOption?.voiceType ?? '',
            sourceAssetDirectory
        });
    };

    return (
        <section className="relative h-[390px] w-[1340px] max-w-full overflow-visible rounded-[20px] border border-[#E7E5E0] bg-white shadow-[0_4px_24px_rgba(28,25,23,0.06)]">
            <div className="pointer-events-none absolute inset-0" />
            <form className="relative z-10 h-full" onSubmit={handleSubmit}>
                <CreateModeSwitch modes={content.modes} />
                <textarea
                    aria-label={content.placeholder}
                    className="absolute left-[34px] top-[122px] h-[110px] w-[calc(100%-68px)] max-w-[960px] resize-none border-none bg-transparent p-0 text-[22px] font-normal leading-[1.35] text-[#1C1917] outline-none placeholder:text-[#A8A29E]"
                    maxLength={content.maxLength}
                    onChange={handleManuscriptChange}
                    placeholder={content.placeholder}
                    value={manuscript}
                />
                <p className="absolute left-[34px] top-[250px] font-['Geist'] text-[22px] font-normal text-[#A8A29E]">
                    {manuscript.length} / {content.maxLength}
                </p>
                <VoiceSelect
                    labelPrefix={content.voiceLabelPrefix}
                    options={content.voiceOptions}
                    value={selectedVoice}
                    onChange={setSelectedVoice}
                />
                <label className="absolute left-[340px] top-[300px] flex h-[58px] w-[520px] items-center gap-3 rounded-[12px] border border-[#E7E5E0] bg-[#FAF9F7] px-[14px] transition-colors duration-200 focus-within:border-[#D97706] focus-within:bg-white">
                    <span className="shrink-0 text-[16px] font-[650] text-[#57534E]">
                        本地素材目录
                    </span>
                    <input
                        aria-label="本地素材目录"
                        className="min-w-0 flex-1 bg-transparent text-[15px] font-[700] text-[#1C1917] outline-none placeholder:text-[#A8A29E]"
                        disabled={disabled}
                        onChange={handleAssetDirectoryChange}
                        placeholder="粘贴本地视频素材目录"
                        value={sourceAssetDirectory}
                    />
                </label>
                <button
                    type="submit"
                    data-agent-start-button="true"
                    disabled={disabled}
                    className="absolute right-[32px] top-[313px] flex h-[45px] w-[120px] items-center justify-center gap-2 rounded-[12px] bg-[#D97706] text-[16px] font-[700] text-white shadow-[0_4px_12px_rgba(217,119,6,0.25)] transition-colors duration-200 hover:bg-[#B45309] disabled:cursor-not-allowed disabled:opacity-60"
                >
                    <Icon name="sparkles" className="h-[18px] w-[18px]" />
                    <span>{content.actionLabel}</span>
                </button>
            </form>
        </section>
    );
};
