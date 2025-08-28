import { API } from "./apiConfig.js";

const BASE = (API && API.pedido) ? API.pedido.replace(/\/+$/, "") : "http://localhost:8080/apiPedido";
const BASE_EST = (API && API.estadoPedido) ? API.estadoPedido.replace(/\/+$/, "") : null;

function pickArray(payload) {
  if (!payload) return [];
  if (Array.isArray(payload?.content)) return payload.content;
  if (Array.isArray(payload)) return payload;
  return [];
}

// En ordersService.js, modifica fetchJSON para mostrar errores de validación:
async function fetchJSON(url, options = {}) {
  try {
    const res = await fetch(url, {
      headers: {
        Accept: "application/json",
        ...(options.body ? { "Content-Type": "application/json" } : {}),
        ...(options.headers || {}),
      },
      cache: "no-cache",
      ...options,
    });
    
    const text = await res.text().catch(() => "");
    
    if (!res.ok) {
      let errorData;
      try {
        errorData = JSON.parse(text);
      } catch {
        errorData = { message: text };
      }
      
      const error = new Error(`HTTP ${res.status}: ${errorData.message || res.statusText}`);
      error.status = res.status;
      error.details = errorData;
      
      console.error(`[API Error] ${url}:`, errorData);
      throw error;
    }
    
    return text ? JSON.parse(text) : null;
  } catch (error) {
    console.error(`[Fetch Error] ${url}:`, error);
    throw error;
  }
}

/** GET /apiPedido/getDataPedido  */
export async function getPedidos(page = 0, size = 200) {
  const sizes = [size, 100, 50, 20, 10, 5, null];
  for (const s of sizes) {
    const url = s == null
      ? `${BASE}/getDataPedido?page=${page}`
      : `${BASE}/getDataPedido?page=${page}&size=${s}`;
    try {
      const data = await fetchJSON(url);
      const arr = pickArray(data);
      if (arr.length) {
        console.info(`[Pedidos] ${arr.length} items via ${url}`);
        return arr;
      }
    } catch (e) {
      console.warn(`[Pedidos] intento fallido en ${url}:`, e.message);
    }
  }
  return [];
}

/** (opcional) estados */
export async function getEstadosPedido(page = 0, size = 200) {
  if (!BASE_EST) return [];
  const url = `${BASE_EST}/getDataEstadoPedido?page=${page}&size=${size}`;
  try {
    const data = await fetchJSON(url);
    return pickArray(data);
  } catch {
    return [];
  }
}

/* --------------------- AQUI LO IMPORTANTE --------------------- */
/* Probar varias “formas” de payload. */
async function tryPost(bodyVariant, label) {
  console.log(`[POST createPedido] probando formato: ${label}`, bodyVariant);
  return fetchJSON(`${BASE}/createPedido`, {
    method: "POST",
    body: JSON.stringify(bodyVariant),
  });
}

/** POST /apiPedido/createPedido con el formato exacto del DTO */
export async function createPedido(data) {
  // Asegurar que Observaciones nunca esté vacío o nulo
  const observaciones = data.observaciones && data.observaciones.trim() !== "" 
    ? data.observaciones 
    : "Sin observaciones";

  // Formato exacto que coincide con PedidoDTO
  const payload = {
    Cantidad: Number(data.cantidad), // Esto se convertirá a Long en el backend
    TotalPedido: Number(data.totalPedido),
    Subtotal: Number(data.subtotal),
    Propina: Number(data.propina),
    FPedido: String(data.fpedido),
    Observaciones: observaciones,
    Nombrecliente: String(data.nombrecliente || data.nombreCliente || ""),
    IdMesa: Number(data.idMesa),
    IdEmpleado: Number(data.idEmpleado),
    IdEstadoPedido: Number(data.idEstadoPedido),
    IdPlatillo: Number(data.idPlatillo)
  };

  console.log('[POST] Payload para DTO:', payload);
  
  return fetchJSON(`${BASE}/createPedido`, {
    method: "POST",
    body: JSON.stringify(payload),
  });
}
/* -------------------------------------------------------------- */

/** PUT /apiPedido/modificarPedido/{id} */
export async function updatePedido(id, data) {
  return fetchJSON(`${BASE}/modificarPedido/${encodeURIComponent(id)}`, {
    method: "PUT",
    body: JSON.stringify(data),
  });
}

/** DELETE /apiPedido/eliminarPedido/{id} */
export async function deletePedido(id) {
  return fetchJSON(`${BASE}/eliminarPedido/${encodeURIComponent(id)}`, {
    method: "DELETE",
  });
}
