/**
 * Mor Kalender Mini — konfiguration (ingen private data i repo).
 * Jari: sæt jariPhone til rigtigt nummer lokalt, fx "+4512345678"
 */
window.MOR_CONFIG = {
  appName: "Aiea",
  appShortName: "Aiea",
  contactName: "Jari",
  /** Tom streng = vis venlig besked. Sæt kun på Jaris enhed. */
  jariPhone: "",
  storageKey: "mor_kalender_mini_v1_appointments",
  settingsKeys: {
    largeText: "mor_kalender_large_text",
    theme: "mor_kalender_theme"
  },
  themes: {
    default: "dark",
    available: ["dark", "light", "contrast"]
  },
  themeColors: {
    dark: { bg: "#0a0a0f", theme: "#0a0a0f" },
    light: { bg: "#f0ecf8", theme: "#6c3fc5" },
    contrast: { bg: "#000000", theme: "#00ff88" }
  },
  weatherLocations: [
    { id: "langeland", name: "Langeland",  address: "Botoften 5, Langeland, Danmark" },
    { id: "nyborgvej", name: "Nyborgvej",  address: "Nyborgvej 166A, Svendborg, Danmark" }
  ]
};
