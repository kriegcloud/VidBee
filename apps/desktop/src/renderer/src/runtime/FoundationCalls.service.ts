import * as Effect from "effect/Effect";
import * as O from "effect/Option";
import * as S from "effect/Schema";
import { SettingsDecodeError } from "../../../shared/Settings.errors.js";
import { SettingUpdate, settingsPatchFromEntries } from "../../../shared/Settings.model.js";
import { AppSettings } from "../../../shared/types/Desktop.model.js";
import { ElectronRpcCapacityError } from "../transport/DocumentDelivery.errors.js";
import { FoundationClient } from "./FoundationClient.service.js";
import type * as AtomRegistry from "effect/reactivity/AtomRegistry";
import type { RpcClientError } from "effect/rpc/RpcClientError";
import type { MessageBoxOptions } from "../../../shared/App.model.js";
import type { SettingValue } from "../../../shared/Settings.model.js";
import type { ShareCardPayload } from "../../../shared/types/share-card.js";
import type { DeliveryError } from "../transport/DocumentDelivery.errors.js";
import type { makeFoundationAtoms } from "./Foundation.atoms.js";
import type { makeFoundationStorage } from "./FoundationStorage.service.js";

/** Builds typed foundation calls over the shared client. Completion cuts are consumed before success or application failure is exposed; field reads validate against their selected schema and ordered batches never pass through an optional-field struct.
 * **Example** (Construct document calls)
 * ```ts
 * import { makeFoundationCalls } from './FoundationCalls.service.js'
 * import { makeFoundationAtoms } from './Foundation.atoms.js'
 * import { makeFoundationStorage } from './FoundationStorage.service.js'
 * import { makeRetentionLedger } from '../transport/ElectronRpc.model.js'
 * import * as AtomRegistry from 'effect/reactivity/AtomRegistry'
 * const registry=AtomRegistry.make()
 * const calls=makeFoundationCalls({registry,atoms:makeFoundationAtoms(),storage:makeFoundationStorage({registry,account:makeRetentionLedger().forWindow('sample'),report:()=>{}})})
 * export const read=calls.settings.getAll
 * // Provide FoundationClient and execute read in the document owner.
 * registry.dispose()
 * ```
 * @category services
 * @since 0.0.0
 */
export const makeFoundationCalls = ({
  registry,
  atoms,
  storage,
}: {
  readonly registry: AtomRegistry.AtomRegistry;
  readonly atoms: ReturnType<typeof makeFoundationAtoms>;
  readonly storage: ReturnType<typeof makeFoundationStorage>;
}) => {
  const consume = Effect.fn("FoundationCalls.consume")(function* <A, E>(
    request: (owner: FoundationClient["Service"]) => Effect.Effect<
      {
        readonly exit:
          | { readonly _tag: "Success"; readonly value: A }
          | { readonly _tag: "Failure"; readonly error: E };
        readonly cuts: ReadonlyArray<import("../transport/DocumentDelivery.model.js").Cut>;
      },
      DeliveryError | RpcClientError
    >
  ) {
    const owner = yield* FoundationClient;
    const completion = yield* request(owner);
    yield* owner.transport.delivery.awaitCuts(completion.cuts);
    if (completion.exit._tag === "Failure") return yield* Effect.fail(completion.exit.error);
    return completion.exit.value;
  });
  const nextRevision = (value: number, report: (error: ElectronRpcCapacityError) => void) => {
    if (!Number.isSafeInteger(value) || value < 0 || value >= Number.MAX_SAFE_INTEGER) {
      const error = ElectronRpcCapacityError.make({
        resource: "buffered bytes",
        scope: "document",
        message: "Foundation revision exhausted",
      });
      report(error);
      throw error;
    }
    return value + 1;
  };
  const settingsToken = FoundationClient.use((owner) =>
    owner.startSettings(() =>
      storage.write(atoms.settingsInvalidation, nextRevision(registry.get(atoms.settingsInvalidation), owner.report))
    )
  );
  const kernelToken = FoundationClient.use((owner) =>
    owner.startKernel((value) => {
      const revision = nextRevision(registry.get(atoms.kernelRevision), owner.report);
      storage.write(atoms.kernel, value);
      storage.write(atoms.kernelRevision, revision);
    })
  );
  const getAll = Effect.gen(function* () {
    const settings = yield* settingsToken;
    return yield* consume((owner) => owner.client["Settings.GetAll"]({ settings }));
  });
  const getKernel = Effect.gen(function* () {
    const revision = registry.get(atoms.kernelRevision);
    const kernel = yield* kernelToken;
    const snapshot = yield* consume((owner) => owner.client["App.GetYtDlpKernelStatus"]({ kernel }));
    if (registry.get(atoms.kernelRevision) === revision) storage.write(atoms.kernel, snapshot);
    return snapshot;
  });
  const metadata = Effect.fn("FoundationCalls.metadata")(function* (
    field: "version" | "os" | "platform",
    read: Effect.Effect<
      string,
      import("../../../shared/DesktopOperation.errors.js").DesktopOperationError | DeliveryError | RpcClientError,
      FoundationClient
    >
  ) {
    const value = yield* read;
    storage.write(atoms.metadata, { ...registry.get(atoms.metadata), [field]: O.some(value) });
    return value;
  });
  return {
    settings: {
      getAll,
      get: Effect.fn("SettingsClient.get")(function* (key: import("../../../shared/Settings.model.js").SettingKey) {
        const settings = yield* settingsToken;
        const value = yield* consume((owner) => owner.client["Settings.Get"]({ key, settings }));
        return yield* S.decodeEffect(
          S.declare((input: unknown): input is SettingValue => S.is(AppSettings.fields[key])(input))
        )(value).pipe(
          Effect.mapError(() => SettingsDecodeError.make({ operation: "get", issue: "Invalid selected setting value" }))
        );
      }),
      set: Effect.fn("SettingsClient.set")(function* (key: string, value: unknown) {
        const update = yield* S.decodeUnknownEffect(S.toType(SettingUpdate))({ key, value }).pipe(
          Effect.mapError(() => SettingsDecodeError.make({ operation: "set", issue: "Invalid setting update" }))
        );
        return yield* consume((owner) => owner.client["Settings.Set"](update));
      }),
      setAll: Effect.fn("SettingsClient.setAll")(function* (entries: ReadonlyArray<readonly [string, unknown]>) {
        const settings = yield* Effect.fromResult(settingsPatchFromEntries(entries)).pipe(
          Effect.mapError(() =>
            SettingsDecodeError.make({ operation: "setAll", issue: "Invalid ordered settings batch" })
          )
        );
        return yield* consume((owner) => owner.client["Settings.SetAll"]({ settings }));
      }),
      reset: consume((owner) => owner.client["Settings.Reset"]()),
      shouldPromptWhatsNew: consume((owner) => owner.client["Settings.ShouldPromptWhatsNew"]()),
      markWhatsNewSeen: consume((owner) => owner.client["Settings.MarkWhatsNewSeen"]()),
    },
    app: {
      getVersion: metadata(
        "version",
        consume((owner) => owner.client["App.GetVersion"]())
      ),
      getPlatform: metadata(
        "platform",
        consume((owner) => owner.client["App.GetPlatform"]())
      ),
      getOsVersion: metadata(
        "os",
        consume((owner) => owner.client["App.GetOsVersion"]())
      ),
      getDownloaderStatus: consume((owner) => owner.client["App.GetDownloaderStatus"]()),
      getYtDlpKernelStatus: getKernel,
      retryYtDlpKernelPreparation: Effect.gen(function* () {
        const kernel = yield* kernelToken;
        const next = yield* consume((owner) => owner.client["App.RetryYtDlpKernelPreparation"]({ kernel }));
        storage.write(atoms.kernel, next);
        return next;
      }),
      quit: consume((owner) => owner.client["App.Quit"]()),
      showMessageBox: Effect.fn("AppClient.showMessageBox")((options: MessageBoxOptions) =>
        consume((owner) => owner.client["App.ShowMessageBox"]({ options }))
      ),
      getSiteIcon: Effect.fn("AppClient.getSiteIcon")((domain: string) =>
        consume((owner) => owner.client["App.GetSiteIcon"]({ domain }))
      ),
    },
    window: {
      minimize: consume((owner) => owner.client["Window.Minimize"]()),
      maximize: consume((owner) => owner.client["Window.Maximize"]()),
      close: consume((owner) => owner.client["Window.Close"]()),
      isMaximized: consume((owner) => owner.client["Window.IsMaximized"]()),
      captureShareCard: Effect.fn("WindowClient.captureShareCard")((payload: ShareCardPayload) =>
        consume((owner) => owner.client["Window.CaptureShareCard"]({ payload }))
      ),
      writeShareImage: Effect.fn("WindowClient.writeShareImage")((data: Uint8Array) =>
        consume((owner) => owner.client["Window.WriteShareImage"]({ data }))
      ),
    },
  };
};
