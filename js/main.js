// 🔥 Reinicio automático del sistema cada 24 horas
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

document.addEventListener('DOMContentLoaded', () => {

    // Ejecutar reinicio automático al cargar
    reiniciarSistemaSiEsNuevoDia();

    const cards = [
        { title: "Oferta del día", content: "Hoy 2x1 en todas las bebidas", bgColor: "bg-gradient-to-r from-blue-400 to-blue-600", icon: "fas fa-tag" },
        { title: "Combo Especial", content: "Hamburguesa + Papas + Refresco solo $99", bgColor: "bg-gradient-to-r from-purple-400 to-purple-600", icon: "fas fa-hamburger" },
        { title: "Promoción VIP", content: "Martes de postres: 30% de descuento", bgColor: "bg-gradient-to-r from-orange-400 to-orange-600", icon: "fas fa-crown" },
        { title: "Platillo Especial", content: "Pasta Alfredo con camarones $129", bgColor: "bg-gradient-to-r from-red-400 to-red-600", icon: "fas fa-utensils" },
        { title: "Happy Hour", content: "4-7pm: Cervezas artesanales $35", bgColor: "bg-gradient-to-r from-green-400 to-green-600", icon: "fas fa-glass-cheers" }
    ];

    let currentCardIndex = 0;
    const cardContainer = document.getElementById('card-container');

    const renderCard = (index) => {
        const card = cards[index];
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

        document.querySelectorAll('[id^="indicator-"]').forEach((indicator, i) => {
            indicator.className = i === index
                ? 'w-2 h-2 bg-blue-400 rounded-full'
                : 'w-2 h-2 bg-gray-300 rounded-full';
        });
    };

    const nextCard = () => {
        currentCardIndex = (currentCardIndex + 1) % cards.length;
        renderCard(currentCardIndex);
    };

    const updateCurrentDate = () => {
        const now = new Date();
        const options = { weekday: 'short', day: 'numeric', month: 'short' };
        const dateStr = now.toLocaleDateString('es-ES', options);
        document.getElementById('current-date').textContent = dateStr;
    };

    const actualizarEstadisticaMesas = () => {
        const tables = JSON.parse(localStorage.getItem('estadoMesas')) || [];
        const totalMesas = tables.length || 12;
        const mesasDisponibles = tables.filter(m => m.status === 'disponible').length || 12;
        const contador = document.getElementById('mesas-disponibles');
        if (contador) {
            contador.textContent = `${mesasDisponibles}/${totalMesas}`;
        }
    };

    const actualizarEstadisticaPedidos = () => {
        const pedidosGuardados = JSON.parse(localStorage.getItem('pedidosGuardados')) || [];
        const totalPedidos = pedidosGuardados.length;
        const contador = document.getElementById('pedidos-hoy');
        if (contador) {
            contador.textContent = totalPedidos;
        }
    };

    const actualizarTodo = () => {
        actualizarEstadisticaMesas();
        actualizarEstadisticaPedidos();
    };

    // Menú de usuario
    const userMenuBtn = document.getElementById('user-menu-btn');
    const userMenu = document.getElementById('user-menu');
    const overlay = document.getElementById('overlay');
    const logoutBtn = document.getElementById('logout-btn');
    const userMenuImg = document.getElementById('user-menu-img');

    // Alternar menú de usuario
    userMenuBtn.addEventListener('click', () => {
        userMenu.classList.toggle('active');
        overlay.classList.toggle('active');
    });

    // Cerrar menú al hacer clic en el overlay
    overlay.addEventListener('click', () => {
        userMenu.classList.remove('active');
        overlay.classList.remove('active');
    });

    // Función para cerrar sesión
    logoutBtn.addEventListener('click', () => {
        // Aquí podrías agregar lógica adicional como limpiar localStorage si es necesario
        window.location.href = 'LogIn.html';
    });

    // Opcional: Permitir cambiar la imagen (simulación)
    userMenuImg.addEventListener('click', (e) => {
        e.stopPropagation();
        // En una implementación real, aquí podrías abrir un selector de archivos
        alert('Funcionalidad para cambiar imagen: En una implementación real aquí se abriría un selector de archivos');
    });

    // Inicializar componentes
    renderCard(0);
    setInterval(nextCard, 10000);
    updateCurrentDate();
    actualizarTodo();

    if (localStorage.getItem('refrescarInicio') === 'true') {
        actualizarTodo();
        localStorage.removeItem('refrescarInicio');
    }

    document.addEventListener('visibilitychange', () => {
        if (document.visibilityState === 'visible') {
            actualizarTodo();
        }
    });

    setInterval(actualizarTodo, 5000);
});