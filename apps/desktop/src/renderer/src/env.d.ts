/// <reference types="vite/client" />

/** Browser view-transition state supplied by the rendering engine.
 * @category browser
 * @since 0.0.0
 */
interface Document {
  readonly activeViewTransition?: ViewTransition | null;
}

/** Optional Google Tag readiness exposed by the existing preload integration.
 * @category browser
 * @since 0.0.0
 */
interface Window {
  electronGoogleTag?: {
    ready: () => Promise<string | null>;
  };
}
