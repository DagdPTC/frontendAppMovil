// ==========================
// BLOQUE ORIGINAL (SIN CAMBIOS)
// ==========================

// Función para obtener el token de autenticación desde el localStorage
function obtenerToken() {
    return localStorage.getItem('token');  // Obtiene el token guardado en el localStorage
}

// Configuración de los encabezados con el token de autenticación
function obtenerHeaders() {
    const token = obtenerToken();  // Obtiene el token
    if (token) {
        return {
            'Content-Type': 'application/json',
            'x-auth-token': token,  // Incluye el token en el encabezado x-auth-token
        };
    }
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
// Helper de fechas (usa EXACTAMENTE las fechas de la API/BD)
// ==========================
// Formatea "YYYY-MM-DD" → "dd/mm/aaaa" sin crear Date (evita desfases por timezone).
function fmtFechaYMD(ymd) {
    if (!ymd || typeof ymd !== 'string') return null;
    const m = ymd.match(/^(\d{4})-(\d{2})-(\d{2})$/); // espera "YYYY-MM-DD"
    if (m) {
        const [, y, mm, dd] = m;
        return `${dd}/${mm}/${y}`;
    }
    // Si no viene en YMD puro, último recurso: intenta parsear y formatear local
    const d = new Date(ymd);
    return isNaN(d) ? null : d.toLocaleDateString('es-ES');
}

// Obtener estadísticas de mesas desde la API
async function obtenerEstadisticasMesas() {
    try {
        const response = await fetch('http://localhost:8080/apiMesa/getDataMesa', {
            method: 'GET',
            headers: obtenerHeaders(),  // Usa los encabezados con el token
            credentials: "include"
        });
        const data = await response.json();

        if (response.ok) {
            if (data && Array.isArray(data.content)) {  // Verifica que 'content' sea un array
                const mesas = data.content;  // Accede al array de mesas
                const totalMesas = mesas.length;
                const mesasDisponibles = mesas.filter(mesa => mesa.status === 'disponible').length;
                const contador = document.getElementById('mesas-disponibles');
                if (contador) {
                    contador.textContent = `${mesasDisponibles}/${totalMesas}`;
                }
            } else {
                console.error('Las mesas no están en el formato esperado');
            }
        } else {
            console.error('Error al obtener las estadísticas de mesas:', data);
        }
    } catch (error) {
        console.error('Error en la solicitud de estadísticas de mesas:', error);
    }
}

// Obtener estadísticas de pedidos desde la API
async function obtenerEstadisticasPedidos() {
    try {
        const response = await fetch('http://localhost:8080/apiPedido/getDataPedido', {
            method: 'GET',
            headers: obtenerHeaders(),  // Usa los encabezados con el token
            credentials: "include"
        });
        const data = await response.json();

        if (response.ok) {
            if (data && Array.isArray(data.content)) {  // Verifica que 'content' sea un array
                const pedidos = data.content;  // Accede al array de pedidos
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

// Obtener ofertas desde la API para el carrusel (MUESTRA fechas exactas de BD)
async function obtenerOfertas() {
    try {
        const response = await fetch('http://localhost:8080/apiOfertas/getDataOfertas', {
            method: 'GET',
            headers: obtenerHeaders(),  // Usa los encabezados con el token
            credentials: "include"
        });
        const data = await response.json();

        if (response.ok) {
            if (data && Array.isArray(data.data)) {  // Verifica que 'data' sea un array
                return data.data.map(oferta => {
                    const ini = fmtFechaYMD(oferta.fechaInicio); // ← viene de tu BD/API tal cual
                    const fin = fmtFechaYMD(oferta.fechaFin);    // ← viene de tu BD/API tal cual

                    let textoFecha = '';
                    if (ini && fin) {
                        textoFecha = ` · Del ${ini} al ${fin}`;
                    } else if (fin) {
                        textoFecha = ` · Hasta ${fin}`;
                    }
                    // Si no hay fechas válidas, no añadimos nada genérico

                    return {
                        title: oferta.descripcion,  // Asegúrate de que 'descripcion' se mapee correctamente
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
            return [];  // Retorna un arreglo vacío si hay un error en la solicitud
        }
    } catch (error) {
        console.error('Error en la solicitud de ofertas:', error);
        return [];  // Retorna un arreglo vacío si ocurre un error
    }
}

// Función para renderizar las ofertas en el carrusel (con botones e indicadores clicables + swipe)
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

    // Actualiza indicadores existentes en el HTML (indicator-1..5)
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

  // --- Botones dinámicos (más pequeños y más transparentes) ---
  const outer = cardContainer.parentElement; // el contenedor relativo del carrusel
  // Limpia botones previos si re-renderizas
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

  // Solo crea botones si hay más de 1 oferta
  if (ofertas.length > 1) {
    outer.appendChild(mkBtn('left'));
    outer.appendChild(mkBtn('right'));
  }

  // --- Click en indicadores: salta a la tarjeta específica ---
  const indicators = Array.from(document.querySelectorAll('[id^="indicator-"]'));
  indicators.forEach((el, idx) => {
    if (idx < ofertas.length) {
      el.style.cursor = 'pointer';
      el.onclick = () => { goTo(idx); resetAutoplay(); };
    } else {
      // Si hay más indicadores que ofertas, los deshabilitamos visualmente
      el.style.cursor = 'default';
      el.onclick = null;
    }
  });

  // Render inicial y autoplay
  renderCard(0);
  if (ofertas.length > 1) startAutoplay();

  // Swipe (opcional en móviles)
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

// Función para actualizar la fecha actual
const updateCurrentDate = () => {
    const now = new Date();
    const options = { weekday: 'short', day: 'numeric', month: 'short' };
    document.getElementById('current-date').textContent = now.toLocaleDateString('es-ES', options);
};

// Función para actualizar todas las estadísticas
const actualizarTodo = () => {
    obtenerEstadisticasMesas();
    obtenerEstadisticasPedidos();
};

// Menú de usuario
const userMenuBtn = document.getElementById('user-menu-btn');
const userMenu = document.getElementById('user-menu');
const overlay = document.getElementById('overlay');
const logoutBtn = document.getElementById('logout-btn');
const userMenuImg = document.getElementById('user-menu-img');

// Alternar menú de usuario
userMenuBtn?.addEventListener('click', () => {
    userMenu.classList.toggle('active');
    overlay.classList.toggle('active');
});

// Cerrar menú al hacer clic en el overlay
overlay?.addEventListener('click', () => {
    userMenu.classList.remove('active');
    overlay.classList.remove('active');
});

// Función para cerrar sesión
logoutBtn?.addEventListener('click', () => {
    // Aquí podrías agregar lógica adicional como limpiar localStorage si es necesario
    window.location.href = 'LogIn.html';
});

// Opcional: Permitir cambiar la imagen (simulación)
userMenuImg?.addEventListener('click', (e) => {
    e.stopPropagation();
    // En una implementación real, aquí podrías abrir un selector de archivos
    alert('Funcionalidad para cambiar imagen: En una implementación real aquí se abriría un selector de archivos');
});


// ==========================
// AÑADIDOS MÍNIMOS: saludo dinámico (idéntica idea a Pedidos)
// ==========================

const API_HOST = "http://localhost:8080";

// Usa la sesión del backend
async function ensureMeInSession(opts = {}) {
  const KEY = "ord_user";
  const force = opts.forceNetwork === true;

  if (!force) {
    try {
      const cached = JSON.parse(sessionStorage.getItem(KEY) || "null");
      if (cached && (cached.username || cached.correo)) return cached;
    } catch {}
  }

  try {
    const res = await fetch(`${API_HOST}/api/auth/me`, {
      method: "GET",
      credentials: "include",
      headers: { "Cache-Control": "no-cache", "Pragma": "no-cache" }
    });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const data = await res.json();

    const me = {
      correo: data.correo || null,
      rol: data.rol || null,
      username: data.username || data.user || data.nombreUsuario || data.nombreusuario || null,
      usuarioId: Number(data.usuarioId ?? data.id ?? data.usuarioID ?? 0) || null,
      idEmpleado: Number(data.idEmpleado ?? data.idempleado ?? 0) || null,
    };
    sessionStorage.setItem(KEY, JSON.stringify(me));
    return me;
  } catch (e) {
    try { sessionStorage.removeItem(KEY); } catch {}
    return { correo: null, rol: null, username: null, usuarioId: null, idEmpleado: null, error: e?.message || String(e) };
  }
}

function aTitulo(nombre) {
  if (!nombre || typeof nombre !== 'string') return null;
  return nombre.trim().split(/\s+/).map(p => p.charAt(0).toUpperCase() + p.slice(1)).join(' ');
}

function decodificarJWT(token) {
  try {
    const payload = token.split('.')[1];
    const base64 = payload.replace(/-/g, '+').replace(/_/g, '/');
    const json = decodeURIComponent(atob(base64).split('').map(c => '%' + ('00' + c.charCodeAt(0).toString(16)).slice(-2)).join(''));
    return JSON.parse(json);
  } catch { return null; }
}

async function resolverIdentidadUsuario() {
  // 1) /auth/me primero
  const me = await ensureMeInSession({ forceNetwork: true });

  let nombre = aTitulo(me?.username) || null;
  let rol = aTitulo(me?.rol) || null;

  // 2) Respaldos: token/localStorage si hiciera falta
  if (!nombre) {
    const lsNombre = localStorage.getItem('usuarioNombre') || localStorage.getItem('NombreUsuario') || localStorage.getItem('userName');
    const token = obtenerToken();
    const payload = token ? decodificarJWT(token) : null;

    nombre =
      aTitulo(lsNombre) ||
      aTitulo(payload?.NombreUsuario || payload?.nombreUsuario || payload?.username || payload?.name || payload?.sub) ||
      'Usuario';
    rol = rol || aTitulo(payload?.rol || payload?.role) || aTitulo(localStorage.getItem('usuarioRol') || localStorage.getItem('Rol') || localStorage.getItem('rolNombre')) || null;
  }

  return { nombre, rol };
}

async function pintarUsuarioUI() {
  try {
    const { nombre, rol } = await resolverIdentidadUsuario();

    const spanSaludo = document.getElementById('greeting-name');
    if (spanSaludo) spanSaludo.textContent = nombre;

    const menuName = document.getElementById('user-menu-name');
    if (menuName) menuName.textContent = nombre;

    const menuRole = document.getElementById('user-menu-role');
    if (menuRole && rol) menuRole.textContent = rol;
  } catch (e) {
    console.warn("No se pudo pintar el usuario:", e?.message || e);
  }
}


// ==========================
// INIT
// ==========================
document.addEventListener('DOMContentLoaded', async () => {
    // Saludo dinámico (basado en sesión)
    await pintarUsuarioUI();

    // Ejecutar reinicio automático al cargar
    reiniciarSistemaSiEsNuevoDia();

    // Obtener estadísticas de mesas y pedidos desde la API (BLOQUE ORIGINAL)
    obtenerEstadisticasMesas();
    obtenerEstadisticasPedidos();

    // Mostrar ofertas en el carrusel (con controles)
    renderOfertas();

    // Resto de la inicialización (BLOQUE ORIGINAL)
    updateCurrentDate();
    setInterval(actualizarTodo, 5000);

    document.addEventListener('visibilitychange', async () => {
        if (document.visibilityState === 'visible') {
            actualizarTodo();
            await pintarUsuarioUI(); // refresca el saludo por si cambió la sesión
        }
    });
});
