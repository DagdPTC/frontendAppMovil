// js/controllers/menuController.js
import { getCategorias, getPlatillos, getSessionUser, isAuthError } from "../services/menuService.js";

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

function renderAuthGate() {
  // busca el contenedor principal de la vista
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
        <p class="text-gray-600 mb-4">Inicia sesión para ver y gestionar el menú.</p>
        <a href="index.html"
           class="inline-flex items-center gap-2 px-4 py-2 rounded-xl bg-blue-600 text-white hover:bg-blue-700 transition">
          <i class="fa-solid fa-arrow-right-to-bracket"></i>
          Iniciar sesión
        </a>
      </div>
    </div>
  `;
}


const $  = (s) => document.querySelector(s);
const $$ = (s) => Array.from(document.querySelectorAll(s));
const toMoney = (n) => `$${Number(n || 0).toFixed(2)}`;

// Fallback EMBEBIDO: NO hace ninguna petición => no hay 404
const FALLBACK = `data:image/svg+xml;utf8,${encodeURIComponent(
  `<svg xmlns='http://www.w3.org/2000/svg' width='600' height='400'>
     <rect width='100%' height='100%' fill='#e5e7eb'/>
     <text x='50%' y='50%' dominant-baseline='middle' text-anchor='middle'
           font-family='system-ui, sans-serif' font-size='18' fill='#6b7280'>
       Sin imagen
     </text>
   </svg>`
)}`;

const slugify = (s) =>
  String(s || "")
    .normalize("NFD").replace(/[\u0300-\u036f]/g, "")
    .toLowerCase().replace(/\s+/g, " ").trim();

const badgeClass = (name) => {
  const c = slugify(name);
  if (c.includes("bebida"))  return "bg-sky-100 text-sky-700";
  if (c.includes("postre"))  return "bg-pink-100 text-pink-700";
  if (c.includes("plato"))   return "bg-emerald-100 text-emerald-700";
  if (c.includes("entrada")) return "bg-amber-100 text-amber-700";
  return "bg-gray-100 text-gray-700";
};

let CATEGORIAS = [];
let PLATILLOS = [];
let CAT_BY_ID = new Map();

document.addEventListener("DOMContentLoaded", init);

async function init() {
  // 1) VALIDAR SESIÓN ANTES DE MONTAR UI
  showLoader("Verificando sesión…");
  const me = await getSessionUser().catch(() => null);
  if (!me) {
    hideLoader();
    renderAuthGate();
    return; // no seguimos montando nada
  }
  hideLoader();

  // 2) Listeners básicos de la vista
  $("#filter-button")?.addEventListener("click", () => {
    $("#category-filter")?.classList.toggle("hidden");
  });
  $("#search-dishes")?.addEventListener("input", onSearch);

  // 3) Skeleton mientras carga
  showSkeleton();

  // 4) Cargar datos
  showLoader("Cargando platillos…");
  try {
    const [dishes, cats] = await Promise.all([getPlatillos(0), getCategorias(0)]);
    PLATILLOS  = dishes;
    CATEGORIAS = cats.map(c => ({ ...c, slug: slugify(c.nombre) }));
    CAT_BY_ID  = new Map(CATEGORIAS.map(c => [c.id, c]));
  } catch (err) {
    hideLoader();
    if (isAuthError(err)) { renderAuthGate(); return; }
    // Si es otro error, muestra "sin platillos" pero no rompas la vista
    console.error("Error cargando menú:", err);
    $("#dishes-container").innerHTML = `<div class="col-span-2 text-center text-gray-500 py-6">No fue posible cargar el menú.</div>`;
    return;
  }
  hideLoader();

  // 5) Render UI
  buildCategoryButtons();
  renderDishes(PLATILLOS);
  animateCards();

  // 6) Cortafuegos global para <img> rotas
  window.addEventListener("error", (ev) => {
    const el = ev.target;
    if (el && el.tagName === "IMG" && !el.dataset.fallbackApplied) {
      el.dataset.fallbackApplied = "1";
      el.onerror = null;
      el.removeAttribute("srcset");
      el.src = FALLBACK;
    }
  }, true);
}


function showSkeleton() {
  const cont = $("#dishes-container");
  if (!cont) return;
  cont.innerHTML = `
    <div class="grid grid-cols-2 gap-4 w-full">
      ${Array.from({ length: 6 }).map(() => `
        <div class="animate-pulse bg-white border border-gray-200 rounded-lg p-3 space-y-2">
          <div class="h-20 bg-gray-200 rounded w-full"></div>
          <div class="h-4 bg-gray-200 rounded w-3/4"></div>
          <div class="h-3 bg-gray-200 rounded w-5/6"></div>
          <div class="h-4 bg-gray-200 rounded w-1/3"></div>
        </div>
      `).join("")}
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
  CATEGORIAS.forEach(c => wrap.appendChild(makeCatBtn(c.nombre, c.slug, false)));
}

function makeCatBtn(label, value, active) {
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

function applyCategoryFilter(slug) {
  const chosen = String(slug || "all");
  $$("#dishes-container .dish-card").forEach(card => {
    const dishCat = card.dataset.category || "all";
    card.classList.toggle("hidden", !(chosen === "all" || dishCat === chosen));
  });
}

/* ---------- Búsqueda ---------- */
function onSearch(e) {
  const term = (e.target.value || "").toLowerCase();
  $$("#dishes-container .dish-card").forEach(dish => {
    const name = (dish.querySelector("h3")?.textContent || "").toLowerCase();
    const description = (dish.querySelector("p")?.textContent || "").toLowerCase();
    dish.classList.toggle("hidden", !(name.includes(term) || description.includes(term)));
  });
}

/* ---------- Render con imágenes (sin peticiones extra) ---------- */
function renderDishes(items) {
  const cont = $("#dishes-container");
  if (!cont) return;
  cont.innerHTML = "";

  if (!items.length) {
    cont.innerHTML = `<div class="col-span-2 text-center text-gray-500 py-6">No hay platillos.</div>`;
    return;
  }

  items.forEach(p => {
    const cat = CAT_BY_ID.get(Number(p.idCategoria));
    const catName = cat?.nombre || "Otros";
    const catSlug = cat?.slug || slugify(catName);

    const card = document.createElement("div");
    card.className = "dish-card bg-white border border-gray-200 rounded-lg p-3 flex flex-col";
    card.dataset.category = catSlug;

    // Metadatos selección
    card.classList.add("menu-item");
    card.dataset.id     = String(p.id);
    card.dataset.nombre = p.nombre;
    card.dataset.precio = String(p.precio);

    // Imagen
    const img = document.createElement("img");
    img.className = "w-full h-32 object-cover rounded-md mb-2";
    img.loading = "lazy";

    if (p.imagenUrl) {
      img.src = p.imagenUrl;
      img.alt = p.nombre;
      img.onerror = () => { img.onerror = null; img.removeAttribute("srcset"); img.src = FALLBACK; };
    } else {
      img.src = FALLBACK;      // NO genera request
      img.alt = "Sin imagen";
      img.onerror = null;
    }

    const header = document.createElement("div");
    header.className = "flex items-start justify-between";

    const title = document.createElement("h3");
    title.className = "font-bold text-sm";
    title.textContent = p.nombre;

    const badge = document.createElement("span");
    badge.className = `text-[11px] px-2 py-0.5 rounded-full font-medium ${badgeClass(catName)}`;
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
  $$("#dishes-container .dish-card").forEach(d => d.classList.add("platillo-animado"));
}