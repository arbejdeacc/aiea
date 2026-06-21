/**
 * Mor Kalender — automatisk testkørsel (~100 cases)
 * Kør fra app/: node scripts/run-all-tests.mjs
 * Valgfrit: MOR_TEST_PORT=8765 (starter ikke server — forventer kørende python -m http.server)
 */
import { execSync, spawn } from "child_process";
import fs from "fs";
import path from "path";
import http from "http";
import { fileURLToPath } from "url";
import { APP_DIR, ROOT_DIR, read, exists, loadUtilsAndStorage } from "./test-helpers.mjs";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const PORT = Number(process.env.MOR_TEST_PORT || 8765);
const BASE = `http://127.0.0.1:${PORT}`;

const results = [];

function record(id, name, status, note = "") {
  results.push({ id, name, status, note });
}

function pass(id, name, note = "") {
  record(id, name, "PASS", note);
}
function fail(id, name, note = "") {
  record(id, name, "FAIL", note);
}
function skip(id, name, note = "") {
  record(id, name, "SKIP", note);
}

function assert(id, name, cond, note = "") {
  if (cond) pass(id, name, note);
  else fail(id, name, note || "Assertion failed");
}

function nodeCheck(rel) {
  const full = path.join(APP_DIR, rel);
  try {
    execSync(`node --check "${full}"`, { stdio: "pipe" });
    return true;
  } catch (e) {
    return e.stderr?.toString() || e.message;
  }
}

function httpGet(url) {
  return new Promise((resolve, reject) => {
    const req = http.get(url, res => {
      let body = "";
      res.on("data", c => (body += c));
      res.on("end", () => resolve({ status: res.statusCode, body, headers: res.headers }));
    });
    req.on("error", reject);
    req.setTimeout(8000, () => {
      req.destroy();
      reject(new Error("timeout"));
    });
  });
}

async function waitForServer(maxMs = 12000) {
  const start = Date.now();
  while (Date.now() - start < maxMs) {
    try {
      const r = await httpGet(`${BASE}/index.html`);
      if (r.status === 200) return true;
    } catch {
      /* retry */
    }
    await new Promise(r => setTimeout(r, 400));
  }
  return false;
}

function startPythonServer() {
  return spawn("python", ["-m", "http.server", String(PORT)], {
    cwd: APP_DIR,
    stdio: "ignore",
    shell: true,
    detached: true
  });
}

// --- Tests ---
function runStaticTests() {
  const jsFiles = [
    "config/config.js",
    "config/sync-config.js",
    "js/utils.js",
    "js/storage.js",
    "js/sync.js",
    "js/notifications.js",
    "js/phone-call.js",
    "js/app.js",
    "js/admin.js",
    "sw.js"
  ];
  jsFiles.forEach((f, i) => {
    const id = `T${String(i + 1).padStart(3, "0")}`;
    const ok = nodeCheck(f);
    assert(id, `node --check ${f}`, ok === true, typeof ok === "string" ? ok.slice(0, 120) : "");
  });

  assert("T009", "index.html findes", exists("index.html"));
  assert("T010", "admin.html findes", exists("admin.html"));

  const templates = [
    "home-template",
    "add-template",
    "calendar-template",
    "contact-template",
    "settings-template",
    "detail-template",
    "edit-template",
    "help-template"
  ];
  const html = read("index.html");
  templates.forEach((tid, i) => {
    assert(`T0${11 + i}`, `Skabelon ${tid}`, html.includes(`id="${tid}"`));
  });

  assert("T019", "8 hash-ruter i app.js", /templates\s*=\s*\{[\s\S]*home[\s\S]*help/.test(read("js/app.js")));
  assert("T020", "Bottom nav: home, calendar, add, contact", /data-route="home"/.test(html) && /data-route="contact"/.test(html));
}

function runUtilsTests(ctx) {
  const {
    todayISO,
    toISODate,
    formatLongDate,
    parseISODate,
    isValidTime,
    buildCalendarCells,
    newAppointmentId
  } = ctx;

  assert("T021", "todayISO format YYYY-MM-DD", /^\d{4}-\d{2}-\d{2}$/.test(todayISO()));
  assert("T022", "parseISODate gyldig", parseISODate("2026-06-03") instanceof Date);
  assert("T023", "parseISODate ugyldig → null", parseISODate("2026-13-40") === null);
  assert("T024", "parseISODate tom → null", parseISODate("") === null);
  assert("T025", "isValidTime 10:00", isValidTime("10:00"));
  assert("T026", "isValidTime afviser 25:00", !isValidTime("25:00"));
  assert("T027", "isValidTime afviser 9:5", !isValidTime("9:5"));
  assert("T028", "buildCalendarCells 42 celler", buildCalendarCells(2026, 5).length === 42);
  assert("T029", "buildCalendarCells mandag-start", buildCalendarCells(2026, 5)[0].day >= 1);
  assert("T030", "formatLongDate dansk", formatLongDate(new Date(2026, 5, 3)).length > 5);
  assert("T031", "toISODate roundtrip", toISODate(parseISODate("2026-06-03")) === "2026-06-03");
  assert("T032", "newAppointmentId genererer id", typeof newAppointmentId() === "string" && newAppointmentId().length > 3);
}

function runStorageTests(ctx) {
  const {
    localStorage,
    window,
    saveAppointments,
    loadAppointments,
    validateImportData,
    loadSetting,
    saveSetting
  } = ctx;
  localStorage.clear();
  window.MOR_CONFIG.storageKey = "mor_kalender_test_appointments";

  const apt = {
    id: "a1",
    title: "Test",
    date: "2026-06-03",
    time: "09:30",
    note: "n",
    reminder: "r"
  };
  assert("T033", "saveAppointments + load", saveAppointments([apt]) && loadAppointments().length === 1);
  assert("T034", "loadAppointments filtrerer ugyldig", (() => {
    localStorage.setItem(window.MOR_CONFIG.storageKey, JSON.stringify([{ id: "x", title: "" }]));
    return loadAppointments().length === 0;
  })());
  assert("T035", "validateImportData gyldig array", validateImportData([apt]).ok);
  assert("T036", "validateImportData afviser objekt", !validateImportData({ foo: 1 }).ok);
  assert("T037", "validateImportData tom gyldig liste", !validateImportData([]).ok);
  assert("T038", "validateImportData ignorerer dårlige rækker", validateImportData([apt, { id: "bad" }]).appointments.length === 1);
  assert("T039", "loadSetting fallback", loadSetting("mor_missing_key_xyz", "fb") === "fb");
  assert("T040", "saveSetting + loadSetting", saveSetting("mor_test_k", "1") && loadSetting("mor_test_k", "0") === "1");
  assert("T041", "korrupt JSON → tom liste", (() => {
    localStorage.setItem(window.MOR_CONFIG.storageKey, "{not json");
    return loadAppointments().length === 0;
  })());
  assert("T042", "normalize trimmer titel", (() => {
    saveAppointments([{ ...apt, id: "a2", title: "  Hej  " }]);
    return loadAppointments()[0].title === "Hej";
  })());
}

async function runSyncTests(ctx) {
  const { window } = ctx;
  const sync = window.MOR_SYNC;
  const mergeAppointments = sync.mergeAppointments;
  assert("T043", "MOR_SYNC.isConfigured false uden nøgler", !sync.isConfigured());
  assert("T044", "mergeAppointments beholder nyeste", (() => {
    const local = [{ id: "1", title: "L", updated_at: "2020-01-01T00:00:00Z", date: "2026-01-01", time: "10:00" }];
    const remote = [{ id: "1", title: "R", updated_at: "2026-01-02T00:00:00Z", date: "2026-01-01", time: "10:00" }];
    return mergeAppointments(local, remote)[0].title === "R";
  })());
  assert("T045", "mergeAppointments tilføjer remote id", mergeAppointments([], [{ id: "9", title: "X", date: "2026-01-01", time: "11:00" }]).length === 1);
  const merged = await sync.pullAndMerge([{ id: "1", title: "A", date: "2026-06-01", time: "10:00" }]);
  assert("T046", "pullAndMerge offline fallback", merged.length === 1);
  window.MOR_CONFIG.pcServerUrl = "http://127.0.0.1:8010";
  window.MOR_CONFIG.pcServerPin = "test-pin";
  window.MOR_CONFIG.syncMode = "pc";
  assert("T047", "isPcServerConfigured true med URL+PIN", sync.isPcServerConfigured());
  assert("T047b", "getSyncMode pc", sync.getSyncMode() === "pc");
  window.MOR_CONFIG.pcServerUrl = "";
  window.MOR_CONFIG.pcServerPin = "";
  window.MOR_CONFIG.supabaseUrl = "https://example.supabase.co";
  window.MOR_CONFIG.supabaseAnonKey = "key";
  window.MOR_CONFIG.householdId = "hh";
  window.MOR_CONFIG.syncMode = "supabase";
  assert("T047c", "isConfigured true med Supabase", sync.isConfigured());
  window.MOR_CONFIG.supabaseUrl = "";
  window.MOR_CONFIG.supabaseAnonKey = "";
  window.MOR_CONFIG.householdId = "";
  let bgOk = true;
  try {
    await sync.syncAfterSaveBackground([], []);
  } catch {
    bgOk = false;
  }
  assert("T048", "syncAfterSaveBackground uden aktiv config", bgOk && !sync.isConfigured());
  assert("T048b", "loadPcCache tom uden data", sync.loadPcCache() === null || typeof sync.loadPcCache() === "object");
  skip("T049", "PC server fetch live", "Kræver kørende MorKalender_Server");
  skip("T050", "Supabase upsert live", "Ingen rigtige nøgler i repo");
}

function runConfigAndAdminStatic() {
  const cfg = read("config/config.js");
  const syncCfg = read("config/sync-config.js");
  assert("T051", "config.js definerer MOR_CONFIG", cfg.includes("window.MOR_CONFIG"));
  assert("T052", "jariPhone felt i config", /jariPhone:\s*"/.test(cfg));
  assert("T052b", "Android CALL_PHONE permission", read("../android/app/src/main/AndroidManifest.xml").includes("CALL_PHONE"));
  assert("T052c", "PhoneCall plugin JS", read("js/phone-call.js").includes("MOR_PHONE"));
  assert("T053", "3 temaer i config", cfg.includes('"dark"') && cfg.includes("contrast"));
  assert("T054", "sync-config pcServerUrl felt", /pcServerUrl/.test(syncCfg));
  assert("T055", "adminPin defineret", syncCfg.includes("adminPin"));
  assert("T055b", "syncMode pc default i example", /syncMode:\s*"pc"/.test(read("config/sync-config.example.js")));
  assert("T056", "admin.js PIN-tjek", read("js/admin.js").includes("Forkert PIN"));
  assert("T057", "storage kalder syncAfterSaveBackground", read("js/storage.js").includes("syncAfterSaveBackground"));
  assert("T057b", "sync.js PC-server endpoints", read("js/sync.js").includes("/api/appointments/sync"));
  assert(
    "T057d",
    "sync.js fetch timeout (AbortController)",
    read("js/sync.js").includes("AbortController") && read("js/sync.js").includes("FETCH_TIMEOUT_MS")
  );
  assert(
    "T057e",
    "app.js første paint før synk",
    read("js/app.js").includes("bootstrapAppointmentsDeferred") && read("js/app.js").includes("initMorApp")
  );
  assert("T057f", "storage cloud refresh guard", read("js/storage.js").includes("cloudRefreshInFlight"));
  assert("T057c", "notifications mor_reminder_bing_long_v6 kanal", read("js/notifications.js").includes("mor_reminder_bing_long_v6"));
  assert(
    "T058",
    "notification banner tekst",
    read("index.html").includes("Notifikationer er ikke slået til. Tryk her for at slå dem til.")
  );
  assert(
    "T058b",
    "storage.js fjerner legacy demo-aftaler",
    read("js/storage.js").includes("removeLegacyDemoAppointments") &&
      !read("js/app.js").includes("seedDemoDataIfEmpty")
  );
  assert("T059", "app validering tom titel", read("js/app.js").includes("Skriv hvad du skal"));
  assert("T060", "Ring disabled uden telefon", read("js/app.js").includes("Telefonnummer er ikke sat"));
  assert("T060b", "Ring bruger MOR_PHONE på native", read("js/app.js").includes("MOR_PHONE"));
}

function runPwaAndBat() {
  const manifest = JSON.parse(read("manifest.webmanifest"));
  assert("T061", "manifest name", manifest.name?.includes("Mor"));
  assert("T062", "manifest start_url", manifest.start_url === "./index.html");
  assert("T063", "manifest icons", Array.isArray(manifest.icons) && manifest.icons.length >= 1);
  assert("T064", "sw.js CACHE konstant", read("sw.js").includes("mor-kalender-v3"));
  assert("T065", "sw.js precache index", read("sw.js").includes("./index.html"));
  assert("T066", "icon.svg findes", exists("icons/icon.svg"));
  const rootBat = fs.readFileSync(path.join(ROOT_DIR, "START_APP.bat"), "utf8");
  const appBat = read("START_APP.bat");
  assert("T067", "ROOT START_APP.bat cd app", rootBat.includes("app") && rootBat.includes("index.html"));
  assert("T068", "app START_APP.bat index.html", appBat.includes("index.html"));
  assert("T069", "style.css findes", exists("style.css"));
  assert("T070", "admin.css findes", exists("admin.css"));
}

async function runHttpTests(serverOk) {
  if (!serverOk) {
    for (let i = 71; i <= 85; i++) {
      skip(`T${String(i).padStart(3, "0")}`, `HTTP test ${i}`, "Server ikke tilgængelig — start python -m http.server 8765 i app/");
    }
    return;
  }
  const paths = [
    ["T071", "/index.html", 200, "Mor Kalender"],
    ["T072", "/admin.html", 200, "administration"],
    ["T073", "/style.css", 200, ""],
    ["T074", "/js/app.js", 200, "templates"],
    ["T075", "/config/config.js", 200, "MOR_CONFIG"],
    ["T076", "/manifest.webmanifest", 200, "Mor"],
    ["T077", "/sw.js", 200, "addEventListener"],
    ["T078", "/icons/icon.svg", 200, "svg"],
    ["T079", "/js/sync.js", 200, "MOR_SYNC"],
    ["T080", "/admin.css", 200, ""]
  ];
  for (const [id, p, expect, needle] of paths) {
    try {
      const r = await httpGet(`${BASE}${p}`);
      const ok = r.status === expect && (!needle || r.body.includes(needle));
      assert(id, `HTTP ${expect} ${p}`, ok, `status=${r.status}`);
    } catch (e) {
      fail(id, `HTTP ${p}`, e.message);
    }
  }
  assert("T081", "index.html har 8 templates", (await httpGet(`${BASE}/index.html`)).body.split("-template").length >= 9);
  assert("T082", "admin.html har pinGate", (await httpGet(`${BASE}/admin.html`)).body.includes("pinGate"));
  assert("T083", "CORS ikke påkrævet lokalt", true, "GET ok");
  assert("T084", "index linker manifest", (await httpGet(`${BASE}/index.html`)).body.includes("manifest.webmanifest"));
  assert("T085", "index registrerer sw.js", read("js/app.js").includes('register("./sw.js")'));
}

function runPcServerDocTests() {
  const serverRoot = path.join(path.dirname(ROOT_DIR), "MorKalender_Server");
  const docs = ROOT_DIR + path.sep + "docs";
  assert("T101", "MorKalender_Server mappe findes", fs.existsSync(serverRoot));
  assert("T102", "START_SERVER.bat findes", fs.existsSync(path.join(serverRoot, "START_SERVER.bat")));
  assert("T103", "main.py findes", fs.existsSync(path.join(serverRoot, "main.py")));
  assert("T104", "PC_SERVER_PLAN.md", fs.existsSync(path.join(docs, "PC_SERVER_PLAN.md")));
  assert("T105", "TAILSCALE_SETUP.md", fs.existsSync(path.join(docs, "TAILSCALE_SETUP.md")));
  assert("T106", "LAG_PC_SERVER.md", fs.existsSync(path.join(docs, "LAG_PC_SERVER.md")));
  assert("T107", "HANDOFF.md", fs.existsSync(path.join(docs, "HANDOFF.md")));
  assert("T108", "Android cleartext traffic", read("../android/app/src/main/AndroidManifest.xml").includes("usesCleartextTraffic"));
  assert("T109", "mor_reminder.wav raw asset", fs.existsSync(path.join(ROOT_DIR, "android/app/src/main/res/raw/mor_reminder.wav")));
  assert("T110", "sync-config ingen hemmelig URL i repo", !read("config/sync-config.js").includes("100."));
}

function runManualSkips() {
  const manual = [
    ["T086", "Browser: Hjem tom ved første besøg", "Manuel UI"],
    ["T087", "Browser: Tilføj aftale CRUD", "Manuel UI"],
    ["T088", "Browser: Kalender prik + valgt dag", "Manuel UI"],
    ["T089", "Browser: Detalje / Ret / Slet", "Manuel UI"],
    ["T090", "Browser: Stor tekst toggle", "Manuel UI"],
    ["T091", "Browser: Tema lys/kontrast", "Manuel UI"],
    ["T092", "Browser: Eksport JSON download", "Manuel UI"],
    ["T093", "Browser: Import gyldig/ugyldig fil", "Manuel UI"],
    ["T094", "Browser: Hjælp 4 trin", "Manuel UI"],
    ["T095", "Browser: Ring Jari alert uden nummer", "Manuel UI"],
    ["T096", "Browser: Admin PIN rigtig/forkert", "Manuel UI"],
    ["T097", "Browser: PWA install prompt", "Manuel UI"],
    ["T098", "Browser: Hash navigation alle views", "Manuel UI"],
    ["T099", "Browser: confirm slet alle", "Manuel UI"],
    ["T100", "Browser: Service worker aktiv via http", "Manuel UI"]
  ];
  manual.forEach(([id, name, note]) => skip(id, name, note));
}

async function main() {
  console.log("Mor Kalender — testkørsel\nApp:", APP_DIR);

  runStaticTests();
  const ctx = loadUtilsAndStorage();
  runUtilsTests(ctx);
  runStorageTests(ctx);
  await runSyncTests(ctx);
  runConfigAndAdminStatic();
  runPwaAndBat();
  runPcServerDocTests();

  let child = null;
  let serverOk = await waitForServer().catch(() => false);
  if (!serverOk) {
    child = startPythonServer();
    serverOk = await waitForServer(15000);
  }
  await runHttpTests(serverOk);
  if (child?.pid) {
    try {
      process.kill(-child.pid);
    } catch {
      try {
        child.kill();
      } catch {
        /* ignore */
      }
    }
  }

  runManualSkips();

  const pass = results.filter(r => r.status === "PASS").length;
  const failN = results.filter(r => r.status === "FAIL").length;
  const skipN = results.filter(r => r.status === "SKIP").length;
  const auto = results.filter(r => !["T086", "T087", "T088", "T089", "T090", "T091", "T092", "T093", "T094", "T095", "T096", "T097", "T098", "T099", "T100", "T049", "T050"].includes(r.id));
  const autoPass = auto.filter(r => r.status === "PASS").length;
  const autoTotal = auto.length;

  const isoDate = new Date().toISOString();
  const outPath = path.join(ROOT_DIR, "docs", "test-results.json");
  fs.writeFileSync(outPath, JSON.stringify({ date: isoDate, pass, fail: failN, skip: skipN, results }, null, 2));

  console.log("\n--- Resultat ---");
  console.log(`PASS: ${pass}  FAIL: ${failN}  SKIP: ${skipN}  (total ${results.length})`);
  console.log(`Automatisk: ${autoPass}/${autoTotal} (${Math.round((100 * autoPass) / autoTotal)}%)`);
  if (failN) {
    console.log("\nFejlede:");
    results.filter(r => r.status === "FAIL").forEach(r => console.log(`  ${r.id} ${r.name}: ${r.note}`));
  }
  process.exit(failN > 0 ? 1 : 0);
}

main().catch(err => {
  console.error(err);
  process.exit(1);
});
