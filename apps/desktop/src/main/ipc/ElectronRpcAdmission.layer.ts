import * as Layer from "effect/Layer";
import { ElectronRpcAdmission, makeAdmission } from "./ElectronRpcAdmission.service.js";

export const layer = Layer.sync(ElectronRpcAdmission)(makeAdmission);
