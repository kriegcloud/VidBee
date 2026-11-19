import { Window } from "happy-dom";
import { act } from "react";
import { vi } from "vitest";
import { evaluate, loadEntry, source } from "./entry-loader.mjs";

export { source } from "./entry-loader.mjs";

import { denyNetwork, requestOptions } from "./network.mjs";
export const url = "https://example.invalid/watch?v=a b&x=日本#part";
export const now = 1_700_000_000_000;
export const clone = (value) => structuredClone(value);
export const deferred = () => {
  let resolve;
  let reject;
  const promise = new Promise((yes, no) => {
    resolve = yes;
    reject = no;
  });
  return { promise, resolve, reject };
};
const realImmediate = globalThis.setImmediate;
const realTimeout = globalThis.setTimeout;
const harnesses = [];
async function drain() {
  for (let i = 0; i < 100; i++) await Promise.resolve();
}
// Observe work without adopting another Promise in the application path.
function tracked(harness, kind, operation) {
  return (...args) => {
    harness.inFlight[kind]++;
    let result;
    try { result = operation(...args); }
    catch (error) { harness.inFlight[kind]--; throw error; }
    Promise.resolve(result).then(() => harness.inFlight[kind]--, () => harness.inFlight[kind]--);
    return result;
  };
}
export async function settle() {
  let previous, stable = 0;
  for (let round = 0; round < 100; round++) {
    await drain();
    await new Promise(resolve => realImmediate ? realImmediate(resolve) : realTimeout(resolve, 0));
    const current = JSON.stringify([...harnesses].map(h => [h.trace.length, h.inFlight.http, h.inFlight.browser]));
    stable = current === previous ? stable + 1 : 0;
    if (stable >= 2) return;
    previous = current;
  }
  throw new Error("Harness did not reach quiescence within 100 settle rounds");
}
export async function flush() {
  if (process.env.VIDBEE_EXTENSION_SETTLE === "1") return settle();
  return drain();
}
export class Harness {
  trace = [];
  listeners = [];
  messages = [];
  navigation = [];
  root = undefined;
  constructor({ old = false, map, tab = url, info = { title: "Fixture", duration: 60, formats: [] } } = {}) {
    this.old = old;
    this.inFlight = { http: 0, browser: 0 };
    harnesses.push(this);
    this.map = clone(map);
    this.tab = tab;
    this.info = info;
    this.window = new Window({
      url: "https://extension.invalid/popup.html",
      settings: {
        disableCSSFileLoading: true,
        disableJavaScriptFileLoading: true,
        disableComputedStyleRendering: true,
      },
    });
    denyNetwork(this.window);
    this.window.document.body.innerHTML = '<div id="root"></div>';
    this.browser = {
      runtime: {
        getURL: (value) => `chrome-extension://fixture-id/${value}`,
        onMessage: {
          addListener: (fn) => {
            this.messageListener = fn;
            this.trace.push(["message:add"]);
          },
        },
        sendMessage: (message) => {
          this.trace.push(["send", clone(message)]);
          return this.send?.(message) ?? Promise.resolve();
        },
      },
      tabs: {
        query: (options) => {
          this.trace.push(["query", clone(options)]);
          return this.query?.() ?? Promise.resolve(this.tab === undefined ? [] : [{ url: this.tab }]);
        },
      },
      action: {
        setIcon: (options) => {
          this.trace.push(["icon", clone(options)]);
          return this.icon?.(options) ?? Promise.resolve();
        },
      },
      storage: {
        local: {
          get: (key) => {
            this.trace.push(["get", key]);
            return (this.get?.() ?? Promise.resolve(this.map === undefined ? {} : { [key]: clone(this.map) })).then(
              (value) => {
                this.trace.push(["got", clone(value)]);
                return value;
              }
            );
          },
          set: (value) => {
            this.trace.push(["set", clone(value)]);
            if (this.set) return this.set(value);
            this.map = clone(value.videoInfoCacheByUrl);
            return Promise.resolve();
          },
        },
        onChanged: {
          addListener: (fn) => {
            this.trace.push(["storage:add"]);
            this.listeners.push(fn);
          },
          removeListener: (fn) => {
            this.trace.push(["storage:remove", this.listeners.indexOf(fn)]);
            this.listeners = this.listeners.filter((item) => item !== fn);
          },
        },
      },
    };
    this.fetch = (target, options) => {
      this.trace.push(["fetch", target, requestOptions(options)]);
      if (this.http) return this.http(target, options);
      return Promise.resolve(
        this.response(
          target.endsWith("/token") ? { token: "t +/日本" } : target.endsWith("/status") ? { ok: true } : this.info
        )
      );
    };
    for (const [object, key] of [[this.browser.runtime, "sendMessage"], [this.browser.tabs, "query"], [this.browser.action, "setIcon"], [this.browser.storage.local, "get"], [this.browser.storage.local, "set"]]) {
      object[key] = tracked(this, "browser", object[key]);
    }
    const fetch = this.fetch;
    this.fetch = tracked(this, "http", (target, options) => {
      const response = fetch(target, options);
      // Count body consumption separately, returning the original acquisition Promise.
      Promise.resolve(response).then(value => {
        value.json = tracked(this, "http", value.json);
      }, () => {});
      return response;
    });
  }
  response(data, status = 200) {
    return { ok: status >= 200 && status < 300, status, json: () => Promise.resolve(clone(data)) };
  }
  evaluate(text, filename, extra = {}) {
    const fakeWindow = {
      set location(value) {
        throw new Error(`Unexpected window assignment: ${value}`);
      },
      get location() {
        return extra.location;
      },
    };
    const context = {
      browser: this.browser,
      chrome: this.browser,
      defineBackground: (fn) => fn(),
      fetch: this.fetch,
      AbortController,
      DOMException,
      Error,
      Date,
      setTimeout,
      clearTimeout,
      console,
      document: this.window.document,
      window: fakeWindow,
      ...extra,
    };
    return evaluate(text, filename, context, {
      old: this.old,
      onRoot: (root) => {
        this.root = root;
      },
    });
  }
  entry(entry, extra = {}) {
    return loadEntry(entry, {
      old: this.old,
      onRoot: (root) => {
        this.root = root;
      },
      context: {
        browser: this.browser,
        chrome: this.browser,
        defineBackground: (fn) => fn(),
        fetch: this.fetch,
        AbortController,
        DOMException,
        Error,
        Date,
        setTimeout,
        clearTimeout,
        console,
        document: this.window.document,
        window: { location: extra.location },
        ...extra,
      },
    });
  }
  background() {
    this.entry("entrypoints/background.ts");
    return this;
  }
  message(message = { type: "video-info:fetch", url: url }, sender = { tab: { id: 7 } }) {
    return this.messageListener(message, sender);
  }
  async popup() {
    vi.stubGlobal("window", this.window);
    vi.stubGlobal("document", this.window.document);
    vi.stubGlobal("navigator", this.window.navigator);
    vi.stubGlobal("IS_REACT_ACT_ENVIRONMENT", true);
    const location = {};
    Object.defineProperty(location, "href", {
      set: (value) => {
        this.navigation.push(value);
        if (this.navigationError) throw this.navigationError;
      },
    });
    await act(async () => {
      this.entry("entrypoints/popup/main.tsx", { location });
      await flush();
    });
    return this;
  }
  async change(map, area = "local") {
    await act(async () => {
      for (const fn of [...this.listeners]) fn({ videoInfoCacheByUrl: { newValue: map } }, area);
      await flush();
    });
  }
  async click(text) {
    const button = [...this.window.document.querySelectorAll("button")].find((node) => node.textContent === text);
    if (!button) throw new Error(`Missing button: ${text}`);
    await act(async () => {
      button.click();
      await flush();
    });
  }
  html() {
    return this.window.document.getElementById("root").innerHTML;
  }
  async close() {
    if (this.root) await act(async () => this.root.unmount());
    await this.window.happyDOM.abort();
    const index = harnesses.indexOf(this);
    if (index >= 0) harnesses.splice(index, 1);
  }
}
export function pure(old = false) {
  if (!old) source("entrypoints/popup/App.tsx");
  const text = old
    ? source("entrypoints/popup/App.tsx", true).split("function App()")[0]
    : `import { isValidHttpUrl, formatDuration, formatBytes, isVideoFormat, isAudioFormat, sanitizeError } from '../../src/Extension.pure.js'`;
  const names = ["isValidHttpUrl", "formatDuration", "formatBytes", "isVideoFormat", "isAudioFormat", "sanitizeError"];
  const h = new Harness({ old });
  return h.evaluate(`${text}\nexport { ${names.join(",")} }`, "pure.tsx");
}
export function outcome(fn) {
  try {
    return { value: fn() };
  } catch (error) {
    return { engine: true, name: error.name, message: error.message };
  }
}
