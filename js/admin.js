const cfg = window.MOR_CONFIG;
const SESSION_KEY = "mor_kalender_admin_session";

const state = {
  appointments: [],
  calendarMonth: new Date().getMonth(),
  calendarYear: new Date().getFullYear()
};

const pinGate = document.querySelector("#pinGate");
const dashboard = document.querySelector("#adminDashboard");
const pinForm = document.querySelector("#pinForm");
const pinError = document.querySelector("#pinError");

document.addEventListener("DOMContentLoaded", () => {
  if (sessionStorage.getItem(SESSION_KEY) === "1") {
    showDashboard();
  }
  registerAdminCloudRefreshListeners();
});

function registerAdminCloudRefreshListeners() {
  function refreshIfDashboardOpen() {
    if (dashboard.hidden) return;
    loadData(false);
  }
  window.addEventListener("online", refreshIfDashboardOpen);
  document.addEventListener("visibilitychange", () => {
    if (document.visibilityState === "visible") refreshIfDashboardOpen();
  });
}

pinForm.addEventListener("submit", event => {
  event.preventDefault();
  const pin = document.querySelector("#pinInput").value.trim();
  const expected = String(cfg.adminPin || "").trim();
  if (!expected) {
    showPinError("adminPin er ikke sat i sync-config.js.");
    return;
  }
  if (pin !== expected) {
    showPinError("Forkert PIN.");
    return;
  }
  sessionStorage.setItem(SESSION_KEY, "1");
  showDashboard();
});

document.querySelector("#logoutBtn")?.addEventListener("click", () => {
  sessionStorage.removeItem(SESSION_KEY);
  dashboard.hidden = true;
  pinGate.hidden = false;
  document.querySelector("#pinInput").value = "";
});

document.querySelector("#refreshBtn")?.addEventListener("click", () => loadData(true));

document.querySelector("#addAdminBtn")?.addEventListener("click", () => openDialog(null));

document.querySelector("#adminPrevMonth")?.addEventListener("click", () => {
  state.calendarMonth--;
  if (state.calendarMonth < 0) {
    state.calendarMonth = 11;
    state.calendarYear--;
  }
  renderAdminCalendar();
});

document.querySelector("#adminNextMonth")?.addEventListener("click", () => {
  state.calendarMonth++;
  if (state.calendarMonth > 11) {
    state.calendarMonth = 0;
    state.calendarYear++;
  }
  renderAdminCalendar();
});

document.querySelector("#dialogCancel")?.addEventListener("click", () => {
  document.querySelector("#editDialog").close();
});

document.querySelector("#adminEditForm").addEventListener("submit", event => {
  event.preventDefault();
  saveFromDialog();
});

function showPinError(msg) {
  pinError.textContent = msg;
  pinError.hidden = !msg;
}

function showDashboard() {
  pinGate.hidden = true;
  dashboard.hidden = false;
  pinError.hidden = true;

  if (!window.MOR_SYNC || !window.MOR_SYNC.isConfigured()) {
    setStatusLabel("Synk er ikke konfigureret — udfyld pcServerUrl i sync-config.js");
  } else if (window.MOR_SYNC.getSyncMode?.() === "pc") {
    setStatusLabel("PC-server synk (" + (cfg.pcServerUrl || "URL") + ")");
  } else if (window.MOR_SYNC.getSyncMode?.() === "supabase") {
    setStatusLabel("Supabase synk (legacy)");
  }

  document.querySelector("#householdLabel").textContent = cfg.householdId || "—";
  loadData(false);
}

async function loadData(showAlert) {
  setStatusLabel("Henter…");
  try {
    if (window.MOR_SYNC && window.MOR_SYNC.isConfigured()) {
      const local = loadAppointments();
      state.appointments = await window.MOR_SYNC.pullAndMerge(local);
      saveAppointmentsLocal(state.appointments);
      if (window.MOR_SYNC.syncAfterSaveBackground) {
        await window.MOR_SYNC.syncAfterSaveBackground(state.appointments, []);
      }
    } else {
      state.appointments = loadAppointments();
    }
    updateSyncLabels();
    renderTable();
    renderAdminCalendar();
    setStatusLabel("Klar");
    if (showAlert) alert("Data er opdateret.");
  } catch (err) {
    console.error(err);
    setStatusLabel("Fejl ved hentning — tjek netværk og PC-server/Tailscale");
    if (showAlert) alert("Kunne ikke hente fra serveren. Prøv igen.");
  }
}

function updateSyncLabels() {
  const meta = window.MOR_SYNC?.getSyncMeta?.() || null;
  const el = document.querySelector("#lastSyncLabel");
  if (!meta || !meta.lastSyncAt) {
    el.textContent = "Endnu ikke synket";
    return;
  }
  const d = new Date(meta.lastSyncAt);
  el.textContent = Number.isNaN(d.getTime())
    ? meta.lastSyncAt
    : d.toLocaleString("da-DK");
}

function setStatusLabel(text) {
  const el = document.querySelector("#syncStatusLabel");
  if (el) el.textContent = text;
}

function renderTable() {
  const body = document.querySelector("#appointmentsBody");
  const empty = document.querySelector("#emptyAdmin");
  body.innerHTML = "";

  const sorted = state.appointments
    .slice()
    .sort((a, b) => `${a.date}T${a.time}`.localeCompare(`${b.date}T${b.time}`));

  if (!sorted.length) {
    empty.hidden = false;
    return;
  }
  empty.hidden = true;

  for (const apt of sorted) {
    const tr = document.createElement("tr");
    tr.innerHTML = `
      <td>${escapeHtml(apt.date)}</td>
      <td>${escapeHtml(apt.time)}</td>
      <td>${escapeHtml(apt.title)}</td>
      <td>${escapeHtml(apt.note || "")}</td>
      <td>${escapeHtml(apt.reminder || "")}</td>
      <td class="row-actions"></td>
    `;
    const actions = tr.querySelector(".row-actions");
    const editBtn = document.createElement("button");
    editBtn.type = "button";
    editBtn.textContent = "Ret";
    editBtn.addEventListener("click", () => openDialog(apt));
    const delBtn = document.createElement("button");
    delBtn.type = "button";
    delBtn.textContent = "Slet";
    delBtn.addEventListener("click", () => deleteAppointment(apt.id));
    actions.append(editBtn, delBtn);
    body.appendChild(tr);
  }
}

function renderAdminCalendar() {
  const monthTitle = document.querySelector("#adminMonthTitle");
  const grid = document.querySelector("#adminCalendarGrid");
  const date = new Date(state.calendarYear, state.calendarMonth, 1);
  monthTitle.textContent = date.toLocaleDateString("da-DK", { month: "long", year: "numeric" });

  grid.innerHTML = "";
  const cells = buildCalendarCells(state.calendarYear, state.calendarMonth);
  const datesWithAppointments = new Set(state.appointments.map(a => a.date));

  cells.forEach(cell => {
    const button = document.createElement("button");
    button.type = "button";
    button.className = "day-cell";
    if (!cell.currentMonth) button.classList.add("dim");
    if (cell.iso === todayISO()) button.classList.add("today");
    button.textContent = cell.day;
    if (datesWithAppointments.has(cell.iso)) {
      button.classList.add("has-appointment");
      const dot = document.createElement("span");
      dot.className = "dot";
      dot.setAttribute("aria-hidden", "true");
      button.appendChild(dot);
    }
    grid.appendChild(button);
  });
}

function openDialog(apt) {
  const dialog = document.querySelector("#editDialog");
  document.querySelector("#dialogTitle").textContent = apt ? "Ret aftale" : "Ny aftale";
  document.querySelector("#adminEditId").value = apt ? apt.id : "";
  document.querySelector("#adminTitle").value = apt ? apt.title : "";
  document.querySelector("#adminDate").value = apt ? apt.date : todayISO();
  document.querySelector("#adminTime").value = apt ? apt.time : "10:00";
  document.querySelector("#adminNote").value = apt ? apt.note || "" : "";
  document.querySelector("#adminReminder").value = apt ? apt.reminder || "" : "";
  dialog.showModal();
}

function saveFromDialog() {
  const id = document.querySelector("#adminEditId").value.trim();
  const title = document.querySelector("#adminTitle").value.trim();
  const date = document.querySelector("#adminDate").value;
  const time = document.querySelector("#adminTime").value;
  const note = document.querySelector("#adminNote").value.trim();
  const reminder = document.querySelector("#adminReminder").value.trim();

  if (!title || !date || !parseISODate(date) || !isValidTime(time)) {
    alert("Udfyld titel, gyldig dato og tid.");
    return;
  }

  const apt = {
    id: id || newAppointmentId(),
    title,
    date,
    time,
    note,
    reminder
  };

  const idx = state.appointments.findIndex(a => a.id === apt.id);
  if (idx >= 0) {
    state.appointments[idx] = apt;
  } else {
    state.appointments.push(apt);
  }

  if (saveAppointments(state.appointments)) {
    document.querySelector("#editDialog").close();
    renderTable();
    renderAdminCalendar();
    updateSyncLabels();
  }
}

function deleteAppointment(id) {
  if (!confirm("Slet denne aftale?")) return;
  state.appointments = state.appointments.filter(a => a.id !== id);
  saveAppointments(state.appointments, { deletedIds: [id] });
  renderTable();
  renderAdminCalendar();
  updateSyncLabels();
}

function escapeHtml(str) {
  return String(str)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}
