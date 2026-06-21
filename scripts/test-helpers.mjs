/**
 * Fælles test-hjælpere til run-all-tests og stress-tests.
 */
import fs from "fs";
import path from "path";
import vm from "vm";
import { fileURLToPath } from "url";
import { webcrypto } from "crypto";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
export const APP_DIR = path.resolve(__dirname, "..");
export const ROOT_DIR = path.resolve(APP_DIR, "..");

export function read(rel) {
  return fs.readFileSync(path.join(APP_DIR, rel), "utf8");
}

export function exists(rel) {
  return fs.existsSync(path.join(APP_DIR, rel));
}

export function createMockStorage() {
  const store = new Map();
  return {
    getItem(k) {
      return store.has(k) ? store.get(k) : null;
    },
    setItem(k, v) {
      store.set(k, String(v));
    },
    removeItem(k) {
      store.delete(k);
    },
    clear() {
      store.clear();
    },
    _dump: () => Object.fromEntries(store)
  };
}

export function loadUtilsAndStorage(overrides = {}) {
  const localStorage = createMockStorage();
  const window = {
    MOR_CONFIG: {
      storageKey: "mor_kalender_stress_appointments",
      settingsKeys: { largeText: "mor_stress_large", theme: "mor_stress_theme" },
      themes: { default: "dark", available: ["dark", "light", "contrast"] },
      themeColors: {
        dark: { theme: "#0b0d12" },
        light: { theme: "#c23c7d" },
        contrast: { theme: "#ffff00" }
      },
      supabaseUrl: "",
      supabaseAnonKey: "",
      householdId: "",
      syncMetaKey: "mor_stress_sync_meta",
      syncMode: "pc",
      pcServerUrl: "",
      pcServerPin: "",
      adminPin: "TEST_PIN_PATTERN",
      ...overrides
    },
    localStorage,
    crypto: webcrypto,
    alert: () => {},
    console: console,
    navigator: { onLine: true }
  };
  const alert = () => {};
  window.localStorage = localStorage;
  const ctx = {
    window,
    localStorage,
    console,
    crypto: webcrypto,
    alert,
    Date,
    JSON,
    Math,
    Number,
    String,
    Array,
    Object,
    Map,
    Set,
    Promise,
    Error,
    parseInt,
    parseFloat,
    isNaN,
    encodeURIComponent,
    navigator: window.navigator
  };
  ctx.window = window;
  vm.runInNewContext(read("js/utils.js"), ctx);
  vm.runInNewContext(read("js/storage.js"), ctx);
  vm.runInNewContext(read("js/sync.js"), ctx);
  return { ...ctx, localStorage, window };
}

/** Simuler admin PIN-tjek uden at logge hemmeligheder. */
export function checkPinPattern(entered, expected) {
  const e = String(entered || "").trim();
  const x = String(expected || "").trim();
  if (!x) return { ok: false, reason: "not_configured" };
  if (e !== x) return { ok: false, reason: "wrong_pin" };
  return { ok: true, reason: "ok" };
}

export function randomInt(min, max) {
  return Math.floor(Math.random() * (max - min + 1)) + min;
}

export function randomValidDate(yearMin = 2024, yearMax = 2028) {
  const y = randomInt(yearMin, yearMax);
  const m = randomInt(1, 12);
  const daysInMonth = new Date(y, m, 0).getDate();
  const d = randomInt(1, daysInMonth);
  return `${y}-${String(m).padStart(2, "0")}-${String(d).padStart(2, "0")}`;
}

export function randomValidTime() {
  const h = randomInt(0, 23);
  const min = randomInt(0, 59);
  return `${String(h).padStart(2, "0")}:${String(min).padStart(2, "0")}`;
}
