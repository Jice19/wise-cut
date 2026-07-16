
import type { VideoExportProgressEvent } from '../../shared/video-export';

export type ExportDialogState =
    | 'cancelled'
    | 'completed'
    | 'failed'
    | 'idle'
    | 'running';

const progressTone = {
    cancelled: {
        bar: 'bg-[#F6B84B]',
        title: '已取消导出'
    },
    completed: {
        bar: 'bg-[#7DD87D]',
        title: '导出完成'
    },
    failed: {
        bar: 'bg-[#FF6B86]',
        title: '导出失败'
    },
    idle: {
        bar: 'bg-[#B497CF]',
        title: '导出视频'
    },
    running: {
        bar: 'bg-[#F05F73]',
        title: '导出进度'
    }
} satisfies Record<
    ExportDialogState,
    {
        bar: string;
        title: string;
    }
>;

const formatDuration = (durationMs = 0) => {
    const totalSeconds = Math.max(0, Math.round(durationMs / 1000));
    const minutes = Math.floor(totalSeconds / 60);
    const seconds = totalSeconds % 60;

    return `${String(minutes).padStart(2, '0')}:${String(seconds).padStart(
        2,
        '0'
    )}`;
};

export const ExportProgressDialog = ({
    durationMs,
    onChoosePath,
    onClose,
    onStartExport,
    outputPath,
    progress,
    state
}: {
    durationMs?: number;
    onChoosePath?: () => void;
    onClose?: () => void;
    onStartExport?: () => void;
    outputPath?: string;
    progress?: VideoExportProgressEvent;
    state?: ExportDialogState;
}) => {
    if (!state) return null;

    const tone = progressTone[state];
    const percent = progress?.percent ?? 0;
    const canClose = state !== 'running';
    const canStart = state === 'idle' && Boolean(outputPath);

    return (
        <div className="fixed inset-0 z-[90] grid place-items-center bg-[#05060A]/72 px-6 backdrop-blur-[18px]">
            <section
                role="dialog"
                aria-modal="true"
                aria-labelledby="export-progress-title"
                className="w-full max-w-[480px] rounded-[22px] border border-white/12 bg-[#181A20]/95 p-6 text-[#F5F7FA] shadow-[0_28px_90px_rgba(0,0,0,0.46)]"
            >
                <div className="flex items-start justify-between gap-4">
                    <div>
                        <h2
                            id="export-progress-title"
                            className="text-[20px] font-[900] leading-tight text-white"
                        >
                            {tone.title}
                        </h2>
                        <p className="mt-2 text-[13px] font-[650] leading-[1.7] text-[#AEB4BF]">
                            {progress?.message ??
                                '选择输出位置后开始渲染导出。'}
                        </p>
                    </div>
                    {state === 'idle' ? (
                        <span className="rounded-full border border-white/10 bg-white/8 px-3 py-1 text-[12px] font-[900] text-[#D8DDE6]">
                            MP4
                        </span>
                    ) : (
                        <span className="rounded-full border border-white/10 bg-white/8 px-3 py-1 text-[13px] font-[900] text-white">
                            {percent}%
                        </span>
                    )}
                </div>

                <div className="mt-6 grid gap-3 rounded-[16px] border border-white/10 bg-white/[0.04] p-4">
                    <div className="flex items-center justify-between gap-4 text-[13px]">
                        <span className="font-[750] text-[#AEB4BF]">
                            视频时长
                        </span>
                        <span className="font-[850] text-white">
                            {formatDuration(durationMs)}
                        </span>
                    </div>
                    <div className="flex items-center justify-between gap-4 text-[13px]">
                        <span className="font-[750] text-[#AEB4BF]">
                            输出格式
                        </span>
                        <span className="font-[850] text-white">MP4</span>
                    </div>
                    <div className="grid gap-2 text-[13px]">
                        <span className="font-[750] text-[#AEB4BF]">
                            输出路径
                        </span>
                        <div className="min-h-10 break-all rounded-[12px] border border-white/10 bg-[#101218] px-3 py-2 font-['Geist'] text-[12px] leading-[1.5] text-[#D8DDE6]">
                            {outputPath ?? '请选择导出位置'}
                        </div>
                    </div>
                </div>

                {state !== 'idle' ? (
                    <div className="mt-6 h-2 overflow-hidden rounded-full bg-white/10">
                        <div
                            className={`h-full rounded-full transition-[width] duration-300 ease-out ${tone.bar}`}
                            style={{ width: `${percent}%` }}
                        />
                    </div>
                ) : null}

                <div className="mt-6 flex justify-between gap-3">
                    <button
                        type="button"
                        className="h-10 rounded-full border border-white/10 px-5 text-[13px] font-[800] text-[#CBD1DA] transition-colors duration-200 hover:border-white/18 hover:bg-white/8 hover:text-white focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#B497CF] disabled:cursor-not-allowed disabled:opacity-60"
                        disabled={!canClose}
                        onClick={onClose}
                    >
                        关闭
                    </button>
                    <div className="flex gap-3">
                        <button
                            type="button"
                            className="h-10 rounded-full border border-white/10 px-5 text-[13px] font-[800] text-[#CBD1DA] transition-colors duration-200 hover:border-white/18 hover:bg-white/8 hover:text-white focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#B497CF] disabled:cursor-not-allowed disabled:opacity-60"
                            disabled={state !== 'idle'}
                            onClick={onChoosePath}
                        >
                            选择路径
                        </button>
                        <button
                            type="button"
                            className="h-10 rounded-full bg-[#F05F73] px-5 text-[13px] font-[900] text-white shadow-[0_12px_30px_rgba(240,95,115,0.24)] transition-colors duration-200 hover:bg-[#FF7488] focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#FFD1DA] disabled:cursor-not-allowed disabled:opacity-60"
                            disabled={!canStart}
                            onClick={onStartExport}
                        >
                            开始导出
                        </button>
                    </div>
                </div>
            </section>
        </div>
    );
};
