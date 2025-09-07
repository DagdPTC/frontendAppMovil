// js/services/menuService.js
import { API } from "./apiConfig.js";

/* ===== helpers ===== */
const toNum = (v) => {
  const n = Number(v);
  return Number.isFinite(n) ? n : null;
};
function pickArray(payload) {
  if (!payload) return [];
  if (Array.isArray(payload?.content)) return payload.content;
  if (Array.isArray(payload?.data)) return payload.data;
  if (Array.isArray(payload)) return payload;
  return [];
}
async function getJSON(url) {
  const res = await fetch(url, {
    headers: { Accept: "application/json" },
    cache: "no-cache",
  });
  const txt = await res.text().catch(() => "");
  if (!res.ok) throw new Error(`${res.status} ${res.statusText}: ${txt}`);
  return txt ? JSON.parse(txt) : null;
}

/* ===== normalizadores (AJUSTADOS a tu API) ===== */
// Platillo: { id, nomPlatillo, descripcion, precio, idCate, imagenUrl?, publicId? }
function normalizePlatillo(r) {
  if (!r || typeof r !== "object") return null;

  const id =
    toNum(r.id) ??
    toNum(r.Id) ??
    toNum(r.idPlatillo) ??
    toNum(r.IdPlatillo);

  const nombre =
    r.nomPlatillo ??
    r.NombrePlatillo ??
    r.nombre ??
    r.NomPlatillo ??
    r.NOMBREPLATILLO;

  const descripcion = r.descripcion ?? r.Descripcion ?? r.DESCRIPCION ?? "";
  const precio = toNum(r.precio ?? r.Precio ?? r.PRECIO) ?? 0;

  const idCategoria =
    toNum(r.idCate) ??
    toNum(r.IdCate) ??
    toNum(r.idCategoria) ??
    toNum(r.IdCategoria);

  // >>> IMPORTANTE: imagenUrl y publicId <<<
  const imagenUrl =
    r.imagenUrl ?? r.ImagenUrl ?? r.imagenURL ?? r.IMAGENURL ?? null;

  const publicId = r.publicId ?? r.PublicId ?? r.PUBLICID ?? null;

  return id && nombre
    ? { id, nombre, descripcion, precio, idCategoria, imagenUrl, publicId }
    : null;
}

// Categoría: { id, nomCategoria | nombre }
function normalizeCategoria(r) {
  if (!r || typeof r !== "object") return null;

  const id =
    toNum(r.id) ??
    toNum(r.Id) ??
    toNum(r.idCategoria) ??
    toNum(r.IdCategoria);

  const nombre =
    r.nomCategoria ??
    r.NombreCategoria ??
    r.nombre ??
    r.NomCategoria ??
    r.NOMBRECATEGORIA;

  return id && nombre ? { id, nombre } : null;
}

/* ===== API ===== */
export async function getPlatillos(page = 0) {
  // Probamos con varios tamaños por si tu backend limita size
  const sizes = [20, 12, 10, 5, null]; // null => sin size
  for (const s of sizes) {
    const url =
      s == null
        ? `${API.platillo}/getDataPlatillo?page=${page}`
        : `${API.platillo}/getDataPlatillo?page=${page}&size=${s}`;
    try {
      const data = await getJSON(url);
      const out = pickArray(data).map(normalizePlatillo).filter(Boolean);
      if (out.length) return out;
      // si viene vacío, seguimos probando otro size
    } catch {
      // si falla este intento, probamos el siguiente size
    }
  }
  return [];
}

export async function getCategorias(page = 0) {
  const sizes = [20, 12, 10, 5, null];
  for (const s of sizes) {
    const url =
      s == null
        ? `${API.categoria}/getDataCategoria?page=${page}`
        : `${API.categoria}/getDataCategoria?page=${page}&size=${s}`;
    try {
      const data = await getJSON(url);
      const out = pickArray(data).map(normalizeCategoria).filter(Boolean);
      if (out.length) return out;
    } catch {}
  }
  return [];
}

/* ===== (opcional) helpers exportables ===== */
export const _normalize = { normalizePlatillo, normalizeCategoria };
