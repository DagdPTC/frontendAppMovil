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
  recovery:   `${API_BASE}/auth/recovery`, // Nuevo endpoint de recuperación
};

// Helper para guardar/obtener token
export function setAuthToken(token) {
  if (token) {
    sessionStorage.setItem('authToken', token);
    console.log('✓ Token guardado:', token.substring(0, 20) + '...');
  } else {
    sessionStorage.removeItem('authToken');
    console.log('✓ Token eliminado');
  }
}

export function getAuthToken() {
  const token = sessionStorage.getItem('authToken');
  console.log('→ getAuthToken():', token ? token.substring(0, 20) + '...' : 'null');
  return token;
}

// Helper para gestionar datos de recuperación temporal
export function setRecoveryData(email, code = null) {
  const data = { email, timestamp: Date.now() };
  if (code) data.code = code;
  sessionStorage.setItem('recoveryData', JSON.stringify(data));
  console.log('✓ Datos de recuperación guardados:', email);
}

export function getRecoveryData() {
  const data = sessionStorage.getItem('recoveryData');
  if (!data) return null;
  
  const parsed = JSON.parse(data);
  // Verificar que no hayan pasado más de 15 minutos
  const elapsed = Date.now() - parsed.timestamp;
  if (elapsed > 15 * 60 * 1000) {
    clearRecoveryData();
    return null;
  }
  return parsed;
}

export function clearRecoveryData() {
  sessionStorage.removeItem('recoveryData');
  console.log('✓ Datos de recuperación eliminados');
}

export async function fetchJSON(url, opts = {}) {
  const token = getAuthToken();
  
  // Construye headers
  const headers = {
    "Content-Type": "application/json",
    ...(opts.headers || {})
  };
  
  // Si hay token, agrégalo al header
  if (token) {
    headers["Authorization"] = `Bearer ${token}`;
    console.log('→ fetchJSON agregando Authorization header para:', url);
  } else {
    console.log('→ fetchJSON SIN token para:', url);
  }
  
  console.log('→ Headers finales:', headers);
  
  const res = await fetch(url, {
    credentials: "include",
    headers,
    ...opts,
  });
  
  console.log(`← Respuesta de ${url}: ${res.status} ${res.statusText}`);
  
  if (!res.ok) {
    let msg = "";
    try { 
      const errorData = await res.json();
      msg = errorData.error || res.statusText;
      console.error('← Error JSON:', errorData);
    } catch {
      console.error('← Error sin JSON');
    }
    throw new Error(msg || `HTTP ${res.status}`);
  }
  
  const ct = res.headers.get("content-type") || "";
  if (ct.includes("application/json")) {
    const data = await res.json();
    console.log('← Datos recibidos:', data);
    return data;
  }
  return null;
}