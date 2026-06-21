/**
 * EKSEMPEL — sikker at committe til git.
 * Kopiér til sync-config.js og udfyld lokalt (commit IKKE rigtige nøgler/PIN).
 *
 *   copy app\config\sync-config.example.js app\config\sync-config.js
 *
 * PC-server (anbefalet): sæt pcServerUrl + pcServerPin (Tailscale IP).
 * Supabase: valgfri legacy — lad felterne stå tomme for kun PC/offline.
 */
(function () {
  const base = window.MOR_CONFIG || {};
  window.MOR_CONFIG = Object.assign(base, {
    /**
     * "pc" | "supabase" | "none" — default: PC hvis URL sat, ellers Supabase hvis nøgler, ellers ingen sky.
     */
    syncMode: "pc",

    /** PC-server via Tailscale, fx http://100.x.y.z:8010 (ingen afsluttende /) */
    pcServerUrl: "",
    /** Samme PIN som MOR_ADMIN_PIN på PC — gem kun lokalt i sync-config.js */
    pcServerPin: "",

    /** Supabase (legacy, valgfri) */
    supabaseUrl: "",
    supabaseAnonKey: "",
    householdId: "mor-familie-PLACEHOLDER",

    /** Admin PIN til app admin.html (lokal) og PC-server */
    adminPin: "SET_YOUR_OWN_PIN",
    syncMetaKey: "mor_kalender_mini_v1_sync_meta"
  });
})();
