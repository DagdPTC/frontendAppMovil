/*RESERVACONTROLLER.JS - SIN REDIRECCIÓN AL LOGIN */
import {
  getReserva, createReserva, updateReserva, deleteReserva, getTiposReserva, getMesas
} from "../services/reservaService.js";

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
  h=clamp(h,1,12); mi=clamp(mi,0,59); return {h,m:mi};
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
    telefono: clientPhoneInput?.value.trim(),
    fReserva: dateInput?.value,
    freserva: dateInput?.value,
    horaI: horaI24,
    horaF: horaF24,
    cantidadPersonas: parseInt(peopleInput?.value || "1", 10),
    idTipoReserva: eventSelect?.value ? Number(eventSelect.value) : null,
    idMesa: mesasSeleccionadas.length ? Number(mesasSeleccionadas[0]) : null,
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
        <div>Mesa <span class="font-medium text-gray-900">${esc((r.tables && r.tables[0]) || "—")}</span> • Fecha <span class="font-medium text-gray-900">${formatDateLabel(r.date)}</span></div>
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
  [clientError, phoneError, dateError, timeStartError, timeEndError, peopleError, eventError, tablesError].forEach(e=>e?.classList.add("hidden"));
  setFormModeCreate();
}

function startEditing(r){
  editingId=r.id??null;
  clientNameInput.value=r.clientName||"";
  clientPhoneInput.value=r.clientPhone||"";
  dateInput.value=r.date||"";
  timeStartInput.value=r.timeStart||"";
  timeEndInput.value=r.timeEnd||"";
  startAmPmSelect.value=r.startAmPm||"AM";
  endAmPmSelect.value=r.endAmPm||"AM";
  peopleInput.value=String(r.people||"");
  eventSelect.value = r.eventId != null ? String(r.eventId) : "";
  commentInput.value=r.comment||"";
  mesasSeleccionadas=Array.isArray(r.tables)?r.tables.slice(0,1):[];
  selectedTablesText.textContent=mesasSeleccionadas.length?`Mesa seleccionada: ${mesasSeleccionadas[0]}`:"Ninguna mesa seleccionada.";
  setFormModeEdit(r.clientName||r.client||""); 
  openForm();
}

/* ======================= validación + guardar ======================= */
function validateForm(){
  let ok=true;
  
  if (clientNameInput.value.trim()===""){
    clientError.classList.remove("hidden"); 
    ok=false;
  } else clientError.classList.add("hidden");

  const d=clientPhoneInput.value.replace(/\D/g,"");
  if(d.length!==8){
    phoneError.classList.remove("hidden"); 
    ok=false;
  } else phoneError.classList.add("hidden");

  if (dateInput.value===""){
    dateError.classList.remove("hidden"); 
    ok=false;
  } else dateError.classList.add("hidden");

  timeStartInput.value=normalizeTimeForSave(timeStartInput.value);
  timeEndInput.value=normalizeTimeForSave(timeEndInput.value);
  
  const s=toMinutesFrom12(timeStartInput.value,startAmPmSelect.value);
  const e=toMinutesFrom12(timeEndInput.value,endAmPmSelect.value);
  
  if(!Number.isFinite(s)){
    timeStartError.textContent="Hora de inicio inválida."; 
    timeStartError.classList.remove("hidden"); 
    ok=false;
  } else timeStartError.classList.add("hidden");
  
  if(!Number.isFinite(e)){
    timeEndError.textContent="Hora de fin inválida."; 
    timeEndError.classList.remove("hidden"); 
    ok=false;
  } else timeEndError.classList.add("hidden");
  
  if(Number.isFinite(s)&&Number.isFinite(e)){
    const duracion = e - s;
    
    if(e<=s){
      timeEndError.textContent="La hora fin debe ser posterior a la hora inicio."; 
      timeEndError.classList.remove("hidden"); 
      ok=false;
    } else if(duracion < 30) {
      timeEndError.textContent="La reserva debe durar al menos 30 minutos."; 
      timeEndError.classList.remove("hidden"); 
      ok=false;
    } else if(duracion > 480) {
      timeEndError.textContent="La reserva no puede durar más de 8 horas."; 
      timeEndError.classList.remove("hidden"); 
      ok=false;
    }
  }

  const ppl=parseInt(peopleInput.value||"0",10);
  if(!Number.isFinite(ppl)||ppl<=0){ 
    peopleError.textContent="Ingrese la cantidad de personas."; 
    peopleError.classList.remove("hidden"); 
    ok=false;
  } else if(ppl>200){ 
    peopleError.textContent="Máximo 200 personas."; 
    peopleError.classList.remove("hidden"); 
    ok=false;
  } else peopleError.classList.add("hidden");

  if(!Number(eventSelect.value)){
    eventError.classList.remove("hidden"); 
    ok=false;
  } else eventError.classList.add("hidden");
  
  if(!mesasSeleccionadas.length){ 
    tablesError.textContent="Seleccione una mesa."; 
    tablesError.classList.remove("hidden"); 
    ok=false;
  } else tablesError.classList.add("hidden");

  return ok;
}

async function handleSave(){
  if(!validateForm()) return;
  
  const payload=uiToApiPayload();
  console.log("[handleSave] payload:", payload);
  
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
    alert(`Error al guardar la reserva: ${err.message}`);
  }
}

/* ======================= Modal Mesas ======================= */
function mesaBtnHTML(m, selected){
  const id  = m.idMesa ?? m.id ?? m.IdMesa ?? m.Id ?? m.numero;
  const nro = m.numero ?? m.numeroMesa ?? m.nMesa ?? m.nombre ?? `Mesa ${id}`;
  const cap = m.capacidad ?? m.sillas ?? m.personas ?? "";
  return `
    <button type="button"
      class="border rounded-lg py-2 px-3 text-sm flex justify-between items-center hover:bg-blue-100 transition ${selected?"mesa-btn-selected":""}"
      data-mesa="${id}" data-nro="${esc(nro)}">
      <span>${esc(nro)}${cap?` · ${cap}`:""}</span>
      <i class="fa-solid fa-check ${selected?"":"opacity-0"}"></i>
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
  } catch(err) { 
    console.warn("Error cargando mesas:", err);
    list = []; 
  }
  
  if (!Array.isArray(list) || !list.length) {
    list = Array.from({length:12}, (_,i)=>({ idMesa:i+1, numero:i+1, capacidad:4 }));
  }

  const selectedId = mesasSeleccionadas.length ? Number(mesasSeleccionadas[0]) : null;
  
  const render = () => {
    tablesGrid.innerHTML = list.map(m => {
      const isSel = Number(m.idMesa ?? m.id ?? m.IdMesa ?? m.Id ?? m.numero) === selectedId;
      return mesaBtnHTML(m, isSel);
    }).join("");
  };
  render();

  tablesGrid.onclick = (ev) => {
    const btn = ev.target.closest("button[data-mesa]");
    if (!btn) return;
    
    tablesGrid.querySelectorAll('button[data-mesa]').forEach(b=>{
      b.classList.remove("mesa-btn-selected");
      b.querySelector("i")?.classList.add("opacity-0");
    });
    
    btn.classList.add("mesa-btn-selected");
    btn.querySelector("i")?.classList.remove("opacity-0");
  };

  const close = () => modal.classList.add("hidden");
  
  overlay?.addEventListener("click", close, { once:true });
  closeBtn?.addEventListener("click", close, { once:true });
  cancelBtn?.addEventListener("click", close, { once:true });

  saveBtn?.addEventListener("click", () => {
    const sel = tablesGrid.querySelector('button.mesa-btn-selected');
    mesasSeleccionadas = sel ? [ Number(sel.dataset.mesa) ] : [];
    selectedTablesText.textContent = mesasSeleccionadas.length ? 
      ("Mesa seleccionada: " + mesasSeleccionadas[0]) : 
      "Ninguna mesa seleccionada.";
    tablesError.classList.add("hidden");
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
  console.log("[ReservaController] Iniciando...");
  
  clientPhoneInput?.addEventListener("input", () => {
    let v=clientPhoneInput.value.replace(/[^0-9]/g,"").slice(0,8);
    if (v.length>4) v=v.slice(0,4)+"-"+v.slice(4);
    clientPhoneInput.value=v;
  });
  
  peopleInput?.addEventListener("input", () => {
    let v=peopleInput.value.replace(/[^0-9]/g,"");
    const n=parseInt(v||"0",10);
    if (Number.isFinite(n)&&n>200) v="200";
    peopleInput.value=v;
  });

  console.log("[Init] Verificando elementos del DOM:");
  console.log("- reservationsSection:", reservationsSection ? "✓" : "✗");
  console.log("- buttonSection:", buttonSection ? "✓" : "✗");
  console.log("- reservationForm:", reservationForm ? "✓" : "✗");
  console.log("- newReservationBtn:", newReservationBtn ? "✓" : "✗");

  loadTiposEvento();
  loadFromAPI();
  
  console.log("[ReservaController] ✓ Inicialización completa");
})();