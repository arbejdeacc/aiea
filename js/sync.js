/**
 * Mor Kalender synk — PC-server (primær) eller Supabase (legacy, valgfri).
 * Ingen npm. Offline: localStorage-cache + sidste gode server-data.
 */
(function () {
  const cfg = () => window.MOR_CONFIG || {};
  const PC_CACHE_KEY = "mor_kalender_pc_cache_v1";
  /** Max ventetid på PC/Supabase — undgår hængende UI når server er slukket. */
  const FETCH_TIMEOUT_MS = 7000;
  let pullInProgress = false;

  function isSupabaseConfigured() {
    const c = cfg();
    return Boolean(
      (c.supabaseUrl || "").trim() &&
      (c.supabaseAnonKey || "").trim() &&
      (c.householdId || "").trim()
    );
  }

  function pcServerUrl() {
    return (cfg().pcServerUrl || "").trim().replace(/\/$/, "");
  }

  function pcServerPin() {
    return String(cfg().pcServerPin || cfg().adminPin || "").trim();
  }

  function isPcServerConfigured() {
    return Boolean(pcServerUrl() && pcServerPin());
  }

  /** PC-server slået til som standard når URL+PIN er sat; ellers Supabase hvis udfyldt. */
  function isConfigured() {
    if (cfg().syncMode === "supabase") return isSupabaseConfigured();
    if (cfg().syncMode === "none") return false;
    if (isPcServerConfigured()) return true;
    return isSupabaseConfigured();
  }

  function getSyncMode() {
    if (cfg().syncMode === "none") return "none";
    if (isPcServerConfigured() && cfg().syncMode !== "supabase") return "pc";
    if (isSupabaseConfigured()) return "supabase";
    return "none";
  }

  function savePcCache(appointments, remoteConfig) {
    try {
      localStorage.setItem(
        PC_CACHE_KEY,
        JSON.stringify({
          appointments: appointments || [],
          config: remoteConfig || null,
          cachedAt: new Date().toISOString()
        })
      );
    } catch {
      /* ignore */
    }
  }

  function loadPcCache() {
    try {
      const raw = localStorage.getItem(PC_CACHE_KEY);
      return raw ? JSON.parse(raw) : null;
    } catch {
      return null;
    }
  }

  function applyRemoteConfig(remoteConfig) {
    if (!remoteConfig || typeof remoteConfig !== "object") return;
    const base = window.MOR_CONFIG || {};
    if (remoteConfig.text?.appName) base.appName = remoteConfig.text.appName;
    if (remoteConfig.text?.brandTitle) base.appShortName = remoteConfig.text.brandTitle;
    if (remoteConfig.contact?.name) base.contactName = remoteConfig.contact.name;
    if (typeof remoteConfig.contact?.phone === "string") base.jariPhone = remoteConfig.contact.phone;
    if (remoteConfig.colors && typeof remoteConfig.colors === "object") {
      base.themeColors = Object.assign({}, base.themeColors || {}, remoteConfig.colors);
    }
    window.MOR_CONFIG = base;
  }

  function pcHeaders(extra) {
    return Object.assign(
      {
        "Content-Type": "application/json",
        "X-Admin-Pin": pcServerPin()
      },
      extra || {}
    );
  }

  async function fetchWithTimeout(url, options) {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), FETCH_TIMEOUT_MS);
    try {
      return await fetch(
        url,
        Object.assign({}, options || {}, { signal: controller.signal })
      );
    } catch (err) {
      if (err && err.name === "AbortError") {
        throw new Error("Netværkskald timeout");
      }
      throw err;
    } finally {
      clearTimeout(timer);
    }
  }

  async function pcFetch(path, options) {
    const url = `${pcServerUrl()}${path}`;
    const res = await fetchWithTimeout(
      url,
      Object.assign({ headers: pcHeaders() }, options || {})
    );
    if (!res.ok) {
      throw new Error(`PC server ${res.status}`);
    }
    return res.json();
  }

  function mergeAppointments(local, remote) {
    const byId = new Map();
    const locals = Array.isArray(local) ? local : [];
    const remotes = Array.isArray(remote) ? remote : [];

    for (const apt of locals) {
      if (apt && apt.id) byId.set(String(apt.id), apt);
    }
    for (const apt of remotes) {
      if (!apt || !apt.id) continue;
      const id = String(apt.id);
      const existing = byId.get(id);
      if (!existing) {
        byId.set(id, apt);
        continue;
      }
      const localTs = Date.parse(existing.updated_at || "") || 0;
      const remoteTs = Date.parse(apt.updated_at || "") || 0;
      byId.set(id, remoteTs >= localTs ? apt : existing);
    }
    return Array.from(byId.values());
  }

  async function fetchAllPc() {
    const data = await pcFetch("/api/appointments", { method: "GET" });
    const list = (Array.isArray(data) ? data : [])
      .filter(isValidStoredAppointment)
      .map(normalizeAppointment);
    let remoteConfig = null;
    try {
      remoteConfig = await pcFetch("/api/config", { method: "GET" });
      applyRemoteConfig(remoteConfig);
    } catch (err) {
      console.warn("PC config hentning fejlede", err);
    }
    savePcCache(list, remoteConfig);
    return list;
  }

  async function syncAfterSavePc(appointments, deletedIds, options) {
    const payload = {
      appointments: appointments || [],
      deletedIds: Array.isArray(deletedIds) ? deletedIds : [],
      prune: Boolean(options && options.prune)
    };
    const data = await pcFetch("/api/appointments/sync", {
      method: "POST",
      body: JSON.stringify(payload)
    });
    const merged = (data.appointments || [])
      .filter(isValidStoredAppointment)
      .map(normalizeAppointment);
    savePcCache(merged, loadPcCache()?.config || null);
    recordSyncSuccess({ mode: "pc", online: true });
    return merged;
  }

  /* --- Supabase (legacy) --- */
  function apiBase() {
    return `${cfg().supabaseUrl.replace(/\/$/, "")}/rest/v1/appointments`;
  }

  function supabaseHeaders(extra) {
    const key = cfg().supabaseAnonKey.trim();
    return Object.assign(
      {
        apikey: key,
        Authorization: `Bearer ${key}`,
        "Content-Type": "application/json"
      },
      extra || {}
    );
  }

  function householdId() {
    return cfg().householdId.trim();
  }

  function localToRow(apt) {
    const now = new Date().toISOString();
    return {
      id: String(apt.id),
      household_id: householdId(),
      title: apt.title,
      date: apt.date,
      time: apt.time,
      note: apt.note || "",
      reminder_text: apt.reminder || "",
      updated_at: apt.updated_at || now,
      created_at: apt.created_at || now
    };
  }

  function rowToLocal(row) {
    return {
      id: String(row.id),
      title: String(row.title || "").trim(),
      date: String(row.date || "").trim(),
      time: String(row.time || "").trim(),
      note: row.note ? String(row.note).trim() : "",
      reminder: row.reminder_text ? String(row.reminder_text).trim() : "",
      created_at: row.created_at || null,
      updated_at: row.updated_at || null
    };
  }

  async function fetchAllSupabase() {
    const url =
      `${apiBase()}?household_id=eq.${encodeURIComponent(householdId())}` +
      "&select=id,household_id,title,date,time,note,reminder_text,created_at,updated_at" +
      "&order=date.asc,time.asc";

    const res = await fetchWithTimeout(url, { method: "GET", headers: supabaseHeaders() });
    if (!res.ok) throw new Error(`Supabase fetch ${res.status}`);
    const rows = await res.json();
    return (rows || []).map(rowToLocal).filter(isValidStoredAppointment).map(normalizeAppointment);
  }

  async function upsertOneSupabase(apt) {
    if (!apt) return;
    const row = localToRow(apt);
    const url = `${apiBase()}?on_conflict=id`;
    const res = await fetchWithTimeout(url, {
      method: "POST",
      headers: supabaseHeaders({ Prefer: "resolution=merge-duplicates,return=minimal" }),
      body: JSON.stringify(row)
    });
    if (!res.ok) throw new Error(`Supabase upsert ${res.status}`);
  }

  async function deleteRemoteSupabase(id) {
    if (!id) return;
    const url =
      `${apiBase()}?id=eq.${encodeURIComponent(String(id))}` +
      `&household_id=eq.${encodeURIComponent(householdId())}`;
    const res = await fetchWithTimeout(url, { method: "DELETE", headers: supabaseHeaders() });
    if (!res.ok && res.status !== 404) throw new Error(`Supabase delete ${res.status}`);
  }

  async function pruneRemoteNotInListSupabase(appointments) {
    const localIds = new Set((appointments || []).map(a => String(a.id)));
    const remote = await fetchAllSupabase();
    for (const apt of remote) {
      if (!localIds.has(String(apt.id))) await deleteRemoteSupabase(apt.id);
    }
  }

  async function syncAfterSaveSupabase(appointments, deletedIds, options) {
    const ids = Array.isArray(deletedIds) ? deletedIds : [];
    for (const id of ids) await deleteRemoteSupabase(id);
    for (const apt of appointments) await upsertOneSupabase(apt);
    if (options && options.prune) await pruneRemoteNotInListSupabase(appointments);
    recordSyncSuccess({ mode: "supabase", online: true });
  }

  /* --- Shared --- */
  function recordSyncSuccess(extra) {
    try {
      const meta = Object.assign(
        {
          lastSyncAt: new Date().toISOString(),
          online: typeof navigator !== "undefined" ? navigator.onLine : true,
          mode: getSyncMode()
        },
        extra || {}
      );
      localStorage.setItem(cfg().syncMetaKey, JSON.stringify(meta));
    } catch {
      /* ignore */
    }
  }

  function getSyncMeta() {
    try {
      const raw = localStorage.getItem(cfg().syncMetaKey);
      return raw ? JSON.parse(raw) : null;
    } catch {
      return null;
    }
  }

  function isOffline() {
    return typeof navigator !== "undefined" && !navigator.onLine;
  }

  async function fetchAll() {
    if (getSyncMode() === "pc") return fetchAllPc();
    if (getSyncMode() === "supabase") return fetchAllSupabase();
    return [];
  }

  async function pullAndMerge(localAppointments) {
    if (!isConfigured()) return localAppointments;
    if (pullInProgress) return localAppointments;
    pullInProgress = true;
    try {
      return await pullAndMergeInner(localAppointments);
    } finally {
      pullInProgress = false;
    }
  }

  async function pullAndMergeInner(localAppointments) {
    if (isOffline()) {
      const cache = loadPcCache();
      if (cache?.appointments?.length) {
        return mergeAppointments(localAppointments, cache.appointments);
      }
      return localAppointments;
    }
    try {
      const remote = await fetchAll();
      const merged = mergeAppointments(localAppointments, remote);
      recordSyncSuccess();
      return merged;
    } catch (err) {
      console.warn("Synk: kunne ikke hente", err);
      const cache = loadPcCache();
      if (cache?.appointments?.length) {
        recordSyncSuccess({ online: false, fromCache: true });
        return mergeAppointments(localAppointments, cache.appointments);
      }
      return localAppointments;
    }
  }

  async function syncAfterSave(appointments, deletedIds, options) {
    if (!isConfigured() || isOffline()) return;
    if (getSyncMode() === "pc") {
      await syncAfterSavePc(appointments, deletedIds, options);
      return;
    }
    if (getSyncMode() === "supabase") {
      await syncAfterSaveSupabase(appointments, deletedIds, options);
    }
  }

  function syncAfterSaveBackground(appointments, deletedIds, options) {
    if (!isConfigured() || isOffline()) return Promise.resolve();
    return syncAfterSave(appointments, deletedIds, options).catch(err => {
      console.warn("Synk: gem fejlede", err);
    });
  }

  window.MOR_SYNC = {
    isConfigured,
    isPcServerConfigured,
    isSupabaseConfigured,
    getSyncMode,
    fetchAll,
    mergeAppointments,
    pullAndMerge,
    syncAfterSave,
    syncAfterSaveBackground,
    getSyncMeta,
    recordSyncSuccess,
    loadPcCache,
    savePcCache,
    applyRemoteConfig
  };
})();
