document.addEventListener('DOMContentLoaded', () => {
  const tableGrid = document.getElementById('table-grid');

  // Todas las mesas inician como disponibles
  const tables = Array.from({ length: 12 }, (_, i) => ({
    number: i + 1,
    status: 'disponible'
  }));

  const statusOrder = ['disponible', 'reservada', 'ocupada'];

  const statusColors = {
    disponible: 'bg-green-100 text-green-600',
    reservada: 'bg-yellow-100 text-yellow-600',
    ocupada: 'bg-red-100 text-red-600'
  };

  tables.forEach((table, index) => {
    const card = document.createElement('div');
    card.className = `p-8 min-h-32 rounded-xl border border-gray-200 ${statusColors[table.status]} text-center font-semibold text-lg`;
    card.innerHTML = `Mesa ${table.number}<br><span class="text-xs capitalize">${table.status}</span>`;

    // Evento click para cambiar de estado en orden
    card.addEventListener('click', () => {
      const currentIndex = statusOrder.indexOf(table.status);
      const nextIndex = (currentIndex + 1) % statusOrder.length;
      table.status = statusOrder[nextIndex];

      // Actualizar colores y texto
      card.className = `p-8 min-h-32 rounded-xl border border-gray-200 ${statusColors[table.status]} text-center font-semibold text-lg`;
      card.innerHTML = `Mesa ${table.number}<br><span class="text-sm capitalize">${table.status}</span>`;
    });

    tableGrid.appendChild(card);
  });
});
