// js/controllers/mesasController.js
import { getMesas, getEstadosMesa, patchEstadoMesa } from "../services/mesaService.js";

const $  = (s, r = document) => r.querySelector(s);
const $$ = (s, r = document) => Array.from(r.querySelectorAll(s));

const API_HOST = "http://localhost:8080"; // ajusta si usas otro host/base
const MAX_SIZE = 50;

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
   MODALES / CONFIRM
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
   Utils estado
   =========================================================== */
function humanEstado(est) {
  const s = (est || "").toLowerCase();
  if (s.includes("dispon")) return "disponible";
  if (s.includes("ocup"))   return "ocupada";
  if (s.includes("reserv")) return "reservada";
  if (s.includes("limp"))   return "limpieza";
  return est || "";
}
const badgeClass = (estado) => ({
  disponible: "bg-emerald-100 text-emerald-800",
  ocupada:    "bg-red-100 text-red-800",
  reservada:  "bg-amber-100 text-amber-800",
  limpieza:   "bg-sky-100 text-sky-800",
  desconocido:"bg-gray-100 text-gray-700",
}[estado] || "bg-gray-100 text-gray-700");

/* reserva ACTIVA ahora (fecha=HOY y hora actual entre inicio/fin) */
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

/* ===========================================================
   Cargas auxiliares: pedidos y reservas (size capado a 50)
   =========================================================== */
async function getPedidosLight(page=0,size=MAX_SIZE) {
  const url = `${API_HOST}/apiPedido/getDataPedido?page=${page}&size=${Math.min(size, MAX_SIZE)}`;
  const res = await fetch(url, { headers: { Accept: "application/json" } });
  const text = await res.text().catch(()=> "");
  if (!res.ok) {
    console.warn("[PedidosLight]", res.status, text);
    return [];
  }
  let data; try { data = text ? JSON.parse(text) : null; } catch { data = null; }
  const arr = Array.isArray(data?.content) ? data.content : [];
  return arr.map(p => ({
    idMesa: Number(p.idMesa ?? p.IdMesa),
    idEstadoPedido: Number(p.idEstadoPedido ?? p.IdEstadoPedido),
  }));
}
async function getReservasLight(page=0,size=MAX_SIZE) {
  try {
    const url = `${API_HOST}/apiReserva/getDataReserva?page=${page}&size=${Math.min(size, MAX_SIZE)}`;
    const res = await fetch(url, { headers: { Accept: "application/json" } });
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

/* ===========================================================
   Render de tarjetas de mesa
   =========================================================== */
function renderMesaCard(vm, opcionesManuales, onAfterChange) {
  const estadoStr = humanEstado(vm.nombreEstado);
  const card = document.createElement("div");
  card.className = "border border-gray-200 rounded-xl p-4 bg-white shadow-sm flex flex-col gap-3";

  card.innerHTML = `
    <div class="flex items-center justify-between">
      <div class="text-lg font-semibold">${vm.nomMesa}</div>
      <span class="px-2 py-1 text-xs rounded ${badgeClass(estadoStr)} capitalize">${vm.nombreEstado}</span>
    </div>
    <div class="mt-1 text-sm ${vm.locked ? "text-red-600" : "text-gray-600"}">
      ${vm.locked ? (vm.lockReason === "ocupada" ? "Ocupada por pedido activo" : "Reservada en este horario") : "&nbsp;"}
    </div>
    <div class="mt-auto flex items-center gap-2 justify-end">
      <select class="sel-estado border rounded px-2 py-1" ${vm.locked ? "disabled" : ""}>
        ${opcionesManuales.map(o => `<option value="${o.id}">${o.nombre}</option>`).join("")}
      </select>
      <button class="btn-apply rounded-lg px-3 py-2 text-white ${vm.locked ? "bg-gray-400 cursor-not-allowed" : "bg-blue-600 hover:bg-blue-700"}" ${vm.locked ? "disabled" : ""}>
        Actualizar
      </button>
    </div>
  `;

  const sel = card.querySelector(".sel-estado");
  const btn = card.querySelector(".btn-apply");

  btn.addEventListener("click", async () => {
    const nuevoId = Number(sel.value);
    if (!Number.isFinite(nuevoId)) return;
    try {
      btn.disabled = true;
      await patchEstadoMesa(vm.id, nuevoId);
      showAlert("success", `${vm.nomMesa} actualizada`);
      onAfterChange?.();
    } catch (e) {
      btn.disabled = false;
      showAlert("error", e.message || "No se pudo actualizar la mesa");
    }
  });

  return card;
}

/* ===========================================================
   Carga + cálculo de estado efectivo + render
   =========================================================== */
async function renderMesasGrid(container) {
  container.innerHTML = `<div class="py-10 text-center text-gray-500">Cargando mesas…</div>`;

  const [mesas, estados, pedidos, reservas] = await Promise.all([
    getMesas(0, MAX_SIZE),
    getEstadosMesa(0, MAX_SIZE),
    getPedidosLight(0, MAX_SIZE),   // <<< capado a 50
    getReservasLight(0, MAX_SIZE),  // <<< capado a 50
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
  const ID_LIMPIEZA  = estadosLower.get("limpieza")?.id; // opcional

  // Pedidos activos => mesas ocupadas (idEstadoPedido != 4 "Pagado")
  const ocupadasSet = new Set(
    pedidos
      .filter(p => Number(p.idMesa) > 0 && Number(p.idEstadoPedido) !== 4)
      .map(p => String(p.idMesa))
  );

  // Reservas activas hoy/ahora => mesas reservadas
  const reservadasSet = new Set(
    reservas
      .filter(r => Number(r.idMesa) > 0 && Number(r.idEstadoReserva) === 1 /* Activa */)
      .filter(r => isToday(r.fechaReserva))
      .filter(r => nowBetween(r.horaInicio, r.horaFin))
      .map(r => String(r.idMesa))
  );

  // Opciones manuales: sólo Disponible (+ Limpieza si existe)
  const opcionesManualesBase = [{ id: ID_DISPON, nombre: estadosById.get(ID_DISPON)?.nombre || "Disponible" }];
  if (ID_LIMPIEZA) opcionesManualesBase.push({ id: ID_LIMPIEZA, nombre: estadosById.get(ID_LIMPIEZA)?.nombre || "Limpieza" });

  const view = mesas
    .map(m => {
      const id = Number(m.Id);
      const etiqueta = m.NomMesa || `Mesa ${m.Numero || id}`;
      let idEstadoEfectivo = Number(m.IdEstadoMesa) || ID_DISPON;
      let lockReason = null;

      if (reservadasSet.has(String(id))) { idEstadoEfectivo = ID_RESERVADA; lockReason = "reservada"; }
      if (ocupadasSet.has(String(id)))   { idEstadoEfectivo = ID_OCUPADA;   lockReason = "ocupada";   }

      const nombreEstado = estadosById.get(idEstadoEfectivo)?.nombre
                        || estadosById.get(Number(m.IdEstadoMesa))?.nombre
                        || (idEstadoEfectivo===ID_OCUPADA ? "Ocupada" : idEstadoEfectivo===ID_RESERVADA ? "Reservada" : "Disponible");

      return {
        id,
        nomMesa: etiqueta,
        idEstado: idEstadoEfectivo,
        nombreEstado,
        locked: !!lockReason,
        lockReason,
      };
    })
    .sort((a,b) => {
      const na = Number(String(a.nomMesa).match(/\d+/)?.[0] || 0);
      const nb = Number(String(b.nomMesa).match(/\d+/)?.[0] || 0);
      return na - nb;
    });

  // Render
  container.innerHTML = "";
  const grid = document.createElement("div");
  grid.className = "grid gap-4 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4";
  container.appendChild(grid);

  const refresh = () => renderMesasGrid(container);

  view.forEach(vm => {
    const opcionesManuales = vm.locked ? [] : [...opcionesManualesBase];
    grid.appendChild(renderMesaCard(vm, opcionesManuales, refresh));
  });
}

/* ===========================================================
   INIT
   =========================================================== */
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
