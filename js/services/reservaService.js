// js/services/reservationService.js
import { API } from "./apiConfig.js";

/* ====== BASE ====== */
const BASE = (API && API.reserva)
  ? API.reserva.replace(/\/+$/, "")
  : "http://localhost:8080/apiReserva";

/* ====== helpers ====== */
function pickArray(payload) {
  if (!payload) return [];
  if (Array.isArray(payload?.content)) return payload.content;
  if (Array.isArray(payload?.data)) return payload.data;
  if (Array.isArray(payload)) return payload;
  return [];
}

async function fetchJSON(url, options = {}) {
  const res = await fetch(url, { credentials: "include",
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
    console.error(`[Reserva API] ${url} -> ${res.status} ${res.statusText}`, text);
    throw new Error(`HTTP ${res.status} ${res.statusText} - ${url}\n${text}`);
  }
  if (!text) return null;
  try { return JSON.parse(text); } catch { return null; }
}

/* ====== GET ======
   Intenta con size distintos y acepta pageado plano o con "content".
   Endpoint sugerido: /apiReserva/getDataReserva
*/
export async function getReserva(page = 0, size = 50) {
  const sizes = [size, 20, 10, 5, null]; // null => sin size
  for (const s of sizes) {
    const url = s == null
      ? `${BASE}/getDataReserva?page=${page}`
      : `${BASE}/getDataReserva?page=${page}&size=${s}`;
    try {
      const data = await fetchJSON(url);
      const arr = pickArray(data);
      if (arr.length) {
        console.info(`[Reservas] ${arr.length} items via ${url}`);
        return arr;
      }
      // Si vino página vacía pero hay "content" field:
      if (Array.isArray(data?.content)) return data.content;
    } catch (e) {
      console.warn("[Reservas] intento fallido:", e.message);
    }
  }
  return [];
}

/* ====== POST (por si lo usas luego) ====== */
export async function createReserva(payload) {
  return fetchJSON(`${BASE}/createReserva`, {
    method: "POST",
    body: JSON.stringify(payload),
  });
}

/* ====== PUT ====== */
export async function updateReserva(id, payload) {
  return fetchJSON(`${BASE}/modificarReserva/${encodeURIComponent(id)}`, {
    method: "PUT",
    body: JSON.stringify(payload),
  });
}

/* ====== DELETE ====== */
export async function deleteReserva(id) {
  return fetchJSON(`${BASE}/eliminarReserva/${encodeURIComponent(id)}`, {
    method: "DELETE",
  });
}
