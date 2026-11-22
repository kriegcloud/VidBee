import * as A from "effect/Array";
import * as Effect from "effect/Effect";
import * as Option from "effect/Option";
import * as R from "effect/Record";
import * as S from "effect/Schema";
import * as Str from "effect/String";
import { ExtensionHostFailure } from "./Extension.errors.js";
import { isRecord } from "./Extension.model.js";
import { requestFailureMessage } from "./Extension.pure.js";
import { ExtensionBrowser } from "./ExtensionBrowser.service.js";
import type { IconOptions, StorageChanges } from "./ExtensionBrowser.service.js";
export interface BrowserHost {
  readonly action: { readonly setIcon: (options: IconOptions) => Promise<void> };
  readonly runtime: {
    readonly getURL: (path: "") => string;
    readonly sendMessage: (command: { readonly type: "video-info:fetch"; readonly url: string }) => Promise<unknown>;
    readonly onMessage: {
      readonly addListener: (listener: MessageListener) => void;
      readonly removeListener: (listener: MessageListener) => void;
    };
  };
  readonly storage: {
    readonly local: {
      readonly get: (key: string) => Promise<Readonly<Record<string, unknown>>>;
      readonly set: (value: Readonly<Record<string, unknown>>) => Promise<void>;
    };
    readonly onChanged: {
      readonly addListener: (listener: StorageListener) => void;
      readonly removeListener: (listener: StorageListener) => void;
    };
  };
  readonly tabs: {
    readonly query: (options: { readonly active: true; readonly currentWindow: true }) => Promise<readonly unknown[]>;
  };
}
export type MessageListener = (
  message: unknown,
  sender: { readonly tab?: { readonly id?: number | undefined } | undefined }
) => undefined;
export type StorageListener = (changes: StorageChanges, area: string) => void;

// Host text is consumed only by the existing presentation path; logged causes contain no host payload.
const failure = (operation: string) => (cause: unknown) =>
  ExtensionHostFailure.make({
    operation,
    cause: "Browser API failure",
    message:
      cause instanceof Error
        ? cause.message
        : operation === "sendMessage"
          ? "Failed to request video info."
          : "Failed to fetch video info.",
  });
const decodeUrl = S.decodeUnknownOption(S.String);
export const makeBrowserDriver = (browser: BrowserHost) =>
  ExtensionBrowser.of({
    origin: Effect.try({
      try: () => Str.replace(/\/$/, "")(browser.runtime.getURL("")),
      catch: (cause) =>
        ExtensionHostFailure.make({
          operation: "origin",
          cause: "Browser API failure",
          message: requestFailureMessage(cause),
        }),
    }),
    queryActiveTabs: Effect.tryPromise({
      try: () => browser.tabs.query({ active: true, currentWindow: true }),
      catch: failure("queryActiveTabs"),
    }).pipe(
      Effect.map((tabs) =>
        A.map(tabs, (tab) => ({ url: Option.getOrUndefined(decodeUrl(isRecord(tab) ? tab.url : undefined)) }))
      )
    ),
    sendMessage: Effect.fn("ExtensionBrowser.sendMessage")((command) =>
      Effect.tryPromise({ try: () => browser.runtime.sendMessage(command), catch: failure("sendMessage") }).pipe(
        Effect.asVoid
      )
    ),
    readCacheRoot: Effect.tryPromise({
      try: () => browser.storage.local.get("videoInfoCacheByUrl"),
      catch: failure("readCacheRoot"),
    }).pipe(Effect.map((data) => ({ present: R.has(data, "videoInfoCacheByUrl"), value: data.videoInfoCacheByUrl }))),
    writeCacheMap: Effect.fn("ExtensionBrowser.writeCacheMap")((map) =>
      Effect.tryPromise({
        try: () => browser.storage.local.set({ videoInfoCacheByUrl: map }),
        catch: failure("writeCacheMap"),
      })
    ),
    setIcon: Effect.fn("ExtensionBrowser.setIcon")((options) =>
      Effect.tryPromise({ try: () => browser.action.setIcon(options), catch: failure("setIcon") })
    ),
    listenStorage: Effect.fn("ExtensionBrowser.listenStorage")((listener) =>
      Effect.try({
        try: () => {
          browser.storage.onChanged.addListener(listener);
          return () => browser.storage.onChanged.removeListener(listener);
        },
        catch: failure("listenStorage"),
      })
    ),
    listenMessages: Effect.fn("ExtensionBrowser.listenMessages")((listener) =>
      Effect.try({
        try: () => {
          const callback = (
            message: unknown,
            sender: { readonly tab?: { readonly id?: number | undefined } | undefined }
          ) =>
            listener(
              isRecord(message) && message.type === "video-info:fetch"
                ? { ...message, url: Option.getOrUndefined(decodeUrl(message.url)) }
                : message,
              { tabId: sender.tab?.id }
            );
          browser.runtime.onMessage.addListener(callback);
          return () => browser.runtime.onMessage.removeListener(callback);
        },
        catch: failure("listenMessages"),
      })
    ),
  });
