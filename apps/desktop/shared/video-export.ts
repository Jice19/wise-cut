
import type { VideoProject } from '@wise-cut/video-project';

export type VideoExportMusicSettings = {
    enabled: boolean;
    selectedTrackId: string;
    volume: number;
};

export type VideoExportSubtitleSettings = {
    fontSizePx: number;
    isVisible: boolean;
    outlineColor: string;
    presetLabel?: string;
    textColor: string;
};

export type VideoExportRenderInput = {
    musicSettings?: VideoExportMusicSettings;
    outputPath?: string;
    project: VideoProject;
    subtitleSettings?: VideoExportSubtitleSettings;
};

export type VideoExportSelectOutputPathInput = {
    projectTitle: string;
};

export type VideoExportProgressPhase =
    | 'cancelled'
    | 'completed'
    | 'failed'
    | 'preparing'
    | 'rendering';

export type VideoExportProgressEvent = {
    message: string;
    percent: number;
    phase: VideoExportProgressPhase;
    rawTimeMs?: number;
};

export type VideoExportErrorCode =
    | 'CANCELLED'
    | 'FFMPEG_FAILED'
    | 'MISSING_ASSET'
    | 'MISSING_BINARY'
    | 'UNSUPPORTED_PLATFORM'
    | 'VALIDATION_FAILED'
    | 'WRITE_FAILED';

export type VideoExportError = {
    code: VideoExportErrorCode;
    message: string;
};

export type VideoExportResultData = {
    outputPath: string;
};

export type VideoExportOperationResult =
    | {
          data: VideoExportResultData;
          success: true;
      }
    | {
          error: VideoExportError;
          success: false;
      };
