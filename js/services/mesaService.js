// js/services/mesaService.js
import { API } from "./apiConfig.js";

/** Detección de endpoints */
const API_MESA        = API?.mesa || "http://localhost:8080/apiMesa";
const API_ESTADO_MESA = API?.estadoMesa || "http://localhost:8080/apiEstadoMesa";

const MAX_SIZE = 50;

/** Normaliza posibles nombres de propiedades desde la API */
function normalizaMesa(raw) {
  if (!raw || typeof raw !== "object") return null;
  return {
    Id:           raw.Id ?? raw.id ?? raw.idMesa ?? null,
    NomMesa:      raw.NomMesa ?? raw.nomMesa ?? raw.nombre ?? raw.Nom ?? null,
    IdTipoMesa:   raw.IdTipoMesa ?? raw.idTipoMesa ?? raw.tipoMesaId ?? raw?.tipoMesa?.IdTipoMesa ?? raw?.tipoMesa?.idTipoMesa ?? null,
    IdEstadoMesa: raw.IdEstadoMesa ?? raw.idEstadoMesa ?? raw.estadoMesaId ?? raw?.estadoMesa?.IdEstadoMesa ?? raw?.estadoMesa?.idEstadoMesa ?? null,
    Numero:       raw.Numero ?? raw.number ?? raw.numMesa ?? raw.numero ?? null,
    ...raw,
  };
}

/** GET paginado: devuelve array normalizado de mesas (size capado a 50) */
export async function getMesas(page = 0, size = 50) {
  const url = `${API_MESA}/getDataMesa?page=${encodeURIComponent(page)}&size=${encodeURIComponent(Math.min(size, MAX_SIZE))}`;
  const res = await fetch(url, { method: "GET", headers: { Accept: "application/json" } });
  const text = await res.text().catch(() => "");
  if (!res.ok) {
    console.error("[GET Mesas] status:", res.status, "body:", text);
    throw new Error(`GET Mesas: ${res.status} ${res.statusText}`);
  }
  let data; try { data = text ? JSON.parse(text) : null; } catch { data = null; }
  const content = Array.isArray(data?.content) ? data.content.map(normalizaMesa).filter(Boolean) : [];
  return content;
}

/** Catálogo de estados de mesa (paginado, size capado a 50) */
export async function getEstadosMesa(page = 0, size = 50) {
  const url = `${API_ESTADO_MESA}/getDataEstadoMesa?page=${encodeURIComponent(page)}&size=${encodeURIComponent(Math.min(size, MAX_SIZE))}`;
  try {
    const res = await fetch(url, { method: "GET", headers: { Accept: "application/json" } });
    const text = await res.text().catch(() => "");
    if (!res.ok) {
      console.warn("[GET EstadoMesa] status:", res.status, "body:", text);
      throw new Error(`GET EstadoMesa: ${res.status}`);
    }
    let data; try { data = text ? JSON.parse(text) : null; } catch { data = null; }
    const arr  = Array.isArray(data?.content) ? data.content : (Array.isArray(data) ? data : []);
    return arr
      .map(e => ({
        id: Number(e.id ?? e.ID ?? e.idEstadoMesa ?? e.IDESTADOMESA),
        nombre: String(e.nomEstado ?? e.nombre ?? e.nombreEstado ?? e.NOMBREESTADO ?? "").trim()
      }))
      .filter(x => Number.isFinite(x.id) && x.nombre);
  } catch (e) {
    // Fallback por si aún no hay endpoint/tabla
    return [
      { id: 1, nombre: "Disponible" },
      { id: 2, nombre: "Ocupada" },
      { id: 3, nombre: "Reservada" },
      { id: 4, nombre: "Limpieza" },
    ];
  }
}

/** PATCH: cambia sólo el estado de la mesa */
export async function patchEstadoMesa(id, estadoId) {
  const url = `${API_MESA}/estado/${encodeURIComponent(id)}/${encodeURIComponent(estadoId)}`;
  const res = await fetch(url, { method: "PATCH", headers: { Accept: "application/json" } });
  const text = await res.text().catch(() => "");
  if (!res.ok) {
    console.error("Respuesta backend (PATCH estado):", text);
    throw new Error(`PATCH estado mesa ${id}: ${res.status} ${res.statusText}`);
  }
  if (!text) return { Id: Number(id), IdEstadoMesa: Number(estadoId) }; // 204 sin cuerpo
  try { return normalizaMesa(JSON.parse(text)); } catch { return { Id: Number(id), IdEstadoMesa: Number(estadoId) }; }
}

/** PUT (fallback): envía exactamente el DTO que tu backend acepta */
export async function putMesaCompleta(id, dtoActual, nuevoEstadoId) {
  const payload = {
    Id: dtoActual.Id,
    NomMesa: dtoActual.NomMesa,
    IdTipoMesa: dtoActual.IdTipoMesa,
    IdEstadoMesa: nuevoEstadoId,
  };
  const res = await fetch(`${API_MESA}/modificarMesa/${encodeURIComponent(id)}`, {
    method: "PUT",
    headers: { "Content-Type": "application/json", Accept: "application/json" },
    body: JSON.stringify(payload),
  });
  const text = await res.text().catch(() => "");
  if (!res.ok) {
    console.error("Respuesta backend (PUT mesa):", text);
    throw new Error(`PUT Mesa ${id}: ${res.status} ${res.statusText}`);
  }
  if (!text) return payload; // 204
  try { return normalizaMesa(JSON.parse(text)); } catch { return payload; }
}
