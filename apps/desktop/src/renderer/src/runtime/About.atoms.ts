import * as Cause from "effect/Cause";
import * as Context from "effect/Context";
import * as Effect from "effect/Effect";
import * as Layer from "effect/Layer";
import { AppInformation } from "../../../shared/App.model.js";
import type * as AtomRegistry from "effect/reactivity/AtomRegistry";
import type { makeFoundationAtoms } from "./Foundation.atoms.js";
import type { makeFoundationCalls } from "./FoundationCalls.service.js";
import type { makeFoundationStorage } from "./FoundationStorage.service.js";

/** Owns About's once-per-document metadata read, including cached failure. Version and OS requests start together; the stable atom changes once after the pair settles.
 * **Example** (Construct the metadata owner in a document layer)
 * ```ts
 * import { makeAboutActions } from './About.atoms.js'
 * export const create=(options:Parameters<typeof makeAboutActions>[0])=>makeAboutActions(options)
 * // Execute construction once; its load Effect joins concurrent callers and caches the result.
 * ```
 * @category atoms
 * @since 0.0.0
 */
export const makeAboutActions = Effect.fn("About.make")(function* ({
  registry,
  atoms,
  storage,
  calls,
  report,
}: {
  readonly registry: AtomRegistry.AtomRegistry;
  readonly atoms: ReturnType<typeof makeFoundationAtoms>;
  readonly storage: Pick<ReturnType<typeof makeFoundationStorage>, "write">;
  readonly calls: Pick<ReturnType<typeof makeFoundationCalls>["app"], "getVersion" | "getOsVersion">;
  readonly report: (message: string, error: unknown) => Effect.Effect<void>;
}) {
  const load = yield* Effect.cached(
    Effect.all([calls.getVersion, calls.getOsVersion], { concurrency: "unbounded" }).pipe(
      Effect.map(([appVersion, osVersion]) => AppInformation.make({ appVersion, osVersion })),
      Effect.catchCause((cause) =>
        Effect.as(
          report("Failed to load app info for feedback links:", Cause.squash(cause)),
          AppInformation.make({ appVersion: "", osVersion: "" })
        )
      ),
      Effect.tap((info) =>
        Effect.sync(() => {
          storage.write(atoms.appInfo, info);
          storage.write(atoms.appInfoLoaded, true);
        })
      ),
      Effect.map(() => registry.get(atoms.appInfo))
    )
  );
  return { load };
});
/** The shared document metadata owner; view components borrow its immutable snapshot and keep only their existing mounted-view guard.
 * **Example** (Read stable About metadata)
 * ```ts
 * import { FoundationAbout } from './About.atoms.js'
 * export const read=FoundationAbout.use(about=>about.load)
 * // The document layer supplies one owner for all About and feedback surfaces.
 * ```
 * @category services
 * @since 0.0.0
 */
export class FoundationAbout extends Context.Service<
  FoundationAbout,
  Effect.Success<ReturnType<typeof makeAboutActions>>
>()("vidbee/renderer/src/runtime/About.atoms/FoundationAbout") {}
/** Supplies an already configured metadata owner within the shared document graph.
 * **Example** (Build the document metadata layer)
 * ```ts
 * import { aboutLayer } from './About.atoms.js'
 * export const configure=(options:Parameters<typeof aboutLayer>[0])=>aboutLayer(options)
 * // Merge with the client's document layer using its shared memo map.
 * ```
 * @category layers
 * @since 0.0.0
 */
export const aboutLayer = (options: Parameters<typeof makeAboutActions>[0]) =>
  Layer.effect(FoundationAbout)(makeAboutActions(options));
