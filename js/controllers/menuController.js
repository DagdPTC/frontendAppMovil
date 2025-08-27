// js/controllers/menuController.js
// Tarjetas SIN imagen; carga desde API con deducción de categorías si hace falta.
// Si la API devuelve 0 platillos, NO lanza error: muestra "No hay platillos".

import { getCategorias, getPlatillos } from "../services/menuService.js";

const $  = s => document.querySelector(s);
const $$ = s => Array.from(document.querySelectorAll(s));
const toMoney = n => `$${Number(n || 0).toFixed(2)}`;

function slugify(s) {
  return String(s || "")
    .normalize("NFD").replace(/[\u0300-\u036f]/g, "")
    .toLowerCase().replace(/\s+/g, " ").trim();
}
function categoryBadgeClass(cat) {
  const c = slugify(cat);
  if (c.includes("entrada")) return "bg-amber-100 text-amber-700";
  if (c.includes("plato"))   return "bg-emerald-100 text-emerald-700";
  if (c.includes("bebida"))  return "bg-sky-100 text-sky-700";
  if (c.includes("postre"))  return "bg-pink-100 text-pink-700";
  if (c.includes("sopa"))    return "bg-lime-100 text-lime-700";
  if (c.includes("ensalada"))return "bg-teal-100 text-teal-700";
  if (c.includes("pizza"))   return "bg-orange-100 text-orange-700";
  if (c.includes("taco"))    return "bg-yellow-100 text-yellow-700";
  return "bg-gray-100 text-gray-700";
}
function titleCase(str){ return String(str||"").toLowerCase().replace(/\b\w/g,m=>m.toUpperCase()); }

/* ===== Estado ===== */
let INIT_DONE = false;
let CATEGORIAS = [];        // [{id, nombre, slug}]
let PLATILLOS = [];         // [{id, nombre, descripcion, precio, idCategoria, nomCategoria}]
let CAT_BY_ID = new Map();  // id -> cat
let CAT_ORDER = [];         // slugs para botones

document.addEventListener("DOMContentLoaded", init);

async function init(){
  if (INIT_DONE) return;
  INIT_DONE = true;

  attachUiHandlers();
  showSkeleton();

  try{
    await loadData();
    buildCategoryButtons();
    renderDishes(PLATILLOS);
    animateCards();
  }catch(e){
    console.error("[MENÚ] Error (no bloqueante):", e);
    // Si algo falló duro, al menos intenta mostrar 'No hay platillos'
    renderDishes([]);
  }
}

/* ===== UI ===== */
function attachUiHandlers(){
  $("#filter-button")?.addEventListener("click", () => {
    $("#category-filter")?.classList.toggle("hidden");
  });
  $("#search-dishes")?.addEventListener("input", onSearchInput);
}

/* ===== Data ===== */
async function loadData(){
  const cont = $("#dishes-container");
  if (cont) cont.innerHTML = `<div class="text-center text-gray-500 py-6">Cargando menú...</div>`;

  // 1) Platillos (si no hay, no lanzamos: sólo mostramos vacío)
  let dishes = [];
  try {
    dishes = await getPlatillos(0, 200);
    console.info(`[MENÚ] Platillos recibidos: ${dishes.length}`);
  } catch (e) {
    console.error("[MENÚ] Falló GET platillos:", e);
    dishes = [];
  }

  // 2) Categorías (si falla o viene vacío, deducimos de platillos)
  let cats = [];
  try {
    cats = await getCategorias(0, 200);
    console.info(`[MENÚ] Categorías recibidas: ${cats.length}`);
  } catch (e) {
    console.warn("[MENÚ] Categorías no disponibles, se deducen de platillos.");
  }

  if (!cats.length && dishes.length) {
    const map = new Map();
    dishes.forEach(p => {
      const id = p.idCategoria ?? -1;
      const name = p.nomCategoria || (id === -1 ? "Otros" : `Cat ${id}`);
      if (!map.has(id)) map.set(id, { id, nombre: String(name) });
    });
    cats = Array.from(map.values());
  }

  // Estructuras internas
  CATEGORIAS = cats.map(c => ({ ...c, slug: slugify(c.nombre) }));
  CAT_BY_ID  = new Map(CATEGORIAS.map(c => [c.id, c]));
  CAT_ORDER  = ["all", ...CATEGORIAS.map(c => c.slug)];
  PLATILLOS  = dishes;
}

/* ===== Skeleton ===== */
function showSkeleton(){
  const cont = $("#dishes-container");
  if (!cont) return;
  cont.innerHTML = `
    <div class="grid grid-cols-2 gap-4 w-full">
      ${Array.from({length: 6}).map(() => `
        <div class="animate-pulse bg-white border border-gray-200 rounded-lg p-3 space-y-2">
          <div class="h-4 bg-gray-200 rounded w-3/4"></div>
          <div class="h-3 bg-gray-200 rounded w-5/6"></div>
          <div class="h-4 bg-gray-200 rounded w-1/3"></div>
        </div>
      `).join("")}
    </div>
  `;
}

/* ===== Categorías ===== */
function buildCategoryButtons(){
  const wrap = $("#category-filter .flex.flex-wrap") || $("#category-filter");
  if (!wrap) return;

  wrap.innerHTML = "";
  // Siempre hay "Todos" aunque no haya categorías/platillos
  wrap.appendChild(makeCatBtn("Todos", "all", true));
  CATEGORIAS.forEach(c => wrap.appendChild(makeCatBtn(c.nombre, c.slug, false)));
}

function makeCatBtn(label, value, active){
  const btn = document.createElement("button");
  btn.className = `category-btn ${active ? "bg-blue-100 text-blue-600" : "bg-gray-100 text-gray-600"} px-3 py-1 rounded-full text-sm font-medium`;
  btn.dataset.category = value;
  btn.textContent = label;

  btn.addEventListener("click", () => {
    $$(".category-btn").forEach(b => b.classList.remove("bg-blue-100","text-blue-600"));
    $$(".category-btn").forEach(b => b.classList.add("bg-gray-100","text-gray-600"));
    btn.classList.remove("bg-gray-100","text-gray-600");
    btn.classList.add("bg-blue-100","text-blue-600");
    applyCategoryFilter(value);
  });

  return btn;
}

function applyCategoryFilter(slug){
  const chosen = String(slug || "all");
  $$("#dishes-container .dish-card").forEach(card => {
    const dishCat = card.dataset.category || "all";
    card.classList.toggle("hidden", !(chosen === "all" || dishCat === chosen));
  });
}

/* ===== Búsqueda ===== */
function onSearchInput(e){
  const term = (e.target.value || "").toLowerCase();
  $$("#dishes-container .dish-card").forEach(dish => {
    const name = (dish.querySelector("h3")?.textContent || "").toLowerCase();
    const description = (dish.querySelector("p")?.textContent || "").toLowerCase();
    dish.classList.toggle("hidden", !(name.includes(term) || description.includes(term)));
  });
}

/* ===== Render ===== */
function renderDishes(items){
  const cont = $("#dishes-container");
  if (!cont) return;
  cont.innerHTML = "";

  if (!items.length) {
    cont.innerHTML = `<div class="col-span-2 text-center text-gray-500 py-6">No hay platillos.</div>`;
    return;
  }

  items.forEach(p => {
    const catObj  = CAT_BY_ID.get(p.idCategoria) || null;
    const catName = catObj?.nombre || (p.nomCategoria || "Otros");
    const catSlug = catObj?.slug || slugify(catName);

    const card = document.createElement("div");
    card.className = "dish-card bg-white border border-gray-200 rounded-lg p-3";
    card.dataset.category = catSlug;

    const header = document.createElement("div");
    header.className = "flex items-start justify-between";

    const title = document.createElement("h3");
    title.className = "font-bold";
    title.textContent = p.nombre;

    const badge = document.createElement("span");
    badge.className = `text-[11px] px-2 py-0.5 rounded-full font-medium ${categoryBadgeClass(catName)}`;
    badge.textContent = titleCase(catName);

    const desc = document.createElement("p");
    desc.className = "text-xs text-gray-600 mt-1";
    desc.textContent = p.descripcion;

    const price = document.createElement("p");
    price.className = "text-blue-600 font-bold mt-2";
    price.textContent = toMoney(p.precio);

    header.append(title, badge);
    card.append(header, desc, price);
    cont.appendChild(card);
  });
}

/* ===== Animación ===== */
function animateCards(){
  $$("#dishes-container .dish-card").forEach(d => d.classList.add("platillo-animado"));
}
