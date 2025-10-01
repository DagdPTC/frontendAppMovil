// js/services/reservaService.js
// FIXED: Ahora incluye el token Bearer en cada petición

// ===== Config base =====
const API_HOST = "http://localhost:8080";

const BASE_RESERVA = `${API_HOST}/apiReserva`;
const BASE_TIPORES = `${API_HOST}/apiTipoReserva`;
const BASE_MESA    = `${API_HOST}/apiMesa`;

// Endpoints - VERIFICA QUE COINCIDAN CON TU BACKEND
const URL_RESERVAS_LIST  = (page = 0, size = 20) => `${BASE_RESERVA}/getDataReserva?page=${page}&size=${size}`;
const URL_RESERVA_CREATE = () => `${BASE_RESERVA}/cre`; // ← AJUSTA SEGÚN TU ENDPOINT REAL
const URL_RESERVA_UPDATE = (id) => `${BASE_RESERVA}/modificarReserva/${id}`;
const URL_RESERVA_DELETE = (id) => `${BASE_RESERVA}/eliminarReserva/${id}`;
const URL_TIPORES_LIST   = () => `${BASE_TIPORES}/getDataTipoReserva`;
const URL_MESAS_LIST     = () => `${BASE_MESA}/getDataMesa`;

export {
  getReserva,
  createReserva,
  updateReserva,
  deleteReserva,
  getTiposReserva,
  getMesas,
};

// ===== Helper de headers CON Bearer token =====
function buildHeaders() {
  const headers = {
    "Content-Type": "application/json"
  };
  
  // Obtener token de localStorage
  const token = localStorage.getItem('token') || 
                localStorage.getItem('authToken') ||
                sessionStorage.getItem('token');
  
  if (token) {
    headers['Authorization'] = `Bearer ${token}`;
    console.log('✅ Token encontrado y agregado al header');
  } else {
    console.warn('⚠️ NO SE ENCONTRÓ TOKEN - La petición fallará');
    console.warn('Verifica que hayas hecho login y guardado el token en localStorage');
  }
  
  return headers;
}

// ===== CRUD Reservas =====

async function getReserva(page = 0, size = 20) {
  const res = await fetch(URL_RESERVAS_LIST(page, size), {
    method: "GET",
    headers: buildHeaders(),
    credentials: "include", // Mantener por si usas cookies también
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

async function createReserva(payload) {
  const url = URL_RESERVA_CREATE();
  console.log('🔍 DEBUG - URL completa:', url);
  console.log('🔍 DEBUG - Headers:', buildHeaders());
  console.log('🔍 DEBUG - Payload:', payload);
  
  const res = await fetch(url, {
    method: "POST",
    headers: buildHeaders(),
    credentials: "include",
    body: JSON.stringify(payload),
  });

  const text = await res.text();
  let body = {};
  try { 
    body = text ? JSON.parse(text) : {}; 
  } catch { 
    body = {}; 
  }

  if (!res.ok) {
    if (res.status === 401 || res.status === 403) {
      throw new Error("No autorizado. Verifica tu sesión.");
    }
    console.error("Error createReserva:", res.status, text);
    throw new Error(`Error al crear Reserva (${res.status}): ${text || "Respuesta vacía"}`);
  }

  return body?.data ?? body;
}

async function updateReserva(id, payload) {
  const res = await fetch(URL_RESERVA_UPDATE(id), {
    method: "PUT",
    headers: buildHeaders(),
    credentials: "include",
    body: JSON.stringify(payload),
  });

  const text = await res.text();
  let body = {};
  try { 
    body = text ? JSON.parse(text) : {}; 
  } catch { 
    body = {}; 
  }

  if (!res.ok) {
    if (res.status === 401 || res.status === 403) {
      throw new Error("No autorizado. Verifica tu sesión.");
    }
    console.error("Error updateReserva:", res.status, text);
    throw new Error(text || `HTTP ${res.status}`);
  }

  return body?.data ?? body;
}

async function deleteReserva(id) {
  const res = await fetch(URL_RESERVA_DELETE(id), {
    method: "DELETE",
    headers: buildHeaders(),
    credentials: "include",
  });

  const text = await res.text();
  let payload = {};
  try { 
    payload = text ? JSON.parse(text) : {}; 
  } catch { 
    payload = {}; 
  }

  if (!res.ok) {
    const status = res.status;
    
    if (status === 401 || status === 403) {
      throw new Error("No tienes permisos para eliminar esta reserva.");
    }
    if (status === 404) {
      throw new Error("La reserva no existe o ya fue eliminada.");
    }
    if (status === 409) {
      throw new Error(payload?.error || "No se puede eliminar: la reserva tiene registros relacionados.");
    }
    
    throw new Error(payload?.error || payload?.message || "No se pudo eliminar la reserva.");
  }

  return payload?.data ?? true;
}

// ===== Catálogos =====

async function getTiposReserva() {
  const res = await fetch(URL_TIPORES_LIST(), {
    method: "GET",
    headers: buildHeaders(),
    credentials: "include",
  });

  if (!res.ok) {
    if (res.status === 401 || res.status === 403) {
      throw new Error("No autorizado para ver tipos de reserva.");
    }
    throw new Error("Error al cargar tipos de reserva");
  }

  const data = await res.json();
  return Array.isArray(data?.content) ? data.content : 
         Array.isArray(data?.data) ? data.data : 
         Array.isArray(data) ? data : [];
}

async function getMesas() {
  const res = await fetch(URL_MESAS_LIST(), {
    method: "GET",
    headers: buildHeaders(),
    credentials: "include",
  });

  if (!res.ok) {
    if (res.status === 401 || res.status === 403) {
      throw new Error("No autorizado para ver mesas.");
    }
    throw new Error("Error al cargar mesas");
  }

  const data = await res.json();
  return Array.isArray(data?.content) ? data.content : 
         Array.isArray(data?.data) ? data.data : 
         Array.isArray(data) ? data : [];
}