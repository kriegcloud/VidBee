import * as S from "effect/Schema";
/** Native samples may use either ordinary or shared backing memory. */
export const FloatSamples = S.declare((value): value is Float32Array => value instanceof Float32Array);
export type FloatSamples = typeof FloatSamples.Type;
