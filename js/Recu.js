// js/Recu.js
import { API, fetchJSON, setRecoveryData } from './services/apiConfig.js';

document.addEventListener('DOMContentLoaded', function() {
  const form = document.getElementById('recuForm');
  const submitBtn = form.querySelector('button[type="submit"]');
  const emailInput = form.querySelector('input[type="email"]');

  // Limpiar datos previos de recuperación al cargar
  sessionStorage.removeItem('recoveryData');

  form.addEventListener('submit', async function(e) {
    e.preventDefault();
    // Evita que otro listener paralelo al submit se ejecute (por si quedó alguno en el HTML)
    if (e.stopImmediatePropagation) e.stopImmediatePropagation();

    const email = emailInput.value.trim();

    // Validación básica
    if (!email) {
      mostrarAlerta('error', 'Por favor ingresa tu correo electrónico');
      emailInput.focus();
      return;
    }

    if (!validarEmail(email)) {
      mostrarAlerta('error', 'Formato de correo inválido. Ej: usuario@gmail.com');
      emailInput.focus();
      return;
    }

    // Deshabilitar botón para evitar múltiples envíos
    const textoOriginal = submitBtn.textContent;
    submitBtn.disabled = true;
    submitBtn.innerHTML = `
      <svg class="animate-spin inline-block w-5 h-5 mr-2" fill="none" viewBox="0 0 24 24">
        <circle class="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" stroke-width="4"></circle>
        <path class="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
      </svg>
      Enviando...
    `;

    try {
      // Llamar al endpoint de solicitud
      const response = await fetchJSON(`${API.recovery}/request`, {
        method: 'POST',
        body: JSON.stringify({ correo: email })
      });

      if (response && response.ok) {
        // Guardar el email en sessionStorage
        setRecoveryData(email);

        // Mostrar mensaje de éxito
        mostrarAlerta('success', '¡Código enviado! Revisa tu correo electrónico');

        // Redirigir a la pantalla de código después de 1.5 segundos
        setTimeout(() => {
          window.location.href = 'Cod.html';
        }, 1500);
      }
    } catch (error) {
      console.error('❌ Error al solicitar código:', error);

      // Mensajes personalizados según el error
      let mensajeError = 'Error al enviar el código. Intenta nuevamente.';
      const msg = (error?.message || '').toLowerCase();

      if (msg.includes('usuario no encontrado') ||
          msg.includes('correo no registrado') ||
          msg.includes('no existe')) {
        mensajeError = 'Este correo no está registrado en el sistema';
      } else if (msg.includes('demasiadas solicitudes') ||   // ← NUEVO
                 msg.includes('demasiados intentos') ||
                 msg.includes('rate limit') ||
                 msg.includes('429')) {
        mensajeError = 'Demasiadas solicitudes. Espera unos minutos.';
      } else if (msg.includes('email')) {
        mensajeError = 'Error al enviar el email. Verifica tu correo.';
      } else if (error.message) {
        mensajeError = error.message;
      }

      mostrarAlerta('error', mensajeError);

      // Re-habilitar botón
      submitBtn.disabled = false;
      submitBtn.textContent = textoOriginal;
      emailInput.focus();
    }
  });

  // Validación en tiempo real
  emailInput.addEventListener('input', function() {
    // Remover clases de error/éxito
    emailInput.classList.remove('border-red-500', 'border-green-500', 'ring-red-500/15', 'ring-green-500/15');

    const email = this.value.trim();
    if (email.length > 0) {
      if (validarEmail(email)) {
        emailInput.classList.add('border-green-500');
      } else {
        emailInput.classList.add('border-red-500');
      }
    }
  });

  // Función para validar formato de email
  function validarEmail(email) {
    const regex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    return regex.test(email);
  }

  // Función para mostrar alertas (estilo login)
  function mostrarAlerta(tipo, mensaje) {
    // Remover alertas previas
    const alertaPrevia = document.querySelector('.custom-alert');
    if (alertaPrevia) alertaPrevia.remove();

    const esError = tipo === 'error';
    const bgColor = esError ? 'bg-red-50' : 'bg-green-50';
    const borderColor = esError ? 'border-red-200' : 'border-green-200';
    const textColor = esError ? 'text-red-700' : 'text-green-700';
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
    alerta.className = `custom-alert ${bgColor} border ${borderColor} ${textColor} px-4 py-3 rounded-xl mb-4 flex items-center gap-3 shadow-sm animate-fade-in`;
    alerta.innerHTML = `
      ${icon}
      <span class="flex-1 text-sm font-medium">${mensaje}</span>
    `;

    // Insertar antes del formulario
    const cardContent = form.closest('div');
    cardContent.insertBefore(alerta, form);

    // Auto-remover después de 5 segundos
    setTimeout(() => {
      alerta.style.opacity = '0';
      alerta.style.transform = 'translateY(-10px)';
      setTimeout(() => alerta.remove(), 300);
    }, 5000);
  }

  // Agregar estilos de animación si no existen
  if (!document.querySelector('#recovery-styles')) {
    const style = document.createElement('style');
    style.id = 'recovery-styles';
    style.textContent = `
      @keyframes fade-in {
        from { opacity: 0; transform: translateY(-10px); }
        to { opacity: 1; transform: translateY(0); }
      }
      .animate-fade-in { animation: fade-in 0.3s ease-out; }
      .custom-alert { transition: all 0.3s ease; }
    `;
    document.head.appendChild(style);
  }
});
