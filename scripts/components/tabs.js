// scripts/components/tabs.js
import { renderActiveTable } from './table.js';

export function initTabs() {
    document.querySelector('.tabs-head').addEventListener('click', handleTabClick);
}

async function handleTabClick(event) {
    const clickedButton = event.target.closest('.tab-button');
    if (!clickedButton || clickedButton.classList.contains('active')) return;

    // Знімаємо 'active' з усіх кнопок та контенту
    document.querySelectorAll('.tabs-head .tab-button').forEach(btn => btn.classList.remove('active'));
    document.querySelectorAll('.tabs-container .tab-content').forEach(content => content.classList.remove('active'));

    // Встановлюємо 'active' на потрібні елементи
    clickedButton.classList.add('active');
    const tabId = clickedButton.dataset.tab;
    const tabContent = document.getElementById(tabId);
    if (tabContent) {
        tabContent.classList.add('active');
    }

    // Перемальовуємо активну таблицю
    await renderActiveTable();
}