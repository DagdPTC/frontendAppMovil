document.addEventListener('DOMContentLoaded', function() {
    const form = document.getElementById('loginForm');
    form.addEventListener('submit', function(e) {
        e.preventDefault();
        const email = document.getElementById('email');
        const password = document.getElementById('password');
        if (!email.value || !password.value) {
            alert('Completa ambos campos.');
            return;
        }

        // Elementos a animar
        const header = document.getElementById('loginHeader');
        const headerTexts = document.getElementById('loginHeaderTexts');
        const loginCard = document.getElementById('loginCard');

        // 1. Fade out form/tarjeta blanca
        if (loginCard) {
            loginCard.classList.add('fade-out');
        }

        // 2. Fade out textos header
        if (headerTexts) {
            headerTexts.style.opacity = 0;
        }

        // 3. Encoge header azul (ajusta la animación si no está en tu CSS)
        header.classList.add('shrink-animation');

        // 4. Redirige después de la animación (ajusta el tiempo si cambiaste la duración)
        setTimeout(function() {
            window.location.href = "index.html";
        }, 700);
    });
});
