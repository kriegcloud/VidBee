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

interface Document {
  readonly contents: WebContents;
  readonly dispose: () => void;
  readonly frame: WebFrameMain;
  readonly session: string;
}
/** Acquisition registers only owned handlers. Main bootstrap supplies its existing ipcMain. */
export const makeElectronWire = (ipc: IpcMain): ElectronRpcWire["Service"] => {
  let documents = HashMap.empty<string, Document>();
  let byWindow = HashMap.empty<number, string>();
  let generation = 0;
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
                  if (
                    event.senderFrame !== event.sender.mainFrame ||
                    generation >= Number.MAX_SAFE_INTEGER ||
                    HashMap.size(documents) >= 16
                  )
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
              if (O.isNone(doc) || doc.value.contents !== event.sender || doc.value.frame !== event.senderFrame) return;
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
          if (
            document !== undefined &&
            !document.contents.isDestroyed() &&
            document.frame === document.contents.mainFrame
          )
            document.frame.send(channels.message, frame);
          else return Result.getOrThrowWith(Result.fail(failure("Disconnected")), (error) => error);
        },
        catch: () => failure("PhysicalSendFailed"),
      }),
  };
};
