// js/LogIn.js (ES module) — anima como antes (fade de elementos + shrink header), toasts y redirect a index.html
import { API, fetchJSON, setAuthToken, getAuthToken } from "./services/apiConfig.js";

const $ = (s, r = document) => r.querySelector(s);

/* ====== helpers de alerta (mismo look & feel de pedidos) ====== */
function ensureAlertHost() {
  let host = document.getElementById("alerts-host");
  if (!host) {
    host = document.createElement("div");
    host.id = "alerts-host";
    host.setAttribute("aria-live", "polite");
    host.className = "fixed top-4 right-4 z-50 space-y-3 pointer-events-none";
    document.body.appendChild(host);
  }
  return host;
}

function showAlert(type = "info", text = "", opts = {}) {
  const { timeout = 3500 } = opts;
  const host = ensureAlertHost();
  const wrap = document.createElement("div");
  const color = { info: "bg-blue-500", error: "bg-red-500", success: "bg-green-600" }[type] || "bg-blue-500";

  wrap.className =
    `pointer-events-auto rounded-xl px-4 py-3 shadow-lg text-white flex items-center gap-3 w-[min(92vw,380px)] ${color}`;
  wrap.innerHTML = `
    <div class="font-medium">${text}</div>
    <button class="ml-auto opacity-80 hover:opacity-100 focus:outline-none">✕</button>
  `;
  host.appendChild(wrap);

  const close = () => {
    try {
      wrap.style.transition = "opacity .2s ease, transform .2s ease";
      wrap.style.opacity = "0";
      wrap.style.transform = "translateY(-6px)";
      setTimeout(() => wrap.remove(), 180);
    } catch { wrap.remove(); }
  };

  wrap.querySelector("button")?.addEventListener("click", close);
  if (timeout > 0) setTimeout(close, timeout);
}

/* ====== animación de éxito ====== */
function playLoginSuccessFxFull() {
  const header = document.getElementById("loginHeader");
  const headerTexts = document.getElementById("loginHeaderTexts");
  const card = document.getElementById("loginCard");
  const btn = document.querySelector(".btn-login");

  // fade-out primero
  headerTexts?.classList.add("fade-out");
  card?.classList.add("fade-out");
  if (btn) { btn.disabled = true; btn.style.pointerEvents = "none"; }

  // luego shrink del header
  setTimeout(() => { header?.classList.add("shrink-animation"); }, 120);
}

/* ===================== login flow ===================== */
document.addEventListener("DOMContentLoaded", () => {
  const form = $("#loginForm");
  const emailEl = $("#email");
  const passEl = $("#password");
  const btn = form?.querySelector('button[type="submit"]');

  if (!form) return;

  form.addEventListener("submit", async (e) => {
    e.preventDefault();
    const correo = emailEl?.value?.trim();
    const contrasenia = passEl?.value ?? "";

    if (!correo || !contrasenia) {
      showAlert("error", "Completa ambos campos.");
      return;
    }

    btn?.setAttribute("disabled", "true");

    try {
      // Limpia sesión previa
      try {
        await fetch(`${API.auth}/logout`, { method: "POST", credentials: "include" });
        setAuthToken(null);
      } catch { }

      // Login
      const loginResponse = await fetchJSON(`${API.auth}/login`, {
        method: "POST",
        body: JSON.stringify({ correo, contrasenia }),
      });

      // DEBUG: verifica que el token llegó
      console.log('Login response:', loginResponse);
      console.log('Token recibido:', loginResponse?.token);

      // Guarda el token recibido
      if (loginResponse?.token) {
        setAuthToken(loginResponse.token);
        console.log('Token guardado en sessionStorage:', sessionStorage.getItem('authToken'));
      } else {
        console.error('NO SE RECIBIÓ TOKEN EN LA RESPUESTA');
      }

      // DEBUG: verifica que fetchJSON agregará el header
      console.log('Token antes de /me:', getAuthToken());

      // Verifica contra el token guardado
      const me = await fetchJSON(`${API.auth}/me`, { method: "GET" });
      console.log('Respuesta /me:', me);

      // ... resto del código
      const mismoUsuario = (me?.correo || "").toLowerCase() === correo.toLowerCase();
      if (!mismoUsuario) {
        try {
          await fetch(`${API.auth}/logout`, {
            method: "POST",
            credentials: "include"
          });
          setAuthToken(null);
        } catch { }
        throw new Error("Credenciales inválidas.");
      }

      // Éxito
      playLoginSuccessFxFull();
      showAlert("success", "¡Bienvenido! Entrando…", { timeout: 1400 });
      setTimeout(() => { window.location.href = "index.html"; }, 1000);

    } catch (err) {
      console.error(err);
      showAlert("error", err?.message || "No se pudo iniciar sesión.");
      btn?.removeAttribute("disabled");
    }
  });
});

// Toggle ver/ocultar contraseña (no interfiere con el login)
const toggleBtn = document.getElementById('togglePass');
const passInput = document.getElementById('password');
if (toggleBtn && passInput) {
  const eyeOn = toggleBtn.querySelector('.eye-on');
  const eyeOff = toggleBtn.querySelector('.eye-off');
  toggleBtn.addEventListener('click', () => {
    const show = passInput.type === 'password';
    passInput.type = show ? 'text' : 'password';
    toggleBtn.setAttribute('aria-label', show ? 'Ocultar contraseña' : 'Mostrar contraseña');
    eyeOn.classList.toggle('hidden', show);
    eyeOff.classList.toggle('hidden', !show);
  });
}


