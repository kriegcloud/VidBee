// Shared by every in-process harness and subprocess runner. Adapt the current branch here at port time.
import { execFileSync } from "node:child_process";
import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
export const frozenOnly = process.env.VIDBEE_EXTENSION_FROZEN === "1";
export const revision = "0739410";
const base = new URL("../", import.meta.url);
export const hashes = JSON.parse(readFileSync(new URL("fixtures/source-sha256.json", import.meta.url), "utf8"));
export const observations = { old: 0, current: 0 };
export function source(entry, old = false) {
  observations[old ? "old" : "current"]++;
  if (!old && !(process.env.VIDBEE_EXTENSION_FROZEN === "1" && hashes[entry])) return readFileSync(new URL(entry, base), "utf8");
  const frozen = readFileSync(new URL(`fixtures/${entry.split("/").at(-1)}.txt`, import.meta.url), "utf8");
  if (createHash("sha256").update(frozen).digest("hex") !== hashes[entry])
    throw new Error(`Frozen source hash mismatch: ${entry}`);
  return frozen;
}
export function gitSource(entry) {
  try {
    return execFileSync("git", ["show", `${revision}:apps/extension/${entry}`], {
      cwd: base,
      encoding: "utf8",
      stdio: ["ignore", "pipe", "ignore"],
    });
  } catch {
    return undefined;
  }
}

import { createRequire } from "node:module";
import { fileURLToPath } from "node:url";
// All executable entry loading (including child processes) passes through this composition seam.
// A future Effect implementation adapts the current branch here and injects the same boundary fakes.
// Frozen-source compilation and its expected observations stay unchanged.
import vm from "node:vm";
import { buildSync, transformSync } from "esbuild";

const hostRequire = createRequire(import.meta.url);

import * as React from "react";
import * as JSX from "react/jsx-runtime";
import * as ReactDOM from "react-dom/client";

const compiled = {};
const bundles = {};
export function evaluate(text, filename, context, { old = false, onRoot = () => {} } = {}) {
  if (!old && process.env.VIDBEE_EXTENSION_FROZEN === "1" && filename === "App.tsx") {
    observations.current++;
    return evaluate(source("entrypoints/popup/App.tsx", true), filename, context, { old: true, onRoot });
  }
  if (process.env.VIDBEE_EXTENSION_FROZEN === "1" && filename === "controls.tsx") old = true;
  // The closure oracle passes its source text through a fresh Harness. Keep
  // frozen declarations executable even when that harness has the default side.
  if (filename === "controls.tsx" && text.includes("const wait =")) old = true;
  if (!old && filename === "controls.tsx") {
    const controls = loadEntry("test/controls.entry.ts", { old, context, onRoot });
    return controls.createControls({ currentUrl: context.currentUrl, assign: uri => { context.window.location.href = uri }, retry: context.setRetryTrigger });
  }
  if (!old && filename === "App.tsx") return loadEntry("entrypoints/popup/App.tsx", { old, context, onRoot });
  const module = { exports: {} };
  const key = `${filename}:${text}`;
  const code = (compiled[key] ??= transformSync(text, {
    loader: filename.endsWith("tsx") ? "tsx" : "ts",
    format: "cjs",
    jsx: "automatic",
    target: "es2022",
  }).code);
  const require = (name) => {
    if (name.endsWith(".css")) return {};
    if (name === "@effect/platform-browser/BrowserRuntime") {
      const browserWindow = context.document.defaultView;
      return evaluate(
        readFileSync(hostRequire.resolve(name), "utf8"),
        "BrowserRuntime.ts",
        {
          ...context,
          addEventListener: browserWindow.addEventListener.bind(browserWindow),
          removeEventListener: browserWindow.removeEventListener.bind(browserWindow),
        },
        { old, onRoot }
      );
    }
    if (name.startsWith("effect/") || name.startsWith("@effect/")) return hostRequire(name);
    if (name === "../../src/Extension.pure.js")
      return evaluate(readFileSync(new URL("src/Extension.pure.ts", base), "utf8"), "pure.ts", context, {
        old,
        onRoot,
      });
    if (name === "react") return React;
    if (name === "react/jsx-runtime") return JSX;
    if (name === "react-dom/client")
      return {
        ...ReactDOM,
        createRoot: (node) => {
          const root = ReactDOM.createRoot(node);
          // Closing a current test popup also closes its document owner. StrictMode
          // setup/release still runs through the real React lifecycle unchanged.
          onRoot(old ? root : {
            render: root.render.bind(root),
            unmount: () => {
              const window = context.document.defaultView;
              const event = new window.Event("pagehide");
              Object.defineProperty(event, "persisted", { value: false });
              window.dispatchEvent(event);
              root.unmount();
            },
          });
          return root;
        },
      };
    if (name === "./App.tsx") return loadEntry("entrypoints/popup/App.tsx", { old, context, onRoot });
    throw new Error(`Unsupported entry dependency (network denied): ${name}`);
  };
  vm.runInNewContext(`"use strict";\n${code}`, { module, exports: module.exports, require, ...context }, { filename });
  return module.exports;
}
export function loadEntry(entry, { old = false, context, onRoot } = {}) {
  if (!old && process.env.VIDBEE_EXTENSION_FROZEN === "1") {
    observations.current++;
    return loadEntry(entry, { old: true, context, onRoot });
  }
  if (!old) {
    observations.current++;
    const filename = fileURLToPath(new URL(entry, base));
    let input = readFileSync(filename, "utf8");
    if (entry === "entrypoints/background.ts")
      input = input.replace("startBackground({ browser })", "captureBackground(startBackground({ browser, fetchImplementation: fetch, clock: testClock }))");
    input = input.replace("Layer.mergeAll(app,", "Layer.mergeAll(testClockLayer, app,").replaceAll("Logger.consoleStructured", "testLogger");
    const code = (bundles[entry] ??= buildSync({
      stdin: {
        contents: input,
        resolveDir: fileURLToPath(new URL(".", new URL(entry, base))),
        sourcefile: filename,
        loader: entry.endsWith("tsx") ? "tsx" : "ts",
      },
      bundle: true,
      write: false,
      format: "cjs",
      platform: "browser",
      target: "es2022",
      jsx: "automatic",
      external: ["effect/*", "@effect/*", "react", "react-dom/client", "react/jsx-runtime"],
      loader: { ".css": "empty" },
    }).outputFiles[0].text);
    // Adapt native Request/Response representation to the recording fake, preserving boundary bytes.
    const fetch = (url, init) => {
      const options = Object.fromEntries(Object.entries(init).filter(([, value]) => value !== undefined));
      options.headers = Object.fromEntries(Object.entries(init.headers).map(([key, value]) => [key.toLowerCase() === "x-vidbee-extension" ? "X-VidBee-Extension" : key, value]));
      return context.fetch(String(url), options).then((response) => ({
        ...response,
        headers: new Headers(),
        arrayBuffer: () =>
          response
            .json()
            .then((value) => new TextEncoder().encode(value === undefined ? "" : JSON.stringify(value)).buffer),
      }));
    };
    const Clock = hostRequire("effect/Clock");
    const Effect = hostRequire("effect/Effect");
    const Layer = hostRequire("effect/Layer");
    const clock = Object.assign(Object.create(Clock.Clock.defaultValue()), {
      currentTimeMillisUnsafe: () => context.Date.now(),
      currentTimeMillis: Effect.sync(() => context.Date.now()),
    });
    const testClockLayer = Layer.succeed(Clock.Clock, clock);
    const testLogger = hostRequire("effect/Logger").make(options => { observations.logged = (observations.logged ?? 0) + 1; (observations.logMessages ??= []).push({ message: options.message, cause: options.cause }); });
    return evaluate(
      code.replace(/\bLogger\d*\.consoleStructured/g, "testLogger"),
      entry.endsWith("tsx") ? "bundle.tsx" : "bundle.ts",
      { ...context, fetch, testClockLayer, testClock: clock, testLogger, captureBackground: owner => { context.captureBackground?.(owner); return owner } },
      { old, onRoot }
    );
  }
  return evaluate(source(entry, old), entry.split("/").at(-1), context, { old, onRoot });
}
