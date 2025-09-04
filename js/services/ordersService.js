// js/services/ordersService.js
import { API } from "./apiConfig.js";

const BASE_P  = API?.pedido       ? API.pedido.replace(/\/+$/, "")       : "http://localhost:8080/apiPedido";
const BASE_M  = API?.mesa         ? API.mesa.replace(/\/+$/, "")         : null;
const BASE_E  = API?.empleado     ? API.empleado.replace(/\/+$/, "")     : null;

// Descubrir base de EstadoPedido si no está definido en apiConfig
let BASE_EST = API?.estadoPedido ? API.estadoPedido.replace(/\/+$/, "") : null;
if (!BASE_EST && BASE_P) BASE_EST = BASE_P.replace(/\/apiPedido$/i, "/apiEstadoPedido");

function pickArray(payload) {
  if (!payload) return [];
  if (Array.isArray(payload?.content)) return payload.content;
  if (Array.isArray(payload)) return payload;
  return [];
}

async function fetchJSON(url, options = {}) {
  try {
    const res = await fetch(url, {
      headers: {
        Accept: "application/json",
        ...(options.body ? { "Content-Type": "application/json" } : {}),
        ...(options.headers || {}),
      },
      cache: "no-cache",
      method: options.method || "GET",
      body: options.body || undefined,
    });

    const text = await res.text();
    let data = null;
    try { data = text ? JSON.parse(text) : null; } catch { data = text; }

    if (!res.ok) {
      const msg = (data && (data.message || data.error || data.errors)) || text || `HTTP ${res.status}`;
      console.error("[API ERROR]", url, msg);
      throw new Error(typeof msg === "string" ? msg : JSON.stringify(msg));
    }
    return data;
  } catch (err) {
    console.error("[FETCH FAIL]", url, err);
    throw err;
  }
}

// ---------- Pedidos ----------
export async function getPedidos(page = 0, size = 50) {
  const url = `${BASE_P}/getDataPedido?page=${encodeURIComponent(page)}&size=${encodeURIComponent(size)}`;
  const data = await fetchJSON(url);
  const arr = pickArray(data);
  console.log("[Pedidos]", arr.length, "items via", url);
  return arr;
}

export async function createPedido(dto) {
  // EXACTAMENTE como tu backend lo espera (camelCase)
  const payload = {
    nombrecliente: String(dto.nombrecliente || dto.nombreCliente || ""),
    propina: Number(dto.propina),
    observaciones: (dto.observaciones?.trim() || "Sin observaciones"),
    fpedido: String(dto.fpedido),               // "YYYY-MM-DD"
    cantidad: Number(dto.cantidad),
    subtotal: Number(dto.subtotal),
    totalPedido: Number(dto.totalPedido),
    idEmpleado: Number(dto.idEmpleado),
    idMesa: Number(dto.idMesa),
    idEstadoPedido: Number(dto.idEstadoPedido),
    idPlatillo: Number(dto.idPlatillo),
  };

  console.log("[POST] /apiPedido/createPedido payload:", payload);
  return fetchJSON(`${BASE_P}/createPedido`, { method: "POST", body: JSON.stringify(payload) });
}

export async function updatePedido(id, dto) {
  // mismo shape camelCase
  const payload = {
    nombrecliente: String(dto.nombrecliente || dto.nombreCliente || ""),
    propina: Number(dto.propina),
    observaciones: (dto.observaciones?.trim() || "Sin observaciones"),
    fpedido: String(dto.fpedido),               // "YYYY-MM-DD"
    cantidad: Number(dto.cantidad),
    subtotal: Number(dto.subtotal),
    totalPedido: Number(dto.totalPedido),
    idEmpleado: Number(dto.idEmpleado),
    idMesa: Number(dto.idMesa),
    idEstadoPedido: Number(dto.idEstadoPedido),
    idPlatillo: Number(dto.idPlatillo),
  };

  console.log("[PUT] /apiPedido/modificarPedido/%s payload:", id, payload);
  return fetchJSON(`${BASE_P}/modificarPedido/${encodeURIComponent(id)}`, { method: "PUT", body: JSON.stringify(payload) });
}

export async function deletePedido(id) {
  return fetchJSON(`${BASE_P}/eliminarPedido/${encodeURIComponent(id)}`, { method: "DELETE" });
}

// ---------- Catálogos ----------
export async function getEstadosPedido() {
  if (!BASE_EST) return [];
  const urls = [
    `${BASE_EST}/getDataEstadoPedido?page=0&size=200`,
    `${BASE_EST}/getDataEstadoPedido`,
  ];
  for (const url of urls) {
    const data = await fetchJSON(url).catch(() => null);
    if (!data) continue;
    const arr = pickArray(data);
    if (arr.length) {
      console.log("[EstadosPedido]", arr.length, "via", url);
      return arr;
    }
  }
  console.warn("[EstadosPedido] vacío – revisa apiConfig.js");
  return [];
}

export async function getEmpleados(page = 0) {
  if (!BASE_E) return [];
  const sizes = [200, 100, 50, null];
  for (const s of sizes) {
    const url = s == null ? `${BASE_E}/getDataEmpleado?page=${page}`
                          : `${BASE_E}/getDataEmpleado?page=${page}&size=${s}`;
    const data = await fetchJSON(url).catch(() => null);
    if (data) {
      return pickArray(data).map(e => {
        const id = Number(e.id ?? e.Id ?? e.idEmpleado ?? e.IDEMPLEADO ?? e.ID);
        const nombre = String(e.nombre ?? e.Nombre ?? e.nom ?? `Empleado ${id}`).trim();
        return { id, nombre };
      });
    }
  }
  return [];
}

export async function getMesasForOrders(page = 0) {
  if (!BASE_M) return [];
  const sizes = [200, 100, 50, null];
  for (const s of sizes) {
    const url = s == null ? `${BASE_M}/getDataMesa?page=${page}`
                          : `${BASE_M}/getDataMesa?page=${page}&size=${s}`;
    const data = await fetchJSON(url).catch(() => null);
    if (data) return pickArray(data);
  }
  return [];
}
