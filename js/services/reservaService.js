// js/services/reservaService.js
// FIXED: Endpoints corregidos + manejo robusto de errores

// ===== Config =====
const API_HOST = " https://orderly-api-b53514e40ebd.herokuapp.com/";

const BASE_RESERVA = `${API_HOST}/apiReserva`;
const BASE_TIPORES = `${API_HOST}/apiTipoReserva`;
const BASE_MESA    = `${API_HOST}/apiMesa`;

// ✅ Endpoints EXACTOS según tu ReservaController.java
const URL_RESERVAS_LIST   = (page = 0, size = 20) => `${BASE_RESERVA}/getDataReserva?page=${page}&size=${size}`;
const URL_RESERVA_CREATE  = () => `${BASE_RESERVA}/createReserva`;      // ← CORREGIDO
const URL_RESERVA_UPDATE  = (id) => `${BASE_RESERVA}/modificarReserva/${id}`;
const URL_RESERVA_DELETE  = (id) => `${BASE_RESERVA}/eliminarReserva/${id}`;
const URL_TIPORES_LIST    = () => `${BASE_TIPORES}/getDataTipoReserva`;
const URL_MESAS_LIST      = (page = 0, size = 200) => `${BASE_MESA}/getDataMesa?page=${page}&size=${size}`;

console.log("[reservaService] loaded");

// ===== Helper HTTP (siguiendo el patrón de ordersService) =====
async function fetchJSON(url, options = {}) {
  // Construir headers con token
  const headers = {
    "Content-Type": "application/json",
    ...(options.headers || {}),
  };

  // Intentar obtener token de múltiples fuentes
  const token = 
    localStorage.getItem('token') || 
    localStorage.getItem('authToken') ||
    sessionStorage.getItem('token');

  if (token) {
    headers['Authorization'] = `Bearer ${token}`;
  } else {
    console.warn("⚠️ No se encontró token. La petición puede fallar.");
  }

  // Realizar petición
  const res = await fetch(url, {
    credentials: "include",
    ...options,
    headers,
  });

  // Manejo de errores HTTP
  if (!res.ok) {
    let bodyText = null;
    let bodyJson = null;
    try { 
      bodyJson = await res.json(); 
    } catch { 
      try { 
        bodyText = await res.text(); 
      } catch { 
        bodyText = null; 
      }
    }

    console.error("[API ERROR]", url, res.status, bodyJson || bodyText || "(sin cuerpo)");

    // Errores de autenticación
    if (res.status === 401) {
      const err = new Error("No autorizado. Por favor inicia sesión nuevamente.");
      err.status = 401;
      throw err;
    }

    if (res.status === 403) {
      const err = new Error("No tienes permisos para realizar esta acción.");
      err.status = 403;
      throw err;
    }

    // Otros errores
    const msg =
      (bodyJson && (bodyJson.message || bodyJson.error || bodyJson.detail)) ||
      bodyText ||
      `HTTP ${res.status}`;

    const err = new Error(msg);
    err.status = res.status;
    err.details = bodyJson || bodyText;
    throw err;
  }

  // Respuesta exitosa
  if (res.status === 204) return null;
  return res.json();
}

// Helper para extraer arrays de respuestas paginadas
function pickArray(data) {
  if (!data) return [];
  if (Array.isArray(data.content)) return data.content; // Spring Boot Page
  if (Array.isArray(data.data))    return data.data;
  if (Array.isArray(data))         return data;
  return [];
}

// ===== CRUD Reservas =====

export async function getReserva(page = 0, size = 20) {
  const res = await fetch(URL_RESERVAS_LIST(page, size), {
    method: "GET",
    headers: buildHeaders(),
    credentials: "include",
  });

  if (!res.ok) {
    if (res.status === 401 || res.status === 403) {
      throw new Error("No autorizado. Por favor inicia sesión nuevamente.");
    }
    throw new Error("Error al obtener reservas");
  }

  const data = await res.json();
  return Array.isArray(data?.content) ? data.content : 
         Array.isArray(data?.data) ? data.data : 
         Array.isArray(data) ? data : [];
}

// Helper para construir headers (lo necesita getReserva)
function buildHeaders() {
  const headers = {
    "Content-Type": "application/json"
  };
  
  const token = localStorage.getItem('token') || 
                localStorage.getItem('authToken') ||
                sessionStorage.getItem('token');
  
  if (token) {
    headers['Authorization'] = `Bearer ${token}`;
  }
  
  return headers;
}

export async function createReserva(payload) {
  const url = URL_RESERVA_CREATE();
  
  // Validación básica
  if (!payload || !payload.idMesa) {
    throw new Error("Datos inválidos: se requiere al menos idMesa");
  }

  console.log("[POST]", url, "payload:", payload);
  
  try {
    const data = await fetchJSON(url, {
      method: "POST",
      body: JSON.stringify(payload),
    });
    
    // Tu backend devuelve { status: "success", data: {...} }
    return data?.data ?? data;
  } catch (e) {
    console.error("[createReserva] Error:", e);
    throw e;
  }
}

export async function updateReserva(id, payload) {
  const url = URL_RESERVA_UPDATE(id);
  
  if (!id || !payload) {
    throw new Error("ID y datos son requeridos para actualizar");
  }

  console.log("[PUT]", url, "payload:", payload);
  
  try {
    return await fetchJSON(url, {
      method: "PUT",
      body: JSON.stringify(payload),
    });
  } catch (e) {
    console.error("[updateReserva] Error:", e);
    throw e;
  }
}

export async function deleteReserva(id) {
  const url = URL_RESERVA_DELETE(id);
  
  if (!id) {
    throw new Error("ID requerido para eliminar");
  }

  console.log("[DELETE]", url);
  
  try {
    const data = await fetchJSON(url, { method: "DELETE" });
    return data ?? true;
  } catch (e) {
    console.error("[deleteReserva] Error:", e);
    
    // Mensajes específicos según tu backend
    if (e.status === 404) {
      throw new Error("La reserva no existe o ya fue eliminada.");
    }
    if (e.status === 409) {
      throw new Error("No se puede eliminar: la reserva tiene registros relacionados.");
    }
    
    throw e;
  }
}

// ===== Catálogos =====

export async function getTiposReserva() {
  const url = URL_TIPORES_LIST();
  try {
    const data = await fetchJSON(url);
    const arr = pickArray(data);
    console.log("[TiposReserva]", arr.length, "via", url);
    return arr;
  } catch (e) {
    console.warn("[TiposReserva] Error al cargar:", e?.message || e);
    if (e.status === 401 || e.status === 403) throw e;
    return [];
  }
}

export async function getMesas(page = 0, size = 200) {
  const url = URL_MESAS_LIST(page, size);
  try {
    const data = await fetchJSON(url);
    const arr = pickArray(data);
    console.log("[Mesas]", arr.length, "via", url);
    return arr;
  } catch (e) {
    console.warn("[Mesas] Error al cargar:", e?.message || e);
    if (e.status === 401 || e.status === 403) throw e;
    return [];
  }
}

// ===== Helper de formato de fechas (si lo necesitas) =====
function pad2(n) { 
  return String(n).padStart(2, "0"); 
}

export function toApiDateTime(d) {
  const dt = d instanceof Date ? d : new Date(d);
  const y = dt.getFullYear();
  const m = pad2(dt.getMonth() + 1);
  const day = pad2(dt.getDate());
  const hh = pad2(dt.getHours());
  const mm = pad2(dt.getMinutes());
  const ss = pad2(dt.getSeconds());
  return `${y}-${m}-${day}T${hh}:${mm}:${ss}`;
}