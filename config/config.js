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
  /** Fast ntfy-kanal — bruges til beskeder fra Jari til mor */
  ntfyTopic: "aiea-jari-til-mor-8842",
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
  ],
  // Faste afgifter pr. kWh inkl. 25% moms — 2025/2026 DK1 (Fyn/Langeland)
  // Opdatér med mors rigtige tal hvis du har en regning
  elTarif: {
    elafgift:      0.762,  // statens elafgift inkl. moms
    systemtarif:   0.054,  // Energinet inkl. moms
    nettarif_lav:  0.185,  // distribution, normaltime inkl. moms
    nettarif_peak: 0.555,  // distribution, myldretid (kl. 17-21) inkl. moms
    peakHours:     [17, 18, 19, 20]
  }
};
