import * as Effect from "effect/Effect";
import * as HashSet from "effect/HashSet";
import * as S from "effect/Schema";
import { app, BrowserWindow, ipcMain } from "electron";
import { makeElectronWire } from "../src/main/ipc/ElectronRpcServer.driver.js";
import { originalFailure } from "../src/main/lib/OriginalFailure.errors.js";
import { Connect, channels, Input, Output } from "../src/renderer/src/transport/ElectronRpc.model.js";

/**
 * Native APIs confined to this fixture driver; caller runs only an isolated packaged runtime.
 *
 * **Example** (Use nativeHarness at its owning boundary)
 *
 * ```ts
 * import { nativeHarness } from "./ElectronLifecycle.driver.js"
 * import * as Effect from "effect/Effect"
 * const fixture = Effect.scoped(nativeHarness());
 * void fixture;
 * ```
 *
 * @category utilities
 * @since 0.0.0
 */
export const nativeHarness = Effect.fn("ElectronLifecycle.native")(function* () {
  yield* Effect.tryPromise({
    try: () => app.whenReady(),
    catch: (original) => originalFailure({ operation: "ready", legacyMessage: "ready", original }),
  });
  let registered = HashSet.empty<number>();
  const open = Effect.fn("ElectronLifecycle.open")(function* () {
    const window = yield* Effect.acquireRelease(
      Effect.sync(
        () =>
          new BrowserWindow({
            show: false,
            webPreferences: { nodeIntegration: true, contextIsolation: false, sandbox: false },
          })
      ),
      (window) => Effect.sync(() => window.destroy())
    );
    registered = HashSet.add(registered, window.webContents.id);
    const execute = (source: string) =>
      Effect.tryPromise({
        try: (): Promise<unknown> => window.webContents.executeJavaScript(source),
        catch: (original) => originalFailure({ operation: "execute", legacyMessage: "execute", original }),
      });
    const load = Effect.tryPromise({
      try: () => window.loadURL("data:text/html,<title>transport fixture</title>"),
      catch: (original) => originalFailure({ operation: "load", legacyMessage: "load", original }),
    });
    yield* load;
    return {
      connect: execute(`require("electron").ipcRenderer.invoke("${channels.connect}")`).pipe(
        Effect.flatMap(S.decodeUnknownEffect(Connect))
      ),
      exchange: Effect.fn("ElectronLifecycle.exchange")(function* (input: Input) {
        const frame = yield* S.encodeEffect(S.fromJsonString(Input))(input);
        const literal = yield* S.encodeEffect(S.fromJsonString(S.String))(frame);
        const raw = yield* execute(
          `new Promise(resolve => { const ipc = require("electron").ipcRenderer; ipc.once("${channels.message}", (_event, frame) => resolve(frame)); ipc.send("${channels.message}", ${literal}); })`
        );
        return yield* S.decodeUnknownEffect(S.fromJsonString(Output))(raw);
      }),
      reload: Effect.callback<void>((resume) => {
        const loaded = () => resume(Effect.void);
        window.webContents.once("did-finish-load", loaded);
        window.webContents.reload();
        return Effect.sync(() => window.webContents.removeListener("did-finish-load", loaded));
      }),
      crash: Effect.sync(() => window.webContents.forcefullyCrashRenderer()),
      load,
      react: Effect.tryPromise({
        try: () => window.loadFile(`${app.getAppPath()}/react.html`),
        catch: (original) => originalFailure({ operation: "react-load", legacyMessage: "react-load", original }),
      }).pipe(Effect.andThen(execute("globalThis.transportReactProof()"))),
    };
  });
  return {
    wire: makeElectronWire({
      ipc: ipcMain,
      authority: {
        registeredRole: (contents) => (HashSet.has(registered, contents.id) ? "visible" : undefined),
        packagedRendererUrl: `file://${app.getAppPath()}/react.html`,
        developmentRendererUrl: "data:text/html,<title>transport fixture</title>",
        allowsProcedure: (role, tag) => role === "visible" && (tag === "Echo" || tag === "Watch"),
      },
    }),
    open,
  };
});
