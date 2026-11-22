import { useAtomValue } from "@effect/atom-react";
import { RegistryContext } from "@effect/atom-react/RegistryContext";
import * as O from "effect/Option";
import * as React from "react";
import type { makeDesktopDocument } from "./DesktopAtomRuntime.entry.js";

/** Borrows the document registry without disposing it during React StrictMode detach/reattach. Document departure owns permanent disposal; a failed connection is presented through a composition-supplied accessible notice.
 * **Example** (Provide a borrowed document owner)
 * ```ts
 * import { DesktopAtomProvider } from './DesktopAtomProvider.js'
 * import * as React from 'react'
 * import type { makeDesktopDocument } from './DesktopAtomRuntime.entry.js'
 * export const provide=(document:ReturnType<typeof makeDesktopDocument>)=>React.createElement(DesktopAtomProvider,{document,failureMessage:()=> 'Reload to reconnect.'})
 * // Pass the same owner to normal and capture composition roots within their respective documents.
 * ```
 * @category components
 * @since 0.0.0
 */
export const DesktopAtomProvider = ({
  document,
  children,
  failureMessage,
}: {
  readonly document: ReturnType<typeof makeDesktopDocument>;
  readonly children?: React.ReactNode;
  readonly failureMessage: () => string;
}) =>
  React.createElement(
    RegistryContext.Provider,
    { value: document.registry },
    children,
    React.createElement(ConnectionNotice, { document, message: failureMessage })
  );
const ConnectionNotice = ({
  document,
  message,
}: {
  readonly document: ReturnType<typeof makeDesktopDocument>;
  readonly message: () => string;
}) => {
  const error = useAtomValue(document.failure.atom);
  return O.isSome(error)
    ? React.createElement("p", { role: "alert", "data-foundation-failure": true }, message())
    : null;
};
