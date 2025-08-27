document.addEventListener('DOMContentLoaded', () => {
  const tableGrid = document.getElementById('table-grid');

  // Estados
  const statusOrder = ['disponible', 'reservada', 'ocupada', 'limpieza'];
  const statusColors = {
    disponible: 'bg-green-100 text-green-600',
    reservada: 'bg-yellow-100 text-yellow-600',
    ocupada: 'bg-red-100 text-red-600',
    limpieza: 'bg-purple-100 text-purple-600'
  };

  // Tipos (fijos: no se cambian desde la UI)
  const typeCapacity = { dos: 2, cuatro: 4, familiar: 6 };
  function getTypeByNumber(n) {
    if (n >= 1 && n <= 4) return 'dos';
    if (n >= 5 && n <= 8) return 'cuatro';
    return 'familiar';
  }
  function typeLabel(t) {
    if (t === 'dos') return '2 personas';
    if (t === 'cuatro') return '4 personas';
    return 'Familiar';
  }

  // Crea 12 mesas por defecto con estado y tipo
  function getDefaultTables() {
    return Array.from({ length: 12 }, (_, i) => {
      const number = i + 1;
      const type = getTypeByNumber(number);
      return { number, status: 'disponible', type, capacity: typeCapacity[type] };
    });
  }

  // Asegura que cada mesa tenga type/capacity (y opcionalmente corrige si faltan)
  function normalizeTables(mesas) {
    let changed = false;
    const out = mesas.map(m => {
      const ensuredType = m.type || getTypeByNumber(m.number); // si no tenía, lo asigna por número
      const ensuredCap = m.capacity || typeCapacity[ensuredType];
      if (m.type !== ensuredType || m.capacity !== ensuredCap || !m.status) changed = true;
      return {
        number: m.number,
        status: m.status || 'disponible',
        type: ensuredType,
        capacity: ensuredCap
      };
    });
    return { tables: out, changed };
  }

  function renderTables() {
    tableGrid.innerHTML = '';

    const stored = JSON.parse(localStorage.getItem('estadoMesas')) || [];
    const base = stored.length ? stored : getDefaultTables();
    const { tables, changed } = normalizeTables(base);

    // Si se completó info faltante, guarda de vuelta
    if (changed) {
      localStorage.setItem('estadoMesas', JSON.stringify(tables));
    }

    tables.forEach((table) => {
      const card = document.createElement('div');
      card.className = `mesa-animada p-8 min-h-32 rounded-xl border border-gray-200 ${statusColors[table.status] || 'bg-gray-100 text-gray-700'} text-center font-semibold text-lg`;

      // Contenido: número, estado y tipo (mismo color que el estado, sin clases de color propias)
      const renderContent = () => `
        Mesa ${table.number}
        <br><span class="text-sm capitalize">${table.status}</span>
        <br><span class="text-sm">${typeLabel(table.type)}</span>
      `;

      card.innerHTML = renderContent();

      // Clic en la tarjeta -> cambia SOLO el ESTADO (el tipo NO cambia)
      card.addEventListener('click', () => {
        const currentIndex = statusOrder.indexOf(table.status);
        const nextIndex = (currentIndex + 1) % statusOrder.length;
        table.status = statusOrder[nextIndex];

        // Actualiza en localStorage preservando el tipo/capacidad
        const estadoMesas = JSON.parse(localStorage.getItem('estadoMesas')) || [];
        const idx = estadoMesas.findIndex(m => m.number === table.number);
        if (idx >= 0) {
          estadoMesas[idx].status = table.status;
          estadoMesas[idx].type = table.type;
          estadoMesas[idx].capacity = table.capacity;
        } else {
          estadoMesas.push({ number: table.number, status: table.status, type: table.type, capacity: table.capacity });
        }
        localStorage.setItem('estadoMesas', JSON.stringify(estadoMesas));

        // Refresca solo esta tarjeta
        card.className = `mesa-animada p-8 min-h-32 rounded-xl border border-gray-200 ${statusColors[table.status] || 'bg-gray-100 text-gray-700'} text-center font-semibold text-lg`;
        card.innerHTML = renderContent();
      });

      tableGrid.appendChild(card);
    });
  }

  renderTables();
});
