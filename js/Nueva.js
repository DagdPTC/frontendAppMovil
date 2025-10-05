// js/Nueva.js
import { API, fetchJSON, getRecoveryData, clearRecoveryData } from './services/apiConfig.js';

document.addEventListener('DOMContentLoaded', function() {
  const form = document.getElementById('nvForm');
  const passwordInput = document.getElementById('new-password');
  const confirmInput = document.getElementById('confirm-password');
  const submitBtn = form.querySelector('button[type="submit"]');

  const recoveryData = getRecoveryData();
  if (!recoveryData || !recoveryData.email || !recoveryData.code) {
    mostrarAlerta('error', 'Sesión inválida. Reinicia el proceso.');
    setTimeout(() => { window.location.href = 'Recu.html'; }, 1200);
    return;
  }

  // Validación live
  passwordInput.addEventListener('input', () => { validarContrasena(); if (confirmInput.value) validarCoincidencia(); });
  confirmInput.addEventListener('input', validarCoincidencia);

  form.addEventListener('submit', async function(e) {
    e.preventDefault();

    const password = passwordInput.value;
    const confirm = confirmInput.value;

    // Reglas
    const errores = [];
    if (password.length < 8) errores.push('La contraseña debe tener al menos 8 caracteres');
    if (!/[A-Z]/.test(password)) errores.push('Debe contener al menos una letra MAYÚSCULA');
    if (!/[a-z]/.test(password)) errores.push('Debe contener al menos una letra minúscula');
    if (!/[0-9]/.test(password)) errores.push('Debe contener al menos un número');
    if (password !== confirm) errores.push('Las contraseñas no coinciden');
    if (password.length > 128) errores.push('La contraseña es demasiado larga (máximo 128 caracteres)');

    if (errores.length) {
      mostrarAlerta('error', errores.join('. '));
      passwordInput.classList.add('border-red-500');
      confirmInput.classList.add('border-red-500');
      return;
    }

    // Common weak passwords
    const malas = ['12345678', 'password', 'Password1', 'qwerty123', '00000000'];
    if (malas.some(c => password.includes(c))) {
      mostrarAlerta('error', 'Esta contraseña es demasiado común. Elige una más segura.');
      return;
    }

    // Loading
    const textoOriginal = submitBtn.textContent;
    submitBtn.disabled = true;
    submitBtn.innerHTML = `
      <svg class="animate-spin inline-block w-5 h-5 mr-2" fill="none" viewBox="0 0 24 24">
        <circle class="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" stroke-width="4"></circle>
        <path class="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
      </svg>
      Actualizando...
    `;

    try {
      // Llamada de reset
      const res = await fetchJSON(`${API.recovery}/reset`, {
        method: 'POST',
        body: JSON.stringify({ correo: recoveryData.email, nuevaContrasena: password })
      });

      // Éxito en backend
      if (res && res.ok) {
        // Limpiamos recoveryData para no permitir reuso
        clearRecoveryData();

        // Alerta linda (no console.alert)
        mostrarAlerta('success', '¡Contraseña actualizada exitosamente! Ahora puedes iniciar sesión.');

        // Marca visual
        passwordInput.classList.remove('border-red-500');
        confirmInput.classList.remove('border-red-500');
        passwordInput.classList.add('border-green-500', 'bg-green-50');
        confirmInput.classList.add('border-green-500', 'bg-green-50');

        // Redirige al login
        setTimeout(() => { window.location.href = 'LogIn.html'; }, 1500);
      }
    } catch (error) {
      const msg = (error?.message || '').toLowerCase();
      let mensaje = 'Error al actualizar la contraseña. Intenta nuevamente.';

      if (msg.includes('datos incompletos')) mensaje = 'Faltan datos. Completa ambos campos.';
      else if (msg.includes('8 caracteres')) mensaje = 'La contraseña debe tener al menos 8 caracteres';
      else if (msg.includes('mayúscula') || msg.includes('mayuscula')) mensaje = 'La contraseña debe contener al menos una mayúscula';
      else if (msg.includes('número') || msg.includes('numero')) mensaje = 'La contraseña debe contener al menos un número';
      else if (msg.includes('expirad')) { mensaje = 'El código ha expirado. Inicia el proceso nuevamente.'; setTimeout(() => { clearRecoveryData(); window.location.href = 'Recu.html'; }, 1200); }
      else if (msg.includes('usado')) { mensaje = 'Este código ya fue utilizado. Solicita uno nuevo.'; setTimeout(() => { clearRecoveryData(); window.location.href = 'Recu.html'; }, 1200); }
      else if (error.message) mensaje = error.message;

      mostrarAlerta('error', mensaje);
      passwordInput.classList.add('border-red-500');
      confirmInput.classList.add('border-red-500');

      submitBtn.disabled = false;
      submitBtn.textContent = textoOriginal;
    }
  });

  function validarContrasena() {
    const pwd = passwordInput.value;
    passwordInput.classList.remove('border-red-500', 'border-green-500', 'bg-red-50', 'bg-green-50');
    if (pwd.length > 0) {
      const ok = pwd.length >= 8 && /[A-Z]/.test(pwd) && /[0-9]/.test(pwd);
      if (ok) passwordInput.classList.add('border-green-500');
      else if (pwd.length >= 4) passwordInput.classList.add('border-yellow-500');
      else passwordInput.classList.add('border-red-500');
    }
  }

  function validarCoincidencia() {
    const pwd = passwordInput.value;
    const c = confirmInput.value;
    confirmInput.classList.remove('border-red-500', 'border-green-500', 'bg-red-50', 'bg-green-50');
    if (c.length > 0) {
      if (pwd === c && pwd.length >= 8) confirmInput.classList.add('border-green-500');
      else confirmInput.classList.add('border-red-500');
    }
  }

  function mostrarAlerta(tipo, mensaje) {
    const previa = document.querySelector('.custom-alert');
    if (previa) previa.remove();
    const esError = tipo === 'error';
    const bg = esError ? 'bg-red-50' : 'bg-green-50';
    const br = esError ? 'border-red-200' : 'border-green-200';
    const tx = esError ? 'text-red-700' : 'text-green-700';
    const icon = esError ? `
      <svg class="w-5 h-5" fill="currentColor" viewBox="0 0 20 20"><path fill-rule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zM8.707 7.293a1 1 0 00-1.414 1.414L8.586 10l-1.293 1.293a1 1 0 101.414 1.414L10 11.414l1.293 1.293a1 1 0 001.414-1.414L11.414 10l1.293-1.293a1 1 0 00-1.414-1.414L10 8.586 8.707 7.293z" clip-rule="evenodd"/></svg>
    ` : `
      <svg class="w-5 h-5" fill="currentColor" viewBox="0 0 20 20"><path fill-rule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zm3.707-9.293a1 1 0 00-1.414-1.414L9 10.586 7.707 9.293a1 1 0 00-1.414 1.414l2 2a1 1 0 001.414 0l4-4z" clip-rule="evenodd"/></svg>
    `;
    const alerta = document.createElement('div');
    alerta.className = `custom-alert ${bg} border ${br} ${tx} px-4 py-3 rounded-xl mb-4 flex items-center gap-3 shadow-sm animate-fade-in`;
    alerta.innerHTML = `${icon}<span class="flex-1 text-sm font-medium">${mensaje}</span>`;
    const cardContent = form.parentElement;
    cardContent.insertBefore(alerta, form);
    setTimeout(() => {
      alerta.style.opacity = '0';
      alerta.style.transform = 'translateY(-10px)';
      setTimeout(() => alerta.remove(), 300);
    }, esError ? 6000 : 2000);
  }

  if (!document.querySelector('#recovery-styles')) {
    const style = document.createElement('style');
    style.id = 'recovery-styles';
    style.textContent = `
      @keyframes fade-in { from { opacity: 0; transform: translateY(-10px);} to {opacity:1; transform: translateY(0);} }
      .animate-fade-in { animation: fade-in .3s ease-out; }
      .custom-alert { transition: all .3s ease; }
    `;
    document.head.appendChild(style);
  }
});
