// js/services/mesaService.js
import { API } from "./apiConfig.js";

const API_HOST = "https://orderly-api-b53514e40ebd.herokuapp.com"; // usa tu host si es distinto

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

// Trae TODOS los pedidos paginando (evita 400 por size grande)
export async function fetchPedidosAll() {
  const base = `${API_HOST}/apiPedido/getDataPedido`;
  const sizes = [50, 25, 10];          // intenta tamaños aceptables
  const out = [];

  let page = 0;
  let reachedEnd = false;

  while (!reachedEnd && page < 500) {   // límite de seguridad
    let ok = false, data = null, content = [];

    // probamos varios tamaños por si el backend es estricto
    for (const size of sizes) {
      const url = `${base}?page=${page}&size=${size}`;
      try {
        const res = await fetch(url, {
          credentials: "include",
          headers: { Accept: "application/json" },
          cache: "no-store"
        });
        if (!res.ok) continue;
        data = await res.json().catch(() => ({}));
        content = Array.isArray(data?.content)
          ? data.content
          : Array.isArray(data?.data)
          ? data.data
          : Array.isArray(data)
          ? data
          : Array.isArray(data?.data?.content)
          ? data.data.content
          : [];
        ok = true;
        break; // no pruebes otros sizes si este funcionó
      } catch { /* intenta siguiente size */ }
    }

    if (!ok) break; // no se pudo esta página → salimos

    out.push(...content);

    // avanzar o terminar
    if (typeof data?.last === "boolean") {
      reachedEnd = data.last;
      if (!reachedEnd) page += 1;
    } else {
      // si no hay flag "last", paramos cuando la página venga vacía
      if (!content.length) break;
      page += 1;
    }
  }

  return out;
}


/** GET paginado: devuelve array normalizado de mesas */
export async function getMesas(page = 0, size = 50) {
  const url = `${API.mesa}/getDataMesa?page=${encodeURIComponent(page)}&size=${encodeURIComponent(size)}`;
  const res = await fetch(url, { method: "GET", headers: { Accept: "application/json" }, credentials: "include" });
  if (!res.ok) throw new Error(`GET Mesas: ${res.status} ${res.statusText}`);
  const data = await res.json();
  const content = Array.isArray(data?.content) ? data.content.map(normalizaMesa).filter(Boolean) : [];
  return content;
}

/** GET: estados de mesa (normalizados) */
// Estados de mesa (robusto a distintos nombres de propiedades)
export async function getEstadosMesa(page = 0, size = 50) {
  const url = `https://orderly-api-b53514e40ebd.herokuapp.com/apiEstadoMesa/getDataEstadoMesa?page=${encodeURIComponent(page)}&size=${encodeURIComponent(size)}`;
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
  const res = await fetch(url, {
    method: "PATCH",
    headers: { Accept: "application/json" },
    credentials: "include", // ← importante si la API usa cookie de sesión
  });
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
