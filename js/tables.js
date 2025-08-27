// js/tables.js (UNIFICADO)
// - Fuente de datos: SOLO API.
// - Si la base está vacía, se muestran 0 tarjetas.
// - Clic en una mesa: cicla el estado y hace PUT real a la API.
// - Visual idéntica a tu UI actual.

//////////////////////////
// Config API (ajusta)  //
//////////////////////////
const API_BASE = "http://localhost:8080";
const API = {
  mesa: `${API_BASE}/apiMesa`,
};

//////////////////////////
// Servicios a la API   //
//////////////////////////
async function getMesas(page = 0, size = 50) {
  const url = `${API.mesa}/getDataMesa?page=${encodeURIComponent(page)}&size=${encodeURIComponent(size)}`;
  const res = await fetch(url, { method: "GET" });
  if (!res.ok) throw new Error(`GET Mesas: ${res.status} ${res.statusText}`);
  const data = await res.json();
  return Array.isArray(data?.content) ? data.content : [];
}

async function updateMesa(id, dtoCompleto) {
  const url = `${API.mesa}/modificarMesa/${encodeURIComponent(id)}`;
  const res = await fetch(url, {
    method: "PUT",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(dtoCompleto),
  });
  if (!res.ok) throw new Error(`PUT Mesa ${id}: ${res.status} ${res.statusText}`);
  return await res.json();
}

//////////////////////////
// Utilidades de estado //
//////////////////////////
const statusOrder = ["disponible", "reservada", "ocupada", "limpieza"];
const statusColors = {
  disponible: "bg-green-100 text-green-600",
  reservada: "bg-yellow-100 text-yellow-600",
  ocupada: "bg-red-100 text-red-600",
  limpieza: "bg-purple-100 text-purple-600",
};
function estadoIdToString(id) {
  const n = Number(id);
  if (n === 1) return "disponible";
  if (n === 2) return "reservada";
  if (n === 3) return "ocupada";
  if (n === 4) return "limpieza";
  return "disponible";
}
function estadoStringToId(s) {
  const v = String(s || "").toLowerCase();
  if (v === "disponible") return 1;
  if (v === "reservada") return 2;
  if (v === "ocupada") return 3;
  if (v === "limpieza") return 4;
  return 1;
}

// Tipos (solo para mostrar capacidad igual que tu UI)
const typeCapacity = { dos: 2, cuatro: 4, familiar: 6 };
function getTypeByNumber(n) {
  if (n >= 1 && n <= 4) return "dos";
  if (n >= 5 && n <= 8) return "cuatro";
  return "familiar";
}
function typeLabel(t) {
  if (t === "dos") return "2 personas";
  if (t === "cuatro") return "4 personas";
  return "Familiar";
}

// Extrae número visible desde "NomMesa" si no existe campo Numero
function extractNumberFromName(name) {
  const m = String(name || "").match(/(\d+)/);
  return m ? Number(m[1]) : null;
}

//////////////////////////
// Estado en memoria    //
//////////////////////////
const mesasCache = new Map();     // idMesa -> DTO completo
const numeroToMesaId = new Map(); // número visible -> idMesa
let tableGrid = null;

//////////////////////////
// Render de la pantalla//
//////////////////////////
function renderMesasUI(mesasDTO) {
  tableGrid.innerHTML = "";

  if (!mesasDTO.length) {
    // Si quieres placeholder, descomenta esta línea:
    // tableGrid.innerHTML = '<div class="col-span-2 text-center py-6 text-gray-500">No hay mesas registradas.</div>';
    return;
  }

  mesasDTO.forEach((dto) => {
    const id = dto.Id ?? dto.id ?? dto.idMesa;

    // número visible: prioriza un campo Numero, si no, parsea de NomMesa; si nada, usa el id
    const number =
      Number(dto.Numero) ||
      Number(dto.number) ||
      extractNumberFromName(dto.NomMesa ?? dto.nomMesa) ||
      Number(id);

    const estadoStr = estadoIdToString(dto.IdEstadoMesa ?? dto.idEstadoMesa ?? dto.estado ?? dto.status);
    const type = getTypeByNumber(Number(number) || 1);
    const cap = typeCapacity[type];

    const card = document.createElement("div");
    card.className =
      `mesa-animada p-8 min-h-32 rounded-xl border border-gray-200 ` +
      `${statusColors[estadoStr] || "bg-gray-100 text-gray-700"} ` +
      `text-center font-semibold text-lg`;
    card.dataset.mesaId = id;       // ID real en la API
    card.dataset.mesaNumber = number; // número visible (para UI)

    card.innerHTML = `
      Mesa ${number}
      <br><span class="text-sm capitalize">${estadoStr}</span>
      <br><span class="text-sm">${typeLabel(type)}</span>
    `;

    // Clic: cicla estado (en el mismo orden que tu UI) y hace PUT
    card.addEventListener("click", async () => {
      try {
        const current = estadoStrFromCard(card);
        const nextIdx = (statusOrder.indexOf(current) + 1) % statusOrder.length;
        const nextStr = statusOrder[nextIdx];
        const nextId = estadoStringToId(nextStr);

        const mesaId = card.dataset.mesaId;
        const dtoActual = mesasCache.get(String(mesaId));
        if (!dtoActual) return;

        const dtoActualizado = { ...dtoActual, IdEstadoMesa: nextId };
        const respuesta = await updateMesa(mesaId, dtoActualizado);

        // cache
        mesasCache.set(String(mesaId), respuesta);

        // refrescar UI de esta tarjeta
        const finalStr = estadoIdToString(respuesta.IdEstadoMesa ?? respuesta.idEstadoMesa ?? nextId);
        card.className =
          `mesa-animada p-8 min-h-32 rounded-xl border border-gray-200 ` +
          `${statusColors[finalStr] || "bg-gray-100 text-gray-700"} ` +
          `text-center font-semibold text-lg`;
        card.innerHTML = `
          Mesa ${number}
          <br><span class="text-sm capitalize">${finalStr}</span>
          <br><span class="text-sm">${typeLabel(type)}</span>
        `;
      } catch (err) {
        console.error("Error cambiando estado:", err);
      }
    });

    tableGrid.appendChild(card);
  });
}

function estadoStrFromCard(cardEl) {
  const span = cardEl.querySelector("span.text-sm.capitalize");
  if (!span) return "disponible";
  return String(span.textContent || "").trim().toLowerCase();
}

//////////////////////////
// Carga inicial (API)  //
//////////////////////////
async function cargarMesasDesdeAPI() {
  tableGrid.innerHTML = `<div class="col-span-2 text-center py-6" style="color:#6b7280">Cargando mesas...</div>`;

  try {
    const mesas = await getMesas(0, 50);

    mesasCache.clear();
    numeroToMesaId.clear();

    mesas.forEach((m) => {
      const id = m.Id ?? m.id ?? m.idMesa;
      if (id == null) return;

      const numVisible =
        Number(m.Numero) ||
        Number(m.number) ||
        extractNumberFromName(m.NomMesa ?? m.nomMesa) ||
        Number(id);

      mesasCache.set(String(id), m);
      numeroToMesaId.set(Number(numVisible), id);
    });

    renderMesasUI(mesas);
  } catch (e) {
    console.error("Error cargando mesas:", e);
    tableGrid.innerHTML = `<div class="col-span-2 text-center py-6" style="color:#dc2626">Error cargando mesas.</div>`;
  }
}

//////////////////////////
// Boot                 //
//////////////////////////
document.addEventListener("DOMContentLoaded", () => {
  tableGrid = document.getElementById("table-grid");
  cargarMesasDesdeAPI();
});
