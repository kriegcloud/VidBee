import * as Context from "effect/Context";
import * as Layer from "effect/Layer";
import { Converter } from "opencc-js";
import type { ChineseScript } from "./Caption.model.js";
export class ChineseConversion extends Context.Service<
  ChineseConversion,
  {
    readonly convert: (text: string, script: ChineseScript) => string;
  }
>()("@vidbee/transcription/OpenCC.driver/ChineseConversion") {}
let toHans: ((text: string) => string) | null = null;
let toHant: ((text: string) => string) | null = null;
export const chineseConversion: typeof ChineseConversion.Service = {
  convert: (text, script) => {
    if (script === "hant") {
      const convert = toHant ?? Converter({ from: "cn", to: "tw" });
      toHant = convert;
      return convert(text);
    }
    const convert = toHans ?? Converter({ from: "t", to: "cn" });
    toHans = convert;
    return convert(text);
  },
};
export const chineseConversionLayer = Layer.succeed(ChineseConversion, chineseConversion);
