/**
 * reservaService.js - Servicio de gestión de reservas
 * Usa apiConfig.js para autenticación consistente
 */

// CRÍTICO: Importar desde tu apiConfig existente
import { fetchJSON } from "./apiConfig.js";

const API_HOST = "https://orderly-api-b53514e40ebd.herokuapp.com";

const BASE_RESERVA = `${API_HOST}/apiReserva`;
const BASE_TIPORES = `${API_HOST}/apiTipoReserva`;
const BASE_MESA    = `${API_HOST}/apiMesa`;

const URL_TIPORES_LIST    = (page=0, size=50) => `${BASE_TIPORES}/getTipoReserva?page=${page}&size=${size}`;
const URL_RESERVAS_LIST   = (page=0, size=20) => `${BASE_RESERVA}/getDataReserva?page=${page}&size=${size}`;
const URL_RESERVA_CREATE  = () => `${BASE_RESERVA}/createReserva`;
const URL_RESERVA_UPDATE  = (id) => `${BASE_RESERVA}/modificarReserva/${id}`;
const URL_RESERVA_DELETE  = (id) => `${BASE_RESERVA}/eliminarReserva/${id}`;
const URL_MESAS_LIST      = (page=0, size=200) => `${BASE_MESA}/getDataMesa?page=${page}&size=${size}`;

/**
 * Extrae array de respuesta (maneja diferentes formatos de API)
 */
function pickArray(data) {
  if (!data) return [];
  if (Array.isArray(data.content)) return data.content;
  if (Array.isArray(data.data))    return data.data;
  if (Array.isArray(data))         return data;
  return [];
}

// ============= ENDPOINTS =============

/**
 * Obtiene lista de reservas
 */
export async function getReserva(page = 0, size = 20) {
  // fetchJSON ya incluye el token automáticamente
  const data = await fetchJSON(URL_RESERVAS_LIST(page, size));
  return pickArray(data);
}

/**
 * Crea nueva reserva
 */
export async function createReserva(payload) {
  // Validaciones previas
  if (!payload?.idMesa) {
    throw new Error("Debe seleccionar una mesa.");
  }
  if (!payload?.idTipoReserva) {
    throw new Error("Debe seleccionar un tipo de evento válido.");
  }
  if (!payload?.horaI || !payload?.horaF) {
    throw new Error("Debe especificar el horario completo.");
  }
  if (!payload?.nomCliente?.trim()) {
    throw new Error("El nombre del cliente es obligatorio.");
  }
  if (!payload?.fReserva) {
    throw new Error("La fecha de reserva es obligatoria.");
  }

  console.log("[POST] createReserva payload:", payload);
  
  // fetchJSON maneja autenticación automáticamente
  const data = await fetchJSON(URL_RESERVA_CREATE(), {
    method: "POST",
    body: JSON.stringify(payload)
  });
  
  return data?.data ?? data;
}

/**
 * Actualiza reserva existente
 */
export async function updateReserva(id, payload) {
  if (!id) throw new Error("ID de reserva requerido para actualizar");
  
  console.log("[PUT] updateReserva id:", id, "payload:", payload);
  
  const data = await fetchJSON(URL_RESERVA_UPDATE(id), {
    method: "PUT",
    body: JSON.stringify(payload)
  });
  
  return data?.data ?? data;
}

/**
 * Elimina reserva
 */
export async function deleteReserva(id) {
  if (!id) throw new Error("ID requerido para eliminar reserva");
  
  console.log("[DELETE] deleteReserva id:", id);
  
  return await fetchJSON(URL_RESERVA_DELETE(id), { 
    method: "DELETE" 
  }) ?? true;
}

/**
 * Obtiene tipos de reserva/evento
 */
export async function getTiposReserva(page = 0, size = 50) {
  const data = await fetchJSON(URL_TIPORES_LIST(page, size));
  return pickArray(data);
}

/**
 * Obtiene lista de mesas
 */
export async function getMesas(page = 0, size = 200) {
  const data = await fetchJSON(URL_MESAS_LIST(page, size));
  return pickArray(data);
}

console.log("[reservaService] ✓ Módulo cargado correctamente");