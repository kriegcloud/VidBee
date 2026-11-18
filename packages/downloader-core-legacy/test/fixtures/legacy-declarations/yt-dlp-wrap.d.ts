/**
 * Unwrap CJS/ESM interop so `new` receives the yt-dlp-wrap-plus class.
 *
 * electron-vite externalizes `yt-dlp-wrap-plus` and compiles
 * `import Ctor from 'yt-dlp-wrap-plus'` to `require(...)`, which yields
 * `{ default: class }` instead of the class itself.
 */
export declare function resolveYtDlpWrapCtor<T extends new (binaryPath: string) => unknown>(exported: unknown): T;
