// js/controllers/mesaController.js
// Reemplaza COMPLETO este archivo

import { getMesas, fetchPedidosAll /*, patchEstadoMesa*/ } from "../services/mesaService.js"; // usamos nuestra llamada directa

const $  = (s, r = document) => r.querySelector(s);
const $$ = (s, r = document) => Array.from(r.querySelectorAll(s));

const API_HOST = "http://localhost:8080";
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
  if (Array.isArray(data?.data))    return data.data;
  if (Array.isArray(data))          return data;
  if (Array.isArray(data?.data?.content)) return data.data.content;
  return [];
}
async function fetchArray(url) {
  const res = await fetch(url, { credentials: "include", headers: { Accept: "application/json" }, cache: "no-store" });
  if (!res.ok) return [];
  const data = await res.json().catch(() => ({}));
  return pickArrayPayload(data);
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
      // DTO: { Id, EstadoMesa, ColorEstadoMesa }
      const id = Number(e.Id ?? e.id);
      const nombre = String(e.EstadoMesa ?? e.estadoMesa ?? "").trim();
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

/* =============== Patch directo a la API (ruta real del backend) =============== */
// MesaController.java → @PatchMapping("/estado/{id}/{estadoId}")
async function updateMesaEstadoApi(idMesa, idEstado) {
  const url = `${API_HOST}/apiMesa/estado/${encodeURIComponent(idMesa)}/${encodeURIComponent(idEstado)}`;
  const res = await fetch(url, {
    method: "PATCH",
    credentials: "include",
    headers: { Accept: "application/json" }, // sin body
  });
  if (!res.ok) {
    const txt = await res.text().catch(()=> "");
    throw new Error(txt || `PATCH ${url} → ${res.status}`);
  }
  // puede devolver el DTO. No lo necesitamos, pero lo parseamos por si acaso
  let data = null;
  try { data = await res.json(); } catch {}
  return data;
}

/* =============== Estados visuales =============== */
const BADGE = {
  disponible: "bg-emerald-100 text-emerald-800",
  ocupada:    "bg-red-100 text-red-800",
  reservada:  "bg-amber-100 text-amber-800",
  limpieza:   "bg-sky-100 text-sky-800",
  fuera:      "bg-gray-200 text-gray-800",
  desconocido:"bg-gray-100 text-gray-700",
};
function badgeClass(estado) {
  const key = norm(estado);
  if (key.includes("dispon")) return BADGE.disponible;
  if (key.includes("ocup"))   return BADGE.ocupada;
  if (key.includes("reserv")) return BADGE.reservada;
  if (key.includes("limp"))   return BADGE.limpieza;
  if (key.includes("fuera"))  return BADGE.fuera;
  return BADGE.desconocido;
}

/* =============== Lógica de negocio (según pedido) =============== */
/**
 * Pedido activo → mesa OCUPADA (EstadoMesaId 2)
 *   - IdEstadoPedido: 1 (Pendiente), 2 (En preparación), 3 (Entregado)
 * Pedido final → mesa DISPONIBLE (EstadoMesaId 1)
 *   - IdEstadoPedido: 5 (Cancelado), 6 (Finalizado)
 *   - (Pagado 4 NO lo pediste, así que no lo toco)
 * Estados "Limpieza" y "Fuera de uso" se manipulan manualmente (NO se tocan aquí).
 */
const PEDIDO_ACTIVO_IDS = new Set([1, 2, 3]);
const PEDIDO_FINAL_IDS  = new Set([5, 6]);
const PEDIDO_ACTIVO_NOMS = new Set(["pendiente", "en preparacion", "en preparación", "entregado"]);
const PEDIDO_FINAL_NOMS  = new Set(["cancelado", "finalizado"]);

function extractMesaIdFromPedido(p) {
  // DTO: { IdMesa, IdEstadoPedido, ... }
  const id = Number(p.IdMesa ?? p.idMesa ?? p.mesaId);
  return Number.isFinite(id) ? id : null;
}
function extractEstadoPedidoId(p) {
  const id = Number(p.IdEstadoPedido ?? p.idEstadoPedido ?? p.estadoPedidoId);
  return Number.isFinite(id) ? id : null;
}
function extractEstadoPedidoNombre(p) {
  // por si algún serializador adjunta nombre; normalmente el DTO trae solo IDs
  const n = p.EstadoPedido ?? p.estadoPedido ?? p.NombreEstado ?? p.nombreEstado ?? p.estado;
  return n ? String(n) : "";
}

/* Lee pedidos y decide si hay uno ACTIVO por mesa */
async function getMesasConPedidoActivoSet() {
  const pedidos = await fetchArray(`${API_HOST}/apiPedido/getDataPedido?page=0&size=500`);
  const set = new Set();
  for (const p of pedidos) {
    const idMesa = extractMesaIdFromPedido(p);
    if (!Number.isFinite(idMesa)) continue;

    const id = extractEstadoPedidoId(p);
    const nom = norm(extractEstadoPedidoNombre(p));
    let activo = false;

    if (id != null) activo = PEDIDO_ACTIVO_IDS.has(id) || (PEDIDO_FINAL_IDS.has(id) ? false : activo);
    if (!activo && nom) activo = PEDIDO_ACTIVO_NOMS.has(nom);

    if (activo) set.add(String(idMesa));
  }
  return set;
}

/**
 * Sincroniza en BD:
 *  - Mesa con pedido activo → Ocupada
 *  - Mesa sin pedido activo → Disponible
 *  - NO tocar si la mesa está en Limpieza o Fuera de uso (manual)
 */
async function syncMesasSegunPedidos(mesas, estados) {
  // ===== utilidades robustas (planos/anidados) =====
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

  // ===== IDs de estados de mesa (detectados por nombre) =====
  const idDisponible = (estados.find(e => N(e.nombre).includes("dispon"))?.id) ?? 1;
  const idOcupada    = (estados.find(e => N(e.nombre).includes("ocup"))  ?.id) ?? 2;
  const estadosById  = new Map(estados.map(e => [e.id, e]));

  // ===== reglas de pedido que definiste =====
  const PEDIDO_ACTIVO_IDS  = new Set([1, 2, 3]); // pendiente / preparación / entregado
  const PEDIDO_FINAL_IDS   = new Set([5, 6]);    // cancelado / finalizado
  const PEDIDO_ACTIVO_NOMS = new Set(["pendiente","en preparacion","en preparación","preparacion","preparación","entregado"]);
  const PEDIDO_FINAL_NOMS  = new Set(["cancelado","finalizado"]);

  // ===== 1) Traer todos los pedidos (paginado) y quedarnos con el ÚLTIMO por mesa =====
  const pedidos = await fetchPedidosAll();
  const ultimoPorMesa = new Map(); // mesaId -> pedido más reciente

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

  // ===== 2) Decidir target por mesa (sin tocar Limpieza / Fuera de uso) =====
  const updates = [];

  for (const m of mesas) {
    const mesaId = Number(m.Id ?? m.id ?? m.idMesa ?? m.IdMesa);
    if (!Number.isFinite(mesaId)) continue;

    const idEstadoBD = Number(m.IdEstadoMesa ?? m.idEstadoMesa);
    const nombreBD   = estadosById.get(idEstadoBD)?.nombre || "";
    const sbd = N(nombreBD);
    if (sbd.includes("limpieza") || sbd.includes("fuera de uso")) continue; // manuales

    const ped = ultimoPorMesa.get(mesaId);
    let target = idDisponible; // por defecto, sin pedido → disponible

    if (ped) {
      const idEp  = getEstadoPedidoId(ped);
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

  // ===== 3) PATCH real a la API para escribir en BD =====
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
    host.className = "fixed top-4 right-4 z-50 space-y-3 pointer-events-none";
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

/* =============== Fancy select =============== */
function upgradeSelect(nativeSelect, opts = {}) {
  if (!nativeSelect || nativeSelect._fancy) return;
  const multiple    = nativeSelect.hasAttribute("multiple") || !!opts.multiple;
  const placeholder = opts.placeholder || "Estado";

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

  const list = document.createElement("div");
  list.className = "max-h-64 overflow-auto space-y-1";
  panel.appendChild(list);
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
        if (!multiple) close();
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

  function open()  { panel.classList.remove("pointer-events-none"); panel.style.opacity="1"; panel.style.transform="scale(1)"; caret.style.transform="rotate(180deg)"; }
  function close() { panel.classList.add("pointer-events-none"); panel.style.opacity="0"; panel.style.transform="scale(.95)"; caret.style.transform="rotate(0deg)"; }
  function toggle(){ (panel.style.opacity === "1") ? close() : open(); }

  control.addEventListener("click", toggle);
  document.addEventListener("click", (e) => { if (!wrapper.contains(e.target)) close(); });
  nativeSelect.addEventListener("change", () => { syncControl(); renderList(); });

  syncControl();
  renderList();
  nativeSelect._fancy = { wrapper, control, open, close, sync: syncControl, isFancy: true };
}

/* =============== Card mesa =============== */
function renderMesaCard(vm, estadosCatalogo, onAfterChange) {
  const nombreLower = norm(vm.nombreEstado);
  const isLocked = nombreLower.includes("ocup") || nombreLower.includes("limpieza") || nombreLower.includes("fuera de uso");

  let opciones = Array.isArray(estadosCatalogo) ? estadosCatalogo.slice() : [];
  if (!opciones.length) opciones = [{ id: 1, nombre: "Disponible" }];

  const card = document.createElement("div");
  card.className = [
    "border border-gray-200 rounded-xl p-4 bg-white shadow-sm flex flex-col gap-3",
    isLocked ? "opacity-60 pointer-events-none" : ""
  ].join(" ");

  card.innerHTML = `
    <div class="flex items-center justify-between">
      <div class="text-lg font-semibold">${vm.nomMesa}</div>
      <span class="px-2 py-1 text-xs rounded ${badgeClass(vm.nombreEstado)} capitalize">
        ${vm.nombreEstado || "—"}
      </span>
    </div>
    <div class="mt-1 text-sm ${isLocked ? "text-red-600" : "text-gray-600"}">
      ${isLocked ? "No editable" : "&nbsp;"}
    </div>
    <div class="mt-auto">
      <label class="block text-xs text-gray-500 mb-1">Estado</label>
      <select class="sel-estado w-full rounded-lg border border-gray-300 px-3 py-2 bg-white" ${isLocked ? "disabled" : ""}></select>
    </div>
  `;

  const sel = card.querySelector(".sel-estado");

  const ph = new Option("Estado", "", true, true);
  ph.disabled = true;
  sel.appendChild(ph);
  for (const o of opciones) sel.appendChild(new Option(o.nombre, String(o.id)));

  const match = opciones.find(o => norm(o.nombre) === norm(vm.nombreEstado));
  if (match) sel.value = String(match.id);

  upgradeSelect(sel, { placeholder: "Estado" });

  sel.addEventListener("change", async () => {
    if (isLocked) return;
    const nuevoId = Number(sel.value);
    if (!Number.isFinite(nuevoId) || nuevoId === vm.idEstado) return;
    try {
      sel.disabled = true;
      // 🔴 Usar la ruta real del backend
      await updateMesaEstadoApi(vm.id, nuevoId);
      showAlert("success", `${vm.nomMesa}: estado actualizado`);
      onAfterChange?.();
    } catch (e) {
      showAlert("error", e.message || "No se pudo actualizar la mesa");
      sel.disabled = false;
    }
  });

  return card;
}

/* =============== Render + sync + auto-refresh =============== */
let _mesasContainer = null;
let _autoTimer = null;
let _isRendering = false;

async function renderMesasGrid(container) {
  if (_isRendering) return;
  _isRendering = true;

  try {
    if (!container.dataset._inited) {
      container.dataset._inited = "1";
      container.innerHTML = `<div class="py-10 text-center text-gray-500">Cargando mesas…</div>`;
    }

    // 1) catálogo + mesas
    const [estados, mesas] = await Promise.all([
      fetchEstadosMesa(),
      getMesas(0, MAX_SIZE), // tu servicio ya pega a /apiMesa/getDataMesa
    ]);

    // 2) sincroniza BD según pedidos (PATCH reales a /apiMesa/estado/{id}/{estadoId})
    const huboCambios = await syncMesasSegunPedidos(mesas, estados);

    // 3) si hubo cambios, recarga mesas
    const mesasFinal = huboCambios ? await getMesas(0, MAX_SIZE) : mesas;

    // 4) mapa estados para etiqueta
    const estadosById = new Map(estados.map(e => [e.id, e]));

    // 5) view
    const view = mesasFinal
      .map(m => {
        // MesaDTO: Id, NomMesa, IdEstadoMesa
        const id = Number(m.Id ?? m.id ?? m.idMesa);
        const etiqueta = m.NomMesa || m.nomMesa || m.NombreMesa || m.nombreMesa || `Mesa ${id}`;
        const idEstado = Number(m.IdEstadoMesa ?? m.idEstadoMesa);
        const nombreEstado = estadosById.get(idEstado)?.nombre || "";
        return { id, nomMesa: etiqueta, idEstado, nombreEstado };
      })
      .sort((a,b) => {
        const na = Number(String(a.nomMesa).match(/\d+/)?.[0] || 0);
        const nb = Number(String(b.nomMesa).match(/\d+/)?.[0] || 0);
        return na - nb;
      });

    // 6) render
    container.innerHTML = "";
    const grid = document.createElement("div");
    grid.className = "grid gap-4 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4";
    container.appendChild(grid);

    const refresh = () => renderMesasGrid(container);
    view.forEach(vm => grid.appendChild(renderMesaCard(vm, estados, refresh)));

  } finally {
    _isRendering = false;
  }
}

function startAutoRefresh() {
  if (_autoTimer) return;
  _autoTimer = setInterval(() => {
    if (document.hidden) return;
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

  await renderMesasGrid(_mesasContainer);
  startAutoRefresh();

  document.addEventListener("visibilitychange", () => {
    if (document.hidden) stopAutoRefresh();
    else { startAutoRefresh(); renderMesasGrid(_mesasContainer); }
  });

  // Si otra vista cambia pedidos, dispara este evento para refrescar al instante
  window.addEventListener("pedido:cambiado", () => renderMesasGrid(_mesasContainer));
}
