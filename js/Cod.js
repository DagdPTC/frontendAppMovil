// js/Cod.js
import { API, fetchJSON, getRecoveryData, setRecoveryData } from './services/apiConfig.js';

document.addEventListener('DOMContentLoaded', function() {
  const form = document.getElementById('codForm');
  const inputs = document.querySelectorAll('.codinput-input');
  const submitBtn = form.querySelector('button[type="submit"]');

  // Verificar paso anterior
  const recoveryData = getRecoveryData();
  if (!recoveryData || !recoveryData.email) {
    mostrarAlerta('error', 'Sesión expirada. Reinicia el proceso.');
    setTimeout(() => { window.location.href = 'Recu.html'; }, 1500);
    return;
  }

  // Autofocus
  if (inputs.length) inputs[0].focus();

  // Manejo OTP inputs
  inputs.forEach((input, idx) => {
    input.addEventListener('input', function() {
      this.value = this.value.replace(/[^0-9]/g, '');
      this.classList.remove('border-red-500', 'bg-red-50');

      if (this.value && idx < inputs.length - 1) inputs[idx + 1].focus();

      if (idx === inputs.length - 1 && this.value) {
        const code = leerCodigo();
        if (code.length === 6) setTimeout(() => form.dispatchEvent(new Event('submit')), 200);
      }
    });

    input.addEventListener('keydown', function(e) {
      if (e.key === 'Backspace' && !this.value && idx > 0) inputs[idx - 1].focus();
    });

    input.addEventListener('paste', function(e) {
      e.preventDefault();
      const pasted = e.clipboardData.getData('text').replace(/[^0-9]/g, '');
      if (pasted.length === 6) {
        inputs.forEach((inp, i) => {
          inp.value = pasted[i] ?? '';
          inp.classList.remove('border-red-500', 'bg-red-50');
        });
        inputs[5].focus();
        setTimeout(() => form.dispatchEvent(new Event('submit')), 250);
      } else {
        mostrarAlerta('error', 'El código debe tener exactamente 6 dígitos');
      }
    });
  });

  form.addEventListener('submit', async function(e) {
    e.preventDefault();

    const code = leerCodigo();

    // Validaciones rápidas
    if (code.length !== 6) {
      mostrarAlerta('error', 'Debes ingresar los 6 dígitos del código');
      marcarInputsError();
      inputs[0].focus();
      return;
    }
    if (!/^\d{6}$/.test(code)) {
      mostrarAlerta('error', 'El código solo debe contener números');
      marcarInputsError();
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
      Verificando...
    `;

    try {
      // Verificar código
      const response = await fetchJSON(`${API.recovery}/verify`, {
        method: 'POST',
        body: JSON.stringify({ correo: recoveryData.email, codigo: code })
      });

      if (response && response.ok) {
        setRecoveryData(recoveryData.email, code); // guarda email+code
        mostrarAlerta('success', '¡Código verificado correctamente!');
        inputs.forEach(inp => {
          inp.classList.remove('border-red-500', 'bg-red-50');
          inp.classList.add('border-green-500', 'bg-green-50');
        });
        setTimeout(() => { window.location.href = 'Nueva.html'; }, 800);
      }
    } catch (error) {
      const raw = (error?.message || '').toLowerCase();

      // Mapeo fino para no mostrar "token inválido"
      if (raw.includes('código incorrecto') || raw.includes('codigo incorrecto') ||
          raw.includes('código inválido')   || raw.includes('codigo invalido') ||
          raw.includes('invalid')            || raw.includes('inválido')) {

        // --- Comportamiento solicitado ---
        mostrarAlerta('error', 'Código inválido. Intenta de nuevo.');
        // NO limpiamos los inputs: se quedan como están
        // Sólo marcamos visualmente el error y dejamos que el usuario edite
        marcarInputsError();
        // Foco en el primer input con valor vacío (o en el último si todos están llenos)
        const firstEmpty = Array.from(inputs).find(i => !i.value);
        (firstEmpty || inputs[5]).focus();

      } else if (raw.includes('expirad')) {
        mostrarAlerta('error', 'El código ha expirado. Solicita uno nuevo.');
        setTimeout(() => { window.location.href = 'Recu.html'; }, 1200);

      } else if (raw.includes('límite') || raw.includes('limite') || raw.includes('intentos')) {
        mostrarAlerta('error', 'Demasiados intentos fallidos. Solicita un nuevo código.');
        setTimeout(() => { window.location.href = 'Recu.html'; }, 1200);

      } else if (raw.includes('no hay código activo') || raw.includes('no hay codigo activo')) {
        mostrarAlerta('error', 'No hay un código activo. Vuelve a solicitarlo.');
        setTimeout(() => { window.location.href = 'Recu.html'; }, 1200);

      } else {
        // Cualquier otro error
        mostrarAlerta('error', error.message || 'Error al verificar el código');
        marcarInputsError();
      }

      // Rehabilitar botón para reintentos
      submitBtn.disabled = false;
      submitBtn.textContent = textoOriginal;
    }
  });

  function leerCodigo() {
    let code = '';
    inputs.forEach(i => code += i.value);
    return code;
  }

  function marcarInputsError() {
    inputs.forEach(inp => {
      inp.classList.add('border-red-500', 'bg-red-50');
      inp.classList.remove('border-green-500', 'bg-green-50');
    });
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
    }, esError ? 5000 : 1500);
  }

  if (!document.querySelector('#recovery-styles')) {
    const style = document.createElement('style');
    style.id = 'recovery-styles';
    style.textContent = `
      @keyframes fade-in { from { opacity: 0; transform: translateY(-10px);} to {opacity:1; transform: translateY(0);} }
      .animate-fade-in { animation: fade-in .3s ease-out; }
      .custom-alert { transition: all .3s ease; }
      .codinput-input.border-red-500 { animation: shake .35s ease; }
      @keyframes shake { 0%,100%{transform:translateX(0)} 25%{transform:translateX(-5px)} 75%{transform:translateX(5px)} }
    `;
    document.head.appendChild(style);
  }
});
