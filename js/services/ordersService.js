// js/services/ordersService.js

// ===== Config =====
const API_HOST = "http://localhost:8080";

// Endpoints EXACTOS según tus JSON
const BASE_P  = `${API_HOST}/apiPedido`;
const URL_EMPLEADOS = (page=0,size=100) => `${API_HOST}/apiEmpleado/getDataEmpleado?page=${page}&size=${size}`;
const URL_MESAS     = (page=0,size=200) => `${API_HOST}/apiMesa/getDataMesa?page=${page}&size=${size}`;
const URL_ESTADOS   =                 () => `${API_HOST}/apiEstadoPedido/getDataEstadoPedido`;
const URL_PERSONAS = (page=0,size=500) => `${API_HOST}/apiPersona/getDataPersona?page=${page}&size=${size}`;

// (Si usas estas rutas para pedidos, déjalas así; si no, cámbialas aquí)
const URL_PEDIDOS_LIST   = (page=0,size=50) => `${BASE_P}/getDataPedido?page=${page}&size=${size}`;
const URL_PEDIDOS_CREATE =                  () => `${BASE_P}/createPedido`;
const URL_PEDIDOS_UPDATE = (id)             => `${BASE_P}/modificarPedido/${encodeURIComponent(id)}`;
const URL_PEDIDOS_DELETE = (id)             => `${BASE_P}/eliminarPedido/${encodeURIComponent(id)}`;

console.log("[ordersService exact] loaded");

// ===== Helper HTTP =====
async function fetchJSON(url, { method = "GET", headers = {}, body } = {}) {
  const res = await fetch(url, {
    method,
    headers: { "Content-Type": "application/json", Accept: "application/json", ...headers },
    body,
  });

  const raw = await res.text();
  let data;
  try { data = raw ? JSON.parse(raw) : null; } catch { data = raw; }

  if (!res.ok) {
    console.error("[API ERROR]", url, res.status, res.statusText, data);
    const msg =
      (data && (data.message || data.error || data.status || data.detail)) ||
      (typeof data === "string" ? data : "") ||
      res.statusText || "Error";
    const err = new Error(msg);
    err.status = res.status;
    err.data = data;
    throw err;
  }
  return data;
}

function pickArray(data) {
  if (!data) return [];
  if (Array.isArray(data.content)) return data.content; // paginado (como tus JSON)
  if (Array.isArray(data))         return data;         // array plano
  if (Array.isArray(data.data))    return data.data;
  return [];
}

// ===== Normalizadores =====
function normalizeItems(arr) {
  if (!Array.isArray(arr)) return [];
  return arr
    .map((it) => ({
      idPlatillo: Number(it.idPlatillo ?? it.id ?? it.Id),
      cantidad: Math.max(1, Number(it.cantidad ?? it.qty ?? 1)),
    }))
    .filter((x) => Number.isFinite(x.idPlatillo) && x.idPlatillo > 0);
}

function buildFechas() {
  const now = new Date();
  const yyyy = now.getFullYear();
  const mm = String(now.getMonth() + 1).padStart(2, "0");
  const dd = String(now.getDate()).padStart(2, "0");
  return {
    fpedido: `${yyyy}-${mm}-${dd}`,   // compat si tu backend lo usa
    fechaPedido: now.toISOString(),   // ISO estándar
  };
}

/**
 * Asegura que el payload de pedido cumpla con el shape esperado:
 * {
 *   nombreCliente, idMesa, idEmpleado, idEstadoPedido,
 *   observaciones, propina, items:[{idPlatillo, cantidad}], fpedido, fechaPedido
 * }
 */
function coercePedidoInput(dto) {
  const src = dto || {};
  const nombreCliente  = String(src.nombreCliente ?? src.nombrecliente ?? "");
  const idMesa         = Number(src.idMesa);
  const idEmpleado     = Number(src.idEmpleado);
  const idEstadoPedido = Number(src.idEstadoPedido);
  const observaciones  = (src.observaciones != null) ? String(src.observaciones) : "Sin observaciones";
  const propina        = Number(src.propina ?? 0);

  // Preferimos items[]; si no vienen, intentamos construir uno solo desde legacy
  let items = Array.isArray(src.items) ? normalizeItems(src.items) : [];
  if (!items.length) {
    const idPlat = Number(src.idPlatillo);
    const cant   = Math.max(1, Number(src.cantidad ?? 0));
    if (Number.isFinite(idPlat) && idPlat > 0 && Number.isFinite(cant) && cant > 0) {
      items = [{ idPlatillo: idPlat, cantidad: cant }];
    }
  }

  return { nombreCliente, idMesa, idEmpleado, idEstadoPedido, observaciones, propina, items };
}

// ===== Pedidos =====
export async function getPedidos(page = 0, size = 50) {
  const url = URL_PEDIDOS_LIST(page, size);
  const data = await fetchJSON(url);
  const arr = pickArray(data);
  console.log("[Pedidos]", arr.length, "via", url);
  return arr;
}

// PÉGALO TAL CUAL, reemplazando tu método actual
export async function createPedido(body) {
  const url = `${API_HOST}/apiPedido/createPedido`;
  console.log("[POST]", url, "payload:", body);
  return fetchJSON(url, { method: "POST", body: JSON.stringify(body) });
}



export async function updatePedido(id, body) {
  const url = `${API_HOST}/apiPedido/modificarPedido/${encodeURIComponent(id)}`;
  console.log("[PUT]", url, "payload:", body);
  return fetchJSON(url, { method: "PUT", body: JSON.stringify(body) });
}



export async function deletePedido(id) {
  const url = URL_PEDIDOS_DELETE(id);
  console.log("[DELETE]", url);
  return fetchJSON(url, { method: "DELETE" });
}

// ===== Catálogos (EXACTOS a tus JSON) =====
// PÉGALO TAL CUAL, reemplazando tu método actual
export async function getEmpleados(page = 0, size = 100) {
  // Empleados
  const urlEmp = `${API_HOST}/apiEmpleado/getDataEmpleado?page=${page}&size=${size}`;
  const dataEmp = await fetchJSON(urlEmp);
  const empleados = Array.isArray(dataEmp?.content) ? dataEmp.content : [];
  console.log("[Empleados]", empleados.length, "via", urlEmp);

  // Personas (para nombres) — si no existe este endpoint, se captura y seguimos
  let personasById = new Map();
  try {
    const urlPer = `${API_HOST}/apiPersona/getDataPersona?page=0&size=1000`;
    const dataPer = await fetchJSON(urlPer);
    const personas = Array.isArray(dataPer?.content) ? dataPer.content : [];
    personasById = new Map(
      personas.map(p => [
        Number(p.id ?? p.Id ?? p.idPersona ?? p.IdPersona),
        p
      ])
    );
  } catch (e) {
    console.warn("[Personas] No se pudo cargar personas (se mostrará 'Empleado {id}'):", e?.message || e);
  }

  // Mapeo final [{ id, nombre }]
  return empleados
    .map(e => {
      const id = Number(e.id);
      const idPersona = Number(e.idPersona);
      const per = personasById.get(idPersona);

      // Arma "Nombre Apellido" si viene Persona
      const nombre = per
        ? [
            (per.primerNombre ?? per.PrimerNombre ?? per.primer_nombre),
            (per.apellidoPaterno ?? per.ApellidoPaterno ?? per.apellido_paterno),
          ].filter(Boolean).join(" ")
        : `Empleado ${id || ""}`;

      return { id, nombre };
    })
    .filter(x => Number.isFinite(x.id) && x.id > 0);
}



export async function getMesasForOrders(page = 0, size = 200) {
  const url  = URL_MESAS(page, size);
  const data = await fetchJSON(url);
  const arr  = pickArray(data); // [{ id, idTipoMesa, nomMesa, idEstadoMesa }, ...]
  console.log("[Mesas]", arr.length, "via", url);
  // devolvemos tal cual; tu controller ya maneja idEstadoMesa y nomMesa
  return arr;
}

export async function getEstadosPedido() {
  const url  = URL_ESTADOS();
  const data = await fetchJSON(url);
  const arr  = pickArray(data); // [{ id, nomEstado }, ...] (paginado)
  console.log("[EstadosPedido]", arr.length, "via", url);
  return arr;
}
