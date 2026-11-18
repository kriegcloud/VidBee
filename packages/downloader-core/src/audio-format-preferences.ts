import * as A from "effect/Array";
import { dual } from "effect/Function";
import * as Option from "effect/Option";
import * as Str from "effect/String";
export interface AudioFormatLike {
  format_id?: string;
  formatId?: string;
  language?: string;
}

const formatIdOf = (format: AudioFormatLike | undefined): string | undefined => format?.formatId ?? format?.format_id;
/**
 * Pick the best matching audio format id for a saved language preference.
 *
 * @param formats Available audio formats.
 * @param preferredLanguage Last language the user picked, if any.
 * @returns A format id, or undefined when the list is empty.
 */
export const pickPreferredAudioFormatId: {
  (preferredLanguage?: string): (formats: AudioFormatLike[]) => string | undefined;
  (formats: AudioFormatLike[], preferredLanguage?: string): string | undefined;
} = dual(
  (args) => A.isArray(args[0]),
  (formats: AudioFormatLike[], preferredLanguage?: string): string | undefined => {
    if (formats.length === 0) {
      return undefined;
    }

    const firstId = formatIdOf(formats[0]);
    const normalizedPreferredLanguage = Str.toLowerCase(Str.trim(preferredLanguage ?? ""));
    if (
      !(
        normalizedPreferredLanguage !== undefined &&
        normalizedPreferredLanguage !== null &&
        normalizedPreferredLanguage !== ""
      )
    ) {
      return firstId;
    }

    const exactMatch = Option.getOrUndefined(
      A.findFirst(formats, (format) => Str.toLowerCase(Str.trim(format.language ?? "")) === normalizedPreferredLanguage)
    );
    if (exactMatch !== undefined) {
      return formatIdOf(exactMatch);
    }

    const baseLanguageMatch = Option.getOrUndefined(
      A.findFirst(formats, (format) => {
        const normalizedLanguage = Str.toLowerCase(Str.trim(format.language ?? ""));
        if (!(normalizedLanguage !== undefined && normalizedLanguage !== null && normalizedLanguage !== "")) {
          return false;
        }
        return (
          Str.startsWith(`${normalizedPreferredLanguage}-`)(normalizedLanguage) ||
          Str.startsWith(`${normalizedLanguage}-`)(normalizedPreferredLanguage)
        );
      })
    );

    return formatIdOf(baseLanguageMatch ?? formats[0]);
  }
);
