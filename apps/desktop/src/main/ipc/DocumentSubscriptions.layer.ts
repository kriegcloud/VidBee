import * as Layer from "effect/Layer";
import { DocumentSubscriptions, makeSubscriptions } from "./DocumentSubscriptions.service.js";

export const layer = Layer.succeed(DocumentSubscriptions, { make: makeSubscriptions });
