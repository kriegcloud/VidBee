// Pre-port compiler-emitted declaration closure; kept unchanged for compatibility checks.
import type { AsrRecognizerResult } from './asr-words';
/**
 * True when JSON.parse failed because a string contained a raw control char.
 *
 * @param error Thrown value from JSON.parse.
 */
export declare const isJsonControlCharError: (error: unknown) => boolean;
/**
 * Escape U+0000–U+001F that sherpa-onnx left raw inside JSON string literals.
 *
 * Native `getOfflineStreamResultAsJson` can emit movie-dialogue newlines
 * without `\\n`, which V8 rejects at parse time.
 *
 * @param raw JSON text from sherpa-onnx.
 */
export declare const escapeJsonStringControlChars: (raw: string) => string;
/**
 * Parse sherpa-onnx ASR JSON, repairing unescaped control characters first.
 *
 * @param raw JSON text from `getOfflineStreamResultAsJson`.
 */
export declare const parseAsrResultJson: (raw: string) => AsrRecognizerResult;
/**
 * Run `fn` with JSON.parse that retries after escaping raw control characters.
 *
 * sherpa-onnx-node calls JSON.parse internally inside `getResult`.
 *
 * @param fn Callback that may invoke JSON.parse.
 */
export declare const withSanitizedJsonParse: <T>(fn: () => T) => T;
/**
 * Read one offline ASR result, repairing sherpa-onnx JSON if needed.
 *
 * @param recognizer sherpa-onnx OfflineRecognizer.
 * @param stream Stream that has already been decoded.
 */
export declare const readAsrResult: <TStream>(recognizer: {
    getResult: (stream: TStream) => AsrRecognizerResult;
}, stream: TStream) => AsrRecognizerResult;
