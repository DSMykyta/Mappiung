/**
 * scripts/actions/merge.js
 * * Логіка для об'єднання елементів (UI частина).
 */

import { getSelectedIds, clearSelection } from './selection.js';
import { toastError, toastSuccess, toastInfo } from '../features/toast.js';
import { renderActiveTable, getPaginationState } from '../components/table.js';
import { loadAndShowModal, closeModal } from '../components/modalManager.js';
import { performEntityMerge } from '../api/googleSheetService.js';

export function initMergeAction() {
    const mergeButton = document.getElementById('mergeBtn');
    if (mergeButton) {
        mergeButton.addEventListener('click', handleMergeClick);
    }
}

async function handleMergeClick() {
    const entityType = document.querySelector('.tab-content.active')?.id;
    if(!entityType) return;
    
    const selectedIds = Array.from(getSelectedIds(entityType));
    
    if (selectedIds.length < 2) {
        toastInfo("Для об'єднання потрібно вибрати щонайменше два елементи.");
        return;
    }

    const sourceData = getPaginationState(entityType)?.sourceData || [];
    const idField = entityType === 'brands' ? 'brand_id' : 'local_id';
    const selectedData = sourceData.filter(item => selectedIds.includes(item[idField]));

    if (selectedData.length !== selectedIds.length) {
        toastError("Не вдалося знайти всі вибрані дані. Спробуйте оновити таблицю.");
        return;
    }

    showMergeModal(entityType, selectedData, idField);
}

async function showMergeModal(entityType, data, idField) {
    // ... (код з вашого файлу, тепер він буде працювати)
}

async function executeMerge(entityType, masterId, idsToMerge, button) {
    // ... (код з вашого файлу)
}

// ...