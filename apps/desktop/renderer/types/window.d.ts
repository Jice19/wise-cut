/* */
import type {
    ApiConfigSetInput,
    ApiConfigStatus
} from '../../shared/api-config-channels';
import type { AppUpdateCheckResult } from '../../shared/app-updater-channels';
import type { CustomVoiceImportInput } from '../../shared/custom-voice';
import type {
    DesktopAgentRunEvent,
    VideoAgentAnalyzeAssetInput,
    VideoAgentApprovalInput,
    VideoAgentCancelInput,
    VideoAgentRegenerateSceneInput,
    VideoAgentRegenerateVoicesInput,
    VideoAgentReportSelectedFramesInput,
    VideoAgentStartInput
} from '../../shared/video-agent';
import type {
    VideoExportProgressEvent,
    VideoExportRenderInput,
    VideoExportSelectOutputPathInput
} from '../../shared/video-export';
import type { VideoProject } from '@wise-cut/video-project';

declare global {
    interface Window {
        miaomaAPI: {
            appUpdater: {
                checkForUpdate: () => Promise<AppUpdateCheckResult>;
                openReleasePage: (url: string) => Promise<void>;
            };
            apiConfig: {
                clear: () => Promise<void>;
                getStatus: () => Promise<ApiConfigStatus>;
                set: (
                    input: ApiConfigSetInput
                ) => Promise<{ success: boolean }>;
            };
            ping: () => Promise<{ success: boolean }>;
            customVoice: {
                checkIndexTts2: () => Promise<{ available: boolean }>;
                importReferenceAudio: (
                    input?: CustomVoiceImportInput
                ) => Promise<{ success: boolean; referenceId?: string }>;
                list: () => Promise<
                    { id: string; name: string; referenceId: string }[]
                >;
            };
            videoExport: {
                onProgress: (
                    listener: (event: VideoExportProgressEvent) => void
                ) => () => void;
                render: (
                    input: VideoExportRenderInput
                ) => Promise<{
                    success: boolean;
                    outputPath?: string;
                    error?: string;
                }>;
                selectOutputPath: (
                    input: VideoExportSelectOutputPathInput
                ) => Promise<{ canceled: boolean; filePath?: string }>;
            };
            videoAgent: {
                analyzeAsset: (
                    input: VideoAgentAnalyzeAssetInput
                ) => Promise<void>;
                approve: (input: VideoAgentApprovalInput) => Promise<void>;
                cancel: (input: VideoAgentCancelInput) => Promise<void>;
                onEvent: (
                    listener: (event: DesktopAgentRunEvent) => void
                ) => () => void;
                regenerateScene: (
                    input: VideoAgentRegenerateSceneInput
                ) => Promise<void>;
                regenerateVoices: (
                    input: VideoAgentRegenerateVoicesInput
                ) => Promise<void>;
                reportSelectedFrames: (
                    input: VideoAgentReportSelectedFramesInput
                ) => Promise<void>;
                start: (input: VideoAgentStartInput) => Promise<void>;
            };
            videoProject: {
                create: (
                    project: VideoProject
                ) => Promise<{ success: boolean; projectId?: string }>;
                delete: (projectId: string) => Promise<{ success: boolean }>;
                list: () => Promise<
                    { id: string; name: string; updatedAt: string }[]
                >;
                read: (
                    filePath: string
                ) => Promise<{ success: boolean; project?: VideoProject }>;
                readById: (
                    projectId: string
                ) => Promise<{ success: boolean; project?: VideoProject }>;
                save: (input: {
                    filePath: string;
                    project: VideoProject;
                }) => Promise<{ success: boolean; filePath?: string }>;
                validate: (
                    project: unknown
                ) => Promise<{ valid: boolean; errors?: string[] }>;
            };
        };
    }
}

export {};
