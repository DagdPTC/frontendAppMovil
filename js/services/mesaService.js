// js/services/mesaService.js
import { API } from "./apiConfig.js";

const API_HOST = "http://localhost:8080"; // usa tu host si es distinto

/** Normaliza posibles nombres de propiedades desde la API */
function normalizaMesa(raw) {
  if (!raw || typeof raw !== "object") return null;
  return {
    Id: raw.Id ?? raw.id ?? raw.idMesa ?? null,
    NomMesa: raw.NomMesa ?? raw.nomMesa ?? raw.nombre ?? null,
    IdTipoMesa:
      raw.IdTipoMesa ?? raw.idTipoMesa ?? raw.tipoMesaId ??
      raw?.tipoMesa?.IdTipoMesa ?? raw?.tipoMesa?.idTipoMesa ?? null,
    IdEstadoMesa:
      raw.IdEstadoMesa ?? raw.idEstadoMesa ?? raw.estadoMesaId ??
      raw?.estadoMesa?.IdEstadoMesa ?? raw?.estadoMesa?.idEstadoMesa ?? null,
    Numero: raw.Numero ?? raw.number ?? null,
    ...raw,
  };
}

/** GET paginado: devuelve array normalizado de mesas */
export async function getMesas(page = 0, size = 50) {
  const url = `${API.mesa}/getDataMesa?page=${encodeURIComponent(page)}&size=${encodeURIComponent(size)}`;
  const res = await fetch(url, { method: "GET", headers: { Accept: "application/json" } });
  if (!res.ok) throw new Error(`GET Mesas: ${res.status} ${res.statusText}`);
  const data = await res.json();
  const content = Array.isArray(data?.content) ? data.content.map(normalizaMesa).filter(Boolean) : [];
  return content;
}

/** GET: estados de mesa (normalizados) */
// Estados de mesa (robusto a distintos nombres de propiedades)
export async function getEstadosMesa(page = 0, size = 50) {
  const url = `http://localhost:8080/apiEstadoMesa/getDataEstadoMesa?page=${encodeURIComponent(page)}&size=${encodeURIComponent(size)}`;
  const res = await fetch(url, { headers: { Accept: "application/json" } });
  if (!res.ok) {
    console.warn("[EstadosMesa] backend respondió", res.status, res.statusText, "→ usar fallback");
    return [{ id: 1, nombre: "Disponible" }]; // fallback mínimo visible
  }
  const data = await res.json().catch(() => ({}));
  const raw = Array.isArray(data?.content) ? data.content : (Array.isArray(data) ? data : []);

  const arr = raw.map(e => {
    const id = Number(
      e.id ?? e.ID ?? e.idEstadoMesa ?? e.IdEstadoMesa
    );
    const nombre = String(
      e.nomEstado ?? e.nomEstadoMesa ?? e.nombre ?? e.nombreEstado ?? e.estado ?? e.NOMBREESTADO ?? ""
    ).trim();
    return { id, nombre };
  }).filter(x => Number.isFinite(x.id) && x.nombre);

  // si el backend viniera vacío, que al menos aparezca "Disponible"
  return arr.length ? arr : [{ id: 1, nombre: "Disponible" }];
}


/** PATCH: cambia sólo el estado de la mesa */
export async function patchEstadoMesa(id, estadoId) {
  const url = `${API_HOST}/apiMesa/estado/${encodeURIComponent(id)}/${encodeURIComponent(estadoId)}`;
  const res = await fetch(url, { method: "PATCH", headers: { Accept: "application/json" } });

  const text = await res.text().catch(() => "");
  if (!res.ok) {
    console.error("Respuesta backend (PATCH estado):", text);
    throw new Error(`PATCH estado mesa ${id}: ${res.status} ${res.statusText}`);
  }
  try { return text ? JSON.parse(text) : { Id: Number(id), IdEstadoMesa: Number(estadoId) }; }
  catch { return { Id: Number(id), IdEstadoMesa: Number(estadoId) }; }
}

/** PUT (fallback): envía exactamente el DTO que tu backend acepta */
export async function putMesaCompleta(id, dtoActual, nuevoEstadoId) {
  const payload = {
    Id: dtoActual.Id,
    NomMesa: dtoActual.NomMesa,
    IdTipoMesa: dtoActual.IdTipoMesa,
    IdEstadoMesa: nuevoEstadoId,
  };
  const res = await fetch(`${API.mesa}/modificarMesa/${encodeURIComponent(id)}`, {
    method: "PUT",
    headers: { "Content-Type": "application/json", Accept: "application/json" },
    body: JSON.stringify(payload),
  });
  const text = await res.text().catch(() => "");
  if (!res.ok) {
    console.error("Respuesta backend (PUT mesa):", text);
    throw new Error(`PUT Mesa ${id}: ${res.status} ${res.statusText}`);
  }
  try { return text ? JSON.parse(text) : payload; } catch { return payload; }
}
