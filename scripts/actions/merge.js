/**
 * scripts/actions/merge.js
 * * Логіка для об'єднання елементів (UI частина).
 */

import { getSelectedIds, resetSelection } from './selection.js'; // ВИПРАВЛЕНО: clearSelection -> resetSelection
import { showToast } from '../features/toast.js';
import { renderActiveTable, getPaginationState } from '../components/table.js';
import { performEntityMerge } from '../api/googleSheetService.js';

let activeMergeData = {
    entityType: null,
    data: [],
    idField: null
};

export function initMergeAction() {
    document.getElementById('mergeBtn')?.addEventListener('click', handleMergeClick);
    document.body.addEventListener('click', async (event) => {
        if (event.target.id === 'confirm-merge-btn') {
            const masterId = document.querySelector('input[name="master-record"]:checked')?.value;
            if (!masterId) {
                showToast("Будь ласка, оберіть головний запис.", "error");
                return;
            }
            const { entityType, data, idField } = activeMergeData;
            const idsToMerge = data.map(item => item[idField]).filter(id => id !== masterId);
            
            await executeMerge(entityType, masterId, idsToMerge, event.target);
        }
    });
}

async function handleMergeClick() {
    const entityType = document.querySelector('.tab-content.active')?.id;
    if(!entityType) return;
    
    const selectedIds = Array.from(getSelectedIds(entityType));
    
    if (selectedIds.length < 2) {
        showToast("Для об'єднання потрібно вибрати щонайменше два елементи.", 'info');
        return;
    }

    const sourceData = getPaginationState(entityType)?.sourceData || [];
    const idField = ENTITY_CONFIGS[entityType].idField;
    const selectedData = sourceData.filter(item => selectedIds.includes(item[idField]));

    if (selectedData.length !== selectedIds.length) {
        showToast("Не вдалося знайти всі вибрані дані.", "error");
        return;
    }
    
    activeMergeData = { entityType, data: selectedData, idField };
    await showMergeModal(entityType, selectedData);
}

async function showMergeModal(entityType, data) {
    const response = await fetch('modals/merge-confirmation-modal.html');
    const html = await response.text();
    document.getElementById('modal-placeholder').innerHTML = html;

    const listContainer = document.getElementById('merge-options-list');
    const nameField = entityType === 'brands' ? 'name' : 'name_uk';
    
    listContainer.innerHTML = data.map((item, index) => `
        <li>
            <input type="radio" id="master_${item[activeMergeData.idField]}" name="master-record" value="${item[activeMergeData.idField]}" ${index === 0 ? 'checked' : ''}>
            <label for="master_${item[activeMergeData.idField]}">${item[nameField]} (ID: ${item[activeMergeData.idField]})</label>
        </li>
    `).join('');

    const modal = document.querySelector('#modal-placeholder .modal-overlay');
    const closeModal = () => document.getElementById('modal-placeholder').innerHTML = '';
    
    modal.querySelector('.modal-close-btn').addEventListener('click', closeModal);
    modal.querySelector('#cancel-merge-btn').addEventListener('click', closeModal);
}

async function executeMerge(entityType, masterId, idsToMerge, button) {
    button.disabled = true;
    button.textContent = 'Об\'єднання...';

    try {
        await performEntityMerge(entityType, masterId, idsToMerge);
        showToast("Об'єднання успішно завершено!", "success");
        
        document.getElementById('modal-placeholder').innerHTML = '';
        
        const table = document.querySelector(`#${entityType} .pseudo-table`);
        if(table) resetSelection(table);

        await renderActiveTable(true);

    } catch(error) {
        showToast(`Помилка об'єднання: ${error.message}`, 'error');
        button.disabled = false;
        button.textContent = 'Підтвердити';
    }
}