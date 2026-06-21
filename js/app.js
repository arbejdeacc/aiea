const cfg = window.MOR_CONFIG;

const state = {
  route: "home",
  selectedDate: todayISO(),
  calendarMonth: new Date().getMonth(),
  calendarYear: new Date().getFullYear(),
  appointments: applyLegacyDemoCleanup(loadAppointments()),
  detailId: null,
  editId: null
};

const app = document.querySelector("#app");
const todayLine = document.querySelector("#todayLine");
const brandTitle = document.querySelector("#brandTitle");

const templates = {
  home: document.querySelector("#home-template"),
  vejr: document.querySelector("#vejr-template"),
  el:   document.querySelector("#el-template"),
  add: document.querySelector("#add-template"),
  calendar: document.querySelector("#calendar-template"),
  settings: document.querySelector("#settings-template"),
  detail: document.querySelector("#detail-template"),
  edit: document.querySelector("#edit-template"),
  help: document.querySelector("#help-template"),
  besked: document.querySelector("#besked-template"),
  "jari-send": document.querySelector("#jari-send-template")
};

document.querySelectorAll(".nav-btn").forEach(button => {
  button.addEventListener("click", () => go(button.dataset.route));
});

window.addEventListener("hashchange", () => {
  const route = parseRouteFromHash();
  if (templates[route]) {
    state.route = route;
    render();
  }
});

(function initMorApp() {
  try {
    applySettingsOnLoad();
    go(parseRouteFromHash());
    registerCloudRefreshListeners();
    bootstrapAppointmentsDeferred();
    if (window.MOR_NOTIF) {
      window.MOR_NOTIF.init().catch(err => console.warn("Notifikation init fejlede", err));
    }
  } catch (err) {
    console.error("Mor Kalender init fejlede", err);
    try {
      if (app && !app.childElementCount) go("home");
    } catch {
      /* ignore */
    }
  }
})();

function applyCloudMerge(merged) {
  const cleaned = applyLegacyDemoCleanup(merged);
  const changed =
    cleaned.length !== state.appointments.length ||
    JSON.stringify(cleaned) !== JSON.stringify(state.appointments);
  if (!changed) return;
  state.appointments = cleaned;
  if (window.MOR_NOTIF) window.MOR_NOTIF.rescheduleAll(cleaned);
  render();
}

function registerCloudRefreshListeners() {
  function pullCloudWhenVisible() {
    if (!window.MOR_SYNC || !window.MOR_SYNC.isConfigured()) return;
    refreshAppointmentsFromCloud()
      .then(applyCloudMerge)
      .catch(err => console.warn("Synk ved fokus fejlede", err));
  }

  window.addEventListener("online", pullCloudWhenVisible);
  document.addEventListener("visibilitychange", () => {
    if (document.visibilityState === "visible") pullCloudWhenVisible();
  });

  const App = window.Capacitor?.Plugins?.App;
  if (App?.addListener) {
    App.addListener("resume", () => pullCloudWhenVisible()).catch(() => {});
  }
}

function bootstrapAppointmentsDeferred() {
  const run = () => {
    refreshAppointmentsFromCloud()
      .then(applyCloudMerge)
      .catch(err => {
        console.warn("Opstartssynk fejlede", err);
        state.appointments = applyLegacyDemoCleanup(state.appointments);
        if (window.MOR_NOTIF) window.MOR_NOTIF.rescheduleAll(state.appointments);
      });
  };
  if (typeof requestAnimationFrame === "function") {
    requestAnimationFrame(() => setTimeout(run, 0));
  } else {
    setTimeout(run, 0);
  }
}

function parseRouteFromHash() {
  const hash = location.hash.replace("#", "") || "home";
  const base = hash.split("?")[0];
  return templates[base] ? base : "home";
}

function go(route, params = {}) {
  state.route = route;
  if (params.detailId !== undefined) state.detailId = params.detailId;
  if (params.editId !== undefined) state.editId = params.editId;
  if (params.date) state.selectedDate = params.date;
  location.hash = route;
  render();
}

function render() {
  updateNav();
  applyThemeAndText();
  if (brandTitle) brandTitle.textContent = cfg.appName;
  todayLine.textContent = formatLongDate(new Date());
  const template = templates[state.route] || templates.home;
  app.innerHTML = "";
  app.appendChild(template.content.cloneNode(true));

  switch (state.route) {
    case "home": renderHome(); break;
    case "vejr": renderVejr(); break;
    case "el":   renderEl();   break;
    case "add": renderAdd(); break;
    case "calendar": renderCalendar(); break;
    case "settings": renderSettings(); break;
    case "detail": renderDetail(); break;
    case "edit": renderEdit(); break;
    case "help": break;
    case "besked": renderBesked(); break;
    case "jari-send": renderJariSend(); break;
    default: break;
  }

  bindRouteButtons();
  if (window.MOR_NOTIF) window.MOR_NOTIF.updatePermissionBanner();
}

function bindRouteButtons() {
  app.querySelectorAll("[data-route]").forEach(el => {
    el.addEventListener("click", () => go(el.dataset.route));
  });
}

function updateNav() {
  const navRoute = ["detail", "edit", "help", "settings"].includes(state.route)
    ? null
    : state.route;
  document.querySelectorAll(".nav-btn").forEach(button => {
    button.classList.toggle("active", button.dataset.route === navRoute);
  });
}

function renderHome() {
  document.querySelector("#homeDate").textContent = formatLongDate(new Date(), true);
  renderAppointmentList("#todayAppointments", getAppointmentsForDate(todayISO()), { clickable: true });
  loadHomeMiniWeather();
  loadHomeElBadge();
}

function loadHomeMiniWeather() {
  var container = document.querySelector("#homeWeatherMini");
  if (!container || !window.MOR_WEATHER) return;

  window.MOR_WEATHER.getWeatherForAll()
    .then(function (results) {
      container.innerHTML = "";
      results.forEach(function (wx) {
        var card = document.createElement("div");
        card.className = "vejr-mini-card";
        card.setAttribute("role", "button");
        card.setAttribute("aria-label", wx.name + ": " + wx.temp + "° " + wx.text);
        card.tabIndex = 0;
        var openVejr = function () { go("vejr"); };
        card.addEventListener("click", openVejr);
        card.addEventListener("keydown", function (e) {
          if (e.key === "Enter" || e.key === " ") { e.preventDefault(); openVejr(); }
        });

        var icon = document.createElement("span");
        icon.className = "vejr-mini-icon";
        icon.setAttribute("aria-hidden", "true");
        icon.textContent = wx.icon;

        var info = document.createElement("div");
        info.style.minWidth = "0";

        var temp = document.createElement("div");
        temp.className = "vejr-mini-temp";
        temp.textContent = wx.temp + "°";

        var name = document.createElement("div");
        name.className = "vejr-mini-name";
        name.textContent = wx.name;

        var desc = document.createElement("div");
        desc.className = "vejr-mini-desc";
        desc.textContent = wx.text;

        info.append(temp, name, desc);
        card.append(icon, info);
        container.appendChild(card);
      });
    })
    .catch(function () {
      var errEl = document.createElement("div");
      errEl.className = "vejr-mini-error muted small";
      errEl.textContent = "Kan ikke hente vejr lige nu.";
      container.innerHTML = "";
      container.appendChild(errEl);
    });
}

function loadHomeElBadge() {
  var badge = document.querySelector("#homeElBadge");
  if (!badge || !window.MOR_WEATHER) return;

  window.MOR_WEATHER.fetchElPrices()
    .then(function (el) {
      var priceEl = document.querySelector("#homeElPrice");
      var ratingEl = document.querySelector("#homeElRating");
      if (priceEl) priceEl.textContent = formatKr(el.current) + "/kWh";
      if (ratingEl) {
        var labels = { billig: "Billig ✓", normal: "", dyr: "⚠ Dyr" };
        ratingEl.textContent = labels[el.rating] || "";
        ratingEl.className = "home-el-rating--" + el.rating;
      }
      badge.hidden = false;
      badge.setAttribute("role", "button");
      badge.tabIndex = 0;
      var openVejr = function () { go("vejr"); };
      badge.addEventListener("click", function () { go("el"); });
      badge.addEventListener("keydown", function (e) {
        if (e.key === "Enter" || e.key === " ") { e.preventDefault(); go("el"); }
      });
    })
    .catch(function () {
      badge.hidden = true;
    });
}

function renderVejr() {
  var locContainer = document.querySelector("#vejrLocations");
  var updatedEl    = document.querySelector("#vejrUpdated");
  if (!locContainer || !window.MOR_WEATHER) return;

  window.MOR_WEATHER.getWeatherForAll()
    .then(function (results) {
      locContainer.innerHTML = "";
      if (updatedEl && results.length) {
        var mins = Math.round((Date.now() - (results[0].fetchedAt || Date.now())) / 60000);
        updatedEl.textContent = mins < 2 ? "Opdateret nu" : "Opdateret for " + mins + " min. siden";
      }
      results.forEach(function (wx) {
        locContainer.appendChild(buildWeatherCard(wx));
      });
    })
    .catch(function () {
      locContainer.innerHTML = "";
      var errEl = document.createElement("div");
      errEl.className = "vejr-error";
      errEl.textContent = "Kan ikke hente vejr. Tjek internetforbindelsen.";
      locContainer.appendChild(errEl);
    });
}

function renderEl() {
  var content   = document.querySelector("#elPageContent");
  var updatedEl = document.querySelector("#elUpdated");
  if (!content || !window.MOR_WEATHER) return;

  var fetchTmr = window.MOR_WEATHER.fetchElPricesTomorrow
    ? window.MOR_WEATHER.fetchElPricesTomorrow()
    : Promise.resolve({ available: false });

  Promise.all([window.MOR_WEATHER.fetchElPrices(), fetchTmr])
    .then(function (res) {
      var today = res[0];
      var tmr   = res[1];

      if (updatedEl) {
        var mins = Math.round((Date.now() - (today.fetchedAt || Date.now())) / 60000);
        updatedEl.textContent = "DK1 · " + (mins < 2 ? "Opdateret nu" : "Opdateret for " + mins + " min siden");
      }

      content.innerHTML = "";
      content.appendChild(buildElHeroCard(today));
      content.appendChild(buildElFullChart(today, false));
      content.appendChild(buildElBestWindows(today));

      var nextEl = buildElNextCheap(today);
      if (nextEl) content.appendChild(nextEl);

      if (tmr && tmr.available !== false && tmr.hours && tmr.hours.length) {
        content.appendChild(buildElTomorrowSection(tmr));
      }
    })
    .catch(function () {
      content.innerHTML = "";
      var err = document.createElement("div");
      err.className = "vejr-error";
      err.textContent = "Kan ikke hente el-priser. Tjek internetforbindelsen.";
      content.appendChild(err);
    });
}

function buildElHeroCard(el) {
  var card = document.createElement("div");
  card.className = "el-hero-card";

  // Stor pris
  var priceRow = document.createElement("div");
  priceRow.className = "el-hero-price-row";

  var icon = document.createElement("span");
  icon.className = "el-hero-icon";
  icon.textContent = "⚡";

  var priceEl = document.createElement("div");
  priceEl.className = "el-hero-price";
  priceEl.textContent = formatKrNum(el.current);

  var unitEl = document.createElement("div");
  unitEl.className = "el-hero-unit";
  unitEl.innerHTML = "<span>" + formatKrUnit(el.current) + "</span><span class='muted small'>total inkl. moms</span>";

  priceRow.append(icon, priceEl, unitEl);

  // Rating badge
  var ratingLabels = { billig: "✓ Billig strøm nu", normal: "Normal pris nu", dyr: "⚠ Dyr strøm nu" };
  var badge = document.createElement("div");
  badge.className = "vejr-el-badge vejr-el-badge--" + el.rating;
  badge.textContent = ratingLabels[el.rating] || "Normal pris";

  // Spot-pris hint (viser at markedspris kan være gratis)
  if (el.currentSpot !== undefined) {
    var spotHint = document.createElement("div");
    spotHint.className = "el-spot-hint muted small";
    spotHint.textContent = formatSpotHint(el.currentSpot);
    card.append(priceRow, badge, spotHint);
  } else {
    card.append(priceRow, badge);
  }

  // Stats: laveste / snit / højeste (totalpris)
  var statsRow = document.createElement("div");
  statsRow.className = "el-hero-stats";

  function mkStat(lbl, val, cls) {
    var box = document.createElement("div");
    box.className = "el-stat-box";
    var l = document.createElement("div"); l.className = "el-stat-label"; l.textContent = lbl;
    var v = document.createElement("div"); v.className = "el-stat-value" + (cls ? " " + cls : ""); v.textContent = val;
    box.append(l, v);
    return box;
  }

  statsRow.append(
    mkStat("Laveste i dag", formatKr(el.min), "el-color-cheap"),
    mkStat("Snit i dag",    formatKr(el.avg), ""),
    mkStat("Højeste i dag", formatKr(el.max), "el-color-dyr")
  );

  card.appendChild(statsRow);
  return card;
}

function buildElFullChart(el, isTomorrow) {
  var section = document.createElement("div");
  section.className = "el-chart-section";

  var titleEl = document.createElement("div");
  titleEl.className = "el-chart-title";
  titleEl.textContent = isTomorrow ? "I morgen – time for time" : "I dag – time for time";
  section.appendChild(titleEl);

  var nowHour = isTomorrow ? -1 : new Date().getHours();
  var sorted  = el.hours.slice().sort(function (a, b) { return a.hour - b.hour; });
  var maxP    = Math.max.apply(null, sorted.map(function (h) { return h.price; }));

  var wrap = document.createElement("div");
  wrap.className = "el-chart-full-wrap";

  var barsRow = document.createElement("div");
  barsRow.className = "el-chart-bars-row";

  sorted.forEach(function (h) {
    var col = document.createElement("div");
    col.className = "el-bar-col";
    var bar = document.createElement("div");
    bar.className = "el-bar-full";
    bar.style.height = (maxP > 0 ? Math.max(5, Math.round((h.price / maxP) * 100)) : 10) + "%";
    if (h.hour === nowHour)              bar.classList.add("current");
    else if (h.price <= el.avg * 0.85)   bar.classList.add("cheap");
    else if (h.price >= el.avg * 1.3)    bar.classList.add("expensive");
    col.appendChild(bar);
    barsRow.appendChild(col);
  });

  var labelsRow = document.createElement("div");
  labelsRow.className = "el-chart-labels-row";
  for (var i = 0; i < 24; i++) {
    var lbl = document.createElement("div");
    lbl.className = "el-chart-hour-lbl";
    if (i === 0 || i === 6 || i === 12 || i === 18 || i === 23) lbl.textContent = padHour(i);
    labelsRow.appendChild(lbl);
  }

  var legend = document.createElement("div");
  legend.className = "el-chart-legend";
  legend.innerHTML =
    '<span class="el-legend-dot cheap"></span> Billig &nbsp;' +
    '<span class="el-legend-dot normal"></span> Normal &nbsp;' +
    '<span class="el-legend-dot expensive"></span> Dyr' +
    (isTomorrow ? '' : ' &nbsp;<span class="el-legend-dot current"></span> Nu');

  wrap.append(barsRow, labelsRow, legend);
  section.appendChild(wrap);
  return section;
}

function getBestWindows(hours, avg) {
  var sorted = hours.slice().sort(function (a, b) { return a.hour - b.hour; });
  var windows = [];
  var i = 0;
  while (i < sorted.length) {
    if (sorted[i].price <= avg * 0.88) {
      var start = i;
      var chunk = [];
      while (i < sorted.length && sorted[i].price <= avg * 0.88) { chunk.push(sorted[i]); i++; }
      var wAvg = chunk.reduce(function (s, h) { return s + h.price; }, 0) / chunk.length;
      windows.push({ startHour: chunk[0].hour, endHour: chunk[chunk.length - 1].hour, length: chunk.length, avg: wAvg });
    } else { i++; }
  }
  windows.sort(function (a, b) { return a.avg - b.avg; });
  return windows.slice(0, 3);
}

function buildElBestWindows(el) {
  var section = document.createElement("div");
  section.className = "el-section";

  var row = document.createElement("div");
  row.className = "section-title-row";
  var h3 = document.createElement("h3");
  h3.textContent = "🧺 Bedste tidspunkter";
  row.appendChild(h3);
  section.appendChild(row);

  var sub = document.createElement("p");
  sub.className = "muted small";
  sub.style.marginBottom = "12px";
  sub.textContent = "Billigst at køre vaskemaskine, opvasker eller lade telefon:";
  section.appendChild(sub);

  var windows = getBestWindows(el.hours, el.avg);
  var nowHour = new Date().getHours();

  if (!windows.length) {
    var nope = document.createElement("p");
    nope.className = "muted small";
    nope.textContent = "Ingen særligt billige perioder i dag.";
    section.appendChild(nope);
    return section;
  }

  var list = document.createElement("div");
  list.className = "el-windows-list";

  windows.forEach(function (w, idx) {
    var card = document.createElement("div");
    card.className = "el-window-card";
    var isNow  = w.startHour <= nowHour && w.endHour >= nowHour;
    var isPast = w.endHour < nowHour;
    if (isNow)  card.classList.add("el-window-now");
    if (isPast) card.classList.add("el-window-past");

    var medals = ["🥇", "🥈", "🥉"];
    var timeStr = "kl. " + padHour(w.startHour) + ":00";
    if (w.length > 1) timeStr += " – " + padHour(w.endHour + 1) + ":00";

    var left = document.createElement("div");
    var timeEl = document.createElement("div");
    timeEl.className = "el-window-time";
    timeEl.textContent = (medals[idx] || "") + " " + timeStr;
    var durEl = document.createElement("div");
    durEl.className = "muted small";
    durEl.textContent = (w.length === 1 ? "1 time" : w.length + " timer") +
      (isNow ? " · nu" : isPast ? " · forbi" : "");
    left.append(timeEl, durEl);

    var right = document.createElement("div");
    right.className = "el-window-price-big";
    right.textContent = formatKr(w.avg);

    card.append(left, right);
    list.appendChild(card);
  });

  section.appendChild(list);
  return section;
}

function buildElNextCheap(el) {
  var nowHour = new Date().getHours();
  var next = el.hours.slice().sort(function (a, b) { return a.hour - b.hour; })
    .find(function (h) { return h.hour > nowHour && h.price <= el.avg * 0.88; });
  if (!next) return null;

  var div = document.createElement("div");
  div.className = "el-next-cheap";
  var hoursUntil = next.hour - nowHour;
  div.innerHTML =
    '<span class="el-next-icon">⏰</span>' +
    '<div><div class="el-next-title">Næste billige strøm</div>' +
    '<div class="muted small">kl. ' + padHour(next.hour) + ':00 · om ' +
    hoursUntil + (hoursUntil === 1 ? " time" : " timer") + ' · ' +
    formatKr(next.price) + '/kWh</div></div>';
  return div;
}

function buildElTomorrowSection(tmr) {
  var section = document.createElement("div");
  section.className = "el-section el-tomorrow-section";

  var row = document.createElement("div");
  row.className = "section-title-row";
  var h3 = document.createElement("h3");
  h3.textContent = "I morgen";
  row.appendChild(h3);
  section.appendChild(row);

  var statsRow = document.createElement("div");
  statsRow.className = "el-hero-stats";
  statsRow.style.marginBottom = "12px";

  function mkStat(lbl, val, cls) {
    var box = document.createElement("div");
    box.className = "el-stat-box";
    var l = document.createElement("div"); l.className = "el-stat-label"; l.textContent = lbl;
    var v = document.createElement("div"); v.className = "el-stat-value" + (cls ? " " + cls : ""); v.textContent = val;
    box.append(l, v); return box;
  }
  statsRow.append(
    mkStat("Laveste", formatKr(tmr.min), "el-color-cheap"),
    mkStat("Snit",    formatKr(tmr.avg), ""),
    mkStat("Højeste", formatKr(tmr.max), "el-color-dyr")
  );
  section.appendChild(statsRow);
  section.appendChild(buildElFullChart(tmr, true));

  var cheapEntry = tmr.hours.reduce(function (a, b) { return a.price < b.price ? a : b; });
  var hint = document.createElement("p");
  hint.className = "muted small";
  hint.style.marginTop = "8px";
  hint.textContent = "⚡ Billigst i morgen: kl. " + padHour(tmr.cheapestHour) + ":00 · " + formatKr(cheapEntry.price) + "/kWh";
  section.appendChild(hint);
  return section;
}

function padHour(h) { return String(h).padStart(2, "0"); }

function formatKr(price) {
  if (price <= 0) return "0 øre";
  if (price >= 1.0) {
    return price.toLocaleString("da-DK", { minimumFractionDigits: 2, maximumFractionDigits: 2 }) + " kr";
  }
  return Math.round(price * 100) + " øre";
}

function formatKrNum(price) {
  if (price >= 1.0) return price.toLocaleString("da-DK", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  return Math.round(price * 100) + "";
}

function formatKrUnit(price) {
  return price >= 1.0 ? "kr/kWh" : "øre/kWh";
}

function formatSpotHint(spot) {
  if (spot <= 0.001) return "☀️ Markedspris: gratis nu (sol-strøm)";
  if (spot < 0.10)  return "☀️ Markedspris: " + formatKr(spot) + "/kWh";
  return "Markedspris: " + formatKr(spot) + "/kWh";
}

function buildWeatherCard(wx) {
  var card = document.createElement("div");
  card.className = "vejr-location-card";

  var header = document.createElement("div");
  header.className = "vejr-card-header";

  var icon = document.createElement("span");
  icon.className = "vejr-big-icon";
  icon.setAttribute("aria-hidden", "true");
  icon.textContent = wx.icon;

  var hdrText = document.createElement("div");
  hdrText.className = "vejr-card-header-text";

  var nameEl = document.createElement("div");
  nameEl.className = "vejr-location-name";
  nameEl.textContent = wx.name;

  var addrEl = document.createElement("div");
  addrEl.className = "vejr-location-addr";
  addrEl.textContent = wx.address;

  hdrText.append(nameEl, addrEl);
  header.append(icon, hdrText);

  var tempRow = document.createElement("div");
  tempRow.className = "vejr-temp-row";

  var tempEl = document.createElement("div");
  tempEl.className = "vejr-big-temp";
  tempEl.textContent = wx.temp + "°C";

  var feelsEl = document.createElement("div");
  feelsEl.className = "vejr-feels muted small";
  feelsEl.textContent = "Føles som " + wx.feels + "°";

  tempRow.append(tempEl, feelsEl);

  var descEl = document.createElement("div");
  descEl.className = "vejr-desc";
  descEl.textContent = wx.text;

  var windEl = document.createElement("div");
  windEl.className = "vejr-wind muted small";
  windEl.textContent = "Vind: " + wx.wind + " m/s";

  var todayRow = document.createElement("div");
  todayRow.className = "vejr-day-row";
  var todayLbl = document.createElement("span");
  todayLbl.className = "vejr-day-label";
  todayLbl.textContent = "I dag:";
  var todayVal = document.createElement("span");
  todayVal.textContent = wx.today.min + "° – " + wx.today.max + "° · " + wx.today.rain + " mm regn";
  todayRow.append(todayLbl, todayVal);

  var tmrRow = document.createElement("div");
  tmrRow.className = "vejr-day-row";
  var tmrLbl = document.createElement("span");
  tmrLbl.className = "vejr-day-label";
  tmrLbl.textContent = "I morgen:";
  var tmrVal = document.createElement("span");
  tmrVal.textContent = wx.tomorrow.icon + " " + wx.tomorrow.min + "° – " + wx.tomorrow.max + "° · " + wx.tomorrow.text;
  tmrRow.append(tmrLbl, tmrVal);

  card.append(header, tempRow, descEl, windEl, todayRow, tmrRow);
  return card;
}

function buildElCard(el) {
  var card = document.createElement("div");
  card.className = "vejr-el-card";

  var priceRow = document.createElement("div");
  priceRow.className = "vejr-el-price-row";

  var priceEl = document.createElement("div");
  priceEl.className = "vejr-el-price";
  priceEl.textContent = el.current.toFixed(2);

  var unitEl = document.createElement("div");
  unitEl.className = "vejr-el-unit muted small";
  unitEl.textContent = "kr/kWh inkl. moms";

  priceRow.append(priceEl, unitEl);

  var badge = document.createElement("div");
  var ratingLabels = { billig: "✓ Billig strøm nu", normal: "Normal pris", dyr: "⚠ Dyr strøm nu" };
  badge.className = "vejr-el-badge vejr-el-badge--" + el.rating;
  badge.textContent = ratingLabels[el.rating] || "Normal pris";

  var stats = document.createElement("div");
  stats.className = "vejr-el-stats";

  function statLine(text) {
    var s = document.createElement("span");
    s.textContent = text;
    return s;
  }

  var cheapHour = el.cheapestHour;
  var nowHour   = new Date().getHours();
  var cheapMsg  = cheapHour === nowHour
    ? "Nu er det billigst i dag!"
    : "Billigst kl. " + cheapHour + ":00";

  stats.append(
    statLine("Snit i dag: " + el.avg.toFixed(2) + " kr/kWh"),
    statLine("Laveste: " + el.min.toFixed(2) + " · Højeste: " + el.max.toFixed(2)),
    statLine(cheapMsg)
  );

  var chartLbl = document.createElement("div");
  chartLbl.className = "vejr-el-chart-label";
  chartLbl.textContent = "Timepris i dag (lys søjle = nu)";

  var bars = document.createElement("div");
  bars.className = "el-bar-chart";
  bars.setAttribute("aria-hidden", "true");
  bars.setAttribute("role", "presentation");

  if (el.hours && el.hours.length) {
    var maxP = Math.max.apply(null, el.hours.map(function (h) { return h.price; }));
    el.hours.forEach(function (h) {
      var bar = document.createElement("div");
      var heightPct = maxP > 0 ? Math.max(4, Math.round((h.price / maxP) * 100)) : 10;
      bar.style.height = heightPct + "%";
      bar.className = "el-bar";
      if (h.hour === nowHour)           bar.classList.add("current");
      else if (h.price <= el.avg * 0.85) bar.classList.add("cheap");
      else if (h.price >= el.avg * 1.3)  bar.classList.add("expensive");
      bars.appendChild(bar);
    });
  }

  card.append(priceRow, badge, stats, chartLbl, bars);
  return card;
}

function renderAdd() {
  const form = document.querySelector("#appointmentForm");
  const formCard = form.closest(".form-card") || form;
  const dateInput = document.querySelector("#dateInput");
  const timeInput = document.querySelector("#timeInput");
  dateInput.value = state.selectedDate || todayISO();
  if (!timeInput.value) timeInput.value = "10:00";

  form.addEventListener("submit", event => {
    event.preventDefault();
    clearFormError(formCard);

    const title = document.querySelector("#titleInput").value.trim();
    const date = document.querySelector("#dateInput").value;
    const time = document.querySelector("#timeInput").value;
    const note = document.querySelector("#noteInput").value.trim();
    const reminder = "";
    const reminderMinutesBefore = 30;

    if (!title) {
      showFormError(formCard, "Skriv hvad du skal huskes på.");
      document.querySelector("#titleInput").focus();
      return;
    }
    if (!date || !parseISODate(date)) {
      showFormError(formCard, "Vælg en gyldig dato.");
      dateInput.focus();
      return;
    }
    if (!time || !isValidTime(time)) {
      showFormError(formCard, "Vælg et gyldigt klokkeslæt.");
      timeInput.focus();
      return;
    }

    const appointment = {
      id: newAppointmentId(),
      title,
      date,
      time,
      note,
      reminder,
      reminderMinutesBefore
    };

    state.appointments.push(appointment);
    if (saveAppointments(state.appointments)) {
      state.selectedDate = appointment.date;
      go("home");
    }
  });
}

function renderEdit() {
  const apt = state.appointments.find(a => a.id === state.editId);
  if (!apt) {
    alert("Aftalen findes ikke længere.");
    go("home");
    return;
  }

  const form = document.querySelector("#editAppointmentForm");
  const formCard = form.closest(".form-card") || form;
  document.querySelector("#editTitleInput").value = apt.title;
  document.querySelector("#editDateInput").value = apt.date;
  document.querySelector("#editTimeInput").value = apt.time;
  document.querySelector("#editNoteInput").value = apt.note || "";

  form.addEventListener("submit", event => {
    event.preventDefault();
    clearFormError(formCard);

    const title = document.querySelector("#editTitleInput").value.trim();
    const date = document.querySelector("#editDateInput").value;
    const time = document.querySelector("#editTimeInput").value;
    const note = document.querySelector("#editNoteInput").value.trim();
    const reminder = apt.reminder || "";
    const reminderMinutesBefore = apt.reminderMinutesBefore ?? 30;

    if (!title) {
      showFormError(formCard, "Skriv hvad du skal.");
      return;
    }
    if (!date || !parseISODate(date)) {
      showFormError(formCard, "Vælg en gyldig dato.");
      return;
    }
    if (!time || !isValidTime(time)) {
      showFormError(formCard, "Vælg et gyldigt klokkeslæt.");
      return;
    }

    apt.title = title;
    apt.date = date;
    apt.time = time;
    apt.note = note;
    apt.reminder = reminder;
    apt.reminderMinutesBefore = reminderMinutesBefore;

    if (saveAppointments(state.appointments)) {
      go("detail", { detailId: apt.id });
    }
  });

  document.querySelector("#editCancelButton")?.addEventListener("click", () => {
    go("detail", { detailId: apt.id });
  });
}

function renderDetail() {
  const apt = state.appointments.find(a => a.id === state.detailId);
  if (!apt) {
    alert("Aftalen findes ikke.");
    go("home");
    return;
  }

  document.querySelector("#detailTitle").textContent = apt.title;
  document.querySelector("#detailDate").textContent = formatLongDate(parseISODate(apt.date), true);
  document.querySelector("#detailTime").textContent = apt.time;
  const noteEl = document.querySelector("#detailNote");
  const reminderEl = document.querySelector("#detailReminder");
  const notifyEl = document.querySelector("#detailNotifyReminder");

  if (apt.note) {
    noteEl.textContent = apt.note;
    noteEl.closest(".detail-block").hidden = false;
  } else {
    noteEl.closest(".detail-block").hidden = true;
  }

  if (notifyEl) {
    const label = window.MOR_NOTIF
      ? window.MOR_NOTIF.reminderMinutesLabel(apt.reminderMinutesBefore)
      : "30 minutter før";
    notifyEl.textContent = label;
    notifyEl.closest(".detail-block").hidden = false;
  }

  if (apt.reminder) {
    reminderEl.textContent = apt.reminder;
    reminderEl.closest(".detail-block").hidden = false;
  } else {
    reminderEl.closest(".detail-block").hidden = true;
  }

  document.querySelector("#detailEditButton").addEventListener("click", () => {
    go("edit", { editId: apt.id });
  });

  document.querySelector("#detailDeleteButton").addEventListener("click", () => {
    if (confirm(`Vil du slette "${apt.title}"?`)) {
      const deletedId = apt.id;
      state.appointments = state.appointments.filter(item => item.id !== deletedId);
      saveAppointments(state.appointments, { deletedIds: [deletedId] });
      go("home");
    }
  });
}

function renderCalendar() {
  const monthTitle = document.querySelector("#monthTitle");
  const grid = document.querySelector("#calendarGrid");
  const date = new Date(state.calendarYear, state.calendarMonth, 1);
  monthTitle.textContent = date.toLocaleDateString("da-DK", { month: "long", year: "numeric" });

  const prevBtn = document.querySelector("#prevMonth");
  const nextBtn = document.querySelector("#nextMonth");
  if (!prevBtn.dataset.bound) {
    prevBtn.dataset.bound = "1";
    prevBtn.addEventListener("click", () => {
      state.calendarMonth--;
      if (state.calendarMonth < 0) {
        state.calendarMonth = 11;
        state.calendarYear--;
      }
      render();
    });
    nextBtn.addEventListener("click", () => {
      state.calendarMonth++;
      if (state.calendarMonth > 11) {
        state.calendarMonth = 0;
        state.calendarYear++;
      }
      render();
    });
  }

  grid.innerHTML = "";
  const cells = buildCalendarCells(state.calendarYear, state.calendarMonth);
  const datesWithAppointments = new Set(
    state.appointments.map(a => a.date).filter(d => parseISODate(d))
  );

  cells.forEach(cell => {
    const button = document.createElement("button");
    button.type = "button";
    button.className = "day-cell";
    if (!cell.currentMonth) button.classList.add("dim");
    if (cell.iso === todayISO()) button.classList.add("today");
    if (cell.iso === state.selectedDate) button.classList.add("selected");
    button.setAttribute("aria-label", `Dag ${cell.day}`);
    button.textContent = cell.day;

    if (datesWithAppointments.has(cell.iso)) {
      button.classList.add("has-appointment");
      const dot = document.createElement("span");
      dot.className = "dot";
      dot.setAttribute("aria-hidden", "true");
      button.appendChild(dot);
    }

    button.addEventListener("click", () => {
      state.selectedDate = cell.iso;
      grid.querySelectorAll(".day-cell.selected").forEach(el => el.classList.remove("selected"));
      button.classList.add("selected");
      renderSelectedDay();
    });
    grid.appendChild(button);
  });

  renderSelectedDay();
}

function renderSelectedDay() {
  const title = document.querySelector("#selectedDayTitle");
  const parsed = parseISODate(state.selectedDate);
  title.textContent = parsed
    ? formatLongDate(parsed, true)
    : "Vælg en dato";
  renderAppointmentList("#selectedDayList", getAppointmentsForDate(state.selectedDate), { clickable: true });
}

function renderSettings() {
  const largeToggle = document.querySelector("#largeTextToggle");
  const themeSelect = document.querySelector("#themeSelect");

  largeToggle.checked = loadSetting(cfg.settingsKeys.largeText, "0") === "1";
  themeSelect.value = loadSetting(cfg.settingsKeys.theme, cfg.themes.default);
  if (!cfg.themes.available.includes(themeSelect.value)) {
    themeSelect.value = cfg.themes.default;
  }

  largeToggle.addEventListener("change", () => {
    saveSetting(cfg.settingsKeys.largeText, largeToggle.checked ? "1" : "0");
    applyThemeAndText();
  });

  themeSelect.addEventListener("change", () => {
    saveSetting(cfg.settingsKeys.theme, themeSelect.value);
    applyThemeAndText();
  });

  document.querySelector("#exportButton").addEventListener("click", () => {
    const data = JSON.stringify(state.appointments, null, 2);
    const blob = new Blob([data], { type: "application/json" });
    const link = document.createElement("a");
    link.href = URL.createObjectURL(blob);
    link.download = "mor-kalender-aftaler.json";
    link.click();
    URL.revokeObjectURL(link.href);
  });

  document.querySelector("#importButton").addEventListener("click", () => {
    document.querySelector("#importFileInput").click();
  });

  document.querySelector("#importFileInput").addEventListener("change", event => {
    const file = event.target.files?.[0];
    event.target.value = "";
    if (!file) return;

    const reader = new FileReader();
    reader.onload = () => {
      try {
        const data = JSON.parse(reader.result);
        const result = validateImportData(data);
        if (!result.ok) {
          alert(result.message);
          return;
        }
        if (!confirm(`Importer ${result.appointments.length} aftale(r)? Dette erstatter dine nuværende aftaler.`)) {
          return;
        }
        state.appointments = result.appointments;
        if (saveAppointments(state.appointments)) {
          alert("Aftaler er importeret.");
          go("home");
        }
      } catch {
        alert("Filen kunne ikke læses. Tjek at det er en gyldig JSON-fil.");
      }
    };
    reader.onerror = () => alert("Kunne ikke læse filen.");
    reader.readAsText(file);
  });

  document.querySelector("#clearButton").addEventListener("click", () => {
    if (confirm("Vil du slette alle aftaler i denne browser?")) {
      state.appointments = [];
      saveAppointments(state.appointments, { prune: true });
      go("home");
    }
  });

  document.querySelector("#helpLinkButton")?.addEventListener("click", () => go("help"));

  const notifHint = document.querySelector("#notificationStatusHint");
  if (notifHint && window.MOR_NOTIF) {
    window.MOR_NOTIF.checkPermission().then(status => {
      if (status === "granted") {
        notifHint.textContent = isCapacitorNative()
          ? "Notifikationer er slået til på denne telefon."
          : "Notifikationer er tilladt i browseren (begrænset i baggrunden).";
      } else if (status === "denied") {
        notifHint.textContent = "Notifikationer er slået fra. Tryk på banneret øverst for at slå dem til.";
      } else if (status === "unsupported") {
        notifHint.textContent = "Denne enhed understøtter ikke notifikationer.";
      } else {
        notifHint.textContent = "Tryk på banneret øverst for at tillade påmindelser.";
      }
    });
  }
}

function renderAppointmentList(selector, appointments, options = {}) {
  const container = document.querySelector(selector);
  if (!container) return;
  container.innerHTML = "";

  if (!appointments.length) {
    const empty = document.createElement("div");
    empty.className = "empty";
    empty.innerHTML = "Ingen aftaler her endnu.<br>Tryk på <strong>Tilføj aftale</strong>.";
    container.appendChild(empty);
    return;
  }

  appointments
    .slice()
    .sort((a, b) => a.time.localeCompare(b.time))
    .forEach((appointment, index) => {
      const card = document.createElement("article");
      card.className = `appointment-card ${index % 3 === 1 ? "blue" : index % 3 === 2 ? "teal" : ""}`;

      const time = document.createElement("div");
      time.className = "time-badge";
      time.textContent = appointment.time;

      const content = document.createElement("div");
      const title = document.createElement("div");
      title.className = "appointment-title";
      title.textContent = appointment.title;
      const note = document.createElement("div");
      note.className = "appointment-note";
      const sub = appointment.note || appointment.reminder || "";
      note.textContent = sub || formatLongDate(parseISODate(appointment.date));
      content.append(title, note);

      if (options.clickable) {
        card.classList.add("clickable");
        card.setAttribute("role", "button");
        card.tabIndex = 0;
        const open = () => go("detail", { detailId: appointment.id });
        card.addEventListener("click", open);
        card.addEventListener("keydown", e => {
          if (e.key === "Enter" || e.key === " ") {
            e.preventDefault();
            open();
          }
        });
      } else {
        const deleteButton = document.createElement("button");
        deleteButton.type = "button";
        deleteButton.className = "delete-mini";
        deleteButton.textContent = "×";
        deleteButton.title = "Slet aftale";
        deleteButton.addEventListener("click", e => {
          e.stopPropagation();
          if (confirm(`Slet aftalen "${appointment.title}"?`)) {
            const deletedId = appointment.id;
            state.appointments = state.appointments.filter(item => item.id !== deletedId);
            saveAppointments(state.appointments, { deletedIds: [deletedId] });
            render();
          }
        });
        card.append(time, content, deleteButton);
        container.appendChild(card);
        return;
      }

      card.append(time, content);
      container.appendChild(card);
    });
}

function getAppointmentsForDate(isoDate) {
  if (!isoDate || !parseISODate(isoDate)) return [];
  return state.appointments.filter(item => item.date === isoDate);
}

function isCapacitorNative() {
  return typeof window.Capacitor !== "undefined" && window.Capacitor.isNativePlatform();
}

function applySettingsOnLoad() {
  applyThemeAndText();
  if ("serviceWorker" in navigator && !isCapacitorNative()) {
    navigator.serviceWorker.register("./sw.js").catch(() => {});
    navigator.serviceWorker.addEventListener("controllerchange", () => {
      window.location.reload();
    });
  }
}

function applyThemeAndText() {
  const theme = loadSetting(cfg.settingsKeys.theme, cfg.themes.default);
  const large = loadSetting(cfg.settingsKeys.largeText, "0") === "1";
  document.documentElement.dataset.theme = cfg.themes.available.includes(theme) ? theme : "dark";
  document.documentElement.classList.toggle("large-text", large);
  const colors = cfg.themeColors[document.documentElement.dataset.theme] || cfg.themeColors.dark;
  const meta = document.querySelector('meta[name="theme-color"]');
  if (meta) meta.setAttribute("content", colors.theme);
}

function ntfyGetTopic() {
  var t = localStorage.getItem("aiea_ntfy_topic");
  if (!t) {
    t = "aiea-" + Math.random().toString(36).substring(2, 10);
    localStorage.setItem("aiea_ntfy_topic", t);
  }
  return t;
}

function ntfyPlaySound() {
  try {
    var ctx = new (window.AudioContext || window.webkitAudioContext)();
    [[587, 0], [784, 0.18], [988, 0.36], [784, 0.56], [988, 0.74]].forEach(function(n) {
      var osc = ctx.createOscillator();
      var gain = ctx.createGain();
      osc.connect(gain);
      gain.connect(ctx.destination);
      osc.type = "sine";
      osc.frequency.value = n[0];
      gain.gain.setValueAtTime(0.35, ctx.currentTime + n[1]);
      gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + n[1] + 0.28);
      osc.start(ctx.currentTime + n[1]);
      osc.stop(ctx.currentTime + n[1] + 0.30);
    });
  } catch (e) {}
}

function ntfyFormatTime(unixSec) {
  var d = new Date(unixSec * 1000);
  return d.toLocaleDateString("da-DK", { day: "numeric", month: "long" }) +
    " kl. " + d.toLocaleTimeString("da-DK", { hour: "2-digit", minute: "2-digit" });
}

function renderBesked() {
  var list = document.querySelector("#beskedList");
  var statusEl = document.querySelector("#beskedStatus");
  var topic = localStorage.getItem("aiea_ntfy_jari_topic") || "";

  if (!topic) {
    if (statusEl) statusEl.textContent = "";
    if (list) {
      list.innerHTML = "";
      var setupCard = document.createElement("div");
      setupCard.style.cssText = "background:var(--card-bg,#1a1a2a);border-radius:12px;padding:18px 16px";
      setupCard.innerHTML = '<p style="margin:0 0 10px;font-weight:500">Opsætning</p>' +
        '<p style="margin:0 0 12px;font-size:14px;opacity:0.7">Spørg Jari om hans kanal-navn og skriv det herunder. Det gøres kun én gang.</p>';
      var inp = document.createElement("input");
      inp.placeholder = "Kanal-navn fra Jari";
      inp.style.cssText = "width:100%;box-sizing:border-box;margin-bottom:10px";
      var btn = document.createElement("button");
      btn.className = "primary-button";
      btn.textContent = "Gem kanal-navn";
      btn.type = "button";
      btn.addEventListener("click", function() {
        var val = inp.value.trim();
        if (!val) return;
        localStorage.setItem("aiea_ntfy_jari_topic", val);
        renderBesked();
      });
      setupCard.appendChild(inp);
      setupCard.appendChild(btn);
      list.appendChild(setupCard);
    }
    return;
  }

  var stored = [];
  try { stored = JSON.parse(localStorage.getItem("aiea_ntfy_messages") || "[]"); } catch (e) {}

  if (list && stored.length > 0) renderBeskedList(list, stored);

  var since = localStorage.getItem("aiea_ntfy_last") || "0";
  fetch("https://ntfy.sh/" + topic + "/json?poll=1&since=" + since, { signal: AbortSignal.timeout ? AbortSignal.timeout(8000) : undefined })
    .then(function(r) { return r.text(); })
    .then(function(text) {
      var newMsgs = text.trim().split("\n").filter(function(l) { return l.trim(); }).map(function(l) {
        try { return JSON.parse(l); } catch (e) { return null; }
      }).filter(function(m) { return m && m.event === "message"; });

      if (newMsgs.length > 0) {
        var latest = newMsgs[newMsgs.length - 1];
        localStorage.setItem("aiea_ntfy_last", String(latest.time));
        newMsgs.forEach(function(m) {
          stored.push({ time: m.time, text: m.message || m.title || "" });
        });
        stored = stored.slice(-30);
        localStorage.setItem("aiea_ntfy_messages", JSON.stringify(stored));
        ntfyPlaySound();
        if (statusEl) statusEl.textContent = newMsgs.length + " ny besked(er)!";
      } else {
        if (statusEl) statusEl.textContent = "Ingen nye beskeder.";
      }
      if (list) renderBeskedList(list, stored);
    })
    .catch(function() {
      if (statusEl) statusEl.textContent = "Offline — viser gemte beskeder.";
      if (list) renderBeskedList(list, stored);
    });
}

function renderBeskedList(list, messages) {
  list.innerHTML = "";
  if (!messages || messages.length === 0) {
    var empty = document.createElement("p");
    empty.className = "muted small";
    empty.style.cssText = "text-align:center;padding:32px 16px";
    empty.textContent = "Ingen beskeder endnu. Vent på Jari.";
    list.appendChild(empty);
    return;
  }
  var sorted = messages.slice().sort(function(a, b) { return b.time - a.time; });
  sorted.forEach(function(m) {
    var card = document.createElement("article");
    card.style.cssText = "background:var(--card-bg,#1a1a2a);border-radius:10px;padding:12px 14px;margin-bottom:10px";
    var timeEl = document.createElement("div");
    timeEl.className = "muted small";
    timeEl.style.marginBottom = "4px";
    timeEl.textContent = ntfyFormatTime(m.time);
    var textEl = document.createElement("div");
    textEl.style.lineHeight = "1.5";
    textEl.textContent = m.text;
    card.appendChild(timeEl);
    card.appendChild(textEl);
    list.appendChild(card);
  });
}

function renderJariSend() {
  var pinSection = document.querySelector("#jariPinSection");
  var sendSection = document.querySelector("#jariSendSection");
  var pinInput = document.querySelector("#jariPinInput");
  var pinBtn = document.querySelector("#jariPinBtn");
  var msgInput = document.querySelector("#jariMsgInput");
  var sendBtn = document.querySelector("#jariSendBtn");
  var statusEl = document.querySelector("#jariSendStatus");
  var topicDisplay = document.querySelector("#jariTopicDisplay");
  var copyBtn = document.querySelector("#jariCopyTopicBtn");
  var newTopicBtn = document.querySelector("#jariNewTopicBtn");

  var savedPin = localStorage.getItem("aiea_jari_pin") || "1234";
  var topic = ntfyGetTopic();

  if (pinBtn) {
    pinBtn.addEventListener("click", function() {
      if (pinInput && pinInput.value === savedPin) {
        if (pinSection) pinSection.hidden = true;
        if (sendSection) sendSection.hidden = false;
        if (topicDisplay) topicDisplay.textContent = topic;
      } else {
        if (pinInput) pinInput.style.outlineColor = "red";
        setTimeout(function() { if (pinInput) pinInput.style.outlineColor = ""; }, 900);
      }
    });
    if (pinInput) {
      pinInput.addEventListener("keydown", function(e) {
        if (e.key === "Enter") pinBtn.click();
      });
    }
  }

  if (sendBtn) {
    sendBtn.addEventListener("click", function() {
      var msg = msgInput ? msgInput.value.trim() : "";
      if (!msg) { if (msgInput) msgInput.focus(); return; }
      sendBtn.disabled = true;
      if (statusEl) statusEl.textContent = "Sender…";
      fetch("https://ntfy.sh/" + topic, {
        method: "POST",
        headers: {
          "Title": "Besked fra Jari",
          "Priority": "high",
          "Tags": "bell",
          "Content-Type": "text/plain; charset=utf-8"
        },
        body: msg
      }).then(function(r) {
        if (r.ok) {
          if (statusEl) statusEl.textContent = "Sendt!";
          if (msgInput) msgInput.value = "";
          setTimeout(function() { if (statusEl) statusEl.textContent = ""; }, 3000);
        } else {
          if (statusEl) statusEl.textContent = "Fejl – prøv igen.";
        }
        sendBtn.disabled = false;
      }).catch(function() {
        if (statusEl) statusEl.textContent = "Ingen forbindelse.";
        sendBtn.disabled = false;
      });
    });
  }

  if (copyBtn) {
    copyBtn.addEventListener("click", function() {
      navigator.clipboard.writeText(topic).then(function() {
        copyBtn.textContent = "Kopieret! ✓";
        setTimeout(function() { copyBtn.textContent = "Kopiér kanal-navn"; }, 2500);
      }).catch(function() {
        copyBtn.textContent = topic;
      });
    });
  }

  if (newTopicBtn) {
    newTopicBtn.addEventListener("click", function() {
      if (confirm("Lav nyt kanal-navn? Det gamle holder op med at virke.")) {
        topic = "aiea-" + Math.random().toString(36).substring(2, 10);
        localStorage.setItem("aiea_ntfy_topic", topic);
        localStorage.removeItem("aiea_ntfy_last");
        localStorage.removeItem("aiea_ntfy_messages");
        if (topicDisplay) topicDisplay.textContent = topic;
      }
    });
  }
}
