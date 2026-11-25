import { DownloadProcess } from "@vidbee/downloader-core/DownloadProcess.service";
import { LegacyTiming } from "@vidbee/task-queue/LegacyTiming.service";
import { sha256 } from "@vidbee/task-queue/util/sha256";
import * as A from "effect/Array";
import * as Cause from "effect/Cause";
import * as Deferred from "effect/Deferred";
import * as Effect from "effect/Effect";
import * as Exit from "effect/Exit";
import * as Fiber from "effect/Fiber";
import * as HashSet from "effect/HashSet";
import * as Layer from "effect/Layer";
import * as MutableHashMap from "effect/MutableHashMap";
import * as Option from "effect/Option";
import * as Path from "effect/Path";
import * as P from "effect/Predicate";
import * as S from "effect/Schema";
import * as Str from "effect/String";
import { BrowserProfiles, ProfileCodec, ProfileHost } from "./BrowserProfiles.service.js";
import {
  BoundaryDecodeError,
  HostFailure,
  MediaTransferFailure,
  MediaUnavailable,
  ProfileBusy,
  ProfileIdentityMismatch,
  ProfileUnavailable,
} from "./Capture.errors.js";
import { CaptureFiles } from "./CaptureFiles.service.js";
import { CaptureHost } from "./CaptureHost.service.js";
import { CaptureTimers } from "./CaptureTimers.service.js";
import { MediaTransport } from "./MediaTransport.service.js";
import { Playwright } from "./Playwright.service.js";
import type { ProcessRun } from "@vidbee/downloader-core/DownloadProcess.service";
import type { DownloadQueueOperations } from "@vidbee/downloader-core/DownloadQueue.service";
import type * as OnlyFans from "@vidbee/downloader-core/onlyfans-profile";
import type { ProfileOptions, TransferSink } from "./BrowserProfiles.service.js";
import type { CaptureError } from "./Capture.errors.js";
import type { BrowserPage, BrowserSession, LocatorRef, ResponseRef } from "./Playwright.service.js";

const Json = S.fromJsonString(S.Unknown);
const record = (value: unknown): Record<string, unknown> => (P.isObject(value) ? value : {});
const failure = (operation: string, cause: unknown) =>
  HostFailure.make({
    operation,
    cause,
    legacyMessage: cause instanceof Error ? cause.message : String(cause),
  });
const attempt = <A>(operation: string, action: () => A) =>
  Effect.try({
    try: action,
    catch: (cause) => failure(operation, cause),
  });
// Cleanup failures replace the prior result, matching an awaited JavaScript finally.
const finalize = <A, E, R, E2, R2>(work: Effect.Effect<A, E, R>, cleanup: Effect.Effect<void, E2, R2>) =>
  Effect.uninterruptibleMask((restore) =>
    Effect.flatMap(Effect.exit(restore(work)), (exit) =>
      cleanup.pipe(Effect.andThen(Exit.isFailure(exit) ? Effect.failCause(exit.cause) : Effect.succeed(exit.value)))
    )
  );
const keyOf = (
  profile: Pick<OnlyFans.OnlyFansProfile, "username" | "chatId" | "chatRoute" | "purchasedUserId" | "purchasedRoute">
) => {
  if (P.isTruthy(profile.purchasedUserId))
    return `purchased-${profile.purchasedUserId}-${profile.purchasedRoute ?? "all"}`;
  return P.isTruthy(profile.chatId) && P.isTruthy(profile.chatRoute) && profile.chatRoute !== "messages"
    ? `${profile.username}-${profile.chatRoute}`
    : profile.username;
};
export const browserProfilesLayer = (options: ProfileOptions) =>
  Layer.effect(
    BrowserProfiles,
    Effect.gen(function* () {
      const files = yield* CaptureFiles;
      const host = yield* CaptureHost;
      const timers = yield* CaptureTimers;
      const codec = yield* ProfileCodec;
      const profileHost = yield* ProfileHost;
      const transport = yield* MediaTransport;
      const playwright = yield* Playwright;
      const process = yield* DownloadProcess;
      const path = yield* Path.Path;
      const timing = yield* LegacyTiming;
      const scope = yield* Effect.scope;
      const adapter = options.adapter;
      const storageDir = options.storageDir;
      const profiles = MutableHashMap.empty<string, OnlyFans.OnlyFansProfile>();
      const media = MutableHashMap.empty<string, string>();
      let context: BrowserSession | null = null;
      let page: BrowserPage | null = null;
      let opening: {
        done: Deferred.Deferred<BrowserSession, CaptureError>;
      } | null = null;
      let login: ProcessRun | null = null;
      let active: {
        profileUrl: string;
        controller: AbortController;
        done: Deferred.Deferred<void, CaptureError>;
      } | null = null;
      let downloading = false;
      const mediaKey = (username: string, id: string) => `${username}/${id}`;
      const saved = (key: string) => Option.getOrUndefined(MutableHashMap.get(profiles, key));
      const unavailable = (message: string) =>
        ProfileUnavailable.make({
          operation: "profile",
          legacyMessage: message,
        });
      const mediaError = (message: string) =>
        MediaUnavailable.make({
          operation: "media",
          legacyMessage: message,
        });
      const busy = (message: string) =>
        ProfileBusy.make({
          operation: "profile",
          legacyMessage: message,
        });
      const save = Effect.fn("BrowserProfiles.save")(function* (profile: OnlyFans.OnlyFansProfile) {
        yield* files.mkdir(storageDir, {
          recursive: true,
          mode: 0o700,
          sync: true,
        });
        profile.updatedAt = yield* timers.now;
        const target = path.join(storageDir, `${keyOf(profile)}.json`);
        const text = yield* S.encodeUnknownEffect(Json)(profile).pipe(
          Effect.mapError((cause) => failure("encode profile", cause))
        );
        yield* files.write(`${target}.tmp`, text, {
          mode: 0o600,
          sync: true,
        });
        yield* files.rename(`${target}.tmp`, target, {
          sync: true,
        });
      });
      const get = Effect.fn("BrowserProfiles.get")(function* (url: string) {
        const normalized = yield* attempt("normalize profile", () => adapter.normalize(url));
        if (normalized === null || !P.isTruthy(normalized))
          return yield* unavailable(`Enter a ${adapter.name} profile URL.`);
        const key = keyOf(normalized);
        let profile = saved(key);
        if (profile === undefined) {
          const filename = path.join(storageDir, `${key}.json`);
          if (yield* files.exists(filename)) {
            const text = yield* files.readText(filename, {
              sync: true,
            });
            profile = yield* codec.read(text);
            if (
              profile.username !== normalized.username ||
              profile.profileUrl !== normalized.profileUrl ||
              profile.chatId !== normalized.chatId ||
              profile.chatRoute !== normalized.chatRoute ||
              profile.purchasedUserId !== normalized.purchasedUserId ||
              profile.purchasedRoute !== normalized.purchasedRoute
            )
              return yield* ProfileIdentityMismatch.make({
                operation: "get profile",
                legacyMessage: "Saved profile identity does not match.",
              });
            if (profile.state === "mapping") profile.state = "partial";
          } else {
            const updatedAt = yield* timers.now;
            profile = {
              ...normalized,
              state: "idle",
              updatedAt,
              pages: 0,
              items: [],
            };
          }
          MutableHashMap.set(profiles, key, profile);
        }
        return structuredClone(profile);
      });
      const list = Effect.fn("BrowserProfiles.list")(function* () {
        if (!(yield* files.exists(storageDir))) return [];
        const names = yield* files.list(storageDir, {
          sync: true,
        });
        const result: OnlyFans.OnlyFansProfile[] = [];
        for (const name of names) {
          if (!/^[a-z0-9._-]+\.json$/.test(name)) continue;
          const readListed = Effect.fn("BrowserProfiles.readListed")(function* () {
            const text = yield* files.readText(path.join(storageDir, name), {
              sync: true,
            });
            const profile = yield* codec.read(text);
            return yield* get(profile.profileUrl);
          });
          const next = yield* Effect.result(readListed());
          if (next._tag === "Success") result.push(next.success);
        }
        return result;
      });
      const linkUsername = Effect.fn("BrowserProfiles.linkUsername")(function* (
        profile: OnlyFans.OnlyFansProfile,
        username: string
      ) {
        if (!(P.isTruthy(profile.chatId) && adapter.key === "onlyfans")) return;
        const owner = yield* attempt("normalize owner", () => adapter.normalize(`${adapter.origin}/${username}`));
        if (owner === null || P.isTruthy(owner.chatId)) return;
        for (const route of yield* list()) {
          if (route.chatId !== profile.chatId) continue;
          const stored = saved(keyOf(route));
          if (stored !== undefined && stored.creatorUsername !== owner.username) {
            stored.creatorUsername = owner.username;
            yield* save(stored);
          }
        }
        profile.creatorUsername = owner.username;
        yield* save(profile);
        const creator = yield* get(owner.profileUrl);
        const stored = saved(keyOf(creator));
        if (stored !== undefined && stored.linkedChatId !== profile.chatId) {
          stored.linkedChatId = profile.chatId;
          yield* save(stored);
        }
      });
      const linkCreator = Effect.fn("BrowserProfiles.linkCreator")(function* (
        current: BrowserPage,
        profile: OnlyFans.OnlyFansProfile
      ) {
        if (!(P.isTruthy(profile.chatId) && adapter.key === "onlyfans")) return;
        const href = yield* attempt("owner locator", () =>
          current.locator("h1.g-page-title a.g-user-name[href]").first()
        ).pipe(
          Effect.flatMap((locator) =>
            locator.getAttribute("href", {
              timeout: 5000,
            })
          ),
          Effect.orElseSucceed(() => null)
        );
        if (href === null || !P.isTruthy(href)) return;
        const owner = yield* attempt("linked profile", () =>
          adapter.normalize(new URL(href, adapter.origin).href)
        ).pipe(Effect.orElseSucceed(() => null));
        if (owner !== null && !P.isTruthy(owner.chatId)) yield* linkUsername(profile, owner.username);
      });
      const loginAlive = Effect.fn("BrowserProfiles.loginAlive")(() =>
        login === null || login.isRunning === undefined
          ? Effect.succeed(false)
          : login.isRunning.pipe(Effect.orElseSucceed(() => false))
      );
      const browser = Effect.fn("BrowserProfiles.browser")(function* () {
        if (context !== null) {
          return context;
        }
        if (yield* loginAlive())
          return yield* unavailable("Close the dedicated login window after signing in, then map the profile.");
        if (opening === null) {
          const work = Effect.fn("BrowserProfiles.openBrowser")(function* () {
            const executablePath = yield* host.browser("chrome");
            if (executablePath === null || !P.isTruthy(executablePath))
              return yield* unavailable(
                `Install Chrome or Chromium on the VidBeep host to open its ${adapter.name} session.`
              );
            const directory = path.join(storageDir, "browser-session");
            const opened = yield* playwright.launchProfile({
              executablePath,
              userDataDir: directory,
              prepareDirectory: files.mkdir(directory, {
                recursive: true,
                mode: 0o700,
                sync: true,
              }),
            });
            context = opened;
            yield* opened.onClosed(() => {
              context = null;
              page = null;
            });
            return opened;
          });
          const done = yield* Deferred.make<BrowserSession, CaptureError>();
          const pending = {
            done,
          };
          opening = pending;
          yield* Effect.forkIn(
            work().pipe(
              Effect.onExit((exit) =>
                timing.turn("profile.browser.finally.callback").pipe(
                  Effect.andThen(
                    Effect.sync(() => {
                      if (opening === pending) opening = null;
                    })
                  ),
                  Effect.andThen(timing.turn("profile.browser.finally.returnedPromise")),
                  Effect.andThen(timing.turn("profile.browser.finally.adoption")),
                  Effect.andThen(Deferred.done(done, exit))
                )
              )
            ),
            scope,
            {
              startImmediately: true,
            }
          );
          return yield* Deferred.await(done).pipe(
            Effect.onExit(() => timing.turn("profile.browser.returnOpening.adoption"))
          );
        }
        const pending = opening;
        if (pending === null && context !== null) return context;
        if (pending === null) return yield* unavailable("Saved profile is unavailable.");
        return yield* Deferred.await(pending.done).pipe(
          Effect.onExit(() => timing.turn("profile.browser.returnOpening.adoption"))
        );
      });
      const browserPage = Effect.fn("BrowserProfiles.browserPage")(function* () {
        const opened = yield* browser().pipe(Effect.onExit(() => timing.turn("profile.browserPage.browser.await")));
        if (page === null || page.isClosed()) page = opened.pages()[0] ?? (yield* opened.newPage);
        return page;
      });
      const awaitBrowserPage = Effect.fn("BrowserProfiles.awaitBrowserPage")(() =>
        browserPage().pipe(Effect.onExit(() => timing.turn("profile.browserPage.return.await")))
      );
      const collect = Effect.fn("BrowserProfiles.collect")(function* (
        profile: OnlyFans.OnlyFansProfile,
        payload: unknown
      ) {
        const ordered: OnlyFans.OnlyFansItem[] = [];
        const positions = MutableHashMap.empty<string, number>();
        for (const item of profile.items) {
          const index = Option.getOrUndefined(MutableHashMap.get(positions, item.id));
          if (index === undefined) {
            MutableHashMap.set(positions, item.id, ordered.length);
            ordered.push(item);
          } else ordered[index] = item;
        }
        const entries = yield* attempt("profile items", () => adapter.items(payload));
        for (const { item, mediaUrl } of entries) {
          const route = profile.chatRoute ?? profile.purchasedRoute;
          if ((route === "photos" || route === "videos") && item.category !== route) continue;
          const index = A.findFirstIndex(ordered, (entry) => entry.id === item.id);
          const previous = Option.isSome(index) ? ordered[index.value] : undefined;
          const next = {
            ...item,
            downloaded: previous?.downloaded ?? false,
          };
          if (Option.isSome(index)) ordered[index.value] = next;
          else ordered.push(next);
          if (mediaUrl !== null && P.isTruthy(mediaUrl))
            MutableHashMap.set(media, mediaKey(profile.username, item.id), mediaUrl);
        }
        profile.items = ordered;
        yield* save(profile);
      });
      const map = Effect.fn("BrowserProfiles.map")(function* (
        profile: OnlyFans.OnlyFansProfile,
        category: OnlyFans.OnlyFansCommand["category"],
        signal: AbortSignal
      ) {
        let current: BrowserPage | null = null;
        let finished = false;
        let lastResponse = yield* timers.now;
        let ownerId: string | null = profile.chatId ?? profile.purchasedUserId ?? null;
        const observed: string[] = [];
        let unreadable = 0;
        let closing: Fiber.Fiber<void, CaptureError> | undefined;
        const pending: Array<{
          done: Deferred.Deferred<void, CaptureError>;
        }> = [];
        let responseChain:
          | {
              done: Deferred.Deferred<void, CaptureError>;
            }
          | undefined;
        const readJson = Effect.fn("BrowserProfiles.readJson")((response: ResponseRef) =>
          response.json.pipe(
            Effect.catch(() => {
              unreadable += 1;
              return Effect.undefined;
            })
          )
        );
        const handle = Effect.fn("BrowserProfiles.handleResponse")(function* (response: ResponseRef) {
          const url = yield* attempt("response URL", () => new URL(response.url()));
          if (
            url.origin === adapter.origin &&
            Str.startsWith("/api2/v2/")(url.pathname) &&
            observed.length < 12 &&
            !A.contains(observed, url.pathname)
          )
            observed.push(url.pathname);
          if (
            P.isTruthy(profile.chatId) &&
            adapter.key === "onlyfans" &&
            url.origin === adapter.origin &&
            url.pathname === `/api2/v2/chats/${profile.chatId}` &&
            response.ok()
          ) {
            const payload = yield* readJson(response);
            if (payload === undefined) return;
            const username = record(record(payload).withUser).username;
            if (typeof username === "string") yield* linkUsername(profile, username);
            return;
          }
          if (
            !P.isTruthy(profile.chatId) &&
            (yield* attempt("owner response", () => adapter.ownerResponse(url, profile.username)))
          ) {
            if (!response.ok()) {
              profile.state = A.contains([401, 403], response.status()) ? "auth-required" : "error";
              finished = true;
              return;
            }
            const payload = yield* readJson(response);
            if (payload !== undefined)
              ownerId = yield* attempt("owner id", () => adapter.ownerId(payload, profile.username));
            return;
          }
          if (
            ownerId === null ||
            !P.isTruthy(ownerId) ||
            !(yield* attempt("feed response", () => adapter.feedResponse(url, ownerId ?? "", profile)))
          )
            return;
          if (!response.ok()) {
            profile.state = A.contains([401, 403], response.status()) ? "auth-required" : "error";
            profile.error =
              response.status() === 429
                ? `${adapter.name} asked to slow down. Stop and retry later.`
                : `${adapter.name} could not load this page. Check the dedicated browser.`;
            finished = true;
            return;
          }
          const payload = yield* readJson(response);
          if (payload === undefined) return;
          if (P.isTruthy(record(payload).error) || record(payload).success === false) {
            profile.state = "auth-required";
            finished = true;
            return;
          }
          yield* collect(profile, payload);
          profile.pages += 1;
          lastResponse = yield* timers.now;
          if (adapter.sideList?.(url) === true) return;
          finished = finished || (yield* attempt("feed complete", () => adapter.complete(payload)));
        });
        const listener = Effect.fn("BrowserProfiles.responseListener")(function* (response: ResponseRef) {
          const previous = responseChain;
          const work = Effect.fn("BrowserProfiles.responseChain")(function* () {
            if (previous !== undefined) yield* previous.done.pipe(Deferred.await, Effect.exit);
            yield* timing.turn("profile.response.then");
            yield* handle(response);
          });
          const done = yield* Deferred.make<void, CaptureError>();
          const entry = {
            done,
          };
          responseChain = entry;
          pending.push(entry);
          const guarded = work().pipe(
            Effect.catchCause((cause) =>
              Effect.sync(() => {
                const error = cause.pipe(Cause.findErrorOption, Option.getOrUndefined) ?? Cause.squash(cause);
                profile.state = "error";
                const original = S.is(HostFailure)(error) ? error.cause : error;
                const kind = original instanceof Error ? original.name : "UnknownError";
                profile.error = `Mapping stopped while processing a response (${kind}). The saved map has been retained.`;
                finished = true;
              })
            )
          );
          yield* Effect.forkIn(
            guarded.pipe(
              Effect.onExit((exit) =>
                Effect.sync(() => {
                  const index = Option.getOrUndefined(A.findFirstIndex(pending, (value) => value === entry));
                  if (index !== undefined) pending.splice(index, 1);
                }).pipe(Effect.andThen(Deferred.done(done, exit)))
              )
            ),
            scope,
            {
              startImmediately: true,
            }
          );
        });
        const abort = Effect.fn("BrowserProfiles.mapAbort")(function* () {
          if (current !== null && context !== null)
            closing = yield* Effect.forkIn(
              context.close.pipe(
                Effect.ignore,
                Effect.ensuring(
                  Effect.sync(() => {
                    context = null;
                    page = null;
                  })
                )
              ),
              scope,
              {
                startImmediately: true,
              }
            );
        });
        const abortFiber = yield* Effect.forkIn(
          Effect.callback<void>((resume) => {
            const callback = () => resume(abort());
            signal.addEventListener("abort", callback, {
              once: true,
            });
            return Effect.sync(() => signal.removeEventListener("abort", callback));
          }),
          scope,
          {
            startImmediately: true,
          }
        );
        const work = Effect.fn("BrowserProfiles.mapping")(function* () {
          current = yield* awaitBrowserPage();
          const cookies = adapter.requiresCookies && context !== null ? yield* context.cookies(adapter.origin) : [];
          if (
            adapter.requiresCookies &&
            !(
              A.some(cookies, (cookie) => cookie.name === "sess") &&
              A.some(cookies, (cookie) => cookie.name === "auth_id")
            )
          ) {
            profile.state = "auth-required";
            return;
          }
          yield* current.onResponse(listener);
          yield* current.goto(
            P.isTruthy(profile.chatId) || P.isTruthy(profile.purchasedUserId)
              ? profile.profileUrl
              : `${profile.profileUrl}/${category}`,
            {
              waitUntil: "domcontentloaded",
              timeout: 45000,
            }
          );
          yield* linkCreator(current, profile);
          const deadline = (yield* timers.now) + 2 * 60 * 60 * 1000;
          while (!finished && (yield* timers.now) < deadline && (yield* timers.now) - lastResponse < 8 * 60000) {
            yield* attempt("mapping abort", () => signal.throwIfAborted());
            const normalized = yield* attempt("mapping identity", () => adapter.normalize(current?.url() ?? ""));
            if (
              normalized?.username !== profile.username ||
              (P.isTruthy(profile.chatId) && normalized?.profileUrl !== profile.profileUrl)
            )
              return yield* unavailable("The browser left the mapped profile.");
            const responseAtScroll = lastResponse;
            const scroll = yield* attempt("scroll mode", () => adapter.scrollMode(profile));
            const moved = yield* current.profileScroll(scroll);
            const pauseMs = moved ? 1500 : 4000;
            for (let waited = 0; waited < pauseMs && !finished; waited += 250) {
              yield* profileHost.delay(Math.min(250, pauseMs - waited), signal);
              if (lastResponse !== responseAtScroll) break;
            }
          }
          if (profile.state === "mapping") {
            profile.state = finished ? "complete" : "partial";
            if (profile.pages === 0 && !finished)
              profile.error =
                observed.length > 0
                  ? `No matching media response was captured. Observed API paths: ${A.join(observed, ", ")}`
                  : "No media API response was captured. Check that the page loaded in the dedicated browser.";
            else if (!finished && unreadable > 0)
              profile.error = `The site did not finish loading older media. ${unreadable} response bodies could not be read; mapped items were retained.`;
          }
        });
        const recoverMapping = Effect.fn("BrowserProfiles.recoverMapping")(function* () {
          if (profile.state === "mapping") {
            profile.state = signal.aborted ? "partial" : "error";
            profile.error = signal.aborted
              ? undefined
              : (yield* loginAlive())
                ? "Close the dedicated login window after signing in, then map the profile."
                : "The browser could not finish mapping. Reopen it and retry; saved items are retained.";
          }
        });
        const recover = work().pipe(Effect.catchCause(() => recoverMapping()));
        const cleanup = Effect.fn("BrowserProfiles.mapCleanup")(function* () {
          yield* Fiber.interrupt(abortFiber);
          if (current !== null) yield* current.offResponse(listener);
          yield* Effect.forEach([...pending], (entry) => entry.done.pipe(Deferred.await, Effect.exit), {
            concurrency: "unbounded",
            discard: true,
          });
          if (closing !== undefined) yield* Fiber.join(closing);
          if (signal.aborted && profile.state === "mapping") profile.state = "partial";
          yield* save(profile);
        });
        yield* finalize(recover, cleanup());
      });
      const command = Effect.fn("BrowserProfiles.command")(function* (raw: OnlyFans.OnlyFansCommand) {
        const input = yield* codec.command(raw);
        const snapshot = yield* get(input.url);
        const profile = saved(keyOf(snapshot));
        if (profile === undefined) return yield* unavailable("Saved profile is unavailable.");
        if (input.action === "get") return snapshot;
        if (input.action === "stop") {
          const running = active;
          if (running !== null && running.profileUrl === profile.profileUrl) {
            running.controller.abort();
            yield* Deferred.await(running.done);
          }
          return yield* get(input.url);
        }
        if (active !== null || downloading)
          return yield* busy(`Another ${adapter.name} operation is running. Stop it or wait for it to finish.`);
        if (input.action === "open" && adapter.key === "fansly") {
          if (context !== null) yield* context.close;
          const executable = yield* host.browser("chrome");
          if (executable === null || !P.isTruthy(executable))
            return yield* unavailable("Install Chrome or Chromium to sign in.");
          const directory = path.join(storageDir, "browser-session");
          yield* files.mkdir(directory, {
            recursive: true,
            mode: 0o700,
            sync: true,
          });
          if (!(yield* loginAlive())) {
            const ready = yield* Deferred.make<void, CaptureError>();
            const started = yield* process
              .start(
                {
                  command: executable,
                  argv: [`--user-data-dir=${directory}`, "--no-first-run", profile.profileUrl],
                  env: undefined,
                  extendEnv: true,
                  cwd: undefined,
                  detached: false,
                  windowsHide: false,
                  stdin: "ignore",
                  stdout: "ignore",
                  stderr: "ignore",
                  stdoutConsumption: "unread",
                  stderrConsumption: "unread",
                  rawErrorObservation: "once",
                  rawSpawnObservation: "once",
                  rawExitObservation: "omit",
                  rawCloseObservation: "omit",
                },
                {
                  abort: Effect.void,
                  emit: (event) =>
                    event._tag === "rawSpawn"
                      ? Deferred.succeed(ready, undefined).pipe(Effect.asVoid)
                      : event._tag === "rawError"
                        ? Deferred.fail(ready, failure("login spawn", event.error)).pipe(Effect.asVoid)
                        : Effect.void,
                }
              )
              .pipe(Effect.mapError((error) => failure("login spawn", error.cause)));
            if (started._tag === "NativeSpawnFailure") return yield* failure("login spawn", started.error);
            login = started.run;
            if (started.run.activateObservations !== undefined) yield* started.run.activateObservations;
            if (started.run.backend !== "Native") yield* Deferred.await(ready);
          }
          yield* save(profile);
          return yield* get(input.url);
        }
        if (input.action === "open") {
          const current = yield* awaitBrowserPage();
          yield* current.goto(profile.profileUrl, {
            waitUntil: "domcontentloaded",
            timeout: 45000,
          });
          yield* linkCreator(current, profile);
          yield* current.bringToFront;
          yield* save(profile);
          return yield* get(input.url);
        }
        const controller = host.makeAbortController();
        profile.state = "mapping";
        profile.category = input.category;
        profile.pages = 0;
        profile.error = undefined;
        yield* save(profile);
        const done = yield* Deferred.make<void, CaptureError>();
        const running = {
          profileUrl: profile.profileUrl,
          controller,
          done,
        };
        active = running;
        yield* Effect.forkIn(
          map(profile, input.category, controller.signal).pipe(
            Effect.onExit((exit) =>
              Effect.sync(() => {
                if (active === running) active = null;
              }).pipe(Effect.andThen(Deferred.done(done, exit)))
            )
          ),
          scope,
          {
            startImmediately: true,
          }
        );
        return yield* get(input.url);
      });
      const enqueue = Effect.fn("BrowserProfiles.enqueue")(function* (
        queue: DownloadQueueOperations,
        raw: OnlyFans.OnlyFansDownload
      ) {
        if (active !== null) return yield* busy(`Finish or stop ${adapter.name} mapping before downloading.`);
        const input = yield* codec.download(raw);
        const profile = yield* get(input.url);
        const wanted = HashSet.fromIterable(input.itemIds);
        const selected = A.filter(profile.items, (item) => HashSet.has(wanted, item.id) && item.state === "available");
        if (selected.length !== HashSet.size(wanted))
          return yield* mediaError("Select available mapped media. Locked and DRM media cannot be downloaded.");
        yield* queue
          .setMaxPerGroup(`${adapter.key}-browser`, 1)
          .pipe(Effect.mapError((error) => failure("queue group", error.cause)));
        let count = 0;
        for (const item of selected) {
          const directory = path.resolve(
            P.isTruthy(input.customDownloadPath)
              ? (input.customDownloadPath ?? "")
              : yield* profileHost.defaultDirectory
          );
          const taskId = `${adapter.key}_${profile.username}_${item.id}_${Str.slice(0, 16)(sha256(directory))}`;
          const existing = yield* queue.get(taskId);
          if (existing !== undefined && !A.contains(["failed", "cancelled"], existing.status)) continue;
          if (existing !== undefined)
            yield* queue.retryManual(taskId).pipe(Effect.mapError((error) => failure("queue retry", error.cause)));
          else {
            const url = yield* attempt("queue URL", () => adapter.queueUrl(item, profile));
            yield* queue
              .add({
                id: taskId,
                priority: 0,
                groupKey: `${adapter.key}-browser`,
                input: {
                  kind: item.category === "videos" ? "video" : "social-media",
                  url,
                  title: `@${profile.creatorUsername ?? profile.username} · ${item.category} · ${item.id}`,
                  options: {
                    onlyFansProfile: profile.profileUrl,
                    onlyFansMediaId: item.id,
                    customDownloadPath: directory,
                  },
                },
              })
              .pipe(Effect.mapError((error) => failure("queue add", error.cause)));
          }
          count += 1;
        }
        return {
          count,
        };
      });
      const openCovered = Effect.fn("BrowserProfiles.openCovered")(function* (
        current: BrowserPage,
        item: OnlyFans.OnlyFansItem,
        profile: OnlyFans.OnlyFansProfile,
        signal: AbortSignal
      ) {
        if (!(yield* attempt("cover site", () => adapter.isSite(current.url())))) return null;
        const viewport = yield* current.viewport;
        const visible: LocatorRef[] = [];
        const covers = yield* current.getByText("Click to open", {
          exact: true,
        }).all;
        for (const cover of covers) {
          if (!(yield* cover.isVisible)) continue;
          const box = yield* cover.boundingBox;
          if (box !== null) {
            if (viewport === null || viewport === undefined)
              return yield* BoundaryDecodeError.make({
                operation: "viewport",
                legacyMessage: "Invalid browser-capture data.",
              });
            const raw = record(viewport);
            const numeric = (value: unknown) =>
              typeof value === "number" ? value : value === undefined ? undefined : Number(value);
            const width = numeric(raw.width);
            const height = numeric(raw.height);
            const projected = yield* S.decodeEffect(
              S.Struct({
                width: S.optional(S.Finite),
                height: S.optional(S.Finite),
              })
            )({
              width,
              height,
            }).pipe(
              Effect.mapError((cause) =>
                BoundaryDecodeError.make({
                  operation: "viewport",
                  legacyMessage: "Invalid browser-capture data.",
                  cause,
                })
              )
            );
            if (
              projected.width !== undefined &&
              projected.height !== undefined &&
              box.x < projected.width &&
              box.x + box.width > 0 &&
              box.y < projected.height &&
              box.y + box.height > 0
            )
              visible.push(cover);
          }
        }
        const cover = visible[0];
        if (visible.length !== 1 || cover === undefined) return null;
        yield* attempt("cover abort", () => signal.throwIfAborted());
        const wait = yield* Effect.forkIn(
          current
            .waitForResponse(
              Effect.fn("BrowserProfiles.coverResponse")(function* (candidate) {
                const url = yield* attempt("cover URL", () => new URL(candidate.url()));
                if (
                  !(
                    candidate.ok() && (yield* attempt("cover match", () => adapter.refreshResponse(url, item, profile)))
                  )
                )
                  return false;
                const payload = yield* candidate.json;
                const entries = yield* attempt("cover items", () => adapter.items(payload));
                return A.some(entries, ({ item: entry, mediaUrl }) => entry.id === item.id && P.isTruthy(mediaUrl));
              }),
              {
                timeout: 15000,
              }
            )
            .pipe(Effect.orElseSucceed(() => null)),
          scope,
          {
            startImmediately: true,
          }
        );
        yield* cover.click({
          timeout: 5000,
        });
        return yield* Fiber.join(wait);
      });
      const download = Effect.fn("BrowserProfiles.download")(function* (
        profileUrl: string,
        mediaId: string,
        destination: string,
        signal: AbortSignal,
        sink: TransferSink
      ) {
        if (active !== null || downloading)
          return yield* busy(`Finish or stop ${adapter.name} mapping before downloading.`);
        const snapshot = yield* get(profileUrl);
        const profile = saved(keyOf(snapshot));
        if (profile === undefined) return yield* unavailable("Saved profile is unavailable.");
        const item = Option.getOrUndefined(
          A.findFirst(profile.items, (entry) => entry.id === mediaId && entry.state === "available")
        );
        if (item === undefined) return yield* mediaError("Map this available media before downloading.");
        downloading = true;
        const transfer = Effect.fn("BrowserProfiles.transfer")(function* () {
          yield* attempt("download abort", () => signal.throwIfAborted());
          const current = yield* awaitBrowserPage();
          let response: ResponseRef | null = null;
          let payload: unknown = null;
          for (let attemptIndex = 0; attemptIndex < 2; attemptIndex += 1) {
            const waiter = yield* Effect.forkIn(
              current
                .waitForResponse(
                  Effect.fn("BrowserProfiles.refreshResponse")(function* (candidate) {
                    const url = yield* attempt("refresh URL", () => new URL(candidate.url()));
                    const matches = yield* attempt("refresh match", () => adapter.refreshResponse(url, item, profile));
                    if (!(matches && P.isTruthy(profile.chatId) && candidate.ok())) return matches;
                    const body = yield* candidate.json;
                    const items = yield* attempt("refresh items", () => adapter.items(body));
                    return A.some(items, ({ item: entry }) => entry.id === mediaId);
                  }),
                  {
                    timeout: 8000,
                  }
                )
                .pipe(Effect.orElseSucceed(() => null)),
              scope,
              {
                startImmediately: true,
              }
            );
            const refreshUrl = yield* attempt("refresh URL", () => adapter.refreshUrl(item, profile));
            yield* current.goto(refreshUrl, {
              waitUntil: "domcontentloaded",
              timeout: 45000,
            });
            response = yield* Fiber.join(waiter);
            payload = response?.ok() === true ? yield* response.json : null;
            const found = yield* attempt("refreshed media", () =>
              A.some(
                adapter.items(payload),
                ({ item: entry, mediaUrl }) => entry.id === mediaId && P.isTruthy(mediaUrl)
              )
            );
            if (!found) {
              const opened = yield* openCovered(current, item, profile, signal);
              if (opened !== null) {
                response = opened;
                payload = yield* opened.json;
              }
            }
            if (response === null || response.ok() || response.status() === 429) break;
            if (attemptIndex === 0) yield* profileHost.delay(1500, signal);
          }
          if (response === null)
            return yield* mediaError("The post did not return media in the dedicated browser. Reopen it and retry.");
          if (!response.ok())
            return yield* mediaError(
              response.status() === 429
                ? `${adapter.name} asked to slow down. Retry later.`
                : `The post request failed (HTTP ${response.status()}). Check access in the dedicated browser.`
            );
          MutableHashMap.remove(media, mediaKey(profile.username, mediaId));
          yield* collect(profile, payload);
          const url = Option.getOrUndefined(MutableHashMap.get(media, mediaKey(profile.username, mediaId)));
          if (url === undefined || !P.isTruthy(url))
            return yield* mediaError("This media is locked or has no downloadable original.");
          yield* attempt("media abort", () => signal.throwIfAborted());
          const pathname = yield* attempt("media URL", () => new URL(url).pathname);
          const extension = Str.toLowerCase(path.extname(pathname));
          if (!/^\.(?:jpe?g|png|webp|gif|mp4|mov|m4v)$/.test(extension))
            return yield* mediaError("Unsupported original media format.");
          const folder = path.join(destination, adapter.name, profile.username, item.category);
          yield* files.mkdir(folder, {
            recursive: true,
            sync: true,
          });
          const target = path.join(folder, `${item.postId}_${item.id}${extension}`);
          const mediaResponse = yield* transport.open(url, `${adapter.origin}/`, signal);
          const consume = Effect.fn("BrowserProfiles.consumeMedia")(function* () {
            if (!(mediaResponse.ok && mediaResponse.hasBody))
              return yield* MediaTransferFailure.make({
                operation: "media request",
                legacyMessage: `${adapter.name} media download failed (HTTP ${mediaResponse.status}). Remap and retry.`,
              });
            if (!/^(?:image\/|video\/|application\/octet-stream)/i.test(mediaResponse.contentType ?? ""))
              return yield* mediaError("The server returned a page instead of a media file.");
            const copied = yield* mediaResponse.copy(`${target}.part`, signal, sink);
            if (!P.isTruthy(copied.bytes) || (P.isTruthy(copied.total) && copied.bytes !== copied.total))
              return yield* MediaTransferFailure.make({
                operation: "media length",
                legacyMessage: "The downloaded file is incomplete.",
              });
            yield* files.rename(`${target}.part`, target, {
              sync: true,
            });
            const stored = Option.getOrUndefined(A.findFirst(profile.items, (entry) => entry.id === mediaId));
            if (stored !== undefined) stored.downloaded = true;
            yield* save(profile);
            const info = yield* files.stat(target, {
              sync: true,
            });
            return {
              filePath: target,
              size: info.size,
            };
          });
          return yield* finalize(consume(), mediaResponse.release);
        });
        return yield* finalize(
          transfer(),
          Effect.sync(() => {
            downloading = false;
          })
        );
      });
      const stop = Effect.fn("BrowserProfiles.stop")(function* () {
        const running = active;
        if (running !== null) running.controller.abort();
        if (running !== null) yield* Deferred.await(running.done);
        else yield* timing.turn("profile.stop.noActive");
        if (context !== null) yield* context.close;
        else yield* timing.turn("profile.stop.noContext");
      });
      return BrowserProfiles.of({
        get,
        list: list(),
        command,
        enqueue,
        download,
        stop: stop(),
      });
    })
  );
