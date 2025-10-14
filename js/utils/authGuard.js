// js/utils/authGuard.js
// Utilidad simple para bloquear vistas si no hay token en sessionStorage

import { getAuthToken } from "../services/apiConfig.js";

/**
 * Muestra/oculta el gate y el contenido real según exista token.
 * @returns {boolean} true si hay sesión; false si NO hay sesión.
 */
export function applyAuthGate() {
  const hasToken = !!getAuthToken();

  const gate = document.getElementById("auth-gate");
  const content = document.getElementById("mesas-auth-content");

  if (hasToken) {
    if (gate) gate.hidden = true;
    if (content) content.hidden = false;
  } else {
    if (content) content.hidden = true;
    if (gate) gate.hidden = false;
  }
  return hasToken;
}

/**
 * Forza que la página solo funcione si hay sesión.
 * Si no hay sesión, NO ejecuta el callback protegido.
 * @param {Function} onAuthenticated - Se ejecuta si hay sesión.
 */
export function requireAuth(onAuthenticated) {
  const ok = applyAuthGate();
  if (!ok) return; // No hay sesión → no hacer nada
  if (typeof onAuthenticated === "function") onAuthenticated();
}

/**
 * Escucha cambios de sesión entre pestañas (logout/login).
 * Si el token cambia, volvemos a aplicar el gate.
 */
window.addEventListener("storage", (e) => {
  if (e.key === "authToken") {
    applyAuthGate();
  }
});

// Aplica una primera vez al cargar el script
document.addEventListener("DOMContentLoaded", applyAuthGate);
