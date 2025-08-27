// Evento principal al cargar el documento
// Evento addEventListener
document.addEventListener('DOMContentLoaded', function() {
// Evento addEventListener
    document.getElementById('recuForm').addEventListener('submit', function(e) {
        e.preventDefault();
        // Aquí podrías validar el email
        window.location.href = 'Cod.html';
    });
});
