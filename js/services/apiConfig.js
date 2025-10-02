export const API_BASE = "https://orderly-api-b53514e40ebd.herokuapp.com/";

export const API = {
  mesa:       `${API_BASE}/apiMesa`,
  estadoMesa: `${API_BASE}/apiEstadoMesa`,
  platillo:   `${API_BASE}/apiPlatillo`,
  categoria:  `${API_BASE}/apiCategoria`,
  pedido:     `${API_BASE}/apiPedido`,
  empleado:   `${API_BASE}/apiEmpleado`,
  reserva:    `${API_BASE}/apiReserva`,
  auth:       `${API_BASE}/api/auth`,
};

export async function fetchJSON(url, opts = {}) {
  const { headers, body } = opts;
  const res = await fetch(url, {
    method: opts.method || (body ? "POST" : "GET"),
    credentials: "include",
    headers: { "Accept": "application/json", "Content-Type": "application/json", ...(headers||{}) },
    body,
    redirect: opts.redirect || "follow",
    cache: opts.cache || "no-cache",
  });

  if (res.status === 204) return null;

  const text = await res.text().catch(() => "");
  if (!res.ok) {
    try {
      const j = text ? JSON.parse(text) : null;
      const msg = j?.message || j?.error || `${res.status} ${res.statusText}`;
      throw new Error(typeof msg === "string" ? msg : `${res.status} ${res.statusText}`);
    } catch {
      throw new Error(`${res.status} ${res.statusText}${text ? " - " + text : ""}`);
    }
  }
  try { return text ? JSON.parse(text) : null; } catch { return text; }
}
