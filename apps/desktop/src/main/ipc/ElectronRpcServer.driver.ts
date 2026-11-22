import * as A from "effect/Array";
import * as Effect from "effect/Effect";
import * as HashMap from "effect/HashMap";
import * as O from "effect/Option";
import * as Result from "effect/Result";
import * as S from "effect/Schema";
import { failure } from "../../renderer/src/transport/DocumentDelivery.errors.js";
import { channels } from "../../renderer/src/transport/ElectronRpc.model.js";
import type { IpcMain, IpcMainEvent, WebContents, WebFrameMain } from "electron";
import type { ElectronRpcWire } from "./ElectronRpcServer.layer.js";

/**
 * Describes Application Authority ownership at the desktop transport boundary.
 *
 * @category type-level
 * @since 0.0.0
 */
export interface ApplicationAuthority {
  readonly allowsProcedure: (role: "visible" | "capture", tag: string) => boolean;
  readonly developmentRendererUrl?: string;
  readonly packagedRendererUrl: string;
  readonly registeredRole: (contents: WebContents) => "visible" | "capture" | undefined;
}
interface Document {
  readonly contents: WebContents;
  readonly dispose: () => void;
  readonly frame: WebFrameMain;
  readonly role: "visible" | "capture";
  readonly session: string;
}
/**
 * Acquisition registers only owned handlers. Main bootstrap supplies its existing ipcMain.
 *
 * **Example** (Use makeElectronWire at its owning boundary)
 *
 * ```ts
 * import { makeElectronWire } from "./ElectronRpcServer.driver.js"
 * const compose = (options: Parameters<typeof makeElectronWire>[0]) => makeElectronWire(options);
 * void compose;
 * ```
 *
 * @category utilities
 * @since 0.0.0
 */
export const makeElectronWire = ({
  ipc,
  authority,
}: {
  readonly ipc: IpcMain;
  readonly authority: ApplicationAuthority;
}): ElectronRpcWire["Service"] => {
  let documents = HashMap.empty<string, Document>();
  let byWindow = HashMap.empty<number, string>();
  let generation = 0;
  const permittedUrl = (url: string) => {
    const candidate = new URL(url);
    const permitted = (configured: string) => {
      const expected = new URL(configured);
      return (
        candidate.protocol === expected.protocol &&
        candidate.host === expected.host &&
        candidate.pathname === expected.pathname &&
        candidate.username === "" &&
        candidate.password === ""
      );
    };
    return (
      permitted(authority.packagedRendererUrl) ||
      (authority.developmentRendererUrl !== undefined && permitted(authority.developmentRendererUrl))
    );
  };
  const authorized = (document: Document) =>
    !document.contents.isDestroyed() &&
    document.contents.mainFrame === document.frame &&
    authority.registeredRole(document.contents) === document.role &&
    permittedUrl(document.frame.url);
  return {
    listen: (receive, closed) =>
      Effect.acquireRelease(
        Effect.sync(() => {
          const close = (session: string) => {
            const doc = HashMap.get(documents, session);
            if (O.isNone(doc)) return;
            documents = HashMap.remove(documents, session);
            byWindow = HashMap.remove(byWindow, doc.value.contents.id);
            doc.value.dispose();
            closed(session);
          };
          const installed: Array<() => void> = [];
          const own = (acquire: () => void, release: () => void) => {
            installed.push(release);
            acquire();
          };
          const ownChannel = (acquire: () => void, release: () => void) => {
            acquire();
            installed.push(release);
          };
          const dispose = () => {
            for (const release of A.reverse(installed)) release();
            for (const session of HashMap.keys(documents)) close(session);
          };
          try {
            ownChannel(
              () =>
                ipc.handle(channels.connect, (event) => {
                  const role = authority.registeredRole(event.sender);
                  if (
                    role === undefined ||
                    !permittedUrl(event.sender.mainFrame.url) ||
                    event.senderFrame !== event.sender.mainFrame
                  )
                    return Result.getOrThrowWith(Result.fail(failure("UnauthorizedDocument")), (error) => error);
                  if (generation >= Number.MAX_SAFE_INTEGER || HashMap.size(documents) >= 16)
                    return Result.getOrThrowWith(Result.fail(failure("SessionCapacity")), (error) => error);
                  const previous = HashMap.get(byWindow, event.sender.id);
                  if (O.isSome(previous)) close(previous.value);
                  const contents = event.sender;
                  const frame = event.sender.mainFrame;
                  const session = `${contents.id}/${++generation}`;
                  const end = () => close(session);
                  const navigation = (_event: unknown, _url: string, inPlace: boolean, mainFrame: boolean) => {
                    if (mainFrame && !inPlace) close(session);
                  };
                  contents.on("did-start-navigation", navigation);
                  contents.on("render-process-gone", end);
                  contents.on("destroyed", end);
                  const document: Document = {
                    contents,
                    frame,
                    role,
                    session,
                    dispose: () => {
                      contents.removeListener("did-start-navigation", navigation);
                      contents.removeListener("render-process-gone", end);
                      contents.removeListener("destroyed", end);
                    },
                  };
                  documents = HashMap.set(documents, session, document);
                  byWindow = HashMap.set(byWindow, contents.id, session);
                  return { session, generation, version: 1 };
                }),
              () => ipc.removeHandler(channels.connect)
            );
            const message = (event: IpcMainEvent, raw: unknown) => {
              const session = HashMap.get(byWindow, event.sender.id);
              if (O.isNone(session)) return;
              const doc = HashMap.get(documents, session.value);
              if (
                O.isNone(doc) ||
                doc.value.contents !== event.sender ||
                doc.value.frame !== event.senderFrame ||
                !authorized(doc.value)
              )
                return;
              receive(raw, session.value, event.sender.id.toString());
            };
            const end = (event: IpcMainEvent, session: unknown) => {
              if (!S.is(S.String)(session)) return;
              const doc = HashMap.get(documents, session);
              if (O.isSome(doc) && doc.value.contents === event.sender && doc.value.frame === event.senderFrame)
                close(session);
            };
            own(
              () => {
                ipc.on(channels.message, message);
              },
              () => {
                ipc.removeListener(channels.message, message);
              }
            );
            own(
              () => {
                ipc.on(channels.end, end);
              },
              () => {
                ipc.removeListener(channels.end, end);
              }
            );
            return dispose;
          } catch (error) {
            dispose();
            return Result.getOrThrowWith(Result.fail(error), (original) => original);
          }
        }),
        (dispose) => Effect.sync(dispose)
      ).pipe(Effect.asVoid),
    authorize: (session, tag) =>
      Effect.sync(() =>
        O.exists(
          HashMap.get(documents, session),
          (document) => authorized(document) && authority.allowsProcedure(document.role, tag)
        )
      ),
    account: (session) =>
      Effect.suspend(() =>
        O.match(HashMap.get(documents, session), {
          onNone: () => Effect.fail(failure("Disconnected")),
          onSome: (document) => Effect.succeed(document.contents.id.toString()),
        })
      ),
    send: (session, frame) =>
      Effect.try({
        try: () => {
          const document = O.getOrUndefined(HashMap.get(documents, session));
          if (document !== undefined && authorized(document)) document.frame.send(channels.message, frame);
          else return Result.getOrThrowWith(Result.fail(failure("Disconnected")), (error) => error);
        },
        catch: () => failure("PhysicalSendFailed"),
      }),
  };
};
