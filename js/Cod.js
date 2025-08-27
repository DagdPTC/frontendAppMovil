// Evento principal al cargar el documento
// Evento addEventListener
document.addEventListener('DOMContentLoaded', function() {
// Declaración de variable
    const inputs = document.querySelectorAll('.codinput-input');
    if (inputs.length) inputs[0].focus();

    inputs.forEach((input, idx) => {
// Evento addEventListener
        input.addEventListener('input', function(e) {
            // Solo dígitos
            this.value = this.value.replace(/[^0-9]/g, '');
            if (this.value && idx < inputs.length - 1) {
                inputs[idx + 1].focus();
            }
        });

// Evento addEventListener
        input.addEventListener('keydown', function(e) {
            // Backspace y borrado
            if (e.key === 'Backspace' && !this.value && idx > 0) {
                inputs[idx - 1].focus();
            }
        });
    });

// Evento addEventListener
    document.getElementById('codForm').addEventListener('submit', function(e) {
        e.preventDefault();
// Declaración de variable
        let code = '';
        inputs.forEach(input => code += input.value);
        if (code.length !== inputs.length) {
            alert('Debes ingresar los 6 dígitos del código.');
            return;
        }
        window.location.href = 'Nueva.html';
    });
});
