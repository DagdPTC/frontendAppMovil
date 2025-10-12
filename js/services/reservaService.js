/**
 * RESERVA SERVICE - Servicio para gestión de reservas
 * CORREGIDO: Endpoint de mesas sin paginación
 */

const API_HOST = "https://orderly-api-b53514e40ebd.herokuapp.com";

// ============= ENDPOINTS BASE =============
const BASE_RESERVA = `${API_HOST}/apiReserva`;
const BASE_TIPORES = `${API_HOST}/apiTipoReserva`;
const BASE_MESA    = `${API_HOST}/apiMesa`;
const BASE_TIPOMESA = `${API_HOST}/apiTipoMesa`;
const URL_ME       = `${API_HOST}/api/auth/me`;

// ============= URLS DE RESERVAS =============
const URL_RESERVAS_LIST   = (page=0, size=20) => `${BASE_RESERVA}/getDataReserva?page=${page}&size=${size}`;
const URL_RESERVA_CREATE  = () => `${BASE_RESERVA}/createReserva`;
const URL_RESERVA_UPDATE  = (id) => `${BASE_RESERVA}/modificarReserva/${id}`;
const URL_RESERVA_DELETE  = (id) => `${BASE_RESERVA}/eliminarReserva/${id}`;

// ============= URLS DE TIPOS DE RESERVA =============
const URL_TIPORES_LIST = (page=0, size=50) => `${BASE_TIPORES}/getTipoReserva?page=${page}&size=${size}`;

// ============= URLS DE MESAS - CORREGIDO =============
// SIN paginación porque el endpoint no lo soporta correctamente
const URL_MESAS_LIST = () => `${BASE_MESA}/getDataMesa`;
const URL_MESA_BY_ID = (id) => `${BASE_MESA}/getMesa/${id}`;

// ============= URLS DE TIPOS DE MESA =============
const URL_TIPOMESA_LIST = (page=0, size=50) => `${BASE_TIPOMESA}/getDataTipoMesa?page=${page}&size=${size}`;

// ============= UTILIDADES =============
/**
 * Lee el token de autenticación del storage
 * CORREGIDO: Busca en los lugares correctos según login.html
 * @returns {string|null} Token JWT o null
 */
function readToken() {
  // Prioridad: sessionStorage (usado por login.html) -> localStorage
  return sessionStorage.getItem("authToken") || 
         sessionStorage.getItem("AUTH_TOKEN") ||
         localStorage.getItem("authToken") ||
         localStorage.getItem("AUTH_TOKEN");
}

/**
 * Genera headers de autenticación
 * @param {Object} extra - Headers adicionales
 * @returns {Object} Headers con Authorization
 */
function authHeaders(extra = {}) {
  const h = { ...extra };
  const t = readToken();
  if (t) {
    h.Authorization = `Bearer ${t}`;
    console.log("[Service] Token encontrado, longitud:", t.length);
  } else {
    console.warn("[Service] ⚠️ No se encontró token de autenticación");
  }
  return h;
}

/**
 * Realiza petición HTTP con manejo de errores
 * @param {string} url - URL del endpoint
 * @param {Object} options - Opciones de fetch
 * @returns {Promise<any>} Respuesta JSON
 * @throws {Error} Error con status y detalles
 */
async function fetchJSON(url, options = {}) {
  try {
    const res = await fetch(url, {
      credentials: "include",
      ...options,
      headers: { 
        "Content-Type": "application/json",
        ...authHeaders(options.headers || {})
      }
    });

    // Si es 204 No Content, retornar null
    if (res.status === 204) return null;

    // Leer el cuerpo como texto primero
    const textBody = await res.text();
    
    // Si está vacío y la respuesta es exitosa, retornar null
    if (!textBody || textBody.trim() === '') {
      if (res.ok) {
        console.warn(`[Service] Respuesta vacía de ${url}`);
        return null;
      }
    }

    // Intentar parsear como JSON
    let body;
    try {
      body = JSON.parse(textBody);
    } catch (parseError) {
      // Si no es JSON válido
      if (!res.ok) {
        const err = new Error(`Error HTTP ${res.status}: ${textBody.substring(0, 100)}`);
        err.status = res.status;
        err.details = textBody;
        throw err;
      }
      
      // Si es exitoso pero no JSON, loguear warning
      console.warn(`[Service] Respuesta no-JSON de ${url}:`, textBody.substring(0, 100));
      return null;
    }

    // Si la respuesta HTTP no es OK
    if (!res.ok) {
      const msg = body?.message || body?.error || body?.detail || 
                  (typeof body === "string" ? body : `Error HTTP ${res.status}`);
      
      const err = new Error(msg);
      err.status = res.status;
      err.details = body;
      throw err;
    }

    return body;
    
  } catch (error) {
    // Si el error ya tiene status, es nuestro error personalizado
    if (error.status) throw error;
    
    // Si es error de red u otro error
    console.error(`[Service] Error en fetchJSON ${url}:`, error);
    const err = new Error(`Error de conexión: ${error.message}`);
    err.originalError = error;
    throw err;
  }
}

/**
 * Extrae array de datos de respuesta paginada
 * @param {Object} data - Respuesta de la API
 * @returns {Array} Array de datos
 */
function pickArray(data) {
  if (!data) return [];
  if (Array.isArray(data.content)) return data.content;
  if (Array.isArray(data.data))    return data.data;
  if (Array.isArray(data))         return data;
  return [];
}

// ============= AUTENTICACIÓN =============

/**
 * Obtiene información del usuario en sesión
 * @returns {Promise<Object|null>} Datos del usuario o null si no está autenticado
 */
export async function getSessionUser() {
  try {
    const me = await fetchJSON(URL_ME);
    return me?.data ?? me;
  } catch (e) {
    if (e?.status === 401) return null;
    throw e;
  }
}

/**
 * Verifica si un error es de autenticación
 * @param {Error} err - Error a verificar
 * @returns {boolean} true si es error 401/403
 */
export function isAuthError(err) {
  return err?.status === 401 || err?.status === 403;
}

// ============= RESERVAS =============

/**
 * Obtiene lista de reservas con paginación
 * @param {number} page - Número de página (default: 0)
 * @param {number} size - Tamaño de página (default: 20)
 * @returns {Promise<Array>} Lista de reservas
 */
export async function getReserva(page = 0, size = 20) {
  console.log(`[Service] GET Reservas - page:${page}, size:${size}`);
  const data = await fetchJSON(URL_RESERVAS_LIST(page, size));
  return pickArray(data);
}

/**
 * Crea nueva reserva
 * @param {Object} payload - Datos de la reserva
 * @returns {Promise<Object>} Reserva creada
 */
export async function createReserva(payload) {
  console.log("[Service] POST createReserva:", payload);
  
  if (!payload?.nomCliente?.trim()) {
    throw new Error("El nombre del cliente es obligatorio.");
  }
  if (!payload?.fReserva) {
    throw new Error("La fecha de reserva es obligatoria.");
  }
  if (!payload?.horaI || !payload?.horaF) {
    throw new Error("Debe especificar el horario completo.");
  }
  if (!payload?.idTipoReserva) {
    throw new Error("Debe seleccionar un tipo de evento válido.");
  }
  if (!payload?.idMesa && (!payload?.mesas || payload.mesas.length === 0)) {
    throw new Error("Debe seleccionar al menos una mesa.");
  }

  const data = await fetchJSON(URL_RESERVA_CREATE(), {
    method: "POST",
    body: JSON.stringify(payload)
  });
  
  console.log("[Service] Reserva creada exitosamente:", data);
  return data?.data ?? data;
}

/**
 * Actualiza reserva existente
 * @param {number} id - ID de la reserva
 * @param {Object} payload - Datos actualizados
 * @returns {Promise<Object>} Reserva actualizada
 */
export async function updateReserva(id, payload) {
  if (!id) throw new Error("ID de reserva requerido para actualizar");
  
  console.log(`[Service] PUT updateReserva id:${id}`, payload);
  const data = await fetchJSON(URL_RESERVA_UPDATE(id), {
    method: "PUT",
    body: JSON.stringify(payload)
  });
  
  console.log("[Service] Reserva actualizada exitosamente:", data);
  return data?.data ?? data;
}

/**
 * Elimina reserva
 * @param {number} id - ID de la reserva
 * @returns {Promise<boolean>} true si se eliminó correctamente
 */
export async function deleteReserva(id) {
  if (!id) throw new Error("ID requerido para eliminar reserva");
  
  console.log(`[Service] DELETE deleteReserva id:${id}`);
  await fetchJSON(URL_RESERVA_DELETE(id), { method: "DELETE" });
  
  console.log("[Service] Reserva eliminada exitosamente");
  return true;
}

// ============= TIPOS DE RESERVA/EVENTO =============

/**
 * Obtiene catálogo de tipos de reserva (eventos)
 * @param {number} page - Número de página (default: 0)
 * @param {number} size - Tamaño de página (default: 50)
 * @returns {Promise<Array>} Lista de tipos de reserva
 */
export async function getTiposReserva(page = 0, size = 50) {
  console.log(`[Service] GET Tipos de Reserva - page:${page}, size:${size}`);
  const data = await fetchJSON(URL_TIPORES_LIST(page, size));
  return pickArray(data);
}

// ============= MESAS - CORREGIDO =============

/**
 * Obtiene lista completa de mesas SIN paginación
 * CORREGIDO: El endpoint no soporta paginación correctamente
 * @returns {Promise<Array>} Lista de mesas con capacidad
 */
export async function getMesas() {
  console.log(`[Service] GET Mesas (sin paginación)`);
  console.log(`[Service] URL: ${URL_MESAS_LIST()}`);
  
  try {
    const data = await fetchJSON(URL_MESAS_LIST());
    
    if (!data) {
      console.warn("[Service] Respuesta vacía del endpoint de mesas");
      return [];
    }
    
    const mesas = pickArray(data);
    
    console.log(`[Service] ✅ ${mesas.length} mesas cargadas exitosamente`);
    
    if (mesas.length > 0) {
      console.log("[Service] Muestra de primera mesa:", {
        id: mesas[0].id,
        nomMesa: mesas[0].nomMesa,
        idTipoMesa: mesas[0].idTipoMesa,
        idEstadoMesa: mesas[0].idEstadoMesa
      });
    } else {
      console.warn("[Service] ⚠️ No hay mesas registradas en el sistema");
    }
    
    return mesas;
    
  } catch (error) {
    console.error("[Service] ❌ Error cargando mesas:", {
      message: error.message,
      status: error.status,
      details: error.details
    });
    
    return [];
  }
}

/**
 * Obtiene información de una mesa específica
 * @param {number} id - ID de la mesa
 * @returns {Promise<Object>} Datos de la mesa
 */
export async function getMesaById(id) {
  if (!id) throw new Error("ID de mesa requerido");
  
  console.log(`[Service] GET Mesa by ID:${id}`);
  const data = await fetchJSON(URL_MESA_BY_ID(id));
  return data?.data ?? data;
}

// ============= TIPOS DE MESA =============

/**
 * Obtiene catálogo de tipos de mesa
 * @param {number} page - Número de página (default: 0)
 * @param {number} size - Tamaño de página (default: 50)
 * @returns {Promise<Array>} Lista de tipos de mesa
 */
export async function getTiposMesa(page = 0, size = 50) {
  console.log(`[Service] GET Tipos de Mesa - page:${page}, size:${size}`);
  
  try {
    const data = await fetchJSON(URL_TIPOMESA_LIST(page, size));
    const tipos = pickArray(data);
    
    console.log(`[Service] ${tipos.length} tipos de mesa cargados`);
    return tipos;
  } catch (error) {
    console.error("[Service] Error cargando tipos de mesa:", error);
    return [];
  }
}

// ============= UTILIDADES ADICIONALES =============

/**
 * Valida si una mesa está disponible
 * @param {number} mesaId - ID de la mesa
 * @returns {Promise<boolean>} true si está disponible
 */
export async function verificarDisponibilidadMesa(mesaId) {
  try {
    const mesa = await getMesaById(mesaId);
    return mesa?.disponible !== false && mesa?.estado !== "Ocupada";
  } catch (error) {
    console.error(`[Service] Error verificando disponibilidad de mesa ${mesaId}:`, error);
    return false;
  }
}

/**
 * Calcula capacidad total de un conjunto de mesas
 * @param {Array<number>} mesaIds - Array de IDs de mesas
 * @returns {Promise<number>} Capacidad total
 */
export async function calcularCapacidadTotal(mesaIds) {
  if (!Array.isArray(mesaIds) || mesaIds.length === 0) return 0;
  
  try {
    const todasLasMesas = await getMesas();
    
    return mesaIds.reduce((total, mesaId) => {
      const mesa = todasLasMesas.find(m => 
        Number(m.idMesa ?? m.id) === Number(mesaId)
      );
      const capacidad = mesa?.capacidad ?? mesa?.capacidadPersonas ?? 0;
      return total + Number(capacidad);
    }, 0);
  } catch (error) {
    console.error("[Service] Error calculando capacidad total:", error);
    return 0;
  }
}

/**
 * Obtiene mesas disponibles para una fecha/hora específica
 * @param {string} fecha - Fecha en formato YYYY-MM-DD
 * @param {string} horaInicio - Hora inicio en formato HH:mm
 * @param {string} horaFin - Hora fin en formato HH:mm
 * @returns {Promise<Array>} Mesas disponibles
 */
export async function getMesasDisponibles(fecha, horaInicio, horaFin) {
  console.log(`[Service] GET Mesas Disponibles - ${fecha} ${horaInicio}-${horaFin}`);
  
  try {
    const todasLasMesas = await getMesas();
    return todasLasMesas.filter(m => 
      m.disponible !== false && m.estado !== "Ocupada"
    );
  } catch (error) {
    console.error("[Service] Error obteniendo mesas disponibles:", error);
    return [];
  }
}

// ============= EXPORTS DE CONSTANTES =============

/**
 * Constantes útiles para el frontend
 */
export const CONSTANTS = {
  MAX_PERSONAS_RESERVA: 200,
  MIN_PERSONAS_RESERVA: 1,
  MIN_DURACION_MINUTOS: 30,
  MAX_DURACION_HORAS: 8,
  DIAS_ANTICIPACION_MINIMA: 2,
  POLL_INTERVAL_MS: 5000,
};

console.log("[reservaService] ✓ Módulo cargado correctamente (endpoint mesas sin paginación)");