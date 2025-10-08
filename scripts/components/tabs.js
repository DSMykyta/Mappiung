// /scripts/components/tabs.js (оновлений)
import { renderCategoriesTable, renderCharacteristicsTable, renderOptionsTable } from './table.js';

export function initTabs() {
    document.querySelector('.tabs-head').addEventListener('click', handleTabClick);
}

export async function handleTabClick(event) {
    const clickedButton = event.target.closest('.tab-button');
    if (!clickedButton) return;

    document.querySelector('.tabs-head').querySelectorAll('.tab-button').forEach(btn => btn.classList.remove('active'));
    document.querySelectorAll('.tab-content').forEach(content => content.classList.remove('active'));

    clickedButton.classList.add('active');
    const tabToActivate = clickedButton.dataset.tab;
    document.getElementById(tabToActivate)?.classList.add('active');

    // Використовуємо await, щоб дочекатись завантаження даних
    switch (tabToActivate) {
        case 'categories':
            await renderCategoriesTable();
            break;
        case 'characteristics':
            await renderCharacteristicsTable();
            break;
        case 'options':
            await renderOptionsTable();
            break;
    }
}