// scripts/components/modal_init.js
import { loadAndShowModal } from './modal.js';
import { initImportModal } from '../actions/import_ui.js'; // Змінено шлях

export function initModalButtons() {
    document.body.addEventListener('click', async (event) => {
        const addButton = event.target.closest('.btn-add');
        if (addButton) {
            const currentTab = document.querySelector('.tab-content.active');
            if (!currentTab) return;

            switch (currentTab.id) {
                case 'categories':
                    loadAndShowModal('category-form');
                    break;
                case 'characteristics':
                    loadAndShowModal('characteristic-form');
                    break;
                case 'options':
                    loadAndShowModal('option-form');
                    break;
            }
        }
        
        if (event.target.id === 'importBtn' || event.target.closest('#importBtn')) {
            await loadAndShowModal('import-form');
            await initImportModal();
        }
    });
}