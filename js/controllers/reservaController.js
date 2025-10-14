/* RESERVACONTROLLER.JS - CON LOADER GLOBAL
   Cambios:
   - Loader global con mensajes personalizados
   - Solo 1 tarjeta expandida a la vez
   - Muestra mesa seleccionada en tarjeta
   - Modal permite seleccionar solo 1 mesa (radio buttons)
*/
import {
  getSessionUser, isAuthError,
  getReserva, createReserva, updateReserva, deleteReserva,
  getTiposReserva, getMesas, getTiposMesa
} from "../services/reservaService.js";

/* =========================
   LOADER GLOBAL (overlay con mensajes)
   ========================= */
let LOADER_COUNT = 0;

function ensureLoaderHost() {
  let host = document.getElementById("global-loader");
  if (host) return host;

  // estilos del loader (una sola vez)
  if (!document.getElementById("global-loader-styles")) {
    const st = document.createElement("style");
    st.id = "global-loader-styles";
    st.textContent = `
      #global-loader{
        position: fixed; inset: 0; z-index: 99999; display: none;
        align-items: center; justify-content: center;
        background: rgba(0,0,0,.35); backdrop-filter: blur(1.5px);
      }
      #global-loader.open{ display:flex; }
      #global-loader .panel{
        min-width: 260px; max-width: 90vw;
        background:#fff; color:#111; border-radius:14px; border:1px solid #e5e7eb;
        box-shadow: 0 24px 64px rgba(0,0,0,.25);
        padding:16px 18px; display:flex; align-items:center; gap:12px;
        animation: glfade .18s ease;
      }
      #global-loader .msg{ font-size:.95rem; font-weight:600; }
      #global-loader .spinner{
        width:22px; height:22px; border-radius:50%;
        border:3px solid #e5e7eb; border-top-color:#2563EB; animation: spin 1s linear infinite;
      }
      @keyframes spin{ to{ transform: rotate(360deg); } }
      @keyframes glfade{ from{ opacity:0; transform: translateY(6px) } to{ opacity:1; transform:none } }
    `;
    document.head.appendChild(st);
  }

  host = document.createElement("div");
  host.id = "global-loader";
  host.setAttribute("role", "status");
  host.setAttribute("aria-live", "polite");
  host.innerHTML = `
    <div class="panel">
      <div class="spinner" aria-hidden="true"></div>
      <div class="msg" id="global-loader-msg">Cargando…</div>
    </div>`;
  document.body.appendChild(host);
  return host;
}

function showLoader(message = "Cargando…") {
  const host = ensureLoaderHost();
  const msg = host.querySelector("#global-loader-msg");
  if (msg) msg.textContent = message;
  LOADER_COUNT++;
  host.classList.add("open");
}

function hideLoader(force = false) {
  const host = ensureLoaderHost();
  LOADER_COUNT = force ? 0 : Math.max(0, LOADER_COUNT - 1);
  if (LOADER_COUNT === 0) host.classList.remove("open");
}

// ==========================
// AUTH GATE para Reservas
// ==========================
function renderAuthGate() {
  const host =
    document.querySelector("main") ||
    document.querySelector(".main-content") ||
    document.body;

  if (!host) return;

  host.innerHTML = `
    <div class="p-6 grid place-items-center min-h-[60vh]">
      <div class="max-w-md w-full bg-white border border-gray-200 rounded-2xl shadow p-6 text-center">
        <div class="mx-auto w-14 h-14 rounded-full bg-blue-50 grid place-items-center mb-3">
          <i class="fa-solid fa-lock text-blue-600 text-xl"></i>
        </div>
        <h2 class="text-lg font-semibold mb-1">Sesión requerida</h2>
        <p class="text-gray-600 mb-4">Inicia sesión para ver y gestionar las reservaciones.</p>
        <a href="login.html"
           class="inline-flex items-center gap-2 px-4 py-2 rounded-xl bg-blue-600 text-white hover:bg-blue-700 transition">
          <i class="fa-solid fa-arrow-right-to-bracket"></i>
          Iniciar sesión
        </a>
      </div>
    </div>
  `;
}

function handle401(e) {
  if (e && e.status === 401) {
    renderAuthGate();
    return true;
  }
  return false;
}

document.addEventListener("DOMContentLoaded", async () => {
  showLoader("Verificando sesión…");
  try {
    const me = await getSessionUser();
    if (!me) { 
      hideLoader();
      renderAuthGate(); 
      return; 
    }
  } catch { 
    hideLoader();
    renderAuthGate(); 
    return; 
  }
  hideLoader();

  newReservationBtn?.addEventListener("click", () => {
    clearForm();
    setFormModeCreate();
    openForm();
  });
  cancelReservationBtn?.addEventListener("click", () => {
    clearForm();
    closeForm();
  });
  saveReservationBtn?.addEventListener("click", (e) => {
    e.preventDefault();
    handleSave();
  });
  selectTablesBtn?.addEventListener("click", (e) => {
    e.preventDefault();
    openTablesModal();
  });

  setupRealtimeValidation();
  
  showLoader("Cargando catálogos…");
  await loadTiposMesa();
  await loadTiposEvento();
  hideLoader();
  
  await loadFromAPI();
});

/* ======================= helpers ======================= */
const $  = (s, r = document) => r.querySelector(s);
const $$ = (s, r = document) => [...r.querySelectorAll(s)];
const esc = (x) => String(x ?? "").replace(/[&<>"']/g, (s) => ({ "&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;" }[s]));
const clamp=(n,min,max)=>Math.min(Math.max(n,min),max);

function parseTime12(str){
  const m=String(str||"").trim().match(/^(\d{1,2})(?::(\d{1,2}))?(?::\d{1,2})?$/);
  if(!m) return null;
  let h=+m[1]; let mi=m[2]!==undefined?+m[2]:0;
  if(!Number.isFinite(h)||!Number.isFinite(mi)) return null;
  if(h < 1 || h > 12) return null;
  if(mi < 0 || mi > 59) return null;
  h=clamp(h,1,12);
  mi=clamp(mi,0,59);
  return {h,m:mi};
}

function normalizeTimeForSave(v){
  if(!v) return "";
  const m=String(v).trim().match(/^(\d{1,2})(?::(\d{1,2}))?$/);
  if(!m) return "";
  let h=+m[1]; let mi=m[2]!==undefined?+m[2]:0;
  h=clamp(h,1,12); mi=clamp(mi,0,59);
  return `${h}:${String(mi).padStart(2,"0")}`;
}

function toMinutesFrom12(hhmm,ampm){
  const t=parseTime12(hhmm);
  if(!t) return NaN;
  let h24=t.h%12;
  if((ampm||"").toUpperCase()==="PM") h24+=12;
  return h24*60+t.m;
}

const hourLabel=(h,a)=>{
  const t=parseTime12(h);
  return t?`${t.h}:${String(t.m).padStart(2,"0")}${a?" "+a:""}`:`${h||""} ${a||""}`.trim();
};

const formatDateLabel=(d)=> d?new Date(d+"T00:00:00").toLocaleDateString("es-ES",{day:"2-digit",month:"short"}):"";

function to24(hhmm,ampm){
  const t=parseTime12(hhmm);
  if(!t) return "";
  let h=t.h%12;
  if((ampm||"").toUpperCase()==="PM") h+=12;
  return `${String(h).padStart(2,"0")}:${String(t.m).padStart(2,"0")}`;
}

function from24(hhmm){
  const [hS,mS] = String(hhmm||"").split(":");
  let h = parseInt(hS||"0",10);
  const m = parseInt(mS||"0",10);
  if(!Number.isFinite(h)||!Number.isFinite(m)) return { time:"", ampm:"AM" };
  const ampm = h>=12 ? "PM":"AM";
  h = h%12;
  if(h===0) h=12;
  return { time: `${h}:${String(m).padStart(2,"0")}`, ampm };
}

/* ===== Aviso inline debajo del botón Ofertas (fallback: Seleccionar Mesas) ===== */
function showInlineDateWarning(msg) {
  const candidatos = [
    '#offers-btn', '#btn-ofertas', '.btn-ofertas', '#ofertas-btn', '#boton-ofertas',
    '#select-tables-btn'
  ];
  let anchor = null;
  for (const sel of candidatos) {
    anchor = document.querySelector(sel);
    if (anchor) break;
  }
  if (!anchor) return;

  let warn = document.getElementById('inline-date-warning');
  if (!warn) {
    warn = document.createElement('div');
    warn.id = 'inline-date-warning';
    warn.className = 'mt-2 text-sm text-red-600 flex items-center gap-2';
    anchor.insertAdjacentElement('afterend', warn);
  }
  warn.innerHTML = `<i class="fa-solid fa-triangle-exclamation"></i><span>${esc(msg)}</span>`;
}
function hideInlineDateWarning() {
  const w = document.getElementById('inline-date-warning');
  if (w) w.remove();
}

/* ======================= estado/DOM ======================= */
let editingId = null;
let mesaSeleccionada = null; // CAMBIO: solo 1 mesa
let tipoReservaMap = new Map();
let tiposMesaMap = new Map();
let reservasCache = [];

const reservationsSection   = $("#reservations-section");
const buttonSection         = $("#button-section");
const newReservationBtn     = $("#new-reservation-btn");

const reservationForm       = $("#new-reservation-form");
const cancelReservationBtn  = $("#cancel-reservation-btn");
const saveReservationBtn    = $("#save-reservation-btn");

const clientNameInput   = $("#client-name");
const clientPhoneInput  = $("#client-phone");
const dateInput         = $("#reservation-date");
const timeStartInput    = $("#reservation-time-start");
const timeEndInput      = $("#reservation-time-end");
const startAmPmSelect   = $("#reservation-time-start-ampm");
const endAmPmSelect     = $("#reservation-time-end-ampm");
const peopleInput       = $("#reservation-people");
const eventSelect       = $("#reservation-event");
const commentInput      = $("#reservation-comment");

const clientError    = $("#client-error");
const phoneError     = $("#phone-error");
const dateError      = $("#date-error");
const timeStartError = $("#time-start-error");
const timeEndError   = $("#time-end-error");
const peopleError    = $("#people-error");
const eventError     = $("#event-error");
const tablesError    = $("#tables-error");

const selectTablesBtn    = $("#select-tables-btn");
const selectedTablesText = $("#selected-tables-text");
const formTitle = $("#reservation-form-title");

/* ======================= Verificar disponibilidad ======================= */
function esMesaReservada(mesaId, fecha, horaInicio, horaFin, excludeReservaId = null) {
  if (!fecha || !horaInicio || !horaFin) return false;

  const [horaInicioH, horaInicioM] = horaInicio.split(':').map(Number);
  const [horaFinH, horaFinM] = horaFin.split(':').map(Number);
  const minutosInicio = horaInicioH * 60 + horaInicioM;
  const minutosFin = horaFinH * 60 + horaFinM;

  const reservasConflicto = reservasCache.filter(reserva => {
    if (excludeReservaId && reserva.id === excludeReservaId) {
      return false;
    }

    const reservaTieneMesa = Array.isArray(reserva.tables)
      ? reserva.tables.includes(Number(mesaId))
      : (reserva.idMesa === Number(mesaId));

    if (!reservaTieneMesa) return false;
    if (reserva.date !== fecha) return false;

    const reservaInicio = toMinutesFrom12(reserva.timeStart, reserva.startAmPm);
    const reservaFin = toMinutesFrom12(reserva.timeEnd, reserva.endAmPm);

    if (!Number.isFinite(reservaInicio) || !Number.isFinite(reservaFin)) return false;

    const haySolapamiento = minutosInicio < reservaFin && minutosFin > reservaInicio;

    return haySolapamiento;
  });

  return reservasConflicto.length > 0;
}

/* ======================= helpers de validación ======================= */
function showError(errorEl, message) {
  if (!errorEl) return;
  errorEl.textContent = message;
  errorEl.classList.remove("hidden");
}

function hideError(errorEl) {
  if (!errorEl) return;
  errorEl.classList.add("hidden");
}

function markFieldValid(inputEl) {
  inputEl?.classList.remove("border-red-500");
  inputEl?.classList.add("border-green-500");
}

function markFieldInvalid(inputEl) {
  inputEl?.classList.remove("border-green-500");
  inputEl?.classList.add("border-red-500");
}

function resetFieldValidation(inputEl) {
  inputEl?.classList.remove("border-red-500", "border-green-500");
}

/* ======================= form mode ======================= */
function setFormModeCreate(){
  formTitle&&(formTitle.textContent="Nueva reserva");
  saveReservationBtn&&(saveReservationBtn.textContent="Guardar Reserva");
  editingId=null;
}

function setFormModeEdit(n){
  formTitle&&(formTitle.textContent=`Editar reserva de ${n||""}`.trim());
  saveReservationBtn&&(saveReservationBtn.textContent="Actualizar Reserva");
}

/* ======================= map API <-> UI ======================= */
function apiToUI(r){
  const id       = r.id ?? r.Id ?? r.idReserva ?? r.IdReserva ?? null;
  const fReserva = r.fReserva ?? r.FReserva ?? r.freserva ?? r.fecha ?? "";
  const horaIraw = r.horaI ?? r.HoraI ?? r.horai ?? "";
  const horaFraw = r.horaF ?? r.HoraF ?? r.horaf ?? "";
  const cliente  = r.nomCliente ?? r.nombreCliente ?? r.NombreCliente ?? r.cliente ?? "";
  const tel      = r.telefono ?? r.Telefono ?? "";
  const cant     = r.cantidadPersonas ?? r.CantidadPersonas ?? r.personas ?? 1;
  const idTipo   = r.idTipoReserva ?? r.IdTipoReserva ?? null;
  const coment   = r.comentario ?? r.Comentario ?? "";
  const mesas    = Array.isArray(r.mesas) ? r.mesas.map(Number) : (r.idMesa != null ? [Number(r.idMesa)] : []);

  let start12 = from24(String(horaIraw));
  let end12   = from24(String(horaFraw));

  return {
    id,
    clientName: cliente,
    clientPhone: tel,
    date: String(fReserva || ""),
    timeStart: start12.time || String(horaIraw||""),
    startAmPm: start12.ampm || "AM",
    timeEnd: end12.time || String(horaFraw||""),
    endAmPm: end12.ampm || "AM",
    people: Number(cant) || 1,
    eventId: idTipo,
    event: idTipo != null ? (tipoReservaMap.get(Number(idTipo)) || "") : "",
    comment: String(coment || ""),
    tables: mesas,
    status: r.estado ?? "Pendiente",
    total: r.total ?? 0,
  };
}

function uiToApiPayload(){
  const horaI24 = to24(normalizeTimeForSave(timeStartInput.value), startAmPmSelect.value);
  const horaF24 = to24(normalizeTimeForSave(timeEndInput.value),   endAmPmSelect.value);

  const telefonoRaw = clientPhoneInput?.value.trim() || "";
  const telefonoDigitos = telefonoRaw.replace(/\D/g, "");
  
  if (telefonoDigitos.length !== 8) {
    throw new Error(`El teléfono debe tener 8 dígitos (tiene ${telefonoDigitos.length})`);
  }
  
  const telefonoFormateado = `${telefonoDigitos.slice(0, 4)}-${telefonoDigitos.slice(4)}`;

  return {
    nomCliente: clientNameInput?.value.trim(),
    telefono: telefonoFormateado,
    fReserva: dateInput?.value,
    freserva: dateInput?.value,
    horaI: horaI24,
    horaF: horaF24,
    cantidadPersonas: parseInt(peopleInput?.value || "1", 10),
    idTipoReserva: eventSelect?.value ? Number(eventSelect.value) : null,
    idMesa: mesaSeleccionada ? Number(mesaSeleccionada) : null, // CAMBIO: solo 1 mesa
    mesas: mesaSeleccionada ? [Number(mesaSeleccionada)] : [], // CAMBIO: array con 1 mesa
    comentario: commentInput?.value.trim() || "",
    idEstadoReserva: 1,
  };
}

/* ======================= render lista ======================= */
let reservationsList  = $("#reservations-list", reservationsSection);
let reservationsEmpty = $("#reservations-empty", reservationsSection);

if (!reservationsList) {
  reservationsList = document.createElement("div");
  reservationsList.id = "reservations-list";
  reservationsList.className = "col-span-full grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4";
  reservationsSection?.appendChild(reservationsList);
}

if (!reservationsEmpty) {
  reservationsEmpty = document.createElement("div");
  reservationsEmpty.id = "reservations-empty";
  reservationsEmpty.className = "col-span-full text-gray-500 text-center py-8";
  reservationsEmpty.textContent = `Aún no hay reservas. Crea la primera con el botón "Nueva reserva".`;
  reservationsSection?.insertBefore(reservationsEmpty, reservationsList);
}

function statusBadge(s){
  s=String(s||"").toLowerCase();
  if(s.includes("prep"))return{cls:"badge--prep",txt:"En preparación"};
  if(s.includes("paga"))return{cls:"badge--paid",txt:"Pagado"};
  if(s.includes("entreg"))return{cls:"badge--deliv",txt:"Entregado"};
  return{cls:"badge--pending",txt:"Pendiente"};
}

function renderReservations(list){
  reservationsList.innerHTML = "";
  if (!Array.isArray(list) || list.length === 0) {
    reservationsEmpty.classList.remove("hidden");
    return;
  }
  reservationsEmpty.classList.add("hidden");

  list.forEach((r)=>{
    const badge=statusBadge(r.status);
    const eventName = r.event || (r.eventId!=null? (tipoReservaMap.get(Number(r.eventId))||"—") : (r.event||"—"));

    // CAMBIO: Mostrar nombre de mesa con capacidad
    let tablesDisplay = "—";
    if (r.tables && r.tables.length > 0) {
      const mesaId = r.tables[0];
      const mesa = mesasCache.find(m => Number(m.id ?? m.idMesa) === Number(mesaId));
      
      if (mesa) {
        const nombreMesa = mesa.nomMesa ?? mesa.nombre ?? `Mesa ${mesaId}`;
        const idTipoMesa = mesa.idTipoMesa ?? mesa.tipoMesa;
        const tipoMesa = tiposMesaMap.get(Number(idTipoMesa));
        const cap = tipoMesa?.capacidadPersonas ?? 0;
        
        tablesDisplay = cap > 0 
          ? `${nombreMesa} (${cap} ${cap === 1 ? 'persona' : 'personas'})`
          : nombreMesa;
      } else {
        tablesDisplay = `Mesa ${mesaId}`;
      }
    }

    const card=document.createElement("div");
    card.className="bg-white rounded-lg shadow-sm border-t-4 border-t-gray-400 p-4 hover:shadow-md transition fadeSlideIn";
    card.dataset.reservaId = r.id; // CAMBIO: ID único para colapsar

    const commentSection = r.comment ?
      `<div class="text-sm text-gray-600 italic mt-2 pt-2 border-t border-gray-100">"${esc(r.comment)}"</div>` : '';

    card.innerHTML=`
      <div class="flex items-start justify-between mb-3">
        <div class="flex-1">
          <div class="text-xs text-gray-500">Cliente</div>
          <div class="text-lg font-semibold text-gray-900 truncate">${esc(r.clientName||"—")}</div>
        </div>
        <div class="flex items-center gap-2">
          <span class="inline-flex items-center gap-1 text-xs text-gray-500">
            <span class="w-2 h-2 rounded-full ${badge.cls === 'badge--pending' ? 'bg-gray-400' : badge.cls === 'badge--prep' ? 'bg-orange-400' : badge.cls === 'badge--paid' ? 'bg-green-400' : 'bg-blue-400'}"></span>
            ${esc(badge.txt)}
          </span>
          <button class="text-gray-400 hover:text-gray-600 js-menu" type="button">
            <span class="text-sm flex items-center gap-1">
              Detalle 
              <i class="fas fa-chevron-down js-chevron transition-transform"></i>
            </span>
          </button>
        </div>
      </div>

      <div class="space-y-1 text-sm text-gray-600 mb-3">
        <div class="flex items-start gap-2">
          <span class="font-medium text-gray-700 min-w-[60px]">Mesa:</span>
          <span class="font-medium text-gray-900">${esc(tablesDisplay)}</span>
        </div>
        <div class="flex items-start gap-2">
          <span class="font-medium text-gray-700 min-w-[60px]">Fecha:</span>
          <span class="text-gray-900">${formatDateLabel(r.date)}</span>
        </div>
        <div class="flex items-start gap-2">
          <span class="font-medium text-gray-700 min-w-[60px]">Evento:</span>
          <span class="text-gray-900">${esc(eventName)}</span>
        </div>
      </div>

      <div class="text-sm text-gray-600 space-y-1">
        <div class="flex items-start gap-2">
          <span class="font-medium text-gray-700 min-w-[60px]">Personas:</span>
          <span class="text-gray-900">${esc(r.people)}</span>
        </div>
        <div class="flex items-start gap-2">
          <span class="font-medium text-gray-700 min-w-[60px]">Horario:</span>
          <span class="text-gray-900">${hourLabel(r.timeStart,r.startAmPm)} – ${hourLabel(r.timeEnd,r.endAmPm)}</span>
        </div>
        <div class="flex items-start gap-2">
          <span class="font-medium text-gray-700 min-w-[60px]">Teléfono:</span>
          <span class="text-gray-900">${esc(r.clientPhone||"—")}</span>
        </div>
      </div>

      ${commentSection}

      <div class="hidden js-actions mt-3 pt-3 border-t flex gap-2">
        <button class="flex-1 text-sm text-blue-600 hover:bg-blue-50 py-2 rounded transition js-edit" type="button">
          <i class="fas fa-edit mr-1"></i>Editar
        </button>
        <button class="flex-1 text-sm text-red-600 hover:bg-red-50 py-2 rounded transition js-del" type="button">
          <i class="fas fa-trash mr-1"></i>Eliminar
        </button>
      </div>`;

    const menuBtn = card.querySelector(".js-menu");
    const actionsDiv = card.querySelector(".js-actions");
    const chevron = card.querySelector(".js-chevron");

    // CAMBIO: Solo expandir la tarjeta clickeada, colapsar las demás
    menuBtn?.addEventListener("click", () => {
      const wasHidden = actionsDiv?.classList.contains("hidden");
      
      // Colapsar todas las tarjetas
      document.querySelectorAll(".js-actions").forEach(a => a.classList.add("hidden"));
      document.querySelectorAll(".js-chevron").forEach(ch => ch.classList.remove("rotate-180"));
      
      // Expandir solo esta si estaba colapsada
      if (wasHidden) {
        actionsDiv?.classList.remove("hidden");
        chevron?.classList.add("rotate-180");
      }
    });

    card.querySelector(".js-edit").addEventListener("click",()=>startEditing(r));
    card.querySelector(".js-del").addEventListener("click", async ()=>{
      if(!confirm("¿Estás seguro de eliminar esta reserva? Esta acción no se puede deshacer.")) return;
      try {
        showLoader("Eliminando reserva…");
        await deleteReserva(r.id);
        await loadFromAPI();
        hideLoader();
      } catch(err) {
        hideLoader();
        alert(`Error al eliminar: ${err.message}`);
      }
    });

    reservationsList.appendChild(card);
  });
}

/* ======================= cargar ======================= */
let mesasCache = []; // CAMBIO: Cache global de mesas

async function loadFromAPI(){
  showLoader("Cargando reservas…");
  try {
    const apiList = await getReserva();
    const uiList  = (Array.isArray(apiList)?apiList:[]).map(apiToUI);
    reservasCache = uiList;
    renderReservations(uiList);
  } catch(e) {
    console.error("Error listando reservas:", e);
    reservationsList.innerHTML = `<div class="col-span-full text-red-600 text-sm p-4 bg-red-50 rounded-lg">
      <i class="fas fa-exclamation-triangle mr-2"></i>
      No se pudieron cargar las reservas: ${esc(e.message)}
    </div>`;
  } finally {
    hideLoader();
  }
}

/* ======================= nueva/editar ======================= */
function openForm(){
  const modal = reservationForm;
  if (!modal) return;

  modal.classList.remove("hidden");
  document.body.style.overflow = 'hidden';

  const overlay = modal.querySelector('[data-form-overlay="true"]');
  if (overlay) {
    overlay.onclick = () => {
      clearForm();
      closeForm();
    };
  }
}

function closeForm(){
  const modal = reservationForm;
  if (!modal) return;

  modal.classList.add("hidden");
  document.body.style.overflow = '';
}

function clearForm(){
  editingId=null;
  clientNameInput.value="";
  clientPhoneInput.value="";
  dateInput.value="";
  timeStartInput.value="";
  timeEndInput.value="";
  startAmPmSelect.value="AM";
  endAmPmSelect.value="AM";
  peopleInput.value="";
  eventSelect.value="";
  commentInput.value="";
  mesaSeleccionada=null; // CAMBIO: limpiar mesa
  selectedTablesText.textContent="Ninguna mesa seleccionada.";

  [clientError, phoneError, dateError, timeStartError, timeEndError, peopleError, eventError, tablesError]
    .forEach(e=>hideError(e));

  [clientNameInput, clientPhoneInput, dateInput, timeStartInput, timeEndInput, peopleInput, eventSelect]
    .forEach(inp=>resetFieldValidation(inp));

  setFormModeCreate();
}

function startEditing(r){
  editingId=r.id??null;
  clientNameInput.value=r.clientName||"";

  const phoneDigits = (r.clientPhone||"").replace(/\D/g,"");
  if (phoneDigits.length === 8) {
    clientPhoneInput.value = phoneDigits.slice(0,4) + "-" + phoneDigits.slice(4);
  } else {
    clientPhoneInput.value = r.clientPhone||"";
  }

  dateInput.value=r.date||"";
  timeStartInput.value=r.timeStart||"";
  timeEndInput.value=r.timeEnd||"";
  startAmPmSelect.value=r.startAmPm||"AM";
  endAmPmSelect.value=r.endAmPm||"AM";
  peopleInput.value=String(r.people||"");
  eventSelect.value = r.eventId != null ? String(r.eventId) : "";
  commentInput.value=r.comment||"";
  
  // CAMBIO: solo primera mesa
  mesaSeleccionada = (Array.isArray(r.tables) && r.tables.length > 0) ? r.tables[0] : null;

  if (mesaSeleccionada) {
    const mesa = mesasCache.find(m => Number(m.id ?? m.idMesa) === Number(mesaSeleccionada));
    if (mesa) {
      const nombreMesa = mesa.nomMesa ?? mesa.nombre ?? `Mesa ${mesaSeleccionada}`;
      const idTipoMesa = mesa.idTipoMesa ?? mesa.tipoMesa;
      const tipoMesa = tiposMesaMap.get(Number(idTipoMesa));
      const cap = tipoMesa?.capacidadPersonas ?? 0;
      
      selectedTablesText.textContent = cap > 0
        ? `${nombreMesa} (Capacidad: ${cap} ${cap === 1 ? 'persona' : 'personas'})`
        : nombreMesa;
    } else {
      selectedTablesText.textContent = `Mesa ${mesaSeleccionada}`;
    }
  } else {
    selectedTablesText.textContent = "Ninguna mesa seleccionada.";
  }

  setFormModeEdit(r.clientName||r.client||"");
  openForm();
}

/* ======================= validación + guardar ======================= */
function validateForm(){
  let ok=true;

  const clientName = clientNameInput.value.trim();
  if (clientName === "") {
    showError(clientError, "El nombre del cliente es obligatorio.");
    markFieldInvalid(clientNameInput);
    ok = false;
  } else if (clientName.length < 3) {
    showError(clientError, "El nombre debe tener al menos 3 caracteres.");
    markFieldInvalid(clientNameInput);
    ok = false;
  } else if (clientName.length > 100) {
    showError(clientError, "El nombre no puede exceder 100 caracteres.");
    markFieldInvalid(clientNameInput);
    ok = false;
  } else if (!/^[a-zA-ZáéíóúÁÉÍÓÚñÑ\s]+$/.test(clientName)) {
    showError(clientError, "El nombre solo puede contener letras y espacios.");
    markFieldInvalid(clientNameInput);
    ok = false;
  } else {
    hideError(clientError);
    markFieldValid(clientNameInput);
  }

  const phoneValue = clientPhoneInput.value.trim();
  const phoneDigits = phoneValue.replace(/\D/g,"");

  if (phoneValue === "") {
    showError(phoneError, "El teléfono es obligatorio.");
    markFieldInvalid(clientPhoneInput);
    ok = false;
  } else if (phoneDigits.length !== 8) {
    showError(phoneError, `Teléfono inválido. Se requieren 8 dígitos (tienes ${phoneDigits.length}).`);
    markFieldInvalid(clientPhoneInput);
    ok = false;
  } else if (!/^[267]/.test(phoneDigits)) {
    showError(phoneError, "El teléfono debe iniciar con 2, 6 o 7.");
    markFieldInvalid(clientPhoneInput);
    ok = false;
  } else if (!/^\d{4}-\d{4}$/.test(phoneValue)) {
    showError(phoneError, "Formato inválido. Use: 0000-0000");
    markFieldInvalid(clientPhoneInput);
    ok = false;
  } else {
    hideError(phoneError);
    markFieldValid(clientPhoneInput);
  }

  if (dateInput.value === "") {
    showError(dateError, "Seleccione una fecha para la reserva.");
    markFieldInvalid(dateInput);
    ok = false;
  } else {
    const selectedDate = new Date(dateInput.value + "T00:00:00");
    const today = new Date();
    today.setHours(0, 0, 0, 0);

    const twoDaysFromNow = new Date(today);
    twoDaysFromNow.setDate(today.getDate() + 2);

    if (selectedDate < twoDaysFromNow) {
      const daysUntilSelected = Math.ceil((selectedDate - today) / (1000 * 60 * 60 * 24));
      showError(dateError, `Las reservas deben hacerse con al menos 2 días de anticipación. Fecha seleccionada: ${daysUntilSelected} día(s) de anticipación.`);
      markFieldInvalid(dateInput);
      ok = false;
    } else {
      hideError(dateError);
      markFieldValid(dateInput);
    }
  }

  timeStartInput.value = normalizeTimeForSave(timeStartInput.value);
  timeEndInput.value = normalizeTimeForSave(timeEndInput.value);

  const startMinutes = toMinutesFrom12(timeStartInput.value, startAmPmSelect.value);
  const endMinutes = toMinutesFrom12(timeEndInput.value, endAmPmSelect.value);

  if (timeStartInput.value === "") {
    showError(timeStartError, "Ingrese la hora de inicio (formato: 8:00 o 8)");
    markFieldInvalid(timeStartInput);
    ok = false;
  } else if (!Number.isFinite(startMinutes)) {
    showError(timeStartError, "Formato de hora inválido. Use formato 12h (ej: 8:30, máximo 12:59)");
    markFieldInvalid(timeStartInput);
    ok = false;
  } else {
    const parsed = parseTime12(timeStartInput.value);
    if (parsed && (parsed.h > 12 || parsed.m > 59)) {
      showError(timeStartError, "Hora inválida. Máximo: 12:59");
      markFieldInvalid(timeStartInput);
      ok = false;
    } else {
      hideError(timeStartError);
      markFieldValid(timeStartInput);
    }
  }

  if (timeEndInput.value === "") {
    showError(timeEndError, "Ingrese la hora de fin (formato: 10:00 o 10)");
    markFieldInvalid(timeEndInput);
    ok = false;
  } else if (!Number.isFinite(endMinutes)) {
    showError(timeEndError, "Formato de hora inválido. Use formato 12h (ej: 10:30, máximo 12:59)");
    markFieldInvalid(timeEndInput);
    ok = false;
  } else {
    const parsed = parseTime12(timeEndInput.value);
    if (parsed && (parsed.h > 12 || parsed.m > 59)) {
      showError(timeEndError, "Hora inválida. Máximo: 12:59");
      markFieldInvalid(timeEndInput);
      ok = false;
    } else {
      hideError(timeEndError);
      markFieldValid(timeEndInput);

      const startMinutes = toMinutesFrom12(timeStartInput.value, startAmPmSelect.value);
      if (Number.isFinite(startMinutes)) {
        const duration = endMinutes - startMinutes;
        if (endMinutes <= startMinutes) {
          showError(timeEndError, "La hora de fin debe ser posterior a la de inicio.");
          markFieldInvalid(timeEndInput);
          ok = false;
        } else if (duration < 30) {
          showError(timeEndError, `Mínimo 30 minutos (actual: ${duration} min).`);
          markFieldInvalid(timeEndInput);
          ok = false;
        } else if (duration > 480) {
          showError(timeEndError, `Máximo 8 horas (actual: ${Math.floor(duration/60)}h ${duration%60}min).`);
          markFieldInvalid(timeEndInput);
          ok = false;
        }
      }
    }
  }

  const people = parseInt(peopleInput.value || "0", 10);
  if (peopleInput.value === "" || !Number.isFinite(people)) {
    showError(peopleError, "Ingrese la cantidad de personas.");
    markFieldInvalid(peopleInput);
    ok = false;
  } else if (people <= 0) {
    showError(peopleError, "Debe haber al menos 1 persona.");
    markFieldInvalid(peopleInput);
    ok = false;
  } else if (people > 200) {
    showError(peopleError, "Máximo 200 personas por reserva.");
    markFieldInvalid(peopleInput);
    ok = false;
  } else {
    hideError(peopleError);
    markFieldValid(peopleInput);
  }

  if (!eventSelect.value || !Number(eventSelect.value)) {
    showError(eventError, "Seleccione el tipo de evento.");
    markFieldInvalid(eventSelect);
    ok = false;
  } else {
    hideError(eventError);
    markFieldValid(eventSelect);
  }

  // CAMBIO: validar que hay 1 mesa seleccionada
  if (!mesaSeleccionada) {
    showError(tablesError, "Debe seleccionar una mesa para la reserva.");
    ok = false;
  } else {
    hideError(tablesError);
    
    // NUEVO: Validar capacidad de la mesa
    const mesa = mesasCache.find(m => Number(m.id ?? m.idMesa) === Number(mesaSeleccionada));
    if (mesa) {
      const idTipoMesa = mesa.idTipoMesa ?? mesa.tipoMesa;
      const tipoMesa = tiposMesaMap.get(Number(idTipoMesa));
      const capacidadMesa = tipoMesa?.capacidadPersonas ?? 0;
      
      if (capacidadMesa > 0 && people > capacidadMesa) {
        const nombreMesa = mesa.nomMesa ?? mesa.nombre ?? `Mesa ${mesaSeleccionada}`;
        showError(peopleError, `La ${nombreMesa} tiene capacidad para ${capacidadMesa} ${capacidadMesa === 1 ? 'persona' : 'personas'}. Ingresaste ${people}.`);
        markFieldInvalid(peopleInput);
        ok = false;
      }
    }
  }

  return ok;
}

async function handleSave(){
  if(!validateForm()) {
    const firstError = reservationForm.querySelector('.text-red-600:not(.hidden)');
    firstError?.scrollIntoView({ behavior: 'smooth', block: 'center' });
    return;
  }

  const payload=uiToApiPayload();
  console.log("[handleSave] payload:", payload);

  saveReservationBtn.disabled = true;
  saveReservationBtn.innerHTML = '<i class="fas fa-spinner fa-spin mr-2"></i>Guardando...';

  try{
    showLoader(editingId != null ? "Actualizando reserva…" : "Guardando reserva…");
    
    if(editingId!=null) {
      await updateReserva(editingId,payload);
    } else {
      await createReserva(payload);
    }
    
    hideLoader();
    await loadFromAPI();
    clearForm();
    closeForm();
  }catch(err){
    hideLoader();
    console.error("[Guardar] Error:",err);
    alert(`❌ Error al guardar la reserva:\n\n${err.message}`);
  } finally {
    saveReservationBtn.disabled = false;
    saveReservationBtn.innerHTML = '<i class="fas fa-save mr-2"></i>' +
      (editingId ? 'Actualizar Reserva' : 'Guardar Reserva');
  }
}

/* ======================= Modal Mesas - SELECCIÓN ÚNICA (RADIO) ======================= */

let mesasPollInterval = null;

function mesaBtnHTML(m, selected, fecha, horaInicio, horaFin){
  const id  = m.id ?? m.idMesa ?? m.Id ?? m.IdMesa;
  const nro = m.nomMesa ?? m.nombre ?? `Mesa ${id}`;

  const idTipoMesa = m.idTipoMesa ?? m.tipoMesa ?? m.IdTipoMesa;
  const tipoMesa = tiposMesaMap.get(Number(idTipoMesa));
  const cap = tipoMesa?.capacidadPersonas ?? 0;

  const isReservada = esMesaReservada(id, fecha, horaInicio, horaFin, editingId);

  // CAMBIO: Radio button en lugar de checkbox
  return `
    <label class="border rounded-lg py-3 px-3 text-sm flex flex-col items-center justify-center gap-1 transition-all cursor-pointer ${
        isReservada
          ? 'bg-red-50 border-red-300 text-red-600 cursor-not-allowed opacity-60'
          : selected
            ? 'mesa-btn-selected bg-blue-50 border-blue-500'
            : 'hover:bg-blue-50 hover:border-blue-400'
      }"
      ${isReservada ? '' : `for="mesa-radio-${id}"`}>
      <input type="radio" 
             name="mesa-selection" 
             id="mesa-radio-${id}"
             value="${id}"
             data-nro="${esc(nro)}"
             data-capacidad="${cap}"
             class="hidden mesa-radio"
             ${isReservada ? 'disabled' : ''}
             ${selected ? 'checked' : ''}>
      <div class="flex items-center gap-2 w-full justify-between">
        <span class="font-semibold text-base">${esc(nro)}</span>
        <i class="fa-solid fa-circle-dot text-blue-600 ${selected ? '' : 'opacity-0'}"></i>
      </div>
      <div class="flex items-center gap-1 text-xs ${isReservada ? 'text-red-500' : 'text-gray-600'}">
        <i class="fa-solid fa-user"></i>
        <span>${cap} ${cap === 1 ? 'persona' : 'personas'}</span>
      </div>
      ${isReservada ? '<span class="text-xs text-red-600 font-medium">Reservada</span>' : ''}
    </label>`;
}

function renderMesasGrid(tablesGrid, tempSelected, fecha, horaInicio, horaFin) {
  if (!tablesGrid) return;

  if (!Array.isArray(mesasCache) || mesasCache.length === 0) {
    tablesGrid.innerHTML = `
      <div class="col-span-3 text-center py-8 text-gray-500">
        <i class="fas fa-chair text-3xl mb-2 opacity-30"></i>
        <p>No hay mesas disponibles</p>
      </div>`;
    return;
  }

  const mesasOrdenadas = [...mesasCache].sort((a, b) => {
    const numA = a.id ?? a.idMesa ?? 0;
    const numB = b.id ?? b.idMesa ?? 0;
    return numA - numB;
  });

  tablesGrid.innerHTML = mesasOrdenadas.map(m => {
    const mesaId = Number(m.id ?? m.idMesa ?? m.Id ?? m.IdMesa);
    const isSel = tempSelected === mesaId; // CAMBIO: comparación directa
    return mesaBtnHTML(m, isSel, fecha, horaInicio, horaFin);
  }).join("");
}

async function loadMesasFromAPI() {
  try {
    const list = await getMesas();
    console.log("[Mesas] Respuesta API:", list);

    if (Array.isArray(list) && list.length > 0) {
      mesasCache = list;
      console.log(`[Mesas] ${mesasCache.length} mesas cargadas en cache`);
      return true;
    }

    console.warn("[Mesas] Respuesta vacía de la API");
    return false;
  } catch(err) {
    console.error("Error cargando mesas:", err);
    return false;
  }
}

async function openTablesModal() {
  const modal = $("#tables-modal");
  const overlay   = modal.querySelector('[data-overlay="true"]');
  const closeBtn  = modal.querySelector("#close-tables-modal");
  const cancelBtn = modal.querySelector("#cancel-tables-btn");
  const saveBtn   = modal.querySelector("#save-tables-btn");
  const tablesGrid= modal.querySelector("#tables-grid");
  const refreshBtn = modal.querySelector("#refresh-tables-btn");
  const mesasInfo  = modal.querySelector("#mesas-info");
  const dateWarning = modal.querySelector("#date-warning");

  const fecha = dateInput.value;

  hideInlineDateWarning();
  if (!fecha) {
    showInlineDateWarning("Debe seleccionar la fecha para ver la disponibilidad de mesas.");
    document.getElementById('inline-date-warning')?.scrollIntoView({ behavior: 'smooth', block: 'center' });
    return;
  }

  const horaInicio = to24(normalizeTimeForSave(timeStartInput.value), startAmPmSelect.value);
  const horaFin    = to24(normalizeTimeForSave(timeEndInput.value),   endAmPmSelect.value);

  if (dateWarning) {
    const fechaFormateada = formatDateLabel(fecha);
    if (horaInicio && horaFin) {
      const hI = from24(horaInicio);
      const hF = from24(horaFin);
      dateWarning.innerHTML = `
        <i class="fas fa-calendar-check mr-2"></i>
        Mostrando disponibilidad para: <strong>${fechaFormateada}</strong>
        de <strong>${hourLabel(hI.time, hI.ampm)}</strong>
        a <strong>${hourLabel(hF.time, hF.ampm)}</strong>
      `;
    } else {
      dateWarning.innerHTML = `
        <i class="fas fa-calendar-check mr-2"></i>
        Mostrando disponibilidad para: <strong>${fechaFormateada}</strong>
      `;
    }
  }

  tablesGrid.innerHTML = `
    <div class="col-span-3 text-center py-8">
      <i class="fas fa-spinner fa-spin text-3xl text-blue-500 mb-2"></i>
      <p class="text-gray-600">Verificando disponibilidad de mesas...</p>
    </div>`;

  modal.classList.remove("hidden");

  showLoader("Cargando mesas…");
  const loaded = await loadMesasFromAPI();
  hideLoader();

  if (!loaded || mesasCache.length === 0) {
    tablesGrid.innerHTML = `
      <div class="col-span-3 text-center py-8">
        <i class="fas fa-exclamation-triangle text-3xl text-yellow-500 mb-3"></i>
        <p class="text-gray-700 font-semibold mb-2">No hay mesas registradas</p>
        <p class="text-sm text-gray-600 mb-4">El sistema no encontró mesas disponibles en la base de datos.</p>
        <div class="space-y-2">
          <button class="px-4 py-2 bg-blue-500 text-white rounded-lg hover:bg-blue-600 transition"
                  onclick="location.href='tables.html'">
            <i class="fas fa-plus mr-2"></i>Registrar Mesas
          </button>
        </div>
      </div>`;
    return;
  }

  let tempSelected = mesaSeleccionada; // CAMBIO: número único, no array

  renderMesasGrid(tablesGrid, tempSelected, fecha, horaInicio, horaFin);
  updateMesasInfo();

  function updateMesasInfo() {
    if (!mesasInfo) return;

    if (!tempSelected) {
      mesasInfo.innerHTML = '<p class="text-sm text-gray-500">Selecciona una mesa</p>';
      return;
    }

    const mesa = mesasCache.find(m => Number(m.id ?? m.idMesa) === tempSelected);
    if (!mesa) {
      mesasInfo.innerHTML = `
        <div class="flex items-center gap-2 text-sm text-blue-600">
          <i class="fas fa-chair"></i>
          <span><strong>Mesa ${tempSelected}</strong> seleccionada</span>
        </div>`;
      return;
    }

    const nombreMesa = mesa.nomMesa ?? mesa.nombre ?? `Mesa ${tempSelected}`;
    const idTipoMesa = mesa.idTipoMesa ?? mesa.tipoMesa;
    const tipoMesa = tiposMesaMap.get(Number(idTipoMesa));
    const cap = tipoMesa?.capacidadPersonas ?? 0;

    mesasInfo.innerHTML = `
      <div class="flex items-center gap-2 text-sm text-blue-600">
        <i class="fas fa-chair"></i>
        <span><strong>${nombreMesa}</strong> seleccionada • Capacidad: <strong>${cap}</strong> ${cap === 1 ? 'persona' : 'personas'}</span>
      </div>`;
  }

  // CAMBIO: Escuchar cambios en radio buttons
  tablesGrid.addEventListener("change", (ev) => {
    if (ev.target.classList.contains("mesa-radio")) {
      tempSelected = Number(ev.target.value);
      updateMesasInfo();
    }
  });

  refreshBtn?.addEventListener("click", async () => {
    refreshBtn.disabled = true;
    refreshBtn.innerHTML = '<i class="fas fa-spinner fa-spin"></i>';

    showLoader("Actualizando disponibilidad…");
    await loadFromAPI();
    await loadMesasFromAPI();
    renderMesasGrid(tablesGrid, tempSelected, fecha, horaInicio, horaFin);
    updateMesasInfo();
    hideLoader();

    refreshBtn.disabled = false;
    refreshBtn.innerHTML = '<i class="fas fa-sync-alt"></i>';
  }, { once: false });

  mesasPollInterval = setInterval(async () => {
    await loadFromAPI();
    await loadMesasFromAPI();
    renderMesasGrid(tablesGrid, tempSelected, fecha, horaInicio, horaFin);
    updateMesasInfo();
  }, 5000);

  const close = () => {
    if (mesasPollInterval) {
      clearInterval(mesasPollInterval);
      mesasPollInterval = null;
    }
    modal.classList.add("hidden");
  };

  overlay?.addEventListener("click", close, { once: true });
  closeBtn?.addEventListener("click", close, { once: true });
  cancelBtn?.addEventListener("click", close, { once: true });

  saveBtn?.addEventListener("click", () => {
    if (!tempSelected) {
      alert("⚠️ Debes seleccionar una mesa");
      return;
    }

    mesaSeleccionada = tempSelected;

    const mesa = mesasCache.find(m => Number(m.id ?? m.idMesa) === mesaSeleccionada);
    
    if (mesa) {
      const nombreMesa = mesa.nomMesa ?? mesa.nombre ?? `Mesa ${mesaSeleccionada}`;
      const idTipoMesa = mesa.idTipoMesa ?? mesa.tipoMesa;
      const tipoMesa = tiposMesaMap.get(Number(idTipoMesa));
      const cap = tipoMesa?.capacidadPersonas ?? 0;
      
      selectedTablesText.textContent = cap > 0
        ? `${nombreMesa} (Capacidad: ${cap} ${cap === 1 ? 'persona' : 'personas'})`
        : nombreMesa;
      
      // NUEVO: Actualizar placeholder y max del input de personas
      if (cap > 0) {
        peopleInput.setAttribute('max', cap);
        peopleInput.setAttribute('placeholder', `Máximo ${cap} ${cap === 1 ? 'persona' : 'personas'}`);
        
        // Si ya hay un valor y excede la capacidad, mostrar warning
        const currentPeople = parseInt(peopleInput.value || "0", 10);
        if (currentPeople > cap) {
          showError(peopleError, `La ${nombreMesa} solo tiene capacidad para ${cap} ${cap === 1 ? 'persona' : 'personas'}.`);
          markFieldInvalid(peopleInput);
        }
      }
    } else {
      selectedTablesText.textContent = `Mesa ${mesaSeleccionada}`;
      peopleInput.setAttribute('max', '200');
      peopleInput.setAttribute('placeholder', '2');
    }

    hideError(tablesError);
    close();
  }, { once: true });
}

/* ======================= tipos de evento ======================= */
async function loadTiposEvento(){
  if (!eventSelect) return;

  try {
    const tipos = await getTiposReserva();

    if (Array.isArray(tipos) && tipos.length) {
      tipoReservaMap.clear();

      eventSelect.innerHTML = `<option value="">Seleccione...</option>` +
        tipos.map(t=>{
          const id  = t.id ?? t.Id ?? t.idTipoReserva ?? t.IdTipoReserva;
          const nom = t.nomTipo ?? t.NomTipo ?? t.nombre ?? t.tipo ?? "—";
          if (id != null) tipoReservaMap.set(Number(id), String(nom));
          return `<option value="${esc(id)}">${esc(nom)}</option>`;
        }).join("");
      return;
    }
    throw new Error("Respuesta vacía");
  } catch (e) {
    console.warn("No se pudieron cargar los tipos de evento:", e?.message || e);
    eventSelect.innerHTML = `<option value="">(no disponible)</option>`;
  }
}

/* ======================= tipos de mesa ======================= */
async function loadTiposMesa(){
  console.log("[Controller] Cargando tipos de mesa...");

  try {
    const tipos = await getTiposMesa();

    if (Array.isArray(tipos) && tipos.length > 0) {
      tiposMesaMap.clear();

      tipos.forEach(tipo => {
        const id = tipo.id ?? tipo.Id;
        if (id != null) {
          tiposMesaMap.set(Number(id), {
            nombre: tipo.nombre ?? tipo.Nombre ?? "Sin nombre",
            capacidadPersonas: tipo.capacidadPersonas ?? tipo.CapacidadPersonas ?? 0
          });
        }
      });

      console.log(`[Controller] ${tiposMesaMap.size} tipos de mesa cargados`);
      return true;
    }

    console.warn("[Controller] No hay tipos de mesa disponibles");
    return false;

  } catch (e) {
    console.error("[Controller] Error cargando tipos de mesa:", e);
    return false;
  }
}

/* ======================= validación en tiempo real ======================= */
function setupRealtimeValidation() {
  clientNameInput?.addEventListener("input", (e) => {
    let value = e.target.value;
    const filtered = value.replace(/[^a-zA-ZáéíóúÁÉÍÓÚñÑ\s]/g, "");
    if (value !== filtered) {
      e.target.value = filtered;
    }
  });

  clientNameInput?.addEventListener("blur", () => {
    const clientName = clientNameInput.value.trim();
    if (clientName === "") {
      showError(clientError, "El nombre del cliente es obligatorio.");
      markFieldInvalid(clientNameInput);
    } else if (clientName.length < 3) {
      showError(clientError, "El nombre debe tener al menos 3 caracteres.");
      markFieldInvalid(clientNameInput);
    } else if (clientName.length > 100) {
      showError(clientError, "El nombre no puede exceder 100 caracteres.");
      markFieldInvalid(clientNameInput);
    } else if (!/^[a-zA-ZáéíóúÁÉÍÓÚñÑ\s]+$/.test(clientName)) {
      showError(clientError, "El nombre solo puede contener letras y espacios.");
      markFieldInvalid(clientNameInput);
    } else {
      hideError(clientError);
      markFieldValid(clientNameInput);
    }
  });

  clientPhoneInput?.addEventListener("input", (e) => {
    let v = e.target.value.replace(/[^0-9]/g,"").slice(0,8);
    if (v.length > 4) {
      e.target.value = v.slice(0,4) + "-" + v.slice(4);
    } else {
      e.target.value = v;
    }
  });

  clientPhoneInput?.addEventListener("blur", () => {
    const phoneValue = clientPhoneInput.value.trim();
    const phoneDigits = phoneValue.replace(/\D/g,"");

    if (phoneValue === "") {
      showError(phoneError, "El teléfono es obligatorio.");
      markFieldInvalid(clientPhoneInput);
    } else if (phoneDigits.length !== 8) {
      showError(phoneError, `Teléfono inválido. Se requieren 8 dígitos (tienes ${phoneDigits.length}).`);
      markFieldInvalid(clientPhoneInput);
    } else if (!/^\d{4}-\d{4}$/.test(phoneValue)) {
      showError(phoneError, "Formato inválido. Use: 0000-0000");
      markFieldInvalid(clientPhoneInput);
    } else {
      hideError(phoneError);
      markFieldValid(clientPhoneInput);
    }
  });

  const twoDaysFromNow = new Date();
  twoDaysFromNow.setDate(twoDaysFromNow.getDate() + 2);
  dateInput.min = twoDaysFromNow.toISOString().split('T')[0];

  dateInput?.addEventListener("change", () => {
    if (dateInput.value === "") {
      showError(dateError, "Seleccione una fecha para la reserva.");
      markFieldInvalid(dateInput);
    } else {
      const selectedDate = new Date(dateInput.value + "T00:00:00");
      const today = new Date();
      today.setHours(0, 0, 0, 0);

      const twoDaysFromNow = new Date(today);
      twoDaysFromNow.setDate(today.getDate() + 2);

      if (selectedDate < twoDaysFromNow) {
        constdaysUntilSelected = Math.ceil((selectedDate - today) / (1000 * 60 * 60 * 24));
        showError(dateError, `Las reservas deben hacerse con al menos 2 días de anticipación. Fecha seleccionada: ${daysUntilSelected} día(s) de anticipación.`);
        markFieldInvalid(dateInput);
      } else {
        hideError(dateError);
        markFieldValid(dateInput);
        hideInlineDateWarning();
      }
    }
  });

  timeStartInput?.addEventListener("input", (e) => {
    let value = e.target.value.replace(/[^0-9]/g, "");

    if (value.length === 0) {
      e.target.value = "";
    } else if (value.length <= 2) {
      let h = parseInt(value);
      if (h > 12) h = 12;
      if (h < 1 && value.length === 2) h = 1;
      e.target.value = value.length === 1 ? value : String(h).padStart(2, "0");
    } else if (value.length === 3) {
      let h = parseInt(value.substring(0, 2));
      let m1 = value[2];
      if (h > 12) h = 12;
      if (h < 1) h = 1;
      if (parseInt(m1) > 5) m1 = "5";
      e.target.value = String(h).padStart(2, "0") + ":" + m1;
    } else {
      let h = parseInt(value.substring(0, 2));
      let m = parseInt(value.substring(2, 4));
      if (h > 12) h = 12;
      if (h < 1) h = 1;
      if (m > 59) m = 59;
      e.target.value = String(h).padStart(2, "0") + ":" + String(m).padStart(2, "0");
    }
  });

  timeStartInput?.addEventListener("keydown", (e) => {
    if (e.key === "Backspace") {
      const value = e.target.value;
      if (value.includes(":")) {
        e.preventDefault();
        const digitsOnly = value.replace(/[^0-9]/g, "");
        if (digitsOnly.length > 0) {
          e.target.value = digitsOnly.slice(0, -1);
          e.target.dispatchEvent(new Event("input"));
        } else {
          e.target.value = "";
        }
      }
    }
  });

  timeStartInput?.addEventListener("blur", () => {
    let value = timeStartInput.value.replace(/[^0-9]/g, "");

    if (value.length === 0) {
      showError(timeStartError, "Ingrese la hora de inicio.");
      markFieldInvalid(timeStartInput);
      timeStartInput.value = "";
      return;
    }

    if (value.length < 4) {
      value = value.padEnd(4, "0");
    }

    let h = parseInt(value.substring(0, 2));
    let m = parseInt(value.substring(2, 4));

    if (h < 1 || h > 12) h = clamp(h, 1, 12);
    if (m > 59) m = 59;

    const formatted = String(h).padStart(2, "0") + ":" + String(m).padStart(2, "0");
    timeStartInput.value = formatted;

    const startMinutes = toMinutesFrom12(formatted, startAmPmSelect.value);

    if (!Number.isFinite(startMinutes)) {
      showError(timeStartError, "Formato inválido. Use formato HH:MM (ej: 08:30)");
      markFieldInvalid(timeStartInput);
    } else {
      hideError(timeStartError);
      markFieldValid(timeStartInput);
    }
  });

  timeEndInput?.addEventListener("input", (e) => {
    let value = e.target.value.replace(/[^0-9]/g, "");

    if (value.length === 0) {
      e.target.value = "";
    } else if (value.length <= 2) {
      let h = parseInt(value);
      if (h > 12) h = 12;
      if (h < 1 && value.length === 2) h = 1;
      e.target.value = value.length === 1 ? value : String(h).padStart(2, "0");
    } else if (value.length === 3) {
      let h = parseInt(value.substring(0, 2));
      let m1 = value[2];
      if (h > 12) h = 12;
      if (h < 1) h = 1;
      if (parseInt(m1) > 5) m1 = "5";
      e.target.value = String(h).padStart(2, "0") + ":" + m1;
    } else {
      let h = parseInt(value.substring(0, 2));
      let m = parseInt(value.substring(2, 4));
      if (h > 12) h = 12;
      if (h < 1) h = 1;
      if (m > 59) m = 59;
      e.target.value = String(h).padStart(2, "0") + ":" + String(m).padStart(2, "0");
    }
  });

  timeEndInput?.addEventListener("keydown", (e) => {
    if (e.key === "Backspace") {
      const value = e.target.value;
      if (value.includes(":")) {
        e.preventDefault();
        const digitsOnly = value.replace(/[^0-9]/g, "");
        if (digitsOnly.length > 0) {
          e.target.value = digitsOnly.slice(0, -1);
          e.target.dispatchEvent(new Event("input"));
        } else {
          e.target.value = "";
        }
      }
    }
  });

  timeEndInput?.addEventListener("blur", () => {
    let value = timeEndInput.value.replace(/[^0-9]/g, "");

    if (value.length === 0) {
      showError(timeEndError, "Ingrese la hora de fin.");
      markFieldInvalid(timeEndInput);
      timeEndInput.value = "";
      return;
    }

    if (value.length < 4) {
      value = value.padEnd(4, "0");
    }

    let h = parseInt(value.substring(0, 2));
    let m = parseInt(value.substring(2, 4));

    if (h < 1 || h > 12) h = clamp(h, 1, 12);
    if (m > 59) m = 59;

    const formatted = String(h).padStart(2, "0") + ":" + String(m).padStart(2, "0");
    timeEndInput.value = formatted;

    const endMinutes = toMinutesFrom12(formatted, endAmPmSelect.value);

    if (!Number.isFinite(endMinutes)) {
      showError(timeEndError, "Formato inválido. Use formato HH:MM (ej: 10:30)");
      markFieldInvalid(timeEndInput);
    } else {
      hideError(timeEndError);
      markFieldValid(timeEndInput);

      const startMinutes = toMinutesFrom12(timeStartInput.value, startAmPmSelect.value);
      if (Number.isFinite(startMinutes)) {
        const duration = endMinutes - startMinutes;
        if (endMinutes <= startMinutes) {
          showError(timeEndError, "La hora de fin debe ser posterior a la de inicio.");
          markFieldInvalid(timeEndInput);
        } else if (duration < 30) {
          showError(timeEndError, `Mínimo 30 minutos (actual: ${duration} min).`);
          markFieldInvalid(timeEndInput);
        } else if (duration > 480) {
          showError(timeEndError, `Máximo 8 horas (actual: ${Math.floor(duration/60)}h ${duration%60}min).`);
          markFieldInvalid(timeEndInput);
        }
      }
    }
  });

  peopleInput?.addEventListener("input", (e) => {
    let v = e.target.value.replace(/[^0-9]/g,"");
    const n = parseInt(v || "0", 10);
    
    // Obtener capacidad máxima de la mesa seleccionada
    let maxCapacity = 200; // Default
    if (mesaSeleccionada) {
      const mesa = mesasCache.find(m => Number(m.id ?? m.idMesa) === Number(mesaSeleccionada));
      if (mesa) {
        const idTipoMesa = mesa.idTipoMesa ?? mesa.tipoMesa;
        const tipoMesa = tiposMesaMap.get(Number(idTipoMesa));
        const cap = tipoMesa?.capacidadPersonas ?? 0;
        if (cap > 0) maxCapacity = cap;
      }
    }
    
    if (Number.isFinite(n) && n > maxCapacity) {
      v = String(maxCapacity);
    }
    e.target.value = v;
  });

  peopleInput?.addEventListener("blur", () => {
    const people = parseInt(peopleInput.value || "0", 10);
    
    if (peopleInput.value === "" || !Number.isFinite(people)) {
      showError(peopleError, "Ingrese la cantidad de personas.");
      markFieldInvalid(peopleInput);
    } else if (people <= 0) {
      showError(peopleError, "Debe haber al menos 1 persona.");
      markFieldInvalid(peopleInput);
    } else {
      // Validar contra capacidad de mesa si hay una seleccionada
      let maxCapacity = 200;
      let mesaNombre = "";
      
      if (mesaSeleccionada) {
        const mesa = mesasCache.find(m => Number(m.id ?? m.idMesa) === Number(mesaSeleccionada));
        if (mesa) {
          mesaNombre = mesa.nomMesa ?? mesa.nombre ?? `Mesa ${mesaSeleccionada}`;
          const idTipoMesa = mesa.idTipoMesa ?? mesa.tipoMesa;
          const tipoMesa = tiposMesaMap.get(Number(idTipoMesa));
          const cap = tipoMesa?.capacidadPersonas ?? 0;
          if (cap > 0) maxCapacity = cap;
        }
      }
      
      if (people > maxCapacity && mesaSeleccionada) {
        showError(peopleError, `La ${mesaNombre} tiene capacidad para ${maxCapacity} ${maxCapacity === 1 ? 'persona' : 'personas'}.`);
        markFieldInvalid(peopleInput);
      } else if (people > 200) {
        showError(peopleError, "Máximo 200 personas por reserva.");
        markFieldInvalid(peopleInput);
      } else {
        hideError(peopleError);
        markFieldValid(peopleInput);
      }
    }
  });

  eventSelect?.addEventListener("change", () => {
    if (!eventSelect.value || !Number(eventSelect.value)) {
      showError(eventError, "Seleccione el tipo de evento.");
      markFieldInvalid(eventSelect);
    } else {
      hideError(eventError);
      markFieldValid(eventSelect);
    }
  });
}

console.log("[reservaController] ✓ Módulo cargado - Con loader global + Selección única de mesa + colapso individual de tarjetas");