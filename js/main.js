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

function validateGmailAddress(raw) {
  const email = (raw || "").trim();
  if (!email) return { ok: false, reason: "Ingresa tu correo." };

  const parts = email.toLowerCase().split("@");
  if (parts.length !== 2) return { ok: false, reason: "Correo inválido." };

  const [local, domain] = parts;

  // Solo Gmail
  if (!/^(gmail\.com|googlemail\.com)$/.test(domain)) {
    return { ok: false, reason: "Debe ser un correo @gmail.com." };
  }

  // Reglas típicas de Gmail para el usuario
  if (!/^[a-z0-9][a-z0-9.+-]*[a-z0-9]$/i.test(local)) {
    return { ok: false, reason: "Solo letras, números, puntos, + o - en el usuario." };
  }
  if (local.startsWith(".") || local.endsWith(".") || local.includes("..")) {
    return { ok: false, reason: "Gmail no permite empezar/terminar con punto ni tener '..'." };
  }

  // Gmail ignora los puntos: exigimos al menos 6 caracteres “reales” sin puntos (evita correos obviamente falsos).
  const coreLen = local.replace(/\./g, "").length;
  if (coreLen < 6) {
    return { ok: false, reason: "El usuario de Gmail debe tener al menos 6 caracteres (sin contar puntos)." };
  }

  // Canoniza a gmail.com (aceptamos googlemail.com como alias)
  const normalized = `${local}@gmail.com`;
  return { ok: true, value: normalized };
}

// === Helpers de rol Mesero ===
// === Helpers de rol permitido: Admin (1) o Mesero (2) ===
function normalizeRoleFromMe(me) {
  const out = { id: undefined, name: undefined };
  if (!me) return out;

  const tryPick = (r) => {
    if (r == null) return;
    if (typeof r === "number" || (typeof r === "string" && /^\d+$/.test(r))) {
      out.id = Number(r); return;
    }
    if (typeof r === "string") { out.name = r; return; }
    if (Array.isArray(r)) {
      for (const x of r) {
        const id = Number(x?.idRol ?? x?.id ?? x?.Id);
        const name = String(x?.nombre ?? x?.name ?? "").toLowerCase();
        if (!Number.isNaN(id)) out.id = id;
        if (name) out.name = name;
        if (out.id === 1 || out.id === 2 || (out.name && (out.name.includes("meser") || out.name.includes("admin")))) break;
      }
      return;
    }
    if (typeof r === "object") {
      const id = Number(r.idRol ?? r.id ?? r.Id);
      const name = String(r.nombre ?? r.name ?? "").toLowerCase();
      if (!Number.isNaN(id)) out.id = id;
      if (name) out.name = name;
    }
  };

  tryPick(me.rol ?? me.role ?? me.roles);
  if (out.id == null && out.name == null) tryPick(me.idRol ?? me.id_rol);
  return out;
}

function isAllowedRoleFromMe(me) {
  const { id, name } = normalizeRoleFromMe(me);
  if (id === 1 || id === 2) return true;                // Admin o Mesero por id
  if (!name) return false;
  const n = name.toLowerCase();
  return n.includes("meser") || n.includes("admin");     // por nombre
}

async function isAllowedRoleByEmpleadoFallback(me) {
  try {
    const authUrl = new URL(API.auth, window.location.href);
    const host = authUrl.origin;
    const data = await fetchJSON(`${host}/apiEmpleado/getDataEmpleado?page=0&size=1000`, { method: "GET" });
    const list = Array.isArray(data?.content) ? data.content : (Array.isArray(data) ? data : []);
    const idEmp = Number(me?.idEmpleado ?? me?.empleadoId ?? me?.idempleado);
    const emp = list.find(e => Number(e.id ?? e.Id ?? e.idEmpleado ?? e.id_empleado) === idEmp);
    if (!emp) return false;

    const idRol = Number(emp.idRol ?? emp.rolId ?? emp.rol?.id ?? emp.rol?.Id ?? emp.id_rol);
    const nomRol = String(emp.rol?.nombre ?? emp.rolNombre ?? "").toLowerCase();
    return idRol === 1 || idRol === 2 || nomRol.includes("admin") || nomRol.includes("meser");
  } catch {
    return false;
  }
}

async function assertAllowedRoleOrThrow(me) {
  if (isAllowedRoleFromMe(me)) return;
  if (await isAllowedRoleByEmpleadoFallback(me)) return;
  throw new Error("Acceso restringido: solo meseros o administradores pueden iniciar sesión.");
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
    const correoInput = emailEl?.value?.trim();
    const contrasenia = passEl?.value ?? "";

    if (!correoInput || !contrasenia) {
      showAlert("error", "Completa ambos campos.");
      return;
    }

    // << NUEVO: valida que sea Gmail "realista"
    const g = validateGmailAddress(correoInput);
    if (!g.ok) {
      showAlert("error", g.reason);
      emailEl?.focus();
      return;
    }
    const correo = g.value; // usa el correo canonizado @gmail.com

    const btn = form?.querySelector('button[type="submit"]');
    btn?.setAttribute("disabled", "true");

    try {
      // (lo demás queda igual)
      try {
        await fetch(`${API.auth}/logout`, { method: "POST", credentials: "include" });
        setAuthToken(null);
      } catch { }

      const loginResponse = await fetchJSON(`${API.auth}/login`, {
        method: "POST",
        body: JSON.stringify({ correo, contrasenia }),
      });

      if (loginResponse?.token) setAuthToken(loginResponse.token);

      const me = await fetchJSON(`${API.auth}/me`, { method: "GET" });
      const mismoUsuario = (me?.correo || "").toLowerCase() === correo.toLowerCase();
      if (!mismoUsuario) {
        try { await fetch(`${API.auth}/logout`, { method: "POST", credentials: "include" }); setAuthToken(null); } catch { }
        throw new Error("Credenciales inválidas.");
      }

      // << NUEVO: restringe a rol Mesero (idRol = 2)
      try {
        await assertAllowedRoleOrThrow(me);
      } catch (err) {
        try { await fetch(`${API.auth}/logout`, { method: "POST", credentials: "include" }); setAuthToken(null); } catch { }
        throw err; // se mostrará en el catch general
      }

      // Éxito
      playLoginSuccessFxFull();
      showAlert("success", "¡Bienvenido! Entrando…", { timeout: 1400 });
      setTimeout(() => { window.location.href = "inicio.html"; }, 1000);


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


