function todayISO() {
  return toISODate(new Date());
}

function toISODate(date) {
  if (!(date instanceof Date) || Number.isNaN(date.getTime())) return "";
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, "0");
  const d = String(date.getDate()).padStart(2, "0");
  return `${y}-${m}-${d}`;
}

function formatLongDate(date, withWeekday = false) {
  if (!(date instanceof Date) || Number.isNaN(date.getTime())) return "Ugyldig dato";
  const options = withWeekday
    ? { weekday: "long", day: "numeric", month: "long", year: "numeric" }
    : { day: "numeric", month: "long", year: "numeric" };
  return date.toLocaleDateString("da-DK", options);
}

function parseISODate(iso) {
  if (!iso || typeof iso !== "string") return null;
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(iso.trim());
  if (!match) return null;
  const y = Number(match[1]);
  const m = Number(match[2]) - 1;
  const d = Number(match[3]);
  const date = new Date(y, m, d);
  if (date.getFullYear() !== y || date.getMonth() !== m || date.getDate() !== d) return null;
  return date;
}

function isValidTime(time) {
  return typeof time === "string" && /^([01]\d|2[0-3]):[0-5]\d$/.test(time.trim());
}

function buildCalendarCells(year, month) {
  const first = new Date(year, month, 1);
  const firstDay = (first.getDay() + 6) % 7;
  const start = new Date(year, month, 1 - firstDay);
  const cells = [];
  for (let i = 0; i < 42; i++) {
    const d = new Date(start);
    d.setDate(start.getDate() + i);
    cells.push({
      day: d.getDate(),
      iso: toISODate(d),
      currentMonth: d.getMonth() === month
    });
  }
  return cells;
}

function newAppointmentId() {
  return crypto.randomUUID ? crypto.randomUUID() : `apt-${Date.now()}-${Math.random().toString(36).slice(2, 9)}`;
}

function showFormError(container, message) {
  let el = container.querySelector(".form-error");
  if (!el) {
    el = document.createElement("p");
    el.className = "form-error";
    el.setAttribute("role", "alert");
    container.prepend(el);
  }
  el.textContent = message;
  el.hidden = !message;
}

function clearFormError(container) {
  showFormError(container, "");
}
