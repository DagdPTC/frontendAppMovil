// controllers/ordersController.js
// Controlador para "Pedidos": persiste en la API pero conserva UI, animaciones y validaciones

import {
  getPedidos,
  createPedido,
  updatePedido,
  deletePedido,
} from "../services/ordersService.js";

// ---------------- Configuración de estados (píldora clickeable) ----------------
const PEDIDO_STATUS_ORDER = ["pendiente", "en preparación", "listo", "entregado", "pagado", "cancelado"];
const PEDIDO_STATUS_COLORS = {
  pendiente: "bg-yellow-100 text-yellow-700",
  "en preparación": "bg-blue-100 text-blue-700",
  listo: "bg-green-100 text-green-700",
  entregado: "bg-purple-100 text-purple-700",
  pagado: "bg-gray-200 text-gray-700",
  cancelado: "bg-red-100 text-red-700",
  "cancelado y pagado": "bg-gray-300 text-gray-700", // compatibilidad
};
const ESTADOS_FINALES = new Set(["pagado", "cancelado", "cancelado y pagado"]);

// ---------------- Estado en memoria (solo UI) ----------------
let platillosSeleccionados = [];
let pedidoEnEdicion = null; // objeto UI del pedido que se edita
let pedidosCache = []; // espejo local de lo que viene de la API

// ---------------- Utilidades ----------------
function obtenerFechaHoraActual() {
  const now = new Date();
  const dd = String(now.getDate()).padStart(2, "0");
  const mm = String(now.getMonth() + 1).padStart(2, "0");
  const yyyy = now.getFullYear();
  const hh = String(now.getHours()).padStart(2, "0");
  const min = String(now.getMinutes()).padStart(2, "0");
  return `${dd}/${mm}/${yyyy} ${hh}:${min}`;
}

// Mapea objeto de API -> objeto UI esperado por la vista
function fromApi(p) {
  // Tolerante a distintos nombres de campos
  const id =
    p.id ?? p.pedidoId ?? p.idPedido ?? p.ID ?? p.Id ?? null;

  const cliente =
    p.Cliente ?? p.cliente ?? p.nomCliente ?? p.nombreCliente ?? "";

  const mesa =
    p.Mesa ?? p.mesa ?? p.idMesa ?? p.mesaId ?? p.numeroMesa ?? "";

  const mesero = p.Mesero ?? p.mesero ?? p.atendidoPor ?? "Juan";

  const hora =
    p.Hora ?? p.hora ?? p.fechaHora ?? p.fPedido ?? p.fechaPedido ?? obtenerFechaHoraActual();

  const estado =
    p.Estado ?? p.estado ?? "pendiente";

  const confirmado = Boolean(p.Confirmado ?? p.confirmado ?? false);

  const platillosSrc =
    p.Platillos ?? p.platillos ?? p.detalle ?? p.detalles ?? [];

  const platillos = Array.isArray(platillosSrc)
    ? platillosSrc.map((d) => ({
        nombre: d.nombre ?? d.platillo ?? d.item ?? "",
        cantidad: Number(d.cantidad ?? d.qty ?? 1),
        precio: Number(d.precio ?? d.price ?? 0),
      }))
    : [];

  return {
    id,
    Cliente: cliente,
    Mesa: String(mesa),
    Mesero: mesero,
    Hora: hora,
    Estado: estado,
    Confirmado: confirmado,
    Platillos: platillos,
  };
}

// Mapea objeto UI -> payload para la API (ajústalo si tu DTO lo requiere)
function toApi(p) {
  return {
    // Si tu API genera el ID en el back, puedes omitirlo en POST
    id: p.id ?? undefined,
    cliente: p.Cliente,
    mesa: isNaN(Number(p.Mesa)) ? p.Mesa : Number(p.Mesa),
    mesero: p.Mesero,
    hora: p.Hora, // o fechaHora/fechaPedido (ajusta tu DTO)
    estado: p.Estado,
    confirmado: p.Confirmado,
    platillos: p.Platillos.map((d) => ({
      nombre: d.nombre,
      cantidad: Number(d.cantidad),
      precio: Number(d.precio),
    })),
  };
}

// ---------------- Persistencia temporal de selección (solo UI) ----------------
function persistDishPreselection() {
  sessionStorage.setItem("ord_dishes_pre", JSON.stringify(platillosSeleccionados));
}
function loadDishSelectionFromSession(renderDishes) {
  try {
    const sel = sessionStorage.getItem("ord_dishes_sel");
    if (sel) {
      platillosSeleccionados = JSON.parse(sel) || [];
      platillosSeleccionados.forEach((p) => {
        if (!p.cantidad) p.cantidad = 1;
      });
      sessionStorage.removeItem("ord_dishes_sel");
      renderDishes();
      return;
    }
    const pre = sessionStorage.getItem("ord_dishes_pre");
    if (pre) {
      platillosSeleccionados = JSON.parse(pre) || [];
      platillosSeleccionados.forEach((p) => {
        if (!p.cantidad) p.cantidad = 1;
      });
      renderDishes();
    }
  } catch {
    /* noop */
  }
}

// ---------------- Mesas (se mantiene local hasta conectar API de mesas) ----------------
function actualizarEstadoMesaOcupada(numeroMesa) {
  let estadoMesas = JSON.parse(localStorage.getItem("estadoMesas")) || [];
  const i = estadoMesas.findIndex((m) => String(m.number) === String(numeroMesa));
  if (i >= 0) estadoMesas[i].status = "ocupada";
  else estadoMesas.push({ number: Number(numeroMesa), status: "ocupada" });
  localStorage.setItem("estadoMesas", JSON.stringify(estadoMesas));
}
function actualizarEstadoMesaDisponible(numeroMesa) {
  let estadoMesas = JSON.parse(localStorage.getItem("estadoMesas")) || [];
  const i = estadoMesas.findIndex((m) => String(m.number) === String(numeroMesa));
  if (i >= 0) estadoMesas[i].status = "disponible";
  localStorage.setItem("estadoMesas", JSON.stringify(estadoMesas));
}
function filtrarMesasDisponibles(mesaSelect) {
  const mesasEstado = JSON.parse(localStorage.getItem("estadoMesas"));
  if (!mesasEstado) return;
  const opciones = mesaSelect.querySelectorAll("option");
  opciones.forEach((option) => {
    if (option.value === "") return;
    const mesa = mesasEstado.find((m) => String(m.number) === option.value);
    if (mesa && ["reservada", "ocupada", "limpieza"].includes(mesa.status)) {
      option.disabled = true;
      option.textContent = `Mesa ${mesa.number} (${mesa.status})`;
    } else {
      option.disabled = false;
      option.textContent = `Mesa ${option.value}`;
    }
  });
}

// ---------------- Carga desde API ----------------
async function cargarPedidosDeApi(ordersList, agregarTarjetaPedido) {
  ordersList.innerHTML = "";
  try {
    const lista = await getPedidos(); // ← espera array
    pedidosCache = Array.isArray(lista) ? lista.map(fromApi) : [];
    // Render más reciente primero
    pedidosCache
      .slice()
      .reverse()
      .forEach((p) => agregarTarjetaPedido(p));
  } catch (e) {
    console.error("Error al obtener pedidos:", e);
    // Si falla, mantenemos la lista vacía
  }
}

// ---------------- Boot ----------------
document.addEventListener("DOMContentLoaded", () => {
  // ------- Referencias UI -------
  const newOrderBtn = document.getElementById("new-order-btn");
  const newOrderForm = document.getElementById("new-order-form");
  const ordersList = document.getElementById("orders-list");
  const backToOrdersBtn = document.getElementById("back-to-orders");
  const orderTime = document.getElementById("order-time");

  const mesaSelect = document.getElementById("table-select");
  const mesaError = document.getElementById("table-error");

  const customerInput = document.getElementById("customer-name");
  const customerError = document.getElementById("customer-error");

  const dishesError = document.getElementById("dishes-error");
  const dishesSummary = document.getElementById("dishes-summary");
  const itemCountBadge = document.getElementById("items-count");

  const saveOrderBtn = document.getElementById("save-order-btn");
  const addDishesBtn = document.getElementById("add-dishes-btn");

  // ------- Helpers de formulario -------
  function saveFormDataToStorage() {
    localStorage.setItem("clienteTemporal", customerInput.value);
    localStorage.setItem("mesaTemporal", mesaSelect.value);
  }
  function loadFormDataFromStorage() {
    const c = localStorage.getItem("clienteTemporal");
    const m = localStorage.getItem("mesaTemporal");
    if (c) customerInput.value = c;
    if (m) mesaSelect.value = m;
    localStorage.removeItem("clienteTemporal");
    localStorage.removeItem("mesaTemporal");
  }
  function renderDishes() {
    dishesSummary.innerHTML = "";
    if (platillosSeleccionados.length === 0) {
      itemCountBadge.classList.add("hidden");
      return;
    }
    itemCountBadge.textContent = `${platillosSeleccionados.length} items`;
    itemCountBadge.classList.remove("hidden");

    platillosSeleccionados.forEach((dish, index) => {
      const precioUnitario = parseFloat(dish.precio) || 0;
      const itemDiv = document.createElement("div");
      itemDiv.className =
        "flex justify-between items-center bg-white border rounded-lg px-2 py-1 mb-2";
      itemDiv.innerHTML = `
        <div>
          <p class="font-semibold text-sm">${dish.nombre}</p>
          <p class="text-xs text-gray-500">$${precioUnitario.toFixed(2)} x ${dish.cantidad} = $${(
        precioUnitario * dish.cantidad
      ).toFixed(2)}</p>
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

    const totalPedido = platillosSeleccionados.reduce((acc, d) => acc + (parseFloat(d.precio) || 0) * d.cantidad, 0);
    const propina = totalPedido * 0.1;
    const totalConPropina = totalPedido + propina;

    const totalDiv = document.createElement("div");
    totalDiv.className = "text-right font-semibold text-sm mt-2";
    totalDiv.innerHTML = `
      Subtotal: $${totalPedido.toFixed(2)}<br>
      Propina (10%): $${propina.toFixed(2)}<br>
      Total: $${totalConPropina.toFixed(2)}
    `;
    dishesSummary.appendChild(totalDiv);
  }
  function handleDishActions(e) {
    const action = e.target.dataset.action;
    const idx = Number(e.target.dataset.index);
    if (action === "increase") platillosSeleccionados[idx].cantidad++;
    else if (action === "decrease") platillosSeleccionados[idx].cantidad = Math.max(1, platillosSeleccionados[idx].cantidad - 1);
    else if (action === "remove") platillosSeleccionados.splice(idx, 1);
    renderDishes();
    persistDishPreselection();
  }
  dishesSummary.addEventListener("click", (e) => {
    if (e.target.dataset.action) handleDishActions(e);
    else {
      const btn = e.target.closest("[data-action]");
      if (btn) handleDishActions({ target: btn });
    }
  });

  // ------- Edición desde localStorage (flujo UI existente) -------
  function loadEditIfAny() {
    const raw = localStorage.getItem("pedidoEnEdicion");
    if (!raw) return;
    const p = JSON.parse(raw);
    pedidoEnEdicion = p;

    saveOrderBtn.textContent = "Actualizar Pedido";
    customerInput.value = p.Cliente || "";
    mesaSelect.value = p.Mesa || "";
    orderTime.value = p.Hora || obtenerFechaHoraActual();

    platillosSeleccionados = (p.Platillos || []).map((x) => ({
      nombre: x.nombre,
      cantidad: x.cantidad || 1,
      precio: x.precio,
    }));
    renderDishes();
  }

  // ------- Construcción de tarjetas -------
  function agregarTarjetaPedido(pedido) {
    const card = document.createElement("div");
    card.className =
      "tarjeta-animada border border-gray-200 rounded-xl p-4 bg-white shadow-sm cursor-pointer hover:bg-gray-40 transition";

    const listaPlatillos = pedido.Platillos.map((x) => `<li>${x.nombre} (x${x.cantidad})</li>`).join("");

    const total = pedido.Platillos.reduce((acc, x) => acc + (parseFloat(x.precio) || 0) * x.cantidad, 0);
    const propina = total * 0.1;
    const totalConPropina = total + propina;

    let estadoActual = pedido.Estado || "pendiente";
    let confirmado = !!pedido.Confirmado;

    card.innerHTML = `
      <div class="flex justify-between items-start">
        <h2 class="font-bold text-lg">Pedido de ${pedido.Cliente}</h2>
        <button
          class="estado-pedido inline-block px-2 py-0.5 rounded-full text-xs font-semibold ${PEDIDO_STATUS_COLORS[estadoActual] || "bg-gray-100 text-gray-700"}"
          data-id="${pedido.id}"
          data-estado="${estadoActual}"
          title="Haz clic para cambiar el estado">
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

    const deleteBtn = card.querySelector(".btn-eliminar");
    const estadoBtn = card.querySelector(".estado-pedido");
    const confirmBtn = card.querySelector(".btn-confirmar-estado");

    function actualizarUIConfirmacion(estado, isConfirmado) {
      if (ESTADOS_FINALES.has(estado) && !isConfirmado) {
        confirmBtn.textContent =
          estado === "pagado" || estado === "cancelado y pagado" ? "Confirmar pago" : "Confirmar cancelación";
        confirmBtn.classList.remove("hidden");
      } else {
        confirmBtn.classList.add("hidden");
      }
    }
    function aplicarBloqueo(estado, isConfirmado) {
      const bloquear = isConfirmado && ESTADOS_FINALES.has(estado);
      deleteBtn.disabled = bloquear;
      deleteBtn.title = bloquear ? "No se puede eliminar un pedido confirmado" : "";
      deleteBtn.className = bloquear
        ? "btn-eliminar bg-gray-300 text-gray-500 px-3 py-1 rounded text-sm font-medium cursor-not-allowed"
        : "btn-eliminar bg-red-500 text-white px-3 py-1 rounded text-sm font-medium";

      card.dataset.bloqueado = bloquear ? "1" : "0";
      if (bloquear) {
        estadoBtn.style.pointerEvents = "none";
        estadoBtn.classList.add("cursor-not-allowed", "opacity-80");
        estadoBtn.title = "Pedido confirmado, no se puede cambiar el estado";
      } else {
        estadoBtn.style.pointerEvents = "auto";
        estadoBtn.classList.remove("cursor-not-allowed", "opacity-80");
        estadoBtn.title = "Haz clic para cambiar el estado";
      }
      actualizarUIConfirmacion(estado, isConfirmado);
    }
    aplicarBloqueo(estadoActual, confirmado);

    // Eliminar
    deleteBtn.addEventListener("click", async (e) => {
      e.stopPropagation();
      if (card.dataset.bloqueado === "1") return;
      const id = Number(e.currentTarget.dataset.id);
      try {
        await deletePedido(id);
        pedidosCache = pedidosCache.filter((x) => x.id !== id);
        card.remove();
        if (pedido.Mesa) actualizarEstadoMesaDisponible(pedido.Mesa);
      } catch (err) {
        console.error("Error eliminando pedido:", err);
        alert("No se pudo eliminar el pedido.");
      }
    });

    // Cambiar estado (ciclo)
    estadoBtn.addEventListener("click", async (e) => {
      e.stopPropagation();
      if (confirmado) return;
      const id = Number(e.currentTarget.dataset.id);

      const idx = PEDIDO_STATUS_ORDER.indexOf(estadoActual);
      const siguiente = PEDIDO_STATUS_ORDER[(idx + 1) % PEDIDO_STATUS_ORDER.length];

      // Optimista en UI
      estadoActual = siguiente;
      e.currentTarget.dataset.estado = siguiente;
      e.currentTarget.textContent = siguiente;
      e.currentTarget.className = `estado-pedido inline-block px-2 py-0.5 rounded-full text-xs font-semibold ${
        PEDIDO_STATUS_COLORS[siguiente] || "bg-gray-100 text-gray-700"
      }`;
      aplicarBloqueo(estadoActual, confirmado);

      // Persistir en API
      try {
        // Buscar en caché y enviar objeto completo (PUT)
        const original = pedidosCache.find((x) => x.id === id);
        if (!original) throw new Error("Pedido no encontrado en caché");
        const actualizado = { ...original, Estado: siguiente };
        await updatePedido(id, toApi(actualizado));
        // Actualiza cache
        const i = pedidosCache.findIndex((x) => x.id === id);
        if (i >= 0) pedidosCache[i] = actualizado;
      } catch (err) {
        console.error("Error actualizando estado:", err);
        alert("No se pudo actualizar el estado. Reintentando…");
        // Revertir UI
        const prevIdx = PEDIDO_STATUS_ORDER.indexOf(estadoActual) - 1;
        const previo =
          prevIdx < 0 ? PEDIDO_STATUS_ORDER[PEDIDO_STATUS_ORDER.length - 1] : PEDIDO_STATUS_ORDER[prevIdx];
        estadoActual = previo;
        e.currentTarget.dataset.estado = previo;
        e.currentTarget.textContent = previo;
        e.currentTarget.className = `estado-pedido inline-block px-2 py-0.5 rounded-full text-xs font-semibold ${
          PEDIDO_STATUS_COLORS[previo] || "bg-gray-100 text-gray-700"
        }`;
        aplicarBloqueo(estadoActual, confirmado);
      }
    });

    // Confirmar estado final (pago/cancel)
    confirmBtn.addEventListener("click", async (e) => {
      e.stopPropagation();
      if (!ESTADOS_FINALES.has(estadoActual)) return;
      const id = Number(confirmBtn.dataset.id);
      try {
        const original = pedidosCache.find((x) => x.id === id);
        if (!original) throw new Error("Pedido no encontrado en caché");
        const actualizado = { ...original, Confirmado: true };
        await updatePedido(id, toApi(actualizado));
        confirmado = true;
        // UI
        aplicarBloqueo(estadoActual, confirmado);
        // Liberar mesa si corresponde
        if (pedido.Mesa) actualizarEstadoMesaDisponible(pedido.Mesa);
        // Cache
        const i = pedidosCache.findIndex((x) => x.id === id);
        if (i >= 0) pedidosCache[i] = actualizado;
      } catch (err) {
        console.error("Error confirmando:", err);
        alert("No se pudo confirmar el estado.");
      }
    });

    // Click en tarjeta = editar (si no está bloqueado)
    card.addEventListener("click", () => {
      if (card.dataset.bloqueado === "1") return;
      customerInput.value = pedido.Cliente;
      mesaSelect.value = pedido.Mesa;
      orderTime.value = pedido.Hora;

      platillosSeleccionados = pedido.Platillos.map((x) => ({
        nombre: x.nombre,
        cantidad: x.cantidad,
        precio: x.precio,
      }));
      renderDishes();

      pedidoEnEdicion = pedido;
      localStorage.setItem("pedidoEnEdicion", JSON.stringify(pedido));
      saveOrderBtn.textContent = "Actualizar Pedido";

      newOrderForm.classList.remove("hidden");
      ordersList.classList.add("hidden");
      newOrderBtn.classList.add("hidden");
    });

    ordersList.prepend(card);
  }

  // ------- Mostrar formulario -------
  function openOrderForm() {
    newOrderForm.classList.remove("hidden");
    ordersList.classList.add("hidden");
    newOrderBtn.classList.add("hidden");

    orderTime.value = obtenerFechaHoraActual();
    filtrarMesasDisponibles(mesaSelect);

    // Primero edición (si hay), luego carga de selección
    loadEditIfAny();
    loadFormDataFromStorage();
    if (!pedidoEnEdicion) loadDishSelectionFromSession(renderDishes);
  }

  // ------- Limpiar formulario -------
  function clearForm() {
    mesaSelect.value = "";
    customerInput.value = "";
    orderTime.value = "";
    platillosSeleccionados = [];
    pedidoEnEdicion = null;
    renderDishes();

    localStorage.removeItem("clienteTemporal");
    localStorage.removeItem("mesaTemporal");
    localStorage.removeItem("pedidoEnEdicion");

    sessionStorage.removeItem("ord_dishes_pre");
    sessionStorage.removeItem("ord_dishes_sel");
    sessionStorage.removeItem("ord_return");

    saveOrderBtn.textContent = "Guardar Pedido";
    dishesError.classList.add("hidden");
    mesaError.classList.add("hidden");
    customerError.classList.add("hidden");
  }

  // ------- Inicializaciones de navegación -------
  // Abrir automáticamente si viene de ?nuevo=true
  if (window.location.search.includes("nuevo=true")) {
    localStorage.setItem("abrirFormularioPedido", "true");
  }
  if (localStorage.getItem("abrirFormularioPedido") === "true") {
    localStorage.removeItem("abrirFormularioPedido");
    openOrderForm();
  }
  // Si se regresa del Menú con selección/preselección
  if (!newOrderForm || newOrderForm.classList.contains("hidden")) {
    if (sessionStorage.getItem("ord_dishes_sel") || sessionStorage.getItem("ord_dishes_pre")) {
      openOrderForm();
    }
  }

  // ------- Cargar pedidos desde API -------
  cargarPedidosDeApi(ordersList, agregarTarjetaPedido);

  // ------- Eventos UI -------
  newOrderBtn.addEventListener("click", openOrderForm);

  backToOrdersBtn.addEventListener("click", () => {
    newOrderForm.classList.add("hidden");
    ordersList.classList.remove("hidden");
    newOrderBtn.classList.remove("hidden");
    clearForm();
  });

  addDishesBtn.addEventListener("click", () => {
    // Persistir datos para regresar
    localStorage.setItem("clienteTemporal", customerInput.value);
    localStorage.setItem("mesaTemporal", mesaSelect.value);
    sessionStorage.setItem("ord_dishes_pre", JSON.stringify(platillosSeleccionados));
    sessionStorage.setItem("ord_return", location.pathname || "orders.html");
    if (pedidoEnEdicion) {
      localStorage.setItem("pedidoEnEdicion", JSON.stringify(pedidoEnEdicion));
    }
    window.location.href = "menu.html?modo=seleccion&from=orders";
  });

  // Guardar / Actualizar
  saveOrderBtn.addEventListener("click", async (e) => {
    e.preventDefault();
    let valid = true;

    if (mesaSelect.value === "") {
      mesaError.classList.remove("hidden");
      valid = false;
    } else {
      mesaError.classList.add("hidden");
    }

    if (customerInput.value.trim() === "") {
      customerError.classList.remove("hidden");
      valid = false;
    } else {
      customerError.classList.add("hidden");
    }

    if (platillosSeleccionados.length === 0) {
      dishesError.classList.remove("hidden");
      valid = false;
    } else {
      dishesError.classList.add("hidden");
    }

    if (!valid) return;

    // Construir objeto UI
    const pedidoUI = {
      id: pedidoEnEdicion?.id ?? undefined, // en POST lo omitimos
      Cliente: customerInput.value.trim(),
      Mesa: mesaSelect.value,
      Mesero: "Juan",
      Hora: orderTime.value || obtenerFechaHoraActual(),
      Estado: pedidoEnEdicion?.Estado ?? "pendiente",
      Confirmado: pedidoEnEdicion?.Confirmado ?? false,
      Platillos: platillosSeleccionados.map((p) => ({
        nombre: p.nombre,
        cantidad: p.cantidad,
        precio: p.precio,
      })),
    };

    // Marcar mesa ocupada al guardar
    actualizarEstadoMesaOcupada(mesaSelect.value);

    try {
      if (pedidoEnEdicion?.id != null) {
        // UPDATE (PUT)
        await updatePedido(Number(pedidoEnEdicion.id), toApi(pedidoUI));
      } else {
        // CREATE (POST)
        await createPedido(toApi(pedidoUI));
      }

      // Refrescar la lista completa desde API para asegurar ID y consistencia
      await cargarPedidosDeApi(ordersList, agregarTarjetaPedido);

      // Limpieza de navegación y selección
      localStorage.removeItem("pedidoEnEdicion");
      localStorage.setItem("refrescarInicio", "true");
      sessionStorage.removeItem("ord_dishes_pre");
      sessionStorage.removeItem("ord_dishes_sel");
      sessionStorage.removeItem("ord_return");

      clearForm();
      newOrderForm.classList.add("hidden");
      ordersList.classList.remove("hidden");
      newOrderBtn.classList.remove("hidden");
    } catch (err) {
      console.error("Error al guardar/actualizar pedido:", err);
      alert("No se pudo guardar el pedido en la API.");
    }
  });
});
