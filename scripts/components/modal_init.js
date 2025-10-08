// scripts/components/modal_init.js
import { loadAndShowModal } from './modalManager.js'; // Виправлено шлях на modalManager
import { initImportModal } from '../actions/import_ui.js';

export function initModalButtons() {
    document.body.addEventListener('click', async (event) => {
        const addButton = event.target.closest('.btn-add');
        if (addButton) {
            const currentTab = document.querySelector('.tab-content.active');
            if (!currentTab) return;

            // ВИПРАВЛЕНО: Забираємо 's' з кінця ID, щоб отримати правильне ім'я файлу (напр. 'categories' -> 'category')
            const entityType = currentTab.id.endsWith('s') ? currentTab.id.slice(0, -1) : currentTab.id;
            
            loadAndShowModal(`${entityType}-form`);
        }
        
        if (event.target.id === 'importBtn' || event.target.closest('#importBtn')) {
            await loadAndShowModal('import-form');
            await initImportModal();
        }
    });
}