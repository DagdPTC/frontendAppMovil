/*RESERVACONTROLLER.JS - CON VALIDACIONES MEJORADAS Y REQUISITOS ESPECÍFICOS */
import {
  getSessionUser, isAuthError,
  getReserva, createReserva, updateReserva, deleteReserva, getTiposReserva, getMesas
} from "../services/reservaService.js";

// ==========================
// AUTH GATE para Reservas
// ==========================
function renderAuthGate() {
  // Dibuja el card de "Sesión requerida" en el área principal
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
    renderAuthGate();     // bloquea la UI con el mismo aviso
    return true;
  }
  return false;
}

document.addEventListener("DOMContentLoaded", async () => {
  // Antes de montar listeners o cargar datos, verificamos sesión llamando a /me
  try {
    const me = await getSessionUser(); // usa cookie HttpOnly (credentials: 'include')
    if (!me) {
      renderAuthGate(); // no hay sesión -> bloquea
      return;
    }
  } catch {
    renderAuthGate();
    return;
  }

  // ====== Solo si hay sesión continuamos con la UI de Reservas ======
  $("#items-per-page")?.addEventListener("change", async (e) => {
    pageSize = parseInt(e.target.value, 10) || 10;
    currentPage = 0;
    await loadAndRender();
  });
  $("#add-reservation-btn")?.addEventListener("click", openCreateModal);
  $("#close-modal")?.addEventListener("click", closeModal);
  $("#cancel-reservation")?.addEventListener("click", closeModal);
  $("#reservation-form")?.addEventListener("submit", submitForm);

  $("#filter-status")?.addEventListener("change", renderTable);
  $("#search-input")?.addEventListener("input", renderTable);

  setupLiveValidation();

  await bootstrapCatalogs();   // carga catálogos/mesas
  await loadAndRender();

  // Si el token/cookie se invalida y alguna llamada devuelve 401,
  // handle401() mostrará el mismo card y parará el flujo.
});




/* ======================= helpers (inline) ======================= */
const $  = (s, r = document) => r.querySelector(s);
const $$ = (s, r = document) => [...r.querySelectorAll(s)];
const esc = (x) => String(x ?? "").replace(/[&<>"']/g, (s) => ({ "&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;" }[s]));
const clamp=(n,min,max)=>Math.min(Math.max(n,min),max);

function parseTime12(str){
  const m=String(str||"").trim().match(/^(\d{1,2})(?::(\d{1,2}))?(?::\d{1,2})?$/);
  if(!m) return null;
  let h=+m[1]; let mi=m[2]!==undefined?+m[2]:0;
  if(!Number.isFinite(h)||!Number.isFinite(mi)) return null;
  
  // Validar rangos: hora 1-12, minutos 0-59
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

/* ======================= estado/DOM ======================= */
let editingId = null;
let mesasSeleccionadas = [];
let tipoReservaMap = new Map();

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

  return {
    nomCliente: clientNameInput?.value.trim(),
    telefono: clientPhoneInput?.value.replace(/\D/g,""), // Solo números para API
    fReserva: dateInput?.value,
    freserva: dateInput?.value,
    horaI: horaI24,
    horaF: horaF24,
    cantidadPersonas: parseInt(peopleInput?.value || "1", 10),
    idTipoReserva: eventSelect?.value ? Number(eventSelect.value) : null,
    idMesa: mesasSeleccionadas.length ? Number(mesasSeleccionadas[0]) : null,
    mesas: mesasSeleccionadas, // Array de mesas seleccionadas
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
    
    // Mejorar visualización de múltiples mesas
    const tablesDisplay = r.tables && r.tables.length > 0 
      ? (r.tables.length === 1 ? `Mesa ${r.tables[0]}` : `Mesas ${r.tables.join(", ")}`)
      : "—";
    
    const card=document.createElement("div");
    card.className="bg-white rounded-lg shadow-sm border-t-4 border-t-gray-400 p-4 hover:shadow-md transition fadeSlideIn";
    
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
            <span class="text-sm">Detalle ▼</span>
          </button>
        </div>
      </div>
      
      <div class="space-y-1 text-sm text-gray-600 mb-3">
        <div><span class="font-medium text-gray-900">${esc(tablesDisplay)}</span> • Fecha <span class="font-medium text-gray-900">${formatDateLabel(r.date)}</span></div>
        <div>${esc(eventName)}</div>
      </div>
      
      <div class="text-sm text-gray-600 space-y-1">
        <div>Personas: <span class="font-medium text-gray-900">${esc(r.people)}</span></div>
        <div>Horario: <span class="font-medium text-gray-900">${hourLabel(r.timeStart,r.startAmPm)} – ${hourLabel(r.timeEnd,r.endAmPm)}</span></div>
        <div>Teléfono: <span class="font-medium text-gray-900">${esc(r.clientPhone||"—")}</span></div>
      </div>
      
      ${commentSection}
      
      <div class="hidden js-actions mt-3 pt-3 border-t flex gap-2">
        <button class="flex-1 text-sm text-blue-600 hover:bg-blue-50 py-2 rounded transition js-edit" type="button">
          Editar
        </button>
        <button class="flex-1 text-sm text-red-600 hover:bg-red-50 py-2 rounded transition js-del" type="button">
          Eliminar
        </button>
      </div>`;

    const menuBtn = card.querySelector(".js-menu");
    const actionsDiv = card.querySelector(".js-actions");
    
    menuBtn?.addEventListener("click", () => {
      actionsDiv?.classList.toggle("hidden");
    });
    
    card.querySelector(".js-edit").addEventListener("click",()=>startEditing(r));
    card.querySelector(".js-del").addEventListener("click", async ()=>{ 
      if(!confirm("¿Estás seguro de eliminar esta reserva? Esta acción no se puede deshacer.")) return; 
      try {
        await deleteReserva(r.id); 
        await loadFromAPI();
      } catch(err) {
        alert(`Error al eliminar: ${err.message}`);
      }
    });

    reservationsList.appendChild(card);
  });
}

/* ======================= cargar ======================= */
async function loadFromAPI(){
  try {
    const apiList = await getReserva();
    const uiList  = (Array.isArray(apiList)?apiList:[]).map(apiToUI);
    renderReservations(uiList);
  } catch(e) {
    console.error("Error listando reservas:", e);
    reservationsList.innerHTML = `<div class="col-span-full text-red-600 text-sm p-4 bg-red-50 rounded-lg">
      <i class="fas fa-exclamation-triangle mr-2"></i>
      No se pudieron cargar las reservas: ${esc(e.message)}
    </div>`;
  }
}

/* ======================= nueva/editar ======================= */
function openForm(){ 
  console.log("[openForm] Mostrando formulario modal");
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
  console.log("[closeForm] Ocultando formulario modal");
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
  mesasSeleccionadas=[];
  selectedTablesText.textContent="Ninguna mesa seleccionada.";
  
  // Limpiar errores Y estilos de validación
  [clientError, phoneError, dateError, timeStartError, timeEndError, peopleError, eventError, tablesError]
    .forEach(e=>hideError(e));
  
  [clientNameInput, clientPhoneInput, dateInput, timeStartInput, timeEndInput, peopleInput, eventSelect]
    .forEach(inp=>resetFieldValidation(inp));
  
  setFormModeCreate();
}

function startEditing(r){
  editingId=r.id??null;
  clientNameInput.value=r.clientName||"";
  
  // Formatear teléfono al editar
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
  mesasSeleccionadas=Array.isArray(r.tables)?r.tables.slice():[]; // Copiar todas las mesas
  
  // Actualizar texto de mesas seleccionadas
  if (mesasSeleccionadas.length === 0) {
    selectedTablesText.textContent = "Ninguna mesa seleccionada.";
  } else if (mesasSeleccionadas.length === 1) {
    selectedTablesText.textContent = `Mesa seleccionada: ${mesasSeleccionadas[0]}`;
  } else {
    selectedTablesText.textContent = `${mesasSeleccionadas.length} mesas seleccionadas: ${mesasSeleccionadas.join(", ")}`;
  }
  
  setFormModeEdit(r.clientName||r.client||""); 
  openForm();
}

/* ======================= validación + guardar ======================= */
function validateForm(){
  let ok=true;
  
  // ========== CLIENTE (SOLO LETRAS Y ESPACIOS) ==========
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

  // ========== TELÉFONO (SOLO NÚMEROS, FORMATO 0000-0000) ==========
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

  // ========== FECHA (MÍNIMO 2 DÍAS DESPUÉS DE HOY) ==========
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

  // ========== NORMALIZAR HORAS ==========
  timeStartInput.value = normalizeTimeForSave(timeStartInput.value);
  timeEndInput.value = normalizeTimeForSave(timeEndInput.value);
  
  const startMinutes = toMinutesFrom12(timeStartInput.value, startAmPmSelect.value);
  const endMinutes = toMinutesFrom12(timeEndInput.value, endAmPmSelect.value);
  
  // ========== HORA INICIO (FORMATO 12:59 MÁXIMO) ==========
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
  
  // ========== HORA FIN (FORMATO 12:59 MÁXIMO) ==========
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
    }
  }
  
  // ========== VALIDACIÓN CRUZADA DE HORAS ==========
  if (Number.isFinite(startMinutes) && Number.isFinite(endMinutes)) {
    const duration = endMinutes - startMinutes;
    
    if (endMinutes <= startMinutes) {
      showError(timeEndError, "La hora de fin debe ser posterior a la hora de inicio.");
      markFieldInvalid(timeEndInput);
      ok = false;
    } else if (duration < 30) {
      showError(timeEndError, `La reserva debe durar al menos 30 minutos (actual: ${duration} min).`);
      markFieldInvalid(timeEndInput);
      ok = false;
    } else if (duration > 480) {
      showError(timeEndError, `La reserva no puede durar más de 8 horas (actual: ${Math.floor(duration/60)}h ${duration%60}min).`);
      markFieldInvalid(timeEndInput);
      ok = false;
    }
  }

  // ========== PERSONAS (MÁXIMO 200, SOLO NÚMEROS) ==========
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

  // ========== TIPO DE EVENTO ==========
  if (!eventSelect.value || !Number(eventSelect.value)) {
    showError(eventError, "Seleccione el tipo de evento.");
    markFieldInvalid(eventSelect);
    ok = false;
  } else {
    hideError(eventError);
    markFieldValid(eventSelect);
  }
  
  // ========== MESAS (MÚLTIPLE SELECCIÓN) ==========
  if (!mesasSeleccionadas.length) { 
    showError(tablesError, "Debe seleccionar al menos una mesa para la reserva.");
    ok = false;
  } else {
    hideError(tablesError);
  }

  return ok;
}

async function handleSave(){
  if(!validateForm()) {
    // Scroll al primer error
    const firstError = reservationForm.querySelector('.text-red-600:not(.hidden)');
    firstError?.scrollIntoView({ behavior: 'smooth', block: 'center' });
    return;
  }
  
  const payload=uiToApiPayload();
  console.log("[handleSave] payload:", payload);
  
  // Deshabilitar botón mientras guarda
  saveReservationBtn.disabled = true;
  saveReservationBtn.innerHTML = '<i class="fas fa-spinner fa-spin mr-2"></i>Guardando...';
  
  try{
    if(editingId!=null) {
      await updateReserva(editingId,payload);
    } else {
      await createReserva(payload);
    }
    await loadFromAPI(); 
    clearForm(); 
    closeForm();
  }catch(err){
    console.error("[Guardar] Error:",err);
    alert(`❌ Error al guardar la reserva:\n\n${err.message}`);
  } finally {
    // Rehabilitar botón
    saveReservationBtn.disabled = false;
    saveReservationBtn.innerHTML = '<i class="fas fa-save mr-2"></i>' + 
      (editingId ? 'Actualizar Reserva' : 'Guardar Reserva');
  }
}

/* ======================= Modal Mesas (SELECCIÓN MÚLTIPLE) ======================= */
function mesaBtnHTML(m, selected){
  const id  = m.idMesa ?? m.id ?? m.IdMesa ?? m.Id ?? m.numero;
  const nro = m.numero ?? m.numeroMesa ?? m.nMesa ?? m.nombre ?? `Mesa ${id}`;
  const cap = m.capacidad ?? m.sillas ?? m.personas ?? "";
  return `
    <button type="button"
      class="border rounded-lg py-2 px-3 text-sm flex justify-between items-center hover:bg-blue-100 transition ${selected?"mesa-btn-selected bg-blue-50 border-blue-500":""}"
      data-mesa="${id}" data-nro="${esc(nro)}">
      <span>${esc(nro)}${cap?` · ${cap} personas`:""}</span>
      <i class="fa-solid fa-check ${selected?"text-blue-600":"opacity-0"}"></i>
    </button>`;
}

async function openTablesModal() {
  const modal = $("#tables-modal");
  const overlay   = modal.querySelector('[data-overlay="true"]');
  const closeBtn  = modal.querySelector("#close-tables-modal");
  const cancelBtn = modal.querySelector("#cancel-tables-btn");
  const saveBtn   = modal.querySelector("#save-tables-btn");
  const tablesGrid= modal.querySelector("#tables-grid");

  let list = [];
  try { 
    list = await getMesas(); 
    console.log("[Mesas] Cargadas desde API:", list);
  } catch(err) { 
    console.error("Error cargando mesas:", err);
    alert("❌ No se pudieron cargar las mesas. Intente nuevamente.");
    return;
  }
  
  // Validar que haya mesas disponibles
  if (!Array.isArray(list) || list.length === 0) {
    alert("⚠️ No hay mesas registradas en el sistema. Por favor, registre mesas primero.");
    return;
  }

  // Crear copia temporal de las mesas seleccionadas para no modificar el original hasta guardar
  let tempSelected = [...mesasSeleccionadas];
  
  const render = () => {
    tablesGrid.innerHTML = list.map(m => {
      const mesaId = Number(m.idMesa ?? m.id ?? m.IdMesa ?? m.Id ?? m.numero);
      const isSel = tempSelected.includes(mesaId);
      return mesaBtnHTML(m, isSel);
    }).join("");
  };
  render();

  // NUEVA LÓGICA: Selección múltiple
  tablesGrid.onclick = (ev) => {
    const btn = ev.target.closest("button[data-mesa]");
    if (!btn) return;
    
    const mesaId = Number(btn.dataset.mesa);
    const idx = tempSelected.indexOf(mesaId);
    
    if (idx > -1) {
      // Deseleccionar mesa
      tempSelected.splice(idx, 1);
      btn.classList.remove("mesa-btn-selected", "bg-blue-50", "border-blue-500");
      btn.querySelector("i")?.classList.add("opacity-0");
      btn.querySelector("i")?.classList.remove("text-blue-600");
    } else {
      // Seleccionar mesa
      tempSelected.push(mesaId);
      btn.classList.add("mesa-btn-selected", "bg-blue-50", "border-blue-500");
      btn.querySelector("i")?.classList.remove("opacity-0");
      btn.querySelector("i")?.classList.add("text-blue-600");
    }
  };

  const close = () => modal.classList.add("hidden");
  
  overlay?.addEventListener("click", close, { once:true });
  closeBtn?.addEventListener("click", close, { once:true });
  cancelBtn?.addEventListener("click", close, { once:true });

  saveBtn?.addEventListener("click", () => {
    mesasSeleccionadas = [...tempSelected];
    
    // Actualizar texto descriptivo
    if (mesasSeleccionadas.length === 0) {
      selectedTablesText.textContent = "Ninguna mesa seleccionada.";
    } else if (mesasSeleccionadas.length === 1) {
      selectedTablesText.textContent = `Mesa seleccionada: ${mesasSeleccionadas[0]}`;
    } else {
      selectedTablesText.textContent = `${mesasSeleccionadas.length} mesas seleccionadas: ${mesasSeleccionadas.sort((a,b)=>a-b).join(", ")}`;
    }
    
    hideError(tablesError);
    close();
  }, { once:true });

  modal.classList.remove("hidden");
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

/* ======================= validación en tiempo real ======================= */
function setupRealtimeValidation() {
  // ========== CLIENTE (solo letras y espacios) ==========
  clientNameInput?.addEventListener("input", (e) => {
    // Filtrar caracteres no permitidos en tiempo real
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

  // ========== TELÉFONO (formato automático 0000-0000) ==========
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

  // ========== FECHA (mínimo 2 días de anticipación) ==========
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
        const daysUntilSelected = Math.ceil((selectedDate - today) / (1000 * 60 * 60 * 24));
        showError(dateError, `Las reservas deben hacerse con al menos 2 días de anticipación. Fecha seleccionada: ${daysUntilSelected} día(s) de anticipación.`);
        markFieldInvalid(dateInput);
      } else {
        hideError(dateError);
        markFieldValid(dateInput);
      }
    }
  });

  // ========== HORA INICIO (formato fluido HH:MM, borrado fácil) ==========
  timeStartInput?.addEventListener("input", (e) => {
    let value = e.target.value.replace(/[^0-9]/g, ""); // Solo números
    
    // Formatear automáticamente a HH:MM con borrado fluido
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

  // Manejar tecla Backspace para borrado fluido
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
    
    // Completar formato si está incompleto
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

  // ========== HORA FIN (formato fluido HH:MM, borrado fácil) ==========
  timeEndInput?.addEventListener("input", (e) => {
    let value = e.target.value.replace(/[^0-9]/g, ""); // Solo números
    
    // Formatear automáticamente a HH:MM con borrado fluido
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

  // Manejar tecla Backspace para borrado fluido
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
    
    // Completar formato si está incompleto
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
      
      // Validar duración si ambas horas están presentes
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

  // ========== PERSONAS (máximo 200, solo números) ==========
  peopleInput?.addEventListener("input", (e) => {
    let v = e.target.value.replace(/[^0-9]/g,"");
    const n = parseInt(v || "0", 10);
    if (Number.isFinite(n) && n > 200) {
      v = "200";
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
    } else if (people > 200) {
      showError(peopleError, "Máximo 200 personas por reserva.");
      markFieldInvalid(peopleInput);
    } else {
      hideError(peopleError);
      markFieldValid(peopleInput);
    }
  });

  // ========== TIPO DE EVENTO ==========
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

/* ======================= eventos UI ======================= */
newReservationBtn?.addEventListener("click", ()=>{ 
  console.log("[Nueva Reserva] Botón clickeado");
  clearForm(); 
  setFormModeCreate(); 
  openForm(); 
});

cancelReservationBtn?.addEventListener("click", ()=>{ 
  console.log("[Cancelar] Botón clickeado");
  clearForm(); 
  closeForm(); 
});

saveReservationBtn?.addEventListener("click", (e)=>{ 
  e.preventDefault(); 
  handleSave(); 
});

selectTablesBtn?.addEventListener("click", (e)=>{ 
  e.preventDefault(); 
  openTablesModal(); 
});

/* ======================= init ======================= */
(function init(){
  console.log("[ReservaController] Iniciando con validaciones mejoradas...");
  
  // Setup validación en tiempo real
  setupRealtimeValidation();

  console.log("[Init] Verificando elementos del DOM:");
  console.log("- reservationsSection:", reservationsSection ? "✓" : "✗");
  console.log("- buttonSection:", buttonSection ? "✓" : "✗");
  console.log("- reservationForm:", reservationForm ? "✓" : "✗");
  console.log("- newReservationBtn:", newReservationBtn ? "✓" : "✗");

  loadTiposEvento();
  loadFromAPI();
  
  console.log("[ReservaController] ✓ Inicialización completa");
  console.log("✓ Cliente: Solo letras y espacios");
  console.log("✓ Teléfono: Formato 0000-0000 automático");
  console.log("✓ Fecha: Mínimo 2 días de anticipación");
  console.log("✓ Hora: Formato fijo HH:MM (los dos puntos siempre presentes)");
  console.log("✓ Personas: Máximo 200");
  console.log("✓ Mesas: Selección múltiple habilitada");
})();

function setupLiveValidation() {
  // Cliente
  clientNameInput?.addEventListener("input", () => {
    if (!clientError) return;
    const ok = clientNameInput.value.trim() !== "";
    clientError.classList.toggle("hidden", ok);
  });

  // Teléfono (8 dígitos formateado 0000-0000)
  clientPhoneInput?.addEventListener("input", () => {
    let v = clientPhoneInput.value.replace(/[^0-9]/g, "").slice(0, 8);
    if (v.length > 4) v = v.slice(0, 4) + "-" + v.slice(4);
    clientPhoneInput.value = v;
    if (!phoneError) return;
    const ok = v.replace(/\D/g, "").length === 8;
    phoneError.classList.toggle("hidden", ok);
  });

  // Fecha
  dateInput?.addEventListener("input", () => {
    if (!dateError) return;
    dateError.classList.toggle("hidden", dateInput.value !== "");
  });

  // Horas
  function validateTimePair() {
    if (!timeStartError || !timeEndError) return;

    // normaliza “h:mm”
    const norm = (s) => {
      const m = String(s||"").trim().match(/^(\d{1,2})(?::(\d{1,2}))?$/);
      if (!m) return "";
      const h = Math.min(Math.max(parseInt(m[1],10)||0,1),12);
      const mi = Math.min(Math.max(parseInt(m[2]||"0",10),0),59);
      return `${h}:${String(mi).padStart(2,"0")}`;
    };

    timeStartInput.value = norm(timeStartInput.value);
    timeEndInput.value   = norm(timeEndInput.value);

    const s = toMinutesFrom12(timeStartInput.value, startAmPmSelect.value);
    const e = toMinutesFrom12(timeEndInput.value,   endAmPmSelect.value);

    let okStart = Number.isFinite(s);
    let okEnd   = Number.isFinite(e);
    let okPair  = okStart && okEnd && e > s && (e - s) >= 30 && (e - s) <= 480;

    timeStartError.classList.toggle("hidden", okStart);
    timeEndError.classList.toggle("hidden", okEnd && okPair);

    if (okStart && okEnd) {
      if (e <= s) {
        timeEndError.textContent = "La hora fin debe ser posterior a la hora inicio.";
      } else if (e - s < 30) {
        timeEndError.textContent = "La reserva debe durar al menos 30 minutos.";
      } else if (e - s > 480) {
        timeEndError.textContent = "La reserva no puede durar más de 8 horas.";
      } else {
        timeEndError.textContent = "Hora de fin inválida.";
      }
    }
  }
  timeStartInput?.addEventListener("input", validateTimePair);
  timeEndInput?.addEventListener("input", validateTimePair);
  startAmPmSelect?.addEventListener("change", validateTimePair);
  endAmPmSelect?.addEventListener("change", validateTimePair);

  // Personas
  peopleInput?.addEventListener("input", () => {
    if (!peopleError) return;
    let v = peopleInput.value.replace(/[^0-9]/g,"");
    let n = parseInt(v||"0",10);
    if (!Number.isFinite(n) || n <= 0) {
      peopleError.textContent = "Ingrese la cantidad de personas.";
      peopleError.classList.remove("hidden");
    } else if (n > 200) {
      peopleError.textContent = "Máximo 200 personas.";
      peopleError.classList.remove("hidden");
      n = 200; v = "200";
    } else {
      peopleError.classList.add("hidden");
    }
    peopleInput.value = String(n || v);
  });

  // Tipo de evento
  eventSelect?.addEventListener("change", () => {
    if (!eventError) return;
    const ok = !!Number(eventSelect.value);
    eventError.classList.toggle("hidden", ok);
  });

  // Mesas: se muestra el error solo al guardar; no hay validación en vivo aquí
}
