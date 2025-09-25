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
// ===== Helper HTTP =====
// ordersService.js


function pad2(n){ return String(n).padStart(2, "0"); }
function toApiDateTime(d) {
  const dt = d instanceof Date ? d : new Date(d);
  const y = dt.getFullYear();
  const m = pad2(dt.getMonth() + 1);
  const day = pad2(dt.getDate());
  const hh = pad2(dt.getHours());
  const mm = pad2(dt.getMinutes());
  const ss = pad2(dt.getSeconds());
  return `${y}-${m}-${day}T${hh}:${mm}:${ss}`;
}


export async function ensureMeInSession(opts = {}) {
  const KEY = "ord_user";
  const force = opts.forceNetwork === true;

  if (!force) {
    try {
      const cached = JSON.parse(sessionStorage.getItem(KEY) || "null");
      if (cached && cached.correo) return cached;
    } catch { /* ignore */ }
  }

  try {
    const res = await fetch(`${API_HOST}/api/auth/me`, {
      method: "GET",
      credentials: "include",
      headers: {
        "Cache-Control": "no-cache",
        "Pragma": "no-cache",
      },
    });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const data = await res.json();

    const me = {
      correo: data.correo || null,
      rol: data.rol || null,
      username: data.username || data.user || data.nombreUsuario || data.nombreusuario || null,
      usuarioId: Number(data.usuarioId ?? data.id ?? data.usuarioID ?? 0) || null,
      idEmpleado: Number(data.idEmpleado ?? data.idempleado ?? 0) || null,
    };

    sessionStorage.setItem(KEY, JSON.stringify(me));
    return me;
  } catch (e) {
    try { sessionStorage.removeItem(KEY); } catch {}
    return { correo: null, rol: null, username: null, usuarioId: null, idEmpleado: null, error: e?.message || String(e) };
  }
}


export async function fetchJSON(url, options = {}) {
  const res = await fetch(url, {
    credentials: "include",
    headers: { "Content-Type": "application/json", ...(options.headers || {}) },
    ...options,
  });

  if (!res.ok) {
    let bodyText = null;
    let bodyJson = null;
    try { bodyJson = await res.json(); }
    catch { try { bodyText = await res.text(); } catch { bodyText = null; } }

    console.error("[API ERROR]", url, res.status, bodyJson || bodyText || "(sin cuerpo)");

    const msg =
      (bodyJson && (bodyJson.message || bodyJson.error || bodyJson.title)) ||
      `HTTP ${res.status}`;

    const err = new Error(msg);
    err.status = res.status;
    err.details = bodyJson || bodyText;
    throw err;
  }

  if (res.status === 204) return null;
  return res.json();
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
  try {
    const data = await fetchJSON(url);
    const arr = pickArray(data);
    console.log("[Pedidos]", arr.length, "via", url);
    return arr;
  } catch (e) {
    console.warn("[Pedidos] fallback [] por error:", e?.message || e);
    return []; // ← Esto evita que se caiga la UI si /apiPedido falla por auth
  }
}


// PÉGALO TAL CUAL, reemplazando tu método actual
export async function createPedido(body) {
  const url = `${API_HOST}/apiPedido/createPedido`;
  console.log("[POST]", url, "payload:", body);
  return fetchJSON(url, { method: "POST", body: JSON.stringify(body) });
}



export async function updatePedido(id, payload) {
  // Determinar una fecha válida para cumplir con la validación del backend
  const fechaBase =
    payload?.FPedido ||
    payload?.fpedido ||
    payload?.horaInicio ||
    payload?.Fecha ||
    payload?.fecha ||
    payload?.fechaPedido ||
    new Date();

  const FPedido = toApiDateTime(fechaBase);
  const horaInicio = toApiDateTime(fechaBase);

  // Normalizamos items mínimos que tu API requiere
  const items = Array.isArray(payload?.items)
    ? payload.items.map(pl => ({
        idPlatillo: Number(pl.idPlatillo),
        cantidad: Math.max(1, Number(pl.cantidad ?? pl.qty ?? 1)),
        precioUnitario: Number(pl.precioUnitario ?? pl.precio ?? 0),
      }))
    : [];

  const body = {
    nombreCliente: payload?.nombreCliente ?? "Cliente",
    idMesa: Number(payload?.idMesa),
    idEmpleado: Number(payload?.idEmpleado),
    idEstadoPedido: Number(payload?.idEstadoPedido),
    observaciones: payload?.observaciones ?? "",
    subtotal: Number(payload?.subtotal ?? 0),
    propina: Number(payload?.propina ?? 0),
    totalPedido: Number(
      payload?.totalPedido ??
      (Number(payload?.subtotal ?? 0) + Number(payload?.propina ?? 0))
    ),
    items,

    // Clave para evitar el 400:
    FPedido,
    horaInicio,
    fpedido: FPedido,   // compat
    horaFin: payload?.horaFin ?? null,
  };

  // <<< AQUÍ ESTABA EL PROBLEMA >>>
  const url = URL_PEDIDOS_UPDATE(id); // o: `${BASE_P}/modificarPedido/${encodeURIComponent(id)}`

  console.log("[PUT]", url, "payload:", body);

  return fetchJSON(url, {
    method: "PUT",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
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
