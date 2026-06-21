/**
 * Mor Kalender — direkte opkald på Android (ACTION_CALL), tel: fallback ellers.
 */
(function () {
  function isNative() {
    return typeof window.Capacitor !== "undefined" && window.Capacitor.isNativePlatform();
  }

  function getPhoneCallPlugin() {
    return window.Capacitor?.Plugins?.PhoneCall || null;
  }

  async function dialNumber(phone) {
    const normalized = String(phone || "").trim();
    if (!normalized) return { ok: false, reason: "empty" };

    if (!isNative()) {
      window.location.href = `tel:${normalized}`;
      return { ok: true, platform: "web" };
    }

    const plugin = getPhoneCallPlugin();
    if (!plugin) {
      window.location.href = `tel:${normalized}`;
      return { ok: true, platform: "tel_fallback" };
    }

    try {
      const result = await plugin.makeCall({ phoneNumber: normalized });
      if (result?.granted === false) {
        alert(
          "Opkaldstilladelse blev ikke givet.\n\nTryk OK — så åbner telefonen nummeret, og du kan trykke Ring."
        );
        window.location.href = `tel:${normalized}`;
        return { ok: true, platform: "tel_fallback", permissionDenied: true };
      }
      return { ok: true, platform: "android" };
    } catch (_err) {
      window.location.href = `tel:${normalized}`;
      return { ok: true, platform: "tel_fallback" };
    }
  }

  window.MOR_PHONE = { dialNumber, isNative };
})();
