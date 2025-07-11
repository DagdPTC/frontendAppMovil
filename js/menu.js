const searchInput = document.getElementById('search-menu');
const filterBtns = document.querySelectorAll('.category-btn');
const menuItems = document.querySelectorAll('.menu-item');

let activeCategory = '';
let debounceTimer;

function filterMenu() {
  const searchTerm = searchInput.value.toLowerCase();

  menuItems.forEach(item => {
    const name = item.getAttribute('data-name').toLowerCase();
    const category = item.getAttribute('data-category');

    const matchesSearch = name.includes(searchTerm);
    const matchesCategory = activeCategory === '' || category === activeCategory;

    if (matchesSearch && matchesCategory) {
      item.classList.remove('hidden');
    } else {
      item.classList.add('hidden');
    }
  });
}

searchInput.addEventListener('input', () => {
  clearTimeout(debounceTimer);
  debounceTimer = setTimeout(filterMenu, 300);
});

filterBtns.forEach(btn => {
  btn.addEventListener('click', () => {
    const isActive = btn.classList.contains('bg-sky-400');
    activeCategory = isActive ? '' : btn.getAttribute('data-category');

    filterBtns.forEach(b => {
      if (b === btn) {
        b.classList.add('bg-sky-400', 'text-white');
        b.classList.remove('bg-gray-100', 'text-gray-600');
      } else {
        b.classList.remove('bg-sky-400', 'text-white');
        b.classList.add('bg-gray-100', 'text-gray-600');
      }
    });

    filterMenu();
  });
});
