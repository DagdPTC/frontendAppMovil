// js/services/menuService.js
import { API } from "./apiConfig.js";

/* ===== helpers ===== */
const toNum = v => {
  const n = Number(v);
  return Number.isFinite(n) ? n : null;
};
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

/* ===== normalizadores (AJUSTADOS a tu API) ===== */
// Platillo: { id, nomPlatillo, precio, idCate, descripcion }
function normalizePlatillo(r) {
  if (!r || typeof r !== "object") return null;
  const id          = toNum(r.id);
  const nombre      = r.nomPlatillo;
  const descripcion = r.descripcion ?? "";
  const precio      = toNum(r.precio) ?? 0;
  const idCategoria = toNum(r.idCate);
  return (id && nombre) ? { id, nombre, descripcion, precio, idCategoria } : null;
}

// Categoría: { id, nomCategoria }
function normalizeCategoria(r) {
  if (!r || typeof r !== "object") return null;
  const id     = toNum(r.id ?? r.idCategoria);
  const nombre = r.nomCategoria ?? r.nombre;
  return (id && nombre) ? { id, nombre } : null;
}

/* ===== API ===== */
export async function getPlatillos(page = 0) {
  // Tu backend solo devuelve datos con size chico -> probamos tamaños
  const sizes = [20, 10, 5, null]; // null => sin size
  for (const s of sizes) {
    const url = s == null
      ? `${API.platillo}/getDataPlatillo?page=${page}`
      : `${API.platillo}/getDataPlatillo?page=${page}&size=${s}`;
    try {
      const data = await getJSON(url);
      const out = pickArray(data).map(normalizePlatillo).filter(Boolean);
      if (out.length) return out;
    } catch {}
  }
  return [];
}

export async function getCategorias(page = 0) {
  const sizes = [20, 10, 5, null];
  for (const s of sizes) {
    const url = s == null
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
