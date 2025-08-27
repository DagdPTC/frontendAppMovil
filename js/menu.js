// ----------------- FILTRO CATEGORÍAS Y BÚSQUEDA -----------------

document.getElementById('filter-button')?.addEventListener('click', () => {
  document.getElementById('category-filter')?.classList.toggle('hidden');
});

document.getElementById('search-dishes')?.addEventListener('input', (e) => {
  const searchTerm = (e.target.value || '').toLowerCase();
  document.querySelectorAll('#dishes-container .dish-card').forEach(dish => {
    const name = (dish.querySelector('h3')?.textContent || '').toLowerCase();
    const description = (dish.querySelector('p')?.textContent || '').toLowerCase();
    const visible = name.includes(searchTerm) || description.includes(searchTerm);
    dish.classList.toggle('hidden', !visible);
  });
});

document.getElementById('category-filter')?.addEventListener('click', (e) => {
  if (e.target.classList.contains('category-btn')) {
    document.querySelectorAll('.category-btn').forEach(btn => {
      btn.classList.remove('bg-blue-100', 'text-blue-600');
      btn.classList.add('bg-gray-100', 'text-gray-600');
    });

    e.target.classList.add('bg-blue-100', 'text-blue-600');
    e.target.classList.remove('bg-gray-100', 'text-gray-600');

    const category = e.target.dataset.category;
    document.querySelectorAll('#dishes-container .dish-card').forEach(dish => {
      const dishCategory = dish.dataset.category;
      const visible = (category === 'all') || (dishCategory === category);
      dish.classList.toggle('hidden', !visible);
    });
  }
});

// ----------------- SELECCIÓN DE PLATILLOS (compatible con orders/reservas) -----------------

const params = new URLSearchParams(window.location.search);
// Debe venir como: menu.html?modo=seleccion&from=orders   o   ...&from=reservas
const esSeleccion = params.get('modo') === 'seleccion';
const from = (params.get('from') || '').toLowerCase(); // 'orders' | 'reservas'

// Mapeo de claves aisladas por origen (NO se mezclan)
const KEYS = (from === 'orders')
  ? { pre: 'ord_dishes_pre', sel: 'ord_dishes_sel', ret: 'ord_return', fallback: 'orders.html' }
  : { pre: 'rsv_dishes_pre', sel: 'rsv_dishes_sel', ret: 'rsv_return', fallback: 'reservations.html' };

if (esSeleccion) activarSeleccionPlatillos();

function activarSeleccionPlatillos() {
  const dishesContainer = document.getElementById('dishes-container');
  if (!dishesContainer) return;

  // Cargar preselección del origen correcto
  let seleccion = [];
  try { seleccion = JSON.parse(sessionStorage.getItem(KEYS.pre) || '[]'); } catch { seleccion = []; }
  // Normalizar
  seleccion = seleccion.map(x => {
    if (typeof x === 'string') return { nombre: x, precio: 0, cantidad: 1 };
    return {
      nombre: x.nombre ?? x.name ?? '',
      precio: toNumber(x.precio ?? x.price ?? 0),
      cantidad: parseInt(x.cantidad ?? x.qty ?? 1, 10) || 1
    };
  });

  // Botón "Listo"
  let finalizeBtn = document.getElementById('ready-btn');
  if (!finalizeBtn) {
    finalizeBtn = document.createElement('button');
    finalizeBtn.id = 'ready-btn';
    finalizeBtn.textContent = 'Listo';
    finalizeBtn.className = 'fixed top-4 right-4 bg-blue-500 text-white px-4 py-2 rounded-full shadow-lg z-50';
    document.body.appendChild(finalizeBtn);
  }
  finalizeBtn.onclick = () => {
    // Guardar selección final en la clave del origen correspondiente
    sessionStorage.setItem(KEYS.sel, JSON.stringify(seleccion));
    // Regresar a donde nos llamaron (si guardaron un retorno), o fallback
    const back = sessionStorage.getItem(KEYS.ret) || KEYS.fallback;
    window.location.href = back;
  };

  // Inyectar botones Agregar/Cancelar en cada tarjeta
  dishesContainer.querySelectorAll('.dish-card').forEach(card => {
    // Datos del DOM (idealmente podrías poner data-dish-name y data-dish-price en el HTML)
    const nombre = card.dataset.dishName || card.querySelector('h3')?.textContent?.trim() || '';
    const precioTxt =
      card.dataset.dishPrice ||
      card.querySelector('.font-bold.text-blue-600')?.textContent?.trim() || '0';
    const precio = toNumber(precioTxt);

    // Botón
    let boton = card.querySelector('.btn-seleccion');
    if (!boton) {
      boton = document.createElement('button');
      boton.className = 'btn-seleccion mt-2 text-white text-sm font-medium py-1 rounded-lg w-full transition';
      card.querySelector('.p-3')?.appendChild(boton);
    }

    const getIndex = () => seleccion.findIndex(p => (p.nombre === nombre));
    const esta = () => getIndex() !== -1;

    const renderBtn = () => {
      if (esta()) {
        boton.textContent = 'Cancelar';
        boton.classList.remove('bg-green-500');
        boton.classList.add('bg-red-500');
      } else {
        boton.textContent = 'Agregar';
        boton.classList.remove('bg-red-500');
        boton.classList.add('bg-green-500');
      }
    };

    boton.addEventListener('click', () => {
      const idx = getIndex();
      if (idx === -1) {
        seleccion.push({ nombre, precio, cantidad: 1 });
      } else {
        seleccion.splice(idx, 1);
      }
      // Persistir preselección por si navegan dentro del menú o recargan
      sessionStorage.setItem(KEYS.pre, JSON.stringify(seleccion));
      renderBtn();
    });

    renderBtn();
    card.classList.add('platillo-animado');
  });
}

function toNumber(txt) {
  if (typeof txt === 'number') return txt;
  const clean = String(txt).replace(/[^\d.,-]/g, '').replace(',', '.');
  const n = parseFloat(clean);
  return Number.isFinite(n) ? n : 0;
}

// ----------------- ETIQUETAS DE CATEGORÍA EN TARJETAS -----------------

function categoryColors(cat) {
  switch ((cat || '').toLowerCase()) {
    case 'entradas':        return 'bg-amber-100 text-amber-700';
    case 'platos':          return 'bg-emerald-100 text-emerald-700';
    case 'platos fuertes':  return 'bg-emerald-100 text-emerald-700';
    case 'bebidas':         return 'bg-sky-100 text-sky-700';
    case 'postres':         return 'bg-pink-100 text-pink-700';
    case 'sopas':           return 'bg-lime-100 text-lime-700';
    case 'ensaladas':       return 'bg-teal-100 text-teal-700';
    case 'sandwiches':      return 'bg-indigo-100 text-indigo-700';
    case 'pizzas':          return 'bg-orange-100 text-orange-700';
    case 'tacos':           return 'bg-yellow-100 text-yellow-700';
    default:                return 'bg-gray-100 text-gray-700';
  }
}
function toTitleCase(str) {
  return (str || '').toLowerCase().replace(/\b\w/g, m => m.toUpperCase());
}
function injectCategoryBadges() {
  document.querySelectorAll('#dishes-container .dish-card').forEach(card => {
    if (card.querySelector('.cat-badge')) return;
    const cat = card.dataset.category || '';
    if (!cat) return;

    card.classList.add('relative');

    const badge = document.createElement('span');
    badge.className = `cat-badge absolute top-2 left-2 text-[11px] px-2 py-0.5 rounded-full font-medium ${categoryColors(cat)}`;
    badge.textContent = toTitleCase(cat);

    card.appendChild(badge);
  });
}

// ----------------- ANIMACIÓN AL CARGAR -----------------

document.addEventListener('DOMContentLoaded', () => {
  injectCategoryBadges();

  document.querySelectorAll('#dishes-container .dish-card').forEach(dish => {
    dish.classList.add('platillo-animado');
  });
});
