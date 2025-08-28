// js/controllers/ordersController.js
// Vista de pedidos conectada a la API real.
// - GET/DELETE funcionando
// - Selección de platillos via sessionStorage (desde menu.html)
// - Form se reabre al volver del Menú
// - Mesero dinámico (GET a /apiEmpleado)
// - POST en serie (1 registro por platillo), payload "limpio"
// - Lista con + / − / 🗑 en el form

import {
  getPedidos,
  createPedido,
  updatePedido,
  deletePedido,
  getEstadosPedido,
} from "../services/ordersService.js";

import { getPlatillos } from "../services/menuService.js"; // para mapear idPlatillo -> nombre
import { API } from "../services/apiConfig.js";            // para llamar a /apiEmpleado

/* --------- Colores para Píldora de estado (fallback) --------- */
const PEDIDO_STATUS_COLORS = {
  pendiente: "bg-yellow-100 text-yellow-700",
  "en preparación": "bg-blue-100 text-blue-700",
  listo: "bg-green-100 text-green-700",
  entregado: "bg-purple-100 text-purple-700",
  pagado: "bg-gray-200 text-gray-700",
  cancelado: "bg-red-100 text-red-700",
};

/* Fallback si no hay catálogo en API */
const FALLBACK_ESTADOS = [
  { id: 1, nombre: "pendiente" },
  { id: 2, nombre: "en preparación" },
  { id: 3, nombre: "listo" },
  { id: 4, nombre: "entregado" },
  { id: 5, nombre: "pagado" },
  { id: 6, nombre: "cancelado" },
];

/* --------- Estado global --------- */
let MAP_ESTADOS   = new Map();   // id -> {id, nombre}
let MAP_PLATILLOS = new Map();   // id -> {id, nomPlatillo, precio}
let MAP_EMPLEADOS = new Map();   // id -> {id, nombre}

/* --------- Utils --------- */
function formatFecha(isoOrYmd) {
  if (!isoOrYmd) return "";
  const [y, m, d] = String(isoOrYmd).split("-");
  if (y && m && d) return `${d}/${m}/${y}`;
  try {
    const dt = new Date(isoOrYmd);
    const dd = String(dt.getDate()).padStart(2, "0");
    const mm = String(dt.getMonth() + 1).padStart(2, "0");
    const yy = dt.getFullYear();
    return `${dd}/${mm}/${yy}`;
  } catch {
    return String(isoOrYmd);
  }
}

function estadoNombrePorId(id) {
  const item = MAP_ESTADOS.get(Number(id));
  return (item?.nombre || "").toString().toLowerCase();
}
function MAP_ESTADOS_HAS_NAME(nombre) {
  const n = (nombre || "").toLowerCase();
  for (const [id, obj] of MAP_ESTADOS.entries()) {
    if ((obj?.nombre || "").toLowerCase() === n) return id;
  }
  return null;
}

/* --------- DOM & Storage --------- */
const $  = (s, r=document) => r.querySelector(s);
const $$ = (s, r=document) => Array.from(r.querySelectorAll(s));

const K_SEL       = "ord_dishes_sel";      // lo escribe el Menú: [{id, nombre, precio, qty}]
const K_CLIENTE   = "orderly_cliente_nombre";
const K_MESA      = "orderly_mesa_id";
const K_OPEN_FORM = "ord_open_form";
const K_WAITER    = "orderly_waiter_id";

function getSeleccion() {
  try { return JSON.parse(sessionStorage.getItem(K_SEL) || "[]"); } catch { return []; }
}
function setSeleccion(v) { sessionStorage.setItem(K_SEL, JSON.stringify(v)); }

function saveFormSnapshot() {
  localStorage.setItem(K_CLIENTE, ($("#customer-name")?.value || "").trim());
  localStorage.setItem(K_MESA, $("#table-select")?.value || "");
  sessionStorage.setItem(K_WAITER, $("#waiter-select")?.value || "");
}
function restoreFormSnapshot() {
  const name = localStorage.getItem(K_CLIENTE);
  const mesa = localStorage.getItem(K_MESA);
  if (name) $("#customer-name").value = name;
  if (mesa) $("#table-select").value  = mesa;
}

/* --------- Empleados (GET directo desde aquí, sin service extra) --------- */
function pickArray(payload) {
  if (!payload) return [];
  if (Array.isArray(payload?.content)) return payload.content;
  if (Array.isArray(payload)) return payload;
  return [];
}
async function getJSON(url) {
  const res = await fetch(url, { headers: { Accept: "application/json" }, cache: "no-cache" });
  const txt = await res.text().catch(() => "");
  if (!res.ok) throw new Error(`${res.status} ${res.statusText}: ${txt}`);
  return txt ? JSON.parse(txt) : null;
}
function normalizeEmpleado(e) {
  if (!e || typeof e !== "object") return null;

  // ID robusto (acepta varias variantes comunes)
  const id =
    Number(e.id) ??
    Number(e.idEmpleado) ??
    Number(e.ID) ??
    Number(e.Id);

  // Nombre robusto (toma el primero que exista; arma nombres + apellidos si están)
  let nombre =
    e.nomEmpleado ??
    e.nombre ??
    (e.nombres && e.apellidos ? `${e.nombres} ${e.apellidos}` : (e.nombres || e.apellidos)) ??
    e.usuario ??  // por si solo viene el user
    "";

  // Si no hubo ningún nombre, usa "Empleado {id}" como fallback
  if (!nombre && Number.isFinite(id)) nombre = `Empleado ${id}`;

  // Validación final
  if (!Number.isFinite(id) || !String(nombre).trim()) return null;

  return { id: Number(id), nombre: String(nombre).trim() };
}

async function getEmpleados(page=0) {
  if (!API?.empleado) return [];
  const sizes = [50, 20, 10, null];
  for (const s of sizes) {
    const url = s == null
      ? `${API.empleado}/getDataEmpleado?page=${page}`
      : `${API.empleado}/getDataEmpleado?page=${page}&size=${s}`;
    try {
      const data = await getJSON(url);
      const arr = pickArray(data).map(normalizeEmpleado).filter(Boolean);
      if (arr.length) return arr;
    } catch {}
  }
  return [];
}

/* --------- Mapeo API -> UI (AJUSTADO A TU JSON) --------- */
function fromApi(p) {
  const id = p.id;
  const nombreCliente = p.nombrecliente || p.nombreCliente || p.cliente || "";
  const mesa = p.idMesa ?? p.mesa ?? "";
  const fecha = formatFecha(p.fpedido || p.fecha || p.fechaPedido);
  const idEstado = p.idEstadoPedido ?? p.estadoId ?? p.idEstado ?? 1;
  const estadoNombre = estadoNombrePorId(idEstado) || "pendiente";

  // Nombre de platillo por catálogo
  const platInfo = MAP_PLATILLOS.get(Number(p.idPlatillo)) || null;
  const nombrePlatillo = platInfo?.nomPlatillo || platInfo?.nombre || `Platillo ${p.idPlatillo}`;

  // Mesero: usa mapa si está cargado
  const meseroNombre = MAP_EMPLEADOS.get(Number(p.idEmpleado))?.nombre || `Empleado ${p.idEmpleado ?? ""}`.trim();

  return {
    id,
    Cliente: nombreCliente,
    Mesa: String(mesa),
    Mesero: meseroNombre,
    Hora: fecha,
    Estado: estadoNombre,
    Confirmado: estadoNombre === "pagado" || estadoNombre === "cancelado",

    Platillos: [
      {
        nombre: nombrePlatillo,
        cantidad: Number(p.cantidad ?? 1),
        precio: Number(platInfo?.precio ?? 0),
      },
    ],

    _subtotal: Number(p.subtotal ?? 0),
    _propina: Number(p.propina ?? 0),
    _total: Number(p.totalPedido ?? 0),

    _raw: {
      cantidad: p.cantidad,
      totalPedido: p.totalPedido,
      subtotal: p.subtotal,
      propina: p.propina,
      fpedido: p.fpedido,
      observaciones: p.observaciones,
      nombrecliente: p.nombrecliente,
      idMesa: p.idMesa,
      idEmpleado: p.idEmpleado,
      idEstadoPedido: idEstado,
      idPlatillo: p.idPlatillo,
    },
  };
}

/* --------- Carga inicial --------- */
document.addEventListener("DOMContentLoaded", init);

async function init() {
  // refs
  const ordersList      = $("#orders-list");
  const newOrderBtn     = $("#new-order-btn");
  const newOrderForm    = $("#new-order-form");
  const backToOrdersBtn = $("#back-to-orders");
  const orderTime       = $("#order-time");
  const saveOrderBtn    = $("#save-order-btn");
  const addDishesBtn    = $("#add-dishes-btn");
  const waiterSelect    = $("#waiter-select");   // <-- SELECT dinámico

  await cargarCatalogos();
  await cargarPedidosDeApi(ordersList, agregarTarjetaPedido);
  await cargarEmpleados(waiterSelect);           // carga el select y el mapa

  // Abrir form (manual)
  newOrderBtn?.addEventListener("click", () => {
    newOrderForm.classList.remove("hidden");
    ordersList.classList.add("hidden");
    newOrderBtn.classList.add("hidden");
    orderTime.value = new Date().toLocaleDateString("es-ES");
    restoreFormSnapshot();
    restoreWaiter(waiterSelect);
    renderSeleccionUI();
  });

  // Cancelar = limpiar todo
  backToOrdersBtn?.addEventListener("click", () => {
    newOrderForm.classList.add("hidden");
    ordersList.classList.remove("hidden");
    newOrderBtn.classList.remove("hidden");

    ($("#customer-name") || {}).value = "";
    ($("#table-select")  || {}).value = "";
    ($("#order-notes")   || {}).value = "";
    if (waiterSelect) waiterSelect.value = "";

    sessionStorage.removeItem(K_SEL);
    sessionStorage.removeItem(K_OPEN_FORM);
    sessionStorage.removeItem(K_WAITER);
    localStorage.removeItem(K_CLIENTE);
    localStorage.removeItem(K_MESA);
    renderSeleccionUI();
  });

  // Ir al Menú y volver al FORM
  addDishesBtn?.addEventListener("click", () => {
    saveFormSnapshot();
    sessionStorage.setItem(K_OPEN_FORM, "1"); // al volver, abrir form
    const back = (location.pathname.split("/").pop() || "orders.html") + "#new";
    window.location.href = `menu.html?select=1&back=${encodeURIComponent(back)}`;
  });

  // Guardar pedido
  saveOrderBtn?.addEventListener("click", async (e) => {
    e.preventDefault();
    await guardarPedidoDesdeSeleccion();
  });

  // Si venimos del menú con selección, abre el formulario
  if (sessionStorage.getItem(K_OPEN_FORM) === "1" || location.hash === "#new") {
    newOrderForm.classList.remove("hidden");
    ordersList.classList.add("hidden");
    newOrderBtn.classList.add("hidden");
    orderTime.value = new Date().toLocaleDateString("es-ES");
    restoreFormSnapshot();
    restoreWaiter(waiterSelect);
    renderSeleccionUI();
  } else {
    renderSeleccionUI();
  }
}

/* --------- Catálogos --------- */
async function cargarCatalogos() {
  // Estados
  const rawEstados = await getEstadosPedido().catch(() => []);
  if (rawEstados.length) {
    MAP_ESTADOS = new Map(
      rawEstados.map((e) => {
        const id = Number(e.id ?? e.idEstadoPedido ?? e.ID ?? e.Id);
        const nombre = (e.nomEstadoPedido ?? e.nombre ?? e.estado ?? "").toString().toLowerCase();
        return [id, { id, nombre }];
      })
    );
  } else {
    MAP_ESTADOS = new Map(FALLBACK_ESTADOS.map((e) => [e.id, e]));
  }

  // Platillos
  const plats = await getPlatillos(0).catch(() => []);
  MAP_PLATILLOS = new Map(
    plats.map((p) => [Number(p.id), { id: Number(p.id), nomPlatillo: p.nombre, precio: Number(p.precio || 0) }])
  );
}

/* --------- Empleados --------- */
async function cargarEmpleados(waiterSelect) {
  if (!waiterSelect) return;
  waiterSelect.innerHTML = `<option value="">Seleccione un mesero</option>`;

  try {
    const lista = await getEmpleados(0);
    if (lista.length) {
      MAP_EMPLEADOS = new Map(lista.map((e) => [e.id, e]));
      lista.forEach((e) => {
        const opt = document.createElement("option");
        opt.value = String(e.id);
        opt.textContent = e.nombre;
        waiterSelect.appendChild(opt);
      });
    }
  } catch (e) {
    console.warn("No se pudieron cargar empleados:", e);
  }

  // Restaura selección previa si existe
  const saved = sessionStorage.getItem(K_WAITER);
  if (saved && waiterSelect.querySelector(`option[value="${saved}"]`)) {
    waiterSelect.value = saved;
  }

  waiterSelect.addEventListener("change", () => {
    sessionStorage.setItem(K_WAITER, waiterSelect.value || "");
  });
}

/* --------- GET y tarjetas --------- */
async function cargarPedidosDeApi(ordersList, onAddCard) {
  ordersList.innerHTML = "";
  const lista = await getPedidos(0, 50);
  if (!lista.length) {
    ordersList.innerHTML = `<div class="text-sm text-gray-500 text-center py-4">No hay pedidos.</div>`;
    return;
  }
  lista
    .slice()
    .sort((a, b) => Number(b.id) - Number(a.id))
    .map(fromApi)
    .forEach((p) => onAddCard(p, ordersList));
}

function agregarTarjetaPedido(pedido, container) {
  const card = document.createElement("div");
  card.className =
    "tarjeta-animada border border-gray-200 rounded-xl p-4 bg-white shadow-sm transition";

  const listaPlatillos = pedido.Platillos
    .map((x) => `<li>${x.nombre} (x${x.cantidad})</li>`)
    .join("");

  const total    = pedido._total;
  const subtotal = pedido._subtotal;
  const propina  = pedido._propina;
  const colorClass = PEDIDO_STATUS_COLORS[pedido.Estado] || "bg-gray-100 text-gray-700";

  card.innerHTML = `
    <div class="flex justify-between items-start">
      <h2 class="font-bold text-lg">Pedido de ${pedido.Cliente}</h2>
      <span class="inline-block px-2 py-0.5 rounded-full text-xs font-semibold ${colorClass}">
        ${pedido.Estado}
      </span>
    </div>

    <p><strong>Mesa:</strong> ${pedido.Mesa}</p>
    <p><strong>Mesero:</strong> ${pedido.Mesero}</p>
    <p><strong>Fecha:</strong> ${pedido.Hora}</p>

    <p class="mt-2"><strong>Platillos:</strong></p>
    <ul class="list-disc pl-5 text-sm mb-2">
      ${listaPlatillos}
    </ul>

    <div class="text-right text-sm mb-3">
      <div>Subtotal: <strong>$${subtotal.toFixed(2)}</strong></div>
      <div>Propina: <strong>$${propina.toFixed(2)}</strong></div>
      <div>Total: <strong>$${total.toFixed(2)}</strong></div>
    </div>

    <div class="flex justify-start">
      <button class="btn-eliminar bg-red-500 text-white px-3 py-1 rounded text-sm font-medium" data-id="${pedido.id}">
        Eliminar
      </button>
    </div>
  `;

  card.querySelector(".btn-eliminar").addEventListener("click", async (e) => {
    const id = Number(e.currentTarget.dataset.id);
    try {
      await deletePedido(id);
      card.remove();
    } catch (err) {
      console.error("Error eliminando pedido:", err);
      alert("No se pudo eliminar el pedido.");
    }
  });

  container.prepend(card);
}

/* --------- SELECCIÓN proveniente del Menú --------- */
function renderSeleccionUI() {
  const sel = getSeleccion();

  const badge = $("#items-count");
  const sumBox = $("#dishes-summary");
  const secSel = $("#selected-dishes-section");
  const listSel= $("#selected-dishes-list");

  // Badge
  const items = sel.reduce((acc, x) => acc + (x.qty || 1), 0);
  if (badge) {
    if (items > 0) {
      badge.textContent = `${items} item${items !== 1 ? "s" : ""}`;
      badge.classList.remove("hidden");
    } else {
      badge.classList.add("hidden");
    }
  }

  // Resumen + totales
  if (sumBox) {
    if (!sel.length) {
      sumBox.innerHTML = `<div class="text-gray-500 text-sm">No hay platillos seleccionados.</div>`;
    } else {
      sumBox.innerHTML = sel.map(it =>
        `<div class="flex justify-between text-sm">
          <span>${it.nombre}</span>
          <span>$${Number(it.precio).toFixed(2)} × ${it.qty || 1}</span>
        </div>`
      ).join("");
      const subtotal = sel.reduce((a, x) => a + Number(x.precio) * (x.qty || 1), 0);
      const propina  = Math.round(subtotal * 0.10 * 100) / 100;
      const total    = Math.round((subtotal + propina) * 100) / 100;
      sumBox.innerHTML += `
        <hr class="my-2">
        <div class="text-right text-sm">
          <div>Subtotal: <strong>$${subtotal.toFixed(2)}</strong></div>
          <div>Propina (10%): <strong>$${propina.toFixed(2)}</strong></div>
          <div>Total: <strong>$${total.toFixed(2)}</strong></div>
        </div>`;
    }
  }

  // Lista detallada con +/- y 🗑
  if (secSel && listSel) {
    if (!sel.length) {
      secSel.classList.add("hidden");
      listSel.innerHTML = "";
    } else {
      secSel.classList.remove("hidden");
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

      // +
      $$(".btn-plus", listSel).forEach(b => b.addEventListener("click", () => {
        const id = b.getAttribute("data-id");
        const arr = getSeleccion();
        const it = arr.find(x => String(x.id) === String(id));
        if (it) it.qty = (it.qty || 1) + 1;
        setSeleccion(arr);
        renderSeleccionUI();
      }));

      // -
      $$(".btn-minus", listSel).forEach(b => b.addEventListener("click", () => {
        const id = b.getAttribute("data-id");
        const arr = getSeleccion();
        const it = arr.find(x => String(x.id) === String(id));
        if (it) it.qty = Math.max(1, (it.qty || 1) - 1);
        setSeleccion(arr);
        renderSeleccionUI();
      }));

      // 🗑
      $$(".btn-remove", listSel).forEach(b => b.addEventListener("click", () => {
        const id = b.getAttribute("data-id");
        const arr = getSeleccion().filter(x => String(x.id) !== String(id));
        setSeleccion(arr);
        renderSeleccionUI();
      }));
    }
  }
}

/* --------- Guardar Pedido (POST múltiple, 1 por platillo) --------- */
function nowParts() {
  const d = new Date();
  const pad = (n) => String(n).padStart(2, "0");
  const yyyy = d.getFullYear();
  const mm = pad(d.getMonth() + 1);
  const dd = pad(d.getDate());
  const HH = pad(d.getHours());
  const MM = pad(d.getMinutes());
  return { fecha: `${yyyy}-${mm}-${dd}`, hora: `${HH}:${MM}` };
}

// Construir payloads exactos
const payloads = seleccion.map(it => {
  const qty = Math.max(1, parseInt(it.qty || "1", 10));
  const precio = Number(it.precio) || 0;
  const subtotal = Number((precio * qty).toFixed(2));
  const propina  = Number((subtotal * 0.10).toFixed(2));
  const total    = Number((subtotal + propina).toFixed(2));
  
  return {
    cantidad: qty,
    totalPedido: total,
    subtotal: subtotal,
    propina: propina,
    fpedido: fecha,
    observaciones: (observaciones && observaciones.trim() !== "") ? observaciones : "Sin observaciones",
    nombrecliente: nombrecliente,
    idMesa: idMesa,
    idEmpleado: idEmpleado,
    idEstadoPedido: idEstadoPedido,
    idPlatillo: parseInt(it.id, 10)
  };
});

/* --------- Helpers mesero --------- */
function restoreWaiter(waiterSelect) {
  if (!waiterSelect) return;
  const saved = sessionStorage.getItem(K_WAITER);
  if (saved && waiterSelect.querySelector(`option[value="${saved}"]`)) {
    waiterSelect.value = saved;
  }
}
