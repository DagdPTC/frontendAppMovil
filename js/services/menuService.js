// js/services/menuService.js
import { API } from "./apiConfig.js";

/* ================== Helpers ================== */
const toNum = (v) => {
  const n = Number(v);
  return Number.isFinite(n) ? n : null;
};

function pickArray(payload) {
  if (!payload) return [];
  if (Array.isArray(payload)) return payload;
  if (Array.isArray(payload?.content)) return payload.content;
  if (Array.isArray(payload?.items)) return payload.items;
  if (Array.isArray(payload?.data)) return payload.data;
  return [];
}

async function getJSON(url) {
  const res = await fetch(url, {
    headers: { Accept: "application/json" },
    cache: "no-cache",
  });
  const text = await res.text().catch(() => "");
  if (!res.ok) {
    console.error(`[MENU API] ${url} -> ${res.status} ${res.statusText}`, text);
    throw new Error(`${res.status} ${res.statusText}`);
  }
  try {
    return text ? JSON.parse(text) : null;
  } catch (e) {
    console.error(`[MENU API] JSON inválido en ${url}:`, text);
    throw e;
  }
}

/* ================== Normalizadores (AJUSTADOS A TU API) ================== */
// Platillo: { id, nomPlatillo, precio, idCate, descripcion }
function normalizePlatillo(raw) {
  if (!raw || typeof raw !== "object") return null;
  const id = toNum(raw.id);
  const nombre = raw.nomPlatillo;
  const descripcion = raw.descripcion ?? "";
  const precio = toNum(raw.precio) ?? 0;
  const idCategoria = toNum(raw.idCate);
  return (id && nombre) ? { id, nombre, descripcion, precio, idCategoria } : null;
}

// Categoría (esperado): { id, nomCategoria, ... }
function normalizeCategoria(raw) {
  if (!raw || typeof raw !== "object") return null;
  const id = toNum(raw.id ?? raw.idCategoria);
  const nombre = raw.nomCategoria ?? raw.nombre ?? raw.categoria;
  return (id && nombre) ? { id, nombre } : null;
}

/* ================== API ================== */
/**
 * Intenta cargar platillos con distintos 'size' porque tu backend
 * con 'size' grande puede devolver content: [].
 */
export async function getPlatillos(page = 0, size = 200) {
  const sizes = [size, 100, 50, 20, 10, 5, null]; // null => sin size
  let lastData = null;
  for (const s of sizes) {
    const url = s == null
      ? `${API.platillo}/getDataPlatillo?page=${page}`
      : `${API.platillo}/getDataPlatillo?page=${page}&size=${s}`;
    try {
      const data = await getJSON(url);
      const arr = pickArray(data);
      if (arr.length) {
        console.info(`[MENU] Platillos (${arr.length}) via ${url}`);
        // logueamos el primero para ver el shape real
        console.debug("[MENU] Platillo[0] crudo:", arr[0]);
        const out = arr.map(normalizePlatillo).filter(Boolean);
        console.info(`[MENU] Platillos normalizados: ${out.length}`);
        return out;
      } else {
        // guarda último payload para inspección
        lastData = data;
        console.warn(`[MENU] content vacío via ${url}`, data);
      }
    } catch (e) {
      console.error(`[MENU] Error en ${url}:`, e.message);
    }
  }
  console.warn("[MENU] No se obtuvieron platillos. Último payload recibido:", lastData);
  return [];
}

/** GET /apiCategoria/getDataCategoria?page=&size= */
export async function getCategorias(page = 0, size = 200) {
  const url = `${API.categoria}/getDataCategoria?page=${page}&size=${size}`;
  try {
    const data = await getJSON(url);
    const arr = pickArray(data);
    if (!arr.length) {
      console.warn("[MENU] Categorías vacías. Payload:", data);
      return [];
    }
    const out = arr.map(normalizeCategoria).filter(Boolean);
    console.info(`[MENU] Categorías normalizadas: ${out.length} (via ${url})`);
    return out;
  } catch (e) {
    console.error("[MENU] Error categorías:", e.message);
    return [];
  }
}
