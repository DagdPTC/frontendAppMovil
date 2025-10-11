// js/services/mesaService.js
import { API, fetchJSON } from "./apiConfig.js";

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

// Trae TODOS los pedidos paginando
export async function fetchPedidosAll() {
  const base = `${API.pedido}/getDataPedido`;
  const sizes = [50, 25, 10];
  const out = [];
  let page = 0, reachedEnd = false;

  while (!reachedEnd && page < 500) {
    let ok = false, data = null, content = [];
    for (const size of sizes) {
      const url = `${base}?page=${page}&size=${size}`;
      try {
        data = await fetchJSON(url, { method: "GET" });
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
        break;
      } catch {
        // intenta con otro size
      }
    }
    if (!ok) break;

    out.push(...content);

    if (typeof data?.last === "boolean") {
      reachedEnd = data.last;
      if (!reachedEnd) page += 1;
    } else {
      if (!content.length) break;
      page += 1;
    }
  }
  return out;
}

/** GET paginado: devuelve array normalizado de mesas */
export async function getMesas(page = 0, size = 50) {
  const url = `${API.mesa}/getDataMesa?page=${encodeURIComponent(page)}&size=${encodeURIComponent(size)}`;
  const data = await fetchJSON(url, { method: "GET" });
  const content = Array.isArray(data?.content) ? data.content.map(normalizaMesa).filter(Boolean) : [];
  return content;
}

/** GET: estados de mesa (normalizados) */
export async function getEstadosMesa(page = 0, size = 50) {
  const url = `${API.estadoMesa}/getDataEstadoMesa?page=${encodeURIComponent(page)}&size=${encodeURIComponent(size)}`;
  try {
    const data = await fetchJSON(url, { method: "GET" });
    const raw = Array.isArray(data?.content) ? data.content : (Array.isArray(data) ? data : []);
    const arr = raw.map(e => {
      const id = Number(e.id ?? e.ID ?? e.idEstadoMesa ?? e.IdEstadoMesa);
      const nombre = String(
        e.nomEstado ?? e.nomEstadoMesa ?? e.nombre ?? e.nombreEstado ?? e.estado ?? e.NOMBREESTADO ?? ""
      ).trim();
      return { id, nombre };
    }).filter(x => Number.isFinite(x.id) && x.nombre);
    return arr.length ? arr : [{ id: 1, nombre: "Disponible" }];
  } catch (e) {
    console.warn("[EstadosMesa] backend respondió error → fallback", e?.message || e);
    return [{ id: 1, nombre: "Disponible" }];
  }
}

/** PATCH: cambia sólo el estado de la mesa */
export async function patchEstadoMesa(id, estadoId) {
  const url = `${API.mesa}/estado/${encodeURIComponent(id)}/${encodeURIComponent(estadoId)}`;
  const res = await fetchJSON(url, { method: "PATCH" });
  return res ?? { Id: Number(id), IdEstadoMesa: Number(estadoId) };
}

/** PUT (fallback) */
export async function putMesaCompleta(id, dtoActual, nuevoEstadoId) {
  const payload = {
    Id: dtoActual.Id,
    NomMesa: dtoActual.NomMesa,
    IdTipoMesa: dtoActual.IdTipoMesa,
    IdEstadoMesa: nuevoEstadoId,
  };
  const url = `${API.mesa}/modificarMesa/${encodeURIComponent(id)}`;
  const res = await fetchJSON(url, {
    method: "PUT",
    body: JSON.stringify(payload)
  });
  return res ?? payload;
}
