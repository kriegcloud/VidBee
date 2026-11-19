import * as Context from "effect/Context";
import type * as Effect from "effect/Effect";
import type { BoundaryDecodeError, HostFailure } from "./Downloader.errors.js";
import type { MappedProfilePlatform } from "./mapped-profile-source.js";
import type { SocialMappedItem } from "./ProfilePersistence.model.js";
import type { DownloadRuntimeSettings } from "./types.js";

export interface SocialTraversalRequest {
  readonly category: string;
  readonly knownIds: readonly string[] | undefined;
  readonly owner: string;
  readonly platform: MappedProfilePlatform;
  readonly settings: DownloadRuntimeSettings | undefined;
  readonly signal: AbortSignal;
  readonly url: string;
}
export interface SocialTraversalResult {
  readonly authRequired?: boolean | undefined;
  readonly complete: boolean;
  readonly error?: string | undefined;
}
/** All traversals stream stable post references rather than signed asset URLs. */
export class SocialTraversal extends Context.Service<
  SocialTraversal,
  {
    readonly map: (
      request: SocialTraversalRequest,
      onItem: (item: SocialMappedItem) => Effect.Effect<void, HostFailure | BoundaryDecodeError>
    ) => Effect.Effect<SocialTraversalResult, HostFailure | BoundaryDecodeError>;
  }
>()("@vidbee/downloader-core/SocialTraversal.service/SocialTraversal") {}
