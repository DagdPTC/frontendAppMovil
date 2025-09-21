// js/controllers/ordersController.js

import {
  getPedidos,
  createPedido,
  updatePedido,
  deletePedido,
  getEstadosPedido,
  getEmpleados,
  getMesasForOrders,
} from "../services/ordersService.js";
import { getPlatillos } from "../services/menuService.js";

const $  = (s, r = document) => r.querySelector(s);
const $$ = (s, r = document) => Array.from(r.querySelectorAll(s));

let editingId = null;
// idPlatillo -> idDetalle de las líneas originales del pedido
let editingOriginalLinesByPlatillo = new Map();
// máximo idDetalle encontrado en el pedido al iniciar edición
let editingMaxIdDetalle = 0;



const K_EDIT_ID   = "order_editing_id";
const K_EDIT_EMP  = "order_editing_emp";
const K_EDIT_MESA = "order_editing_mesa";


const K_SEL       = "ord_dishes_sel";
const K_OPEN_FORM = "abrirFormularioPedido";
const K_CLIENTE   = "clienteTemporal";
const K_MESA      = "mesaTemporal";
const K_WAITER    = "waiterTemporal";

const LOCK_KEY    = "mesas_locked_by_orders"; // para bloquear cambios en pantallas de Mesas

const PILL_NEUTRAL = "estado-pill text-xs px-2 py-1 rounded bg-gray-100 text-gray-700 capitalize";

let MAP_ESTADOS   = new Map();  // id -> {id, nombre}
let ESTADOS_ORDER = [];         // [{id,nombre}] ordenado por id
let MAP_PLATILLOS = new Map();
let MAP_EMPLEADOS = new Map();

/* ===========================================================
   FANCY SELECT (chips + búsqueda + animación, accesible)
   =========================================================== */
function upgradeSelect(nativeSelect, opts = {}) {
  if (!nativeSelect || nativeSelect._fancy) return;
  const multiple = nativeSelect.hasAttribute("multiple") || !!opts.multiple;
  const placeholder = opts.placeholder || "Seleccione…";

  const wrapper = document.createElement("div");
  wrapper.className = "fancy-select relative w-full";
  nativeSelect.insertAdjacentElement("afterend", wrapper);

  nativeSelect.classList.add("sr-only");
  nativeSelect.setAttribute("tabindex", "-1");
  nativeSelect.style.position = "absolute";
  nativeSelect.style.left = "-99999px";

  const control = document.createElement("button");
  control.type = "button";
  control.className = [
    "fs-control w-full rounded-xl border border-gray-300 bg-white px-3 py-2",
    "flex items-center flex-wrap gap-2 text-sm md:text-base",
    "shadow-sm hover:shadow transition focus:outline-none focus:ring-2 focus:ring-blue-500"
  ].join(" ");

  const chips = document.createElement("div");
  chips.className = "fs-chips flex items-center gap-1 flex-1 min-w-0";
  const ph = document.createElement("span");
  ph.className = "fs-placeholder text-gray-400 truncate";
  ph.textContent = placeholder;
  chips.appendChild(ph);

  const caret = document.createElement("span");
  caret.className = "ml-auto transition-transform";
  caret.innerHTML = "▾";

  control.append(chips, caret);
  wrapper.appendChild(control);

  const panel = document.createElement("div");
  panel.className = [
    "fs-panel absolute left-0 right-0 top-[calc(100%+6px)] z-50",
    "origin-top rounded-xl border border-gray-200 bg-white shadow-lg p-2",
    "opacity-0 scale-95 pointer-events-none transition-all"
  ].join(" ");

  const searchWrap = document.createElement("div");
  searchWrap.className = "mb-2";
  const search = document.createElement("input");
  search.type = "text";
  search.placeholder = "Buscar…";
  search.className = "w-full rounded-lg border border-gray-200 px-2 py-1 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500";
  searchWrap.appendChild(search);
  panel.appendChild(searchWrap);

  const list = document.createElement("div");
  list.className = "max-h-64 overflow-auto space-y-1";
  panel.appendChild(list);

  wrapper.appendChild(panel);

  function readOptions() {
    return Array.from(nativeSelect.options).map(o => ({
      value: o.value, label: o.textContent.trim(), disabled: o.disabled, selected: o.selected
    }));
  }
  function renderList(filter = "") {
    const q = filter.trim().toLowerCase();
    list.innerHTML = "";
    readOptions().forEach(opt => {
      if (q && !opt.label.toLowerCase().includes(q)) return;
      const row = document.createElement("button");
      row.type = "button";
      row.className = [
        "w-full text-left px-3 py-2 rounded-lg",
        opt.disabled ? "opacity-40 cursor-not-allowed" : "hover:bg-gray-50",
        "flex items-center gap-2 border border-transparent"
      ].join(" ");
      row.disabled = !!opt.disabled;
      row.dataset.value = opt.value;

      const mark = document.createElement("span");
      mark.className = "shrink-0 w-4";
      mark.textContent = opt.selected ? "•" : "";
      const lbl = document.createElement("span");
      lbl.textContent = opt.label;
      lbl.className = "truncate";

      row.append(mark, lbl);
      row.addEventListener("click", () => {
        if (row.disabled) return;
        if (multiple) {
          nativeSelect.querySelector(`option[value="${CSS.escape(opt.value)}"]`).selected = !opt.selected;
        } else {
          nativeSelect.value = opt.value;
        }
        nativeSelect.dispatchEvent(new Event("change", { bubbles: true }));
        syncControl();
        renderList(search.value);
        if (!multiple) close();
      });

      list.appendChild(row);
    });
  }
  function syncControl() {
    const opts = readOptions().filter(o => o.selected);
    chips.innerHTML = "";
    if (!opts.length) {
      chips.appendChild(ph);
    } else {
      const maxChips = 1;
      opts.slice(0, maxChips).forEach(o => {
        const chip = document.createElement("span");
        chip.className = "px-2 py-0.5 rounded-full bg-gray-100 text-gray-800 text-sm flex items-center gap-1";
        chip.innerHTML = `<span class="truncate">${o.label}</span>`;
        if (multiple) {
          const x = document.createElement("button");
          x.type = "button";
          x.textContent = "×";
          x.className = "ml-1 opacity-70 hover:opacity-100";
          x.addEventListener("click", (ev) => {
            ev.stopPropagation();
            nativeSelect.querySelector(`option[value="${CSS.escape(o.value)}"]`).selected = false;
            nativeSelect.dispatchEvent(new Event("change", { bubbles: true }));
            syncControl(); renderList(search.value);
          });
          chip.appendChild(x);
        }
        chips.appendChild(chip);
      });
      if (opts.length > maxChips) {
        const more = document.createElement("span");
        more.className = "px-2 py-0.5 rounded-full bg-gray-100 text-gray-800 text-sm";
        more.textContent = `+${opts.length - maxChips}`;
        chips.appendChild(more);
      }
    }
  }
  function open() {
    panel.classList.remove("pointer-events-none");
    panel.style.opacity = "1";
    panel.style.transform = "scale(1)";
    caret.style.transform = "rotate(180deg)";
    search.focus();
  }
  function close() {
    panel.classList.add("pointer-events-none");
    panel.style.opacity = "0";
    panel.style.transform = "scale(.95)";
    caret.style.transform = "rotate(0deg)";
  }
  function toggle() {
    const openNow = panel.style.opacity === "1";
    openNow ? close() : open();
  }

  control.addEventListener("click", toggle);
  search.addEventListener("input", () => renderList(search.value));
  document.addEventListener("click", (e) => { if (!wrapper.contains(e.target)) close(); });
  nativeSelect.addEventListener("change", () => { syncControl(); renderList(search.value); });

  syncControl();
  renderList();

  nativeSelect._fancy = { wrapper, control, open, close, sync: syncControl, isFancy: true };
}

/* ===========================================================
   SKIN / MODERN LOOK & FEEL (sin cambiar funcionalidad)
   =========================================================== */
function applyModernSkin() {
  const form = document.getElementById("new-order-form");
  if (form) form.classList.add("rounded-2xl","bg-white","border","border-gray-200","shadow-md","p-4","md:p-6","animate-[fadeIn_.25s_ease]");
  const list = document.getElementById("orders-list");
  if (list) list.classList.add("grid","gap-4","md:grid-cols-2","xl:grid-cols-3");

  [["new-order-btn","bg-blue-600 hover:bg-blue-700"],
   ["save-order-btn","bg-blue-600 hover:bg-blue-700"],
   ["back-to-orders","bg-gray-200 hover:bg-gray-300"],
   ["add-dishes-btn","bg-emerald-500 hover:bg-emerald-600"]]
  .forEach(([id, cls]) => {
    const b = document.getElementById(id);
    if (b) {
      b.classList.add(...("text-white rounded-xl px-4 py-2 transition shadow-sm focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-blue-500".split(" ")));
      cls.split(" ").forEach(c => b.classList.add(c));
      b.addEventListener("click", () => {
        const s = document.createElement("span");
        s.className = "absolute inset-0 rounded-xl animate-[ping_.6s_ease-out] bg-white/30 pointer-events-none";
        b.style.position = "relative";
        b.appendChild(s);
        setTimeout(()=>s.remove(),600);
      });
    }
  });

  const style = document.createElement("style");
  style.textContent = `@keyframes fadeIn { from {opacity:0; transform: translateY(4px)} to {opacity:1; transform:none} }`;
  document.head.appendChild(style);
}

/* =========================
   ALERTAS (info / error / success)
   ========================= */
function ensureAlertHost() {
  let host = document.getElementById("alerts-host");
  if (!host) {
    host = document.createElement("div");
    host.id = "alerts-host";
    host.setAttribute("aria-live", "polite");
    host.className = "fixed top-4 right-4 z-50 space-y-3 pointer-events-none";
    document.body.appendChild(host);
  }
  return host;
}
function showAlert(type = "info", text = "", opts = {}) {
  const { timeout = 3500 } = opts;
  const host = ensureAlertHost();
  const wrap = document.createElement("div");
  const color = { info: "bg-blue-500", error: "bg-red-500", success: "bg-green-500" }[type] || "bg-blue-500";

  wrap.className =
    `pointer-events-auto rounded-xl px-4 py-3 shadow-lg text-white flex items-center gap-3 w-[min(92vw,380px)] ${color}`;
  wrap.innerHTML = `
    <div class="font-medium">${text}</div>
    <button class="ml-auto opacity-80 hover:opacity-100 focus:outline-none">✕</button>
  `;
  host.appendChild(wrap);

  const close = () => {
    try {
      wrap.style.transition = "opacity .25s ease, transform .25s ease";
      wrap.style.opacity = "0";
      wrap.style.transform = "translateY(-6px)";
      setTimeout(() => wrap.remove(), 200);
    } catch { wrap.remove(); }
  };
  wrap.querySelector("button")?.addEventListener("click", close);
  if (timeout) setTimeout(close, timeout);
}

/* =========================
   MODAL CONFIRM
   ========================= */
function showConfirm({ title = "Confirmar", message = "", confirmText = "Aceptar", cancelText = "Cancelar", variant = "default" } = {}) {
  return new Promise((resolve) => {
    const overlay = document.createElement("div");
    overlay.className = "fixed inset-0 z-50 flex items-center justify-center bg-black/40 backdrop-blur-sm";

    const card = document.createElement("div");
    card.className = "w-[min(92vw,380px)] rounded-2xl bg-white shadow-xl border border-gray-200 p-4 animate-[fadeIn_.2s_ease]";
    card.innerHTML = `
      <div class="flex items-start gap-3">
        <div class="flex-1">
          <div class="text-base font-semibold mb-1">${title}</div>
          <div class="text-sm text-gray-600">${message}</div>
        </div>
        <button class="btn-x text-gray-500 hover:text-gray-700">✕</button>
      </div>
      <div class="mt-4 flex gap-2 justify-end">
        <button class="btn-cancel rounded-lg px-3 py-2 bg-gray-100 hover:bg-gray-200 text-gray-800">${cancelText}</button>
        <button class="btn-ok rounded-lg px-3 py-2 text-white ${variant === "danger" ? "bg-red-600 hover:bg-red-700" : "bg-blue-600 hover:bg-blue-700"}">${confirmText}</button>
      </div>
    `;
    overlay.appendChild(card);
    document.body.appendChild(overlay);

    const cleanup = (val) => { overlay.remove(); resolve(val); };
    overlay.addEventListener("click", (e) => { if (e.target === overlay) cleanup(false); });
    card.querySelector(".btn-x").addEventListener("click", () => cleanup(false));
    card.querySelector(".btn-cancel").addEventListener("click", () => cleanup(false));
    card.querySelector(".btn-ok").addEventListener("click", () => cleanup(true));
  });
}

/* =========================
   Helpers: limpiar / snapshots / locks mesas / API mesa
   ========================= */
function clearSnapshots() {
  localStorage.removeItem(K_CLIENTE);
  localStorage.removeItem(K_MESA);
  sessionStorage.removeItem(K_WAITER);
  sessionStorage.removeItem(K_OPEN_FORM);
}
function resetOrderForm() {
  const name = $("#customer-name");
  const table = $("#table-select");
  const waiter = $("#waiter-select");
  const estado = $("#status-select");
  const notes = $("#order-notes");

  if (name) name.value = "";
  if (notes) notes.value = "";

  if (table) { table.value = ""; table.dispatchEvent(new Event("change", { bubbles: true })); }
  if (waiter) { waiter.value = ""; waiter.dispatchEvent(new Event("change", { bubbles: true })); }
  if (estado) {
    if (ESTADOS_ORDER[0]) estado.value = String(ESTADOS_ORDER[0].id);
    else estado.value = "";
    estado.dispatchEvent(new Event("change", { bubbles: true }));
  }

  setSeleccion([]); renderSeleccionUI();
  const saveBtn = $("#save-order-btn"); if (saveBtn) saveBtn.textContent = "Guardar pedido";
}

// ---- locks mesas (local) ----
function getLockedSet() {
  try { return new Set(JSON.parse(localStorage.getItem(LOCK_KEY) || "[]")); } catch { return new Set(); }
}
function saveLockedSet(set) { localStorage.setItem(LOCK_KEY, JSON.stringify([...set])); }
function lockMesaLocal(idMesa) {
  const s = getLockedSet(); s.add(String(idMesa)); saveLockedSet(s);
}
function unlockMesaLocal(idMesa) {
  const s = getLockedSet(); s.delete(String(idMesa)); saveLockedSet(s);
}
window.isMesaLockedByOrder = (idMesa) => getLockedSet().has(String(idMesa));

// ---- API Mesa (best-effort; ajusta si tu backend difiere) ----
const API_HOST = "http://localhost:8080";

async function tryUpdateMesaEstado(idMesa, idEstadoMesa) {
  const url = `${API_HOST}/apiMesa/estado/${idMesa}/${idEstadoMesa}`;
  const res = await fetch(url, { method: "PATCH" });
  return res.ok;
}
async function ocuparMesa(idMesa)  { await tryUpdateMesaEstado(idMesa, 2); } // Ocupada
async function liberarMesa(idMesa) { await tryUpdateMesaEstado(idMesa, 1); } // Disponible

/* =========================
   ESTADOS (dinámicos desde BD)
   ========================= */
async function cargarEstadosYSelect() {
  const raw = await getEstadosPedido().catch(() => []);
  MAP_ESTADOS = new Map(
    raw.map(e => {
      const id = Number(e.id ?? e.idEstadoPedido ?? e.ID ?? e.Id ?? e.IdEstadoPedido ?? e.IDESTADOPEDIDO);
      const nombre = String(e.nomEstado ?? e.nomEstadoPedido ?? e.nombre ?? e.nombreEstado ?? e.estado ?? e.NOMBREESTADO ?? "").trim();
      return { id, nombre };
    }).filter(x => Number.isFinite(x.id) && x.nombre)
      .map(x => [x.id, x])
  );
  ESTADOS_ORDER = Array.from(MAP_ESTADOS.values()).sort((a,b)=>a.id - b.id);

  const selEstado = $("#status-select");
  if (selEstado) {
    selEstado.innerHTML = "";
    ESTADOS_ORDER.forEach(est => {
      const opt = document.createElement("option");
      opt.value = String(est.id);
      opt.textContent = est.nombre;
      selEstado.appendChild(opt);
    });
    if (ESTADOS_ORDER[0]) selEstado.value = String(ESTADOS_ORDER[0].id);
    upgradeSelect(selEstado, { placeholder: "Estado" });
  }
}
function nextEstadoId(currentId) {
  if (!ESTADOS_ORDER.length) return undefined;
  const idx = ESTADOS_ORDER.findIndex(e => e.id === Number(currentId));
  if (idx === -1) return ESTADOS_ORDER[0].id;
  return ESTADOS_ORDER[(idx + 1) % ESTADOS_ORDER.length].id;
}

/* =========================
   Selección de platillos
   ========================= */
function getSeleccion() {
  try { return JSON.parse(sessionStorage.getItem(K_SEL) || "[]"); } catch { return []; }
}
function setSeleccion(v) {
  sessionStorage.setItem(K_SEL, JSON.stringify(v || []));
}

/* =========================
   Snapshots del form
   ========================= */
function saveFormSnapshot() {
  localStorage.setItem(K_CLIENTE, ($("#customer-name")?.value || "").trim());
  localStorage.setItem(K_MESA, $("#table-select")?.value || "");
  sessionStorage.setItem(K_WAITER, $("#waiter-select")?.value || "");
}
function restoreFormSnapshot() {
  const name = localStorage.getItem(K_CLIENTE);
  const mesa = localStorage.getItem(K_MESA);
  if (name) $("#customer-name").value = name;
  if (mesa) $("#table-select").value = mesa;
  localStorage.removeItem(K_CLIENTE);
  localStorage.removeItem(K_MESA);
}
function restoreWaiter(waiterSelect) {
  if (!waiterSelect) return;
  const saved = sessionStorage.getItem(K_WAITER);
  if (saved && waiterSelect.querySelector(`option[value="${saved}"]`)) {
    waiterSelect.value = saved;
  }
}

/* =========================
   Catálogos
   ========================= */
async function cargarCatalogos() {
  await cargarEstadosYSelect();
  const plats = await getPlatillos(0).catch(() => []);
  MAP_PLATILLOS = new Map(
    plats.map(p => [Number(p.id), { id: Number(p.id), nomPlatillo: p.nombre, precio: Number(p.precio || 0) }])
  );
}

/* =========================
   Mesero (autocompletado + bloqueado)
   ========================= */
// Autocompleta el mesero con un empleado REAL de la API y bloquea el select.
// Si existe sessionStorage.ord_user con un id válido, lo usa; si no, usa el primer empleado.
// Autocompleta el mesero con un empleado REAL de la API y bloquea el select.
// Si pasas { initialId }, lo usa (editar). Si no, usa ord_user o el primero de la API.
// Autocompleta el mesero con un empleado REAL de la API y bloquea el select.
// Si pasas { initialId }, lo usa (editar). Si no, usa ord_user o el primero de la API.
async function cargarEmpleados(waiterSelect, opts = {}) {
  if (!waiterSelect) return;
  const { initialId = null } = opts;

  const url = `${API_HOST}/apiEmpleado/getDataEmpleado?page=0&size=50`;

  let empleados = [];
  try {
    const res = await fetch(url);
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const data = await res.json().catch(() => ({}));
    empleados = Array.isArray(data?.content) ? data.content : (Array.isArray(data) ? data : []);
  } catch (e) {
    console.error("[Empleados] Error al obtener empleados:", e);
  }

  // Elegir ID preferido
  let preferredId = null;
  if (Number.isFinite(Number(initialId))) preferredId = Number(initialId);
  else {
    try {
      const user = JSON.parse(sessionStorage.getItem("ord_user") || "null");
      if (user && Number.isFinite(Number(user.id))) preferredId = Number(user.id);
    } catch {}
  }
  if (!preferredId && empleados.length) preferredId = Number(empleados[0].id ?? empleados[0].Id);

  // Etiqueta legible (EmpleadoDTO no trae nombre)
  let label = `Empleado #${preferredId || "-"}`;
  try {
    const user = JSON.parse(sessionStorage.getItem("ord_user") || "null");
    if (user && Number(user.id) === preferredId) {
      label = `${user.nombre || label}${user.username ? " — " + user.username : ""}`;
    }
  } catch {}

  waiterSelect.innerHTML = "";
  const opt = document.createElement("option");
  opt.value = preferredId ? String(preferredId) : "";
  opt.textContent = label;
  opt.selected = true;
  waiterSelect.appendChild(opt);

  waiterSelect.disabled = true;
  waiterSelect.title = "Se completa automáticamente con el mesero de la cuenta / pedido.";
  waiterSelect.className =
    "w-full max-w-full p-2 md:p-2.5 rounded-lg border border-gray-300 text-sm md:text-base bg-gray-100 shadow-sm cursor-not-allowed";
  if (typeof upgradeSelect === "function") upgradeSelect(waiterSelect, { placeholder: "Mesero" });
}




/* =========================
   Mesas (select con estado)
   ========================= */
function nombreEstadoMesa(m) {
  const idEstado = Number(
    m.idEstadoMesa ?? m.IdEstadoMesa ??
    (m.estadoMesa && (m.estadoMesa.id ?? m.estadoMesa.Id)) ??
    (m.estado && (m.estado.id ?? m.estado.Id))
  );
  if (Number.isFinite(idEstado)) {
    if (idEstado === 1) return "disponible";
    if (idEstado === 2) return "ocupada";
    if (idEstado === 3) return "reservada";
    if (idEstado === 4) return "limpieza";
  }
  const raw = (
    m.nomEstadoMesa ?? m.nomEstado ??
    (m.estadoMesa && (m.estadoMesa.nomEstado ?? m.estadoMesa.nombre ?? m.estadoMesa.estado)) ??
    (m.estado && (m.estado.nomEstado ?? m.estado.nombre ?? m.estado.estado)) ??
    m.estado ?? ""
  ).toString().toLowerCase();
  if (raw.includes("dispon")) return "disponible";
  if (raw.includes("ocup"))   return "ocupada";
  if (raw.includes("reserv")) return "reservada";
  if (raw.includes("limp"))   return "limpieza";
  return "desconocido";
}
function tituloEstado(s) {
  const t = String(s||"").toLowerCase();
  return t.charAt(0).toUpperCase() + t.slice(1);
}
function idMesaFrom(m) {
  return Number(m.id ?? m.Id ?? m.idMesa ?? m.IdMesa ?? m.codigo ?? m.numMesa ?? m.numero ?? NaN);
}
function nombreMesaFrom(m) {
  return String(m?.nomMesa ?? m?.numero ?? m?.numMesa ?? idMesaFrom(m) ?? "?");
}

// Normaliza el estado de la mesa leyendo varios posibles campos
function getEstadoMesaNormalized(m) {
  // 1) Numérico (catálogo típico: 1=Disponible, 2=Ocupada, 3=Reservada, 4=Limpieza)
  const idE = Number(
    m.idEstadoMesa ?? m.IdEstadoMesa ??
    (m.estadoMesa && (m.estadoMesa.id ?? m.estadoMesa.Id)) ??
    (m.estado && (m.estado.id ?? m.estado.Id))
  );
  if (Number.isFinite(idE) && idE > 0) {
    if (idE === 1) return "disponible";
    if (idE === 2) return "ocupada";
    if (idE === 3) return "reservada";
    if (idE === 4) return "limpieza";
  }

  // 2) Texto (por si el backend manda el nombre del estado)
  const raw = (
    m.nomEstadoMesa ?? m.nomEstado ??
    (m.estadoMesa && (m.estadoMesa.nomEstado ?? m.estadoMesa.nombre ?? m.estadoMesa.estado)) ??
    (m.estado && (m.estado.nomEstado ?? m.estado.nombre ?? m.estado.estado)) ??
    m.estado ?? ""
  ).toString().toLowerCase();

  if (raw.includes("dispon")) return "disponible";
  if (raw.includes("ocup"))   return "ocupada";
  if (raw.includes("reserv")) return "reservada";
  if (raw.includes("limp"))   return "limpieza";

  return "desconocido";
}


// === RUTA FIJA y tamaño permitido por tu backend (size <= 50) ===
// Ruta fija de tu backend (size <= 50) y estado normalizado
// Ruta fija de tu backend (size <= 50) y estado normalizado
// Carga mesas desde la API y pinta el select con el estado REAL (no inventado)
// Carga mesas mostrando el ESTADO REAL desde /apiEstadoMesa y bloquea las no disponibles
// Carga mesas con ESTADO REAL: cruza Mesa + EstadoMesa + Pedido + EstadoPedido.
// Solo habilita las mesas cuyo estado final quede en "Disponible".
// Carga mesas con el estado REAL; habilita solo "Disponible".
// Si pasas { allowCurrentId }, esa mesa se muestra habilitada como "(actual)" para poder conservarla al editar.
// Carga mesas con estado REAL: Mesa + EstadoMesa + Pedido + EstadoPedido.
// Habilita solo "Disponible". Si allowCurrentId coincide, permite mantenerla aunque esté ocupada (al editar).
// Carga mesas con estado REAL: Mesa + EstadoMesa + Pedido + EstadoPedido.
// Habilita solo "Disponible". Si allowCurrentId coincide, permite mantenerla aunque esté ocupada (al editar).
async function cargarMesasSelect(opts = {}) {
  const { allowCurrentId = null } = opts;
  const sel = document.getElementById("table-select");
  if (!sel) return;

  sel.className =
    "w-full max-w-full p-2 md:p-2.5 rounded-lg border border-gray-300 focus:ring-2 focus:ring-blue-500 focus:border-blue-500 text-sm md:text-base bg-white shadow-sm";
  sel.innerHTML = `<option value="" disabled selected>Seleccione una mesa disponible…</option>`;

  const urlMesas   = `${API_HOST}/apiMesa/getDataMesa?page=0&size=50`;
  const urlEM      = `${API_HOST}/apiEstadoMesa/getDataEstadoMesa?page=0&size=50`;
  const urlPed     = `${API_HOST}/apiPedido/getDataPedido?page=0&size=50`;
  const urlEP      = `${API_HOST}/apiEstadoPedido/getDataEstadoPedido?page=0&size=50`;

  const getId = (o) => Number(o.id ?? o.Id);
  const nomMesa = (m) => String(m.nomMesa ?? `Mesa ${getId(m)}`);
  const idEstMesa = (m) => Number(m.idEstadoMesa ?? m.IdEstadoMesa);
  const nomEstadoMesa = (e) => String(e.estadoMesa ?? e.nombre ?? e.nomEstado ?? e.estado ?? "").trim();
  const nomEstadoPedido = (e) => String(e.nomEstado ?? e.nombre ?? "").trim();
  const cap = (s) => (s ? s.charAt(0).toUpperCase() + s.slice(1).toLowerCase() : s);

  let mesas=[], estadosMesa=[], pedidos=[], estadosPed=[];
  try {
    const [rM, rEM, rP, rEP] = await Promise.all([fetch(urlMesas), fetch(urlEM), fetch(urlPed), fetch(urlEP)]);
    if (!rM.ok || !rEM.ok || !rP.ok || !rEP.ok) throw new Error("HTTP error");
    const [dM, dEM, dP, dEP] = await Promise.all([rM.json(), rEM.json(), rP.json(), rEP.json()]);
    mesas = Array.isArray(dM?.content) ? dM.content : (Array.isArray(dM) ? dM : []);
    estadosMesa = Array.isArray(dEM?.content) ? dEM.content : (Array.isArray(dEM) ? dEM : []);
    pedidos = Array.isArray(dP?.content) ? dP.content : (Array.isArray(dP) ? dP : []);
    estadosPed = Array.isArray(dEP?.content) ? dEP.content : (Array.isArray(dEP) ? dEP : []);
  } catch (e) {
    console.error("[Mesas] Error al obtener datos:", e);
    if (typeof upgradeSelect === "function") upgradeSelect(sel, { placeholder: "Mesa" });
    return;
  }

  const MAP_ID_ESTADO_MESA_NOMBRE = new Map(estadosMesa.map(e => [getId(e), nomEstadoMesa(e)]));
  const MAP_ID_ESTADO_PED_NOMBRE  = new Map(estadosPed.map(e => [getId(e), nomEstadoPedido(e)]));

  // Detectar "Disponible" por nombre del catálogo de MESA (no por hardcode)
  let idDisponible = null;
  for (const e of estadosMesa) { if (nomEstadoMesa(e).toLowerCase().includes("dispon")) { idDisponible = getId(e); break; } }
  if (idDisponible == null) {
    console.warn("[Mesas] No hay estado 'Disponible' en catálogo.");
    if (typeof upgradeSelect === "function") upgradeSelect(sel, { placeholder: "Mesa" });
    return;
  }

  // Estados de pedido cerrados (no ocupan mesa)
  const esPedidoCerrado = (nombre) => {
    const s = (nombre || "").toLowerCase();
    return s.includes("pag") || s.includes("final") || s.includes("cancel") ||
           s.includes("cerr") || s.includes("entreg") || s.includes("complet") ||
           s.includes("rechaz") || s.includes("anul");
  };

  // Mesas con pedido ACTIVO
  const mesasConPedidoActivo = new Set(
    pedidos
      .filter(p => !esPedidoCerrado(MAP_ID_ESTADO_PED_NOMBRE.get(Number(p.idEstadoPedido ?? p.IdEstadoPedido)) || ""))
      .map(p => Number(p.idMesa ?? p.IdMesa))
      .filter(Boolean)
  );

  mesas.sort((a, b) => getId(a) - getId(b));

  sel.innerHTML = `<option value="" disabled selected>Seleccione una mesa disponible…</option>`;
  for (const m of mesas) {
    const id = getId(m);
    const nombre = nomMesa(m);
    const idEst = idEstMesa(m);
    const nomEst = MAP_ID_ESTADO_MESA_NOMBRE.get(idEst) || "Desconocido";

    // Estado efectivo: si hay pedido activo, consideramos Ocupada
    const estadoEfectivo = mesasConPedidoActivo.has(id) ? "Ocupada" : nomEst;
    let habilitada = (!mesasConPedidoActivo.has(id)) && (idEst === idDisponible);
    let etiqueta = `${nombre} — ${cap(estadoEfectivo)}`;

    if (allowCurrentId && Number(allowCurrentId) === id && !habilitada) {
      habilitada = true;
      etiqueta = `${etiqueta} (actual)`;
    }

    const opt = document.createElement("option");
    opt.value = String(id);
    opt.textContent = etiqueta;
    opt.dataset.estado = estadoEfectivo.toLowerCase();
    if (!habilitada) {
      opt.disabled = true;
      opt.title = `No seleccionable: ${cap(estadoEfectivo)}`;
    }
    sel.appendChild(opt);
  }

  sel.addEventListener("change", () => {
    const o = sel.options[sel.selectedIndex];
    if (o && o.disabled) sel.selectedIndex = 0;
  });

  if (typeof upgradeSelect === "function") upgradeSelect(sel, { placeholder: "Mesa" });
}









/* =========================
   Normalizador pedido UI — AJUSTADO a items[] con fallback legacy
   ========================= */
function fromApi(p) {
  const id = Number(p.id ?? p.Id ?? p.idPedido ?? p.ID);
  const fecha = (p.fpedido ?? p.FPedido ?? p.fecha ?? p.fechaPedido ?? "").toString();
  const estadoId = Number(p.idEstadoPedido ?? p.IdEstadoPedido ?? p.estadoId ?? 0);
  const estadoNombre = MAP_ESTADOS.get(estadoId)?.nombre || "";
  const nombreCliente = (p.nombreCliente ?? p.nombrecliente ?? p.Cliente ?? p.cliente ?? "").toString();
  const idMesa = Number(p.idMesa ?? p.IdMesa ?? p.mesaId ?? 0);

  let platillos = [];
  if (Array.isArray(p.items) && p.items.length) {
    platillos = p.items.map(it => {
      const idPlat = Number(it.idPlatillo ?? it.IdPlatillo ?? it.id ?? it.Id);
      const cant   = Number(it.cantidad ?? it.Cantidad ?? 1);
      const pu     = (it.precioUnitario ?? it.PrecioUnitario);
      const info   = MAP_PLATILLOS.get(idPlat);
      const idDet  = Number(it.idDetalle ?? it.IdDetalle ?? it.linea ?? it.Linea ?? 0);
      return {
        idPlatillo: idPlat,
        idDetalle:  Number.isFinite(idDet) ? idDet : undefined,
        nombre: info?.nomPlatillo ?? `#${idPlat}`,
        cantidad: cant,
        precio: Number(pu ?? info?.precio ?? 0)
      };
    });
  } else {
    const idPlat = Number(p.idPlatillo ?? p.IdPlatillo ?? 0);
    const cant   = Number(p.cantidad ?? p.Cantidad ?? 1);
    const info   = MAP_PLATILLOS.get(idPlat);
    platillos = idPlat ? [{
      idPlatillo: idPlat,
      idDetalle:  undefined,
      nombre: info?.nomPlatillo ?? (p.platillo?.nomPlatillo ?? p.nomPlatillo ?? "Platillo"),
      cantidad: cant,
      precio: Number(info?.precio ?? 0)
    }] : [];
  }

  const subtotalCalc = platillos.reduce((acc, x) => acc + (Number(x.precio) || 0) * (Number(x.cantidad) || 0), 0);
  const subtotal = Number((p.subtotal ?? p.Subtotal ?? subtotalCalc) ?? 0);
  const propina  = Number(p.propina ?? p.Propina ?? +(subtotal * 0.10).toFixed(2));
  const total    = Number(p.totalPedido ?? p.TotalPedido ?? +(subtotal + propina).toFixed(2));

  return {
    id,
    Cliente: nombreCliente,
    Mesa: String(idMesa || ""),
    Mesero: "",
    Hora: fecha,
    Estado: estadoNombre,
    Platillos: platillos,
    _subtotal: subtotal,
    _propina:  propina,
    _total:    total,

    idMesa,
    idEmpleado: Number(p.idEmpleado ?? p.IdEmpleado ?? 0),
    idEstadoPedido: estadoId,
    idPlatillo: Number(p.idPlatillo ?? p.IdPlatillo ?? 0), // legacy
    Observaciones: (p.observaciones ?? p.Observaciones ?? "").toString()
  };
}


/* =========================
   Tarjeta de pedido
   ========================= */
function agregarTarjetaPedido(pedido, container) {
  const card = document.createElement("div");
  card.className = "tarjeta-animada border border-gray-200 rounded-xl p-4 bg-white shadow-sm transition";

  const listaPlatillos = (pedido.Platillos || []).map(x => `<li>${x.nombre} (x${x.cantidad})</li>`).join("");
  const total    = Number(pedido._total || 0).toFixed(2);
  const subtotal = Number(pedido._subtotal || 0).toFixed(2);
  const propina  = Number(pedido._propina || 0).toFixed(2);

  card.innerHTML = `
    <div class="flex justify-between items-start">
      <div>
        <div class="text-sm text-gray-500">Cliente</div>
        <div class="text-lg font-semibold">${pedido.Cliente || "-"}</div>
      </div>
      <button class="${PILL_NEUTRAL} estado-pill" title="Cambiar estado">
        ${pedido.Estado || "—"}
      </button>
    </div>
    <div class="mt-2 text-sm">
      <div><strong>Mesa:</strong> ${pedido.Mesa || "-"}</div>
      <div><strong>Fecha:</strong> ${pedido.Hora || "-"}</div>
    </div>
    <div class="mt-3">
      <ul class="text-sm list-disc list-inside text-gray-700">
        ${listaPlatillos || "<li>(sin platillos)</li>"}
      </ul>
    </div>
    <div class="mt-3 text-sm text-gray-700">
      <div><strong>Subtotal:</strong> $${subtotal}</div>
      <div><strong>Propina (10%):</strong> $${propina}</div>
      <div><strong>Total:</strong> $${total}</div>
    </div>
    <div class="mt-4 flex gap-2">
      <button class="btn-editar px-3 py-1 rounded bg-blue-500 text-white">Editar</button>
      <button class="btn-eliminar px-3 py-1 rounded bg-red-500 text-white">Eliminar</button>
    </div>
  `;

  card.querySelector(".btn-eliminar").addEventListener("click", async (ev) => {
    ev.stopPropagation();
    const ok = await showConfirm({
      title: "Eliminar pedido",
      message: "¿Estás seguro de eliminar este pedido? Esta acción no se puede deshacer.",
      confirmText: "Eliminar",
      cancelText: "Cancelar",
      variant: "danger",
    });
    if (!ok) {
      showAlert("info", "Operación cancelada");
      return;
    }
    try {
      await deletePedido(pedido.id);
      card.remove();
      showAlert("success", "Pedido eliminado correctamente");
      const idMesa = Number(pedido.idMesa || pedido.Mesa || 0);
      if (idMesa) await liberarMesa(idMesa);
    } catch (e) {
      showAlert("error", e.message || "No se pudo eliminar el pedido");
    }
  });

  card.querySelector(".btn-editar").addEventListener("click", (ev) => {
    ev.stopPropagation();
    abrirEdicionDesdeCard(pedido);
  });

  card.querySelector(".estado-pill").addEventListener("click", async (ev) => {
    ev.stopPropagation();
    try {
      if (!ESTADOS_ORDER.length) await cargarEstadosYSelect();
      const newId = nextEstadoId(pedido.idEstadoPedido);
      if (!Number.isFinite(newId)) throw new Error("No hay estados configurados.");

      const items = (pedido.Platillos || [])
        .filter(pl => Number.isFinite(Number(pl.idPlatillo)) && Number(pl.idPlatillo) > 0)
        .map(pl => ({ idPlatillo: Number(pl.idPlatillo), cantidad: Math.max(1, Number(pl.cantidad || 1)) }));

      if (!items.length) throw new Error("El pedido no tiene items para actualizar.");

      await updatePedido(pedido.id, {
        nombreCliente: pedido.Cliente || "Cliente",
        idMesa: Number(pedido.idMesa || pedido.Mesa || 0),
        idEmpleado: Number(pedido.idEmpleado || 0),
        idEstadoPedido: newId,
        observaciones: pedido.Observaciones || "Sin observaciones",
        propina: Number(pedido._propina || 0),
        items
      });

      pedido.idEstadoPedido = newId;
      const newName = MAP_ESTADOS.get(newId)?.nombre || "";
      pedido.Estado = newName;
      const pill = card.querySelector(".estado-pill");
      if (pill && newName) pill.textContent = newName;

      if ((newName || "").toLowerCase().includes("cancel")) {
        const idMesa = Number(pedido.idMesa || pedido.Mesa || 0);
        if (idMesa) await liberarMesa(idMesa);
      }

      showAlert("success", `Estado actualizado a "${newName}"`);
    } catch (e) {
      showAlert("error", e.message || "No se pudo cambiar el estado");
    }
  });

  container.appendChild(card);
}

/* =========================
   Edición
   ========================= */
let editingOriginalMesaId = null;
let editingOriginalPlatillos = new Set();

function abrirEdicionDesdeCard(pedido) {
  editingId = Number(pedido.id);
  editingOriginalMesaId = Number(pedido.idMesa || 0);

  // set con platillos originales
  editingOriginalPlatillos = new Set(
    (pedido.Platillos || []).map(pl => Number(pl.idPlatillo)).filter(Boolean)
  );

  // mapa idPlatillo -> idDetalle + max idDetalle
  editingOriginalLinesByPlatillo = new Map();
  editingMaxIdDetalle = 0;
  (pedido.Platillos || []).forEach(pl => {
    const idP  = Number(pl.idPlatillo);
    const idDet = Number(pl.idDetalle ?? pl.linea ?? 0);
    if (idP && idDet) {
      editingOriginalLinesByPlatillo.set(idP, idDet);
      if (idDet > editingMaxIdDetalle) editingMaxIdDetalle = idDet;
    }
  });

  $("#customer-name").value = pedido.Cliente || "";
  $("#order-notes").value   = pedido.Observaciones || "";

  const selEstado = $("#status-select");
  if (selEstado && selEstado.querySelector(`option[value="${pedido.idEstadoPedido}"]`)) {
    selEstado.value = String(pedido.idEstadoPedido);
  }

  const sel = (pedido.Platillos || []).map(pl => ({
    id: pl.idPlatillo || 0,
    idDetalle: pl.idDetalle,            // lo conservamos en la selección
    nombre: pl.nombre,
    precio: Number(pl.precio || 0),
    qty: Number(pl.cantidad || 1)
  }));
  setSeleccion(sel);
  renderSeleccionUI();

  const waiterSelect = $("#waiter-select");
  const tableSelect  = $("#table-select");

  Promise.resolve()
    .then(() => cargarEmpleados(waiterSelect, { initialId: pedido.idEmpleado }))
    .then(() => cargarMesasSelect({ allowCurrentId: pedido.idMesa }))
    .then(() => {
      if (tableSelect && pedido.idMesa) {
        tableSelect.value = String(pedido.idMesa);
        tableSelect.dispatchEvent(new Event("change", { bubbles: true }));
        if (tableSelect._fancy?.sync) tableSelect._fancy.sync();
      }
    });

  const saveBtn = $("#save-order-btn");
  if (saveBtn) saveBtn.textContent = "Actualizar pedido";

  $("#new-order-form").classList.remove("hidden");
  $("#orders-list").classList.add("hidden");
  $("#new-order-btn").classList.add("hidden");
}






/* =========================
   Lista
   ========================= */
function emptyState(msg) {
  return `
    <div class="w-full py-12 flex items-center justify-center">
      <div class="text-center text-gray-500">
        <div class="text-lg font-medium mb-1">Sin pedidos</div>
        <div class="text-sm">${msg || "No hay pedidos para mostrar."}</div>
      </div>
    </div>`;
}
async function cargarPedidosDeApi(container, onAddCard) {
  let raw = [];
  try { raw = await getPedidos(0, 50); }
  catch (e) { container.innerHTML = emptyState("No se pudieron cargar los pedidos."); return; }

  const mapped = [];
  for (const p of raw) { try { mapped.push(fromApi(p)); } catch {} }

  if (!mapped.length) { container.innerHTML = emptyState("No hay pedidos para mostrar."); return; }

  container.innerHTML = "";
  mapped.forEach(p => { try { onAddCard(p, container); } catch {} });
}

/* =========================
   Selección + Totales
   ========================= */
function ensureTotalsBlock(sectionEl) {
  let summary = document.getElementById("order-summary");
  if (!summary) {
    summary = document.createElement("div");
    summary.id = "order-summary";
    summary.className = "mt-3 text-sm text-gray-700";
    summary.innerHTML = `
      <div><strong>Subtotal:</strong> $<span id="summary-subtotal">0.00</span></div>
      <div><strong>Propina (10%):</strong> $<span id="summary-tip">0.00</span></div>
      <div><strong>Total:</strong> $<span id="summary-total">0.00</span></div>
    `;
    sectionEl.appendChild(summary);
  }
  return {
    subEl: document.getElementById("summary-subtotal"),
    tipEl: document.getElementById("summary-tip"),
    totalEl: document.getElementById("summary-total"),
  };
}
function renderSeleccionUI() {
  const sel = getSeleccion();

  const secSel = document.getElementById("selected-dishes-section") || $("#selected-dishes-section");
  const listSel = document.getElementById("selected-dishes-list") || $("#selected-dishes-list");
  const itemCountBadge = document.getElementById("item-count-badge") || $("#item-count-badge");

  if (!secSel || !listSel) return;

  if (!sel.length) {
    secSel.classList.add("hidden");
    listSel.innerHTML = "";
    if (itemCountBadge) itemCountBadge.classList.add("hidden");
    return;
  }

  secSel.classList.remove("hidden");
  if (itemCountBadge) {
    itemCountBadge.classList.remove("hidden");
    itemCountBadge.textContent = String(sel.reduce((a, b) => a + (b.qty || 1), 0));
  }

  listSel.innerHTML = sel.map(it => `
    <div class="flex items-center justify-between p-2 bg-white border rounded">
      <div>
        <div class="text-sm font-medium">${it.nombre}</div>
        <div class="text-xs text-gray-500">$${Number(it.precio).toFixed(2)}</div>
      </div>
      <div class="flex items-center gap-2">
        <button class="btn-minus px-2 py-1 bg-gray-200 rounded" data-id="${it.id}">-</button>
        <span class="w-6 text-center">${it.qty || 1}</span>
        <button class="btn-plus px-2 py-1 bg-gray-200 rounded" data-id="${it.id}">+</button>
        <button class="btn-remove px-2 py-1 bg-red-500 text-white rounded" title="Quitar" data-id="${it.id}">
          <i class="fa fa-trash"></i>
        </button>
      </div>
    </div>
  `).join("");

  $$(".btn-plus", listSel).forEach(b => b.addEventListener("click", () => {
    const id = b.getAttribute("data-id");
    const arr = getSeleccion();
    const it = arr.find(x => String(x.id) === String(id));
    if (it) it.qty = (it.qty || 1) + 1;
    setSeleccion(arr); renderSeleccionUI();
  }));
  $$(".btn-minus", listSel).forEach(b => b.addEventListener("click", () => {
    const id = b.getAttribute("data-id");
    const arr = getSeleccion();
    const it = arr.find(x => String(x.id) === String(id));
    if (it) it.qty = Math.max(1, (it.qty || 1) - 1);
    setSeleccion(arr); renderSeleccionUI();
  }));
  $$(".btn-remove", listSel).forEach(b => b.addEventListener("click", () => {
    const id = b.getAttribute("data-id");
    const arr = getSeleccion().filter(x => String(x.id) !== String(id));
    setSeleccion(arr); renderSeleccionUI();
  }));

  const TIP_RATE = 0.10;
  const subtotal = sel.reduce((sum, it) => sum + (Number(it.precio) || 0) * (it.qty || 1), 0);
  const propina  = +(subtotal * TIP_RATE).toFixed(2);
  const total    = +(subtotal + propina).toFixed(2);

  const { subEl, tipEl, totalEl } = ensureTotalsBlock(secSel);
  if (subEl)  subEl.textContent  = subtotal.toFixed(2);
  if (tipEl)  tipEl.textContent  = propina.toFixed(2);
  if (totalEl) totalEl.textContent = total.toFixed(2);
}

/* =========================
   Payloads + Validación — UN payload con items[]
   ========================= */
function buildPayloadsFromSelection() {
  const seleccion = getSeleccion();

  // Cliente
  const nombreCliente = ($("#customer-name")?.value || "").trim();
  if (!nombreCliente) { markInvalid("customer-name"); showAlert("error","El nombre del cliente es obligatorio"); throw new Error("VALIDATION"); }

  // Mesa
  const mesaSel = document.getElementById("table-select");
  let idMesa = Number(mesaSel?.value || "");
  if (!Number.isFinite(idMesa) || idMesa <= 0) {
    const firstEnabled = Array.from(mesaSel?.options || []).find(o => o.value && !o.disabled);
    if (firstEnabled) { mesaSel.value = firstEnabled.value; mesaSel.dispatchEvent(new Event("change", { bubbles: true })); idMesa = Number(firstEnabled.value); }
  }
  if (!Number.isFinite(idMesa) || idMesa <= 0) { markInvalid("table-select"); showAlert("error","Selecciona una mesa válida"); throw new Error("VALIDATION"); }

  // Mesero
  const waiterSel = document.getElementById("waiter-select");
  let idEmpleado = Number(waiterSel?.value || "");
  if (!Number.isFinite(idEmpleado) || idEmpleado <= 0) {
    const firstOpt = Array.from(waiterSel?.options || []).find(o => o.value);
    if (firstOpt) { waiterSel.value = firstOpt.value; waiterSel.dispatchEvent(new Event("change", { bubbles: true })); idEmpleado = Number(firstOpt.value); }
  }
  if (!Number.isFinite(idEmpleado) || idEmpleado <= 0) { markInvalid("waiter-select"); showAlert("error","Selecciona un mesero válido"); throw new Error("VALIDATION"); }

  // Estado
  let idEstadoPedido = Number($("#status-select")?.value || "");
  if (!Number.isFinite(idEstadoPedido) || idEstadoPedido <= 0) {
    if (ESTADOS_ORDER?.length) idEstadoPedido = Number(ESTADOS_ORDER[0].id);
  }
  if (!Number.isFinite(idEstadoPedido) || idEstadoPedido <= 0) { markInvalid("status-select"); showAlert("error","Selecciona un estado válido"); throw new Error("VALIDATION"); }

  // Platillos seleccionados
  if (!Array.isArray(seleccion) || !seleccion.length) { showAlert("info","Agrega al menos un platillo"); throw new Error("VALIDATION"); }

  // Agrupar por idPlatillo y conservar precio unitario + idDetalle (si existe)
  const agrupados = new Map();
  for (const it of seleccion) {
    const idPlatillo = Number((it && it.id) ?? (it && it.idPlatillo));
    const qty = Math.max(1, Number((it && it.qty) ?? (it && it.cantidad) ?? 1));
    const precio = Number((it && it.precio) ?? (MAP_PLATILLOS.get(idPlatillo)?.precio) ?? 0);
    const idDetSel = Number(it?.idDetalle ?? 0);

    if (!Number.isFinite(idPlatillo) || idPlatillo <= 0) continue;

    const prev = agrupados.get(idPlatillo) || { cantidad: 0, precioUnitario: 0, idDetalle: undefined };
    prev.cantidad += qty;
    if (Number.isFinite(precio) && precio > 0) prev.precioUnitario = precio;

    // si venía idDetalle en la selección, lo guardamos
    if (Number.isFinite(idDetSel) && idDetSel > 0) prev.idDetalle = idDetSel;

    agrupados.set(idPlatillo, prev);
  }

  // Construir items:
  // - si estamos EDITANDO (editingId != null):
  //     * si existe idDetalle en el mapeo original → lo usamos
  //     * si no, asignamos un idDetalle nuevo: max+1, max+2, ...
  // - si es NUEVO (crear) → no mandamos idDetalle (backend lo asigna)
  let lineCounter = editingMaxIdDetalle || 0;
  const items = Array.from(agrupados.entries()).map(([idPlatillo, v]) => {
    const base = {
      idPlatillo: Number(idPlatillo),
      cantidad: v.cantidad,
      precioUnitario: Number(v.precioUnitario || 0)
    };
    if (editingId != null) {
      const idDet =
        (editingOriginalLinesByPlatillo.get(Number(idPlatillo))) ??
        (Number.isFinite(v.idDetalle) && v.idDetalle > 0 ? v.idDetalle : undefined);

      if (Number.isFinite(idDet) && idDet > 0) {
        base.idDetalle = idDet;
      } else {
        // línea nueva en modo edición → asignamos un idDetalle que no choque
        lineCounter += 1;
        base.idDetalle = lineCounter;
      }
    }
    return base;
  });

  if (!items.length) { showAlert("info","Agrega al menos un platillo válido"); throw new Error("VALIDATION"); }
  // actualizar contador global para próximas ediciones
  editingMaxIdDetalle = lineCounter;

  // Totales
  const subtotal = items.reduce((acc, it) => acc + (it.precioUnitario || 0) * (it.cantidad || 0), 0);
  const propina  = +(subtotal * 0.10).toFixed(2);
  const total    = +(subtotal + propina).toFixed(2);

  const observaciones = ($("#order-notes")?.value || "").trim() || "Sin cebolla";
  const fpedido = formatDateTimeLocal(new Date());

  return {
    totalPedido: Number(total.toFixed(2)),
    subtotal:    Number(subtotal.toFixed(2)),
    propina:     Number(propina.toFixed(2)),
    fpedido,
    items,                      // [{idPlatillo,cantidad,precioUnitario, (idDetalle si edit)}]
    nombreCliente,
    observaciones,
    idMesa,
    idEmpleado,
    idEstadoPedido
  };
}


/* =========================
   Crear / Actualizar
   ========================= */
async function crearPedidoDesdeSeleccion() {
  const body = buildPayloadsFromSelection();
  await createPedido(body);
  if (body.idMesa) await ocuparMesa(body.idMesa);
}

// Reemplaza COMPLETO
async function actualizarPedido(editId) {
  if (!Number.isFinite(editId)) throw new Error("ID inválido para actualizar.");
  const body = buildPayloadsFromSelection();   // incluye idDetalle cuando corresponde

  await updatePedido(editId, body);

  // Si cambió la mesa, liberar la anterior y ocupar la nueva
  const nuevaMesaId = Number(body.idMesa || 0);
  const mesaAntes   = Number(editingOriginalMesaId || 0);
  if (mesaAntes && nuevaMesaId && mesaAntes !== nuevaMesaId) {
    try { await liberarMesa(mesaAntes); } catch {}
    try { await ocuparMesa(nuevaMesaId); } catch {}
  }

  // limpiar contexto de edición
  editingOriginalMesaId = null;
  editingOriginalPlatillos = new Set();
  editingOriginalLinesByPlatillo = new Map();
  editingMaxIdDetalle = 0;
}





/* =========================
   INIT
   ========================= */
document.addEventListener("DOMContentLoaded", init);

async function init() {
  const ordersList      = $("#orders-list");
  const newOrderBtn     = $("#new-order-btn");
  const newOrderForm    = $("#new-order-form");
  const backToOrdersBtn = $("#back-to-orders");
  const orderTime       = $("#order-time");
  const saveOrderBtn    = $("#save-order-btn");
  const addDishesBtn    = $("#add-dishes-btn");
  const waiterSelect    = $("#waiter-select");
  const tableSelect     = $("#table-select");

  // 1) Catálogos y lista de pedidos
  await cargarCatalogos(); // estados + platillos
  await cargarPedidosDeApi(ordersList, agregarTarjetaPedido);

  // 2) Cargar selects por defecto (si se abre el form después se re-cargan)
  await cargarEmpleados(waiterSelect);
  await cargarMesasSelect();

  // 3) Abrir “nuevo pedido”
  newOrderBtn?.addEventListener("click", () => {
    // limpiar cualquier rastro de edición
    editingId = null;
    sessionStorage.removeItem(K_EDIT_ID);
    sessionStorage.removeItem(K_EDIT_EMP);
    sessionStorage.removeItem(K_EDIT_MESA);

    clearSnapshots();
    resetOrderForm();

    newOrderForm.classList.remove("hidden");
    ordersList.classList.add("hidden");
    newOrderBtn.classList.add("hidden");
    if (orderTime) orderTime.value = new Date().toLocaleDateString("es-ES");

    // preparar selects
    cargarEmpleados(waiterSelect);
    cargarMesasSelect();

    if (location.hash === "#new") history.replaceState({}, "", location.pathname);
  });

  // 4) Volver a la lista
  backToOrdersBtn?.addEventListener("click", () => {
    newOrderForm.classList.add("hidden");
    ordersList.classList.remove("hidden");
    newOrderBtn.classList.remove("hidden");

    setSeleccion([]); renderSeleccionUI();
    editingId = null;

    // limpiar estado de edición
    sessionStorage.removeItem(K_EDIT_ID);
    sessionStorage.removeItem(K_EDIT_EMP);
    sessionStorage.removeItem(K_EDIT_MESA);

    const saveBtn = $("#save-order-btn");
    if (saveBtn) saveBtn.textContent = "Guardar pedido";
  });

  // 5) Ir a seleccionar platillos
  addDishesBtn?.addEventListener("click", () => {
    saveFormSnapshot();
    sessionStorage.setItem(K_OPEN_FORM, "1");

    // si estamos editando, persistir ids necesarios
    if (Number.isFinite(Number(editingId)) && editingId > 0) {
      sessionStorage.setItem(K_EDIT_ID,   String(editingId));
      sessionStorage.setItem(K_EDIT_EMP,  String($("#waiter-select")?.value || ""));
      sessionStorage.setItem(K_EDIT_MESA, String($("#table-select")?.value  || ""));
    }

    const back = (location.pathname.split("/").pop() || "orders.html") + "#new";
    window.location.href = `menu.html?select=1&back=${encodeURIComponent(back)}`;
  });

  // 6) Guardar (crear/actualizar)
  saveOrderBtn?.addEventListener("click", async (e) => {
    e.preventDefault();
    try {
      if (!ESTADOS_ORDER.length) await cargarEstadosYSelect();

      if (editingId == null) {
        await crearPedidoDesdeSeleccion();
        showAlert("success", "Se agregó el pedido correctamente");
      } else {
        await actualizarPedido(editingId);
        showAlert("success", "Se actualizó el pedido correctamente");
        editingId = null;
      }

      // limpiar estado de edición SIEMPRE
      sessionStorage.removeItem(K_EDIT_ID);
      sessionStorage.removeItem(K_EDIT_EMP);
      sessionStorage.removeItem(K_EDIT_MESA);
      editingOriginalMesaId = null;
      editingOriginalPlatillos = new Set();

      // dejar form limpio y volver a la lista
      resetOrderForm();
      newOrderForm.classList.add("hidden");
      ordersList.classList.remove("hidden");
      newOrderBtn.classList.remove("hidden");

      // refrescar tarjetas y disponibilidad de mesas
      ordersList.innerHTML = "";
      await cargarPedidosDeApi(ordersList, agregarTarjetaPedido);
      await cargarMesasSelect();
    } catch (err) {
      if (err && err.message !== "VALIDATION") {
        showAlert("error", err.message || "No se pudo guardar el pedido");
      }
      console.error(err);
    }
  });

  // 7) Reapertura automática del formulario (volviste de menu.html o #new)
  if (sessionStorage.getItem(K_OPEN_FORM) === "1" || location.hash === "#new") {
    newOrderForm.classList.remove("hidden");
    ordersList.classList.add("hidden");
    newOrderBtn.classList.add("hidden");
    if (orderTime) orderTime.value = new Date().toLocaleDateString("es-ES");

    restoreFormSnapshot();
    renderSeleccionUI();

    // Restaurar modo edición si venimos de menu.html
    const storedEditId  = Number(sessionStorage.getItem(K_EDIT_ID)  || "");
    const storedEmpId   = Number(sessionStorage.getItem(K_EDIT_EMP)  || "");
    const storedMesaId  = Number(sessionStorage.getItem(K_EDIT_MESA) || "");

    if (Number.isFinite(storedEditId) && storedEditId > 0) {
      editingId = storedEditId;

      const saveBtn2 = $("#save-order-btn");
      if (saveBtn2) saveBtn2.textContent = "Actualizar pedido";

      await cargarEmpleados(waiterSelect, { initialId: storedEmpId || undefined });
      await cargarMesasSelect({ allowCurrentId: storedMesaId || undefined });

      if (storedMesaId && tableSelect) {
        tableSelect.value = String(storedMesaId);
        tableSelect.dispatchEvent(new Event("change", { bubbles: true }));
        if (tableSelect._fancy?.sync) tableSelect._fancy.sync();
      }
    } else {
      // No hay edición: cargar selects normales
      await cargarEmpleados(waiterSelect);
      await cargarMesasSelect();
    }

    sessionStorage.removeItem(K_OPEN_FORM);
  } else {
    renderSeleccionUI();
  }

  // 8) Skin
  applyModernSkin();
}


// Marca un campo inválido visualmente
function markInvalid(id) {
  const el = document.getElementById(id);
  if (!el) return;
  el.classList.add("ring-2","ring-red-500");
  el.scrollIntoView({ behavior: "smooth", block: "center" });
  setTimeout(() => el.classList.remove("ring-2","ring-red-500"), 1500);
}

function formatDateTimeLocal(d = new Date()) {
  const pad = (n) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${pad(d.getMonth()+1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}:${pad(d.getSeconds())}`;
}
