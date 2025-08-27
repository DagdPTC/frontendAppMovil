// js/controllers/mesaController.js
// Render de tarjetas + ciclo de estado con un click.
// Intenta PATCH; si el backend no confirma el cambio, fallback a PUT con 4 campos válidos.
// IDs REALES: 1=Disponible, 3=Ocupada, 2=Reservada, 21=Limpieza  ← ¡OJO!

import { getMesas, patchEstadoMesa, putMesaCompleta } from "../services/mesaService.js";

/* ===== Estados y estilos ===== */
const LIMPIEZA_ID = 21; // 👈 Limpieza es 21 en tu BD

const STATE_BY_ID = {
  1:  { id: 1,  key: "disponible", label: "Disponible", classes: "bg-green-100 text-green-600" },
  3:  { id: 3,  key: "ocupada",    label: "Ocupada",    classes: "bg-red-100 text-red-600" },
  2:  { id: 2,  key: "reservada",  label: "Reservada",  classes: "bg-yellow-100 text-yellow-600" },
  21: { id: 21, key: "limpieza",   label: "Limpieza",   classes: "bg-purple-100 text-purple-600" },
};

// ciclo 1→3→2→21→1
const NEXT_ID = { 1: 3, 3: 2, 2: 21, 21: 1 };
const VALID_IDS = new Set([1, 2, 3, 21]);

/* ===== Visual extra (capacidad como tu UI) ===== */
function getTypeByNumber(n){ if(n>=1&&n<=4)return "dos"; if(n>=5&&n<=8)return "cuatro"; return "familiar"; }
function typeLabel(t){ return t==="dos" ? "2 personas" : (t==="cuatro" ? "4 personas" : "Familiar"); }

/* ===== Utils ===== */
const toInt = v => { const n = Number(v); return Number.isFinite(n) ? n : 0; };
function extractNumberFromName(name){ const m = String(name||"").match(/(\d+)/); return m ? parseInt(m[1],10) : 0; }
function resolveMesaNumber(dto){
  const n1 = toInt(dto.Numero ?? dto.number); if (n1 > 0) return n1;
  const n2 = extractNumberFromName(dto.NomMesa ?? dto.nomMesa); if (n2 > 0) return n2;
  const id = toInt(dto.Id ?? dto.id ?? dto.idMesa); return id > 0 ? id : 1;
}
function stateFromId(id){ return STATE_BY_ID[id] ?? STATE_BY_ID[1]; }

/* ===== Estado en memoria ===== */
const mesasCache = new Map(); // idMesa -> DTO
let grid = null;

/* ===== Boot ===== */
document.addEventListener("DOMContentLoaded", () => {
  grid = document.getElementById("table-grid");
  cargarMesas();
});

/* ===== Carga inicial ===== */
async function cargarMesas() {
  if (grid) grid.innerHTML = `<div class="col-span-2 text-center py-6" style="color:#6b7280">Cargando mesas...</div>`;
  try {
    const mesas = await getMesas(0, 50);
    mesasCache.clear();
    renderMesasUI(mesas);
  } catch (e) {
    console.error(e);
    if (grid) grid.innerHTML = `<div class="col-span-2 text-center py-6" style="color:#dc2626">Error cargando mesas.</div>`;
  }
}

/* ===== Render ===== */
function renderMesasUI(mesasDTO) {
  if (!grid) return;
  grid.innerHTML = "";

  if (!Array.isArray(mesasDTO) || mesasDTO.length === 0) return;

  mesasDTO.forEach(dto => {
    const id = dto.Id ?? dto.id ?? dto.idMesa;
    if (id == null) return;

    const number = resolveMesaNumber(dto);
    const type   = getTypeByNumber(number);
    const stId   = toInt(dto.IdEstadoMesa ?? dto.idEstadoMesa);
    const st     = stateFromId(VALID_IDS.has(stId) ? stId : 1);

    mesasCache.set(String(id), dto);

    const card = document.createElement("div");
    card.className = `mesa-animada p-8 min-h-32 rounded-xl border border-gray-200 ${st.classes} text-center font-semibold text-lg`;
    card.dataset.mesaId   = String(id);
    card.dataset.mesaNum  = String(number);
    card.dataset.estadoId = String(st.id);
    card.dataset.busy     = "0";

    card.innerHTML = `
      Mesa ${number}
      <br><span class="text-sm capitalize mesa-estado">${st.label}</span>
      <br><span class="text-sm">${typeLabel(type)}</span>
    `;

    card.addEventListener("click", () => onCardClick(card, type));
    grid.appendChild(card);
  });
}

/* ===== Click: ciclo completo + PATCH con fallback a PUT ===== */
async function onCardClick(card, type) {
  if (!card || card.dataset.busy === "1") return;
  card.dataset.busy = "1";

  const mesaId = card.dataset.mesaId;
  const dto    = mesasCache.get(String(mesaId));
  if (!dto) { card.dataset.busy = "0"; return; }

  const beforeId = toInt(card.dataset.estadoId);
  const nextId   = NEXT_ID[beforeId] ?? 1;
  const beforeSt = stateFromId(beforeId);
  const nextSt   = stateFromId(nextId);

  // UI optimista inmediata
  applyCardState(card, nextSt, type);

  try {
    // 1) Intento PATCH /estado/{id}/{estadoId}
    let resp = null;
    try { resp = await patchEstadoMesa(mesaId, nextId); } catch (e) { resp = null; }

    // 2) Si el backend no confirma (o devuelve el estado previo), fallback a PUT con 4 campos
    let returnedId = toInt(resp?.IdEstadoMesa ?? resp?.idEstadoMesa);
    if (!VALID_IDS.has(returnedId) || returnedId === beforeId) {
      try {
        const putResp = await putMesaCompleta(mesaId, dto, nextId);
        returnedId = toInt(putResp?.IdEstadoMesa ?? putResp?.idEstadoMesa) || nextId;
        resp = putResp;
      } catch (e) {
        console.warn("PUT fallback falló o no devolvió estado; se fuerza nextId en UI", e);
        returnedId = nextId;
      }
    }

    // 3) Sanitiza estado final (acepta 1,2,3,21)
    if (!VALID_IDS.has(returnedId)) returnedId = nextId;
    const finalSt = stateFromId(returnedId);
    applyCardState(card, finalSt, type);

    // 4) Actualiza cache con el estado final
    mesasCache.set(String(mesaId), { ...dto, ...(resp || {}), IdEstadoMesa: finalSt.id, idEstadoMesa: finalSt.id });

  } catch (err) {
    console.error("Cambio de estado falló:", err);
    // rollback visual si todo falló
    applyCardState(card, beforeSt, type);
  } finally {
    card.dataset.busy = "0";
  }
}

/* ===== Helpers de UI ===== */
function applyCardState(card, state, type) {
  card.className =
    `mesa-animada p-8 min-h-32 rounded-xl border border-gray-200 ` +
    `${state.classes} text-center font-semibold text-lg`;
  const number = card.dataset.mesaNum;
  card.innerHTML = `
    Mesa ${number}
    <br><span class="text-sm capitalize mesa-estado">${state.label}</span>
    <br><span class="text-sm">${typeLabel(type)}</span>
  `;
  card.dataset.estadoId = String(state.id);
}
