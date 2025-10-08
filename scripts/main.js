// scripts/main.js
import { initAuth } from './api/auth.js';
import { initTabs } from './components/tabs.js';
import { initControls } from './components/controls.js';

import { initTableInteractions, renderActiveTable, clearActiveTable } from './components/table.js';
import { initCustomSelects } from './components/select.js';
import { initSearch } from './features/search.js';
import { initPagination } from './features/pagination.js';
import { initSorting } from './features/sorting.js';
import { initTooltips } from './features/tooltip.js';
import { initSelection } from './actions/selection.js';
import { initDeleteFunctionality } from './actions/delete.js';
import { initModalButtons } from './components/modal_init.js';
import { initMergeAction } from './actions/merge.js';


/**
 * Централізований обробник статусу авторизації.
 */
function handleAuthChange(event) {
    const { isSignedIn } = event.detail;
    if (isSignedIn) {
        // Рендеримо ту таблицю, яка зараз активна
        renderActiveTable();
    } else {
        // Очищуємо таблицю та показуємо повідомлення про необхідність входу
        clearActiveTable();
    }
}

document.addEventListener('DOMContentLoaded', () => {
    console.log("DOM завантажено. Ініціалізуємо компоненти...");
    initTabs();
    initModalButtons();
    initControls();
    initTableInteractions();
    initSearch();
    initAuth();
    initCustomSelects();
    initSelection();
    initDeleteFunctionality();
    initPagination();
    initSorting();
    initTooltips();
    initMergeAction();

    const adminPanelBtn = document.getElementById('adminPanelBtn');
    if(adminPanelBtn) {
        adminPanelBtn.addEventListener('click', () => {
            alert('Цей функціонал ще не реалізовано.');
        });
    }

    document.addEventListener('authStatusChange', handleAuthChange);
});

