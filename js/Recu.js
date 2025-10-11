// js/Recu.js
import { API, setRecoveryData } from './services/apiConfig.js';

document.addEventListener('DOMContentLoaded', () => {
  const form = document.getElementById('recuForm');
  const submitBtn = form.querySelector('button[type="submit"]');
  const emailInput = document.getElementById('email');

  // Limpiar datos previos de recuperación al cargar
  sessionStorage.removeItem('recoveryData');

  form.addEventListener('submit', async (e) => {
    e.preventDefault();
    if (e.stopImmediatePropagation) e.stopImmediatePropagation();

    const email = (emailInput.value || '').trim();

    // 1) Validaciones de entrada
    if (!email) {
      mostrarAlerta('error', 'Por favor ingresa tu correo electrónico');
      emailInput.focus();
      return;
    }

    if (!validarFormatoEmail(email)) {
      mostrarAlerta('error', 'Formato de correo inválido. Ej: usuario@gmail.com');
      emailInput.focus();
      return;
    }

    if (!esGmail(email)) {
      mostrarAlerta('error', 'Solo se permite correo de Gmail (@gmail.com)');
      emailInput.focus();
      return;
    }

    // 2) UI: loading
    const textoOriginal = submitBtn.textContent;
    setCargando(true);

    try {
      // 3) Pre-chequeo: verificar si el correo existe en la base
      const existe = await existeCorreoEnSistema(email);
      if (!existe) {
        mostrarAlerta('error', 'Este correo no está registrado en el sistema');
        setCargando(false, textoOriginal);
        emailInput.focus();
        return;
      }

      // 4) Si existe, solicitar el envío del código (NO redirigir si falla)
      const resp = await fetch(`${API.recovery}/request`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ correo: email }),
        credentials: 'include',
      });

      // Chequeo estricto por status
      if (!resp.ok) {
        const dataErr = await safeJson(resp);
        const msg = (dataErr?.message || dataErr?.error || `Error ${resp.status}`);
        throw new Error(msg);
      }

      // Éxito: guardar y redirigir
      setRecoveryData(email);
      mostrarAlerta('success', '¡Código enviado! Revisa tu correo electrónico');

      setTimeout(() => {
        window.location.href = 'Cod.html';
      }, 1200);

    } catch (error) {
      console.error('❌ Error en recuperación:', error);
      let mensajeError = 'No se pudo enviar el código. Intenta nuevamente.';

      const msg = (error?.message || '').toLowerCase();
      if (msg.includes('usuario no encontrado') || msg.includes('no existe') || msg.includes('correo')) {
        mensajeError = 'Este correo no está registrado en el sistema';
      } else if (msg.includes('gmail')) {
        mensajeError = 'Solo se permite correo de Gmail (@gmail.com)';
      } else if (msg.includes('demasiadas') || msg.includes('429') || msg.includes('rate')) {
        mensajeError = 'Demasiadas solicitudes. Espera unos minutos.';
      }

      mostrarAlerta('error', mensajeError);
      setCargando(false, textoOriginal);
      emailInput.focus();
    }
  });

  // Bordes verde/rojo en vivo
  emailInput.addEventListener('input', function () {
    this.classList.remove('border-red-500', 'border-green-500', 'ring-red-500/15', 'ring-green-500/15');
    const v = this.value.trim();
    if (!v) return;
    if (validarFormatoEmail(v) && esGmail(v)) this.classList.add('border-green-500');
    else this.classList.add('border-red-500');
  });

  /* ============================
   * Helpers
   * ============================ */

  function validarFormatoEmail(email) {
    // Formato general
    const regex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    return regex.test(email);
  }

  function esGmail(email) {
    // Acepta gmail.com y googlemail.com
    return /@(gmail\.com|googlemail\.com)$/i.test(email);
  }

  async function safeJson(resp) {
    try { return await resp.json(); } catch { return null; }
  }

  function setCargando(estado, textoOriginal) {
    if (estado) {
      submitBtn.disabled = true;
      submitBtn.innerHTML = `
        <svg class="animate-spin inline-block w-5 h-5 mr-2" fill="none" viewBox="0 0 24 24">
          <circle class="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" stroke-width="4"></circle>
          <path class="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
        </svg>
        Enviando...
      `;
    } else {
      submitBtn.disabled = false;
      submitBtn.textContent = textoOriginal || 'Siguiente';
    }
  }

  // Muestra alerta y NO navega; se queda en la misma pantalla
  function mostrarAlerta(tipo, mensaje) {
    const previa = document.querySelector('.custom-alert');
    if (previa) previa.remove();

    const esError = tipo === 'error';
    const bg = esError ? 'bg-red-50' : 'bg-green-50';
    const border = esError ? 'border-red-200' : 'border-green-200';
    const text = esError ? 'text-red-700' : 'text-green-700';
    const icon = esError ? `
      <svg class="w-5 h-5" fill="currentColor" viewBox="0 0 20 20">
        <path fill-rule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zM8.707 7.293a1 1 0 00-1.414 1.414L8.586 10l-1.293 1.293a1 1 0 101.414 1.414L10 11.414l1.293 1.293a1 1 0 001.414-1.414L11.414 10l1.293-1.293a1 1 0 00-1.414-1.414L10 8.586 8.707 7.293z" clip-rule="evenodd"/>
      </svg>
    ` : `
      <svg class="w-5 h-5" fill="currentColor" viewBox="0 0 20 20">
        <path fill-rule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zm3.707-9.293a1 1 0 00-1.414-1.414L9 10.586 7.707 9.293a1 1 0 00-1.414 1.414l2 2a1 1 0 001.414 0l4-4z" clip-rule="evenodd"/>
      </svg>
    `;

    const alerta = document.createElement('div');
    alerta.className = `custom-alert ${bg} border ${border} ${text} px-4 py-3 rounded-xl mb-4 flex items-center gap-3 shadow-sm animate-fade-in`;
    alerta.innerHTML = `${icon}<span class="flex-1 text-sm font-medium">${mensaje}</span>`;

    const cardContent = form.closest('div');
    cardContent.insertBefore(alerta, form);

    setTimeout(() => {
      alerta.style.opacity = '0';
      alerta.style.transform = 'translateY(-10px)';
      setTimeout(() => alerta.remove(), 300);
    }, 5000);

    // Inyecta animación si no existe
    if (!document.querySelector('#recovery-styles')) {
      const style = document.createElement('style');
      style.id = 'recovery-styles';
      style.textContent = `
        @keyframes fade-in { from { opacity: 0; transform: translateY(-10px); } to { opacity: 1; transform: translateY(0); } }
        .animate-fade-in { animation: fade-in 0.3s ease-out; }
        .custom-alert { transition: all 0.3s ease; }
      `;
      document.head.appendChild(style);
    }
  }

  async function existeCorreoEnSistema(email) {
  try {
    const resp = await fetch(`${API.usuario}/exists?correo=${encodeURIComponent(email)}`, {
      credentials: 'include'
    });
    const data = await safeJson(resp);

    if (!resp.ok) {
      const message = data?.message || data?.error || `Error ${resp.status}`;
      return { ok: false, exists: false, message };
    }

    if (typeof data?.exists === 'boolean') {
      return { ok: true, exists: data.exists };
    }
    return { ok: false, exists: false, message: 'Respuesta inesperada del servidor' };
  } catch (err) {
    return { ok: false, exists: false, message: 'No se pudo contactar al servidor' };
  }
}

});
