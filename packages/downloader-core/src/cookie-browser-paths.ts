import * as A from "effect/Array";
import { dual } from "effect/Function";
import * as Str from "effect/String";

/** Normalize a target-platform path without consulting the host OS. */
const targetJoin = (windows: boolean, parts: readonly string[]): string => {
  const nonemptyParts = A.filter(parts, (part) => Str.replaceAll("\\", "/")(part).length > 0);
  let joined = A.join(nonemptyParts, windows ? "\\" : "/");
  if (joined === "") return ".";
  const first = nonemptyParts[0] ?? "";
  if (windows) {
    // join only preserves a UNC root when the first nonempty part starts with
    // exactly two separators followed by a non-separator.
    if (!/^[\\\\/]{2}[^\\\\/]/.test(first)) joined = Str.replace(/^[\\\\/]{2,}/, "\\")(joined);
    // Pinned Node 22 leaves reserved device segments unnormalized. Check before
    // converting forward slashes, as its join implementation does.
    if (A.some(Str.split(joined, "\\"), (part) => /^(?:CON|PRN|AUX|NUL|COM[1-9¹²³]|LPT[1-9¹²³]):/i.test(part)))
      return Str.replaceAll("/", "\\")(joined);
  }
  const source = windows ? Str.replaceAll("\\", "/")(joined) : joined;
  let prefix = "";
  let rest = source;
  let absolute = Str.startsWith("/")(source);
  if (windows) {
    const drive = /^[A-Za-z]:/.exec(rest)?.[0];
    const unc = /^\/\/([^/]+)\/+([^/]+)(?:\/+|$)/.exec(rest);
    if (
      unc !== null &&
      Str.startsWith("//")(Str.replaceAll("\\", "/")(first)) &&
      !Str.startsWith("///")(Str.replaceAll("\\", "/")(first))
    ) {
      const deviceRoot = unc[1] === "." || unc[1] === "?";
      prefix = deviceRoot ? `//${unc[1]}/` : `//${unc[1]}/${unc[2]}/`;
      rest = Str.slice(deviceRoot ? 4 : unc[0].length)(rest);
      absolute = true;
    } else if (drive !== undefined && drive !== null && drive !== "") {
      prefix = drive;
      rest = Str.slice(drive.length)(rest);
      absolute = Str.startsWith("/")(rest);
      if (absolute) prefix += "/";
    } else if (absolute) prefix = "/";
  } else if (absolute) prefix = "/";
  const stack: string[] = [];
  for (const part of Str.split(rest, "/")) {
    if (!(part !== undefined && part !== null && part !== "") || part === ".") continue;
    if (part === "..") {
      if (stack.length > 0 && stack[stack.length - 1] !== "..") stack.pop();
      else if (!absolute) stack.push(part);
    } else stack.push(part);
  }
  let normalized = prefix + A.join(stack, "/");
  if (!(normalized !== undefined && normalized !== null && normalized !== "")) normalized = absolute ? "/" : ".";
  if (Str.endsWith("/")(source) && !Str.endsWith("/")(normalized)) normalized += "/";
  // Node 22 prevents a relative colon segment from becoming a device path.
  if (windows && !absolute && prefix === "" && (/^[A-Za-z]:/.test(normalized) || /:(?:\/|$)/.test(source)))
    normalized = `./${normalized}`;
  return windows ? Str.replaceAll("/", "\\")(normalized) : normalized;
};
const pathForPlatform = (platform: string) => ({
  join: (...parts: readonly string[]) => targetJoin(platform === "win32", parts),
});

/**
 * Default profile root directories for a browser on this OS.
 *
 * @param platform Node `os.platform()` value.
 * @param homeDir User home directory.
 * @param browser Browser id.
 */
const getBrowserProfileBaseDirsDataFirst = (platform: string, homeDir: string, browser: string): string[] => {
  const join = pathForPlatform(platform).join;
  if (platform === "win32") {
    if (browser === "edge") {
      return [join(homeDir, "AppData", "Local", "Microsoft", "Edge", "User Data")];
    }
    if (browser === "chrome") {
      return [join(homeDir, "AppData", "Local", "Google", "Chrome", "User Data")];
    }
    if (browser === "chromium") {
      return [join(homeDir, "AppData", "Local", "Chromium", "User Data")];
    }
    if (browser === "brave") {
      return [join(homeDir, "AppData", "Local", "BraveSoftware", "Brave-Browser", "User Data")];
    }
    if (browser === "vivaldi") {
      return [join(homeDir, "AppData", "Local", "Vivaldi", "User Data")];
    }
    if (browser === "whale") {
      return [join(homeDir, "AppData", "Local", "Naver", "Whale", "User Data")];
    }
    if (browser === "opera") {
      return [join(homeDir, "AppData", "Roaming", "Opera Software", "Opera Stable")];
    }
    if (browser === "firefox") {
      return [join(homeDir, "AppData", "Roaming", "Mozilla", "Firefox", "Profiles")];
    }
  }

  if (platform === "darwin") {
    if (browser === "edge") {
      return [join(homeDir, "Library", "Application Support", "Microsoft Edge")];
    }
    if (browser === "chrome") {
      return [join(homeDir, "Library", "Application Support", "Google", "Chrome")];
    }
    if (browser === "chromium") {
      return [join(homeDir, "Library", "Application Support", "Chromium")];
    }
    if (browser === "brave") {
      return [join(homeDir, "Library", "Application Support", "BraveSoftware", "Brave-Browser")];
    }
    if (browser === "vivaldi") {
      return [join(homeDir, "Library", "Application Support", "Vivaldi")];
    }
    if (browser === "whale") {
      return [
        join(homeDir, "Library", "Application Support", "Whale"),
        join(homeDir, "Library", "Application Support", "Naver Whale"),
      ];
    }
    if (browser === "opera") {
      return [
        join(homeDir, "Library", "Application Support", "com.operasoftware.Opera"),
        join(homeDir, "Library", "Application Support", "Opera Software", "Opera Stable"),
      ];
    }
    if (browser === "firefox") {
      return [join(homeDir, "Library", "Application Support", "Firefox", "Profiles")];
    }
    if (browser === "safari") {
      return [join(homeDir, "Library", "Safari")];
    }
  }

  if (platform === "linux") {
    if (browser === "edge") {
      return [join(homeDir, ".config", "microsoft-edge")];
    }
    if (browser === "chrome") {
      return [join(homeDir, ".config", "google-chrome")];
    }
    if (browser === "chromium") {
      return [join(homeDir, ".config", "chromium")];
    }
    if (browser === "brave") {
      return [join(homeDir, ".config", "BraveSoftware", "Brave-Browser")];
    }
    if (browser === "vivaldi") {
      return [join(homeDir, ".config", "vivaldi")];
    }
    if (browser === "whale") {
      return [join(homeDir, ".config", "naver-whale")];
    }
    if (browser === "opera") {
      return [join(homeDir, ".config", "opera")];
    }
    if (browser === "firefox") {
      return [join(homeDir, ".mozilla", "firefox")];
    }
  }

  if (platform === "freebsd" && browser === "firefox") {
    return [join(homeDir, ".mozilla", "firefox")];
  }

  return [];
};

export const getBrowserProfileBaseDirs: {
  (homeDir: string, browser: string): (platform: string) => string[];
  (platform: string, homeDir: string, browser: string): string[];
} = dual(3, getBrowserProfileBaseDirsDataFirst);

/**
 * Candidate profile folders to probe for a browser.
 *
 * @param platform Node `os.platform()` value.
 * @param homeDir User home directory.
 * @param browser Browser id.
 */
const getBrowserProfileCandidatesDataFirst = (platform: string, homeDir: string, browser: string): string[] => {
  const join = pathForPlatform(platform).join;
  const baseDirs = getBrowserProfileBaseDirsDataFirst(platform, homeDir, browser);
  if (browser === "firefox" || browser === "safari") {
    return baseDirs;
  }

  const candidates: string[] = [];
  for (const baseDir of baseDirs) {
    if (browser === "opera") {
      candidates.push(baseDir, join(baseDir, "Default"), join(baseDir, "Profile 1"));
      continue;
    }
    candidates.push(join(baseDir, "Default"), join(baseDir, "Profile 1"));
  }
  return candidates;
};

export const getBrowserProfileCandidates: {
  (homeDir: string, browser: string): (platform: string) => string[];
  (platform: string, homeDir: string, browser: string): string[];
} = dual(3, getBrowserProfileCandidatesDataFirst);

/**
 * Cookie database filename expected inside a browser profile.
 *
 * @param browser Browser id.
 */
export const getBrowserCookieDatabaseName = (browser: string): string => {
  if (browser === "firefox") {
    return "cookies.sqlite";
  }
  if (browser === "safari") {
    return "Cookies.binarycookies";
  }
  return "Cookies";
};

/**
 * Relative path segments for cookie databases inside a browser profile.
 * Chromium 96+ may keep cookies at `Network/Cookies` instead of `Cookies`.
 *
 * @param browser Browser id.
 */
export const getBrowserCookieDatabaseRelativeSegments = (browser: string): string[][] => {
  if (browser === "firefox") {
    return [["cookies.sqlite"]];
  }
  if (browser === "safari") {
    return [["Cookies.binarycookies"]];
  }
  return [["Cookies"], ["Network", "Cookies"]];
};

/** Plain implementations for internal data-first calls. */
export const DataFirst = {
  getBrowserProfileBaseDirs: getBrowserProfileBaseDirsDataFirst,
  getBrowserProfileCandidates: getBrowserProfileCandidatesDataFirst,
};
