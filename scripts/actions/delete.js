// scripts/actions/delete.js (ПОВНА ОНОВЛЕНА ВЕРСІЯ)

import { analyzeCategoriesForDeletion, analyzeCharacteristicsForDeletion, analyzeOptionsForDeletion, batchDelete } from '../api/googleSheetService.js';
import { showToast } from '../features/toast.js';
import { showDeleteConfirmationModal } from '../features/deleteConfirmationModal.js';

export function initDeleteFunctionality() {
    document.body.addEventListener('click', handleDeleteClick);
}

function determineEntityType(element) {
    const sidePanel = element.closest('.related-section');
    if (sidePanel) {
        const table = sidePanel.querySelector('.pseudo-table');
        if (table) return table.dataset.entityType;
    }
    const activeTab = document.querySelector('.tab-content.active');
    return activeTab ? activeTab.id : 'unknown';
}

async function handleDeleteClick(event) {
    const deleteButton = event.target.closest('.btn-delete');
    if (!deleteButton || deleteButton.disabled) return;

    const entityType = determineEntityType(deleteButton);
    const context = deleteButton.closest('.related-section') || document.querySelector('.tab-content.active');
    if (!context) return;

    const idsToDelete = Array.from(context.querySelectorAll('.row-checkbox:checked')).map(cb => cb.dataset.id);
    if (idsToDelete.length === 0) return;

    let finalIds = null; // Буде об'єктом { categories: [], ... }
    let analysis;

    // --- АНАЛІЗ ---
    try {
        switch (entityType) {
            case 'categories':
                analysis = await analyzeCategoriesForDeletion(idsToDelete);
                break;
            case 'characteristics':
                analysis = await analyzeCharacteristicsForDeletion(idsToDelete);
                break;
            case 'options':
                analysis = await analyzeOptionsForDeletion(idsToDelete);
                break;
            default:
                showToast('Невідомий тип для аналізу.', 'error');
                return;
        }
    } catch(e) {
        showToast('Помилка аналізу залежностей.', 'error');
        return;
    }

    // --- ІНФОРМУВАННЯ ---
    if (analysis.parentsInSelection.length > 0) {
        const userChoice = await showDeleteConfirmationModal(analysis);
        if (userChoice === 'safe') {
            const safeObj = {};
            safeObj[entityType] = analysis.safeToDelete.map(item => item.local_id);
            finalIds = safeObj;
        } else if (userChoice === 'cascade') {
            finalIds = analysis.cascadeDeleteList;
        }
    } else {
        if (confirm(`Ви впевнені, що хочете видалити ${idsToDelete.length} запис(ів)?`)) {
            const idsObj = {};
            idsObj[entityType] = idsToDelete;
            finalIds = idsObj;
        }
    }
    
    // --- ВИКОНАННЯ ---
    if (finalIds && Object.values(finalIds).some(arr => arr.length > 0)) {
        deleteButton.disabled = true;
        const originalLabel = deleteButton.querySelector('.label');
        if (originalLabel) originalLabel.textContent = 'Видалення...';

        try {
            const result = await batchDelete(finalIds);

            if (result.status === 'success') {
                showToast('Записи успішно видалено!', 'success');
                // Оновлюємо всі таблиці, бо видалення могло зачепити кілька сутностей
                document.dispatchEvent(new CustomEvent('dataChanged', { detail: { entityType: 'categories' } }));
                document.dispatchEvent(new CustomEvent('dataChanged', { detail: { entityType: 'characteristics' } }));
                document.dispatchEvent(new CustomEvent('dataChanged', { detail: { entityType: 'options' } }));
            } else {
                showToast(result.message, 'error', 4000);
            }
        } catch (error) {
            console.error('Помилка видалення:', error);
            showToast(`Помилка: ${error.message}`, 'error');
        } finally {
            if (originalLabel) originalLabel.textContent = 'Видалити';
            // Кнопка залишиться неактивною, бо виділення скинеться після оновлення
        }
    }
}