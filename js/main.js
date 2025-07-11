// main.js

document.addEventListener('DOMContentLoaded', () => {
    const updateCurrentDate = () => {
        const now = new Date();
        const options = { weekday: 'short', day: 'numeric', month: 'short' };
        const dateStr = now.toLocaleDateString('es-ES', options);
        document.getElementById('current-date').textContent = dateStr;
    };

    const cards = [
        {
            title: "Oferta del día",
            content: "Hoy 2x1 en todas las bebidas",
            bgColor: "bg-gradient-to-r from-blue-400 to-blue-600",
            icon: "fas fa-tag"
        },
        {
            title: "Combo Especial",
            content: "Hamburguesa + Papas + Refresco solo $99",
            bgColor: "bg-gradient-to-r from-purple-400 to-purple-600",
            icon: "fas fa-hamburger"
        },
        {
            title: "Promoción VIP",
            content: "Martes de postres: 30% de descuento",
            bgColor: "bg-gradient-to-r from-orange-400 to-orange-600",
            icon: "fas fa-crown"
        },
        {
            title: "Platillo Especial",
            content: "Pasta Alfredo con camarones $129",
            bgColor: "bg-gradient-to-r from-red-400 to-red-600",
            icon: "fas fa-utensils"
        },
        {
            title: "Happy Hour",
            content: "4-7pm: Cervezas artesanales $35",
            bgColor: "bg-gradient-to-r from-green-400 to-green-600",
            icon: "fas fa-glass-cheers"
        }
    ];

    let currentCardIndex = 0;
    const cardContainer = document.getElementById('card-container');

    const renderCard = (index) => {
        const card = cards[index];
        const cardElement = document.createElement('div');
        cardElement.className = `absolute inset-0 ${card.bgColor} text-white p-6 rounded-xl flex flex-col justify-center card-slide-in`;
        cardElement.innerHTML = `
            <i class="${card.icon} text-3xl mb-4"></i>
            <h3 class="text-xl font-bold">${card.title}</h3>
            <p class="text-sm opacity-90">${card.content}</p>
        `;

        while (cardContainer.firstChild) {
            cardContainer.removeChild(cardContainer.firstChild);
        }

        cardContainer.appendChild(cardElement);

        document.querySelectorAll('[id^="indicator-"]').forEach((indicator, i) => {
            indicator.className = i === index ? 'w-2 h-2 bg-blue-400 rounded-full' : 'w-2 h-2 bg-gray-300 rounded-full';
        });
    };

    const nextCard = () => {
        if (cardContainer.firstChild) {
            cardContainer.firstChild.classList.remove('card-slide-in');
            cardContainer.firstChild.classList.add('card-slide-out');

            setTimeout(() => {
                currentCardIndex = (currentCardIndex + 1) % cards.length;
                renderCard(currentCardIndex);
            }, 500);
        }
    };

    updateCurrentDate();
    renderCard(0);
    setInterval(nextCard, 10000);
});
