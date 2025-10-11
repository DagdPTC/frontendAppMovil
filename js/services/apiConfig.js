// js/services/apiConfig.js
export const API_BASE = "https://orderly-api-b53514e40ebd.herokuapp.com";

export const API = {
  mesa:       `${API_BASE}/apiMesa`,
  estadoMesa: `${API_BASE}/apiEstadoMesa`,
  platillo:   `${API_BASE}/apiPlatillo`,
  categoria:  `${API_BASE}/apiCategoria`,
  pedido:     `${API_BASE}/apiPedido`,
  empleado:   `${API_BASE}/apiEmpleado`,
  reserva:    `${API_BASE}/apiReserva`,
  auth:       `${API_BASE}/api/auth`,
  recovery:   `${API_BASE}/auth/recovery`,
};

export function setAuthToken(token) {
  if (!token) {
    sessionStorage.removeItem("authToken");
    localStorage.removeItem("AUTH_TOKEN");
    return;
  }
  sessionStorage.setItem("authToken", token);
  localStorage.setItem("AUTH_TOKEN", token);
}
export function getAuthToken() {
  return sessionStorage.getItem("authToken") || localStorage.getItem("AUTH_TOKEN");
}

/* ====== Recovery (igual que tenías) ====== */
export function setRecoveryData(email, code = null) {
  const data = { email, timestamp: Date.now() };
  if (code) data.code = code;
  sessionStorage.setItem("recoveryData", JSON.stringify(data));
  console.log("✓ Datos de recuperación guardados:", email);
}
export function getRecoveryData() {
  const raw = sessionStorage.getItem("recoveryData");
  if (!raw) return null;
  const parsed = JSON.parse(raw);
  if (Date.now() - parsed.timestamp > 15 * 60 * 1000) {
    clearRecoveryData();
    return null;
  }
  return parsed;
}
export function clearRecoveryData() {
  sessionStorage.removeItem("recoveryData");
  console.log("✓ Datos de recuperación eliminados");
}

function buildHeaders(extra = {}, hasJSONBody = false) {
  const h = new Headers({ Accept: "application/json" });
  const token = getAuthToken();
  if (token && !("Authorization" in extra)) h.set("Authorization", `Bearer ${token}`);
  if (hasJSONBody && !("Content-Type" in extra)) h.set("Content-Type", "application/json");
  Object.entries(extra || {}).forEach(([k, v]) => h.set(k, v));
  return h;
}

export async function fetchJSON(url, opts = {}) {
  const hasJSONBody = !!opts.body && !(opts.body instanceof FormData);
  const res = await fetch(url, {
    credentials: "include",
    cache: "no-cache",
    ...opts,
    headers: buildHeaders(opts.headers || {}, hasJSONBody),
  });

  const text = await res.text().catch(() => "");
  if (!res.ok) {
    let payload = null;
    try { payload = text ? JSON.parse(text) : null; } catch {}
    const msg = payload?.message || payload?.error || payload?.detail || text || `${res.status} ${res.statusText}`;
    const err = new Error(msg);
    err.status = res.status;
    err.details = payload || text;
    throw err;
  }
  if (!text) return null;
  try { return JSON.parse(text); } catch { return null; }
}
