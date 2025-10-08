// scripts/components/controls.js

import { clearAllCaches } from '../api/googleSheetService.js';
import { showToast } from '../features/toast.js';
import { renderCategoriesTable, renderCharacteristicsTable, renderOptionsTable } from './table.js';

export function initControls() {
    const refreshBtn = document.getElementById('refreshDataBtn');
    if (refreshBtn) {
        refreshBtn.addEventListener('click', handleRefreshData);
    }
}

async function handleRefreshData(event) {
    const button = event.currentTarget;
    showToast('Оновлення даних...', 'info', 1500);

    // Просто блокуємо кнопку на час операції
    button.disabled = true;
    
    // 1. Очищуємо всі кеші
    clearAllCaches();

    // 2. Визначаємо активну вкладку
    const activeTabContent = document.querySelector('.tab-content.active');
    if (!activeTabContent) {
        showToast('Не вдалося визначити активну вкладку.', 'error');
        button.disabled = false;
        return;
    }

    const tabId = activeTabContent.id;

    // 3. Рендеримо дані для активної вкладки
    try {
        switch (tabId) {
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
        showToast('Дані успішно оновлено!', 'success');
    } catch (error) {
        console.error("Помилка при оновленні даних:", error);
        showToast('Помилка під час оновлення даних. Перевірте авторизацію.', 'error');
    } finally {
        // Повертаємо кнопку в активний стан
        button.disabled = false;
    }
}