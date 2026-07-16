
export type CustomVoiceProvider = 'index-tts2';

export type CustomVoiceItem = {
    createdAt: string;
    id: string;
    provider: CustomVoiceProvider;
    previewAudioUrl?: string;
    sourceFileName: string;
    title: string;
    voiceType: string;
};

export type CustomVoiceProviderStatus = {
    available: boolean;
    message: string;
    provider: CustomVoiceProvider;
    serverUrl: string;
};

export type CustomVoiceErrorCode =
    | 'IMPORT_CANCELLED'
    | 'IMPORT_FAILED'
    | 'READ_FAILED'
    | 'SERVICE_UNAVAILABLE';

export type CustomVoiceOperationResult<T> =
    | {
          data: T;
          success: true;
      }
    | {
          error: {
              code: CustomVoiceErrorCode;
              message: string;
          };
          success: false;
      };

export type CustomVoiceImportInput = {
    filePath?: string;
};

export type CustomVoiceImportData = {
    voice: CustomVoiceItem;
};
