// js/controllers/reservaController.js
// Revert estable + fixes: combo de Tipo Evento, modal de Mesas autoconstruido y create ok.

import {
  getReserva,
  createReserva,
  updateReserva,
  deleteReserva,
  getTiposReserva,
  getMesas,
} from "../services/reservaService.js";

// ---------- utils ----------
const $  = (s, r = document) => r.querySelector(s);
const $$ = (s, r = document) => [...r.querySelectorAll(s)];
const esc = (x) => String(x ?? "").replace(/[&<>"']/g, (s) => ({ "&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;" }[s]));
const clamp=(n,min,max)=>Math.min(Math.max(n,min),max);

function parseTime12(str){
  const m=String(str||"").match(/^(\d{1,2})(?::(\d{1,2}))?$/);
  if(!m) return null;
  let h=+m[1]; let mi=m[2]!==undefined?+m[2]:0;
  if(!Number.isFinite(h)||!Number.isFinite(mi)) return null;
  h=clamp(h,1,12); mi=clamp(mi,0,59); return {h,m:mi};
}
function normalizeTimeForSave(v){
  if(!v) return ""; const m=String(v).trim().match(/^(\d{1,2})(?::(\d{1,2}))?$/);
  if(!m) return ""; let h=+m[1]; let mi=m[2]!==undefined?+m[2]:0;
  h=clamp(h,1,12); mi=clamp(mi,0,59); return `${h}:${String(mi).padStart(2,"0")}`;
}
function toMinutesFrom12(hhmm,ampm){ const t=parseTime12(hhmm); if(!t) return NaN; let h24=t.h%12; if((ampm||"").toUpperCase()==="PM") h24+=12; return h24*60+t.m;}
const hourLabel=(h,a)=>{const t=parseTime12(h); return t?`${t.h}:${String(t.m).padStart(2,"0")}${a?" "+a:""}`:`${h||""} ${a||""}`.trim();};
const formatDateLabel=(d)=> d?new Date(d+"T00:00:00").toLocaleDateString("es-ES",{day:"2-digit",month:"short"}):"";

// ---------- estado ----------
let editingId = null;
let mesasSeleccionadas = [];
let platillosSeleccionados = [];

// ---------- DOM ----------
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
const dishesError    = $("#dishes-error");

const selectTablesBtn    = $("#select-tables-btn");
const selectedTablesText = $("#selected-tables-text");

const formTitle = $("#reservation-form-title");

// ---------- form mode ----------
function setFormModeCreate(){ formTitle&&(formTitle.textContent="Nueva reserva"); saveReservationBtn&&(saveReservationBtn.textContent="Guardar Reserva"); editingId=null; }
function setFormModeEdit(n){ formTitle&&(formTitle.textContent=`Editar reserva de ${n||""}`.trim()); saveReservationBtn&&(saveReservationBtn.textContent="Actualizar Reserva"); }

// ---------- map API <-> UI ----------
function apiToUI(r){
  const id       = r.id ?? r.Id ?? r.idReserva ?? r.IdReserva ?? null;
  const fReserva = r.fReserva ?? r.FReserva ?? r.freserva ?? r.fecha ?? "";
  const horaI    = r.horaI ?? r.HoraI ?? r.horai ?? "";
  const horaF    = r.horaF ?? r.HoraF ?? r.horaf ?? "";
  const cliente  = r.nombreCliente ?? r.NombreCliente ?? r.cliente ?? "";
  const tel      = r.telefono ?? r.Telefono ?? "";
  const cant     = r.cantidadPersonas ?? r.CantidadPersonas ?? r.personas ?? 1;
  const evento   = r.evento ?? r.Evento ?? "";
  const coment   = r.comentario ?? r.Comentario ?? "";
  const mesas    = Array.isArray(r.mesas) ? r.mesas.map(Number) : (r.idMesa != null ? [Number(r.idMesa)] : []);
  return {
    id,
    clientName: cliente,
    clientPhone: tel,
    date: String(fReserva),
    timeStart: String(horaI),
    startAmPm: r.startAmPm ?? "AM",
    timeEnd: String(horaF),
    endAmPm: r.endAmPm ?? "AM",
    people: Number(cant) || 1,
    event: String(evento || ""),
    comment: String(coment || ""),
    tables: mesas,
    dishes: Array.isArray(r.platillos) ? r.platillos : [],
    status: r.estado ?? "Pendiente",
    total: r.total ?? 0,
  };
}
function uiToApiPayload(){
  const horaI = normalizeTimeForSave(timeStartInput.value);
  const horaF = normalizeTimeForSave(timeEndInput.value);
  return {
    nombreCliente: clientNameInput?.value.trim(),
    telefono: clientPhoneInput?.value.trim(),
    fReserva: dateInput?.value,
    horaI, horaF,
    cantidadPersonas: parseInt(peopleInput?.value || "1", 10),
    evento: eventSelect?.value,
    comentario: commentInput?.value.trim(),
    idMesa: mesasSeleccionadas.length ? Number(mesasSeleccionadas[0]) : null,
    mesas: mesasSeleccionadas.map(Number),
    platillos: (platillosSeleccionados||[]).map((d)=>
      typeof d==="string" ? {nombre:d,cantidad:1}
      : {nombre:d.nombre||d.name||"", cantidad:d.cantidad??d.qty??1, precio:d.precio??d.price??0}
    ),
  };
}

// ---------- render lista ----------
let reservationsList  = $("#reservations-list", reservationsSection);
let reservationsEmpty = $("#reservations-empty", reservationsSection);
if (!reservationsList) {
  reservationsList = document.createElement("div");
  reservationsList.id = "reservations-list";
  reservationsSection?.appendChild(reservationsList);
}
if (!reservationsEmpty) {
  reservationsEmpty = document.createElement("div");
  reservationsEmpty.id = "reservations-empty";
  reservationsEmpty.className = "text-gray-500";
  reservationsEmpty.textContent = "Aún no hay reservas. Crea la primera con el botón “Nueva reserva”.";
  reservationsSection?.insertBefore(reservationsEmpty, reservationsList);
}

function statusAccent(s){ s=String(s||"").toLowerCase(); if(s.includes("prep"))return"res-card__accent--prep"; if(s.includes("paga"))return"res-card__accent--paid"; if(s.includes("entreg"))return"res-card__accent--deliv"; return"res-card__accent--pending";}
function statusBadge(s){ s=String(s||"").toLowerCase(); if(s.includes("prep"))return{cls:"badge--prep",txt:"En preparación"}; if(s.includes("paga"))return{cls:"badge--paid",txt:"Pagado"}; if(s.includes("entreg"))return{cls:"badge--deliv",txt:"Entregado"}; return{cls:"badge--pending",txt:"Pendiente"};}

function renderReservations(list){
  reservationsList.innerHTML = "";
  if (!Array.isArray(list) || list.length === 0) { reservationsEmpty.classList.remove("hidden"); return; }
  reservationsEmpty.classList.add("hidden");

  list.forEach((r)=>{
    const badge=statusBadge(r.status); const accent=statusAccent(r.status);
    const card=document.createElement("div");
    card.className="res-card";
    card.innerHTML=`
      <div class="res-card__accent ${accent}"></div>
      <div class="res-card__body">
        <div class="res-card__top">
          <div class="res-card__title">CLIENTE</div>
          <button class="btn-detail js-toggle" type="button">Detalle ▾</button>
        </div>
        <div class="kv"><div class="kv__k">Mesa:</div><div class="kv__v">${esc((r.tables && r.tables[0]) || "—")}</div></div>
        <div class="kv"><div class="kv__k">Fecha:</div><div class="kv__v">${formatDateLabel(r.date)} — ${hourLabel(r.timeStart,r.startAmPm)} a ${hourLabel(r.timeEnd,r.endAmPm)}</div></div>
        <div class="kv"><div class="kv__k">Evento:</div><div class="kv__v">${esc(r.event||"—")}</div></div>
        <div style="margin-top:8px;">
          <span class="badge ${badge.cls}">${badge.txt}</span>
          <span style="float:right;color:#111827;font-weight:700;">Total $${Number(r.total||0).toFixed(2)}</span>
        </div>
        <div class="res-card__details"></div>
      </div>
      <div class="res-card__actions">
        <button class="btn-link js-edit" type="button">Editar</button>
        <button class="btn-danger js-del" type="button">Eliminar</button>
      </div>`;

    const detBtn=card.querySelector(".js-toggle");
    const detBox=card.querySelector(".res-card__details");
    detBox.innerHTML=`
      <div class="detail-row"><div class="detail-row__k">Cliente:</div><div class="detail-row__v">${esc(r.clientName||"—")}</div></div>
      <div class="detail-row"><div class="detail-row__k">Teléfono:</div><div class="detail-row__v">${esc(r.clientPhone||"—")}</div></div>
      <div class="detail-row"><div class="detail-row__k">Mesas:</div><div class="detail-row__v">${r.tables?.length?r.tables.join(", "):"—"}</div></div>
      <div class="detail-row"><div class="detail-row__k">Platillos:</div><div class="detail-row__v">${(r.dishes&&r.dishes.length)?r.dishes.map(d=>esc(typeof d==="string"?d:(d.nombre||d.name||""))).join(", "):"—"}</div></div>
      <div class="detail-row"><div class="detail-row__k">Notas:</div><div class="detail-row__v">${esc(r.comment||"—")}</div></div>`;
    detBox.style.maxHeight="0px"; detBox.style.overflow="hidden"; detBox.style.transition="max-height .25s ease, padding .25s ease, border-color .25s ease"; detBox.style.paddingTop="0"; detBox.style.paddingBottom="0"; detBox.style.borderTop="1px solid"; detBox.style.borderTopColor="transparent"; detBox.dataset.opened="0";
    detBtn.addEventListener("click",(e)=>{e.stopPropagation(); const opened=detBox.dataset.opened==="1"; if(opened){detBox.style.maxHeight="0px"; detBox.style.paddingTop="0"; detBox.style.paddingBottom="0"; detBox.style.borderTopColor="transparent"; detBox.dataset.opened="0"; detBtn.textContent="Detalle ▾";} else {detBox.style.maxHeight=detBox.scrollHeight+"px"; detBox.style.paddingTop="10px"; detBox.style.paddingBottom="12px"; detBox.style.borderTopColor="#f3f4f6"; detBox.dataset.opened="1"; detBtn.textContent="Detalle ▴";}});

    card.querySelector(".js-edit").addEventListener("click",()=>startEditing(r));
    card.querySelector(".js-del").addEventListener("click", async ()=>{ if(!confirm("¿Eliminar esta reserva?")) return; await deleteReserva(r.id); await loadFromAPI(); });

    reservationsList.appendChild(card);
  });
}

// ---------- cargar ----------
async function loadFromAPI(){
  const apiList = await getReserva();
  const uiList  = (Array.isArray(apiList)?apiList:[]).map(apiToUI);
  renderReservations(uiList);
}

// ---------- nueva/editar ----------
function openForm(){ reservationsSection?.classList.add("hidden"); buttonSection?.classList.add("hidden"); reservationForm?.classList.remove("hidden"); }
function closeForm(){ reservationForm?.classList.add("hidden"); reservationsSection?.classList.remove("hidden"); buttonSection?.classList.remove("hidden"); }
function clearForm(){
  editingId=null;
  clientNameInput&&(clientNameInput.value="");
  clientPhoneInput&&(clientPhoneInput.value="");
  dateInput&&(dateInput.value="");
  timeStartInput&&(timeStartInput.value="");
  timeEndInput&&(timeEndInput.value="");
  startAmPmSelect&&(startAmPmSelect.value="AM");
  endAmPmSelect&&(endAmPmSelect.value="AM");
  peopleInput&&(peopleInput.value="");
  eventSelect&&(eventSelect.value="");
  commentInput&&(commentInput.value="");
  mesasSeleccionadas=[]; platillosSeleccionados=[];
  selectedTablesText&&(selectedTablesText.textContent="Ninguna mesa seleccionada.");
  [clientError, phoneError, dateError, timeStartError, timeEndError, peopleError, eventError, tablesError, dishesError].forEach(e=>e?.classList.add("hidden"));
  setFormModeCreate();
}
function startEditing(r){
  editingId=r.id??null;
  clientNameInput&&(clientNameInput.value=r.clientName||"");
  clientPhoneInput&&(clientPhoneInput.value=r.clientPhone||"");
  dateInput&&(dateInput.value=r.date||"");
  timeStartInput&&(timeStartInput.value=r.timeStart||"");
  timeEndInput&&(timeEndInput.value=r.timeEnd||"");
  startAmPmSelect&&(startAmPmSelect.value=r.startAmPm||"AM");
  endAmPmSelect&&(endAmPmSelect.value=r.endAmPm||"AM");
  peopleInput&&(peopleInput.value=String(r.people||""));
  eventSelect&&(eventSelect.value=r.event||"");
  commentInput&&(commentInput.value=r.comment||"");
  mesasSeleccionadas=Array.isArray(r.tables)?r.tables.slice():[];
  selectedTablesText&&(selectedTablesText.textContent=mesasSeleccionadas.length?`Mesas seleccionadas: ${mesasSeleccionadas.join(", ")}`:"Ninguna mesa seleccionada.");
  setFormModeEdit(r.clientName||r.client||""); openForm();
}

// ---------- validación + guardar ----------
function validateForm(){
  let ok=true;
  if (clientNameInput && clientNameInput.value.trim()===""){clientError?.classList.remove("hidden"); ok=false;} else clientError?.classList.add("hidden");
  if (clientPhoneInput){ const d=clientPhoneInput.value.replace(/\D/g,""); if(d.length!==8){phoneError?.classList.remove("hidden"); ok=false;} else phoneError?.classList.add("hidden"); }
  if (dateInput && dateInput.value===""){dateError?.classList.remove("hidden"); ok=false;} else dateError?.classList.add("hidden");

  timeStartInput&&(timeStartInput.value=normalizeTimeForSave(timeStartInput.value));
  timeEndInput&&(timeEndInput.value=normalizeTimeForSave(timeEndInput.value));
  const s=toMinutesFrom12(timeStartInput?.value,startAmPmSelect?.value);
  const e=toMinutesFrom12(timeEndInput?.value,endAmPmSelect?.value);
  if(!Number.isFinite(s)){timeStartError&& (timeStartError.textContent="Hora inválida."); timeStartError?.classList.remove("hidden"); ok=false;} else timeStartError?.classList.add("hidden");
  if(!Number.isFinite(e)){timeEndError&& (timeEndError.textContent="Hora inválida."); timeEndError?.classList.remove("hidden"); ok=false;} else timeEndError?.classList.add("hidden");
  if(Number.isFinite(s)&&Number.isFinite(e)&&e<=s){timeEndError&& (timeEndError.textContent="La hora fin debe ser posterior a la hora inicio."); timeEndError?.classList.remove("hidden"); ok=false;}

  const ppl=parseInt(peopleInput?.value||"0",10);
  if(!Number.isFinite(ppl)||ppl<=0){ peopleError&&(peopleError.textContent="Ingrese la cantidad de personas."); peopleError?.classList.remove("hidden"); ok=false;}
  else if(ppl>200){ peopleError&&(peopleError.textContent="Máximo 200 personas."); peopleError?.classList.remove("hidden"); ok=false;}
  else peopleError?.classList.add("hidden");

  if(eventSelect && (!eventSelect.value || eventSelect.value==="(sin permiso)")){eventError?.classList.remove("hidden"); ok=false;} else eventError?.classList.add("hidden");

  if(!mesasSeleccionadas.length){ tablesError&&(tablesError.textContent="Por favor seleccione las mesas."); tablesError?.classList.remove("hidden"); ok=false;}
  else tablesError?.classList.add("hidden");

  return ok;
}

async function handleSave(){
  if(!validateForm()) return;
  const payload=uiToApiPayload();
  try{
    if(editingId!=null) await updateReserva(editingId,payload);
    else                await createReserva(payload);
    await loadFromAPI(); clearForm(); closeForm();
  }catch(err){ console.error("[Guardar] Error:",err); alert("No se pudo guardar. Revisa la consola para más detalle."); }
}

// ---------- Modal Mesas (autoconstruido si falta) ----------
function ensureTablesModal() {
  let modal = $("#tables-modal");
  if (modal) return modal;

  modal = document.createElement("div");
  modal.id = "tables-modal";
  modal.className = "fixed inset-0 z-[1000] hidden";
  modal.innerHTML = `
    <div class="absolute inset-0 bg-black/40" data-overlay="true"></div>
    <div class="relative w-full h-full flex items-start md:items-center justify-center p-4 md:p-6">
      <div class="w-full max-w-3xl bg-white rounded-2xl shadow-2xl overflow-hidden">
        <div class="flex items-center justify-between px-6 py-4 border-b">
          <h3 class="text-lg font-semibold">Seleccionar Mesas</h3>
          <button id="close-tables-modal" class="text-gray-500 hover:text-gray-700" type="button">
            <i class="fa-solid fa-xmark text-xl"></i>
          </button>
        </div>
        <div class="px-6 py-4">
          <input id="tables-search" class="w-full border rounded-lg px-3 py-2 mb-3" placeholder="Buscar por número o nombre...">
          <div id="tables-grid" class="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-3"></div>
        </div>
        <div class="px-6 py-4 border-t flex justify-end gap-3">
          <button id="cancel-tables-btn" class="px-4 py-2 rounded-lg bg-gray-200 hover:bg-gray-300" type="button">Cancelar</button>
          <button id="save-tables-btn" class="px-4 py-2 rounded-lg bg-blue-600 text-white hover:bg-blue-700" type="button">Guardar</button>
        </div>
      </div>
    </div>`;
  document.body.appendChild(modal);
  return modal;
}

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
  const modal = ensureTablesModal();
  const overlay         = modal.querySelector('[data-overlay="true"]');
  const closeBtn        = modal.querySelector("#close-tables-modal");
  const cancelBtn       = modal.querySelector("#cancel-tables-btn");
  const saveBtn         = modal.querySelector("#save-tables-btn");
  const tablesGrid      = modal.querySelector("#tables-grid");
  const tablesSearch    = modal.querySelector("#tables-search");

  // Carga mesas
  let list = [];
  try { list = await getMesas(); } catch { list = []; }
  if (!Array.isArray(list) || !list.length) {
    list = Array.from({length:12}, (_,i)=>({ idMesa:i+1, numero:i+1, capacidad:4 }));
  }

  const selected = new Set(mesasSeleccionadas.map(Number));
  const render = (q="") => {
    const s=q.trim().toLowerCase();
    const view = !s ? list : list.filter(m => String(m.numero ?? m.nombre ?? m.idMesa ?? m.id).toLowerCase().includes(s));
    tablesGrid.innerHTML = view.map(m => mesaBtnHTML(m, selected.has(Number(m.idMesa ?? m.id ?? m.IdMesa ?? m.Id ?? m.numero)))).join("");
  };
  render("");

  // Handlers (todos con guardias)
  tablesGrid.onclick = (ev) => {
    const btn = ev.target.closest("button[data-mesa]");
    if (!btn) return;
    const id = Number(btn.dataset.mesa);
    const icon = btn.querySelector("i");
    if (selected.has(id)) { selected.delete(id); btn.classList.remove("mesa-btn-selected"); icon?.classList.add("opacity-0"); }
    else { selected.add(id); btn.classList.add("mesa-btn-selected"); icon?.classList.remove("opacity-0"); }
  };
  if (tablesSearch) {
    tablesSearch.oninput = () => render(tablesSearch.value);
  }

  const close = () => modal.classList.add("hidden");
  overlay?.addEventListener("click", close, { once:true });
  closeBtn?.addEventListener("click", close, { once:true });
  cancelBtn?.addEventListener("click", close, { once:true });

  saveBtn?.addEventListener("click", () => {
    mesasSeleccionadas = Array.from(selected).sort((a,b)=>a-b);
    selectedTablesText && (selectedTablesText.textContent = mesasSeleccionadas.length
      ? "Mesas seleccionadas: " + mesasSeleccionadas.join(", ")
      : "Ninguna mesa seleccionada.");
    tablesError?.classList.add("hidden");
    close();
  }, { once:true });

  modal.classList.remove("hidden");
}

// ---------- tipos de evento ----------
async function loadTiposEvento(){
  if (!eventSelect) return;
  try {
    const tipos = await getTiposReserva();
    if (Array.isArray(tipos) && tipos.length) {
      eventSelect.innerHTML = `<option value="">Seleccione...</option>` +
        tipos.map(t=>{
          const nom = t.tipo ?? t.nombre ?? t.tipoReserva ?? t.descripcion ?? "—";
          return `<option value="${esc(nom)}">${esc(nom)}</option>`;
        }).join("");
      return;
    }
    throw new Error("Respuesta vacía");
  } catch (e) {
    // Fallback visible cuando hay 401/403
    const fallback = ["Boda","Cumpleaños","Aniversario","Reunión","Otro"];
    eventSelect.innerHTML = `<option value="">Seleccione...</option>` +
      fallback.map(n=>`<option value="${esc(n)}">${esc(n)}</option>`).join("");
    console.warn("No se pudieron cargar los tipos de evento:", e?.message || e);
  }
}

// ---------- eventos UI ----------
newReservationBtn?.addEventListener("click", ()=>{ clearForm(); setFormModeCreate(); openForm(); });
cancelReservationBtn?.addEventListener("click", ()=>{ clearForm(); closeForm(); });
saveReservationBtn?.addEventListener("click", (e)=>{ e.preventDefault(); handleSave(); });

selectTablesBtn?.addEventListener("click", (e)=>{ e.preventDefault(); openTablesModal(); });

// ---------- init ----------
(function init(){
  clientPhoneInput?.addEventListener("input", () => {
    let v=clientPhoneInput.value.replace(/[^0-9]/g,"").slice(0,8);
    if (v.length>4) v=v.slice(0,4)+"-"+v.slice(4);
    clientPhoneInput.value=v;
  });
  peopleInput?.addEventListener("input", () => {
    let v=peopleInput.value.replace(/[^0-9]/g,"");
    if (v==="") v="";
    const n=parseInt(v||"0",10);
    if (Number.isFinite(n)&&n>200) v="200";
    peopleInput.value=v;
  });

  loadTiposEvento();   // llena combo (o fallback)
  loadFromAPI();       // lista reservas
})();
