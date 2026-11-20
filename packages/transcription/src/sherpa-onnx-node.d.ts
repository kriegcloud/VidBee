// Public synchronous APIs validated against the installed sherpa-onnx-node 2.0.1
// JavaScript. Observations intentionally remain unknown until driver decoding.
declare module "sherpa-onnx-node" {
  export interface OfflineStream {
    readonly acceptWaveform: (wave: { sampleRate: number; samples: Float32Array }) => void;
    readonly handle?: unknown;
    readonly inputFinished?: () => void;
    readonly setOption?: (key: string, value: string) => void;
  }
  export interface Recognizer {
    readonly createStream: () => OfflineStream;
    readonly decode: (stream: OfflineStream) => void;
    readonly getResult: (stream: OfflineStream) => unknown;
  }
  export interface Vad {
    readonly acceptWaveform: (samples: Float32Array) => void;
    readonly config?: unknown;
    readonly flush: () => void;
    readonly front: (external?: boolean) => unknown;
    readonly isEmpty: () => boolean;
    readonly pop: () => void;
  }
  export interface Diarizer {
    readonly process: (samples: Float32Array) => unknown;
    readonly sampleRate?: number;
  }
  export interface Embedding {
    readonly compute: (stream: OfflineStream, external?: boolean) => unknown;
    readonly createStream: () => OfflineStream;
    readonly isReady?: (stream: OfflineStream) => boolean;
  }
  export interface Punctuation {
    readonly addPunct: (text: string) => unknown;
  }
  export interface Addon {
    readonly OfflinePunctuation?: new (config: Record<string, unknown>) => Punctuation;
    readonly OfflineRecognizer: new (config: Record<string, unknown>) => Recognizer;
    readonly OfflineSpeakerDiarization: new (config: Record<string, unknown>) => Diarizer;
    readonly SpeakerEmbeddingExtractor?: new (config: Record<string, unknown>) => Embedding;
    readonly Vad: new (config: Record<string, unknown>, bufferSeconds?: number) => Vad;
  }
  const addon: Addon;
  export default addon;
}
declare module "sherpa-onnx-node/addon.js" {
  const addon: { readonly getOfflineStreamResultAsJson: (handle: unknown) => unknown };
  export default addon;
}
