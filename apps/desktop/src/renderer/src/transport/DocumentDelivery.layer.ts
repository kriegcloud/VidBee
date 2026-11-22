import * as Layer from "effect/Layer";
import { DocumentDelivery, makeDeliveryGate } from "./DocumentDelivery.service.js";

export const layer = Layer.sync(DocumentDelivery)(makeDeliveryGate);
