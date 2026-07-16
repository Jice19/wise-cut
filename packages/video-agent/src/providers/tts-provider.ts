/* */
export type TtsProviderEvent =
    | {
          textLength: number;
          type: 'tts.started';
          voice: string;
      }
    | {
          byteLength: number;
          type: 'tts.chunk';
      }
    | {
          byteLength: number;
          durationMs: number;
          outputPath: string;
          type: 'tts.completed';
      }
    | {
          error: string;
          type: 'tts.failed';
      };

export type TtsSynthesisInput = {
    emit?: (event: TtsProviderEvent) => void;
    outputPath: string;
    speedRatio?: number;
    text: string;
    voice: string;
    volumeRatio?: number;
};

export type TtsSynthesisResult = {
    byteLength: number;
    durationMs: number;
    format: 'mp3' | 'wav';
    path: string;
};

export type TtsProvider = {
    /**
     * Stable identifier persisted on `VideoProject.assets.voices[].provider`.
     * Used to distinguish which TTS produced an asset, especially when
     * a RoutingTtsProvider switches between cloud and local providers.
     */
    readonly providerName: string;
    synthesizeSpeech: (input: TtsSynthesisInput) => Promise<TtsSynthesisResult>;
};
