/**
 * Mor Kalender — lokal konfig (committes IKKE med rigtige nøgler/PIN).
 * Se sync-config.example.js
 */
(function () {
  const base = window.MOR_CONFIG || {};
  window.MOR_CONFIG = Object.assign(base, {
    syncMode: "pc",
    pcServerUrl: "",
    pcServerPin: "",
    supabaseUrl: "",
    supabaseAnonKey: "",
    householdId: "mor-familie-PLACEHOLDER",
    adminPin: "1234",
    syncMetaKey: "mor_kalender_mini_v1_sync_meta"
  });
})();
