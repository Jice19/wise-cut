
import type { VideoProject } from '@wise-cut/video-project';

import type {
    VideoProjectDeleteResult,
    VideoProjectFileResult,
    VideoProjectOperationResult
} from './client/video-project-store';
import type {
    CustomVoiceImportData,
    CustomVoiceImportInput,
    CustomVoiceItem,
    CustomVoiceOperationResult,
    CustomVoiceProviderStatus
} from './shared/custom-voice';
import type {
    DesktopAgentRunEvent,
    VideoAgentAnalyzeAssetInput,
    VideoAgentApprovalInput,
    VideoAgentCancelInput,
    VideoAgentOperationResult,
    VideoAgentRegenerateSceneInput,
    VideoAgentRegenerateVoicesInput,
    VideoAgentReportSelectedFramesInput,
    VideoAgentResultData,
    VideoAgentStartInput
} from './shared/video-agent';
import type {
    VideoExportOperationResult,
    VideoExportProgressEvent,
    VideoExportRenderInput,
    VideoExportSelectOutputPathInput
} from './shared/video-export';

declare global {
    interface Window {
        miaomaAPI: {
            customVoice: {
                checkIndexTts2: () => Promise<
                    CustomVoiceOperationResult<CustomVoiceProviderStatus>
                >;
                importReferenceAudio: (
                    input?: CustomVoiceImportInput
                ) => Promise<CustomVoiceOperationResult<CustomVoiceImportData>>;
                list: () => Promise<
                    CustomVoiceOperationResult<CustomVoiceItem[]>
                >;
            };
            ping: () => Promise<{ success: boolean }>;
            videoExport: {
                onProgress: (
                    listener: (event: VideoExportProgressEvent) => void
                ) => () => void;
                render: (
                    input: VideoExportRenderInput
                ) => Promise<VideoExportOperationResult>;
                selectOutputPath: (
                    input: VideoExportSelectOutputPathInput
                ) => Promise<VideoExportOperationResult>;
            };
            videoAgent: {
                analyzeAsset: (
                    input: VideoAgentAnalyzeAssetInput
                ) => Promise<VideoAgentOperationResult<VideoAgentResultData>>;
                approve: (
                    input: VideoAgentApprovalInput
                ) => Promise<VideoAgentOperationResult<VideoAgentResultData>>;
                cancel: (
                    input: VideoAgentCancelInput
                ) => Promise<VideoAgentOperationResult<VideoAgentResultData>>;
                onEvent: (
                    listener: (event: DesktopAgentRunEvent) => void
                ) => () => void;
                regenerateScene: (
                    input: VideoAgentRegenerateSceneInput
                ) => Promise<VideoAgentOperationResult<VideoAgentResultData>>;
                regenerateVoices: (
                    input: VideoAgentRegenerateVoicesInput
                ) => Promise<VideoAgentOperationResult<VideoAgentResultData>>;
                reportSelectedFrames: (
                    input: VideoAgentReportSelectedFramesInput
                ) => Promise<VideoAgentOperationResult<VideoAgentResultData>>;
                start: (
                    input: VideoAgentStartInput
                ) => Promise<VideoAgentOperationResult<VideoAgentResultData>>;
            };
            videoProject: {
                create: (
                    project: VideoProject
                ) => Promise<
                    VideoProjectOperationResult<VideoProjectFileResult>
                >;
                delete: (
                    projectId: string
                ) => Promise<
                    VideoProjectOperationResult<VideoProjectDeleteResult>
                >;
                list: () => Promise<
                    VideoProjectOperationResult<VideoProjectFileResult[]>
                >;
                read: (
                    filePath: string
                ) => Promise<VideoProjectOperationResult<VideoProject>>;
                readById: (
                    projectId: string
                ) => Promise<VideoProjectOperationResult<VideoProject>>;
                save: (input: {
                    filePath: string;
                    project: VideoProject;
                }) => Promise<VideoProjectOperationResult<VideoProject>>;
                validate: (
                    project: unknown
                ) => Promise<VideoProjectOperationResult<VideoProject>>;
            };
        };
    }
}

export {};
