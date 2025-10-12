// js/controllers/mesaController.js
// Reemplaza COMPLETO este archivo

import { getMesas, fetchPedidosAll } from "../services/mesaService.js";

const $ = (s, r = document) => r.querySelector(s);
const $$ = (s, r = document) => Array.from(r.querySelectorAll(s));

const API_HOST = "https://orderly-api-b53514e40ebd.herokuapp.com";
const MAX_SIZE = 50;
const AUTO_REFRESH_MS = 3000;

/* =============== Helpers =============== */
const norm = (s) => String(s ?? "")
  .trim()
  .toLowerCase()
  .normalize("NFD")
  .replace(/[\u0300-\u036f]/g, "");

function pickArrayPayload(data) {
  if (Array.isArray(data?.content)) return data.content;
  if (Array.isArray(data?.data)) return data.data;
  if (Array.isArray(data)) return data;
  if (Array.isArray(data?.data?.content)) return data.data.content;
  return [];
}
async function fetchArray(url) {
  const res = await fetch(url, { credentials: "include", headers: { Accept: "application/json" }, cache: "no-store" });
  if (!res.ok) return [];
  const data = await res.json().catch(() => ({}));
  return pickArrayPayload(data);
}

/* =============== Busy Overlay (spinner + blur) =============== */
let BUSY_COUNT = 0;
let BUSY_TIMER = null;

function ensureBusy() {
  let el = $("#busy-overlay");
  if (el) return el;

  el = document.createElement("div");
  el.id = "busy-overlay";
  el.className = "fixed inset-0 z-[100] hidden items-center justify-center";
  el.innerHTML = `
    <div class="absolute inset-0 bg-black/30 backdrop-blur-[2px]"></div>
    <div class="relative bg-white rounded-2xl shadow-2xl px-4 py-3 flex items-center gap-3">
      <span class="inline-block w-4 h-4 rounded-full border-2 border-gray-300 border-t-blue-500 animate-spin"></span>
      <span id="busy-msg" class="text-sm text-gray-700">Cargando…</span>
    </div>
  `;
  el.style.display = "none";
  el.style.alignItems = "center";
  el.style.justifyContent = "center";
  document.body.appendChild(el);
  return el;
}
function showBusy(msg = "Cargando…", { delay = 160 } = {}) {
  const host = ensureBusy();
  const label = host.querySelector("#busy-msg");
  if (label) label.textContent = msg;

  BUSY_COUNT++;
  if (BUSY_COUNT === 1) {
    clearTimeout(BUSY_TIMER);
    BUSY_TIMER = setTimeout(() => {
      host.classList.remove("hidden");
      host.style.display = "flex";
    }, delay);
  }
}
function hideBusy() {
  if (BUSY_COUNT > 0) BUSY_COUNT--;
  if (BUSY_COUNT === 0) {
    clearTimeout(BUSY_TIMER);
    const host = ensureBusy();
    host.classList.add("hidden");
    host.style.display = "none";
  }
}

/* =============== Estados mesa (catálogo) =============== */
async function fetchEstadosMesa() {
  const base = `${API_HOST}/apiEstadoMesa/getDataEstadoMesa`;
  let page = 0;
  const size = 50;
  const out = [];

  while (true) {
    const url = `${base}?page=${page}&size=${size}`;
    const res = await fetch(url, { headers: { Accept: "application/json" }, credentials: "include", cache: "no-store" });
    if (!res.ok) break;

    const data = await res.json().catch(() => ({}));
    const content = pickArrayPayload(data);

    for (const e of content) {
      const id = Number(e.Id ?? e.id ?? e.idEstadoMesa);
      const nombre = String(e.EstadoMesa ?? e.estadoMesa ?? e.nombre ?? "").trim();
      if (Number.isFinite(id) && nombre) out.push({ id, nombre });
    }

    if (data && typeof data.last === "boolean") {
      if (data.last) break;
      page += 1;
    } else break;
  }

  const uniq = [...new Map(out.map(x => [x.id, x])).values()];
  return uniq.length ? uniq : [{ id: 1, nombre: "Disponible" }, { id: 2, nombre: "Ocupada" }];
}
function filtraEstadosParaEdicion(estados) {
  return (estados || []).filter(e => {
    const n = norm(e.nombre);
    return n.includes("dispon") || n.includes("limp") || n.includes("fuera");
  });
}

/* =============== API PATCH real =============== */
async function updateMesaEstadoApi(idMesa, idEstado) {
  const url = `${API_HOST}/apiMesa/estado/${encodeURIComponent(idMesa)}/${encodeURIComponent(idEstado)}`;
  const res = await fetch(url, {
    method: "PATCH",
    credentials: "include",
    headers: { Accept: "application/json" },
  });
  if (!res.ok) {
    const txt = await res.text().catch(() => "");
    throw new Error(txt || `PATCH ${url} → ${res.status}`);
  }
  try { return await res.json(); } catch { return null; }
}

/* =============== Badges =============== */
const BADGE = {
  disponible: "bg-emerald-100 text-emerald-800",
  ocupada: "bg-red-100 text-red-800",
  reservada: "bg-amber-100 text-amber-800",
  limpieza: "bg-sky-100 text-sky-800",
  fuera: "bg-gray-200 text-gray-800",
  desconocido: "bg-gray-100 text-gray-700",
};
function badgeClass(estado) {
  const key = norm(estado);
  if (key.includes("dispon")) return BADGE.disponible;
  if (key.includes("ocup")) return BADGE.ocupada;
  if (key.includes("reserv")) return BADGE.reservada;
  if (key.includes("limp")) return BADGE.limpieza;
  if (key.includes("fuera")) return BADGE.fuera;
  return BADGE.desconocido;
}

/* =============== Reglas de pedidos =============== */
const PEDIDO_ACTIVO_IDS = new Set([1, 2, 3]);
const PEDIDO_FINAL_IDS = new Set([5, 6]);
const PEDIDO_ACTIVO_NOMS = new Set(["pendiente", "en preparacion", "en preparación", "entregado"]);
const PEDIDO_FINAL_NOMS = new Set(["cancelado", "finalizado"]);

function extractMesaIdFromPedido(p) {
  const id = Number(p.IdMesa ?? p.idMesa ?? p.mesaId);
  return Number.isFinite(id) ? id : null;
}
function extractEstadoPedidoId(p) {
  const id = Number(p.IdEstadoPedido ?? p.idEstadoPedido ?? p.estadoPedidoId);
  return Number.isFinite(id) ? id : null;
}
function extractEstadoPedidoNombre(p) {
  const n = p.EstadoPedido ?? p.estadoPedido ?? p.NombreEstado ?? p.nombreEstado ?? p.estado;
  return n ? String(n) : "";
}

/* =============== Sync mesas según pedidos =============== */
async function syncMesasSegunPedidos(mesas, estados, { busy = false } = {}) {
  const N = (s) => String(s ?? "").trim().toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "");

  const getMesaId = (p) => {
    let id =
      p.idMesa ?? p.IdMesa ?? p.mesaId ?? p.MesaId ??
      p?.mesa?.idMesa ?? p?.mesa?.IdMesa ?? p?.mesa?.id ??
      p?.Mesa?.Id ?? p?.Mesa?.id;
    id = Number(id);
    return Number.isFinite(id) ? id : null;
  };

  const getEstadoPedidoId = (p) => {
    let id =
      p.idEstadoPedido ?? p.IdEstadoPedido ?? p.estadoPedidoId ?? p.EstadoPedidoId ??
      p?.estadoPedido?.idEstadoPedido ?? p?.estadoPedido?.IdEstadoPedido ??
      p?.EstadoPedido?.idEstadoPedido ?? p?.EstadoPedido?.IdEstadoPedido ??
      p?.estadoPedido?.id ?? p?.estadoPedido?.Id ?? p?.EstadoPedido?.Id ?? p?.EstadoPedido?.id;
    id = Number(id);
    return Number.isFinite(id) ? id : null;
  };

  const getEstadoPedidoNombre = (p) => {
    const s =
      p.nombreEstado ?? p.NombreEstado ?? p.estado ??
      p?.estadoPedido?.nombreEstado ?? p?.estadoPedido?.NombreEstado ??
      p?.estadoPedido?.nombre ?? p?.estadoPedido?.Nombre ??
      p?.EstadoPedido?.NombreEstado ?? p?.EstadoPedido?.nombreEstado ??
      p?.EstadoPedido?.Nombre ?? p?.EstadoPedido?.nombre;
    return s ? String(s) : "";
  };

  const getPedidoTimeKey = (p) => {
    const d1 = p.horaInicio ?? p.HoraInicio ?? p.fechaPedido ?? p.FechaPedido ?? p.fechaCreacion ?? p.createdAt;
    const t1 = d1 ? Date.parse(d1) : NaN;
    if (!Number.isNaN(t1)) return t1;
    const idPed = Number(p.idPedido ?? p.IdPedido);
    if (Number.isFinite(idPed)) return idPed;
    return 0;
  };

  const idDisponible = (estados.find(e => N(e.nombre).includes("dispon"))?.id) ?? 1;
  const idOcupada = (estados.find(e => N(e.nombre).includes("ocup"))?.id) ?? 2;
  const estadosById = new Map(estados.map(e => [e.id, e]));

  const PEDIDO_ACTIVO_IDS = new Set([1, 2, 3]);
  const PEDIDO_FINAL_IDS = new Set([5, 6]);
  const PEDIDO_ACTIVO_NOMS = new Set(["pendiente", "en preparacion", "en preparación", "preparacion", "preparación", "entregado"]);
  const PEDIDO_FINAL_NOMS = new Set(["cancelado", "finalizado"]);

  if (busy) showBusy("Cargando pedidos…");
  let pedidos;
  try {
    pedidos = await fetchPedidosAll();
  } finally {
    if (busy) hideBusy();
  }

  const ultimoPorMesa = new Map();
  for (const p of pedidos) {
    const mesaId = getMesaId(p);
    if (!Number.isFinite(mesaId)) continue;
    const key = getPedidoTimeKey(p);
    const prev = ultimoPorMesa.get(mesaId);
    if (!prev || key > prev.__key) {
      p.__key = key;
      ultimoPorMesa.set(mesaId, p);
    }
  }

  const updates = [];

  for (const m of mesas) {
    const mesaId = Number(m.Id ?? m.id ?? m.idMesa ?? m.IdMesa);
    if (!Number.isFinite(mesaId)) continue;

    const idEstadoBD = Number(m.IdEstadoMesa ?? m.idEstadoMesa);
    const nombreBD = estadosById.get(idEstadoBD)?.nombre || "";
    const sbd = N(nombreBD);
    if (sbd.includes("limpieza") || sbd.includes("fuera de uso")) continue; // manuales

    const ped = ultimoPorMesa.get(mesaId);
    let target = idDisponible;

    if (ped) {
      const idEp = getEstadoPedidoId(ped);
      const nomEp = N(getEstadoPedidoNombre(ped));
      let activo = false;

      if (idEp != null) {
        if (PEDIDO_ACTIVO_IDS.has(idEp)) activo = true;
        else if (PEDIDO_FINAL_IDS.has(idEp)) activo = false;
      }
      if (!activo && nomEp) {
        if (PEDIDO_ACTIVO_NOMS.has(nomEp)) activo = true;
        else if (PEDIDO_FINAL_NOMS.has(nomEp)) activo = false;
      }
      target = activo ? idOcupada : idDisponible;
    }

    if (Number.isFinite(idEstadoBD) && idEstadoBD !== target) {
      updates.push({ mesaId, to: target });
    }
  }

  for (const u of updates) {
    try {
      await updateMesaEstadoApi(u.mesaId, u.to);
    } catch (e) {
      console.error("[syncMesasSegunPedidos] PATCH falló", u, e?.message || e);
    }
  }

  return updates.length > 0;
}

/* =============== Alertas =============== */
function ensureAlertHost() {
  let host = document.getElementById("alerts-host");
  if (!host) {
    host = document.createElement("div");
    host.id = "alerts-host";
    host.setAttribute("aria-live", "polite");
    host.className = "fixed top-4 right-4 z-[120] space-y-3 pointer-events-none";
    document.body.appendChild(host);
  }
  return host;
}
function showAlert(type = "info", text = "", { timeout = 3500 } = {}) {
  const host = ensureAlertHost();
  const wrap = document.createElement("div");
  const color = { info: "bg-blue-500", error: "bg-red-500", success: "bg-green-500" }[type] || "bg-blue-500";
  wrap.className = `pointer-events-auto rounded-xl px-4 py-3 shadow-lg text-white flex items-center gap-3 w-[min(92vw,380px)] ${color}`;
  wrap.innerHTML = `
    <div class="font-medium">${text}</div>
    <button class="ml-auto opacity-80 hover:opacity-100 focus:outline-none">✕</button>
  `;
  host.appendChild(wrap);
  const close = () => {
    wrap.style.transition = "opacity .25s ease, transform .25s ease";
    wrap.style.opacity = "0";
    wrap.style.transform = "translateY(-6px)";
    setTimeout(() => wrap.remove(), 200);
  };
  wrap.querySelector("button")?.addEventListener("click", close);
  if (timeout) setTimeout(close, timeout);
}

/* =============== Fancy select (sticky + “solo uno abierto”) =============== */
let FS_OPEN_COUNT = 0;
const FS_INSTANCES = new Set();
let FS_ID_SEQ = 1;

function closeAllFancyExcept(instance) {
  FS_INSTANCES.forEach(i => { if (i !== instance) i.close(); });
}

function upgradeSelect(nativeSelect, opts = {}) {
  if (!nativeSelect || nativeSelect._fancy) return;
  const multiple = nativeSelect.hasAttribute("multiple") || !!opts.multiple;
  const placeholder = opts.placeholder || "Estado";
  const sticky = opts.sticky ?? true;

  const wrapper = document.createElement("div");
  wrapper.className = "fancy-select relative w-full";
  wrapper.dataset.fsId = String(FS_ID_SEQ++);
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
    "origin-top rounded-2xl border border-gray-200 bg-white shadow-xl p-2",
    "opacity-0 scale-95 pointer-events-none transition-all"
  ].join(" ");
  panel._open = false;

  const header = document.createElement("div");
  header.className = "flex items-center justify-between px-1 pb-2 border-b";
  header.innerHTML = `
    <span class="text-sm font-medium text-gray-700">Cambiar estado</span>
    <button type="button" class="fs-close rounded-lg px-2 py-1 text-sm bg-gray-100 hover:bg-gray-200">Cerrar</button>
  `;
  const btnClose = header.querySelector(".fs-close");

  const list = document.createElement("div");
  list.className = "max-h-64 overflow-auto space-y-1 mt-2";

  panel.append(header, list);
  wrapper.appendChild(panel);

  const readOptions = () =>
    Array.from(nativeSelect.options).map(o => ({
      value: o.value,
      label: o.textContent.trim(),
      disabled: !!o.disabled,
      selected: !!o.selected
    }));

  function renderList() {
    list.innerHTML = "";
    readOptions().forEach(opt => {
      if (opt.disabled) return;
      const row = document.createElement("button");
      row.type = "button";
      row.className = "w-full text-left px-3 py-2 rounded-lg hover:bg-gray-50 flex items-center gap-2";
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
          const op = nativeSelect.querySelector(`option[value="${CSS.escape(opt.value)}"]`);
          op.selected = !opt.selected;
        } else {
          nativeSelect.value = opt.value;
        }
        nativeSelect.dispatchEvent(new Event("change", { bubbles: true }));
        syncControl();
        renderList();
        if (!multiple && !sticky) instance.close();
      });

      list.appendChild(row);
    });
  }

  function syncControl() {
    const opts = readOptions().filter(o => o.selected && !o.disabled);
    chips.innerHTML = "";
    if (!opts.length) {
      chips.appendChild(ph);
    } else {
      const chip = document.createElement("span");
      chip.className = "px-2 py-0.5 rounded-full bg-gray-100 text-gray-800 text-sm";
      chip.textContent = opts[0].label;
      chips.appendChild(chip);
      if (opts.length > 1) {
        const more = document.createElement("span");
        more.className = "px-2 py-0.5 rounded-full bg-gray-100 text-gray-800 text-sm";
        more.textContent = `+${opts.length - 1}`;
        chips.appendChild(more);
      }
    }
  }

  function open() {
    if (panel._open) return;
    // Cerrar los demás antes de abrir este
    closeAllFancyExcept(instance);

    panel._open = true;
    FS_OPEN_COUNT++;
    panel.classList.remove("pointer-events-none");
    panel.style.opacity = "1";
    panel.style.transform = "scale(1)";
    caret.style.transform = "rotate(180deg)";
  }
  function close() {
    if (!panel._open) return;
    panel._open = false;
    FS_OPEN_COUNT = Math.max(0, FS_OPEN_COUNT - 1);
    panel.classList.add("pointer-events-none");
    panel.style.opacity = "0";
    panel.style.transform = "scale(.95)";
    caret.style.transform = "rotate(0deg)";
  }
  function toggle() { panel._open ? close() : open(); }

  const instance = { wrapper, open, close, isOpen: () => panel._open };
  FS_INSTANCES.add(instance);

  control.addEventListener("click", toggle);
  // modo sticky: NO cerramos por click afuera; se cierra con botón
  btnClose.addEventListener("click", () => close());

  nativeSelect.addEventListener("change", () => { syncControl(); renderList(); });

  syncControl();
  renderList();
  nativeSelect._fancy = { ...instance, sync: syncControl, isFancy: true };
}

/* =============== Card mesa =============== */
function renderMesaCard(vm, estadosCatalogo, onAfterChange) {
  const nombreLower = norm(vm.nombreEstado);
  // bloquear SOLO cuando está Ocupada o Reservada
  const isLocked = nombreLower.includes("ocup") || nombreLower.includes("reserv");

  // mostrar solo Disponible / Limpieza / Fuera de uso
  let opciones = filtraEstadosParaEdicion(Array.isArray(estadosCatalogo) ? estadosCatalogo.slice() : []);
  if (!opciones.length) opciones = [{ id: 1, nombre: "Disponible" }];

  const card = document.createElement("div");
  card.className = [
    "border border-gray-200 rounded-xl p-4 bg-white shadow-sm flex flex-col gap-3",
    isLocked ? "opacity-60 pointer-events-none" : ""
  ].join(" ");

  card.innerHTML = `
    <div class="flex items-center justify-between">
      <div class="text-lg font-semibold">${vm.nomMesa}</div>
      <span class="estado-badge px-2 py-1 text-xs rounded ${badgeClass(vm.nombreEstado)} capitalize">
        ${vm.nombreEstado || "—"}
      </span>
    </div>
    <div class="mt-1 text-sm ${isLocked ? "text-red-600" : "text-gray-600"}">
      ${isLocked ? "No editable (mesa con pedido/reserva)" : "&nbsp;"}
    </div>
    <div class="mt-auto">
      <label class="block text-xs text-gray-500 mb-1">Estado</label>
      <select class="sel-estado w-full rounded-lg border border-gray-300 px-3 py-2 bg-white" ${isLocked ? "disabled" : ""}></select>
    </div>
  `;

  const sel = card.querySelector(".sel-estado");
  const badge = card.querySelector(".estado-badge");

  const ph = new Option("Estado", "", true, true);
  ph.disabled = true;
  sel.appendChild(ph);
  for (const o of opciones) sel.appendChild(new Option(o.nombre, String(o.id)));

  const match = opciones.find(o => norm(o.nombre) === norm(vm.nombreEstado));
  if (match) sel.value = String(match.id);

  // sticky + solo uno abierto
  upgradeSelect(sel, { placeholder: "Estado", sticky: true });

  // ...dentro de renderMesaCard(), después de upgradeSelect(...)
  sel.addEventListener("change", async () => {
    if (isLocked) return;

    const nuevoId = Number(sel.value);
    if (!Number.isFinite(nuevoId) || nuevoId === vm.idEstado) return;

    try {
      sel.disabled = true;
      showBusy("Actualizando estado…");

      await updateMesaEstadoApi(vm.id, nuevoId);

      // Actualiza badge en la tarjeta sin re-render global
      const nuevo = opciones.find(o => o.id === nuevoId);
      if (nuevo) {
        vm.idEstado = nuevoId;
        vm.nombreEstado = nuevo.nombre;
        badge.textContent = nuevo.nombre;
        badge.className =
          `estado-badge px-2 py-1 text-xs rounded ${badgeClass(nuevo.nombre)} capitalize`;
      }

      showAlert("success", `${vm.nomMesa}: estado actualizado`, { timeout: 1800 });
    } catch (e) {
      showAlert("error", e?.message || "No se pudo actualizar la mesa");
    } finally {
      hideBusy();
      sel.disabled = false;
    }
  });


  return card;
}

/* =============== Render + auto-refresh (sin overlay) =============== */
let _mesasContainer = null;
let _autoTimer = null;
let _isRendering = false;

async function renderMesasGrid(container, { firstLoad = false } = {}) {
  if (_isRendering) return;
  _isRendering = true;

  try {
    if (firstLoad && !container.dataset._loaded) {
      // Mensaje inicial dentro del contenedor (no overlay)
      container.innerHTML = `<div class="py-10 text-center text-gray-500">Cargando mesas…</div>`;
    }

    // En el primer render mostramos overlay; en refrescos, no.
    if (firstLoad && !container.dataset._loaded) showBusy("Cargando mesas…");

    const [estados, mesas] = await Promise.all([
      fetchEstadosMesa(),
      getMesas(0, MAX_SIZE),
    ]);

    if (firstLoad && !container.dataset._loaded) hideBusy();

    // En primer render, también mostramos “Cargando pedidos…”
    const huboCambios = await syncMesasSegunPedidos(mesas, estados, {
      busy: firstLoad && !container.dataset._loaded
    });

    const mesasFinal = huboCambios ? await getMesas(0, MAX_SIZE) : mesas;

    const estadosById = new Map(estados.map(e => [e.id, e]));

    const view = mesasFinal
      .map(m => {
        const id = Number(m.Id ?? m.id ?? m.idMesa);
        const etiqueta = m.NomMesa || m.nomMesa || m.NombreMesa || m.nombreMesa || `Mesa ${id}`;
        const idEstado = Number(m.IdEstadoMesa ?? m.idEstadoMesa);
        const nombreEstado = estadosById.get(idEstado)?.nombre || "";
        return { id, nomMesa: etiqueta, idEstado, nombreEstado };
      })
      .sort((a, b) => {
        const na = Number(String(a.nomMesa).match(/\d+/)?.[0] || 0);
        const nb = Number(String(b.nomMesa).match(/\d+/)?.[0] || 0);
        return na - nb;
      });

    container.innerHTML = "";
    const grid = document.createElement("div");
    grid.className = "grid gap-4 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4";
    container.appendChild(grid);

    const refresh = () => renderMesasGrid(container);
    view.forEach(vm => grid.appendChild(renderMesaCard(vm, estados, refresh)));

    container.dataset._loaded = "1"; // ← evita que reaparezca “Cargando mesas…”
  } finally {
    _isRendering = false;
  }
}

function startAutoRefresh() {
  if (_autoTimer) return;
  _autoTimer = setInterval(() => {
    // Pausar si pestaña oculta o hay un select abierto o hay overlay
    if (document.hidden || FS_OPEN_COUNT > 0 || BUSY_COUNT > 0) return;
    if (_mesasContainer) renderMesasGrid(_mesasContainer);
  }, AUTO_REFRESH_MS);
}
function stopAutoRefresh() {
  if (_autoTimer) { clearInterval(_autoTimer); _autoTimer = null; }
}

/* =============== INIT =============== */
document.addEventListener("DOMContentLoaded", init);

async function init() {
  _mesasContainer = $("#mesas-grid") || $("#tables-grid") || $("#mesas-container") || $("#tables-list") || $("#mesas-list");
  if (!_mesasContainer) {
    console.warn("[Mesas] No se encontró el contenedor (#mesas-grid | #tables-grid | #mesas-container | #tables-list | #mesas-list).");
    return;
  }
  _mesasContainer.classList.add("animate-[fadeIn_.2s_ease]");

  await renderMesasGrid(_mesasContainer, { firstLoad: true });
  startAutoRefresh();

  document.addEventListener("visibilitychange", () => {
    if (document.hidden) stopAutoRefresh();
    else {
      startAutoRefresh();
      if (FS_OPEN_COUNT === 0 && BUSY_COUNT === 0) renderMesasGrid(_mesasContainer);
    }
  });

  // Si otra vista cambia pedidos, refrescar si es seguro
  window.addEventListener("pedido:cambiado", () => {
    if (FS_OPEN_COUNT === 0 && BUSY_COUNT === 0) renderMesasGrid(_mesasContainer);
  });
}
