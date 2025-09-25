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

const $ = (s, r = document) => r.querySelector(s);
const $$ = (s, r = document) => Array.from(r.querySelectorAll(s));

let editingId = null;
// idPlatillo -> idDetalle de las líneas originales del pedido
let editingOriginalLinesByPlatillo = new Map();
// máximo idDetalle encontrado en el pedido al iniciar edición
let editingMaxIdDetalle = 0;

const K_EDIT_ID = "order_editing_id";
const K_EDIT_EMP = "order_editing_emp";
const K_EDIT_MESA = "order_editing_mesa";

const K_SEL = "ord_dishes_sel";
const K_OPEN_FORM = "abrirFormularioPedido";
const K_CLIENTE = "clienteTemporal";
const K_MESA = "mesaTemporal";
const K_WAITER = "waiterTemporal";

const LOCK_KEY = "mesas_locked_by_orders"; // para bloquear cambios en pantallas de Mesas

const PILL_NEUTRAL = "estado-pill text-xs px-2 py-1 rounded bg-gray-100 text-gray-700 capitalize";

let MAP_ESTADOS = new Map();  // id -> {id, nombre}
let ESTADOS_ORDER = [];         // [{id,nombre}] ordenado por id
let MAP_PLATILLOS = new Map();
let MAP_EMPLEADOS = new Map();
// Cache para filtrar/ordenar sin volver a pedir al backend
let ORDERS_CACHE = [];         // pedidos normalizados (fromApi)
// Vista global de tarjetas: "compact" por defecto
let VIEW_MODE = (() => {
  try {
    const s = JSON.parse(sessionStorage.getItem("orders_filters_v1") || "{}");
    return s?.vista || "compact";
  } catch { return "compact"; }
})();

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
  if (form) form.classList.add("rounded-2xl", "bg-white", "border", "border-gray-200", "shadow-md", "p-4", "md:p-6", "animate-[fadeIn_.25s_ease]");

  const list = document.getElementById("orders-list");
  if (list) {
    // quitamos cualquier grid previo
    list.classList.remove("md:grid-cols-2", "xl:grid-cols-3", "grid", "items-start", "orders-auto-grid");
    // activamos masonry por columnas
    list.classList.add("orders-masonry");
    list.style.removeProperty("--card-min");
  }

  [["new-order-btn", "bg-blue-600 hover:bg-blue-700"],
  ["save-order-btn", "bg-blue-600 hover:bg-blue-700"],
  ["back-to-orders", "bg-gray-200 hover:bg-gray-300"],
  ["add-dishes-btn", "bg-emerald-500 hover:bg-emerald-600"]]
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
          setTimeout(() => s.remove(), 600);
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

// Grid automático (legacy, no lo usamos ya como masonry)
(function ensureAutoGrid() {
  if (document.getElementById("orders-auto-grid-styles")) return;
  const st = document.createElement("style");
  st.id = "orders-auto-grid-styles";
  st.textContent = `
    #orders-list.orders-auto-grid{
      display: grid;
      grid-template-columns: repeat(auto-fit, minmax(var(--card-min, 300px), 1fr));
      gap: 1rem;
      align-items: start;
      overflow-anchor: none;
    }
    @media (max-width: 420px){
      #orders-list.orders-auto-grid{ grid-template-columns: 1fr; }
    }
  `;
  document.head.appendChild(st);
})();

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

/* =========================
   Overlay helpers
   ========================= */
function openOrderFormOverlay(){
  ensureOrderOverlayStyles();
  let overlay = document.getElementById("order-overlay");
  if (!overlay){
    overlay = document.createElement("div");
    overlay.id = "order-overlay";
    overlay.innerHTML = `<div id="order-sheet"></div>`;
    document.body.appendChild(overlay);
  }
  const sheet = overlay.querySelector("#order-sheet");
  const form = document.getElementById("new-order-form");
  if (!form || !sheet) return;

  // Guardamos el padre original para poder devolverlo
  if (!form._homeParent){
    form._homeParent = form.parentElement;
    form._homeNext = form.nextSibling; // para insertar en su posición original
  }
  sheet.appendChild(form);
  overlay.classList.add("open");

  // Asegura foco/scroll al inicio del form
  form.scrollTop = 0;
  form.querySelector("input, select, textarea, button")?.focus?.();
}

function closeOrderFormOverlay(){
  const overlay = document.getElementById("order-overlay");
  const form = document.getElementById("new-order-form");
  if (overlay && form && form._homeParent){
    if (form._homeNext && form._homeNext.parentNode === form._homeParent){
      form._homeParent.insertBefore(form, form._homeNext);
    } else {
      form._homeParent.appendChild(form);
    }
  }
  overlay?.classList.remove("open");
}

/* =========================
   Recargar pedidos + relayout masonry
   ========================= */
async function reloadOrdersList(){
  const container = document.getElementById("orders-list");
  if (!container) return;
  container.innerHTML = "";
  await cargarPedidosDeApi(container, agregarTarjetaPedido); // ya rehace masonry
  ensureFilterBar(); // mantiene la barra
}


// Evita que el viewport "salte" cuando cambia la altura
function withScrollFreeze(fn) {
  const x = window.scrollX, y = window.scrollY;
  try { fn(); } finally {
    requestAnimationFrame(() => window.scrollTo(x, y));
  }
}

function throttle(fn, wait = 150) {
  let t, last = 0;
  return (...a) => {
    const now = Date.now();
    if (now - last >= wait) { last = now; fn(...a); }
    else { clearTimeout(t); t = setTimeout(() => { last = Date.now(); fn(...a); }, wait - (now - last)); }
  };
}
const recalcExpandedHeights = throttle(() => {
  $$('.o-card .o-extra.expanded').forEach(el => {
    el.style.maxHeight = el.scrollHeight + 'px';
  });
}, 120);

window.addEventListener('resize', recalcExpandedHeights);
window.addEventListener('load', recalcExpandedHeights);

/* =========================
   Masonry por columnas (NO grid-auto-rows)
   ========================= */
/* =========================
   Masonry por columnas (FLEX, sin reequilibrado automático)
   ========================= */
/* =========================
   Masonry por columnas (GRID, sin scroll lateral)
   ========================= */
(function ensureMasonryStyles() {
  const ID = "orders-masonry-styles";
  const old = document.getElementById(ID);
  if (old) old.remove();

  const st = document.createElement("style");
  st.id = ID;
  st.textContent = `
    /* Contenedor: grid de N columnas iguales, sin overflow horizontal */
    #orders-list.orders-masonry{
      --col-count: 1;
      --gap: 16px;
      --card-min: 300px;   /* usado sólo para calcular N columnas */
      display: grid;
      grid-template-columns: repeat(var(--col-count), minmax(0, 1fr));
      column-gap: var(--gap);
      row-gap: 16px;
      width: 100%;
      max-width: 100%;
      overflow-x: hidden;   /* ¡nada de scroll lateral! */
      align-items: start;
    }
    @media (min-width: 1400px){
      #orders-list.orders-masonry{ --gap: 20px; --card-min: 340px; }
    }
    @media (max-width: 768px){
      #orders-list.orders-masonry{ --gap: 14px; --card-min: 100%; } /* fuerza 1 col */
    }

    /* Cada columna es un stack vertical */
    #orders-list.orders-masonry .m-col{
      display: flex;
      flex-direction: column;
      gap: 16px;
      min-width: 0; /* evita desbordes por contenido */
    }

    /* Por seguridad: no permitir .o-card suelta en el grid raíz */
    #orders-list.orders-masonry > .o-card{ display:none !important; }

    /* Animación del expandible (igual que antes) */
    .o-extra{
      overflow: hidden;
      transition: max-height .32s ease, opacity .20s ease;
      will-change: max-height;
    }
    .o-extra.collapsed{ max-height:0; opacity:0; }
    .o-extra.expanded{ opacity:1; }
  `;
  document.head.appendChild(st);
})();



/* (ELIMINADO) — No usamos grid-auto-rows ni spans personalizados */

/* =========================
   Colores / helpers
   ========================= */
function accentForEstado(nombre) {
  const n = (nombre || "").toLowerCase();
  if (n.includes("pend")) return "#F59E0B"; // amber
  if (n.includes("prep") || n.includes("proces")) return "#3B82F6"; // blue
  if (n.includes("entreg")) return "#10B981"; // emerald
  if (n.includes("pag")) return "#16A34A"; // green
  if (n.includes("cancel") || n.includes("anul")) return "#EF4444"; // red
  return "#6B7280"; // gray
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
  const res = await fetch(url, { method: "PATCH", credentials: "include" });
  return res.ok;
}
async function ocuparMesa(idMesa) { await tryUpdateMesaEstado(idMesa, 2); } // Ocupada
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
  ESTADOS_ORDER = Array.from(MAP_ESTADOS.values()).sort((a, b) => a.id - b.id);

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
async function cargarEmpleados(waiterSelect, opts = {}) {
  if (!waiterSelect) return;
  const { initialId = null } = opts;

  const url = `${API_HOST}/apiEmpleado/getDataEmpleado?page=0&size=50`;

  let empleados = [];
  try {
    const res = await fetch(url, { credentials: "include" });
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
    } catch { }
  }
  if (!preferredId && empleados.length) preferredId = Number(empleados[0].id ?? empleados[0].Id);

  // Etiqueta legible
  let label = `Empleado #${preferredId || "-"}`;
  try {
    const user = JSON.parse(sessionStorage.getItem("ord_user") || "null");
    if (user && Number(user.id) === preferredId) {
      label = `${user.nombre || label}${user.username ? " — " + user.username : ""}`;
    }
  } catch { }

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
  if (raw.includes("ocup")) return "ocupada";
  if (raw.includes("reserv")) return "reservada";
  if (raw.includes("limp")) return "limpieza";
  return "desconocido";
}
function tituloEstado(s) {
  const t = String(s || "").toLowerCase();
  return t.charAt(0).toUpperCase() + t.slice(1);
}
function idMesaFrom(m) {
  return Number(m.id ?? m.Id ?? m.idMesa ?? m.IdMesa ?? m.codigo ?? m.numMesa ?? m.numero ?? NaN);
}
function nombreMesaFrom(m) {
  return String(m?.nomMesa ?? m?.numero ?? m?.numMesa ?? idMesaFrom(m) ?? "?");
}
function getEstadoMesaNormalized(m) {
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
  const raw = (
    m.nomEstadoMesa ?? m.nomEstado ??
    (m.estadoMesa && (m.estadoMesa.nomEstado ?? m.estadoMesa.nombre ?? m.estadoMesa.estado)) ??
    (m.estado && (m.estado.nomEstado ?? m.estado.nombre ?? m.estado.estado)) ??
    m.estado ?? ""
  ).toString().toLowerCase();

  if (raw.includes("dispon")) return "disponible";
  if (raw.includes("ocup")) return "ocupada";
  if (raw.includes("reserv")) return "reservada";
  if (raw.includes("limp")) return "limpieza";

  return "desconocido";
}

// Carga mesas con estado real
// Carga mesas con estado real (robusto si pedidos/estados fallan)
async function cargarMesasSelect(opts = {}) {
  const { allowCurrentId = null } = opts;
  const sel = document.getElementById("table-select");
  if (!sel) return;

  sel.className =
    "w-full max-w-full p-2 md:p-2.5 rounded-lg border border-gray-300 focus:ring-2 focus:ring-blue-500 focus:border-blue-500 text-sm md:text-base bg-white shadow-sm";
  sel.innerHTML = `<option value="" disabled selected>Seleccione una mesa disponible…</option>`;

  const urlMesas = `${API_HOST}/apiMesa/getDataMesa?page=0&size=50`;
  const urlEM   = `${API_HOST}/apiEstadoMesa/getDataEstadoMesa?page=0&size=50`;
  const urlPed  = `${API_HOST}/apiPedido/getDataPedido?page=0&size=50`;
  const urlEP   = `${API_HOST}/apiEstadoPedido/getDataEstadoPedido?page=0&size=50`;

  const getId = (o) => Number(o.id ?? o.Id);
  const nomMesa = (m) => String(m.nomMesa ?? `Mesa ${getId(m)}`);
  const idEstMesa = (m) => Number(m.idEstadoMesa ?? m.IdEstadoMesa);
  const nomEstadoMesa = (e) => String(e.estadoMesa ?? e.nombre ?? e.nomEstado ?? e.estado ?? "").trim();
  const nomEstadoPedido = (e) => String(e.nomEstado ?? e.nombre ?? "").trim();
  const cap = (s) => (s ? s.charAt(0).toUpperCase() + s.slice(1).toLowerCase() : s);

  let mesas = [], estadosMesa = [], pedidos = [], estadosPed = [];

  // Cargamos cada cosa de forma independiente para no romper si una falla
  try {
    const rM = await fetch(urlMesas, { credentials: "include" });
    if (rM.ok) {
      const dM = await rM.json().catch(() => ({}));
      mesas = Array.isArray(dM?.content) ? dM.content : (Array.isArray(dM) ? dM : []);
    }
  } catch (e) {
    console.error("[Mesas] Error obteniendo mesas:", e);
  }

  try {
    const rEM = await fetch(urlEM, { credentials: "include" });
    if (rEM.ok) {
      const dEM = await rEM.json().catch(() => ({}));
      estadosMesa = Array.isArray(dEM?.content) ? dEM.content : (Array.isArray(dEM) ? dEM : []);
  } } catch (e) {
    console.error("[Mesas] Error obteniendo estados de mesa:", e);
  }

  try {
    const rEP = await fetch(urlEP, { credentials: "include" });
    if (rEP.ok) {
      const dEP = await rEP.json().catch(() => ({}));
      estadosPed = Array.isArray(dEP?.content) ? dEP.content : (Array.isArray(dEP) ? dEP : []);
    }
  } catch (e) {
    console.error("[Mesas] Error obteniendo estados de pedido:", e);
  }

  // Pedidos es el que te estaba fallando: lo envolvemos y si hay error continuamos sin bloquear la UI
  try {
    const rP = await fetch(urlPed, { credentials: "include" });
    if (rP.ok) {
      const dP = await rP.json().catch(() => ({}));
      pedidos = Array.isArray(dP?.content) ? dP.content : (Array.isArray(dP) ? dP : []);
    } else {
      console.warn("[Mesas] No se pudieron obtener pedidos (status", rP.status, "). Continuamos sin bloquear la lista de mesas.");
      pedidos = []; // fallback
    }
  } catch (e) {
    console.warn("[Mesas] Error obteniendo pedidos. Continuamos sin bloquear:", e?.message || e);
    pedidos = []; // fallback
  }

  const MAP_ID_ESTADO_MESA_NOMBRE = new Map(estadosMesa.map(e => [getId(e), nomEstadoMesa(e)]));
  const MAP_ID_ESTADO_PED_NOMBRE  = new Map(estadosPed.map(e => [getId(e), nomEstadoPedido(e)]));

  let idDisponible = null;
  for (const e of estadosMesa) {
    if (nomEstadoMesa(e).toLowerCase().includes("dispon")) { idDisponible = getId(e); break; }
  }
  if (idDisponible == null) {
    console.warn("[Mesas] No hay estado 'Disponible' en catálogo.");
    if (typeof upgradeSelect === "function") upgradeSelect(sel, { placeholder: "Mesa" });
    return;
  }

  const esPedidoCerrado = (nombre) => {
    const s = (nombre || "").toLowerCase();
    return s.includes("pag") || s.includes("final") || s.includes("cancel") ||
           s.includes("cerr") || s.includes("entreg") || s.includes("complet") ||
           s.includes("rechaz") || s.includes("anul");
  };

  // Si pedidos viene vacío por auth, simplemente NO bloqueamos mesas por pedidos
  const mesasConPedidoActivo = new Set(
    (pedidos || [])
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
   Normalizador pedido UI
   ========================= */
function fromApi(p) {
  const id = Number(p.id ?? p.Id ?? p.idPedido ?? p.ID);
  const fecha = (p.fpedido ?? p.FPedido ?? p.fechaPedido ?? p.fecha ?? "").toString();
  const horaFin = (p.horaFin ?? p.HoraFin ?? p.horafin ?? null);
  const estadoId = Number(p.idEstadoPedido ?? p.IdEstadoPedido ?? p.estadoId ?? 0);
  const estadoNombre = MAP_ESTADOS.get(estadoId)?.nombre || "";
  const nombreCliente = (p.nombreCliente ?? p.nombrecliente ?? p.Cliente ?? p.cliente ?? "").toString();
  const idMesa = Number(p.idMesa ?? p.IdMesa ?? p.mesaId ?? 0);

  let platillos = [];
  if (Array.isArray(p.items) && p.items.length) {
    platillos = p.items.map(it => {
      const idPlat = Number(it.idPlatillo ?? it.IdPlatillo ?? it.id ?? it.Id);
      const cant = Number(it.cantidad ?? it.Cantidad ?? 1);
      const pu = (it.precioUnitario ?? it.PrecioUnitario);
      const info = MAP_PLATILLOS.get(idPlat);
      const idDet = Number(it.idDetalle ?? it.IdDetalle ?? it.linea ?? it.Linea ?? 0);
      return {
        idPlatillo: idPlat,
        idDetalle: Number.isFinite(idDet) ? idDet : undefined,
        nombre: info?.nomPlatillo ?? `#${idPlat}`,
        cantidad: cant,
        precio: Number(pu ?? info?.precio ?? 0)
      };
    });
  }

  const subtotalCalc = platillos.reduce((acc, x) => acc + (Number(x.precio) || 0) * (Number(x.cantidad) || 0), 0);
  const subtotal = Number((p.subtotal ?? p.Subtotal ?? subtotalCalc) ?? 0);
  const propina = Number(p.propina ?? p.Propina ?? +(subtotal * 0.10).toFixed(2));
  const total = Number(p.totalPedido ?? p.TotalPedido ?? +(subtotal + propina).toFixed(2));

  return {
    id,
    Cliente: nombreCliente,
    Mesa: String(idMesa || ""),
    Mesero: "",
    Hora: fecha,                // HORA_INICIO
    HoraFin: horaFin || null,   // HORA_FIN (puede venir null)
    Estado: estadoNombre,
    Platillos: platillos,
    _subtotal: subtotal,
    _propina: propina,
    _total: total,

    idMesa,
    idEmpleado: Number(p.idEmpleado ?? p.IdEmpleado ?? 0),
    idEstadoPedido: estadoId,
    idPlatillo: Number(p.idPlatillo ?? p.IdPlatillo ?? 0),
    Observaciones: (p.observaciones ?? p.Observaciones ?? "").toString()
  };
}



function getUniqueMesasFromCache() {
  const set = new Set(ORDERS_CACHE.map(o => Number(o.Mesa || o.idMesa || 0)).filter(Boolean));
  return Array.from(set).sort((a, b) => a - b);
}

(function ensureCardUX() {
  if (document.getElementById("orders-card-ux")) return;
  const st = document.createElement("style");
  st.id = "orders-card-ux";
  st.textContent = `
  .o-card{position:relative; overflow:hidden; border-radius:16px}
  .o-card .o-stripe{position:absolute; top:0; left:0; right:0; height:6px; background:var(--accent,#6366F1)}
  .o-head{display:flex; align-items:flex-start; justify-content:space-between; gap:.5rem}
  .o-toggle{display:inline-flex; align-items:center; gap:.35rem; border:1px solid #e5e7eb; background:#fff;
            border-radius:9999px; padding:.25rem .55rem; font-size:.8rem}
  .o-toggle .chev{transition:transform .18s ease}
  .o-extra{overflow:hidden; transition:max-height .28s ease, opacity .2s ease}
  .o-extra.collapsed{max-height:0; opacity:0}
  .o-extra.expanded{opacity:1}
  .o-meta{display:grid; grid-template-columns:repeat(3,minmax(0,1fr)); gap:.5rem}
  @media (max-width:640px){ .o-meta{grid-template-columns:repeat(2,minmax(0,1fr));} }
  @media (max-width:380px){
    .o-card{border-radius:14px}
    .o-card.p-4{padding:12px}
    .o-meta{grid-template-columns:1fr}
    .of-search{padding:.5rem .75rem}
    .of-filter-btn{width:36px; height:36px}
    .fs-control{min-height:36px}
  }
  `;
  document.head.appendChild(st);
})();

/* Barra de filtros */
function ensureFilterBar() {
  const list = document.getElementById("orders-list");
  if (!list) return;
  let bar = document.getElementById("orders-filters");
  if (bar) return bar;

  const K_FILTROS = "orders_filters_v1";
  const saved = (() => { try { return JSON.parse(sessionStorage.getItem(K_FILTROS) || "{}"); } catch { return {}; } })();

  const estadosOpts = (ESTADOS_ORDER || []).map(e => `<option value="${e.id}">${e.nombre}</option>`).join("");
  const mesasOpts = (() => {
    const set = new Set(ORDERS_CACHE.map(o => Number(o.Mesa || o.idMesa || 0)).filter(Boolean));
    return Array.from(set).sort((a, b) => a - b).map(m => `<option value="${m}">${m}</option>`).join("");
  })();

  bar = document.createElement("div");
  bar.id = "orders-filters";
  bar.className = "of-bar";

  bar.innerHTML = `
    <div class="of-search">
      <svg width="18" height="18" viewBox="0 0 24 24" aria-hidden="true"><path fill="currentColor" d="M15.5 14h-.79l-.28-.27A6.471 6.471 0 0 0 16 9.5 6.5 6.5 0 1 0 9.5 16c1.61 0 3.09-.59 4.23-1.57l.27.28v.79l5 5 1.5-1.5-5-5zM9.5 14A4.5 4.5 0 1 1 14 9.5 4.5 4.5 0 0 1 9.5 14"/></svg>
      <input id="f-q" type="text" placeholder="Buscar por cliente o platillo…" />
      <button id="f-open" class="of-filter-btn" title="Filtros">
        <svg width="18" height="18" viewBox="0 0 24 24" aria-hidden="true"><path fill="currentColor" d="M10 18h4v-2h-4v2zm-7-7v2h18v-2H3zM6 5v2h12V5H6z"/></svg>
      </button>
    </div>

    <div id="f-overlay" class="of-overlay"></div>
    <div id="f-panel" class="of-panel">
      <div class="p-4 md:p-5">
        <div class="flex items-center justify-between mb-3">
          <div class="text-base font-semibold">Filtros</div>
          <button id="f-close" class="o-toggle border rounded-lg px-3 py-1.5 bg-gray-50 hover:bg-gray-100">Cerrar ✕</button>
        </div>

        <div class="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
          <div>
            <label class="text-xs text-gray-500">Estado</label>
            <select id="f-estado" class="w-full rounded-lg border border-gray-300 px-3 py-2">
              <option value="">Todos</option>${estadosOpts}
            </select>
          </div>
          <div>
            <label class="text-xs text-gray-500">Mesa</label>
            <select id="f-mesa" class="w-full rounded-lg border border-gray-300 px-3 py-2">
              <option value="">Todas</option>${mesasOpts}
            </select>
          </div>
          <div>
            <label class="text-xs text-gray-500">Vista</label>
            <select id="f-vista" class="w-full rounded-lg border border-gray-300 px-3 py-2">
              <option value="full">Completa</option>
              <option value="compact" selected>Compacta</option>
            </select>
          </div>
          <div>
            <label class="text-xs text-gray-500">Desde</label>
            <input id="f-desde" type="date" class="w-full rounded-lg border border-gray-300 px-3 py-2">
          </div>
          <div>
            <label class="text-xs text-gray-500">Hasta</label>
            <input id="f-hasta" type="date" class="w-full rounded-lg border border-gray-300 px-3 py-2">
          </div>
          <div class="sm:col-span-2 lg:col-span-3 flex justify-end gap-2">
            <button id="f-clear" class="rounded-lg bg-gray-100 hover:bg-gray-200 px-3 py-2">Limpiar</button>
            <button id="f-apply" class="rounded-lg bg-blue-600 hover:bg-blue-700 text-white px-4 py-2">Aplicar</button>
          </div>
        </div>
      </div>
    </div>
  `;
  list.insertAdjacentElement("beforebegin", bar);

  const sEstado = bar.querySelector("#f-estado");
  const sMesa = bar.querySelector("#f-mesa");
  const sVista = bar.querySelector("#f-vista");
  upgradeSelect?.(sEstado, { placeholder: "Estado" });
  upgradeSelect?.(sMesa, { placeholder: "Mesa" });
  upgradeSelect?.(sVista, { placeholder: "Vista" });

  if (saved.q) bar.querySelector("#f-q").value = saved.q;
  if (saved.estado && sEstado.querySelector(`option[value="${saved.estado}"]`)) sEstado.value = saved.estado, sEstado.dispatchEvent(new Event("change", { bubbles: true }));
  if (saved.mesa && sMesa.querySelector(`option[value="${saved.mesa}"]`)) sMesa.value = saved.mesa, sMesa.dispatchEvent(new Event("change", { bubbles: true }));
  if (saved.vista) sVista.value = saved.vista, sVista.dispatchEvent(new Event("change", { bubbles: true }));
  if (saved.desde) bar.querySelector("#f-desde").value = saved.desde;
  if (saved.hasta) bar.querySelector("#f-hasta").value = saved.hasta;

  const overlay = bar.querySelector("#f-overlay");
  const panel = bar.querySelector("#f-panel");
  const open = () => { overlay.classList.add("open"); panel.classList.add("open"); };
  const close = () => { overlay.classList.remove("open"); panel.classList.remove("open"); };
  bar.querySelector("#f-open").addEventListener("click", open);
  overlay.addEventListener("click", close);
  bar.querySelector("#f-close").addEventListener("click", close);

  const saveState = () => {
    const st = {
      q: bar.querySelector("#f-q").value.trim(),
      estado: sEstado.value || "",
      mesa: sMesa.value || "",
      vista: sVista.value || "compact",
      desde: bar.querySelector("#f-desde").value || "",
      hasta: bar.querySelector("#f-hasta").value || ""
    };
    sessionStorage.setItem("orders_filters_v1", JSON.stringify(st));
    VIEW_MODE = st.vista || "full";
  };

  const rerender = () => {
    saveState();
    const container = document.getElementById("orders-list");
    renderOrdersList(container, agregarTarjetaPedido);
  };

  bar.querySelector("#f-q").addEventListener("input", () => rerender());
  bar.querySelector("#f-apply").addEventListener("click", () => { rerender(); close(); });
  bar.querySelector("#f-clear").addEventListener("click", () => {
    bar.querySelector("#f-q").value = "";
    sEstado.value = ""; sEstado.dispatchEvent(new Event("change", { bubbles: true }));
    sMesa.value = ""; sMesa.dispatchEvent(new Event("change", { bubbles: true }));
    sVista.value = "full"; sVista.dispatchEvent(new Event("change", { bubbles: true }));
    bar.querySelector("#f-desde").value = "";
    bar.querySelector("#f-hasta").value = "";
    rerender();
  });

  sVista.addEventListener("change", rerender);
  return bar;
}

function aplicarFiltros(arr) {
  const bar = document.getElementById("orders-filters");
  if (!bar) return arr;

  const q = bar.querySelector("#f-q").value.trim().toLowerCase();
  const estado = bar.querySelector("#f-estado").value;
  const mesa = bar.querySelector("#f-mesa").value;
  const desde = bar.querySelector("#f-desde").value;
  const hasta = bar.querySelector("#f-hasta").value;

  return arr.filter(p => {
    if (q) {
      const hay = (p.Cliente || "").toLowerCase().includes(q)
        || (p.Platillos || []).some(x => (x.nombre || "").toLowerCase().includes(q));
      if (!hay) return false;
    }
    if (estado && Number(estado) !== Number(p.idEstadoPedido)) return false;
    if (mesa && String(mesa) !== String(p.Mesa || p.idMesa || "")) return false;

    if (desde) {
      const d = new Date((p.Hora || "").replace(" ", "T"));
      const min = new Date(desde + "T00:00:00");
      if (isNaN(d) || d < min) return false;
    }
    if (hasta) {
      const d = new Date((p.Hora || "").replace(" ", "T"));
      const max = new Date(hasta + "T23:59:59");
      if (isNaN(d) || d > max) return false;
    }
    return true;
  });
}

function renderOrdersList(container, onAddCard) {
  const list = aplicarFiltros(ORDERS_CACHE);
  container.classList.add("orders-masonry");

  if (!list.length) {
    container.innerHTML = `
      <div class="w-full py-12 flex items-center justify-center">
        <div class="text-center text-gray-500">
          <div class="text-lg font-medium mb-1">Sin resultados</div>
          <div class="text-sm">Ajusta los filtros para ver pedidos.</div>
        </div>
      </div>`;
    return;
  }

  // Guardamos para re-layout en resize
  container._masonryData = { items: list, onAddCard };
  layoutMasonryColumns(container, list, onAddCard);
  ensureMasonryResizeHandler(container);
}



/* =========================
   Masonry helpers (flex + columnas fijas)
   ========================= */
function computeColCount(container){
  // Calcula cuántas columnas caben según --card-min
  const styles = getComputedStyle(container);
  const minRaw = styles.getPropertyValue('--card-min').trim();
  let min;
  if (minRaw.endsWith('%')) {
    // 100% => 1 columna
    min = container.clientWidth; 
  } else {
    min = parseInt(minRaw) || 300;
  }
  const w = container.clientWidth || container.offsetWidth || 0;
  return Math.max(1, Math.floor(w / Math.max(min, 1)));
}


function layoutMasonryColumns(container, items, onAddCard){
  container.innerHTML = "";
  container.classList.add("orders-masonry");

  const colsCount = computeColCount(container);
  container.style.setProperty('--col-count', String(colsCount)); // <- grid sin overflow

  const cols = [];
  const heights = [];

  for (let i = 0; i < colsCount; i++){
    const c = document.createElement("div");
    c.className = "m-col";
    container.appendChild(c);
    cols.push(c);
    heights.push(0);
  }

  items.forEach((pedido) => {
    let idxMin = 0;
    for (let i = 1; i < cols.length; i++){
      if (heights[i] < heights[idxMin]) idxMin = i;
    }
    const col = cols[idxMin];
    const before = col.offsetHeight;
    onAddCard(pedido, col);
    const after = col.offsetHeight;
    heights[idxMin] += Math.max(0, after - before);
  });

  requestAnimationFrame(() => { 
    typeof recalcExpandedHeights === "function" && recalcExpandedHeights();
  });
}

function ensureMasonryResizeHandler(container){
  if (container._masonryResizeAttached) return;
  container._masonryResizeAttached = true;

  const relayout = throttle(() => {
    if (!container._masonryData) return;
    const prevCols = parseInt(getComputedStyle(container).getPropertyValue('--col-count')) || 1;
    const nextCols = computeColCount(container);
    if (prevCols !== nextCols){
      layoutMasonryColumns(container, container._masonryData.items, container._masonryData.onAddCard);
    }
  }, 180);

  window.addEventListener("resize", relayout);
}


// === Helpers visuales para las tarjetas ===
function fmtMoney(n) { return Number(n || 0).toFixed(2); }
function fmtFechaCorta(s) {
  if (!s) return "-";
  try {
    const d = (s instanceof Date) ? s : new Date(String(s).replace(" ", "T"));
    if (Number.isNaN(d.getTime())) return String(s);
    return d.toLocaleString("es-ES", { dateStyle: "medium", timeStyle: "short" });
  } catch { return String(s); }
}
function getEmpleadoNombre(idEmp) {
  const emp = MAP_EMPLEADOS.get(Number(idEmp));
  return emp?.nombre || (idEmp ? `Empleado #${idEmp}` : "—");
}
function badgeColorForEstado(nombre) {
  const n = (nombre || "").toLowerCase();
  if (n.includes("pend")) return "bg-yellow-100 text-yellow-800 ring-yellow-200";
  if (n.includes("prep") || n.includes("proces")) return "bg-blue-100 text-blue-800 ring-blue-200";
  if (n.includes("entreg")) return "bg-emerald-100 text-emerald-800 ring-emerald-200";
  if (n.includes("pag")) return "bg-green-100 text-green-800 ring-green-200";
  if (n.includes("cancel") || n.includes("anul")) return "bg-red-100 text-red-800 ring-red-200";
  return "bg-gray-100 text-gray-700 ring-gray-200";
}

(function ensureCardStyles() {
  const ID = "orders-card-extras";
  if (document.getElementById(ID)) return;
  const st = document.createElement("style");
  st.id = ID;
  st.textContent = `
    .o-card{position:relative;overflow:hidden;border-radius:16px;background:#fff;
      border:1px solid #e5e7eb;box-shadow:0 8px 24px rgba(0,0,0,.08);
      transition:box-shadow .2s ease, transform .2s ease}
    .o-card:hover{box-shadow:0 16px 40px rgba(0,0,0,.12); transform:translateY(-2px)}
    .o-stripe{position:absolute;top:0;left:0;right:0;height:6px;background:var(--accent,#6366F1)}
    .o-badge{display:inline-flex;align-items:center;gap:.4rem;padding:.15rem .5rem;border-radius:9999px;
      font-size:.75rem;font-weight:600;line-height:1;border-width:1px}
    .o-meta{display:grid;grid-template-columns:repeat(3,minmax(0,1fr));gap:.5rem}
    @media (max-width:640px){ .o-meta{grid-template-columns:1fr} }
    .o-meta div{background:#fafafa;border:1px solid #eee;border-radius:.6rem;padding:.35rem .6rem}
    .o-list li{display:flex;justify-content:space-between;gap:.75rem}
    .o-act button{position:relative}
    .compact-only{display:none;}
    .is-compact .full-only{display:none !important;}
    .is-compact .compact-only{display:block !important;}
    .o-toggle{font-size:.8rem;padding:.25rem .5rem;border-radius:.6rem;border:1px solid #e5e7eb}
  `;
  document.head.appendChild(st);
})();

(function ensureFiltersStyles() {
  if (document.getElementById("orders-filters-styles")) return;
  const st = document.createElement("style");
  st.id = "orders-filters-styles";
  st.textContent = `
  .of-bar{position:sticky; top:0; z-index:30; background:transparent; margin-bottom:.75rem}
  .of-search{display:flex; align-items:center; gap:.5rem; background:#fff; border:1px solid #e5e7eb;
    border-radius:9999px; padding:.6rem .9rem; box-shadow:0 8px 24px rgba(0,0,0,.06)}
  .of-search input{flex:1; border:0; outline:0; background:transparent; font-size:0.95rem}
  .of-filter-btn{width:40px; height:40px; border-radius:50%; border:1px solid #e5e7eb;
    background:#fff; display:grid; place-items:center; box-shadow:0 4px 12px rgba(0,0,0,.06)}
  .of-overlay{position:fixed; inset:0; background:rgba(0,0,0,.40); backdrop-filter:blur(2px);
    opacity:0; pointer-events:none; transition:opacity .2s ease; z-index:40}
  .of-panel{position:fixed; left:50%; transform:translateX(-50%) translateY(-8px); top:72px;
    width:min(960px,94vw); background:#fff; border:1px solid #e5e7eb; border-radius:16px;
    box-shadow:0 24px 64px rgba(0,0,0,.20); opacity:0; pointer-events:none; transition:opacity .2s, transform .2s; z-index:45}
  .of-panel.open, .of-overlay.open{opacity:1; pointer-events:auto}
  .of-panel.open{transform:translateX(-50%) translateY(0)}
  @media (max-width:640px){
    .of-panel{top:auto; bottom:0; left:0; right:0; transform:translateY(100%); width:100%; border-radius:16px 16px 0 0}
    .of-panel.open{transform:translateY(0)}
  }
  `;
  document.head.appendChild(st);
})();

(function ensureGridCardFix() {
  if (document.getElementById("orders-grid-card-fix")) return;
  const st = document.createElement("style");
  st.id = "orders-grid-card-fix";
  st.textContent = `
    #orders-list{align-items:start}
    #orders-list > *{align-self:start}
    .o-card{height:auto}
    .o-meta > div{min-width:0}
    .o-meta .fancy-select{display:block; width:100%; min-width:0}
    .o-meta .fancy-select .fs-control{min-height:42px}
    .o-extra{overflow:hidden; transition:max-height .28s ease, opacity .2s ease}
    .o-extra.no-anim{transition:none !important}
    .o-extra.collapsed{max-height:0; opacity:0}
    .o-extra.expanded{opacity:1}
  `;
  document.head.appendChild(st);
})();

(function ensureGlobalUiFixes() {
  if (document.getElementById("global-ui-fixes")) return;
  const st = document.createElement("style");
  st.id = "global-ui-fixes";
  st.textContent = `
    .fancy-select{display:block; width:100%}
    .fancy-select .fs-control{display:flex; width:100%; min-height:40px}
    @media (min-width:768px){ .fancy-select .fs-control{min-height:44px; font-size:.95rem} }
    .fancy-select .fs-chips{min-width:0}
    .o-extra{overflow:hidden; transition:max-height .28s ease, opacity .2s ease}
    .o-extra.no-anim{transition:none !important}
    .o-extra.collapsed{max-height:0; opacity:0}
    .o-extra.expanded{opacity:1}
  `;
  document.head.appendChild(st);
})();

/* =========================
   Overlay para el formulario (estilos)
   ========================= */
function ensureOrderOverlayStyles(){
  if (document.getElementById("order-overlay-styles")) return;
  const st = document.createElement("style");
  st.id = "order-overlay-styles";
  st.textContent = `
    #order-overlay{
      position: fixed; inset: 0; z-index: 1000; display: none;
      align-items: flex-start; justify-content: center;
      background: rgba(0,0,0,.42); backdrop-filter: blur(2px);
      padding: 24px 16px; overflow-y: auto;
    }
    #order-overlay.open{ display:flex; }
    #order-sheet{
      width: min(980px, 96vw);
      background: #fff; border: 1px solid #e5e7eb; border-radius: 16px;
      box-shadow: 0 24px 64px rgba(0,0,0,.25);
      padding: 16px;
      animation: sheetIn .18s ease;
    }
    @keyframes sheetIn{ from{ opacity:0; transform: translateY(8px) } to{ opacity:1; transform:none } }
  `;
  document.head.appendChild(st);
}


/* =========================
   Tarjeta de pedido
   ========================= */
function agregarTarjetaPedido(pedido, container) {
  const estadoNombre = pedido.Estado || MAP_ESTADOS.get(Number(pedido.idEstadoPedido))?.nombre || "-";
  const badgeCls = badgeColorForEstado(estadoNombre);
  const accent = accentForEstado(estadoNombre);

  const card = document.createElement("article");
  card.className = "o-card border border-gray-200 rounded-2xl p-4 bg-white shadow-sm";
  card.style.setProperty("--accent", accent);

  const items = (pedido.Platillos || []);
  const itemsHTML = items.length
    ? items.map(x => `
        <li class="flex justify-between gap-2">
          <span class="truncate">${x.nombre} <span class="text-gray-500">(x${x.cantidad || x.qty || 1})</span></span>
          <span class="shrink-0">$${Number((x.precio || 0) * (x.cantidad || x.qty || 1)).toFixed(2)}</span>
        </li>
      `).join("")
    : `<li class="text-gray-500">(sin platillos)</li>`;

  const total = Number(pedido._total || 0).toFixed(2);
  const subtotal = Number(pedido._subtotal || 0).toFixed(2);
  const propina = Number(pedido._propina || 0).toFixed(2);
  const fechaBon = fmtFechaCorta(pedido.Hora);
  const nomMesa = pedido.Mesa ? String(pedido.Mesa) : "-";
  const nomEmp = getEmpleadoNombre(pedido.idEmpleado);
  const obs = pedido.Observaciones || "—";

  const estadosOpts = (ESTADOS_ORDER || [])
    .map(e => `<option value="${e.id}" ${Number(e.id) === Number(pedido.idEstadoPedido) ? "selected" : ""}>${e.nombre}</option>`)
    .join("");

  card.innerHTML = `
    <div class="o-stripe"></div>
    <header class="o-head">
      <div class="min-w-0">
        <div class="text-xs text-gray-500">Cliente</div>
        <div class="text-lg font-semibold truncate">${pedido.Cliente || "-"}</div>
      </div>
      <div class="flex items-center gap-2">
        <span class="o-badge ring ${badgeCls}">
          <span class="w-2 h-2 rounded-full bg-current opacity-60"></span>
          <span class="capitalize">${estadoNombre}</span>
        </span>
        <button class="o-toggle" type="button" title="Expandir/compactar">
          <span class="lbl hidden sm:inline">Detalle</span>
          <svg class="chev" width="16" height="16" viewBox="0 0 24 24" aria-hidden="true">
            <path fill="currentColor" d="M7 10l5 5 5-5z"/>
          </svg>
        </button>
      </div>
    </header>

    <div class="mt-2 text-sm text-gray-700">
      <div class="flex items-center gap-2">
        <div class="text-xs text-gray-500">Mesa</div>
        <div class="font-medium">${nomMesa}</div>
        <div class="text-gray-300">•</div>
        <div class="text-xs text-gray-500">Fecha</div>
        <div class="font-medium">${fechaBon}</div>
      </div>
      <ul class="mt-2 space-y-1">${itemsHTML}</ul>
      <div class="mt-2 text-right">
        <span class="text-xs text-gray-500 mr-1">Total</span>
        <span class="text-base font-semibold">$${total}</span>
      </div>
    </div>

    <section class="o-extra collapsed mt-3">
      <div class="o-meta text-sm text-gray-700">
        <div><div class="text-xs text-gray-500">Mesero</div><div class="font-medium truncate">${nomEmp}</div></div>
        <div class="estado-cell">
          <div class="text-xs text-gray-500 mb-0.5">Estado</div>
          <select id="sel-estado-${pedido.id}" class="w-full rounded-lg border border-gray-300 bg-white px-2 py-1">
            ${estadosOpts}
          </select>
        </div>
        <div><div class="text-xs text-gray-500">Observaciones</div><div class="font-medium truncate">${obs}</div></div>
      </div>

      <div class="mt-3 text-sm text-gray-700 grid grid-cols-3 gap-2">
        <div class="bg-gray-50 border border-gray-200 rounded-lg p-2">
          <div class="text-xs text-gray-500">Subtotal</div><div class="font-semibold">$${subtotal}</div>
        </div>
        <div class="bg-gray-50 border border-gray-200 rounded-lg p-2">
          <div class="text-xs text-gray-500">Propina (10%)</div><div class="font-semibold">$${propina}</div>
        </div>
        <div class="bg-gray-50 border border-gray-200 rounded-lg p-2">
          <div class="text-xs text-gray-500">Total</div><div class="font-semibold">$${total}</div>
        </div>
      </div>

      <div class="o-act mt-4 flex gap-2">
        <button class="btn-editar px-3 py-1.5 rounded-lg bg-blue-600 hover:bg-blue-700 text-white text-sm">Editar</button>
        <button class="btn-eliminar px-3 py-1.5 rounded-lg bg-red-600 hover:bg-red-700 text-white text-sm">Eliminar</button>
      </div>
    </section>
  `;

  const extra = card.querySelector(".o-extra");
  const toggleBtn = card.querySelector(".o-toggle");
  const chev = toggleBtn.querySelector(".chev");

  // Estado inicial: colapsada
  card.dataset.expanded = "0";
  extra.style.maxHeight = "0px";

  container.appendChild(card);

  const setExpanded = (on) => {
    const expanded = !!on;
    card.dataset.expanded = expanded ? "1" : "0";
    if (expanded) {
      extra.classList.remove("collapsed");
      extra.classList.add("expanded");
      const height = extra.scrollHeight;
      extra.style.maxHeight = height + "px";
      chev.style.transform = "rotate(180deg)";
    } else {
      extra.classList.add("collapsed");
      extra.classList.remove("expanded");
      extra.style.maxHeight = "0px";
      chev.style.transform = "rotate(0deg)";
    }
  };

  toggleBtn.addEventListener("click", (e) => {
    e.preventDefault();
    e.stopPropagation();
    withScrollFreeze(() => setExpanded(card.dataset.expanded !== "1"));
  });

  // Eliminar => backend y luego RELAYOUT completo
  card.querySelector(".btn-eliminar").addEventListener("click", async (ev) => {
    ev.stopPropagation();
    const ok = await showConfirm({
      title: "Eliminar pedido",
      message: "¿Estás seguro de eliminar este pedido? Esta acción no se puede deshacer.",
      confirmText: "Eliminar",
      cancelText: "Cancelar",
      variant: "danger",
    });
    if (!ok) { showAlert("info", "Operación cancelada"); return; }
    try {
      await deletePedido(pedido.id);
      showAlert("success", "Pedido eliminado correctamente");
      const idMesa = Number(pedido.idMesa || pedido.Mesa || 0);
      if (idMesa) await liberarMesa(idMesa);
      await reloadOrdersList(); // ← reordenar todo
    } catch (e) {
      showAlert("error", e.message || "No se pudo eliminar el pedido");
    }
  });

  // Editar => abrir en overlay
  card.querySelector(".btn-editar").addEventListener("click", (ev) => {
    ev.stopPropagation();
    abrirEdicionDesdeCard(pedido);   // esta función ahora abre overlay
  });

  // Cambiar estado => actualiza y reordena lista completa
  const selEstado = card.querySelector(`#sel-estado-${pedido.id}`);
  upgradeSelect?.(selEstado, { placeholder: "Estado" });
  selEstado.addEventListener("change", async () => {
    const newId = Number(selEstado.value);
    if (!Number.isFinite(newId) || newId <= 0) return;
    const det = (pedido.Platillos || [])
      .filter(pl => Number.isFinite(Number(pl.idPlatillo)))
      .map(pl => ({ idPlatillo: Number(pl.idPlatillo), cantidad: Math.max(1, Number(pl.cantidad || pl.qty || 1)), precioUnitario: Number(pl.precio || 0) }));
    if (!det.length) { showAlert("error", "El pedido no tiene items para actualizar."); selEstado.value = String(pedido.idEstadoPedido); selEstado._fancy?.sync?.(); return; }

    try {
      await updatePedido(pedido.id, {
        nombreCliente: pedido.Cliente || "Cliente",
        idMesa: Number(pedido.idMesa || pedido.Mesa || 0),
        idEmpleado: Number(pedido.idEmpleado || 0),
        idEstadoPedido: newId,
        observaciones: pedido.Observaciones || "Sin observaciones",
        propina: Number(pedido._propina || 0),
        items: det
      });
      showAlert("success", "Estado actualizado");
      await reloadOrdersList(); // ← reordenar todo tras el cambio
    } catch (e) {
      selEstado.value = String(pedido.idEstadoPedido);
      selEstado._fancy?.sync?.();
      showAlert("error", e.message || "No se pudo cambiar el estado");
    }
  });
}




/* =========================
   Edición
   ========================= */
let editingOriginalMesaId = null;
let editingOriginalPlatillos = new Set();

function abrirEdicionDesdeCard(pedido) {
  editingId = Number(pedido.id);
  editingOriginalMesaId = Number(pedido.idMesa || 0);

  editingOriginalPlatillos = new Set(
    (pedido.Platillos || []).map(pl => Number(pl.idPlatillo)).filter(Boolean)
  );

  editingOriginalLinesByPlatillo = new Map();
  editingMaxIdDetalle = 0;
  (pedido.Platillos || []).forEach(pl => {
    const idP = Number(pl.idPlatillo);
    const idDet = Number(pl.idDetalle ?? pl.linea ?? 0);
    if (idP && idDet) {
      editingOriginalLinesByPlatillo.set(idP, idDet);
      if (idDet > editingMaxIdDetalle) editingMaxIdDetalle = idDet;
    }
  });

  $("#customer-name").value = pedido.Cliente || "";
  $("#order-notes").value = pedido.Observaciones || "";

  const selEstado = $("#status-select");
  if (selEstado && selEstado.querySelector(`option[value="${pedido.idEstadoPedido}"]`)) {
    selEstado.value = String(pedido.idEstadoPedido);
  }

  const sel = (pedido.Platillos || []).map(pl => ({
    id: pl.idPlatillo || 0,
    idDetalle: pl.idDetalle,
    nombre: pl.nombre,
    precio: Number(pl.precio || 0),
    qty: Number(pl.cantidad || 1)
  }));
  setSeleccion(sel);
  renderSeleccionUI();

  const waiterSelect = $("#waiter-select");
  const tableSelect = $("#table-select");

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

  document.getElementById("orders-filters")?.classList.add("hidden");
  $("#new-order-form").classList.remove("hidden");
  $("#orders-list").classList.add("hidden");
  $("#new-order-btn").classList.add("hidden");

  // === Abrir como overlay encima de todo
  openOrderFormOverlay();
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
  for (const p of raw) { try { mapped.push(fromApi(p)); } catch { } }

  ORDERS_CACHE = mapped;
  renderOrdersList(container, onAddCard);
  ensureFilterBar();
}

/* =========================
   Selección + Totales
   ========================= */
(function ensureMetaResponsiveCols() {
  if (document.getElementById("orders-meta-responsive")) return;
  const st = document.createElement("style");
  st.id = "orders-meta-responsive";
  st.textContent = `
    #orders-list .o-meta{
      display:grid;
      grid-template-columns: repeat(auto-fit, minmax(160px, 1fr));
      gap:.5rem;
    }
    #orders-list .o-meta .estado-cell{
      grid-column: span 2;
    }
    @media (min-width: 920px){
      #orders-list .o-meta .estado-cell{ grid-column: auto; }
    }
    #orders-list .o-meta .fancy-select{ display:block; width:100%; min-width:0; }
    #orders-list .o-meta .fancy-select .fs-control{ min-height:44px; width:100%; }
    #orders-list .o-meta select{ width:100%; min-width:0; }
  `;
  document.head.appendChild(st);
})();

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
  const propina = +(subtotal * TIP_RATE).toFixed(2);
  const total = +(subtotal + propina).toFixed(2);

  const { subEl, tipEl, totalEl } = ensureTotalsBlock(secSel);
  if (subEl) subEl.textContent = subtotal.toFixed(2);
  if (tipEl) tipEl.textContent = propina.toFixed(2);
  if (totalEl) totalEl.textContent = total.toFixed(2);
}

/* =========================
   Payloads + Validación — UN payload con items[]
   ========================= */
function buildPayloadsFromSelection() {
  const seleccion = getSeleccion();

  const nombreCliente = ($("#customer-name")?.value || "").trim();
  if (!nombreCliente) { markInvalid("customer-name"); showAlert("error", "El nombre del cliente es obligatorio"); throw new Error("VALIDATION"); }

  const mesaSel = document.getElementById("table-select");
  let idMesa = Number(mesaSel?.value || "");
  if (!Number.isFinite(idMesa) || idMesa <= 0) {
    const firstEnabled = Array.from(mesaSel?.options || []).find(o => o.value && !o.disabled);
    if (firstEnabled) { mesaSel.value = firstEnabled.value; mesaSel.dispatchEvent(new Event("change", { bubbles: true })); idMesa = Number(firstEnabled.value); }
  }
  if (!Number.isFinite(idMesa) || idMesa <= 0) { markInvalid("table-select"); showAlert("error", "Selecciona una mesa válida"); throw new Error("VALIDATION"); }

  const waiterSel = document.getElementById("waiter-select");
  let idEmpleado = Number(waiterSel?.value || "");
  if (!Number.isFinite(idEmpleado) || idEmpleado <= 0) {
    const firstOpt = Array.from(waiterSel?.options || []).find(o => o.value);
    if (firstOpt) { waiterSel.value = firstOpt.value; waiterSel.dispatchEvent(new Event("change", { bubbles: true })); idEmpleado = Number(firstOpt.value); }
  }
  if (!Number.isFinite(idEmpleado) || idEmpleado <= 0) { markInvalid("waiter-select"); showAlert("error", "Selecciona un mesero válido"); throw new Error("VALIDATION"); }

  let idEstadoPedido = Number($("#status-select")?.value || "");
  if (!Number.isFinite(idEstadoPedido) || idEstadoPedido <= 0) {
    if (ESTADOS_ORDER?.length) idEstadoPedido = Number(ESTADOS_ORDER[0].id);
  }
  if (!Number.isFinite(idEstadoPedido) || idEstadoPedido <= 0) { markInvalid("status-select"); showAlert("error", "Selecciona un estado válido"); throw new Error("VALIDATION"); }

  if (!Array.isArray(seleccion) || !seleccion.length) { showAlert("info", "Agrega al menos un platillo"); throw new Error("VALIDATION"); }

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
    if (Number.isFinite(idDetSel) && idDetSel > 0) prev.idDetalle = idDetSel;

    agrupados.set(idPlatillo, prev);
  }

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
        lineCounter += 1;
        base.idDetalle = lineCounter;
      }
    }
    return base;
  });

  if (!items.length) { showAlert("info", "Agrega al menos un platillo válido"); throw new Error("VALIDATION"); }
  editingMaxIdDetalle = lineCounter;

  const subtotal = items.reduce((acc, it) => acc + (it.precioUnitario || 0) * (it.cantidad || 0), 0);
  const propina = +(subtotal * 0.10).toFixed(2);
  const total = +(subtotal + propina).toFixed(2);

  const observaciones = ($("#order-notes")?.value || "").trim() || "Sin observaciones";

  // === CAMBIO CLAVE: fecha en ISO local (sirve para LocalDateTime) ===
  const FPedidoISO = formatDateTimeForApi(new Date());
  // Si tu DTO fuera LocalDate, podrías usar: const FPedidoISO = todayISODate();

  // Devolvemos FPedido en mayúscula y, por compatibilidad,
  // añadimos aliases que algunos DTO usan (el backend ignora los desconocidos).
  return {
    totalPedido: Number(total.toFixed(2)),
    subtotal: Number(subtotal.toFixed(2)),
    propina: Number(propina.toFixed(2)),
    FPedido: FPedidoISO,           // ← nombre más probable en tu DTO
    fpedido: FPedidoISO,           // ← alias por si el DTO está en minúsculas
    fechaPedido: FPedidoISO,       // ← alias común
    items,
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
async function actualizarPedido(editId) {
  if (!Number.isFinite(editId)) throw new Error("ID inválido para actualizar.");
  const body = buildPayloadsFromSelection();

  await updatePedido(editId, body);

  const nuevaMesaId = Number(body.idMesa || 0);
  const mesaAntes = Number(editingOriginalMesaId || 0);
  if (mesaAntes && nuevaMesaId && mesaAntes !== nuevaMesaId) {
    try { await liberarMesa(mesaAntes); } catch { }
    try { await ocuparMesa(nuevaMesaId); } catch { }
  }

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
  ensureOrderOverlayStyles();

  const ordersList = $("#orders-list");
  const newOrderBtn = $("#new-order-btn");
  const newOrderForm = $("#new-order-form");
  const backToOrdersBtn = $("#back-to-orders");
  const orderTime = $("#order-time");
  const saveOrderBtn = $("#save-order-btn");
  const addDishesBtn = $("#add-dishes-btn");
  const waiterSelect = $("#waiter-select");
  const tableSelect = $("#table-select");

  // 1) Catálogos y lista de pedidos
  await cargarCatalogos(); // estados + platillos
  await cargarPedidosDeApi(ordersList, agregarTarjetaPedido);

  // 2) Cargar selects por defecto
  await cargarEmpleados(waiterSelect);
  await cargarMesasSelect();

  // 3) Abrir “nuevo pedido”
  newOrderBtn?.addEventListener("click", () => {
    document.getElementById("orders-filters")?.classList.add("hidden");

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

    cargarEmpleados(waiterSelect);
    cargarMesasSelect();

    // === Abrir como overlay encima de todo
    openOrderFormOverlay();
  });

  // 4) Volver a la lista / cerrar overlay
  backToOrdersBtn?.addEventListener("click", () => {
    document.getElementById("orders-filters")?.classList.remove("hidden");

    newOrderForm.classList.add("hidden");
    ordersList.classList.remove("hidden");
    newOrderBtn.classList.remove("hidden");

    setSeleccion([]); renderSeleccionUI();
    editingId = null;

    sessionStorage.removeItem(K_EDIT_ID);
    sessionStorage.removeItem(K_EDIT_EMP);
    sessionStorage.removeItem(K_EDIT_MESA);

    const saveBtn = $("#save-order-btn");
    if (saveBtn) saveBtn.textContent = "Guardar pedido";

    // Cerrar overlay
    closeOrderFormOverlay();
  });

  // 5) Ir a seleccionar platillos (igual)
  addDishesBtn?.addEventListener("click", () => {
    saveFormSnapshot();
    sessionStorage.setItem(K_OPEN_FORM, "1");

    if (Number.isFinite(Number(editingId)) && editingId > 0) {
      sessionStorage.setItem(K_EDIT_ID, String(editingId));
      sessionStorage.setItem(K_EDIT_EMP, String($("#waiter-select")?.value || ""));
      sessionStorage.setItem(K_EDIT_MESA, String($("#table-select")?.value || ""));
    }

    const back = (location.pathname.split("/").pop() || "orders.html") + "#new";
    window.location.href = `menu.html?select=1&back=${encodeURIComponent(back)}`;
  });

  // 6) Guardar (crear/actualizar) + recargar lista + cerrar overlay
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

      sessionStorage.removeItem(K_EDIT_ID);
      sessionStorage.removeItem(K_EDIT_EMP);
      sessionStorage.removeItem(K_EDIT_MESA);
      editingOriginalMesaId = null;
      editingOriginalPlatillos = new Set();

      resetOrderForm();
      newOrderForm.classList.add("hidden");
      ordersList.classList.remove("hidden");
      newOrderBtn.classList.remove("hidden");

      // Cerrar overlay primero, luego recargar/relayout
      closeOrderFormOverlay();
      await reloadOrdersList();
      await cargarMesasSelect();
    } catch (err) {
      if (err && err.message !== "VALIDATION") {
        showAlert("error", err.message || "No se pudo guardar el pedido");
      }
      console.error(err);
    }
  });

  // 7) Reapertura automática del formulario (al volver de menu.html o #new)
  if (sessionStorage.getItem(K_OPEN_FORM) === "1" || location.hash === "#new") {
    document.getElementById("orders-filters")?.classList.add("hidden");

    newOrderForm.classList.remove("hidden");
    ordersList.classList.add("hidden");
    newOrderBtn.classList.add("hidden");
    if (orderTime) orderTime.value = new Date().toLocaleDateString("es-ES");

    restoreFormSnapshot();
    renderSeleccionUI();

    const storedEditId = Number(sessionStorage.getItem(K_EDIT_ID) || "");
    const storedEmpId = Number(sessionStorage.getItem(K_EDIT_EMP) || "");
    const storedMesaId = Number(sessionStorage.getItem(K_EDIT_MESA) || "");

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
      await cargarEmpleados(waiterSelect);
      await cargarMesasSelect();
    }

    sessionStorage.removeItem(K_OPEN_FORM);

    // Abrir como overlay al reaparecer el formulario
    openOrderFormOverlay();
  } else {
    renderSeleccionUI();
  }

  // 8) Skin (igual)
  applyModernSkin();
}


// Marca un campo inválido visualmente
function markInvalid(id) {
  const el = document.getElementById(id);
  if (!el) return;
  el.classList.add("ring-2", "ring-red-500");
  el.scrollIntoView({ behavior: "smooth", block: "center" });
  setTimeout(() => el.classList.remove("ring-2", "ring-red-500"), 1500);
}

// Fecha/hora local en formato ISO sin milisegundos, ideal para LocalDateTime en el backend
function formatDateTimeForApi(d = new Date()) {
  const pad = (n) => String(n).padStart(2, "0");
  const yyyy = d.getFullYear();
  const mm = pad(d.getMonth() + 1);
  const dd = pad(d.getDate());
  const hh = pad(d.getHours());
  const mi = pad(d.getMinutes());
  const ss = pad(d.getSeconds());
  // "2025-09-24T12:34:56"
  return `${yyyy}-${mm}-${dd}T${hh}:${mi}:${ss}`;
}

// Fecha solo día (por si tu DTO fuera LocalDate)
function todayISODate() {
  const d = new Date();
  const mm = String(d.getMonth() + 1).padStart(2, "0");
  const dd = String(d.getDate()).padStart(2, "0");
  return `${d.getFullYear()}-${mm}-${dd}`;
}
