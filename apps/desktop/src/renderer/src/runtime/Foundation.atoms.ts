import * as O from "effect/Option";
import * as Atom from "effect/reactivity/Atom";
import { defaultSettings } from "../../../shared/types/index.js";
import type { AppSettings } from "../../../shared/types/Desktop.model.js";
import type { YtDlpKernelStatus } from "../../../shared/types/ytdlp-kernel.js";

/** Creates document-owned foundation state with the exact provisional preferences and kernel status used before the first host snapshot. Compatibility stores project these same atoms.
 * **Example** (Read isolated provisional settings)
 * ```ts
 * import { makeFoundationAtoms } from './Foundation.atoms.js'
 * import * as AtomRegistry from 'effect/reactivity/AtomRegistry'
 * const registry=AtomRegistry.make()
 * const atoms=makeFoundationAtoms()
 * registry.get(atoms.settings).downloadPath // => ''
 * registry.dispose()
 * ```
 * @category atoms
 * @since 0.0.0
 */
export const makeFoundationAtoms = () => ({
  settings: Atom.make<AppSettings>(defaultSettings).pipe(Atom.keepAlive),
  settingsLoaded: Atom.make(false).pipe(Atom.keepAlive),
  settingsInvalidation: Atom.make(0).pipe(Atom.keepAlive),
  kernel: Atom.make<YtDlpKernelStatus>({
    error: null,
    nodeVersion: null,
    preparationStep: "copying",
    progress: 0,
    ready: false,
    source: null,
    state: "preparing",
    ytDlpVersion: null,
  }).pipe(Atom.keepAlive),
  kernelRevision: Atom.make(0).pipe(Atom.keepAlive),
  appInfo: Atom.make({ appVersion: "", osVersion: "" }).pipe(Atom.keepAlive),
  appInfoLoaded: Atom.make(false).pipe(Atom.keepAlive),
  metadata: Atom.make<{
    readonly version: O.Option<string>;
    readonly os: O.Option<string>;
    readonly platform: O.Option<string>;
  }>({ version: O.none(), os: O.none(), platform: O.none() }).pipe(Atom.keepAlive),
});
