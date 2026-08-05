/* */
import { type FormEvent, useCallback, useState } from 'react';

import type {
    CreateAgentSubmitInput,
    CreatePageContent
} from '../../types/create';
import { Icon } from '../Icon';

import { CreateModeSwitch } from './CreateModeSwitch';
import { VoiceSelect } from './VoiceSelect';

const MAX_DISPLAY_FILENAMES = 3;

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
    const [sourceFilePaths, setSourceFilePaths] = useState<string[]>([]);
    const [sourceAssetDirectory, setSourceAssetDirectory] = useState('');
    const [selectedVoice, setSelectedVoice] = useState(
        content.voiceOptions[0]?.label ?? ''
    );
    const selectedVoiceOption =
        content.voiceOptions.find((option) => option.label === selectedVoice) ??
        content.voiceOptions[0];

    const handleManuscriptChange = (
        event: React.ChangeEvent<HTMLTextAreaElement>
    ) => {
        setManuscript(event.target.value);
    };

    // 点 "选择文件" → 弹原生文件选择器(多选)
    const handleSelectFiles = useCallback(async () => {
        if (disabled) return;
        const result = await window.miaomaAPI.fileSelect.selectVideoFiles();
        if (!result.canceled && result.filePaths.length > 0) {
            setSourceFilePaths(result.filePaths);
            setSourceAssetDirectory('');
        }
    }, [disabled]);

    // 点 "选择目录" → 弹原生目录选择器
    const handleSelectDirectory = useCallback(async () => {
        if (disabled) return;
        const result = await window.miaomaAPI.fileSelect.selectVideoDirectory();
        if (!result.canceled && result.directoryPath) {
            setSourceAssetDirectory(result.directoryPath);
            setSourceFilePaths([]);
        }
    }, [disabled]);

    // 拖拽进来:Electron 渲染进程的 File.path 能拿到绝对路径
    const handleDrop = useCallback(
        (event: React.DragEvent) => {
            event.preventDefault();
            event.stopPropagation();
            if (disabled) return;

            const files = event.dataTransfer.files;
            const paths: string[] = [];
            for (let i = 0; i < files.length; i++) {
                const file = files[i] as File & { path?: string };
                if (file.path) {
                    paths.push(file.path);
                }
            }
            if (paths.length > 0) {
                setSourceFilePaths(paths);
                setSourceAssetDirectory('');
            }
        },
        [disabled]
    );

    const handleDragOver = useCallback((event: React.DragEvent) => {
        event.preventDefault();
        event.stopPropagation();
    }, []);

    const handleClearFiles = useCallback(() => {
        setSourceFilePaths([]);
    }, []);

    const handleClearDirectory = useCallback(() => {
        setSourceAssetDirectory('');
    }, []);

    const handleSubmit = (event: FormEvent<HTMLFormElement>) => {
        event.preventDefault();
        onSubmit?.({
            prompt: manuscript,
            selectedVoice,
            selectedVoiceType: selectedVoiceOption?.voiceType ?? '',
            sourceAssetDirectory: sourceAssetDirectory || undefined,
            sourceFilePaths:
                sourceFilePaths.length > 0 ? sourceFilePaths : undefined
        });
    };

    const hasFiles = sourceFilePaths.length > 0;
    const hasDirectory = sourceAssetDirectory.length > 0;
    const hasSource = hasFiles || hasDirectory;

    // 已选素材的展示文本:文件列文件名(<= 3 个),目录只显示末级名
    const displayText = hasFiles
        ? sourceFilePaths.length <= MAX_DISPLAY_FILENAMES
            ? sourceFilePaths.map((p) => p.split(/[/\\]/).pop()).join('、')
            : `${sourceFilePaths.length} 个视频文件`
        : hasDirectory
          ? sourceAssetDirectory.split(/[/\\]/).pop() || sourceAssetDirectory
          : '';

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
                {/* 素材选择区(支持文件选择器 + 拖拽) */}
                <div
                    className="absolute left-[340px] top-[296px] flex h-[68px] w-[600px] items-center gap-2"
                    onDragOver={handleDragOver}
                    onDrop={handleDrop}
                >
                    {/* 已选文件/目录显示 */}
                    <div
                        className={`flex h-[58px] flex-1 items-center gap-2 rounded-[12px] border px-[14px] transition-colors duration-200 ${
                            hasSource
                                ? 'border-[#D97706] bg-[#FFFBEB]'
                                : 'border-dashed border-[#D6D3D1] bg-[#FAF9F7]'
                        }`}
                    >
                        {hasSource ? (
                            <>
                                <span className="shrink-0 text-[16px] text-[#D97706]">
                                    <Icon
                                        name="folder"
                                        className="h-[18px] w-[18px]"
                                    />
                                </span>
                                <span className="min-w-0 flex-1 truncate text-[14px] font-[600] text-[#1C1917]">
                                    {displayText}
                                </span>
                                <button
                                    className="shrink-0 text-[14px] text-[#A8A29E] hover:text-[#78716C]"
                                    onClick={
                                        hasFiles
                                            ? handleClearFiles
                                            : handleClearDirectory
                                    }
                                    type="button"
                                >
                                    <Icon
                                        name="x"
                                        className="h-[14px] w-[14px]"
                                    />
                                </button>
                            </>
                        ) : (
                            <span className="text-[15px] text-[#A8A29E]">
                                拖拽视频文件到此处，或点击右侧按钮选择
                            </span>
                        )}
                    </div>
                    {/* 选择按钮 */}
                    <div className="flex shrink-0 flex-col gap-1">
                        <button
                            className="flex h-[27px] items-center gap-1 rounded-[8px] border border-[#E7E5E0] bg-[#FAF9F7] px-[10px] text-[13px] font-[600] text-[#57534E] transition-colors hover:border-[#D97706] hover:text-[#D97706] disabled:cursor-not-allowed disabled:opacity-50"
                            disabled={disabled}
                            onClick={handleSelectFiles}
                            type="button"
                        >
                            选择文件
                        </button>
                        <button
                            className="flex h-[27px] items-center gap-1 rounded-[8px] border border-[#E7E5E0] bg-[#FAF9F7] px-[10px] text-[13px] font-[600] text-[#57534E] transition-colors hover:border-[#D97706] hover:text-[#D97706] disabled:cursor-not-allowed disabled:opacity-50"
                            disabled={disabled}
                            onClick={handleSelectDirectory}
                            type="button"
                        >
                            选择目录
                        </button>
                    </div>
                </div>
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
