/**
 * RESERVA.JS - Funciones de utilidad para gestión de reservas
 * Helpers para DOM, formateo y conversión de tiempo
 */

// ============= DOM Helpers =============
export const $ = (s, r = document) => r.querySelector(s);
export const $$ = (s, r = document) => [...r.querySelectorAll(s)];

/**
 * Escapa caracteres HTML para prevenir XSS
 * @param {any} x - Valor a escapar
 * @returns {string} - String con caracteres HTML escapados
 */
export const esc = (x) => String(x ?? "").replace(/[&<>"']/g, (s) => ({ 
  "&":"&amp;", "<":"&lt;", ">":"&gt;", '"':"&quot;", "'":"&#39;" 
}[s]));

/**
 * Limita un número entre min y max
 * @param {number} n - Número a limitar
 * @param {number} min - Valor mínimo
 * @param {number} max - Valor máximo
 * @returns {number} - Número limitado
 */
export const clamp = (n, min, max) => Math.min(Math.max(n, min), max);

// ============= Time Parsing =============

/**
 * Parsea tiempo en formato 12h (acepta "8", "8:30", "08:30")
 * @param {string} str - String de tiempo
 * @returns {{h: number, m: number}|null} - Objeto con hora y minutos o null
 * @example parseTime12("8") → {h:8, m:0}
 * @example parseTime12("8:30") → {h:8, m:30}
 */
export function parseTime12(str) {
  const m = String(str || "").trim().match(/^(\d{1,2})(?::(\d{1,2}))?(?::\d{1,2})?$/);
  if (!m) return null;
  
  let h = +m[1];
  let mi = m[2] !== undefined ? +m[2] : 0;
  
  if (!Number.isFinite(h) || !Number.isFinite(mi)) return null;
  
  h = clamp(h, 1, 12);
  mi = clamp(mi, 0, 59);
  
  return { h, m: mi };
}

/**
 * Normaliza tiempo para guardar (asegura formato "h:mm")
 * @param {string} v - Valor de tiempo
 * @returns {string} - Tiempo normalizado o string vacío
 * @example normalizeTimeForSave("8") → "8:00"
 * @example normalizeTimeForSave("8:5") → "8:05"
 */
export function normalizeTimeForSave(v) {
  if (!v) return "";
  
  const m = String(v).trim().match(/^(\d{1,2})(?::(\d{1,2}))?$/);
  if (!m) return "";
  
  let h = +m[1];
  let mi = m[2] !== undefined ? +m[2] : 0;
  
  h = clamp(h, 1, 12);
  mi = clamp(mi, 0, 59);
  
  return `${h}:${String(mi).padStart(2, "0")}`;
}

/**
 * Convierte tiempo 12h a minutos desde medianoche
 * @param {string} hhmm - Tiempo en formato 12h
 * @param {string} ampm - "AM" o "PM"
 * @returns {number} - Minutos desde medianoche o NaN si inválido
 * @example toMinutesFrom12("12:00", "AM") → 0
 * @example toMinutesFrom12("12:00", "PM") → 720
 * @example toMinutesFrom12("1:30", "PM") → 810
 */
export function toMinutesFrom12(hhmm, ampm) {
  const t = parseTime12(hhmm);
  if (!t) return NaN;
  
  let h24 = t.h % 12;
  if ((ampm || "").toUpperCase() === "PM") h24 += 12;
  
  return h24 * 60 + t.m;
}

/**
 * Formatea tiempo con etiqueta AM/PM para mostrar
 * @param {string} h - Hora
 * @param {string} a - AM/PM
 * @returns {string} - Tiempo formateado
 * @example hourLabel("8:00", "AM") → "8:00 AM"
 */
export const hourLabel = (h, a) => {
  const t = parseTime12(h);
  return t 
    ? `${t.h}:${String(t.m).padStart(2, "0")}${a ? " " + a : ""}`
    : `${h || ""} ${a || ""}`.trim();
};

/**
 * Formatea fecha para mostrar (formato corto español)
 * @param {string} d - Fecha en formato YYYY-MM-DD
 * @returns {string} - Fecha formateada
 * @example formatDateLabel("2025-10-04") → "04 oct"
 */
export const formatDateLabel = (d) => 
  d ? new Date(d + "T00:00:00").toLocaleDateString("es-ES", {
    day: "2-digit", 
    month: "short"
  }) : "";

// ============= Time Conversion =============

/**
 * Convierte hora 12h a formato 24h
 * @param {string} hhmm - Hora en formato 12h
 * @param {string} ampm - "AM" o "PM"
 * @returns {string} - Hora en formato 24h (HH:mm) o string vacío
 * @example to24("12:00", "AM") → "00:00"
 * @example to24("12:00", "PM") → "12:00"
 * @example to24("1:30", "PM") → "13:30"
 * @example to24("8:45", "AM") → "08:45"
 */
export function to24(hhmm, ampm) {
  const t = parseTime12(hhmm);
  if (!t) return "";
  
  let h = t.h % 12;
  if ((ampm || "").toUpperCase() === "PM") h += 12;
  
  // Validar rango (0-23)
  if (h < 0 || h > 23) return "";
  
  return `${String(h).padStart(2, "0")}:${String(t.m).padStart(2, "0")}`;
}

/**
 * Convierte hora 24h a formato 12h con AM/PM
 * @param {string} hhmm - Hora en formato 24h (HH:mm)
 * @returns {{time: string, ampm: string}} - Objeto con tiempo 12h y AM/PM
 * @example from24("00:00") → {time:"12:00", ampm:"AM"}
 * @example from24("12:00") → {time:"12:00", ampm:"PM"}
 * @example from24("13:30") → {time:"1:30", ampm:"PM"}
 * @example from24("23:45") → {time:"11:45", ampm:"PM"}
 */
export function from24(hhmm) {
  const [hS, mS] = String(hhmm || "").split(":");
  let h = parseInt(hS || "0", 10);
  const m = parseInt(mS || "0", 10);
  
  if (!Number.isFinite(h) || !Number.isFinite(m)) {
    return { time: "", ampm: "AM" };
  }
  
  const ampm = h >= 12 ? "PM" : "AM";
  h = h % 12;
  if (h === 0) h = 12;
  
  return { 
    time: `${h}:${String(m).padStart(2, "0")}`, 
    ampm 
  };
}

console.log("[reserva.js] ✓ Helpers cargados correctamente");