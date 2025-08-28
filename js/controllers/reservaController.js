// js/controllers/reservationsController.js
// Conecta tu UI con la API y agrega máscara/validaciones de hora y tope de personas.

import {
  getReserva,
  createReserva,
  updateReserva,
  deleteReserva,
} from "../services/reservaService.js";

// ----------------------- UTILIDADES -----------------------
const $ = (s, r = document) => r.querySelector(s);

function escapeHTML(str) {
  return String(str || "").replace(/[&<>"']/g, (s) => ({
    "&": "&amp;",
    "<": "&lt;",
    ">": "&gt;",
    '"': "&quot;",
    "'": "&#39;",
  }[s]));
}
function clamp(n, min, max) { return Math.min(Math.max(n, min), max); }
function countDigits(str) { return (String(str).match(/\d/g) || []).length; }

function parseTime12(str) {
  const m = String(str || "").match(/^(\d{1,2})(?::(\d{1,2}))?$/);
  if (!m) return null;
  let h = parseInt(m[1], 10);
  let mi = m[2] !== undefined ? parseInt(m[2], 10) : 0;
  if (!Number.isFinite(h) || !Number.isFinite(mi)) return null;
  h = clamp(h, 1, 12);
  mi = clamp(mi, 0, 59);
  return { h, m: mi };
}
function normalizeTimeForSave(v) {
  if (!v) return "";
  const m = String(v).trim().match(/^(\d{1,2})(?::(\d{1,2}))?$/);
  if (!m) return "";
  let h = parseInt(m[1], 10);
  let mi = m[2] !== undefined ? parseInt(m[2], 10) : 0;
  if (!Number.isFinite(h)) return "";
  h = clamp(h, 1, 12);
  mi = Number.isFinite(mi) ? clamp(mi, 0, 59) : 0;
  return `${h}:${String(mi).padStart(2, "0")}`;
}
function toMinutesFrom12(hhmm, ampm) {
  const t = parseTime12(hhmm);
  if (!t) return NaN;
  let h24 = t.h % 12;
  if ((ampm || "").toUpperCase() === "PM") h24 += 12;
  return h24 * 60 + t.m;
}
function hourLabel(hStr, ampm) {
  const t = parseTime12(hStr);
  if (!t) return `${hStr || ""} ${ampm || ""}`.trim();
  return `${t.h}:${String(t.m).padStart(2, "0")}${ampm ? " " + ampm : ""}`;
}
function formatDateLabel(yyyy_mm_dd) {
  if (!yyyy_mm_dd) return "";
  const d = new Date(yyyy_mm_dd + "T00:00:00");
  return d.toLocaleDateString("es-ES", { day: "2-digit", month: "short" });
}

// -------- Máscara de hora tipo “teléfono” (12:59) con caret inteligente --------
function caretDigitsBefore(el) {
  const before = el.value.slice(0, el.selectionStart ?? el.value.length);
  return countDigits(before);
}
function placeCaretByDigitIndex(el, digitIndex) {
  let pos = Math.min(digitIndex, 4);
  if (pos > 2) pos += 1; // saltar ":"
  try { el.setSelectionRange(pos, pos); } catch {}
}
function buildTimeFromDigits(d) {
  let arr = String(d).replace(/\D/g, "").slice(0, 4).split("");

  // no permitir "0" inicial de hora
  while (arr.length && arr[0] === "0") arr.shift();
  if (arr.length === 0) return "";

  // Hora: 1 dígito, salvo 10–12
  let hourDigits = [];
  if (arr.length >= 2) {
    const two = parseInt(arr[0] + arr[1], 10);
    if (two >= 10 && two <= 12) {
      hourDigits = [arr.shift(), arr.shift()];
    } else {
      hourDigits = [arr.shift()];
    }
  } else {
    hourDigits = [arr.shift()];
  }

  let hour = parseInt(hourDigits.join(""), 10);
  hour = clamp(hour, 1, 12);

  // Minutos: primer dígito 0–5; si ponen 7 -> "07"; máximo 59
  let minuteDigits = arr.slice(0, 2);
  if (minuteDigits.length >= 1 && parseInt(minuteDigits[0], 10) > 5) {
    minuteDigits = ["0", minuteDigits[0]];
  }
  if (minuteDigits.length === 2) {
    const val = parseInt(minuteDigits.join(""), 10);
    if (val > 59) minuteDigits = ["5", "9"];
  }

  return minuteDigits.length ? `${hour}:${minuteDigits.join("")}` : `${hour}`;
}
function attachTimeMask(el) {
  if (!el) return;

  // Fuerza UX tipo teléfono
  el.type = "text";
  el.setAttribute("inputmode", "numeric");
  el.setAttribute("placeholder", "12:59");
  el.autocomplete = "off";

  // Borrar sobre ":" manteniendo caret lógico
  el.addEventListener("keydown", (e) => {
    const pos = el.selectionStart ?? 0;
    if (e.key === "Backspace" && pos > 0 && el.value[pos - 1] === ":") {
      e.preventDefault();
      const before = el.value.slice(0, pos - 1);
      const after = el.value.slice(pos);
      const digits = (before + after).replace(/\D/g, "");
      el.value = buildTimeFromDigits(digits);
      placeCaretByDigitIndex(el, countDigits(before));
    } else if (e.key === "Delete" && el.value[pos] === ":") {
      e.preventDefault();
      const before = el.value.slice(0, pos);
      const after = el.value.slice(pos + 1);
      const digits = (before + after).replace(/\D/g, "");
      el.value = buildTimeFromDigits(digits);
      placeCaretByDigitIndex(el, countDigits(before));
    }
  });

  // Re-formato en cada input
  el.addEventListener("input", () => {
    const di = caretDigitsBefore(el);
    const digits = el.value.replace(/\D/g, "").slice(0, 4);
    el.value = buildTimeFromDigits(digits);
    placeCaretByDigitIndex(el, Math.min(di, digits.length));
  });

  // Pegar: conserva solo dígitos
  el.addEventListener("paste", (e) => {
    e.preventDefault();
    const text = (e.clipboardData || window.clipboardData).getData("text");
    const digits = String(text).replace(/\D/g, "").slice(0, 4);
    el.value = buildTimeFromDigits(digits);
    placeCaretByDigitIndex(el, digits.length);
  });

  // Al salir, completa HH:MM
  el.addEventListener("blur", () => {
    el.value = normalizeTimeForSave(el.value);
  });
}

// ----------------------- ESTADO -----------------------
let editingId = null;
let mesasSeleccionadas = [];
let platillosSeleccionados = [];

// ----------------------- NODOS DEL DOM -----------------------
const reservationsSection   = $("#reservations-section");
const buttonSection         = $("#button-section");
const newReservationBtn     = $("#new-reservation-btn");

const reservationForm       = $("#new-reservation-form");
const cancelReservationBtn  = $("#cancel-reservation-btn");
const saveReservationBtn    = $("#save-reservation-btn");

const clientNameInput   = $("#client-name");
const clientPhoneInput  = $("#client-phone");
const dateInput         = $("#reservation-date");
const timeStartInput    = $("#reservation-time-start");
const timeEndInput      = $("#reservation-time-end");
const startAmPmSelect   = $("#reservation-time-start-ampm");
const endAmPmSelect     = $("#reservation-time-end-ampm");
const peopleInput       = $("#reservation-people");
const eventSelect       = $("#reservation-event");
const commentInput      = $("#reservation-comment");

const clientError    = $("#client-error");
const phoneError     = $("#phone-error");
const dateError      = $("#date-error");
const timeStartError = $("#time-start-error");
const timeEndError   = $("#time-end-error");
const peopleError    = $("#people-error");
const eventError     = $("#event-error");
const tablesError    = $("#tables-error");
const dishesError    = $("#dishes-error");

const selectTablesBtn    = $("#select-tables-btn");
const tablesModal        = $("#tables-modal");
const closeTablesModal   = $("#close-tables-modal");
const cancelTablesBtn    = $("#cancel-tables-btn");
const saveTablesBtn      = $("#save-tables-btn");
const tablesGrid         = $("#tables-grid");
const selectedTablesText = $("#selected-tables-text");

const selectDishesBtn    = $("#select-dishes-btn");
const dishesModal        = $("#dishes-modal");
const closeDishesModal   = $("#close-dishes-modal");
const cancelDishesBtn    = $("#cancel-dishes-btn");
const saveDishesBtn      = $("#save-dishes-btn");
const dishesGrid         = $("#dishes-grid");
const selectedDishesText = $("#selected-dishes-text");

// Título del formulario
const formTitle = $("#reservation-form-title");

// ----------------------- MODO FORM -----------------------
function setFormModeCreate() {
  if (formTitle) formTitle.textContent = "Nueva reserva";
  if (saveReservationBtn) saveReservationBtn.textContent = "Guardar Reserva";
  editingId = null;
}
function setFormModeEdit(nombreCliente) {
  if (formTitle) formTitle.textContent = `Editar reserva de ${nombreCliente || ""}`.trim();
  if (saveReservationBtn) saveReservationBtn.textContent = "Actualizar Reserva";
}

// ----------------------- API <-> UI MAPS -----------------------
function apiToUI(row) {
  const id       = row.id ?? row.Id ?? row.idReserva ?? row.IdReserva ?? null;
  const fReserva = row.fReserva ?? row.FReserva ?? row.freserva ?? row.fecha ?? "";
  const horaI    = row.horaI ?? row.HoraI ?? row.horai ?? "";
  const horaF    = row.horaF ?? row.HoraF ?? row.horaf ?? "";
  const cliente  = row.nombreCliente ?? row.NombreCliente ?? row.cliente ?? "";
  const tel      = row.telefono ?? row.Telefono ?? "";
  const cant     = row.cantidadPersonas ?? row.CantidadPersonas ?? row.personas ?? 1;
  const evento   = row.evento ?? row.Evento ?? "";
  const coment   = row.comentario ?? row.Comentario ?? "";
  const mesas    = Array.isArray(row.mesas) ? row.mesas.map(Number) : (row.idMesa != null ? [Number(row.idMesa)] : []);
  return {
    id,
    clientName: cliente,
    clientPhone: tel,
    date: String(fReserva),
    timeStart: String(horaI),
    startAmPm: row.startAmPm ?? "AM",
    timeEnd: String(horaF),
    endAmPm: row.endAmPm ?? "AM",
    people: Number(cant) || 1,
    event: String(evento || ""),
    comment: String(coment || ""),
    tables: mesas,
    dishes: Array.isArray(row.platillos) ? row.platillos : [],
  };
}
function uiToApiPayload() {
  const horaI = normalizeTimeForSave(timeStartInput.value);
  const horaF = normalizeTimeForSave(timeEndInput.value);
  return {
    nombreCliente: clientNameInput.value.trim(),
    telefono: clientPhoneInput.value.trim(),
    fReserva: dateInput.value,
    horaI,
    horaF,
    cantidadPersonas: parseInt(peopleInput.value || "1", 10),
    evento: eventSelect.value,
    comentario: commentInput.value.trim(),
    idMesa: mesasSeleccionadas.length ? Number(mesasSeleccionadas[0]) : null,
    mesas: mesasSeleccionadas.map(Number),
    platillos: (platillosSeleccionados || []).map((d) =>
      typeof d === "string"
        ? { nombre: d, cantidad: 1 }
        : { nombre: d.nombre || d.name || "", cantidad: d.cantidad ?? d.qty ?? 1, precio: d.precio ?? d.price ?? 0 }
    ),
  };
}

// ----------------------- RENDER LISTA -----------------------
let reservationsList = $("#reservations-list", reservationsSection);
if (!reservationsList) {
  reservationsList = document.createElement("div");
  reservationsList.id = "reservations-list";
  reservationsList.className = "space-y-4";
  reservationsSection.appendChild(reservationsList);
}
let reservationsEmpty = $("#reservations-empty", reservationsSection);
if (!reservationsEmpty) {
  reservationsEmpty = document.createElement("div");
  reservationsEmpty.id = "reservations-empty";
  reservationsEmpty.className = "text-gray-500";
  reservationsEmpty.textContent = "Aún no hay reservas. Crea la primera con el botón “Nueva reserva”.";
  reservationsSection.insertBefore(reservationsEmpty, reservationsList);
}

function renderReservations(data) {
  reservationsList.innerHTML = "";
  if (!Array.isArray(data) || data.length === 0) {
    reservationsEmpty.classList.remove("hidden");
    return;
  }
  reservationsEmpty.classList.add("hidden");

  data.forEach((r) => {
    const card = document.createElement("div");
    card.className =
      "bg-white border border-gray-200 rounded-lg p-4 flex flex-col gap-2 hover:bg-gray-50 transition cursor-pointer";

    card.innerHTML = `
      <div class="flex justify-between items-start">
        <div>
          <h3 class="font-bold text-gray-800">${escapeHTML(r.clientName)}</h3>
          <p class="text-xs text-gray-500">
            ${formatDateLabel(r.date)} — ${hourLabel(r.timeStart, r.startAmPm)} a ${hourLabel(r.timeEnd, r.endAmPm)}
          </p>
        </div>
        <div class="flex gap-2">
          <button class="edit-btn text-blue-600 hover:text-blue-700 font-medium text-sm" data-id="${r.id}">Editar</button>
          <button class="delete-btn text-red-600 hover:text-red-700 font-medium text-sm" data-id="${r.id}">Eliminar</button>
        </div>
      </div>
      <div class="text-sm text-gray-700">
        <div class="flex justify-between">
          <span>Mesas: ${r.tables?.length ? r.tables.join(", ") : "—"}</span>
          <span class="font-medium">${r.people} ${r.people === 1 ? "persona" : "personas"}</span>
        </div>
        <p><span class="font-medium">Evento:</span> ${escapeHTML(r.event || "—")}</p>
        ${r.comment ? `<p class="text-gray-600 mt-1">${escapeHTML(r.comment)}</p>` : ""}
      </div>
    `;

    card.querySelector(".edit-btn").addEventListener("click", (e) => {
      e.stopPropagation();
      startEditing(r);
    });
    card.querySelector(".delete-btn").addEventListener("click", async (e) => {
      e.stopPropagation();
      if (!confirm("¿Eliminar esta reserva?")) return;
      try {
        if (!r.id && r.id !== 0) throw new Error("Reserva sin ID válido.");
        await deleteReserva(r.id);
        await loadFromAPI();
      } catch (err) {
        console.error("[Eliminar] Error:", err);
        alert("No se pudo eliminar. Revisa la consola para más detalle.");
      }
    });
    card.addEventListener("click", () => startEditing(r));

    reservationsList.appendChild(card);
  });
}

// ----------------------- CARGA DESDE API -----------------------
async function loadFromAPI() {
  try {
    const apiList = await getReserva();
    const uiList = (Array.isArray(apiList) ? apiList : []).map(apiToUI);
    renderReservations(uiList);
  } catch (err) {
    console.error("[Cargar] Error:", err);
    reservationsList.innerHTML = "";
    reservationsEmpty.classList.remove("hidden");
  }
}

// ----------------------- NUEVA / EDITAR -----------------------
function openForm() {
  reservationsSection.classList.add("hidden");
  buttonSection.classList.add("hidden");
  reservationForm.classList.remove("hidden");
  reservationForm.classList.remove("fadeSlideIn");
  void reservationForm.offsetWidth;
  reservationForm.classList.add("fadeSlideIn");
  try { reservationForm.scrollIntoView({ behavior: "smooth", block: "start" }); } catch {}
}
function closeForm() {
  reservationForm.classList.add("hidden");
  reservationsSection.classList.remove("hidden");
  buttonSection.classList.remove("hidden");
}
function clearForm() {
  editingId = null;
  clientNameInput.value = "";
  clientPhoneInput.value = "";
  dateInput.value = "";
  timeStartInput.value = "";
  timeEndInput.value = "";
  startAmPmSelect.value = "AM";
  endAmPmSelect.value = "AM";
  peopleInput.value = "";
  eventSelect.value = "";
  commentInput.value = "";
  mesasSeleccionadas = [];
  platillosSeleccionados = [];
  selectedTablesText.textContent = "";
  selectedDishesText.textContent = "Ningún platillo seleccionado.";
  [clientError, phoneError, dateError, timeStartError, timeEndError, peopleError, eventError, tablesError, dishesError]
    .forEach((e) => e?.classList.add("hidden"));
  setFormModeCreate();
}
function startEditing(r) {
  editingId = r.id ?? null;
  clientNameInput.value = r.clientName || "";
  clientPhoneInput.value = r.clientPhone || "";
  dateInput.value = r.date || "";
  timeStartInput.value = r.timeStart || "";
  timeEndInput.value = r.timeEnd || "";
  startAmPmSelect.value = r.startAmPm || "AM";
  endAmPmSelect.value = r.endAmPm || "AM";
  peopleInput.value = String(r.people || "");
  eventSelect.value = r.event || "";
  commentInput.value = r.comment || "";

  mesasSeleccionadas = Array.isArray(r.tables) ? r.tables.slice() : [];
  platillosSeleccionados = Array.isArray(r.dishes) ? r.dishes.slice() : [];

  selectedTablesText.textContent = mesasSeleccionadas.length
    ? "Mesas seleccionadas: " + mesasSeleccionadas.sort((a, b) => a - b).join(", ")
    : "Ninguna mesa seleccionada.";
  selectedDishesText.textContent =
    platillosSeleccionados.length
      ? "Platillos: " + platillosSeleccionados.map((d) => (typeof d === "string" ? d : (d.nombre || d.name || ""))).join(", ")
      : "Ningún platillo seleccionado.";

  setFormModeEdit(r.clientName || r.client || "");
  openForm();
}

// ----------------------- VALIDACIÓN Y GUARDAR -----------------------
function validateForm() {
  let ok = true;

  // Cliente
  if (clientNameInput.value.trim() === "") { clientError.classList.remove("hidden"); ok = false; }
  else clientError.classList.add("hidden");

  // Teléfono: 8 dígitos (con guion -> 9 chars)
  const phoneDigits = clientPhoneInput.value.replace(/\D/g, "");
  if (phoneDigits.length !== 8) { phoneError.classList.remove("hidden"); ok = false; }
  else phoneError.classList.add("hidden");

  // Fecha
  if (dateInput.value === "") { dateError.classList.remove("hidden"); ok = false; }
  else dateError.classList.add("hidden");

  // Horas (formato y orden)
  timeStartInput.value = normalizeTimeForSave(timeStartInput.value);
  timeEndInput.value   = normalizeTimeForSave(timeEndInput.value);

  const tS = parseTime12(timeStartInput.value);
  const tE = parseTime12(timeEndInput.value);

  if (!tS) { timeStartError.textContent = "Hora inválida. Usa el formato 12:59."; timeStartError.classList.remove("hidden"); ok = false; }
  else timeStartError.classList.add("hidden");

  if (!tE) { timeEndError.textContent = "Hora inválida. Usa el formato 12:59."; timeEndError.classList.remove("hidden"); ok = false; }
  else timeEndError.classList.add("hidden");

  if (tS && tE) {
    const startM = toMinutesFrom12(timeStartInput.value, startAmPmSelect.value);
    const endM   = toMinutesFrom12(timeEndInput.value,   endAmPmSelect.value);
    if (!Number.isFinite(startM) || !Number.isFinite(endM) || endM <= startM) {
      timeEndError.textContent = "La hora fin debe ser posterior a la hora inicio.";
      timeEndError.classList.remove("hidden");
      ok = false;
    } else {
      timeEndError.classList.add("hidden");
    }
  }

  // Personas
  const ppl = parseInt(peopleInput.value || "0", 10);
  if (!Number.isFinite(ppl) || ppl <= 0) { peopleError.textContent = "Ingrese la cantidad de personas."; peopleError.classList.remove("hidden"); ok = false; }
  else if (ppl > 200) { peopleError.textContent = "Máximo 200 personas."; peopleError.classList.remove("hidden"); ok = false; }
  else peopleError.classList.add("hidden");

  // Evento
  if (eventSelect.value === "") { eventError.classList.remove("hidden"); ok = false; }
  else eventError.classList.add("hidden");

  // Mesas
  if (!mesasSeleccionadas.length) {
    tablesError.textContent = "Por favor seleccione las mesas.";
    tablesError.classList.remove("hidden");
    ok = false;
  } else {
    tablesError.classList.add("hidden");
  }

  return ok;
}

async function handleSave() {
  if (!validateForm()) return;

  const payload = uiToApiPayload();

  try {
    if (editingId != null) {
      await updateReserva(editingId, payload);
    } else {
      await createReserva(payload);
    }
    await loadFromAPI();
    clearForm();
    closeForm();
  } catch (err) {
    console.error("[Guardar] Error:", err);
    alert("No se pudo guardar. Revisa la consola para más detalle.");
  }
}

// ----------------------- MODAL MESAS -----------------------
function buildTablesGrid() {
  if (!tablesGrid) return;
  tablesGrid.innerHTML = "";
  for (let i = 1; i <= 12; i++) {
    const btn = document.createElement("button");
    btn.type = "button";
    btn.dataset.mesa = String(i);
    btn.className = "border rounded-lg py-2 flex flex-col items-center text-sm font-medium hover:bg-blue-100 transition";
    btn.innerHTML = `<i class="fas fa-utensils mb-1"></i> Mesa ${i}`;
    btn.classList.toggle("mesa-btn-selected", mesasSeleccionadas.includes(i));

    btn.addEventListener("click", () => {
      const n = parseInt(btn.dataset.mesa, 10);
      const isSel = mesasSeleccionadas.includes(n);
      mesasSeleccionadas = isSel
        ? mesasSeleccionadas.filter((x) => x !== n)
        : [...mesasSeleccionadas, n];
      btn.classList.toggle("mesa-btn-selected", !isSel);
    });

    tablesGrid.appendChild(btn);
  }
}
selectTablesBtn?.addEventListener("click", () => {
  buildTablesGrid();
  tablesModal.classList.remove("hidden");
});
closeTablesModal?.addEventListener("click", () => tablesModal.classList.add("hidden"));
cancelTablesBtn?.addEventListener("click", () => tablesModal.classList.add("hidden"));
saveTablesBtn?.addEventListener("click", () => {
  tablesModal.classList.add("hidden");
  selectedTablesText.textContent = mesasSeleccionadas.length
    ? "Mesas seleccionadas: " + mesasSeleccionadas.sort((a, b) => a - b).join(", ")
    : "Ninguna mesa seleccionada.";
  if (mesasSeleccionadas.length) tablesError.classList.add("hidden");
});

// ----------------------- MODAL PLATILLOS (demo local) -----------------------
function buildDishesGrid() {
  const demo = [
    { id: 1, nombre: "Ceviche", precio: 5.0 },
    { id: 2, nombre: "Lomo Saltado", precio: 7.5 },
    { id: 3, nombre: "Ensalada", precio: 3.0 },
    { id: 4, nombre: "Jugo", precio: 2.0 },
  ];
  dishesGrid.innerHTML = "";
  demo.forEach((p) => {
    const isSel = !!platillosSeleccionados.find((d) => (d.id || d.nombre) === (p.id || p.nombre));
    const btn = document.createElement("button");
    btn.type = "button";
    btn.className = "border rounded-lg py-2 px-3 text-sm flex justify-between items-center hover:bg-green-100 transition";
    btn.innerHTML = `<span>${escapeHTML(p.nombre)}</span><span>$${p.precio.toFixed(2)}</span>`;
    btn.classList.toggle("mesa-btn-selected", isSel);
    btn.addEventListener("click", () => {
      const idx = platillosSeleccionados.findIndex((d) => (d.id || d.nombre) === (p.id || p.nombre));
      if (idx >= 0) {
        platillosSeleccionados.splice(idx, 1);
        btn.classList.remove("mesa-btn-selected");
      } else {
        platillosSeleccionados.push({ ...p, cantidad: 1 });
        btn.classList.add("mesa-btn-selected");
      }
    });
    dishesGrid.appendChild(btn);
  });
}
selectDishesBtn?.addEventListener("click", () => {
  buildDishesGrid();
  dishesModal.classList.remove("hidden");
});
closeDishesModal?.addEventListener("click", () => dishesModal.classList.add("hidden"));
cancelDishesBtn?.addEventListener("click", () => dishesModal.classList.add("hidden"));
saveDishesBtn?.addEventListener("click", () => {
  dishesModal.classList.add("hidden");
  selectedDishesText.textContent =
    platillosSeleccionados.length
      ? "Platillos: " + platillosSeleccionados.map((d) => d.nombre).join(", ")
      : "Ningún platillo seleccionado.";
  dishesError.classList.add("hidden");
});

// ----------------------- EVENTOS PRINCIPALES -----------------------
newReservationBtn?.addEventListener("click", () => {
  clearForm();
  setFormModeCreate();
  openForm();
});
cancelReservationBtn?.addEventListener("click", () => {
  clearForm();
  closeForm();
});
saveReservationBtn?.addEventListener("click", (e) => {
  e.preventDefault();
  handleSave();
});

// ----------------------- INIT -----------------------
(function init() {
  // Máscaras: horas, teléfono y tope de personas
  attachTimeMask(timeStartInput);
  attachTimeMask(timeEndInput);

  clientPhoneInput?.addEventListener("input", () => {
    let value = clientPhoneInput.value.replace(/[^0-9]/g, "").slice(0, 8);
    if (value.length > 4) value = value.slice(0, 4) + "-" + value.slice(4);
    clientPhoneInput.value = value;
  });

  peopleInput?.addEventListener("input", () => {
    let v = peopleInput.value.replace(/[^0-9]/g, "");
    if (v === "") v = "";
    const num = parseInt(v || "0", 10);
    if (Number.isFinite(num) && num > 200) v = "200";
    peopleInput.value = v;
  });

  loadFromAPI();
})();
