// js/controllers/menuSelectController.js
// Modo selección para el Menú (sin cambiar el diseño)
// - Activación: ?select=1  OR  #select  OR  sessionStorage("ord_select_mode") === "1"
// - Guarda selección en sessionStorage key: "ord_dishes_sel"
// - Botón "Listo (n)" usa tu #finalize-selection-btn y queda fijo arriba del nav inferior

const K_SEL  = "ord_dishes_sel";
const K_FLAG = "ord_select_mode";

const $  = (s, r=document) => r.querySelector(s);
const $$ = (s, r=document) => Array.from(r.querySelectorAll(s));

function getSel() {
  try { return JSON.parse(sessionStorage.getItem(K_SEL) || "[]"); } catch { return []; }
}
function setSel(a)      { sessionStorage.setItem(K_SEL, JSON.stringify(a)); }
function isSelected(id) { return getSel().some(x => String(x.id) === String(id)); }

function addItem({id, nombre, precio}) {
  const arr = getSel();
  if (!arr.some(x => String(x.id) === String(id))) {
    arr.push({ id, nombre, precio: Number(precio || 0), qty: 1 });
    setSel(arr);
  }
}
function removeItem(id) {
  setSel(getSel().filter(x => String(x.id) !== String(id)));
}

// Fijar botón "Listo" arriba del nav inferior
function updateListo() {
  const wrap = $("#finalize-selection-btn");
  const btn  = $("#finalize-selection-btn button");
  if (!wrap || !btn) return;

  // Colocación fija
  wrap.classList.remove("sticky");
  wrap.classList.add("fixed", "left-4", "right-4", "z-50");
  wrap.style.bottom = "72px"; // ajusta si tu navbar es más alta
  btn.classList.add("w-full", "rounded-xl", "shadow-md");

  const count = getSel().reduce((a,b) => a + (b.qty || 1), 0);
  btn.textContent = count > 0 ? `Listo (${count})` : "Listo";
  wrap.classList.remove("hidden");
}

function toggleBtn(btn, selected) {
  if (selected) {
    btn.textContent = "Cancelar";
    btn.className = "w-full mt-2 rounded bg-red-500 text-white text-sm py-1.5";
  } else {
    btn.textContent = "Agregar";
    btn.className = "w-full mt-2 rounded bg-green-500 text-white text-sm py-1.5";
  }
}

function ensureFooter(card) {
  let footer = card.querySelector(".menu-card-footer");
  if (!footer) {
    footer = document.createElement("div");
    footer.className = "menu-card-footer";
    card.appendChild(footer);
  }
  return footer;
}

// hash simple si no tenemos id del backend
function genIdFromName(name) {
  let h = 0;
  const s = String(name || "platillo");
  for (let i=0;i<s.length;i++) h = (h*31 + s.charCodeAt(i))|0;
  return String(Math.abs(h));
}

function getInfoFromCard(card) {
  let id     = card.dataset.id;
  let nombre = card.dataset.nombre || card.querySelector("h3")?.textContent?.trim();
  let precio = card.dataset.precio;

  if (precio == null) {
    const priceEl = card.querySelector(".text-blue-600.font-bold") || card;
    const m = (priceEl.textContent || "").match(/\$ ?([\d]+(?:\.\d+)?)/);
    precio = m ? m[1] : "0";
  }
  if (!id) id = genIdFromName(nombre);
  return { id, nombre, precio: Number(precio || 0) };
}

function mountButtons() {
  const cards = $$(".dish-card, .menu-item");
  cards.forEach(card => {
    if (card.__mountedSelectBtn) return;

    const info = getInfoFromCard(card);
    if (!info.nombre) return;

    const footer = ensureFooter(card);
    const btn = document.createElement("button");
    toggleBtn(btn, isSelected(info.id));
    footer.appendChild(btn);
    card.__mountedSelectBtn = true;

    btn.addEventListener("click", (e) => {
      e.stopPropagation();
      const sel = isSelected(info.id);
      if (sel) removeItem(info.id); else addItem(info);
      toggleBtn(btn, !sel);
      updateListo();
    });
  });
}

function wireListo() {
  const wrap = $("#finalize-selection-btn");
  const btn  = $("#finalize-selection-btn button");
  if (!wrap || !btn) return;

  const params  = new URLSearchParams(location.search);
  const backRaw = params.get("back") || "orders.html";
  // Si no trae hash, lo forzamos a #new para que se abra el form
  const back = backRaw.includes("#") ? backRaw : `${backRaw}#new`;

  wrap.classList.remove("hidden");
  updateListo();

  btn.addEventListener("click", () => {
    // Garantizamos que al volver se abra el formulario
    sessionStorage.setItem("ord_open_form", "1");
    window.location.href = back;
  });
}


function inSelectMode() {
  const params = new URLSearchParams(location.search);
  if (params.get("select") === "1") return true;
  if (location.hash === "#select") return true;
  if (sessionStorage.getItem(K_FLAG) === "1") return true;
  return false;
}

function init() {
  if (!inSelectMode()) return;

  wireListo();
  mountButtons();

  const obs = new MutationObserver(() => mountButtons());
  obs.observe(document.body, { childList: true, subtree: true });
}

document.addEventListener("DOMContentLoaded", init);
