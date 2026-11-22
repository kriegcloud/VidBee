import * as Effect from "effect/Effect";
import * as Layer from "effect/Layer";
import { DocumentDelivery, makeDeliveryGate } from "./DocumentDelivery.service.js";
import { DocumentResources } from "./ElectronRpc.model.js";

export const layer = Layer.effect(DocumentDelivery)(
  Effect.acquireRelease(
    Effect.map(DocumentResources, (resources) => makeDeliveryGate({ resources })),
    (owner) => Effect.sync(owner.disconnect)
  )
);
