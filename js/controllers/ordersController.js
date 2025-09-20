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
   ALERTAS (info / error / success) — sin emojis
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
   MODAL CONFIRM (bonito)
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
    // default al primer estado cargado
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
window.isMesaLockedByOrder = (idMesa) => getLockedSet().has(String(idMesa)); // util p/ pantalla Mesas

// ---- API Mesa (best-effort; ajusta si tu backend difiere) ----
// === API Mesa (endpoint real) ===
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
// CARGA MESEROS (EMPLEADOS)
async function cargarEmpleados(waiterSelect) {
  if (!waiterSelect) {
    console.warn("[UI] Falta el <select id='waiter-select'> en el HTML");
  }

  // limpia y agrega opción placeholder
  waiterSelect.innerHTML = `<option value="">Seleccione un mesero</option>`;

  // Llama a tu service: /apiEmpleado/getDataEmpleado?page=0&size=10
  let data = [];
  try {
    data = await getEmpleados(0, 10); // este service debe devolver [{id, nombre}]
  } catch (e) {
    console.error("[Empleados] Error al obtener empleados:", e);
  }

  // Si tu service devuelve el JSON crudo que me pasaste (content con {id,...}),
  // puedes mapear así (por si tu service aún no normaliza):
  if (!Array.isArray(data) || !data.length || data[0].idPersona !== undefined) {
    // data viene crudo (con "content")
    const raw = (data && Array.isArray(data.content)) ? data.content : [];
    data = raw.map(e => ({ id: Number(e.id), nombre: `Empleado ${e.id}` }));
  }

  // Guarda en el mapa y llena el select
  MAP_EMPLEADOS = new Map(data.map(e => [Number(e.id), e]));
  for (const emp of data) {
    const opt = document.createElement("option");
    opt.value = String(emp.id);
    opt.textContent = emp.nombre || `Empleado ${emp.id}`;
    waiterSelect.appendChild(opt);
  }

  // estilos + mejora visual
  waiterSelect.className =
    "w-full max-w-full p-2 md:p-2.5 rounded-lg border border-gray-300 focus:ring-2 focus:ring-blue-500 focus:border-blue-500 text-sm md:text-base bg-white shadow-sm";

  // preselecciona el primero si no hay selección
  if (!waiterSelect.value && waiterSelect.options.length > 1) {
    waiterSelect.value = waiterSelect.options[1].value;
  }

  upgradeSelect(waiterSelect, { placeholder: "Mesero" });
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
// CARGA MESAS
async function cargarMesasSelect() {
  const sel = document.getElementById("table-select");
  if (!sel) {
    console.warn("[UI] Falta el <select id='table-select'> en el HTML");
    return;
  }

  sel.className =
    "w-full max-w-full p-2 md:p-2.5 rounded-lg border border-gray-300 focus:ring-2 focus:ring-blue-500 focus:border-blue-500 text-sm md:text-base bg-white shadow-sm";

  sel.innerHTML = `<option value="">Seleccione una mesa</option>`;

  // Llama a tu service: /apiMesa/getDataMesa?page=0&size=10
  let mesas = [];
  try {
    mesas = await getMesasForOrders(0, 10); // puede devolver crudo o normalizado
  } catch (e) {
    console.error("[Mesas] Error al obtener mesas:", e);
  }

  // Si vino crudo (con "content"), tómalo de ahí
  if (!Array.isArray(mesas) || (mesas.length && mesas[0].nomMesa === undefined && mesas[0].idEstadoMesa === undefined)) {
    const raw = (mesas && Array.isArray(mesas.content)) ? mesas.content : [];
    mesas = raw;
  }

  // Ordena por id asc
  mesas.sort((a, b) => Number(a.id || 0) - Number(b.id || 0));

  // Pinta opciones (idEstadoMesa: 1=Disponible, 2=Ocupada)
  for (const m of mesas) {
    const idMesa   = Number(m.id);
    const nombre   = String(m.nomMesa ?? `Mesa ${idMesa}`);
    const idEstado = Number(m.idEstadoMesa);

    const opt = document.createElement("option");
    opt.value = String(idMesa);
    opt.textContent = (idEstado === 1) ? nombre : `${nombre} (${idEstado === 2 ? "ocupada" : "no disponible"})`;
    if (idEstado !== 1) opt.disabled = true;
    sel.appendChild(opt);
  }

  // Si no hay selección, elige la primera disponible
  if (!sel.value) {
    const firstEnabled = Array.from(sel.options).find(o => o.value && !o.disabled);
    if (firstEnabled) sel.value = firstEnabled.value;
  }

  upgradeSelect(sel, { placeholder: "Mesa" });
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

  // NUEVO: si viene p.items[], mapeamos todos los platillos; fallback: un solo platillo del encabezado
  let platillos = [];
  if (Array.isArray(p.items) && p.items.length) {
    platillos = p.items.map(it => {
      const idPlat = Number(it.idPlatillo ?? it.IdPlatillo ?? it.id ?? it.Id);
      const cant   = Number(it.cantidad ?? it.Cantidad ?? 1);
      const pu     = (it.precioUnitario ?? it.PrecioUnitario);
      const info   = MAP_PLATILLOS.get(idPlat);
      return {
        idPlatillo: idPlat,
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
      nombre: info?.nomPlatillo ?? (p.platillo?.nomPlatillo ?? p.nomPlatillo ?? "Platillo"),
      cantidad: cant,
      precio: Number(info?.precio ?? 0)
    }] : [];
  }

  // Calcula subtotal desde items si no viene del backend
const subtotalCalc = platillos.reduce(
  (acc, x) => acc + (Number(x.precio) || 0) * (Number(x.cantidad) || 0),
  0
);

// Usa nullish coalescing de forma segura (sin mezclar con ||)
const subtotal = Number((p.subtotal ?? p.Subtotal ?? subtotalCalc) ?? 0);

// Propina y total con fallback numérico
const propina = Number(p.propina ?? p.Propina ?? +(subtotal * 0.10).toFixed(2));
const total   = Number(p.totalPedido ?? p.TotalPedido ?? +(subtotal + propina).toFixed(2));


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

  // Eliminar con confirm modal
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
      // liberar mesa
      const idMesa = Number(pedido.idMesa || pedido.Mesa || 0);
      if (idMesa) await liberarMesa(idMesa);
    } catch (e) {
      showAlert("error", e.message || "No se pudo eliminar el pedido");
    }
  });

  // Editar
  card.querySelector(".btn-editar").addEventListener("click", (ev) => {
    ev.stopPropagation();
    abrirEdicionDesdeCard(pedido);
  });

  // Cambiar estado — AHORA enviamos items[] actuales del pedido
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

      // si pasa a cancelado/anulado, liberar mesa
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
function abrirEdicionDesdeCard(pedido) {
  editingId = Number(pedido.id);

  $("#customer-name").value  = pedido.Cliente || "";
  $("#table-select").value   = String(pedido.idMesa || "");
  $("#waiter-select").value  = String(pedido.idEmpleado || "");

  const selEstado = $("#status-select");
  if (selEstado && selEstado.querySelector(`option[value="${pedido.idEstadoPedido}"]`)) {
    selEstado.value = String(pedido.idEstadoPedido);
  }

  $("#order-notes").value    = pedido.Observaciones || "";

  const sel = (pedido.Platillos || []).map(pl => ({
    id: pl.idPlatillo || 0,
    nombre: pl.nombre,
    precio: Number(pl.precio || 0),
    qty: Number(pl.cantidad || 1)
  }));
  setSeleccion(sel);
  renderSeleccionUI();

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
   Payloads + Validación — AHORA UN SOLO payload con items[]
   ========================= */
// === REEMPLAZA COMPLETO ESTE MÉTODO EN ordersController.js ===
// === REEMPLAZA COMPLETO ESTE MÉTODO EN ordersController.js ===
function buildPayloadsFromSelection() {
  const seleccion = getSeleccion();

  // --- Cliente ---
  const nombreCliente = ($("#customer-name")?.value || "").trim();
  if (!nombreCliente) { markInvalid("customer-name"); showAlert("error","El nombre del cliente es obligatorio"); throw new Error("VALIDATION"); }

  // --- Mesa (autoselección si está vacío) ---
  const mesaSel = document.getElementById("table-select");
  let idMesa = Number(mesaSel?.value || "");
  if (!Number.isFinite(idMesa) || idMesa <= 0) {
    const firstEnabled = Array.from(mesaSel?.options || []).find(o => o.value && !o.disabled);
    if (firstEnabled) { mesaSel.value = firstEnabled.value; mesaSel.dispatchEvent(new Event("change", { bubbles: true })); idMesa = Number(firstEnabled.value); }
  }
  if (!Number.isFinite(idMesa) || idMesa <= 0) { markInvalid("table-select"); showAlert("error","Selecciona una mesa válida"); throw new Error("VALIDATION"); }

  // --- Mesero (autoselección si está vacío) ---
  const waiterSel = document.getElementById("waiter-select");
  let idEmpleado = Number(waiterSel?.value || "");
  if (!Number.isFinite(idEmpleado) || idEmpleado <= 0) {
    const firstOpt = Array.from(waiterSel?.options || []).find(o => o.value);
    if (firstOpt) { waiterSel.value = firstOpt.value; waiterSel.dispatchEvent(new Event("change", { bubbles: true })); idEmpleado = Number(firstOpt.value); }
  }
  if (!Number.isFinite(idEmpleado) || idEmpleado <= 0) { markInvalid("waiter-select"); showAlert("error","Selecciona un mesero válido"); throw new Error("VALIDATION"); }

  // --- Estado ---
  let idEstadoPedido = Number($("#status-select")?.value || "");
  if (!Number.isFinite(idEstadoPedido) || idEstadoPedido <= 0) {
    if (ESTADOS_ORDER?.length) idEstadoPedido = Number(ESTADOS_ORDER[0].id);
  }
  if (!Number.isFinite(idEstadoPedido) || idEstadoPedido <= 0) { markInvalid("status-select"); showAlert("error","Selecciona un estado válido"); throw new Error("VALIDATION"); }

  // --- Platillos seleccionados ---
  if (!Array.isArray(seleccion) || !seleccion.length) { showAlert("info","Agrega al menos un platillo"); throw new Error("VALIDATION"); }

  // Agrupar por idPlatillo y conservar precio unitario
  const agrupados = new Map();
  for (const it of seleccion) {
    const idPlatillo = Number((it && it.id) ?? (it && it.idPlatillo));
    const qty = Math.max(1, Number((it && it.qty) ?? (it && it.cantidad) ?? 1));
    const precio = Number((it && it.precio) ?? (MAP_PLATILLOS.get(idPlatillo)?.precio) ?? 0);
    if (!Number.isFinite(idPlatillo) || idPlatillo <= 0) continue;

    const prev = agrupados.get(idPlatillo) || { cantidad: 0, precioUnitario: 0 };
    prev.cantidad += qty;
    if (Number.isFinite(precio) && precio > 0) prev.precioUnitario = precio;
    agrupados.set(idPlatillo, prev);
  }

  const items = Array.from(agrupados.entries()).map(([idPlatillo, v]) => ({
    idPlatillo,
    cantidad: v.cantidad,
    precioUnitario: Number(v.precioUnitario || 0)
  }));
  if (!items.length) { showAlert("info","Agrega al menos un platillo válido"); throw new Error("VALIDATION"); }

  // Totales (como en tu Postman)
  const subtotal = items.reduce((acc, it) => acc + (it.precioUnitario || 0) * (it.cantidad || 0), 0);
  const propina  = +(subtotal * 0.10).toFixed(2);
  const total    = +(subtotal + propina).toFixed(2);

  // Observaciones
  const observaciones = ($("#order-notes")?.value || "").trim() || "Sin cebolla";

  // Fecha+Hora local (como en tu JSON que funcionó)
  const fpedido = formatDateTimeLocal(new Date());

  // === ÚNICO objeto (NO array) ===
  return {
    totalPedido: Number(total.toFixed(2)),
    subtotal:    Number(subtotal.toFixed(2)),
    propina:     Number(propina.toFixed(2)),
    fpedido,                    // "YYYY-MM-DDTHH:mm:ss"
    items,                      // [{idPlatillo, cantidad, precioUnitario}]
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
  const body = buildPayloadsFromSelection();   // ahora devuelve un OBJETO
  await createPedido(body);                    // envíalo tal cual
  if (body.idMesa) await ocuparMesa(body.idMesa); // marcar mesa ocupada
}



async function actualizarPedido(editId) {
  if (!Number.isFinite(editId)) throw new Error("ID inválido para actualizar.");
  const body = buildPayloadsFromSelection();
  await updatePedido(editId, body);
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

  await cargarCatalogos();                 // estados + platillos
  await cargarPedidosDeApi(ordersList, agregarTarjetaPedido);

  await cargarEmpleados(waiterSelect);     // <<--- AQUÍ
  await cargarMesasSelect();               // <<--- Y AQUÍ

  newOrderBtn?.addEventListener("click", () => {
    editingId = null;
    clearSnapshots();
    resetOrderForm();                 // <<--- LIMPIAR TODO
    newOrderForm.classList.remove("hidden");
    ordersList.classList.add("hidden");
    newOrderBtn.classList.add("hidden");
    orderTime.value = new Date().toLocaleDateString("es-ES");
    // limpiar hash si quedó de una navegación previa
    if (location.hash === "#new") history.replaceState({}, "", location.pathname);
  });

  backToOrdersBtn?.addEventListener("click", () => {
    newOrderForm.classList.add("hidden");
    ordersList.classList.remove("hidden");
    newOrderBtn.classList.remove("hidden");
    setSeleccion([]); renderSeleccionUI();
    editingId = null;
    if (saveOrderBtn) saveOrderBtn.textContent = "Guardar pedido";
  });

  addDishesBtn?.addEventListener("click", () => {
    saveFormSnapshot();
    sessionStorage.setItem(K_OPEN_FORM, "1");
    const back = (location.pathname.split("/").pop() || "orders.html") + "#new";
    window.location.href = `menu.html?select=1&back=${encodeURIComponent(back)}`;
  });

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

      resetOrderForm(); // dejar listo para un alta nueva

      newOrderForm.classList.add("hidden");
      ordersList.classList.remove("hidden");
      newOrderBtn.classList.remove("hidden");

      ordersList.innerHTML = "";
      await cargarPedidosDeApi(ordersList, agregarTarjetaPedido);
      await cargarMesasSelect(); // refrescar disponibilidad
    } catch (err) {
      if (err && err.message !== "VALIDATION") {
        showAlert("error", err.message || "No se pudo guardar el pedido");
      }
      console.error(err);
    }
  });

  if (sessionStorage.getItem(K_OPEN_FORM) === "1" || location.hash === "#new") {
    newOrderForm.classList.remove("hidden");
    ordersList.classList.add("hidden");
    newOrderBtn.classList.add("hidden");
    orderTime.value = new Date().toLocaleDateString("es-ES");
    restoreFormSnapshot();
    restoreWaiter(waiterSelect);
    renderSeleccionUI();
    sessionStorage.removeItem(K_OPEN_FORM);
  } else {
    renderSeleccionUI();
  }

  applyModernSkin();
}

// Marca un campo inválido visualmente (evita ReferenceError)
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

