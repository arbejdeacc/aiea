/**
 * Mor Kalender — lokale påmindelser (Android via Capacitor, begrænset web-fallback).
 */
(function () {
  const CHANNEL_ID = "mor_reminder_bing_long_v6";
  const SOUND_NAME = "mor_reminder";
  const FIRED_KEY = "mor_notif_fired_v1";
  const ALLOWED_MINUTES = [0, 5, 15, 30, 60];
  const DEFAULT_MINUTES = 30;

  const REMINDER_LABELS = {
    0: "På tidspunktet",
    5: "5 minutter før",
    15: "15 minutter før",
    30: "30 minutter før",
    60: "1 time før"
  };

  let channelReady = false;
  let webPollTimer = null;

  function isNative() {
    return typeof window.Capacitor !== "undefined" && window.Capacitor.isNativePlatform();
  }

  function getLocalNotifications() {
    if (!window.Capacitor) return null;
    return window.Capacitor.Plugins?.LocalNotifications || null;
  }

  function getAppPlugin() {
    if (!window.Capacitor) return null;
    return window.Capacitor.Plugins?.App || null;
  }

  function normalizeReminderMinutes(value) {
    const n = Number(value);
    return ALLOWED_MINUTES.includes(n) ? n : DEFAULT_MINUTES;
  }

  function reminderMinutesLabel(minutes) {
    return REMINDER_LABELS[normalizeReminderMinutes(minutes)] || REMINDER_LABELS[DEFAULT_MINUTES];
  }

  function notificationIdForAppointment(appointmentId) {
    let hash = 0;
    const str = String(appointmentId);
    for (let i = 0; i < str.length; i++) {
      hash = ((hash << 5) - hash + str.charCodeAt(i)) | 0;
    }
    const id = Math.abs(hash) % 2147483646;
    return id || 1;
  }

  function appointmentDateTime(apt) {
    if (!apt?.date || !apt?.time || !parseISODate(apt.date) || !isValidTime(apt.time)) return null;
    const [hh, mm] = apt.time.split(":").map(Number);
    const d = parseISODate(apt.date);
    d.setHours(hh, mm, 0, 0);
    return d;
  }

  function reminderFireTime(apt) {
    const dt = appointmentDateTime(apt);
    if (!dt) return null;
    const offset = normalizeReminderMinutes(apt.reminderMinutesBefore);
    return new Date(dt.getTime() - offset * 60 * 1000);
  }

  function buildNotificationBody(apt) {
    const when = apt.time ? `kl. ${apt.time}` : "";
    const place = apt.note ? ` — ${apt.note}` : "";
    return `${apt.title}${when ? ` ${when}` : ""}${place}`.trim();
  }

  async function ensureAndroidChannel() {
    if (!isNative() || channelReady) return;
    const LN = getLocalNotifications();
    if (!LN) return;
    try {
      await LN.createChannel({
        id: CHANNEL_ID,
        name: "Aftaler",
        description: "Påmindelser om dine aftaler",
        importance: 5,
        visibility: 1,
        vibration: true,
        sound: SOUND_NAME
      });
      channelReady = true;
    } catch (err) {
      console.warn("Kunne ikke oprette notifikationskanal:", err);
    }
  }

  async function checkPermission() {
    if (isNative()) {
      const LN = getLocalNotifications();
      if (!LN) return "unsupported";
      try {
        const result = await LN.checkPermissions();
        return result.display === "granted" ? "granted" : result.display === "denied" ? "denied" : "prompt";
      } catch {
        return "unsupported";
      }
    }
    if (!("Notification" in window)) return "unsupported";
    if (Notification.permission === "granted") return "granted";
    if (Notification.permission === "denied") return "denied";
    return "prompt";
  }

  async function requestPermission() {
    if (isNative()) {
      const LN = getLocalNotifications();
      if (!LN) return "unsupported";
      await ensureAndroidChannel();
      try {
        const result = await LN.requestPermissions();
        updatePermissionBanner();
        return result.display === "granted" ? "granted" : "denied";
      } catch {
        return "unsupported";
      }
    }
    if (!("Notification" in window)) return "unsupported";
    try {
      const result = await Notification.requestPermission();
      updatePermissionBanner();
      return result;
    } catch {
      return "unsupported";
    }
  }

  async function openAppSettings() {
    if (isNative()) {
      const App = getAppPlugin();
      if (App?.openSettings) {
        try {
          await App.openSettings();
          return true;
        } catch {
          return false;
        }
      }
    }
    return false;
  }

  async function handleBannerClick() {
    const status = await checkPermission();
    if (status === "granted") {
      updatePermissionBanner();
      return;
    }
    if (status === "prompt") {
      await requestPermission();
      return;
    }
    if (status === "denied") {
      const opened = await openAppSettings();
      if (!opened && !isNative()) {
        alert(
          "Notifikationer er blokeret i browseren.\n\n" +
            "Åbn browserens indstillinger for dette websted og tillad notifikationer."
        );
      }
    }
  }

  function showPermissionBanner() {
    const banner = document.querySelector("#notificationBanner");
    if (!banner) return;
    banner.hidden = false;
    banner.setAttribute("aria-hidden", "false");
  }

  function hidePermissionBanner() {
    const banner = document.querySelector("#notificationBanner");
    if (!banner) return;
    banner.hidden = true;
    banner.setAttribute("aria-hidden", "true");
  }

  async function updatePermissionBanner() {
    const status = await checkPermission();
    if (status === "granted" || status === "unsupported") {
      hidePermissionBanner();
    } else {
      showPermissionBanner();
    }
  }

  function loadFiredKeys() {
    try {
      const raw = localStorage.getItem(FIRED_KEY);
      return raw ? JSON.parse(raw) : [];
    } catch {
      return [];
    }
  }

  function markFired(key) {
    const fired = loadFiredKeys();
    if (!fired.includes(key)) {
      fired.push(key);
      localStorage.setItem(FIRED_KEY, JSON.stringify(fired.slice(-300)));
    }
  }

  function firedKeyFor(apt, fireTime) {
    return `${apt.id}@${fireTime.getTime()}`;
  }

  function showWebNotification(title, body) {
    if (!("Notification" in window) || Notification.permission !== "granted") return false;

    const options = {
      body,
      icon: "./icons/icon-192.png",
      badge: "./icons/icon-192.png",
      tag: "mor-kalender-reminder",
      renotify: true
    };
    if ("vibrate" in navigator) options.vibrate = [300, 120, 300];

    try {
      if ("serviceWorker" in navigator && navigator.serviceWorker.controller) {
        navigator.serviceWorker.ready
          .then(reg => reg.showNotification(title, options))
          .catch(() => new Notification(title, options));
      } else {
        new Notification(title, options);
      }
      return true;
    } catch (err) {
      console.warn("Web-notifikation fejlede:", err);
      return false;
    }
  }

  function checkWebDueReminders(appointments) {
    if (isNative()) return;
    if (!("Notification" in window) || Notification.permission !== "granted") return;

    const now = Date.now();
    const fired = loadFiredKeys();

    for (const apt of appointments) {
      const fire = reminderFireTime(apt);
      if (!fire || fire.getTime() > now) continue;
      const key = firedKeyFor(apt, fire);
      if (fired.includes(key)) continue;

      const ok = showWebNotification("Mor Kalender", buildNotificationBody(apt));
      if (ok) markFired(key);
    }
  }

  function startWebPolling(appointments) {
    if (isNative()) return;
    if (webPollTimer) clearInterval(webPollTimer);
    checkWebDueReminders(appointments);
    webPollTimer = setInterval(() => checkWebDueReminders(appointments), 30000);
  }

  async function scheduleAppointmentReminder(appointment) {
    if (!appointment?.date || !appointment?.time) return { ok: false, reason: "missing_datetime" };

    const fire = reminderFireTime(appointment);
    if (!fire || fire.getTime() <= Date.now()) {
      await cancelReminder(appointment.id);
      return { ok: false, reason: "past" };
    }

    const perm = await checkPermission();
    if (perm !== "granted") return { ok: false, reason: "no_permission" };

    if (isNative()) {
      const LN = getLocalNotifications();
      if (!LN) return { ok: false, reason: "unsupported" };

      await ensureAndroidChannel();
      const id = notificationIdForAppointment(appointment.id);

      try {
        await LN.cancel({ notifications: [{ id }] });
        await LN.schedule({
          notifications: [
            {
              id,
              title: "Mor Kalender",
              body: buildNotificationBody(appointment),
              schedule: { at: fire, allowWhileIdle: true },
              sound: SOUND_NAME,
              channelId: CHANNEL_ID,
              smallIcon: "ic_launcher_foreground",
              extra: { appointmentId: appointment.id }
            }
          ]
        });
        return { ok: true, platform: "android", at: fire.toISOString() };
      } catch (err) {
        console.warn("Kunne ikke planlægge påmindelse:", err);
        return { ok: false, reason: "schedule_error" };
      }
    }

    return { ok: true, platform: "web", at: fire.toISOString(), note: "web_poll" };
  }

  async function cancelReminder(appointmentId) {
    if (!appointmentId) return;

    if (isNative()) {
      const LN = getLocalNotifications();
      if (!LN) return;
      const id = notificationIdForAppointment(appointmentId);
      try {
        await LN.cancel({ notifications: [{ id }] });
      } catch (err) {
        console.warn("Kunne ikke annullere påmindelse:", err);
      }
    }
  }

  async function rescheduleAll(appointments) {
    if (!Array.isArray(appointments)) return;

    if (isNative()) {
      const LN = getLocalNotifications();
      if (LN) {
        try {
          const pending = await LN.getPending();
          const ids = (pending.notifications || []).map(n => ({ id: n.id }));
          if (ids.length) await LN.cancel({ notifications: ids });
        } catch {
          /* ignore */
        }
      }
    }

    const perm = await checkPermission();
    const results = [];

    for (const apt of appointments) {
      if (perm === "granted") {
        results.push(await scheduleAppointmentReminder(apt));
      }
    }

    if (!isNative()) startWebPolling(appointments);
    return results;
  }

  async function onAppointmentsSaved(appointments, deletedIds) {
    if (Array.isArray(deletedIds)) {
      for (const id of deletedIds) {
        await cancelReminder(id);
      }
    }
    await rescheduleAll(appointments);
  }

  async function init() {
    bindBanner();
    await ensureAndroidChannel();

    const askedKey = "mor_notif_asked_v1";
    const status = await checkPermission();
    if (status === "prompt" && !localStorage.getItem(askedKey)) {
      localStorage.setItem(askedKey, "1");
      await requestPermission();
    }

    updatePermissionBanner();

    document.addEventListener("visibilitychange", () => {
      if (document.visibilityState === "visible") {
        updatePermissionBanner();
        if (!isNative() && window.MOR_CONFIG) {
          checkWebDueReminders(loadAppointments());
        }
      }
    });

    if (!isNative()) {
      startWebPolling(typeof loadAppointments === "function" ? loadAppointments() : []);
    }
  }

  function bindBanner() {
    const banner = document.querySelector("#notificationBanner");
    if (!banner || banner.dataset.bound) return;
    banner.dataset.bound = "1";
    banner.addEventListener("click", () => handleBannerClick());
    banner.addEventListener("keydown", e => {
      if (e.key === "Enter" || e.key === " ") {
        e.preventDefault();
        handleBannerClick();
      }
    });
  }

  window.MOR_NOTIF = {
    isNative,
    checkPermission,
    requestPermission,
    openAppSettings,
    showPermissionBanner,
    hidePermissionBanner,
    updatePermissionBanner,
    scheduleAppointmentReminder,
    cancelReminder,
    rescheduleAll,
    onAppointmentsSaved,
    normalizeReminderMinutes,
    reminderMinutesLabel,
    init,
    ALLOWED_MINUTES,
    DEFAULT_MINUTES,
    REMINDER_LABELS
  };
})();
