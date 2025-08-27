document.addEventListener('DOMContentLoaded', () => {

  // ========== Secciones principales ==========
  const reservationsSection   = document.getElementById('reservations-section');
  const reservationForm       = document.getElementById('new-reservation-form');
  const newReservationBtn     = document.getElementById('new-reservation-btn');
  const cancelReservationBtn  = document.getElementById('cancel-reservation-btn');
  const buttonSection         = document.getElementById('button-section');

  // Contenedores dinámicos
  let reservationsList = reservationsSection.querySelector('#reservations-list');
  if (!reservationsList) {
    reservationsList = document.createElement('div');
    reservationsList.id = 'reservations-list';
    reservationsList.className = 'grid gap-4 md:grid-cols-2 xl:grid-cols-3';
    reservationsSection.appendChild(reservationsList);
  }
  let reservationsEmpty = reservationsSection.querySelector('#reservations-empty');
  if (!reservationsEmpty) {
    reservationsEmpty = document.createElement('div');
    reservationsEmpty.id = 'reservations-empty';
    reservationsEmpty.className = 'text-gray-500';
    reservationsEmpty.textContent = 'Aún no hay reservas. Crea la primera con el botón “Nueva reserva”.';
    reservationsSection.insertBefore(reservationsEmpty, reservationsList);
  }
  reservationsList.innerHTML = '';

  // ========== Inputs del formulario ==========
  const clientNameInput   = document.getElementById('client-name');
  const clientPhoneInput  = document.getElementById('client-phone');
  const timeStartInput    = document.getElementById('reservation-time-start');
  const timeEndInput      = document.getElementById('reservation-time-end');
  const peopleInput       = document.getElementById('reservation-people');
  const dateInput         = document.getElementById('reservation-date');
  const eventSelect       = document.getElementById('reservation-event');
  const saveReservationBtn= document.getElementById('save-reservation-btn');
  const commentInput      = document.getElementById('reservation-comment');

  // Forzar tipo texto y placeholder en horas (sin spinners)
  if (timeStartInput) {
    timeStartInput.type = 'text';
    timeStartInput.setAttribute('inputmode', 'numeric');
    timeStartInput.setAttribute('placeholder', '12:59');
    timeStartInput.autocomplete = 'off';
  }
  if (timeEndInput) {
    timeEndInput.type = 'text';
    timeEndInput.setAttribute('inputmode', 'numeric');
    timeEndInput.setAttribute('placeholder', '12:59');
    timeEndInput.autocomplete = 'off';
  }

  // ========== Errores ==========
  const clientError    = document.getElementById('client-error');
  const phoneError     = document.getElementById('phone-error');
  const dateError      = document.getElementById('date-error');
  const timeStartError = document.getElementById('time-start-error');
  const timeEndError   = document.getElementById('time-end-error');
  const peopleError    = document.getElementById('people-error');
  const eventError     = document.getElementById('event-error');
  const tablesError    = document.getElementById('tables-error'); // conflicto/selección de mesas
  const dishesError    = document.getElementById('dishes-error'); // platillos opcionales

  // ========== AM/PM ==========
  const startAmPmSelect = document.getElementById('reservation-time-start-ampm');
  const endAmPmSelect   = document.getElementById('reservation-time-end-ampm');

  // ========== Fecha mínima ==========
  // Bloquear reservas el mismo día: mínimo = mañana
  const today = new Date();
  const minDate = new Date(today.getFullYear(), today.getMonth(), today.getDate() + 1);
  const yyyy  = minDate.getFullYear();
  const mm    = String(minDate.getMonth() + 1).padStart(2, '0');
  const dd    = String(minDate.getDate()).padStart(2, '0');
  dateInput.setAttribute('min', `${yyyy}-${mm}-${dd}`);
  dateInput.addEventListener('keydown', e => e.preventDefault());

  // ========== Validaciones de entrada ==========
  clientNameInput.addEventListener('input', () => {
    clientNameInput.value = clientNameInput.value.replace(/[^a-zA-ZáéíóúÁÉÍÓÚñÑ\s]/g, '');
  });
  clientPhoneInput.addEventListener('input', () => {
    let value = clientPhoneInput.value.replace(/[^0-9]/g, '').slice(0, 8);
    if (value.length > 4) value = value.slice(0, 4) + '-' + value.slice(4);
    clientPhoneInput.value = value;
  });

  // ======= MÁSCARA DE HORA: versión estricta 12/59 (tipo teléfono) =======
  function clamp(n, min, max) { return Math.min(Math.max(n, min), max); }
  function countDigits(str) { return (String(str).match(/\d/g) || []).length; }

  function caretDigitsBefore(el) {
    const before = el.value.slice(0, el.selectionStart ?? el.value.length);
    return countDigits(before);
  }
  function placeCaretByDigitIndex(el, di) {
    let pos = Math.min(di, 4);
    if (pos > 2) pos += 1; // saltar ":"
    try { el.setSelectionRange(pos, pos); } catch {}
  }

  /**
   * Construye una vista HH:MM a partir de dígitos, sin permitir HH>12 ni MM>59.
   * - Hora: 1–12 (no 0). Si teclean "13", se interpreta "1:3…"
   * - Minuto: primer dígito 0–5; si ponen 7, queda "07".
   * - Si MM (dos dígitos) > 59, se fija en 59.
   * - Devuelve "H" o "HH" mientras no hay minutos.
   */
  function buildTimeFromDigits(d) {
    let arr = String(d).replace(/\D/g, '').slice(0, 4).split('');

    // No permitir "0" como inicio de hora
    while (arr.length && arr[0] === '0') arr.shift();
    if (arr.length === 0) return '';

    // Hora: 1 dígito, salvo que los dos primeros sean 10–12
    let hourDigits = [];
    if (arr.length >= 2) {
      const two = parseInt(arr[0] + arr[1], 10);
      if (two >= 10 && two <= 12) {
        hourDigits = [arr.shift(), arr.shift()];
      } else {
        hourDigits = [arr.shift()];
      }
    } else {
      hourDigits = [arr.shift()];
    }

    let hour = parseInt(hourDigits.join(''), 10);
    hour = clamp(hour, 1, 12);

    // Minutos: máx 2 dígitos, primer dígito 0–5
    let minuteDigits = arr.slice(0, 2);
    if (minuteDigits.length >= 1 && parseInt(minuteDigits[0], 10) > 5) {
      // ej. 7 → "07"
      minuteDigits = ['0', minuteDigits[0]];
    }
    if (minuteDigits.length === 2) {
      const mval = parseInt(minuteDigits.join(''), 10);
      if (mval > 59) minuteDigits = ['5', '9'];
    }

    return minuteDigits.length ? `${hour}:${minuteDigits.join('')}` : `${hour}`;
  }

  // Normaliza a HH:MM (completa minutos y corrige fuera de rango por si acaso)
  function normalizeTimeForSave(v) {
    if (!v) return '';
    const m = String(v).trim().match(/^(\d{1,2})(?::(\d{1,2}))?$/);
    if (!m) return '';
    let h = parseInt(m[1], 10);
    let mi = m[2] !== undefined ? parseInt(m[2], 10) : 0;
    if (!Number.isFinite(h)) return '';
    h = clamp(h, 1, 12);
    mi = Number.isFinite(mi) ? clamp(mi, 0, 59) : 0;
    return `${h}:${String(mi).padStart(2, '0')}`;
  }

  function attachTimePhoneMask(el) {
    if (!el) return;

    // Borrar sobre ":" sin que salte el cursor
    el.addEventListener('keydown', (e) => {
      const pos = el.selectionStart ?? 0;
      if (e.key === 'Backspace' && pos > 0 && el.value[pos - 1] === ':') {
        e.preventDefault();
        const before = el.value.slice(0, pos - 1);
        const after  = el.value.slice(pos);
        const digits = (before + after).replace(/\D/g, '');
        el.value = buildTimeFromDigits(digits);
        placeCaretByDigitIndex(el, countDigits(before));
      } else if (e.key === 'Delete' && el.value[pos] === ':') {
        e.preventDefault();
        const before = el.value.slice(0, pos);
        const after  = el.value.slice(pos + 1);
        const digits = (before + after).replace(/\D/g, '');
        el.value = buildTimeFromDigits(digits);
        placeCaretByDigitIndex(el, countDigits(before));
      }
    });

    el.addEventListener('input', () => {
      const di = caretDigitsBefore(el);                   // dígitos antes del caret (pre-formato)
      const digits = el.value.replace(/\D/g, '').slice(0, 4);
      el.value = buildTimeFromDigits(digits);
      placeCaretByDigitIndex(el, Math.min(di, digits.length));
    });

    el.addEventListener('paste', (e) => {
      e.preventDefault();
      const text = (e.clipboardData || window.clipboardData).getData('text');
      const digits = String(text).replace(/\D/g, '').slice(0, 4);
      el.value = buildTimeFromDigits(digits);
      placeCaretByDigitIndex(el, digits.length);
    });

    // Al salir: normaliza a HH:MM
    el.addEventListener('blur', () => {
      el.value = normalizeTimeForSave(el.value);
    });
  }
  attachTimePhoneMask(timeStartInput);
  attachTimePhoneMask(timeEndInput);

  // peopleInput
  peopleInput.addEventListener('input', () => {
    peopleInput.value = peopleInput.value.replace(/[^0-9]/g, '');
    if (parseInt(peopleInput.value || '0', 10) > 100) peopleInput.value = '100';
  });

  // ========== Estado de edición ==========
  let editingId = null; // <--- clave para actualizar y NO crear
  function setEditingMode(idOrNull) {
    editingId = idOrNull;
    if (idOrNull) {
      reservationForm.dataset.editingId = idOrNull;   // respaldo en DOM
      saveReservationBtn.textContent = 'Actualizar Reserva';
    } else {
      delete reservationForm.dataset.editingId;
      saveReservationBtn.textContent = 'Guardar Reserva';
    }
  }

  // ========== Mostrar/ocultar formulario ==========
  function openReservationForm() {
    reservationsSection.classList.add('hidden');
    reservationForm.classList.remove('hidden');
    buttonSection.classList.add('hidden');
    reservationForm.classList.remove('fadeSlideIn');
    void reservationForm.offsetWidth;
    reservationForm.classList.add('fadeSlideIn');
  }
  function closeReservationForm() {
    reservationForm.classList.add('hidden');
    reservationsSection.classList.remove('hidden');
    buttonSection.classList.remove('hidden');
  }

  newReservationBtn.addEventListener('click', () => {
    setEditingMode(null);
    openReservationForm();
  });

  cancelReservationBtn.addEventListener('click', () => {
    clearForm();
    closeReservationForm();
    clearReservationSessionKeys();
    setEditingMode(null);
  });

  // ========== Session (para volver desde Menú) ==========
  function saveFormToSession() {
    const payload = {
      clientName: clientNameInput.value,
      clientPhone: clientPhoneInput.value,
      date: dateInput.value,
      timeStart: timeStartInput.value,
      startAmPm: startAmPmSelect.value,
      timeEnd: timeEndInput.value,
      endAmPm: endAmPmSelect.value,
      people: peopleInput.value,
      event: eventSelect.value,
      comment: commentInput ? commentInput.value : '',
      tables: mesasSeleccionadasArray,
      dishes: platillosSeleccionadosArray,
      editingId: reservationForm.dataset.editingId || editingId || null
    };
    sessionStorage.setItem('rsv_form_data', JSON.stringify(payload));
  }
  function loadFormFromSession() {
    try {
      const raw = sessionStorage.getItem('rsv_form_data');
      if (!raw) return;
      const f = JSON.parse(raw);
      clientNameInput.value = f.clientName || '';
      clientPhoneInput.value = f.clientPhone || '';
      dateInput.value = f.date || '';
      timeStartInput.value = f.timeStart || '';
      startAmPmSelect.value = f.startAmPm || 'AM';
      timeEndInput.value = f.timeEnd || '';
      endAmPmSelect.value = f.endAmPm || 'AM';
      peopleInput.value = f.people || '';
      eventSelect.value = f.event || '';
      if (commentInput) commentInput.value = f.comment || '';

      if (Array.isArray(f.tables)) {
        mesasSeleccionadasArray = f.tables.slice();
        selectedTablesText.textContent = mesasSeleccionadasArray.length
          ? 'Mesas seleccionadas: ' + mesasSeleccionadasArray.sort((a,b)=>a-b).join(', ')
          : 'Ninguna mesa seleccionada.';
        tablesGrid?.querySelectorAll('button').forEach(b => {
          const n = parseInt(b.dataset.mesa, 10);
          b.classList.toggle('mesa-btn-selected', mesasSeleccionadasArray.includes(n));
        });
      }
      if (Array.isArray(f.dishes)) {
        platillosSeleccionadosArray = f.dishes.slice();
        updateSelectedDishesText();
      }

      setEditingMode(f.editingId || null);
    } catch { /* noop */ }
  }
  function clearReservationSessionKeys() {
    sessionStorage.removeItem('rsv_form_data');
    sessionStorage.removeItem('rsv_dishes_pre');
    sessionStorage.removeItem('rsv_dishes_sel');
    sessionStorage.removeItem('rsv_return');
  }

  // ========== Modal de mesas ==========
  const selectTablesBtn    = document.getElementById('select-tables-btn');
  const tablesModal        = document.getElementById('tables-modal');
  const closeTablesModal   = document.getElementById('close-tables-modal');
  const cancelTablesBtn    = document.getElementById('cancel-tables-btn');
  const saveTablesBtn      = document.getElementById('save-tables-btn');
  const tablesGrid         = document.getElementById('tables-grid');
  const selectedTablesText = document.getElementById('selected-tables-text');

  let mesasSeleccionadasArray = [];
  if (tablesGrid) {
    tablesGrid.innerHTML = '';
    for (let i = 1; i <= 12; i++) {
      const btn = document.createElement('button');
      btn.type = 'button';
      btn.className = 'border rounded-lg py-2 flex flex-col items-center text-sm font-medium hover:bg-blue-100 transition';
      btn.innerHTML = `<i class="fas fa-utensils mb-1"></i> Mesa ${i}`;
      btn.dataset.mesa = i;
      btn.addEventListener('click', () => {
        const mesa = parseInt(btn.dataset.mesa, 10);
        const sel = mesasSeleccionadasArray.includes(mesa);
        mesasSeleccionadasArray = sel
          ? mesasSeleccionadasArray.filter(m => m !== mesa)
          : [...mesasSeleccionadasArray, mesa];
        btn.classList.toggle('mesa-btn-selected', !sel);
      });
      tablesGrid.appendChild(btn);
    }
  }
  function cerrarModalMesas(){ tablesModal.classList.add('hidden'); }
  selectTablesBtn?.addEventListener('click', () => tablesModal.classList.remove('hidden'));
  closeTablesModal?.addEventListener('click', cerrarModalMesas);
  cancelTablesBtn?.addEventListener('click', cerrarModalMesas);
  saveTablesBtn?.addEventListener('click', () => {
    cerrarModalMesas();
    if (mesasSeleccionadasArray.length > 0) {
      selectedTablesText.textContent = 'Mesas seleccionadas: ' + mesasSeleccionadasArray.sort((a,b)=>a-b).join(', ');
      tablesError.classList.add('hidden');
    } else {
      selectedTablesText.textContent = 'Ninguna mesa seleccionada.';
      tablesError.classList.remove('hidden');
      tablesError.textContent = 'Por favor seleccione las mesas.';
    }
  });

  // ========== Platillos (Menú separado) ==========
  const selectDishesBtn    = document.getElementById('select-dishes-btn');
  const selectedDishesText = document.getElementById('selected-dishes-text');
  let platillosSeleccionadosArray = [];
  function dishLabel(d) {
    if (!d) return '';
    if (typeof d === 'string') return d;
    const nombre = d.nombre || d.name || '';
       const qty = d.cantidad || d.qty || 1;
    return `${nombre}${qty > 1 ? ` x${qty}` : ''}`;
  }
  function dishNameOnly(d) { return (typeof d === 'string') ? d : (d.nombre || d.name || ''); }
  function updateSelectedDishesText() {
    selectedDishesText.textContent =
      (!platillosSeleccionadosArray || !platillosSeleccionadosArray.length)
        ? 'Ningún platillo seleccionado.'
        : 'Platillos: ' + platillosSeleccionadosArray.map(dishLabel).join(', ');
  }

  selectDishesBtn?.addEventListener('click', () => {
    saveFormToSession();
    sessionStorage.setItem('rsv_dishes_pre', JSON.stringify(platillosSeleccionadosArray || []));
    sessionStorage.setItem('rsv_return', location.pathname || 'reservations.html');
    window.location.href = 'menu.html?modo=seleccion&from=reservas';
  });

  // Regreso desde menú
  try {
    const sel = sessionStorage.getItem('rsv_dishes_sel');
    const pre = sessionStorage.getItem('rsv_dishes_pre');
    if (sel || pre) { openReservationForm(); loadFormFromSession(); }
    if (sel) {
      platillosSeleccionadosArray = JSON.parse(sel) || [];
      sessionStorage.removeItem('rsv_dishes_sel');
      updateSelectedDishesText();
      dishesError?.classList.add('hidden');
    } else if (pre) {
      platillosSeleccionadosArray = JSON.parse(pre) || [];
      updateSelectedDishesText();
    }
  } catch {}

  // ========== Estados de reserva ==========
  const STATE_ORDER  = ['pendiente', 'confirmada', 'finalizada', 'cancelada'];
  const FINAL_STATES = new Set(['finalizada', 'cancelada']);
  const STATE_COLORS = {
    'pendiente':  'bg-yellow-100 text-yellow-700',
    'confirmada': 'bg-blue-100 text-blue-700',
    'finalizada': 'bg-green-100 text-green-700',
    'cancelada':  'bg-red-100 text-red-700'
  };

  // ========== LocalStorage ==========
  const LS_KEY = 'reservations';
  function loadReservations() {
    try { return JSON.parse(localStorage.getItem(LS_KEY)) || []; }
    catch { return []; }
  }
  function saveReservations(data) {
    localStorage.setItem(LS_KEY, JSON.stringify(data));
  }

  // ================== AUTO-SYNC MESAS CON RESERVAS (por hora) ==================
  function ensureMesasState() {
    let estado = [];
    try { estado = JSON.parse(localStorage.getItem('estadoMesas')) || []; } catch {}
    const byNum = new Map(estado.map(m => [String(m.number), m]));
    for (let i = 1; i <= 12; i++) {
      if (!byNum.has(String(i))) byNum.set(String(i), { number: i, status: 'disponible' });
    }
    const list = Array.from(byNum.values()).sort((a,b) => a.number - b.number);
    localStorage.setItem('estadoMesas', JSON.stringify(list));
    return list;
  }

  // ======= Helpers de tiempo (12h con minutos) =======
  function parseTime12(str) {
    const m = String(str || '').match(/^(\d{1,2})(?::(\d{1,2}))?$/); // acepta 1–2 dígitos de minuto durante edición
    if (!m) return null;
    let h = parseInt(m[1], 10);
    let mi = m[2] !== undefined ? parseInt(m[2], 10) : 0;
    if (!Number.isFinite(h) || !Number.isFinite(mi)) return null;
    h = clamp(h, 1, 12);
    mi = clamp(mi, 0, 59);
    return { h, m: mi };
  }
  function toMinutesFrom12(str, ampm) {
    const t = parseTime12(str);
    if (!t) return NaN;
    let h24 = t.h % 12;
    if (ampm === 'PM') h24 += 12;
    return h24 * 60 + t.m;
  }

  function isReservationActiveNow(r) {
    if (!r?.date || !r?.timeStart || !r?.timeEnd) return false;
    const d = new Date();
    const yyyy = d.getFullYear();
    const mm   = String(d.getMonth()+1).padStart(2,'0');
    const dd   = String(d.getDate()).padStart(2,'0');
    if (r.date !== `${yyyy}-${mm}-${dd}`) return false;

    const sMin = toMinutesFrom12(r.timeStart, r.startAmPm);
    const eMin = toMinutesFrom12(r.timeEnd,   r.endAmPm);
    if (!Number.isFinite(sMin) || !Number.isFinite(eMin)) return false;

    const nowMin = d.getHours()*60 + d.getMinutes();
    return (nowMin >= sMin && nowMin < eMin);
  }

  function mesasReservadasAhora() {
    let res = [];
    try { res = JSON.parse(localStorage.getItem('reservations')) || []; } catch {}
    const set = new Set();
    for (const r of res) {
      if (isReservationActiveNow(r) && Array.isArray(r.tables)) {
        r.tables.forEach(n => set.add(Number(n)));
      }
    }
    return set;
  }

  function syncTablesWithActiveReservations() {
    let estado = ensureMesasState();
    const activas = mesasReservadasAhora();

    estado = estado.map(m => {
      const isActive = activas.has(m.number);
      if (isActive) {
        if (m.status === 'ocupada' || m.status === 'limpieza') return m; // no pisar
        return { ...m, status: 'reservada' };
      } else {
        return m.status === 'reservada' ? { ...m, status: 'disponible' } : m;
      }
    });

    localStorage.setItem('estadoMesas', JSON.stringify(estado));
  }

  function startReservationsTablesAutoSync() {
    syncTablesWithActiveReservations();              // ahora
    if (!window.__rsv_tables_sync_interval__) {
      window.__rsv_tables_sync_interval__ = setInterval(syncTablesWithActiveReservations, 60 * 1000);
    }
  }

  // ========= Validación de conflicto de mesas (fecha + cruce horario con minutos) =========
  function checkTableConflicts(idToEdit, date, startStr, startAmPm, endStr, endAmPm, mesas) {
    const all = loadReservations();
    const sMin = toMinutesFrom12(startStr, startAmPm);
    const eMin = toMinutesFrom12(endStr,   endAmPm);
    for (const r of all) {
      if (r.id === idToEdit) continue;          // no me comparo conmigo
      if (r.date !== date) continue;            // otra fecha

      const rS = toMinutesFrom12(r.timeStart, r.startAmPm);
      const rE = toMinutesFrom12(r.timeEnd,   r.endAmPm);

      const overlap = (sMin < rE && eMin > rS);
      if (!overlap) continue;

      if (r.tables?.some(m => mesas.includes(m))) return true;
    }
    return false;
  }

  // ========== Render de tarjetas + edición ==========
  function renderReservations() {
    const data = loadReservations();
    reservationsList.innerHTML = '';
    if (data.length === 0) { reservationsEmpty.classList.remove('hidden'); return; }
    reservationsEmpty.classList.add('hidden');

    data.forEach(r => {
      if (!r.status) r.status = 'pendiente';
      if (typeof r.statusConfirmed !== 'boolean') r.statusConfirmed = false;

      const card = document.createElement('div');
      card.className = 'bg-white border border-gray-200 rounded-lg p-4 flex flex-col gap-3 cursor-pointer hover:bg-gray-50 transition';

      // HEADER
      const header = document.createElement('div');
      header.className = 'flex justify-between items-start mb-2';

      const left = document.createElement('div');
      left.innerHTML = `
        <h3 class="font-bold text-gray-800">${escapeHTML(r.clientName)}</h3>
        <p class="text-xs text-gray-500">${formatDateLabel(r.date)} - ${formatHour(r.timeStart, r.startAmPm)} a ${formatHour(r.timeEnd, r.endAmPm)}</p>
      `;

      const statusPill = document.createElement('button');
      statusPill.type = 'button';
      statusPill.className = `inline-block px-2 py-0.5 rounded-full text-xs font-semibold ${STATE_COLORS[r.status] || 'bg-gray-100 text-gray-700'}`;
      statusPill.textContent = r.status;
      statusPill.title = r.statusConfirmed ? 'Estado confirmado' : 'Haz clic para cambiar estado';

      const right = document.createElement('div');
      right.appendChild(statusPill);

      header.appendChild(left);
      header.appendChild(right);

      // BODY
      const body = document.createElement('div');
      body.className = 'border-t border-gray-100 pt-2';

      const dishesText = (r.dishes && r.dishes.length)
        ? r.dishes.map(d => escapeHTML(dishNameOnly(d))).join(', ')
        : '—';

      const confirmBtnId = `confirm-${r.id}`;
      body.innerHTML = `
        <div class="flex justify-between text-sm mb-1">
          <span>Mesas: ${r.tables?.length ? r.tables.join(', ') : '—'}</span>
          <span class="font-medium">${r.people} ${r.people === 1 ? 'persona' : 'personas'}</span>
        </div>
        <p class="text-sm text-gray-700"><span class="font-medium">Evento:</span> ${escapeHTML(r.event)}</p>
        <p class="text-sm text-gray-700"><span class="font-medium">Platillos:</span> ${dishesText}</p>
        ${r.comment ? `<p class="text-sm text-gray-600 mt-1">${escapeHTML(r.comment)}</p>` : ''}
        <div class="mt-2 flex justify-between items-center">
          <button id="${confirmBtnId}" class="hidden bg-emerald-600 hover:bg-emerald-700 text-white px-3 py-1 rounded text-sm font-medium">Confirmar</button>
          <button data-id="${r.id}" class="delete-btn text-red-600 hover:text-red-700 text-sm">
            <i class="fa-solid fa-trash-can mr-1"></i>Eliminar
          </button>
        </div>
      `;

      const confirmBtn = body.querySelector('#' + confirmBtnId);
      const deleteBtn  = body.querySelector('.delete-btn');

      function updateConfirmVisibility() {
        if (FINAL_STATES.has(r.status) && !r.statusConfirmed) confirmBtn.classList.remove('hidden');
        else confirmBtn.classList.add('hidden');
      }
      function applyStatusLock() {
        const locked = r.statusConfirmed && FINAL_STATES.has(r.status);
        statusPill.style.pointerEvents = locked ? 'none' : 'auto';
        statusPill.classList.toggle('cursor-not-allowed', locked);
        statusPill.title = locked ? 'Estado final confirmado' : 'Haz clic para cambiar estado';

        deleteBtn.disabled = locked;
        deleteBtn.className = locked
          ? 'delete-btn text-gray-400 cursor-not-allowed text-sm'
          : 'delete-btn text-red-600 hover:text-red-700 text-sm';

        card.dataset.locked = locked ? '1' : '0';
      }

      statusPill.addEventListener('click', (e) => {
        e.stopPropagation();
        if (r.statusConfirmed && FINAL_STATES.has(r.status)) return;
        const idx = STATE_ORDER.indexOf(r.status);
        r.status = STATE_ORDER[(idx + 1) % STATE_ORDER.length];
        if (!FINAL_STATES.has(r.status)) r.statusConfirmed = false;

        statusPill.textContent = r.status;
        statusPill.className = `inline-block px-2 py-0.5 rounded-full text-xs font-semibold ${STATE_COLORS[r.status] || 'bg-gray-100 text-gray-700'}`;

        updateConfirmVisibility();
        applyStatusLock();

        const all = loadReservations();
        const pos = all.findIndex(x => x.id === r.id);
        if (pos >= 0) { all[pos].status = r.status; if (!FINAL_STATES.has(r.status)) all[pos].statusConfirmed = false; saveReservations(all); }
      });

      confirmBtn.addEventListener('click', (e) => {
        e.stopPropagation();
        if (!FINAL_STATES.has(r.status)) return;
        r.statusConfirmed = true;
        const all = loadReservations();
        const pos = all.findIndex(x => x.id === r.id);
        if (pos >= 0) { all[pos].statusConfirmed = true; saveReservations(all); }
        updateConfirmVisibility();
        applyStatusLock();
      });

      deleteBtn.addEventListener('click', (e) => {
        e.stopPropagation();
        if (r.statusConfirmed && FINAL_STATES.has(r.status)) return;
        const all = loadReservations();
        const next = all.filter(x => x.id !== r.id);
        saveReservations(next);
        syncTablesWithActiveReservations(); // sync inmediato tras eliminar
        renderReservations();
      });

      // ======= EDITAR: click en tarjeta =======
      card.addEventListener('click', () => {
        if (card.dataset.locked === '1') return;
        loadReservationIntoForm(r);
        openReservationForm();
        setEditingMode(r.id); // <-- Botón cambia a "Actualizar Reserva"
      });

      updateConfirmVisibility();
      applyStatusLock();

      card.appendChild(header);
      card.appendChild(body);
      reservationsList.appendChild(card);
    });
  }

  // ========== Cargar reserva al formulario (para editar) ==========
  function loadReservationIntoForm(r) {
    clientNameInput.value = r.clientName || '';
    clientPhoneInput.value = r.clientPhone || '';
    dateInput.value = r.date || '';
    timeStartInput.value = r.timeStart || '';
    startAmPmSelect.value = r.startAmPm || 'AM';
    timeEndInput.value = r.timeEnd || '';
    endAmPmSelect.value = r.endAmPm || 'AM';
    peopleInput.value = String(r.people || '');
    eventSelect.value = r.event || '';
    if (commentInput) commentInput.value = r.comment || '';

    mesasSeleccionadasArray = Array.isArray(r.tables) ? r.tables.slice() : [];
    selectedTablesText.textContent = mesasSeleccionadasArray.length
      ? 'Mesas seleccionadas: ' + mesasSeleccionadasArray.sort((a,b)=>a-b).join(', ')
      : 'Ninguna mesa seleccionada.';
    tablesGrid?.querySelectorAll('button').forEach(b => {
      const n = parseInt(b.dataset.mesa, 10);
      b.classList.toggle('mesa-btn-selected', mesasSeleccionadasArray.includes(n));
    });

    platillosSeleccionadosArray = Array.isArray(r.dishes) ? r.dishes.slice() : [];
    updateSelectedDishesText();

    // Guardar snapshot por si abrimos Menú desde edición
    saveFormToSession();
  }

  // ========== Utilidades ==========
  function escapeHTML(str) {
    return String(str || '').replace(/[&<>"']/g, s => ({
      '&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'
    }[s]));
  }
  function formatHour(hStr, ampm) {
    const t = parseTime12(hStr);
    if (!t) return `${hStr || ''} ${ampm || ''}`.trim();
    const hhmm = `${t.h}:${String(t.m).padStart(2,'0')}`;
    return `${hhmm}${ampm ? ' ' + ampm : ''}`;
  }
  function formatDateLabel(yyyy_mm_dd) {
    if (!yyyy_mm_dd) return '';
    const d = new Date(yyyy_mm_dd + 'T00:00:00');
    const opts = { day: '2-digit', month: 'short' };
    return d.toLocaleDateString('es-ES', opts);
  }
  function cryptoRandomId() {
    return 'rsv_' + Math.random().toString(36).slice(2, 9) + Date.now().toString(36).slice(-4);
  }
  function clearForm() {
    clientNameInput.value = '';
    clientPhoneInput.value = '';
    dateInput.value = '';
    timeStartInput.value = '';
    timeEndInput.value = '';
    peopleInput.value = '';
    eventSelect.value = '';
    if (commentInput) commentInput.value = '';
    startAmPmSelect.value = 'AM';
    endAmPmSelect.value   = 'AM';
    mesasSeleccionadasArray = [];
    selectedTablesText.textContent = 'Ninguna mesa seleccionada.';
    tablesGrid?.querySelectorAll('button').forEach(b => b.classList.remove('mesa-btn-selected'));
    platillosSeleccionadosArray = [];
    updateSelectedDishesText();
    [clientError, phoneError, dateError, timeStartError, timeEndError, peopleError, eventError, tablesError, dishesError]
      .forEach(e => e?.classList.add('hidden'));
  }

  // ========== Guardar / Actualizar ==========
  saveReservationBtn.addEventListener('click', () => {
    // Normaliza horas antes de validar, por si el usuario no hizo blur
    timeStartInput.value = normalizeTimeForSave(timeStartInput.value);
    timeEndInput.value   = normalizeTimeForSave(timeEndInput.value);

    let valid = true;

    // Validaciones de campos obligatorios
    if (clientNameInput.value.trim() === '') { clientError.classList.remove('hidden'); valid = false; } else clientError.classList.add('hidden');
    if (clientPhoneInput.value.trim().length < 9) { phoneError.classList.remove('hidden'); valid = false; } else phoneError.classList.add('hidden');
    if (dateInput.value === '') { dateError.classList.remove('hidden'); valid = false; } else dateError.classList.add('hidden');
    if (timeStartInput.value === '') { timeStartError.classList.remove('hidden'); valid = false; } else timeStartError.classList.add('hidden');
    if (timeEndInput.value === '') { timeEndError.textContent = 'Por favor ingrese una hora de fin.'; timeEndError.classList.remove('hidden'); valid = false; } else timeEndError.classList.add('hidden');
    if (peopleInput.value.trim() === '') { peopleError.classList.remove('hidden'); valid = false; } else peopleError.classList.add('hidden');
    if (eventSelect.value === '') { eventError.classList.remove('hidden'); valid = false; } else eventError.classList.add('hidden');
    if (mesasSeleccionadasArray.length === 0) {
      tablesError.classList.remove('hidden');
      tablesError.textContent = 'Por favor seleccione las mesas.';
      valid = false;
    } else {
      tablesError.classList.add('hidden');
    }
    // Platillos opcionales → no se valida dishesError

    // Validación de rango horario (con minutos)
    if (timeStartInput.value !== '' && timeEndInput.value !== '') {
      const startInMin = toMinutesFrom12(timeStartInput.value, startAmPmSelect.value);
      const endInMin   = toMinutesFrom12(timeEndInput.value,   endAmPmSelect.value);
      if (!Number.isFinite(startInMin) || !Number.isFinite(endInMin) || endInMin <= startInMin) {
        timeEndError.textContent = 'La hora fin debe ser posterior a la hora inicio.';
        timeEndError.classList.remove('hidden');
        valid = false;
      } else {
        timeEndError.classList.add('hidden');
      }
    }

    // --- NO permitir reservas el mismo día ---
    if (dateInput.value) {
      const [sy, sm, sd] = dateInput.value.split('-').map(Number);
      const selected = new Date(sy, sm - 1, sd);
      const now = new Date();
      const todayOnly = new Date(now.getFullYear(), now.getMonth(), now.getDate());
      if (selected.getTime() === todayOnly.getTime()) {
        dateError.textContent = 'No se permiten reservaciones para el día de hoy. Elija una fecha a partir de mañana.';
        dateError.classList.remove('hidden');
        return; // detenemos el guardado
      }
    }

    const idToEdit = reservationForm.dataset.editingId || editingId || null;

    // Validación de conflicto de mesas (mostrar debajo del campo)
    if (valid) {
      const conflict = checkTableConflicts(
        idToEdit,
        dateInput.value,
        timeStartInput.value, startAmPmSelect.value,
        timeEndInput.value,   endAmPmSelect.value,
        mesasSeleccionadasArray
      );
      if (conflict) {
        tablesError.textContent = 'Una o más mesas ya están reservadas en ese horario.';
        tablesError.classList.remove('hidden');
        tablesError.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
        return;
      } else {
        tablesError.classList.add('hidden');
      }
    } else {
      return;
    }

    // Normaliza platillos (opcionales)
    const dishesToSave = (platillosSeleccionadosArray || []).map(d =>
      (typeof d === 'string')
        ? d
        : { nombre: d.nombre || d.name || '', precio: d.precio ?? d.price ?? 0, cantidad: d.cantidad ?? d.qty ?? 1 }
    );

    const all = loadReservations();

    if (idToEdit) {
      // ===== Actualizar existente (NO crear nueva) =====
      const idx = all.findIndex(x => x.id === idToEdit);
      if (idx >= 0) {
        if (all[idx].statusConfirmed && (all[idx].status === 'finalizada' || all[idx].status === 'cancelada')) {
          alert('Esta reserva está confirmada en estado final y no puede editarse.');
          return;
        }
        all[idx] = {
          ...all[idx],
          clientName: clientNameInput.value.trim(),
          clientPhone: clientPhoneInput.value.trim(),
          date: dateInput.value,
          timeStart: timeStartInput.value.trim(),
          startAmPm: startAmPmSelect.value,
          timeEnd: timeEndInput.value.trim(),
          endAmPm: endAmPmSelect.value,
          people: parseInt(peopleInput.value, 10),
          event: eventSelect.value,
          comment: commentInput ? commentInput.value.trim() : '',
          tables: [...mesasSeleccionadasArray].sort((a,b)=>a-b),
          dishes: dishesToSave
        };
        saveReservations(all);
        syncTablesWithActiveReservations(); // sync inmediato tras actualizar
      }
    } else {
      // ===== Crear nueva =====
      const reservation = {
        id: cryptoRandomId(),
        clientName: clientNameInput.value.trim(),
        clientPhone: clientPhoneInput.value.trim(),
        date: dateInput.value,
        timeStart: timeStartInput.value.trim(),
        startAmPm: startAmPmSelect.value,
        timeEnd: timeEndInput.value.trim(),
        endAmPm: endAmPmSelect.value,
        people: parseInt(peopleInput.value, 10),
        event: eventSelect.value,
        comment: commentInput ? commentInput.value.trim() : '',
        tables: [...mesasSeleccionadasArray].sort((a,b)=>a-b),
        dishes: dishesToSave, // puede ser []
        createdAt: new Date().toISOString(),
        status: 'pendiente',
        statusConfirmed: false
      };
      all.push(reservation);
      saveReservations(all);
      syncTablesWithActiveReservations(); // sync inmediato tras crear
    }

    // UI post-guardar
    renderReservations();
    clearForm();
    closeReservationForm();
    clearReservationSessionKeys();
    setEditingMode(null); // volver a modo crear
  });

  // ========== Inicializar ==========
  renderReservations();
  startReservationsTablesAutoSync();

});
