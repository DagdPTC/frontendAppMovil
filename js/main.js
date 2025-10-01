// ==========================
// main.js (COMPLETO con autenticación y logout)
// ==========================

// ====== Config base ======
const API_BASE = "http://localhost:8080";

// Endpoint correcto según tu AuthController
const ME_ENDPOINT = `${API_BASE}/api/auth/me`;

// ==========================
// FUNCIONES DE AUTENTICACIÓN
// ==========================

// Configuración de headers básicos (sin token, porque va en cookie)
function obtenerHeaders() {
  return {
    'Content-Type': 'application/json',
  };
}

// Función para reiniciar el sistema si es un nuevo día
function reiniciarSistemaSiEsNuevoDia() {
  const hoy = new Date().toDateString();
  const ultimaFecha = localStorage.getItem('ultimaFechaSistema');

  if (ultimaFecha !== hoy) {
    // Reiniciar mesas a disponible
    const nuevasMesas = Array.from({ length: 12 }, (_, i) => ({
      number: i + 1,
      status: 'disponible'
    }));
    localStorage.setItem('estadoMesas', JSON.stringify(nuevasMesas));

    // Eliminar pedidos guardados
    localStorage.removeItem('pedidosGuardados');

    // Reiniciar estadísticas de pedidos del día
    localStorage.setItem('pedidosHoy', '0');

    // Actualizar fecha registrada
    localStorage.setItem('ultimaFechaSistema', hoy);

    console.log('Sistema reiniciado automáticamente por nuevo día.');
  }
}

// ==========================
// Helper de fechas
// ==========================
function fmtFechaYMD(ymd) {
  if (!ymd || typeof ymd !== 'string') return null;
  const m = ymd.match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if (m) {
    const [, y, mm, dd] = m;
    return `${dd}/${mm}/${y}`;
  }
  const d = new Date(ymd);
  return isNaN(d) ? null : d.toLocaleDateString('es-ES');
}

// ==========================
// ESTADÍSTICAS DE MESAS
// ==========================
async function obtenerEstadisticasMesas() {
  try {
    const mesasResponse = await fetch(`${API_BASE}/apiMesa/getDataMesa`, {
      method: 'GET',
      headers: obtenerHeaders(),
      credentials: "include"
    });
    const mesasData = await mesasResponse.json();

    const estadosResponse = await fetch(`${API_BASE}/apiEstadoMesa/getDataEstadoMesa`, {
      method: 'GET',
      headers: obtenerHeaders(),
      credentials: "include"
    });
    const estadosData = await estadosResponse.json();

    if (mesasResponse.ok && estadosResponse.ok) {
      if (mesasData && Array.isArray(mesasData.content) && estadosData && Array.isArray(estadosData.content)) {
        const mesas = mesasData.content;
        const estadosMesas = estadosData.content;

        const totalMesas = mesas.length;
        let mesasDisponibles = 0;

        mesas.forEach(mesa => {
          const estadoMesa = estadosMesas.find(estado => estado.id === mesa.idEstadoMesa);
          if (estadoMesa && estadoMesa.estadoMesa === 'Disponible') {
            mesasDisponibles++;
          }
        });

        const contador = document.getElementById('mesas-disponibles');
        if (contador) {
          contador.textContent = `${mesasDisponibles}/${totalMesas}`;
        }
      } else {
        console.error('Las mesas o estados no están en el formato esperado');
      }
    } else {
      console.error('Error al obtener las estadísticas de mesas:', mesasData, estadosData);
    }
  } catch (error) {
    console.error('Error en la solicitud de estadísticas de mesas:', error);
  }
}

// ==========================
// ESTADÍSTICAS DE PEDIDOS
// ==========================
async function obtenerEstadisticasPedidos() {
  try {
    const response = await fetch(`${API_BASE}/apiPedido/getDataPedido`, {
      method: 'GET',
      headers: obtenerHeaders(),
      credentials: "include"
    });
    const data = await response.json();

    if (response.ok) {
      if (data && Array.isArray(data.content)) {
        const pedidos = data.content;
        const totalPedidos = pedidos.length;
        const contador = document.getElementById('pedidos-hoy');
        if (contador) {
          contador.textContent = totalPedidos;
        }
      } else {
        console.error('Los pedidos no están en el formato esperado');
      }
    } else {
      console.error('Error al obtener las estadísticas de pedidos:', data);
    }
  } catch (error) {
    console.error('Error en la solicitud de estadísticas de pedidos:', error);
  }
}

// ==========================
// OFERTAS DEL CARRUSEL
// ==========================
async function obtenerOfertas() {
  try {
    const response = await fetch(`${API_BASE}/apiOfertas/getDataOfertas`, {
      method: 'GET',
      headers: obtenerHeaders(),
      credentials: "include"
    });
    const data = await response.json();

    if (response.ok) {
      if (data && Array.isArray(data.data)) {
        return data.data.map(oferta => {
          const ini = fmtFechaYMD(oferta.fechaInicio);
          const fin = fmtFechaYMD(oferta.fechaFin);

          let textoFecha = '';
          if (ini && fin) {
            textoFecha = ` · Del ${ini} al ${fin}`;
          } else if (fin) {
            textoFecha = ` · Hasta ${fin}`;
          }

          return {
            title: oferta.descripcion,
            content: `${oferta.porcentajeDescuento}% de descuento${textoFecha}`,
            bgColor: oferta.bgColor || "bg-gradient-to-r from-blue-400 to-blue-600",
            icon: oferta.icon || "fas fa-tag",
          };
        });
      } else {
        console.error('Las ofertas no están en el formato esperado');
        return [];
      }
    } else {
      console.error('Error al obtener las ofertas:', data);
      return [];
    }
  } catch (error) {
    console.error('Error en la solicitud de ofertas:', error);
    return [];
  }
}

// Función para renderizar las ofertas en el carrusel
async function renderOfertas() {
  const ofertas = await obtenerOfertas();

  if (!Array.isArray(ofertas) || ofertas.length === 0) {
    console.log('No se encontraron ofertas para mostrar.');
    return;
  }

  const cardContainer = document.getElementById('card-container');
  if (!cardContainer) return;

  let currentCardIndex = 0;
  let timerId = null;
  const AUTOPLAY_MS = 10000;

  const startAutoplay = () => {
    clearInterval(timerId);
    timerId = setInterval(() => {
      nextCard();
    }, AUTOPLAY_MS);
  };

  const resetAutoplay = () => {
    clearInterval(timerId);
    startAutoplay();
  };

  const renderCard = (index) => {
    const card = ofertas[index];
    const cardElement = document.createElement('div');
    cardElement.className = `absolute inset-0 ${card.bgColor} text-white p-6 rounded-xl flex flex-col justify-center card-slide-in`;
    cardElement.innerHTML = `
      <i class="${card.icon} text-3xl mb-4"></i>
      <h3 class="text-xl font-bold">${card.title}</h3>
      <p class="text-sm opacity-90">${card.content}</p>
    `;

    if (cardContainer.firstChild) {
      const oldCard = cardContainer.firstChild;
      oldCard.classList.remove('card-slide-in');
      oldCard.classList.add('card-slide-out');
      setTimeout(() => {
        cardContainer.innerHTML = '';
        cardContainer.appendChild(cardElement);
      }, 500);
    } else {
      cardContainer.appendChild(cardElement);
    }

    const allIndicators = Array.from(document.querySelectorAll('[id^="indicator-"]'));
    allIndicators.forEach((indicator, i) => {
      indicator.className = i === index
        ? 'w-2 h-2 bg-blue-400 rounded-full'
        : 'w-2 h-2 bg-gray-300 rounded-full';
    });
  };

  const goTo = (i) => {
    if (!ofertas.length) return;
    currentCardIndex = (i + ofertas.length) % ofertas.length;
    renderCard(currentCardIndex);
  };

  const nextCard = () => goTo(currentCardIndex + 1);
  const prevCard = () => goTo(currentCardIndex - 1);

  const outer = cardContainer.parentElement;
  outer.querySelectorAll('.ofertas-btn').forEach(el => el.remove());

  const mkBtn = (side) => {
    const btn = document.createElement('button');
    btn.type = 'button';
    btn.className = `ofertas-btn absolute top-1/2 -translate-y-1/2 ${side === 'left' ? 'left-2' : 'right-2'} 
      bg-white/20 hover:bg-white/80 shadow-sm rounded-full w-8 h-8 flex items-center justify-center
      transition focus:outline-none focus:ring-1 focus:ring-blue-400 backdrop-blur`;
    btn.setAttribute('aria-label', side === 'left' ? 'Anterior' : 'Siguiente');
    btn.innerHTML = side === 'left'
      ? '<i class="fas fa-chevron-left text-gray-700 text-sm"></i>'
      : '<i class="fas fa-chevron-right text-gray-700 text-sm"></i>';
    btn.addEventListener('click', () => {
      side === 'left' ? prevCard() : nextCard();
      resetAutoplay();
    });
    return btn;
  };

  if (ofertas.length > 1) {
    outer.appendChild(mkBtn('left'));
    outer.appendChild(mkBtn('right'));
  }

  const indicators = Array.from(document.querySelectorAll('[id^="indicator-"]'));
  indicators.forEach((el, idx) => {
    if (idx < ofertas.length) {
      el.style.cursor = 'pointer';
      el.onclick = () => { goTo(idx); resetAutoplay(); };
    } else {
      el.style.cursor = 'default';
      el.onclick = null;
    }
  });

  renderCard(0);
  if (ofertas.length > 1) startAutoplay();

  let startX = null;
  outer.addEventListener('touchstart', (e) => {
    if (e.touches && e.touches.length === 1) startX = e.touches[0].clientX;
  }, { passive: true });
  outer.addEventListener('touchend', (e) => {
    if (startX === null || !e.changedTouches || e.changedTouches.length !== 1) return;
    const delta = e.changedTouches[0].clientX - startX;
    if (Math.abs(delta) > 40) {
      delta > 0 ? prevCard() : nextCard();
      resetAutoplay();
    }
    startX = null;
  }, { passive: true });
}

// ==========================
//  SALUDO DINÁMICO
// ==========================

// Obtiene el usuario actual desde /api/auth/me
async function fetchUsuarioActual() {
  try {
    const res = await fetch(ME_ENDPOINT, { 
      method: "GET", 
      headers: obtenerHeaders(), 
      credentials: "include"
    });
    
    if (!res.ok) {
      console.warn(`/me respondió con ${res.status}`);
      return null;
    }
    
    const data = await res.json();
    return data || null;
  } catch (error) {
    console.error('Error al obtener usuario:', error);
    return null;
  }
}

// Extrae el nombre a mostrar del objeto /me
function obtenerNombreMostrar(me) {
  if (!me) return null;
  
  // Tu backend devuelve "username" en /me
  if (me.username) return String(me.username).trim();
  
  // Fallback: usar el correo antes del @
  if (me.correo || me.email) {
    const correo = String(me.correo || me.email);
    const user = correo.split("@")[0] || correo;
    return user;
  }
  
  return null;
}

function obtenerRolMostrar(me) {
  if (!me) return null;
  return me.rol || null;
}

// Pinta el saludo y el menú de usuario en la UI
function pintarUsuarioEnUI(me) {
  const nombre = obtenerNombreMostrar(me) || "Usuario";
  const rol = obtenerRolMostrar(me);

  const spanSaludo = document.getElementById("greeting-name");
  if (spanSaludo) spanSaludo.textContent = nombre;

  const menuName = document.getElementById("user-menu-name");
  if (menuName) menuName.textContent = nombre;

  const menuRole = document.getElementById("user-menu-role");
  if (menuRole && rol) menuRole.textContent = rol;

  // Si en el futuro agregas foto de perfil al backend
  const img = document.getElementById("user-menu-img");
  if (img && me.fotoUrl) img.src = me.fotoUrl;

  // Guarda en cache para futuras cargas
  try { 
    localStorage.setItem("orderly_me_cache", JSON.stringify({ nombre, rol })); 
  } catch {}
}

// Si falla /me, usa cache si existe
function pintarDesdeCacheSiDisponible() {
  try {
    const raw = localStorage.getItem("orderly_me_cache");
    if (!raw) return;
    
    const { nombre, rol } = JSON.parse(raw);
    
    if (nombre) {
      const spanSaludo = document.getElementById("greeting-name");
      if (spanSaludo) spanSaludo.textContent = nombre;
      
      const menuName = document.getElementById("user-menu-name");
      if (menuName) menuName.textContent = nombre;
    }
    
    if (rol) {
      const menuRole = document.getElementById("user-menu-role");
      if (menuRole) menuRole.textContent = rol;
    }
  } catch {}
}

// ==========================
//  CERRAR SESIÓN
// ==========================

// Función para cerrar sesión
async function cerrarSesion() {
  try {
    const response = await fetch(`${API_BASE}/api/auth/logout`, {
      method: 'POST',
      headers: obtenerHeaders(),
      credentials: 'include'
    });

    if (response.ok) {
      console.log('Sesión cerrada correctamente');
    } else {
      console.error('Error al cerrar sesión en el servidor');
    }
  } catch (error) {
    console.error('Error en la solicitud de logout:', error);
  } finally {
    // Siempre limpiar cache y redirigir, incluso si falla la petición
    localStorage.removeItem('orderly_me_cache');
    localStorage.removeItem('estadoMesas');
    localStorage.removeItem('pedidosGuardados');
    window.location.href = 'login.html';
  }
}

// Función para toggle del menú de usuario
function inicializarMenuUsuario() {
  const userMenuBtn = document.getElementById('user-menu-btn');
  const userMenu = document.getElementById('user-menu');
  const overlay = document.getElementById('overlay');
  const logoutBtn = document.getElementById('logout-btn');

  // Abrir/cerrar menú al hacer clic en el botón
  if (userMenuBtn) {
    userMenuBtn.addEventListener('click', () => {
      if (userMenu) userMenu.classList.toggle('active');
      if (overlay) overlay.classList.toggle('active');
    });
  }

  // Cerrar menú al hacer clic en el overlay
  if (overlay) {
    overlay.addEventListener('click', () => {
      if (userMenu) userMenu.classList.remove('active');
      overlay.classList.remove('active');
    });
  }

  // Cerrar sesión
  if (logoutBtn) {
    logoutBtn.addEventListener('click', (e) => {
      e.preventDefault();
      cerrarSesion();
    });
  }
}

// ==========================
// Fecha y actualización periódica
// ==========================
const updateCurrentDate = () => {
  const now = new Date();
  const options = { weekday: 'short', day: 'numeric', month: 'short' };
  const el = document.getElementById('current-date');
  if (el) el.textContent = now.toLocaleDateString('es-ES', options);
};

const actualizarTodo = () => {
  obtenerEstadisticasMesas();
  obtenerEstadisticasPedidos();
};

// ==========================
//  INICIALIZACIÓN
// ==========================
document.addEventListener('DOMContentLoaded', async () => {
  // Ejecutar reinicio automático al cargar
  reiniciarSistemaSiEsNuevoDia();

  // Inicializar menú de usuario y botón de logout
  inicializarMenuUsuario();

  // Saludo dinámico
  pintarDesdeCacheSiDisponible();
  
  try {
    const me = await fetchUsuarioActual();
    if (me) {
      pintarUsuarioEnUI(me);
      console.log('Usuario autenticado:', me.username, '- Rol:', me.rol);
    } else {
      console.warn('No se pudo obtener el usuario. Redirigiendo al login...');
      window.location.href = 'login.html';
      return;
    }
  } catch (e) {
    console.warn("Error al obtener /me:", e);
    window.location.href = 'login.html';
    return;
  }

  // Obtener estadísticas
  obtenerEstadisticasMesas();
  obtenerEstadisticasPedidos();

  // Ofertas en el carrusel
  renderOfertas();

  // Resto de la inicialización
  updateCurrentDate();
  setInterval(actualizarTodo, 5000);
});