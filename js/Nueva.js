document.addEventListener('DOMContentLoaded', function() {
    const form = document.getElementById('nvForm');
    if (!form) {
        alert("No se encontró el formulario con id 'nvForm'");
        return;
    }
    form.addEventListener('submit', function(e) {
        e.preventDefault();

        // Obtén los valores por id, no por clase
        const passwordInput = document.getElementById('new-password');
        const confirmInput = document.getElementById('confirm-password');

        if (!passwordInput || !confirmInput) {
            alert('Faltan los campos de contraseña');
            return;
        }

        const password = passwordInput.value;
        const confirm = confirmInput.value;
        const errors = [];

        if (password.length < 8) {
            errors.push("La contraseña debe tener al menos 8 caracteres.");
        }
        if (!/[A-Z]/.test(password)) {
            errors.push("La contraseña debe tener al menos una letra mayúscula.");
        }
        if (password !== confirm) {
            errors.push("Las contraseñas no coinciden.");
        }

        if (errors.length > 0) {
            alert(errors.join('\n'));
            return;
        }

        alert('Contraseña cambiada correctamente');
        setTimeout(function() {
            window.location.href = "LogIn.html";
        }, 100);
    });
});

