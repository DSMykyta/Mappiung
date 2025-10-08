// scripts/actions/delete.js (ВАША ВЕРСІЯ)

import { analyzeCategoriesForDeletion, analyzeCharacteristicsForDeletion, analyzeOptionsForDeletion, batchDelete } from '../api/googleSheetService.js';
import { showToast } from '../features/toast.js';
import { showDeleteConfirmationModal } from '../features/deleteConfirmationModal.js';
import { getSelectedIds } from './selection.js'; // Додано імпорт
import { invalidateAllCaches } from '../api/googleSheetService.js'; // Додано імпорт
import { renderActiveTable } from '../components/table.js'; // Додано імпорт

export function initDeleteFunctionality() {
    document.getElementById('deleteBtn')?.addEventListener('click', handleDeleteClick);
}

function determineEntityType(element) {
    const activeTab = document.querySelector('.tab-content.active');
    return activeTab ? activeTab.id : 'unknown';
}

async function handleDeleteClick(event) {
    const deleteButton = event.currentTarget;
    if (!deleteButton || deleteButton.disabled) return;

    const entityType = determineEntityType(deleteButton);
    const idsToDelete = Array.from(getSelectedIds(entityType));
    
    if (idsToDelete.length === 0) return;

    let finalIds = null;
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
            default: // Для 'brands' та інших простих сутностей
                analysis = { parentsInSelection: [], safeToDelete: idsToDelete.map(id => ({ local_id: id })), cascadeDeleteList: { [entityType]: idsToDelete } };
        }
    } catch(e) {
        showToast(`Помилка аналізу залежностей: ${e.message}`, 'error');
        return;
    }

    // --- ІНФОРМУВАННЯ ---
    if (analysis.parentsInSelection.length > 0) {
        const userChoice = await showDeleteConfirmationModal(analysis);
        if (userChoice === 'safe') {
            finalIds = { [entityType]: analysis.safeToDelete.map(item => item.local_id) };
        } else if (userChoice === 'cascade') {
            finalIds = analysis.cascadeDeleteList;
        }
    } else {
        if (confirm(`Ви впевнені, що хочете видалити ${idsToDelete.length} запис(ів)?`)) {
            finalIds = { [entityType]: idsToDelete };
        }
    }
    
    // --- ВИКОНАННЯ ---
    if (finalIds && Object.values(finalIds).some(arr => arr && arr.length > 0)) {
        deleteButton.disabled = true;
        
        try {
            const result = await batchDelete(finalIds);

            if (result.status === 'success') {
                showToast('Записи успішно видалено!', 'success');
                invalidateAllCaches();
                renderActiveTable(true); 
            } else {
                showToast(result.message, 'error', 4000);
            }
        } catch (error) {
            console.error('Помилка видалення:', error);
            showToast(`Помилка: ${error.message}`, 'error');
        } 
    }
}