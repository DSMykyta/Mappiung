// scripts/features/search.js

import { getPaginationState, setFilteredData, renderActiveTable } from '../components/table.js';

export function initSearch() {
    const searchInput = document.getElementById('searchInput');
    if (!searchInput) return;

    const handleInput = () => applyFilter(searchInput);
    searchInput.addEventListener('input', handleInput);
    searchInput.addEventListener('search', handleInput);
}

function applyFilter(searchInput) {
    const query = searchInput.value.toLowerCase().trim();
    const activeTab = document.querySelector('.tab-content.active');
    if (!activeTab) return;

    const entityType = activeTab.id;
    const state = getPaginationState(entityType);
    if (!state) return;

    const { sourceData } = state;

    // Фільтруємо вихідний масив даних
    const filteredData = sourceData.filter(row => {
        if (query === '') return true;
        // Перебираємо значення об'єкта в пошуках збігу
        return Object.values(row).some(value => 
            String(value).toLowerCase().includes(query)
        );
    });

    // Оновлюємо відфільтровані дані в state
    setFilteredData(entityType, filteredData);
    // Запускаємо повний пере-рендерінг таблиці (який врахує і пагінацію)
    renderActiveTable();
}