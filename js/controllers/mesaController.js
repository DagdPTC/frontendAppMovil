// js/controllers/mesasController.js
import { getMesasForOrders } from "../services/ordersService.js";

const $  = (s, r = document) => r.querySelector(s);
const $$ = (s, r = document) => Array.from(r.querySelectorAll(s));

const API_HOST = "http://localhost:8080"; // ajusta si usas otro host

/* ===========================================================
   ALERTAS (sin emojis)
   =========================================================== */
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

/* ===========================================================
   MODALES bonitos
   =========================================================== */
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

/* ===========================================================
   FANCY SELECT (mismo de Pedidos: chips + búsqueda + animación)
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
      const chip = document.createElement("span");
      chip.className = "px-2 py-0.5 rounded-full bg-gray-100 text-gray-800 text-sm flex items-center gap-1";
      chip.innerHTML = `<span class="truncate">${opts[0].label}</span>`;
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
   Locks de mesas (desde pedidos)
   =========================================================== */
function getLockedSet() {
  try { return new Set(JSON.parse(localStorage.getItem("mesas_locked_by_orders") || "[]")); } catch { return new Set(); }
}
const isMesaLockedByOrder = (idMesa) => {
  if (typeof window.isMesaLockedByOrder === "function") return window.isMesaLockedByOrder(idMesa);
  return getLockedSet().has(String(idMesa));
};

/* ===========================================================
   API Mesa (best-effort)
   =========================================================== */
/* Cambiar SOLO el estado de una mesa (endpoint real de tu API) */
async function tryUpdateMesaEstado(idMesa, idEstadoMesa) {
  const url = `${API_HOST}/apiMesa/estado/${idMesa}/${idEstadoMesa}`;
  const res = await fetch(url, { method: "PATCH" });
  return res.ok;
}

async function fetchEstadosMesa() {
  try {
    const res = await fetch(`${API_HOST}/apiEstadoMesa/getDataEstadoMesa?page=0&size=50`);
    if (!res.ok) throw new Error("No se pudo obtener estados de mesa");
    const data = await res.json();
    const content = Array.isArray(data) ? data : (data.content || []);
    return content
      .map(e => ({
        id: Number(e.id ?? e.ID ?? e.idEstadoMesa ?? e.IDESTADOMESA),
        nombre: String(e.nomEstado ?? e.nombre ?? e.nombreEstado ?? e.NOMBREESTADO ?? "").trim()
      }))
      .filter(x => Number.isFinite(x.id) && x.nombre);
  } catch {
    // Fallback por si está vacía la tabla
    return [
      { id: 1, nombre: "Disponible" },
      { id: 2, nombre: "Ocupada" },
      { id: 3, nombre: "Reservada" },
      { id: 21, nombre: "Limpieza" },
    ];
  }
}

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
const badgeClass = (estado) => ({
  disponible: "bg-emerald-100 text-emerald-800",
  ocupada:    "bg-red-100 text-red-800",
  reservada:  "bg-amber-100 text-amber-800",
  limpieza:   "bg-sky-100 text-sky-800",
  desconocido:"bg-gray-100 text-gray-700",
}[estado] || "bg-gray-100 text-gray-700");

/* ===========================================================
   Picker de estado (AHORA con fancy select igual al de Pedidos)
   =========================================================== */
async function showEstadoPicker({ title = "Cambiar estado", estados = [], selectedId } = {}) {
  return new Promise((resolve) => {
    const overlay = document.createElement("div");
    overlay.className = "fixed inset-0 z-50 flex items-center justify-center bg-black/40 backdrop-blur-sm";

    const card = document.createElement("div");
    card.className = "w-[min(92vw,420px)] rounded-2xl bg-white shadow-xl border border-gray-200 p-4 animate-[fadeIn_.2s_ease]";
    const options = estados.map(e => `<option value="${e.id}">${e.nombre}</option>`).join("");

    card.innerHTML = `
      <div class="text-base font-semibold mb-2">${title}</div>
      <div class="space-y-3">
        <label class="block text-sm text-gray-600">Estado</label>
        <select id="picker-estado" class="w-full rounded-lg border border-gray-300 px-3 py-2 bg-white">
          ${options}
        </select>
      </div>
      <div class="mt-4 flex gap-2 justify-end">
        <button class="btn-cancel rounded-lg px-3 py-2 bg-gray-100 hover:bg-gray-200 text-gray-800">Cancelar</button>
        <button class="btn-ok rounded-lg px-3 py-2 text-white bg-blue-600 hover:bg-blue-700">Actualizar</button>
      </div>
    `;
    overlay.appendChild(card);
    document.body.appendChild(overlay);

    const sel = card.querySelector("#picker-estado");
    if (selectedId != null) sel.value = String(selectedId);

    // 💄 <- APLICAMOS EL MISMO FANCY SELECT QUE EN PEDIDOS
    upgradeSelect(sel, { placeholder: "Selecciona un estado" });

    const cleanup = (val) => { overlay.remove(); resolve(val); };
    overlay.addEventListener("click", (e) => { if (e.target === overlay) cleanup(null); });
    card.querySelector(".btn-cancel").addEventListener("click", () => cleanup(null));
    card.querySelector(".btn-ok").addEventListener("click", () => cleanup(Number(sel.value)));
  });
}

/* ===========================================================
   Render de tarjetas
   =========================================================== */
function renderMesaCard(mesa, estados, onChange) {
  const estadoStr = nombreEstadoMesa(mesa);
  const locked = isMesaLockedByOrder(mesa.idMesa ?? mesa.id ?? mesa.ID);
  const idMesa = Number(mesa.idMesa ?? mesa.id ?? mesa.ID);
  const numero = String(mesa.numMesa ?? mesa.numero ?? idMesa ?? "");

  const card = document.createElement("div");
  card.className = "border border-gray-200 rounded-xl p-4 bg-white shadow-sm flex flex-col gap-3";
  card.innerHTML = `
    <div class="flex items-center justify-between">
      <div class="text-lg font-semibold">Mesa ${numero}</div>
      <span class="px-2 py-1 text-xs rounded ${badgeClass(estadoStr)} capitalize">${estadoStr}</span>
    </div>
    <div class="mt-1 text-sm text-gray-600">
      ${locked ? "<span class='text-red-600 font-medium'>Ocupada por pedido</span>" : "&nbsp;"}
    </div>
    <div class="mt-auto flex justify-end">
      <button class="btn-change rounded-lg px-3 py-2 text-white ${locked || estadoStr === "ocupada" ? "bg-gray-400 cursor-not-allowed" : "bg-blue-600 hover:bg-blue-700"}">
        Cambiar estado
      </button>
    </div>
  `;

  const btn = card.querySelector(".btn-change");
  btn.addEventListener("click", async () => {
    if (locked || estadoStr === "ocupada") {
      await showConfirm({
        title: "No es posible cambiar el estado",
        message: "Esta mesa está ocupada por un pedido activo. Cancela o elimina el pedido para liberar la mesa.",
        confirmText: "Entendido",
        cancelText: "Cerrar",
      });
      return;
    }
    const currentId = Number(
      mesa.idEstadoMesa ?? mesa.IdEstadoMesa ??
      (mesa.estadoMesa && (mesa.estadoMesa.id ?? mesa.estadoMesa.Id)) ??
      (mesa.estado && (mesa.estado.id ?? mesa.estado.Id))
    );
    const nuevoId = await showEstadoPicker({ estados, selectedId: currentId });
    if (nuevoId == null || Number(nuevoId) === currentId) return;

    const ok = await showConfirm({
      title: "Actualizar estado",
      message: `¿Cambiar la Mesa ${numero} al estado seleccionado?`,
      confirmText: "Actualizar",
      cancelText: "Cancelar",
    });
    if (!ok) return;

    try {
      const okUpdate = await tryUpdateMesaEstado(idMesa, nuevoId);
      if (!okUpdate) throw new Error("No se pudo actualizar el estado de la mesa.");
      showAlert("success", `Mesa ${numero} actualizada correctamente`);
      onChange?.();
    } catch (e) {
      showAlert("error", e.message || "Error al actualizar la mesa");
    }
  });

  return card;
}

async function renderMesasGrid(container) {
  container.innerHTML = `<div class="py-10 text-center text-gray-500">Cargando mesas…</div>`;
  const estados = await fetchEstadosMesa();
  let mesas = [];
  try { mesas = await getMesasForOrders(0); } catch { mesas = []; }

  if (!mesas.length) {
    container.innerHTML = `<div class="py-10 text-center text-gray-500">No hay mesas para mostrar.</div>`;
    return;
  }

  container.innerHTML = "";
  const grid = document.createElement("div");
  grid.className = "grid gap-4 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4";
  container.appendChild(grid);

  const refresh = () => renderMesasGrid(container);
  mesas
    .sort((a,b) => Number(a.numMesa ?? a.numero ?? a.id ?? 0) - Number(b.numMesa ?? b.numero ?? b.id ?? 0))
    .forEach(m => grid.appendChild(renderMesaCard(m, estados, refresh)));
}

/* ===========================================================
   INIT
   =========================================================== */
document.addEventListener("DOMContentLoaded", init);

async function init() {
  const container = $("#mesas-grid") || $("#tables-grid") || $("#mesas-container");
  if (!container) {
    console.warn("[Mesas] No se encontró el contenedor (#mesas-grid).");
    return;
  }
  const page = $("#mesas-page");
  if (page) page.classList.add("p-4");
  container.classList.add("animate-[fadeIn_.2s_ease]");

  await renderMesasGrid(container);
}
