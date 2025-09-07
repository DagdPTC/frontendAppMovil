// js/controllers/menuController.js
import { getCategorias, getPlatillos } from "../services/menuService.js";

const $  = (s) => document.querySelector(s);
const $$ = (s) => Array.from(document.querySelectorAll(s));
const toMoney = (n) => `$${Number(n || 0).toFixed(2)}`;

const slugify = (s) =>
  String(s || "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/\s+/g, " ")
    .trim();

const badgeClass = (name) => {
  const c = slugify(name);
  if (c.includes("bebida")) return "bg-sky-100 text-sky-700";
  if (c.includes("postre")) return "bg-pink-100 text-pink-700";
  if (c.includes("plato")) return "bg-emerald-100 text-emerald-700";
  if (c.includes("entrada")) return "bg-amber-100 text-amber-700";
  return "bg-gray-100 text-gray-700";
};

let CATEGORIAS = []; // [{id, nombre, slug}]
let PLATILLOS = [];
let CAT_BY_ID = new Map();

document.addEventListener("DOMContentLoaded", init);

async function init() {
  $("#filter-button")?.addEventListener("click", () => {
    $("#category-filter")?.classList.toggle("hidden");
  });
  $("#search-dishes")?.addEventListener("input", onSearch);

  showSkeleton();

  // 1) Cargar platillos y categorías
  const [dishes, cats] = await Promise.all([
    getPlatillos(0), // ahora retorna array
    getCategorias(0),
  ]);

  PLATILLOS = dishes;
  CATEGORIAS = cats.map((c) => ({ ...c, slug: slugify(c.nombre) }));
  CAT_BY_ID = new Map(CATEGORIAS.map((c) => [c.id, c]));

  buildCategoryButtons();
  renderDishes(PLATILLOS);
  animateCards();
}

function showSkeleton() {
  const cont = $("#dishes-container");
  if (!cont) return;
  cont.innerHTML = `
    <div class="grid grid-cols-2 gap-4 w-full">
      ${Array.from({ length: 6 })
        .map(
          () => `
        <div class="animate-pulse bg-white border border-gray-200 rounded-lg p-3 space-y-2">
          <div class="h-20 bg-gray-200 rounded w-full"></div>
          <div class="h-4 bg-gray-200 rounded w-3/4"></div>
          <div class="h-3 bg-gray-200 rounded w-5/6"></div>
          <div class="h-4 bg-gray-200 rounded w-1/3"></div>
        </div>
      `
        )
        .join("")}
    </div>
  `;
}

/* ---------- Filtro categorías ---------- */
function buildCategoryButtons() {
  const wrap = $("#category-filter .flex.flex-wrap") || $("#category-filter");
  if (!wrap) return;
  wrap.innerHTML = "";

  const btnAll = makeCatBtn("Todos", "all", true);
  wrap.appendChild(btnAll);

  CATEGORIAS.forEach((c) => {
    wrap.appendChild(makeCatBtn(c.nombre, c.slug, false));
  });
}

function makeCatBtn(label, value, active) {
  const btn = document.createElement("button");
  btn.className = `category-btn ${
    active ? "bg-blue-100 text-blue-600" : "bg-gray-100 text-gray-600"
  } px-3 py-1 rounded-full text-sm font-medium`;
  btn.dataset.category = value;
  btn.textContent = label;

  btn.addEventListener("click", () => {
    $$(".category-btn").forEach((b) =>
      b.classList.remove("bg-blue-100", "text-blue-600")
    );
    $$(".category-btn").forEach((b) =>
      b.classList.add("bg-gray-100", "text-gray-600")
    );
    btn.classList.remove("bg-gray-100", "text-gray-600");
    btn.classList.add("bg-blue-100", "text-blue-600");
    applyCategoryFilter(value);
  });

  return btn;
}

function applyCategoryFilter(slug) {
  const chosen = String(slug || "all");
  $$("#dishes-container .dish-card").forEach((card) => {
    const dishCat = card.dataset.category || "all";
    card.classList.toggle(
      "hidden",
      !(chosen === "all" || dishCat === chosen)
    );
  });
}

/* ---------- Búsqueda ---------- */
function onSearch(e) {
  const term = (e.target.value || "").toLowerCase();
  $$("#dishes-container .dish-card").forEach((dish) => {
    const name = (dish.querySelector("h3")?.textContent || "").toLowerCase();
    const description = (dish.querySelector("p")?.textContent || "").toLowerCase();
    dish.classList.toggle(
      "hidden",
      !(name.includes(term) || description.includes(term))
    );
  });
}

/* ---------- Render con imágenes ---------- */
function renderDishes(items) {
  const cont = $("#dishes-container");
  if (!cont) return;
  cont.innerHTML = "";

  if (!items.length) {
    cont.innerHTML = `<div class="col-span-2 text-center text-gray-500 py-6">No hay platillos.</div>`;
    return;
  }

  items.forEach((p) => {
    const cat = CAT_BY_ID.get(Number(p.idCategoria));
    const catName = cat?.nombre || "Otros";
    const catSlug = cat?.slug || slugify(catName);

    const card = document.createElement("div");
    card.className =
      "dish-card bg-white border border-gray-200 rounded-lg p-3 flex flex-col";
    card.dataset.category = catSlug;

    // Metadatos para selección
    card.classList.add("menu-item");
    card.dataset.id = String(p.id);
    card.dataset.nombre = p.nombre;
    card.dataset.precio = String(p.precio);

    // === Imagen ===
    const img = document.createElement("img");
    img.className = "w-full h-32 object-cover rounded-md mb-2";
    img.src = p.imagenUrl || "img/no-image.png";
    img.alt = p.nombre;
    img.onerror = () => {
      img.src = "img/no-image.png";
    };

    const header = document.createElement("div");
    header.className = "flex items-start justify-between";

    const title = document.createElement("h3");
    title.className = "font-bold text-sm";
    title.textContent = p.nombre;

    const badge = document.createElement("span");
    badge.className = `text-[11px] px-2 py-0.5 rounded-full font-medium ${badgeClass(
      catName
    )}`;
    badge.textContent = catName;

    const desc = document.createElement("p");
    desc.className = "text-xs text-gray-600 mt-1";
    desc.textContent = p.descripcion;

    const price = document.createElement("p");
    price.className = "text-blue-600 font-bold mt-2";
    price.textContent = toMoney(p.precio);

    header.append(title, badge);
    card.append(img, header, desc, price);
    cont.appendChild(card);
  });
}

function animateCards() {
  $$("#dishes-container .dish-card").forEach((d) =>
    d.classList.add("platillo-animado")
  );
}
