// js/controllers/mesasController.js
import { getMesas, patchEstadoMesa } from "../services/mesaService.js";

const $  = (s, r = document) => r.querySelector(s);
const $$ = (s, r = document) => Array.from(r.querySelectorAll(s));

const API_HOST = "http://localhost:8080";
const MAX_SIZE = 50;

/* ===========================================================
   Estados de mesa (traer TODAS las páginas)  ← usa 'estadoMesa'
   =========================================================== */
async function fetchEstadosMesa() {
  const base = `${API_HOST}/apiEstadoMesa/getDataEstadoMesa`;
  let page = 0;
  const size = 50;
  const out = [];

  while (true) {
    const url = `${base}?page=${page}&size=${size}`;
    const res = await fetch(url, { headers: { Accept: "application/json" }, credentials: "include" });
    if (!res.ok) break;

    const data = await res.json().catch(() => ({}));
    const content = Array.isArray(data?.content) ? data.content : (Array.isArray(data) ? data : []);

    for (const e of content) {
      const id = Number(e.id ?? e.ID ?? e.idEstadoMesa ?? e.IdEstadoMesa ?? e.IDESTADOMESA);
      const nombre = String(
        e.estadoMesa     // ← tu backend
        ?? e.nomEstado
        ?? e.nomEstadoMesa
        ?? e.nombre
        ?? e.nombreEstado
        ?? e.NOMBREESTADO
        ?? ""
      ).trim();
      if (Number.isFinite(id) && nombre) out.push({ id, nombre });
    }

    if (data && typeof data.last === "boolean") {
      if (data.last) break;
      page += 1;
    } else {
      break;
    }
  }

  // quitar duplicados por id
  const uniq = [...new Map(out.map(x => [x.id, x])).values()];

  // Fallback mínimo
  return uniq.length ? uniq : [{ id: 1, nombre: "Disponible" }];
}

/* ===========================================================
   (Opcional) mapeo simple mesa → VM con nombre de estado
   =========================================================== */
function buildMesaVM(mesa, estadosCatalogo) {
  const id   = Number(mesa.id ?? mesa.ID ?? mesa.idMesa);
  const num  = String(mesa.nomMesa ?? mesa.nombre ?? `Mesa ${id}`);
  const idEstado = Number(mesa.idEstadoMesa ?? mesa.IdEstadoMesa);
  const estadoNombre = (estadosCatalogo.find(e => e.id === idEstado)?.nombre || "").trim();
  return { id, nomMesa: num, idEstado, nombreEstado: estadoNombre };
}

/* ===== Alertas ===== */
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

/* ===== Fancy select (sin buscador) ===== */
function upgradeSelect(nativeSelect, opts = {}) {
  if (!nativeSelect || nativeSelect._fancy) return;
  const multiple    = nativeSelect.hasAttribute("multiple") || !!opts.multiple;
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
      if (opt.disabled) return; // no mostrar placeholder en lista
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

/* ===== Utilidades estado ===== */
const BADGE = {
  disponible: "bg-emerald-100 text-emerald-800",
  ocupada:    "bg-red-100 text-red-800",
  reservada:  "bg-amber-100 text-amber-800",
  limpieza:   "bg-sky-100 text-sky-800",
  desconocido:"bg-gray-100 text-gray-700",
};
function badgeClass(estado) {
  const key = String(estado || "").toLowerCase();
  return BADGE[key] || BADGE.desconocido;
}
function humanEstado(est) {
  const s = (est || "").toLowerCase();
  if (s.includes("dispon")) return "disponible";
  if (s.includes("ocup"))   return "ocupada";
  if (s.includes("reserv")) return "reservada";
  if (s.includes("limp"))   return "limpieza";
  return est || "";
}
function isToday(isoDateStr) {
  if (!isoDateStr) return false;
  const d = new Date(isoDateStr);
  if (isNaN(d)) {
    const m = String(isoDateStr).match(/^(\d{4})-(\d{2})-(\d{2})/);
    if (!m) return false;
    const t = new Date();
    return Number(m[1])===t.getFullYear() && Number(m[2])===t.getMonth()+1 && Number(m[3])===t.getDate();
    }
  const t = new Date();
  return d.getFullYear()===t.getFullYear() && d.getMonth()===t.getMonth() && d.getDate()===t.getDate();
}
function nowBetween(h1, h2) {
  const pad = n => String(n).padStart(2,"0");
  const t = new Date();
  const now = `${pad(t.getHours())}:${pad(t.getMinutes())}`;
  const a = (h1||"").slice(0,5);
  const b = (h2||"").slice(0,5);
  return (!a || now >= a) && (!b || now <= b);
}

/* ===== Cargas auxiliares ligeras ===== */
async function getPedidosLight(page=0,size=MAX_SIZE) {
  const url = `${API_HOST}/apiPedido/getDataPedido?page=${page}&size=${Math.min(size, MAX_SIZE)}`;
  const res = await fetch(url, { headers: { Accept: "application/json" }, credentials: "include" });
  const text = await res.text().catch(()=> "");
  if (!res.ok) return [];
  let data; try { data = text ? JSON.parse(text) : null; } catch { data = null; }
  const arr = Array.isArray(data?.content) ? data.content : [];
  return arr
    .map(p => ({
      idMesa: Number(p.idMesa ?? p.IdMesa),
      idEstadoPedido: Number(p.idEstadoPedido ?? p.IdEstadoPedido), // 1..4
    }))
    .filter(x => Number.isFinite(x.idMesa) && x.idMesa > 0);
}

async function getReservasLight(page=0,size=MAX_SIZE) {
  try {
    const url = `${API_HOST}/apiReserva/getDataReserva?page=${page}&size=${Math.min(size, MAX_SIZE)}`;
    const res = await fetch(url, { headers: { Accept: "application/json" }, credentials: "include" });
    const text = await res.text().catch(()=> "");
    if (!res.ok) return [];
    let data; try { data = text ? JSON.parse(text) : null; } catch { data = null; }
    const arr = Array.isArray(data?.content) ? data.content : [];
    return arr.map(r => ({
      idMesa: Number(r.idMesa ?? r.IdMesa),
      idEstadoReserva: Number(r.idEstadoReserva ?? r.IdEstadoReserva),
      fechaReserva: String(r.fechaReserva ?? r.FechaReserva ?? ""),
      horaInicio:   String(r.horaInicio   ?? r.HoraInicio   ?? ""),
      horaFin:      String(r.horaFin      ?? r.HoraFin      ?? ""),
    }));
  } catch { return []; }
}

/* ===== Tarjeta (select sin botón, bloqueada si Ocupada/Reservada) ===== */
function renderMesaCard(vm, estadosCatalogo, onAfterChange) {
  const estadoActual = (vm.nombreEstado || "").toLowerCase();
  const isLocked = /ocupad|reservad/.test(estadoActual);

  // opciones = todos los estados menos Ocupada/Reservada
  let opciones = (Array.isArray(estadosCatalogo) ? estadosCatalogo : []).filter(
    e => !/ocupad|reservad/i.test(e.nombre || "")
  );
  if (!opciones.length) opciones = [{ id: 1, nombre: "Disponible" }];

  const card = document.createElement("div");
  card.className = [
    "border border-gray-200 rounded-xl p-4 bg-white shadow-sm flex flex-col gap-3",
    isLocked ? "opacity-60 pointer-events-none" : ""
  ].join(" ");

  const estadoBadge = (s) => {
    const k = (s || "").toLowerCase();
    if (k.includes("dispon")) return "bg-emerald-100 text-emerald-800";
    if (k.includes("ocup"))   return "bg-red-100 text-red-800";
    if (k.includes("reserv")) return "bg-amber-100 text-amber-800";
    if (k.includes("limp"))   return "bg-sky-100 text-sky-800";
    return "bg-gray-100 text-gray-700";
  };

  card.innerHTML = `
    <div class="flex items-center justify-between">
      <div class="text-lg font-semibold">${vm.nomMesa}</div>
      <span class="px-2 py-1 text-xs rounded ${estadoBadge(vm.nombreEstado)} capitalize">
        ${vm.nombreEstado || "—"}
      </span>
    </div>
    <div class="mt-1 text-sm ${isLocked ? "text-red-600" : "text-gray-600"}">
      ${isLocked ? "No se puede cambiar: mesa ocupada o reservada" : "&nbsp;"}
    </div>
    <div class="mt-auto">
      <label class="block text-xs text-gray-500 mb-1">Estado</label>
      <select class="sel-estado w-full rounded-lg border border-gray-300 px-3 py-2 bg-white" ${isLocked ? "disabled" : ""}></select>
    </div>
  `;

  const sel = card.querySelector(".sel-estado");

  // Placeholder (disabled para que NO aparezca en la lista)
  const ph = new Option("Estado", "", true, true);
  ph.disabled = true;
  sel.appendChild(ph);

  // Opciones reales (de la BD), excepto Ocupada/Reservada
  for (const o of opciones) sel.appendChild(new Option(o.nombre, String(o.id)));

  // Preselección si es elegible
  if (!isLocked) {
    const match = opciones.find(o => o.id === vm.idEstado);
    if (match) sel.value = String(match.id);
  }

  // Fancy select (sin buscador)
  upgradeSelect(sel, { placeholder: "Estado" });

  // Cambio (cuando no está bloqueada)
  sel.addEventListener("change", async () => {
    if (isLocked) return;
    const nuevoId = Number(sel.value);
    if (!Number.isFinite(nuevoId) || nuevoId === vm.idEstado) return;
    try {
      sel.disabled = true;
      await patchEstadoMesa(vm.id, nuevoId);
      showAlert("success", `${vm.nomMesa}: estado actualizado`);
      onAfterChange?.();
    } catch (e) {
      showAlert("error", e.message || "No se pudo actualizar la mesa");
      sel.disabled = false;
    }
  });

  return card;
}

/* ===== Render grid ===== */
async function renderMesasGrid(container) {
  container.innerHTML = `<div class="py-10 text-center text-gray-500">Cargando mesas…</div>`;

  // Estados desde nuestra función paginada
  const [mesas, estados, pedidos, reservas] = await Promise.all([
    getMesas(0, MAX_SIZE),
    fetchEstadosMesa(),
    getPedidosLight(0, MAX_SIZE),
    getReservasLight(0, MAX_SIZE),
  ]);

  if (!Array.isArray(mesas) || !mesas.length) {
    container.innerHTML = `<div class="py-10 text-center text-gray-500">No hay mesas para mostrar.</div>`;
    return;
  }

  const estadosById  = new Map(estados.map(e => [e.id, e]));
  const estadosLower = new Map(estados.map(e => [humanEstado(e.nombre), e]));
  const ID_DISPON    = estadosLower.get("disponible")?.id ?? 1;
  const ID_OCUPADA   = estadosLower.get("ocupada")?.id    ?? 2;
  const ID_RESERVADA = estadosLower.get("reservada")?.id  ?? 3;

  // Ocupadas: cualquier pedido de esa mesa con estado != Pagado (4)
  const ocupadasSet = new Set(
    pedidos
      .filter(p => Number(p.idMesa) > 0 && Number(p.idEstadoPedido) !== 4)
      .map(p => String(p.idMesa))
  );

  // Reservadas: reservas activas HOY y en horario, estado Activa (1)
  const reservadasSet = new Set(
    reservas
      .filter(r => Number(r.idMesa) > 0 && Number(r.idEstadoReserva) === 1)
      .filter(r => isToday(r.fechaReserva))
      .filter(r => nowBetween(r.horaInicio, r.horaFin))
      .map(r => String(r.idMesa))
  );

  const view = mesas
    .map(m => {
      const id = Number(m.Id ?? m.id ?? m.idMesa);
      const etiqueta = m.NomMesa || m.nomMesa || `Mesa ${m.Numero || id}`;
      let idEstadoEfectivo = Number(m.IdEstadoMesa ?? m.idEstadoMesa) || ID_DISPON;
      let lockReason = null;

      if (reservadasSet.has(String(id))) { idEstadoEfectivo = ID_RESERVADA; lockReason = "reservada"; }
      if (ocupadasSet.has(String(id)))   { idEstadoEfectivo = ID_OCUPADA;   lockReason = "ocupada";   }

      const nombreEstado = estadosById.get(idEstadoEfectivo)?.nombre
                        || (idEstadoEfectivo===ID_OCUPADA ? "Ocupada" : idEstadoEfectivo===ID_RESERVADA ? "Reservada" : "Disponible");

      return { id, nomMesa: etiqueta, idEstado: idEstadoEfectivo, nombreEstado, locked: !!lockReason, lockReason };
    })
    .sort((a,b) => {
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
}

/* ===== INIT ===== */
document.addEventListener("DOMContentLoaded", init);

async function init() {
  const container = $("#mesas-grid") || $("#tables-grid") || $("#mesas-container") || $("#tables-list") || $("#mesas-list");
  if (!container) {
    console.warn("[Mesas] No se encontró el contenedor (#mesas-grid | #tables-grid | #mesas-container | #tables-list | #mesas-list).");
    return;
  }
  container.classList.add("animate-[fadeIn_.2s_ease]");
  await renderMesasGrid(container);
}
