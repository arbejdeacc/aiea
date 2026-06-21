/**
 * Mor Kalender — stress-test (~1000 assertion runs, diverse scenarier)
 * Kør fra app/: node scripts/stress-tests.mjs
 * Valgfrit: STRESS_RUNS=3 (gentag hele suiten for stabilitet)
 */
import fs from "fs";
import path from "path";
import {
  APP_DIR,
  ROOT_DIR,
  read,
  loadUtilsAndStorage,
  checkPinPattern,
  randomInt,
  randomValidDate,
  randomValidTime
} from "./test-helpers.mjs";

const RUNS = Math.max(1, Number(process.env.STRESS_RUNS || 1));
let assertionCount = 0;
let passCount = 0;
let failCount = 0;
const failures = [];
const scenarioStats = {};

function scenario(name) {
  if (!scenarioStats[name]) scenarioStats[name] = { pass: 0, fail: 0, assertions: 0 };
  return name;
}

function assert(scenarioName, cond, note = "") {
  assertionCount++;
  scenarioStats[scenarioName].assertions++;
  if (cond) {
    passCount++;
    scenarioStats[scenarioName].pass++;
  } else {
    failCount++;
    scenarioStats[scenarioName].fail++;
    if (failures.length < 30) failures.push({ scenario: scenarioName, note });
  }
}

function freshCtx(overrides) {
  const ctx = loadUtilsAndStorage(overrides);
  ctx.localStorage.clear();
  return ctx;
}

function runCrudCycles() {
  const S = scenario("S01_CRUD_cycles");
  for (let i = 0; i < 120; i++) {
    const ctx = freshCtx();
    const { saveAppointments, loadAppointments, newAppointmentId } = ctx;
    const id = newAppointmentId();
    const date = randomValidDate();
    const time = randomValidTime();
    const apt = { id, title: `Stress ${i}`, date, time, note: "n", reminder: "r" };
    assert(S, saveAppointments([apt]));
    const loaded = loadAppointments();
    assert(S, loaded.length === 1);
    assert(S, loaded[0].title === `Stress ${i}`);
    assert(S, loaded[0].date === date);

    const edited = { ...loaded[0], title: `Edited ${i}`, time: "14:30" };
    assert(S, saveAppointments([edited]));
    assert(S, loadAppointments()[0].title === `Edited ${i}`);
    assert(S, loadAppointments()[0].time === "14:30");

    assert(S, saveAppointments([]));
    assert(S, loadAppointments().length === 0);
  }
}

function runInvalidDates() {
  const S = scenario("S02_invalid_dates");
  const ctx = freshCtx();
  const { parseISODate, toISODate, loadAppointments } = ctx;
  const { localStorage, window } = ctx;

  const badDates = [
    "", "2026-13-01", "2026-00-15", "2026-02-30", "2026-04-31",
    "2026-2-3", "not-a-date", "2026/06/03", "9999-99-99",
    "2023-02-29", "2024-02-30", "abc-def-ghi", "  ", "2026-06-3"
  ];
  for (const d of badDates) {
    assert(S, parseISODate(d) === null);
  }
  for (let i = 0; i < 40; i++) {
    const y = randomInt(1990, 2035);
    const m = randomInt(13, 20);
    const day = randomInt(32, 50);
    assert(S, parseISODate(`${y}-${String(m).padStart(2, "0")}-${String(day).padStart(2, "0")}`) === null);
  }
  assert(S, toISODate(parseISODate("invalid")) === "");
  localStorage.setItem(
    window.MOR_CONFIG.storageKey,
    JSON.stringify([{ id: "x1", title: "T", date: "2026-13-40", time: "10:00" }])
  );
  assert(S, loadAppointments().length === 0);
}

function runInvalidTimesAndEmpty() {
  const S = scenario("S03_invalid_times_empty");
  const ctx = freshCtx();
  const { isValidTime, validateImportData, loadAppointments } = ctx;
  const { localStorage, window } = ctx;

  const badTimes = ["", "25:00", "12:60", "9:30", "12:5", "24:00", "12:99", "ab:cd", "12", "12:000"];
  for (const t of badTimes) {
    assert(S, !isValidTime(t));
  }
  for (let i = 0; i < 30; i++) {
    assert(S, !isValidTime(`${randomInt(24, 99)}:${String(randomInt(0, 99)).padStart(2, "0")}`));
  }
  const emptyCases = [
    { id: "e1", title: "", date: "2026-06-03", time: "10:00" },
    { id: "", title: "X", date: "2026-06-03", time: "10:00" },
    { id: "e2", title: "X", date: "", time: "10:00" },
    { id: "e3", title: "X", date: "2026-06-03", time: "" }
  ];
  for (const item of emptyCases) {
    localStorage.setItem(window.MOR_CONFIG.storageKey, JSON.stringify([item]));
    assert(S, loadAppointments().length === 0);
    assert(S, !validateImportData([item]).ok);
  }
  assert(S, !validateImportData(null).ok);
  assert(S, !validateImportData([]).ok);
  assert(S, !validateImportData([{ id: "1", title: "   ", date: "2026-06-03", time: "10:00" }]).ok);
}

function runCalendarEdges() {
  const S = scenario("S04_calendar_edges");
  const { buildCalendarCells, parseISODate, toISODate } = freshCtx();

  for (let month = 0; month < 12; month++) {
    const cells = buildCalendarCells(2026, month);
    assert(S, cells.length === 42);
    assert(S, cells.some(c => c.currentMonth));
    assert(S, cells.filter(c => c.currentMonth).length >= 28);
  }
  for (const year of [2020, 2024, 2028]) {
    assert(S, parseISODate(`${year}-02-29`) !== null);
    assert(S, toISODate(parseISODate(`${year}-02-29`)) === `${year}-02-29`);
  }
  assert(S, parseISODate("2023-02-29") === null);
  assert(S, parseISODate("2025-02-29") === null);

  const jan2026 = buildCalendarCells(2026, 0);
  assert(S, jan2026[0].iso <= "2026-01-07");
  const decCells = buildCalendarCells(2026, 11);
  assert(S, decCells.some(c => c.iso.startsWith("2027-01")));

  for (let i = 0; i < 24; i++) {
    const y = 2024 + (i % 5);
    const m = i % 12;
    const cells = buildCalendarCells(y, m);
    assert(S, cells.every(c => /^\d{4}-\d{2}-\d{2}$/.test(c.iso)));
    assert(S, cells.every(c => c.day >= 1 && c.day <= 31));
  }
}

function runImportScenarios() {
  const S = scenario("S05_import_json");
  const { validateImportData } = freshCtx();

  const valid = {
    id: "imp1",
    title: "Import OK",
    date: "2026-06-15",
    time: "11:00",
    note: "",
    reminder: ""
  };
  assert(S, validateImportData([valid]).ok);
  assert(S, validateImportData([valid, { bad: true }]).appointments.length === 1);

  const corruptPayloads = [null, {}, { appointments: [] }, [null, 1, "x"], [{ id: "1" }]];
  for (const p of corruptPayloads) {
    assert(S, !validateImportData(p).ok);
  }
  for (let i = 0; i < 50; i++) {
    const mixed = [
      { id: `g${i}`, title: `G${i}`, date: randomValidDate(), time: randomValidTime() },
      { foo: "bar" },
      { id: `b${i}`, title: "", date: "2026-01-01", time: "10:00" }
    ];
    const r = validateImportData(mixed);
    assert(S, r.ok && r.appointments.length === 1);
  }
  try {
    JSON.parse("{broken");
    assert(S, false);
  } catch {
    assert(S, true);
  }
}

function runMergeOffline() {
  const S = scenario("S06_merge_sync");
  for (let i = 0; i < 80; i++) {
    const ctx = freshCtx();
    const sync = ctx.window.MOR_SYNC;
    assert(S, !sync.isConfigured());

    const local = [{
      id: `L${i}`,
      title: "Local",
      date: "2026-06-01",
      time: "09:00",
      updated_at: "2026-01-01T00:00:00Z"
    }];
    const remote = [{
      id: `L${i}`,
      title: "RemoteNewer",
      date: "2026-06-01",
      time: "09:00",
      updated_at: "2026-06-01T00:00:00Z"
    }];
    const merged = sync.mergeAppointments(local, remote);
    assert(S, merged[0].title === "RemoteNewer");

    const onlyRemote = [{ id: `R${i}`, title: "R", date: "2026-07-01", time: "10:00" }];
    assert(S, sync.mergeAppointments([], onlyRemote).length === 1);
  }
}

async function runMergeAsync() {
  const S = scenario("S06_merge_sync");
  for (let i = 0; i < 80; i++) {
    const ctx = freshCtx();
    const sync = ctx.window.MOR_SYNC;
    const local = [{ id: `a${i}`, title: "A", date: "2026-06-01", time: "10:00" }];
    const merged = await sync.pullAndMerge(local);
    assert(S, merged.length === 1);
  }

  for (let i = 0; i < 20; i++) {
    const ctx = freshCtx({
      supabaseUrl: "https://mock.example.co",
      supabaseAnonKey: "mock-key",
      householdId: "mock-hh"
    });
    const sync = ctx.window.MOR_SYNC;
    assert(S, sync.isConfigured());
    ctx.window.navigator.onLine = false;
    let bgOk = true;
    try {
      await sync.syncAfterSaveBackground([], []);
    } catch {
      bgOk = false;
    }
    assert(S, bgOk);
  }
}

function runPinLogic() {
  const S = scenario("S07_pin_admin");
  const expected = "TEST_PIN_PATTERN";
  const wrongPatterns = ["", "0000", "9999", "abcd", "12345", "test_pin_pattern", "wrong"];
  for (const w of wrongPatterns) {
    const r = checkPinPattern(w, expected);
    assert(S, !r.ok);
  }
  assert(S, checkPinPattern("TEST_PIN_PATTERN", expected).ok);
  assert(S, !checkPinPattern("x", "").ok && checkPinPattern("x", "").reason === "not_configured");

  const adminSrc = read("js/admin.js");
  assert(S, adminSrc.includes("Forkert PIN"));
  assert(S, adminSrc.includes("sessionStorage"));
}

function runConfigFallback() {
  const S = scenario("S08_config_fallback");
  for (let i = 0; i < 40; i++) {
    const ctx = freshCtx({ supabaseUrl: "", supabaseAnonKey: "", householdId: "" });
    assert(S, !ctx.window.MOR_SYNC.isConfigured());
    ctx.saveAppointments([{
      id: `c${i}`,
      title: "Offline",
      date: randomValidDate(),
      time: "08:00"
    }]);
    assert(S, ctx.loadAppointments().length === 1);
  }
  const syncCfg = read("config/sync-config.js");
  assert(S, /supabaseUrl:\s*""/.test(syncCfg));
  assert(S, syncCfg.includes("adminPin"));
}

function runMobileCssChecks() {
  const S = scenario("S09_mobile_css");
  const style = read("style.css");
  const adminCss = read("admin.css");
  assert(S, style.includes("html.large-text"));
  assert(S, style.includes("@media (max-width: 480px)"));
  assert(S, adminCss.includes("@media (max-width: 640px)"));

  const indexHtml = read("index.html");
  assert(S, indexHtml.includes('name="viewport"'));
  assert(S, !indexHtml.toLowerCase().includes("tailscale"));
  assert(S, !indexHtml.toLowerCase().includes("zip"));

  for (let i = 0; i < 20; i++) {
    assert(S, style.includes(".nav-btn"));
  }
}

function runSettingsStorage() {
  const S = scenario("S10_settings_storage");
  const ctx = freshCtx();
  const { loadSetting, saveSetting, window } = ctx;
  const keys = window.MOR_CONFIG.settingsKeys;

  for (let i = 0; i < 60; i++) {
    const theme = ["dark", "light", "contrast"][i % 3];
    assert(S, saveSetting(keys.theme, theme));
    assert(S, loadSetting(keys.theme, "dark") === theme);
    const large = i % 2 === 0 ? "1" : "0";
    assert(S, saveSetting(keys.largeText, large));
    assert(S, loadSetting(keys.largeText, "0") === large);
  }
  assert(S, loadSetting("mor_nonexistent_key_xyz", "fallback") === "fallback");
}

async function runOneSuite() {
  assertionCount = 0;
  passCount = 0;
  failCount = 0;
  failures.length = 0;
  Object.keys(scenarioStats).forEach(k => delete scenarioStats[k]);

  runCrudCycles();
  runInvalidDates();
  runInvalidTimesAndEmpty();
  runCalendarEdges();
  runImportScenarios();
  runMergeOffline();
  await runMergeAsync();
  runPinLogic();
  runConfigFallback();
  runMobileCssChecks();
  runSettingsStorage();

  return { assertionCount, passCount, failCount, failures, scenarioStats: { ...scenarioStats } };
}

async function main() {
  console.log("Mor Kalender — stress-test");
  console.log("App:", APP_DIR);
  console.log("Runs:", RUNS, "\n");

  const allRuns = [];
  for (let r = 1; r <= RUNS; r++) {
    const result = await runOneSuite();
    allRuns.push(result);
    console.log(`Run ${r}/${RUNS}: ${result.passCount} pass, ${result.failCount} fail, ${result.assertionCount} assertions`);
    if (result.failCount > 0) {
      result.failures.slice(0, 5).forEach(f => console.log("  FAIL:", f.scenario, f.note));
    }
  }

  const last = allRuns[allRuns.length - 1];
  const stable = allRuns.every(r => r.failCount === 0);

  const out = {
    date: new Date().toISOString(),
    runs: RUNS,
    stable,
    lastRun: {
      assertions: last.assertionCount,
      pass: last.passCount,
      fail: last.failCount,
      scenarios: last.scenarioStats
    },
    allRuns: allRuns.map(r => ({ assertions: r.assertionCount, pass: r.passCount, fail: r.failCount }))
  };

  const outPath = path.join(ROOT_DIR, "docs", "stress-results.json");
  fs.writeFileSync(outPath, JSON.stringify(out, null, 2));

  console.log("\n--- Stress resultat ---");
  console.log(`Assertions (sidste run): ${last.assertionCount}`);
  console.log(`PASS: ${last.passCount}  FAIL: ${last.failCount}`);
  console.log(`Stabil over ${RUNS} run(s): ${stable ? "JA" : "NEJ"}`);
  console.log("Scenarier:", Object.keys(last.scenarioStats).join(", "));
  console.log("Skrevet:", outPath);

  process.exit(last.failCount > 0 ? 1 : 0);
}

main().catch(err => {
  console.error(err);
  process.exit(1);
});
