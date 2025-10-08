// scripts/features/sorting.js (ПОВНА ВИПРАВЛЕНА ВЕРСІЯ)

import { getPaginationState, updatePaginationState, renderActiveTable } from '../components/table.js';

export function initSorting() {
    document.body.addEventListener('click', handleSortClick);
}

async function handleSortClick(event) {
    const headerCell = event.target.closest('.sortable-header');
    if (!headerCell) return;

    const modalContext = headerCell.closest('.modal-overlay');
    const tabContext = headerCell.closest('.tab-content');
    if (!tabContext && !modalContext) return;

    const entityType = tabContext ? tabContext.id : 'categories'; 
    const sortKey = headerCell.dataset.sortKey;

    const state = getPaginationState(entityType);
    if (!state) return;
    
    let newSortOrder;

    if (state.sortKey === sortKey) {
        newSortOrder = state.sortOrder === 'asc' ? 'desc' : 'asc';
    } else {
        newSortOrder = 'asc';
    }

    updatePaginationState(entityType, { sortKey: sortKey, sortOrder: newSortOrder });

    if (modalContext) {
        // У модалці відправляємо легку подію для сортування на місці, не зачіпаючи вікно
        document.dispatchEvent(new CustomEvent('sidePanelSortChanged', {
            detail: { entityType }
        }));
    } else {
        // На основній сторінці просто перерендеримо активну таблицю
        renderActiveTable();
    }
}

export function updateSortUI(entityType) {
    const state = getPaginationState(entityType);
    if (!state) return;
    
    const containers = document.querySelectorAll(`#${entityType}, #children-panel, #characteristics-panel`);

    containers.forEach(container => {
        if (!container) return;

        container.querySelectorAll('.sort-indicator').forEach(indicator => {
            indicator.className = 'sort-indicator';
        });

        if (state.sortKey) {
            const activeHeader = container.querySelector(`[data-sort-key="${state.sortKey}"]`);
            if (activeHeader) {
                const indicator = activeHeader.querySelector('.sort-indicator');
                if (indicator) {
                    indicator.classList.add(state.sortOrder === 'asc' ? 'sort-asc' : 'sort-desc');
                }
            }
        }
    });
}