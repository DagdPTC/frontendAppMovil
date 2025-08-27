// Si viene de "nuevo pedido" desde otra página
if (window.location.search.includes('nuevo=true')) {
  localStorage.setItem('abrirFormularioPedido', 'true');
}

document.addEventListener('DOMContentLoaded', () => {

  const newOrderBtn = document.getElementById('new-order-btn');
  const newOrderForm = document.getElementById('new-order-form');
  const ordersList = document.getElementById('orders-list');
  const backToOrdersBtn = document.getElementById('back-to-orders');
  const orderTime = document.getElementById('order-time');

  const mesaSelect = document.getElementById('table-select');
  const mesaError = document.getElementById('table-error');

  const customerInput = document.getElementById('customer-name');
  const customerError = document.getElementById('customer-error');

  const dishesError = document.getElementById('dishes-error');
  const dishesSummary = document.getElementById('dishes-summary');
  const itemCountBadge = document.getElementById('items-count');

  const saveOrderBtn = document.getElementById('save-order-btn');
  const addDishesBtn = document.getElementById('add-dishes-btn');

  // ---------------- Estados del pedido (píldora clickeable) ----------------
  const pedidoStatusOrder = ['pendiente', 'en preparación', 'listo', 'entregado', 'pagado', 'cancelado'];
  const pedidoStatusColors = {
    'pendiente': 'bg-yellow-100 text-yellow-700',
    'en preparación': 'bg-blue-100 text-blue-700',
    'listo': 'bg-green-100 text-green-700',
    'entregado': 'bg-purple-100 text-purple-700',
    'pagado': 'bg-gray-200 text-gray-700',
    'cancelado': 'bg-red-100 text-red-700',
    'cancelado y pagado': 'bg-gray-300 text-gray-700' // compatibilidad
  };
  const estadosFinales = new Set(['pagado', 'cancelado', 'cancelado y pagado']);

  // ---------------- Estado en memoria ----------------
  let platillosSeleccionados = [];
  let pedidosGuardados = JSON.parse(localStorage.getItem('pedidosGuardados')) || [];
  let pedidoEnEdicion = null;

  // ---------------- Utilidades de fecha/hora ----------------
  function obtenerFechaHoraActual() {
    const now = new Date();
    const dia = now.getDate().toString().padStart(2, '0');
    const mes = (now.getMonth() + 1).toString().padStart(2, '0');
    const anio = now.getFullYear();
    const hh = now.getHours().toString().padStart(2, '0');
    const mm = now.getMinutes().toString().padStart(2, '0');
    return `${dia}/${mes}/${anio} ${hh}:${mm}`;
  }

  // ---------------- Mesas: filtrar no disponibles ----------------
  function filtrarMesasDisponibles() {
    const mesasEstado = JSON.parse(localStorage.getItem('estadoMesas'));
    if (!mesasEstado) return;

    const opciones = mesaSelect.querySelectorAll('option');
    opciones.forEach(option => {
      if (option.value === '') return;
      const mesa = mesasEstado.find(m => m.number.toString() === option.value);
      if (mesa && (mesa.status === 'reservada' || mesa.status === 'ocupada' || mesa.status === 'limpieza')) {
        option.disabled = true;
        option.textContent = `Mesa ${mesa.number} (${mesa.status})`;
      } else {
        option.disabled = false;
        option.textContent = `Mesa ${option.value}`;
      }
    });
  }

  // ---------------- Guardar/cargar datos temporales de formulario ----------------
  function saveFormDataToStorage() {
    localStorage.setItem('clienteTemporal', customerInput.value);
    localStorage.setItem('mesaTemporal', mesaSelect.value);
  }

  function loadFormDataFromStorage() {
    const clienteGuardado = localStorage.getItem('clienteTemporal');
    const mesaGuardada = localStorage.getItem('mesaTemporal');
    if (clienteGuardado) customerInput.value = clienteGuardado;
    if (mesaGuardada) mesaSelect.value = mesaGuardada;
    localStorage.removeItem('clienteTemporal');
    localStorage.removeItem('mesaTemporal');
  }

  // ---------------- Render de platillos ----------------
  function renderDishes() {
    dishesSummary.innerHTML = '';

    if (platillosSeleccionados.length === 0) {
      itemCountBadge.classList.add('hidden');
      return;
    }

    itemCountBadge.textContent = `${platillosSeleccionados.length} items`;
    itemCountBadge.classList.remove('hidden');

    platillosSeleccionados.forEach((dish, index) => {
      const precioUnitario = parseFloat(dish.precio) || 0;
      const itemDiv = document.createElement('div');
      itemDiv.className = 'flex justify-between items-center bg-white border rounded-lg px-2 py-1 mb-2';

      itemDiv.innerHTML = `
        <div>
          <p class="font-semibold text-sm">${dish.nombre}</p>
          <p class="text-xs text-gray-500">$${precioUnitario.toFixed(2)} x ${dish.cantidad} = $${(precioUnitario * dish.cantidad).toFixed(2)}</p>
        </div>
        <div class="flex items-center space-x-1">
          <button class="px-2 bg-gray-200 rounded" data-action="decrease" data-index="${index}">-</button>
          <span class="text-sm font-medium">${dish.cantidad}</span>
          <button class="px-2 bg-gray-200 rounded" data-action="increase" data-index="${index}">+</button>
          <button class="text-red-500 ml-2" data-action="remove" data-index="${index}">
            <i class="fas fa-trash"></i>
          </button>
        </div>
      `;

      dishesSummary.appendChild(itemDiv);
    });

    const totalPedido = platillosSeleccionados.reduce((total, dish) => {
      const precio = parseFloat(dish.precio) || 0;
      return total + (precio * dish.cantidad);
    }, 0);

    const propina = totalPedido * 0.10;
    const totalConPropina = totalPedido + propina;

    const totalDiv = document.createElement('div');
    totalDiv.className = 'text-right font-semibold text-sm mt-2';
    totalDiv.innerHTML = `
      Subtotal: $${totalPedido.toFixed(2)}<br>
      Propina (10%): $${propina.toFixed(2)}<br>
      Total: $${totalConPropina.toFixed(2)}
    `;

    dishesSummary.appendChild(totalDiv);
  }

  function persistDishPreselection() {
    // Guarda la preselección SOLO para Pedidos (aislado de Reservas)
    sessionStorage.setItem('ord_dishes_pre', JSON.stringify(platillosSeleccionados));
  }

  function handleDishActions(e) {
    const action = e.target.dataset.action;
    const index = parseInt(e.target.dataset.index);

    if (action === 'increase') {
      platillosSeleccionados[index].cantidad++;
    } else if (action === 'decrease') {
      if (platillosSeleccionados[index].cantidad > 1) {
        platillosSeleccionados[index].cantidad--;
      }
    } else if (action === 'remove') {
      platillosSeleccionados.splice(index, 1);
    }

    renderDishes();
    persistDishPreselection();
  }

  // ---------------- Cargar selección desde sessionStorage (ord_*) ----------------
  function loadDishSelectionFromSession() {
    try {
      const sel = sessionStorage.getItem('ord_dishes_sel');
      if (sel) {
        platillosSeleccionados = JSON.parse(sel) || [];
        platillosSeleccionados.forEach(p => { if (!p.cantidad) p.cantidad = 1; });
        sessionStorage.removeItem('ord_dishes_sel');
        renderDishes();
        return;
      }
      const pre = sessionStorage.getItem('ord_dishes_pre');
      if (pre) {
        platillosSeleccionados = JSON.parse(pre) || [];
        platillosSeleccionados.forEach(p => { if (!p.cantidad) p.cantidad = 1; });
        renderDishes();
      }
    } catch { /* noop */ }
  }

  // ---------------- Cargar edición (si existe) ----------------
  function loadEditIfAny() {
    const pedidoEditando = localStorage.getItem('pedidoEnEdicion');
    if (pedidoEditando) {
      pedidoEnEdicion = JSON.parse(pedidoEditando);
      saveOrderBtn.textContent = 'Actualizar Pedido';
      customerInput.value = pedidoEnEdicion.Cliente || '';
      mesaSelect.value = pedidoEnEdicion.Mesa || '';
      orderTime.value = pedidoEnEdicion.Hora || obtenerFechaHoraActual();

      // Cargar platillos desde el pedido en edición
      platillosSeleccionados = (pedidoEnEdicion.Platillos || []).map(p => ({
        nombre: p.nombre,
        cantidad: p.cantidad || 1,
        precio: p.precio
      }));
      renderDishes();
    }
  }

  // ---------------- Limpiar formulario ----------------
  function clearForm() {
    mesaSelect.value = '';
    customerInput.value = '';
    orderTime.value = '';
    platillosSeleccionados = [];
    pedidoEnEdicion = null;
    renderDishes();

    localStorage.removeItem('clienteTemporal');
    localStorage.removeItem('mesaTemporal');
    localStorage.removeItem('pedidoEnEdicion');

    // Limpiar claves de selección de PEDIDOS
    sessionStorage.removeItem('ord_dishes_pre');
    sessionStorage.removeItem('ord_dishes_sel');
    sessionStorage.removeItem('ord_return');

    saveOrderBtn.textContent = 'Guardar Pedido';

    dishesError.classList.add('hidden');
    mesaError.classList.add('hidden');
    customerError.classList.add('hidden');
  }

  // ---------------- Abrir formulario ----------------
  function openOrderForm() {
    newOrderForm.classList.remove('hidden');
    ordersList.classList.add('hidden');
    newOrderBtn.classList.add('hidden');

    // Fecha + hora correctas
    orderTime.value = obtenerFechaHoraActual();

    filtrarMesasDisponibles();
    // Orden: primero edición (si la hay), luego selección desde menú (si la hay)
    loadEditIfAny();
    loadFormDataFromStorage();
    // Si no hay edición, carga selección desde session
    if (!pedidoEnEdicion) loadDishSelectionFromSession();
  }

  // ---------------- Tarjeta de pedido ----------------
  function agregarTarjetaPedido(pedido) {
    const card = document.createElement('div');
    card.className = 'tarjeta-animada border border-gray-200 rounded-xl p-4 bg-white shadow-sm cursor-pointer hover:bg-gray-40 transition';

    const listaPlatillos = pedido.Platillos.map(p => `<li>${p.nombre} (x${p.cantidad})</li>`).join('');

    const totalPedido = pedido.Platillos.reduce((total, p) => {
      const precio = parseFloat(p.precio) || 0;
      return total + (precio * p.cantidad);
    }, 0);

    const propina = totalPedido * 0.10;
    const totalConPropina = totalPedido + propina;

    let estadoActual = pedido.Estado || 'pendiente';
    let confirmado = !!pedido.Confirmado;

    card.innerHTML = `
      <div class="flex justify-between items-start">
        <h2 class="font-bold text-lg">Pedido de ${pedido.Cliente}</h2>
        <button
          class="estado-pedido inline-block px-2 py-0.5 rounded-full text-xs font-semibold ${pedidoStatusColors[estadoActual] || 'bg-gray-100 text-gray-700'}"
          data-id="${pedido.id}"
          data-estado="${estadoActual}"
          title="Haz clic para cambiar el estado"
        >
          ${estadoActual}
        </button>
      </div>

      <p><strong>Mesa:</strong> ${pedido.Mesa}</p>
      <p><strong>Mesero:</strong> ${pedido.Mesero}</p>
      <p><strong>Fecha:</strong> ${pedido.Hora}</p>

      <div class="acciones-extra mt-2 flex justify-end">
        <button class="btn-confirmar-estado bg-emerald-600 hover:bg-emerald-700 text-white px-3 py-1 rounded text-sm font-medium hidden"
          data-id="${pedido.id}">
          Confirmar
        </button>
      </div>

      <p class="mt-2"><strong>Platillos:</strong></p>
      <ul class="list-disc pl-5 text-sm mb-2">
        ${listaPlatillos}
      </ul>

      <p class="font-semibold text-right text-sm mb-3">
        Total: $${totalConPropina.toFixed(2)}
      </p>

      <div class="flex justify-start">
        <button class="btn-eliminar bg-red-500 text-white px-3 py-1 rounded text-sm font-medium"
          data-action="delete" data-id="${pedido.id}">
          Eliminar
        </button>
      </div>
    `;

    const deleteBtn = card.querySelector('.btn-eliminar');
    const estadoBtn = card.querySelector('.estado-pedido');
    const confirmBtn = card.querySelector('.btn-confirmar-estado');

    function actualizarUIConfirmacion(estado, isConfirmado) {
      if (estadosFinales.has(estado) && !isConfirmado) {
        confirmBtn.textContent = (estado === 'pagado' || estado === 'cancelado y pagado')
          ? 'Confirmar pago'
          : 'Confirmar cancelación';
        confirmBtn.classList.remove('hidden');
      } else {
        confirmBtn.classList.add('hidden');
      }
    }

    function aplicarBloqueo(estado, isConfirmado) {
      const bloquear = isConfirmado && estadosFinales.has(estado);

      deleteBtn.disabled = bloquear;
      deleteBtn.title = bloquear ? 'No se puede eliminar un pedido confirmado' : '';
      deleteBtn.className = bloquear
        ? 'btn-eliminar bg-gray-300 text-gray-500 px-3 py-1 rounded text-sm font-medium cursor-not-allowed'
        : 'btn-eliminar bg-red-500 text-white px-3 py-1 rounded text-sm font-medium';

      card.dataset.bloqueado = bloquear ? '1' : '0';

      if (bloquear) {
        estadoBtn.style.pointerEvents = 'none';
        estadoBtn.classList.add('cursor-not-allowed', 'opacity-80');
        estadoBtn.title = 'Pedido confirmado, no se puede cambiar el estado';
      } else {
        estadoBtn.style.pointerEvents = 'auto';
        estadoBtn.classList.remove('cursor-not-allowed', 'opacity-80');
        estadoBtn.title = 'Haz clic para cambiar el estado';
      }

      actualizarUIConfirmacion(estado, isConfirmado);
    }

    aplicarBloqueo(estadoActual, confirmado);

    deleteBtn.addEventListener('click', (e) => {
      e.stopPropagation();
      if (card.dataset.bloqueado === '1') return;
      eliminarPedido(e.target.dataset.id);
    });

    estadoBtn.addEventListener('click', async (e) => {
      e.stopPropagation();
      if (confirmado) return;

      const id = parseInt(e.currentTarget.dataset.id);
      const actual = e.currentTarget.dataset.estado;
      const idx = pedidoStatusOrder.indexOf(actual);
      const siguiente = pedidoStatusOrder[(idx + 1) % pedidoStatusOrder.length];

      e.currentTarget.dataset.estado = siguiente;
      e.currentTarget.textContent = siguiente;
      e.currentTarget.className =
        `estado-pedido inline-block px-2 py-0.5 rounded-full text-xs font-semibold ${pedidoStatusColors[siguiente] || 'bg-gray-100 text-gray-700'}`;

      estadoActual = siguiente;

      const pedidoIndex = pedidosGuardados.findIndex(p => p.id === id);
      if (pedidoIndex >= 0) {
        pedidosGuardados[pedidoIndex].Estado = siguiente;
        guardarPedidosEnLocalStorage();
      }

      aplicarBloqueo(estadoActual, confirmado);

      try {
        await fetch(`https://retoolapi.dev/fr98C0/pedidos/${id}`, {
          method: 'PATCH',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ Estado: siguiente })
        });
      } catch (err) {
        console.error('Error actualizando estado en API:', err);
      }
    });

    confirmBtn.addEventListener('click', async (e) => {
      e.stopPropagation();
      if (!estadosFinales.has(estadoActual)) return;

      const id = parseInt(confirmBtn.dataset.id);

      const pedidoIndex = pedidosGuardados.findIndex(p => p.id === id);
      if (pedidoIndex >= 0) {
        pedidosGuardados[pedidoIndex].Confirmado = true;
        guardarPedidosEnLocalStorage();
      }
      confirmado = true;

      if (pedido.Mesa) {
        actualizarEstadoMesaDisponible(pedido.Mesa);
      }

      aplicarBloqueo(estadoActual, confirmado);

      try {
        await fetch(`https://retoolapi.dev/fr98C0/pedidos/${id}`, {
          method: 'PATCH',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ Confirmado: true })
        });
      } catch (err) {
        console.error('Error confirmando estado en API:', err);
      }
    });

    card.addEventListener('click', () => {
      if (card.dataset.bloqueado === '1') return;

      customerInput.value = pedido.Cliente;
      mesaSelect.value = pedido.Mesa;
      orderTime.value = pedido.Hora;

      platillosSeleccionados = pedido.Platillos.map(p => ({
        nombre: p.nombre,
        cantidad: p.cantidad,
        precio: p.precio
      }));
      renderDishes();

      pedidoEnEdicion = pedido;
      localStorage.setItem('pedidoEnEdicion', JSON.stringify(pedido));

      saveOrderBtn.textContent = 'Actualizar Pedido';

      newOrderForm.classList.remove('hidden');
      ordersList.classList.add('hidden');
      newOrderBtn.classList.add('hidden');
    });

    ordersList.prepend(card);
  }

  // ---------------- Eliminar pedido ----------------
  function eliminarPedido(id) {
    const pedidoEliminado = pedidosGuardados.find(pedido => pedido.id === parseInt(id));

    pedidosGuardados = pedidosGuardados.filter(pedido => pedido.id !== parseInt(id));
    guardarPedidosEnLocalStorage();
    cargarPedidosGuardados();

    if (pedidoEliminado && pedidoEliminado.Mesa) {
      actualizarEstadoMesaDisponible(pedidoEliminado.Mesa);
    }
  }

  // ---------------- Mesas: marcar disponible/ocupada ----------------
  function actualizarEstadoMesaDisponible(numeroMesa) {
    let estadoMesas = JSON.parse(localStorage.getItem('estadoMesas')) || [];
    const index = estadoMesas.findIndex(m => m.number.toString() === numeroMesa.toString());
    if (index >= 0) {
      estadoMesas[index].status = 'disponible';
    }
    localStorage.setItem('estadoMesas', JSON.stringify(estadoMesas));
  }

  function actualizarEstadoMesaOcupada(numeroMesa) {
    let estadoMesas = JSON.parse(localStorage.getItem('estadoMesas')) || [];
    const index = estadoMesas.findIndex(m => m.number.toString() === numeroMesa.toString());

    if (index >= 0) {
      estadoMesas[index].status = 'ocupada';
    } else {
      estadoMesas.push({ number: parseInt(numeroMesa), status: 'ocupada' });
    }
    localStorage.setItem('estadoMesas', JSON.stringify(estadoMesas));
  }

  // ---------------- Persistencia de pedidos ----------------
  function guardarPedidosEnLocalStorage() {
    localStorage.setItem('pedidosGuardados', JSON.stringify(pedidosGuardados));
  }

  function cargarPedidosGuardados() {
    ordersList.innerHTML = '';
    pedidosGuardados.forEach(pedido => agregarTarjetaPedido(pedido));
  }

  // ---------------- Inicializaciones ----------------
  // Abrir formulario si viene de "nuevo=true"
  if (localStorage.getItem('abrirFormularioPedido') === 'true') {
    localStorage.removeItem('abrirFormularioPedido');
    openOrderForm();
  }

  // Si se regresa desde Menú con selección/preselección, abrir formulario
  if (!newOrderForm || newOrderForm.classList.contains('hidden')) {
    if (sessionStorage.getItem('ord_dishes_sel') || sessionStorage.getItem('ord_dishes_pre')) {
      openOrderForm();
    }
  }

  cargarPedidosGuardados();

  // ---------------- Eventos UI ----------------
  newOrderBtn.addEventListener('click', openOrderForm);

  backToOrdersBtn.addEventListener('click', () => {
    newOrderForm.classList.add('hidden');
    ordersList.classList.remove('hidden');
    newOrderBtn.classList.remove('hidden');
    clearForm();
  });

  // Ir al menú en modo selección (aislado para Pedidos)
  addDishesBtn.addEventListener('click', () => {
    saveFormDataToStorage();

    // Persistir preselección actual y el retorno
    sessionStorage.setItem('ord_dishes_pre', JSON.stringify(platillosSeleccionados));
    sessionStorage.setItem('ord_return', location.pathname || 'orders.html');

    // Guardar pedidoEnEdicion si corresponde
    if (pedidoEnEdicion) {
      localStorage.setItem('pedidoEnEdicion', JSON.stringify(pedidoEnEdicion));
    }

    window.location.href = 'menu.html?modo=seleccion&from=orders';
  });

  // Guardar/actualizar pedido
  saveOrderBtn.addEventListener('click', async (e) => {
    e.preventDefault();
    let valid = true;

    if (mesaSelect.value === '') {
      mesaError.classList.remove('hidden');
      valid = false;
    } else {
      mesaError.classList.add('hidden');
    }

    if (customerInput.value.trim() === '') {
      customerError.classList.remove('hidden');
      valid = false;
    } else {
      customerError.classList.add('hidden');
    }

    if (platillosSeleccionados.length === 0) {
      dishesError.classList.remove('hidden');
      valid = false;
    } else {
      dishesError.classList.add('hidden');
    }

    if (!valid) return;

    const pedido = {
      id: pedidoEnEdicion ? pedidoEnEdicion.id : Date.now(),
      Cliente: customerInput.value.trim(),
      Mesa: mesaSelect.value,
      Mesero: "Juan",
      Hora: orderTime.value,
      Estado: (pedidoEnEdicion && pedidoEnEdicion.Estado) ? pedidoEnEdicion.Estado : 'pendiente',
      Confirmado: (pedidoEnEdicion && 'Confirmado' in pedidoEnEdicion) ? !!pedidoEnEdicion.Confirmado : false,
      Platillos: platillosSeleccionados.map(p => ({
        nombre: p.nombre,
        cantidad: p.cantidad,
        precio: p.precio
      }))
    };

    // Mesa ocupada al guardar
    actualizarEstadoMesaOcupada(mesaSelect.value);

    try {
      let response;
      const isUpdate = pedidoEnEdicion !== null;

      if (isUpdate) {
        response = await fetch(`https://retoolapi.dev/fr98C0/pedidos/${pedido.id}`, {
          method: 'PUT',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(pedido)
        });
      } else {
        response = await fetch('https://retoolapi.dev/fr98C0/pedidos', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(pedido)
        });
      }

      if (response.ok) {
        if (isUpdate) {
          const index = pedidosGuardados.findIndex(p => p.id === pedidoEnEdicion.id);
          if (index >= 0) {
            pedidosGuardados[index] = pedido;
          }
        } else {
          pedidosGuardados.push(pedido);
        }

        guardarPedidosEnLocalStorage();
        cargarPedidosGuardados();

        localStorage.removeItem('pedidoEnEdicion');
        localStorage.setItem('refrescarInicio', 'true');

        // limpiar selección de PEDIDOS tras guardar
        sessionStorage.removeItem('ord_dishes_pre');
        sessionStorage.removeItem('ord_dishes_sel');
        sessionStorage.removeItem('ord_return');

        clearForm();
        newOrderForm.classList.add('hidden');
        ordersList.classList.remove('hidden');
        newOrderBtn.classList.remove('hidden');
      } else {
        alert(`Error al ${isUpdate ? 'actualizar' : 'guardar'} el pedido en la API.`);
      }
    } catch (error) {
      console.error('Error al guardar pedido:', error);
      alert('Error de conexión al guardar el pedido.');
    }
  });

  // Delegación de clicks para sumar/restar/eliminar platillos
  dishesSummary.addEventListener('click', (e) => {
    if (e.target.dataset.action) {
      handleDishActions(e);
    } else if (e.target.closest('[data-action]')) {
      handleDishActions({ target: e.target.closest('[data-action]') });
    }
  });

});
