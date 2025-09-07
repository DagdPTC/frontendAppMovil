// js/services/menuService.js
(function () {
  // =========================
  // CONFIG
  // =========================
  const BASE = "http://localhost:8080"; // cambia si tu backend usa otra URL/puerto

  // Caches en memoria
  let categoriesCache = [];
  let categoriesById = new Map();

  // =========================
  // Helpers
  // =========================
  async function safeJson(res) {
    const ct = res.headers.get("content-type") || "";
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const txt = await res.text();
    if (!txt) return null;
    return ct.includes("application/json") ? JSON.parse(txt) : null;
  }

  function mapCategory(c) {
    return {
      id: c.id ?? c.Id ?? c.idCategoria ?? c.IdCategoria,
      nombre: c.nombreCategoria ?? c.NombreCategoria ?? c.nombre ?? c.NomCategoria ?? "",
    };
  }

  function mapDish(p) {
    return {
      id: p.id ?? p.Id ?? p.idPlatillo ?? p.IdPlatillo,
      nombre: p.nomPlatillo ?? p.NombrePlatillo ?? p.nombre ?? p.NomPlatillo ?? "",
      descripcion: p.descripcion ?? p.Descripcion ?? "",
      precio: Number(p.precio ?? p.Precio ?? 0),
      idCategoria: p.idCate ?? p.IdCate ?? p.idCategoria ?? p.IdCategoria ?? null,
      imagenUrl: p.imagenUrl ?? p.ImagenUrl ?? p.imagenURL ?? null,
    };
  }

  function getCategoryNameById(id) {
    if (id == null) return "";
    if (categoriesById.size === 0 && categoriesCache.length > 0) {
      for (const c of categoriesCache) categoriesById.set(String(c.id), c.nombre);
    }
    return categoriesById.get(String(id)) || "";
  }

  function toCurrency(n) {
    const num = Number(n || 0);
    return num.toFixed(2);
  }

  // =========================
  // API: Categorías
  // =========================
  async function getCategories() {
    const r = await fetch(`${BASE}/apiCategoria/getDataCategoria`, { cache: "no-store" });
    const data = await safeJson(r);
    const arr = Array.isArray(data?.content)
      ? data.content
      : Array.isArray(data)
      ? data
      : Array.isArray(data?.data)
      ? data.data
      : [];
    categoriesCache = arr.map(mapCategory);
    categoriesById.clear();
    for (const c of categoriesCache) categoriesById.set(String(c.id), c.nombre);
    return categoriesCache;
  }

  /**
   * Pinta los botones de categorías en un contenedor (ej: #category-filter)
   * Genera botones con clase .category-btn que tu script ya escucha.
   */
  async function paintCategoryButtons(containerSelector, includeAll = true) {
    const el = typeof containerSelector === "string" ? document.querySelector(containerSelector) : containerSelector;
    if (!el) return [];
    const cats = categoriesCache.length ? categoriesCache : await getCategories();

    const buttons = [];
    if (includeAll) {
      buttons.push(
        `<button data-category="all" class="category-btn bg-blue-100 text-blue-600 px-3 py-1 rounded-full text-sm">Todos</button>`
      );
    }
    for (const c of cats) {
      buttons.push(
        `<button data-category="${(c.nombre || "").toLowerCase()}" class="category-btn bg-gray-100 text-gray-600 px-3 py-1 rounded-full text-sm">${c.nombre}</button>`
      );
    }
    el.innerHTML = buttons.join("");
    return cats;
  }

  // =========================
  // API: Platillos (paginado)
  // =========================
  async function getDishesPage(page = 0, size = 12) {
    const url = new URL(`${BASE}/apiPlatillo/getDataPlatillo`);
    url.searchParams.set("page", page);
    url.searchParams.set("size", size);
    const r = await fetch(url.toString(), { cache: "no-store" });
    const data = await safeJson(r);
    const content = Array.isArray(data?.content)
      ? data.content
      : Array.isArray(data)
      ? data
      : [];
    const items = content.map(mapDish);
    return {
      items,
      totalPages: data?.totalPages ?? 1,
      totalElements: data?.totalElements ?? items.length,
      pageNumber: data?.number ?? page,
      size: data?.size ?? size,
    };
  }

  // =========================
  // RENDER: Tarjetas de platillos
  // Estructura compatible con tu script de selección/filtro/búsqueda:
  // - contenedor: #dishes-container
  // - tarjeta: .dish-card
  // - dataset necesario:
  //     data-category  -> nombre categoría en minúsculas (p/ filtro)
  //     data-dish-name -> nombre del platillo (p/ selección)
  //     data-dish-price-> precio del platillo (p/ selección)
  // - jerarquía:
  //     .p-3 -> lugar donde se inyecta el botón de selección
  //     h3   -> título, lo usas en búsqueda
  //     p    -> descripción, lo usas en búsqueda
  //     span.font-bold.text-blue-600 -> precio, lo parseas en selección
  // =========================
  function buildDishCardHTML(dish) {
    const catName = getCategoryNameById(dish.idCategoria) || "";
    const catData = (catName || "").toLowerCase();

    return `
      <div class="dish-card bg-white rounded-xl shadow hover:shadow-md transition overflow-hidden"
           data-category="${escapeHtml(catData)}"
           data-dish-name="${escapeHtml(dish.nombre)}"
           data-dish-price="${escapeHtml(String(dish.precio))}">
        <div class="h-40 bg-gray-100 flex items-center justify-center overflow-hidden">
          ${
            dish.imagenUrl
              ? `<img src="${escapeHtml(dish.imagenUrl)}" alt="${escapeHtml(dish.nombre)}" class="w-full h-full object-cover"/>`
              : `<span class="text-gray-400 text-sm">Sin imagen</span>`
          }
        </div>
        <div class="p-3">
          <h3 class="font-semibold text-gray-800">${escapeHtml(dish.nombre)}</h3>
          <p class="text-sm text-gray-500 line-clamp-2">${escapeHtml(dish.descripcion || "")}</p>
          <div class="mt-2 flex items-center justify-between">
            <span class="font-bold text-blue-600">$${toCurrency(dish.precio)}</span>
            <!-- el botón de selección lo agrega tu script (clase .btn-seleccion) -->
          </div>
        </div>
      </div>
    `;
  }

  function escapeHtml(s) {
    return String(s ?? "")
      .replaceAll("&", "&amp;")
      .replaceAll("<", "&lt;")
      .replaceAll(">", "&gt;")
      .replaceAll('"', "&quot;")
      .replaceAll("'", "&#039;");
  }

  /**
   * Pinta/actualiza el grid de platillos.
   * No hace filtros ni búsqueda (eso ya lo maneja tu script).
   * Devuelve {items, totalPages, pageNumber}
   */
  async function paintDishes(containerSelector, page = 0, size = 12) {
    const el = typeof containerSelector === "string" ? document.querySelector(containerSelector) : containerSelector;
    if (!el) return { items: [], totalPages: 1, pageNumber: 0 };

    // Skeleton simple
    el.innerHTML = Array.from({ length: 6 })
      .map(
        () => `
      <div class="animate-pulse bg-white rounded-xl p-4 shadow">
        <div class="h-40 bg-gray-200 rounded-lg mb-3"></div>
        <div class="h-4 bg-gray-200 rounded w-3/4 mb-2"></div>
        <div class="h-3 bg-gray-200 rounded w-1/2 mb-4"></div>
        <div class="h-8 bg-gray-200 rounded w-24"></div>
      </div>`
      )
      .join("");

    const pageData = await getDishesPage(page, size);
    const html = pageData.items.map(buildDishCardHTML).join("");
    el.innerHTML = html || `<div class="bg-white rounded-xl p-6 text-center text-gray-600 shadow">Sin resultados.</div>`;
    return {
      items: pageData.items,
      totalPages: pageData.totalPages,
      pageNumber: pageData.pageNumber,
      size: pageData.size,
    };
  }

  // =========================
  // Exponer API global
  // =========================
  window.MenuService = {
    // Datos
    getCategories,
    paintCategoryButtons,
    getDishesPage,
    paintDishes,

    // Helpers por si los necesitas fuera
    mapDish,
    mapCategory,
    getCategoryNameById,
    toCurrency,
  };
})();
