import * as Cause from "effect/Cause";
import * as Effect from "effect/Effect";
import { ExtensionHostFailure, ExtensionRequestFailure } from "./Extension.errors.js";
import type { ExtensionError } from "./Extension.errors.js";

export const logFailure = (cause: Cause.Cause<ExtensionError>) =>
  Effect.logError(
    Cause.map(cause, (error) => {
      switch (error._tag) {
        case "ExtensionHostFailure":
          return ExtensionHostFailure.make({
            operation: error.operation,
            cause: "Browser API failure",
            message: "Host operation failed",
          });
        case "ExtensionRequestFailure":
          return ExtensionRequestFailure.make({ message: "Request failed", status: error.status });
        case "ExtensionBoundaryFailure":
          return error;
      }
    })
  );
