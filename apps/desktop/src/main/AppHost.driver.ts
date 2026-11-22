import * as Effect from "effect/Effect";
import * as Layer from "effect/Layer";
import * as P from "effect/Predicate";
import * as Str from "effect/String";
import { failure as capacityFailure } from "../renderer/src/transport/DocumentDelivery.errors.js";
import { AppHost } from "./AppHost.service.js";
import { originalFailure } from "./lib/OriginalFailure.errors.js";
import type { MessageBoxOptions, MessageBoxResult } from "../shared/App.model.js";
import type { YtDlpKernelStatus } from "../shared/types/ytdlp-kernel.js";
import type { AppHostOperations } from "./AppHost.service.js";
import type { OriginalFailure } from "./lib/OriginalFailure.errors.js";
import type { NativeMessageBoxOptions, NativeRetention } from "./NativeFoundation.model.js";

/** Native application primitives; Promise adaptation is confined to this driver.
 * @category type-level
 * @since 0.0.0
 */
export interface AppPrimitives {
  readonly base64: (bytes: ArrayBuffer) => string;
  readonly fetch: (url: string) => Promise<Response>;
  readonly ffmpegReady: () => PromiseLike<boolean>;
  readonly kernel: () => { readonly prepare: () => PromiseLike<unknown>; readonly getStatus: () => YtDlpKernelStatus };
  readonly kernelStatus: () => YtDlpKernelStatus;
  readonly messageBox: (options: unknown) => MessageBoxResult | PromiseLike<MessageBoxResult>;
  readonly platform: () => string;
  readonly quit: () => void;
  readonly systemVersion: () => string;
  readonly version: () => string;
  readonly ytdlpReady: () => boolean;
}
/** Adapts separately borrowed native primitives. Constructing a Layer neither resolves a host nor starts a native operation.
 * **Example** (Supply a late-bound application host)
 * ```ts
 * import { appHostLayer } from './AppHost.driver.js'
 * import type { AppPrimitives } from './AppHost.driver.js'
 * export const driver = (borrow:()=>AppPrimitives) => appHostLayer(borrow)
 * // Install the host at its original static import boundary before running an operation.
 * ```
 * @category layers
 * @since 0.0.0
 */
export const appHostLayer = (borrow: () => AppPrimitives) =>
  Layer.succeed(AppHost, {
    forCall: (call) => {
      const failure = (operation: string) => (original: unknown) =>
        originalFailure({
          original,
          operation,
          legacyMessage: original instanceof Error ? original.message : String(original),
        });
      const sync = <A>(operation: string, body: (host: AppPrimitives) => A) =>
        Effect.try({ try: () => call.use(() => body(borrow())), catch: failure(operation) });
      const promise = <A>(operation: string, body: (host: AppPrimitives) => PromiseLike<A>) =>
        Effect.tryPromise({ try: () => call.use(() => body(borrow())), catch: failure(operation) });
      const operations: AppHostOperations = {
        version: sync("App.getVersion", (host) => host.version()),
        platform: sync("App.getPlatform", (host) => host.platform()),
        systemVersion: sync("App.getOsVersion", (host) => host.systemVersion()),
        quit: sync("App.quit", (host) => host.quit()),
        ffmpegReady: promise("App.ffmpegReady", (host) => host.ffmpegReady()),
        ytdlpReady: sync("App.ytdlpReady", (host) => host.ytdlpReady()),
        kernelStatus: sync("App.kernelStatus", (host) => host.kernelStatus()),
        acquireKernel: sync("App.acquireKernel", (host) => host.kernel()).pipe(
          Effect.map((kernel) => ({
            prepare: Effect.tryPromise({
              try: () => call.use(() => kernel.prepare()),
              catch: failure("App.prepareKernel"),
            }).pipe(Effect.asVoid),
            status: sync("App.kernelStatus", () => kernel.getStatus()),
          }))
        ),
        messageBox: Effect.fn("AppHost.messageBox")(function* (options: MessageBoxOptions | NativeMessageBoxOptions) {
          const result = yield* sync("App.showMessageBox", (host) => host.messageBox(options));
          if (P.isPromiseLike(result)) {
            // The original async method adopts the returned native Promise in
            // a microtask before observing it. Keep that boundary for already
            // settled and deferred native results without delaying the native prefix.
            return yield* Effect.callback<MessageBoxResult, OriginalFailure>((resume) => {
              queueMicrotask(() => {
                try {
                  result.then(
                    (value) => resume(Effect.succeed(value)),
                    (error) => resume(Effect.fail(failure("App.showMessageBox")(error)))
                  );
                } catch (error) {
                  resume(Effect.fail(failure("App.showMessageBox")(error)));
                }
              });
            });
          }
          return result;
        }),
        fetchIcon: Effect.fn("AppHost.fetchIcon")(function* (url: string, retention?: NativeRetention) {
          const response = yield* promise("App.fetchIcon", (host) => host.fetch(url));
          if (!response.ok) return null;
          const contentType = response.headers.get("content-type") || "image/png";
          if (!(Str.includes("image/")(contentType) || Str.includes("icon")(contentType))) return null;
          const boundedBytes = Effect.fn("AppHost.boundedIcon")(function* () {
            if (retention === undefined)
              return yield* Effect.tryPromise({ try: () => response.arrayBuffer(), catch: failure("App.readIcon") });
            const reader = yield* sync("App.readIcon", () => response.body?.getReader());
            if (reader === undefined) return new ArrayBuffer(0);
            const read = Effect.gen(function* () {
              const chunks: Array<Uint8Array> = [];
              let size = 0;
              while (true) {
                // Reserve incoming native staging and the retained chunks, joined
                // bytes and base64 representations before the next read/growth.
                yield* sync("App.readIcon", () => {
                  if (!retention.reserve((size + 1024 * 1024) * 8 + chunks.length * 256))
                    throw capacityFailure("NativeCapacity");
                });
                const part = yield* Effect.tryPromise({ try: () => reader.read(), catch: failure("App.readIcon") });
                if (part.done) break;
                const next = size + part.value.byteLength;
                yield* sync("App.readIcon", () => {
                  if (!retention.reserve((next + 1024 * 1024) * 8 + (chunks.length + 1) * 256))
                    throw capacityFailure("NativeCapacity");
                });
                chunks.push(part.value);
                size = next;
              }
              return yield* sync("App.readIcon", () => {
                const joined = new Uint8Array(size);
                let offset = 0;
                for (const chunk of chunks) {
                  joined.set(chunk, offset);
                  offset += chunk.byteLength;
                }
                return joined.buffer;
              });
            });
            return yield* read.pipe(
              Effect.ensuring(
                Effect.tryPromise({ try: () => reader.cancel(), catch: failure("App.readIcon") }).pipe(
                  Effect.ignoreCause,
                  Effect.andThen(Effect.sync(() => reader.releaseLock()))
                )
              )
            );
          });
          const bytes = yield* boundedBytes();
          const base64 = yield* sync("App.encodeIcon", (host) => host.base64(bytes));
          return `data:${contentType};base64,${base64}`;
        }),
      };
      return operations;
    },
  });
