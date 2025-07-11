document.addEventListener('DOMContentLoaded', () => {
  const newOrderBtn = document.getElementById('new-order-btn');
  const newOrderForm = document.getElementById('new-order-form');
  const ordersList = document.getElementById('orders-list');
  const backToOrdersBtn = document.getElementById('back-to-orders');
  const orderTime = document.getElementById('order-time');

  const mesaSelect = document.getElementById('table-select');
  const mesaError = document.getElementById('table-error');

  const dishesError = document.getElementById('dishes-error');
  const saveOrderBtn = document.getElementById('save-order-btn');
  const orderForm = document.getElementById('order-form');

  // Simulación: validación de platillos seleccionados
  let platillosAgregados = false;

  // Función para limpiar el formulario
  function clearForm() {
    mesaSelect.value = ''; // Limpiar el campo de mesa
    orderTime.value = ''; // Limpiar el campo de hora
    dishesError.classList.add('hidden'); // Ocultar error de platillos
    mesaError.classList.add('hidden'); // Ocultar error de mesa
  }

  // Al hacer clic en el botón "Nuevo Pedido"
  newOrderBtn.addEventListener('click', () => {
    newOrderForm.classList.remove('hidden'); // Mostrar el formulario
    ordersList.classList.add('hidden'); // Ocultar la lista de pedidos
    newOrderBtn.classList.add('hidden'); // Ocultar el botón de "Nuevo Pedido"

    // Limpiar errores al abrir el formulario
    mesaError.classList.add('hidden');
    dishesError.classList.add('hidden');

    // Establecer la hora actual
    const now = new Date();
    const horas = now.getHours().toString().padStart(2, '0');
    const minutos = now.getMinutes().toString().padStart(2, '0');
    orderTime.value = `${horas}:${minutos}`;
  });

  // Al hacer clic en el botón "Cancelar"
  backToOrdersBtn.addEventListener('click', () => {
    newOrderForm.classList.add('hidden'); // Ocultar el formulario
    ordersList.classList.remove('hidden'); // Mostrar la lista de pedidos
    newOrderBtn.classList.remove('hidden'); // Mostrar el botón de "Nuevo Pedido"

    clearForm(); // Limpiar campos
  });

  // Al hacer clic en "Guardar Pedido" (simulación de validación)
  saveOrderBtn.addEventListener('click', (e) => {
    e.preventDefault();

    let valid = true;

    // Validar mesa seleccionada
    if (mesaSelect.value === '') {
      mesaError.classList.remove('hidden');
      mesaError.classList.add('text-red-500');
      valid = false;
    } else {
      mesaError.classList.add('hidden');
    }

    // Validar si se han agregado platillos (simulación)
    if (!platillosAgregados) {
      dishesError.classList.remove('hidden');
      dishesError.classList.add('text-red-500');
      valid = false;
    } else {
      dishesError.classList.add('hidden');
    }

    if (valid) {
      alert('Pedido guardado correctamente');
      clearForm(); // Limpiar campos después de guardar
      newOrderForm.classList.add('hidden'); // Ocultar el formulario
      ordersList.classList.remove('hidden'); // Mostrar la lista de pedidos
      newOrderBtn.classList.remove('hidden'); // Mostrar el botón de "Nuevo Pedido"
    }
  });
});

