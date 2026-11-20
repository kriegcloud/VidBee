import * as NodeServices from "@effect/platform-node/NodeServices";
import { expect, layer } from "@effect/vitest";
import { layer as processCapabilitiesLayer } from "@vidbee/downloader-core/ProcessCapabilities.layer";
import { LegacyTiming } from "@vidbee/task-queue/LegacyTiming.service";
import { requestLayer } from "@vidbee/task-queue/ProcessControl.driver";
import * as Context from "effect/Context";
import * as Deferred from "effect/Deferred";
import * as Effect from "effect/Effect";
import * as Fiber from "effect/Fiber";
import * as FileSystem from "effect/FileSystem";
import * as Layer from "effect/Layer";
import * as Path from "effect/Path";
import * as ChildProcess from "effect/process/ChildProcess";
import * as ChildProcessSpawner from "effect/process/ChildProcessSpawner";
import { ModelFileIOLive } from "../../src/ModelFileIO.layer.js";
import { ModelFilesLive } from "../../src/ModelFiles.layer.js";
import { ModelFileIO, ModelFiles } from "../../src/ModelFiles.service.js";
import { ModelHttp } from "../../src/ModelHttp.service.js";
import { makeModelsLayer } from "../../src/Models.layer.js";
import { Models, ModelsHooks } from "../../src/Models.service.js";
import { TranscriptionFilesLive } from "../../src/TranscriptionFiles.layer.js";
import { TranscriptionHost } from "../../src/TranscriptionHost.service.js";
import { TranscriptionIds } from "../../src/TranscriptionIds.service.js";
import { layer as transcriptionProcessLayer } from "../../src/TranscriptionProcess.layer.js";
import { TranscriptionTimeLive } from "../../src/TranscriptionTime.layer.js";
import type { MachineProfile } from "../../src/Asr.model.js";
import type { ModelRequest } from "../../src/ModelHttp.model.js";
import type { ModelResponse } from "../../src/ModelHttp.service.js";
import type { HostFailure } from "../../src/Transcription.errors.js";

const controller = (): AbortController => new AbortController();
const host = Layer.succeed(TranscriptionHost, {
  snapshot: Effect.succeed({
    platform: "linux",
    arch: "x64",
    pid: 42,
    execPath: "fixture",
    cwd: "/",
    temporaryDirectory: "/tmp",
    resourceDirectories: [],
    environment: {},
    cpuModel: "fixture",
    cpuCount: 1,
    ramBytes: 1024,
    locale: "en-US",
    timeZone: "UTC",
  }),
  workerEnvironment: Effect.fn("fixture.environment")(() => Effect.succeed({})),
  machine: Effect.fn("fixture.machine")(() =>
    Effect.succeed<MachineProfile>({
      arch: "x64",
      class: "low",
      cpuCount: 1,
      gpu: "unknown",
      gpuName: null,
      os: "linux",
      ramBytes: 1024,
    })
  ),
  libraryDirectory: Effect.succeed(null),
  lowerPriority: Effect.fn("fixture.priority")(() => Effect.void),
  isProcessAlive: Effect.fn("fixture.alive")(() => Effect.succeed(false)),
});
const ids = Layer.succeed(TranscriptionIds, {
  uuid: Effect.succeed("fixture-id"),
  hex: Effect.fn("fixture.hex")(() => Effect.succeed("0123456789ab")),
});
const process = transcriptionProcessLayer.pipe(Layer.provide(processCapabilitiesLayer), Layer.provide(requestLayer));
const platform = Layer.mergeAll(
  TranscriptionFilesLive,
  host,
  ids,
  TranscriptionTimeLive,
  ModelFileIOLive.pipe(Layer.provide(process))
).pipe(Layer.provideMerge(NodeServices.layer));
const shared = ModelFilesLive.pipe(Layer.provideMerge(platform));
class ModelFixture extends Context.Service<
  ModelFixture,
  {
    readonly models: typeof Models.Service;
    readonly root: string;
    readonly entered: Effect.Effect<void>;
    readonly release: Effect.Effect<void>;
    readonly requests: Effect.Effect<number>;
    readonly bodyInterrupted: Effect.Effect<boolean>;
  }
>()("@vidbee/transcription/test/native/model-services.effect.test/ModelFixture") {}
const makeFixture = (gated: boolean) =>
  Layer.effect(
    ModelFixture,
    Effect.gen(function* () {
      const fs = yield* FileSystem.FileSystem;
      const root = yield* fs.makeTempDirectoryScoped({ prefix: "native-transcription-models-" });
      const entered = yield* Deferred.make<void>();
      const released = yield* Deferred.make<void>();
      let requests = 0;
      let interrupted = false;
      const transport = Layer.succeed(ModelHttp, {
        request: Effect.fn("fixture.request")((spec: ModelRequest) =>
          Effect.sync(() => {
            requests += 1;
            const response: ModelResponse = {
              ok: true,
              status: 200,
              contentLength: "3",
              hasBody: spec.method !== "HEAD",
              consume: Effect.fn("fixture.body")((sink: (chunk: Uint8Array) => Effect.Effect<void, HostFailure>) => {
                const body = Deferred.succeed(entered, undefined).pipe(
                  Effect.andThen(gated ? Deferred.await(released) : Effect.void),
                  Effect.andThen(sink(new Uint8Array([97, 98, 99])))
                );
                return body.pipe(
                  Effect.onInterrupt(() =>
                    Effect.sync(() => {
                      interrupted = true;
                    })
                  )
                );
              }),
            };
            return response;
          })
        ),
      });
      const hooks = Layer.succeed(ModelsHooks, {
        makeAbortController: controller,
        preferChina: Effect.succeed(false),
        resolveUrls: Effect.fn("fixture.urls")((spec) => Effect.succeed([spec.url])),
      });
      const scope = yield* Effect.scope;
      const context = yield* Layer.buildWithScope(
        makeModelsLayer({
          modelsDir: root,
          catalog: [
            {
              id: "fixture",
              fileName: "tiny/model.onnx",
              url: "https://fixture.invalid/model",
              required: true,
              role: "asr-model",
              group: "asr",
              tier: "minimal",
              sha256: "ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad",
            },
          ],
        }).pipe(Layer.provide(Layer.mergeAll(transport, hooks, LegacyTiming.layer))),
        scope
      );
      return {
        root,
        models: Context.get(context, Models),
        entered: Deferred.await(entered),
        release: Deferred.succeed(released, undefined).pipe(Effect.asVoid),
        requests: Effect.sync(() => requests),
        bodyInterrupted: Effect.sync(() => interrupted),
      };
    })
  ).pipe(Layer.provideMerge(shared));

layer(makeFixture(false))("native model services", (it) => {
  it.effect(
    "streams, hashes and publishes a raw model; ready reuse skips network and deletion preserves status rules",
    () =>
      Effect.gen(function* () {
        const fixture = yield* ModelFixture;
        const fs = yield* FileSystem.FileSystem;
        const path = yield* Path.Path;
        const initial = yield* fixture.models.status(["asr"], ["minimal"]);
        expect(initial.ready).toBe(false);
        const ready = yield* fixture.models.ensureReady({ tiers: ["minimal"] });
        expect(ready.ready).toBe(true);
        const location = yield* fixture.models.pathById("fixture");
        expect(location).toBe(path.join(fixture.root, "tiny/model.onnx"));
        const contents = yield* fs.readFileString(path.join(fixture.root, "tiny/model.onnx"));
        expect(contents).toBe("abc");
        yield* fixture.models.ensureReady({ tiers: ["minimal"] });
        const requests = yield* fixture.requests;
        expect(requests).toBe(1);
        const names = yield* fs.readDirectory(path.join(fixture.root, "tiny"));
        expect(names).toEqual(["model.onnx"]);
        const removed = yield* fixture.models.removeTier("minimal");
        expect(removed.ready).toBe(false);
      }),
    { timeout: 30000 }
  );
  it.effect(
    "native archive extraction uses the additive process service and produces the requested tree",
    () =>
      Effect.gen(function* () {
        const fixture = yield* ModelFixture;
        const fs = yield* FileSystem.FileSystem;
        const path = yield* Path.Path;
        const io = yield* ModelFileIO;
        const spawner = yield* ChildProcessSpawner.ChildProcessSpawner;
        const source = path.join(fixture.root, "archive-source");
        const destination = path.join(fixture.root, "archive-output");
        const archive = path.join(fixture.root, "fixture.tar.bz2");
        yield* fs.makeDirectory(path.join(source, "tiny"), { recursive: true });
        yield* fs.makeDirectory(destination, { recursive: true });
        yield* fs.writeFileString(path.join(source, "tiny/member"), "archive fixture");
        yield* spawner.exitCode(ChildProcess.make("tar", ["-cjf", archive, "-C", source, "tiny"]));
        yield* io.extract(archive, destination, undefined);
        const contents = yield* fs.readFileString(path.join(destination, "tiny/member"));
        expect(contents).toBe("archive fixture");
      }),
    { timeout: 30000 }
  );
  it.effect(
    "directory cache retains the historical json-flag and repair-hint omissions",
    () =>
      Effect.gen(function* () {
        const fixture = yield* ModelFixture;
        const fs = yield* FileSystem.FileSystem;
        const path = yield* Path.Path;
        const io = yield* ModelFileIO;
        const modelFiles = yield* ModelFiles;
        const directory = path.join(fixture.root, "tokenizer");
        yield* fs.makeDirectory(directory, { recursive: true });
        yield* fs.writeFileString(path.join(directory, "member.json"), "null");
        const digest = yield* io.digest(new TextEncoder().encode("null"));
        const member = { name: "member.json", minBytes: 2, sha256: digest };
        const lax = yield* modelFiles.assessDirectory(directory, [member], false);
        expect(lax.present).toBe(true);
        const strict = yield* modelFiles.assessDirectory(directory, [{ ...member, json: true }], true);
        expect(strict).toBe(lax);
        const bad = { ...member, sha256: "0" };
        const withoutHint = yield* modelFiles.assessDirectory(directory, [bad], false);
        const withHint = yield* modelFiles.assessDirectory(directory, [bad], true);
        expect(withHint).toBe(withoutHint);
        expect(withHint.issue).toBe("incomplete model: tokenizer/member.json checksum mismatch");
      }),
    { timeout: 30000 }
  );
});
layer(makeFixture(true))("native model cancellation", (it) => {
  it.effect(
    "busy deletion refuses synchronously in the service and abort interrupts body consumption before release",
    () =>
      Effect.gen(function* () {
        const fixture = yield* ModelFixture;
        const pending = yield* fixture.models
          .ensureReady({ tiers: ["minimal"] })
          .pipe(Effect.result, Effect.forkScoped);
        yield* fixture.entered;
        const busy = yield* fixture.models.removeTier("minimal").pipe(Effect.result);
        expect(busy._tag).toBe("Failure");
        yield* fixture.models.cancelDownload("minimal");
        const result = yield* Fiber.join(pending);
        expect(result._tag).toBe("Failure");
        if (result._tag === "Failure") expect(result.failure.legacyMessage).toBe("download cancelled: minimal");
        const interrupted = yield* fixture.bodyInterrupted;
        expect(interrupted).toBe(true);
        const status = yield* fixture.models.status(["asr"], ["minimal"]);
        expect(status.ready).toBe(false);
        expect(status.downloads).toEqual([]);
        yield* fixture.release;
      }),
    { timeout: 30000 }
  );
});
