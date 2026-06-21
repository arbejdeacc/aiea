const LEGACY_DEMO_IDS = new Set(["demo-1", "demo-2"]);
const LEGACY_DEMO_TITLES = new Set(["Frisørtime", "Kaffemøde med Lise"]);

function isLegacyDemoAppointment(item) {
  if (!item || typeof item !== "object") return false;
  if (LEGACY_DEMO_IDS.has(String(item.id))) return true;
  return LEGACY_DEMO_TITLES.has(String(item.title || "").trim());
}

function removeLegacyDemoAppointments(appointments) {
  if (!Array.isArray(appointments)) return [];
  return appointments.filter(apt => !isLegacyDemoAppointment(apt));
}

function isFestAppointment(item) {
  return String(item?.title || "").trim().toLowerCase() === "fest";
}

function removeFestAppointments(appointments) {
  if (!Array.isArray(appointments)) return [];
  return appointments.filter(apt => !isFestAppointment(apt));
}

function applyLegacyDemoCleanup(appointments) {
  const cleaned = removeFestAppointments(removeLegacyDemoAppointments(appointments));
  if (cleaned.length === appointments.length) return cleaned;
  saveAppointmentsLocal(cleaned);
  return cleaned;
}

function loadAppointments() {
  const key = window.MOR_CONFIG.storageKey;
  try {
    const raw = localStorage.getItem(key);
    if (!raw) return [];
    const data = JSON.parse(raw);
    if (!Array.isArray(data)) return [];
    return data.filter(isValidStoredAppointment).map(normalizeAppointment);
  } catch {
    return [];
  }
}

function saveAppointmentsLocal(appointments) {
  const key = window.MOR_CONFIG.storageKey;
  try {
    localStorage.setItem(key, JSON.stringify(appointments));
    return true;
  } catch (err) {
    alert("Kunne ikke gemme aftaler. Browseren har måske ikke plads. Prøv at slette gamle data.");
    console.error(err);
    return false;
  }
}

function stampAppointments(appointments) {
  const now = new Date().toISOString();
  return appointments.map(apt => ({
    ...apt,
    updated_at: apt.updated_at || now
  }));
}

function saveAppointments(appointments, options) {
  const stamped = stampAppointments(appointments);
  const ok = saveAppointmentsLocal(stamped);
  if (!ok) return false;

  const deletedIds = options && options.deletedIds ? options.deletedIds : [];
  const syncOpts = options && options.prune ? { prune: true } : undefined;
  if (window.MOR_SYNC && window.MOR_SYNC.isConfigured()) {
    window.MOR_SYNC.syncAfterSaveBackground(stamped, deletedIds, syncOpts);
  }
  if (window.MOR_NOTIF) {
    window.MOR_NOTIF.onAppointmentsSaved(stamped, deletedIds);
  }
  return true;
}

let cloudRefreshInFlight = false;

async function refreshAppointmentsFromCloud() {
  const local = loadAppointments();
  if (!window.MOR_SYNC || !window.MOR_SYNC.isConfigured()) {
    return local;
  }
  if (cloudRefreshInFlight) return local;
  cloudRefreshInFlight = true;
  try {
    const merged = await window.MOR_SYNC.pullAndMerge(local);
    if (merged.length !== local.length || JSON.stringify(merged) !== JSON.stringify(local)) {
      saveAppointmentsLocal(merged);
    }
    return merged;
  } finally {
    cloudRefreshInFlight = false;
  }
}

function loadSetting(key, fallback) {
  try {
    const v = localStorage.getItem(key);
    return v === null ? fallback : v;
  } catch {
    return fallback;
  }
}

function saveSetting(key, value) {
  try {
    localStorage.setItem(key, value);
    return true;
  } catch {
    alert("Kunne ikke gemme indstillingen. Prøv igen.");
    return false;
  }
}

function isValidStoredAppointment(item) {
  if (!item || typeof item !== "object") return false;
  if (!item.id || !String(item.title || "").trim() || !item.date || !item.time) return false;
  if (!parseISODate(item.date)) return false;
  if (!isValidTime(item.time)) return false;
  return true;
}

function normalizeAppointment(item) {
  const minutes = window.MOR_NOTIF
    ? window.MOR_NOTIF.normalizeReminderMinutes(item.reminderMinutesBefore)
    : Number(item.reminderMinutesBefore) || 30;
  return {
    id: String(item.id),
    title: String(item.title).trim(),
    date: String(item.date).trim(),
    time: String(item.time).trim(),
    note: item.note ? String(item.note).trim() : "",
    reminder: item.reminder ? String(item.reminder).trim() : "",
    reminderMinutesBefore: minutes,
    created_at: item.created_at || null,
    updated_at: item.updated_at || null
  };
}

function validateImportData(data) {
  if (!Array.isArray(data)) {
    return { ok: false, message: "Filen skal indeholde en liste af aftaler." };
  }
  const valid = [];
  for (const item of data) {
    if (!isValidStoredAppointment(item)) continue;
    valid.push(normalizeAppointment(item));
  }
  if (!valid.length) {
    return { ok: false, message: "Ingen gyldige aftaler fundet i filen." };
  }
  return { ok: true, appointments: valid };
}
