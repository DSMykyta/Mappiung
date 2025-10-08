// scripts/components/controls.js
import { invalidateAllCaches } from '../api/googleSheetService.js';
import { showToast } from '../features/toast.js';
import { renderActiveTable } from './table.js';

export function initControls() {
    const refreshBtn = document.getElementById('refreshDataBtn');
    if (refreshBtn) {
        refreshBtn.addEventListener('click', handleRefreshData);
    }
}

async function handleRefreshData(event) {
    const button = event.currentTarget;
    showToast('Оновлення даних...', 'info', 1500);

    button.disabled = true;
    
    // Використовуємо виправлену назву функції
    invalidateAllCaches();

    try {
        await renderActiveTable(true); // Примусово перезавантажуємо активну таблицю
        showToast('Дані успішно оновлено!', 'success');
    } catch (error) {
        console.error("Помилка при оновленні даних:", error);
        showToast('Помилка під час оновлення даних.', 'error');
    } finally {
        button.disabled = false;
    }
}