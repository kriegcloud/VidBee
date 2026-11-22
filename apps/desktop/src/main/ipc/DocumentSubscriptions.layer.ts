import * as Effect from "effect/Effect";
import * as Layer from "effect/Layer";
import { DocumentResources } from "../../renderer/src/transport/ElectronRpc.model.js";
import { DocumentSubscriptions, makeSubscriptions } from "./DocumentSubscriptions.service.js";

export const layer = Layer.effect(DocumentSubscriptions)(
  Effect.map(DocumentResources, (resources) => ({
    make: (options: Parameters<typeof makeSubscriptions>[0]) => makeSubscriptions({ ...options, resources }),
  }))
);
