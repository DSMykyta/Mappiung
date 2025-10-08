// scripts/actions/selection.js (ПОВНА ОНОВЛЕНА ВЕРСІЯ)

import { getPaginationState } from '../components/table.js';

// (НОВЕ) Функції для доступу до стану виділення
export function getSelectedIds(entityType) {
    const state = getPaginationState(entityType);
    return state ? state.selectedIds : new Set();
}

export function isSelected(entityType, id) {
    const selectedIds = getSelectedIds(entityType);
    return selectedIds.has(id);
}

function toggleSelection(entityType, id) {
    const selectedIds = getSelectedIds(entityType);
    if (selectedIds.has(id)) {
        selectedIds.delete(id);
    } else {
        selectedIds.add(id);
    }
}

function selectAllVisible(entityType, table, shouldSelect) {
    const selectedIds = getSelectedIds(entityType);
    const visibleCheckboxes = table.querySelectorAll('.pseudo-table-row:not([style*="display: none"]) .row-checkbox, .pseudo-table-row-inner:not([style*="display: none"]) .row-checkbox');

    visibleCheckboxes.forEach(checkbox => {
        const id = checkbox.dataset.id;
        if (shouldSelect) {
            selectedIds.add(id);
        } else {
            selectedIds.delete(id);
        }
        checkbox.checked = shouldSelect;
    });
}

// scripts/actions/selection.js
export function initSelection() {
  const rootElement = document.body;

  rootElement.addEventListener('change', (event) => {
    const target = event.target;
    const table = target.closest('.pseudo-table');
    if (!table) return;

    // ВАЖЛИВО: універсальне визначення типу сутності
    let entityType = target.closest('.tab-content')?.id;
    if (!entityType) entityType = table.dataset.entityType;  // <— цей фолбек обов’язковий

    if (!entityType) return;

    if (target.classList.contains('header-select-all')) {
      selectAllVisible(entityType, table, target.checked);
      updateActionButtonsState(table);
    }

    const rowCheckbox = target.closest('.row-checkbox');
    if (rowCheckbox) {
      const id = rowCheckbox.dataset.id;
      const tableBody = rowCheckbox.closest('.pseudo-table-body');
      if (tableBody && id) {
        toggleSelection(entityType, id);
        updateSelectAllState(tableBody);
        updateActionButtonsState(table);
      }
    }
  });
}

/**
 * Обробляє клік на чекбокс "вибрати все", працює з обома типами таблиць.
 */
function handleSelectAll(headerCheckbox) {
    const table = headerCheckbox.closest('.pseudo-table');
    if (!table) return;

    // Шукаємо рядки обох типів: і в основній таблиці, і в бічній панелі
    const allRows = table.querySelectorAll('.pseudo-table-row, .pseudo-table-row-inner');
    const visibleRows = Array.from(allRows).filter(row => row.style.display !== 'none');

    visibleRows.forEach(row => {
        const checkbox = row.querySelector('.row-checkbox');
        if (checkbox) {
            checkbox.checked = headerCheckbox.checked;
        }
    });
}

/**
 * (ОНОВЛЕНО) Оновлює стан головного чекбоксу, працює з обома типами таблиць.
 */
export function updateSelectAllState(tableBody) {
    if (!tableBody) return;
    const table = tableBody.closest('.pseudo-table');
    const headerCheckbox = table.querySelector('.header-select-all');
    if (!headerCheckbox) return;

    // Шукаємо чекбокси в рядках обох типів
    const allCheckboxes = table.querySelectorAll('.pseudo-table-row .row-checkbox, .pseudo-table-row-inner .row-checkbox');
    const visibleCheckboxes = Array.from(allCheckboxes).filter(cb => cb.closest('.pseudo-table-row, .pseudo-table-row-inner').style.display !== 'none');

    const checkedVisibleCheckboxes = visibleCheckboxes.filter(cb => cb.checked);

    if (visibleCheckboxes.length > 0 && visibleCheckboxes.length === checkedVisibleCheckboxes.length) {
        headerCheckbox.checked = true;
        headerCheckbox.indeterminate = false;
    } else if (checkedVisibleCheckboxes.length > 0) {
        headerCheckbox.checked = false;
        headerCheckbox.indeterminate = true;
    } else {
        headerCheckbox.checked = false;
        headerCheckbox.indeterminate = false;
    }
}

export function resetSelection(tableElement) {
    if (!tableElement) return;
    const headerCheckbox = tableElement.querySelector('.header-select-all');
    if (headerCheckbox) {
        headerCheckbox.checked = false;
        headerCheckbox.indeterminate = false;
    }
}

/**
 * (НОВА ФУНКЦІЯ)
 * Оновлює стан кнопок дій (напр. "Видалити") на основі кількості виділених рядків.
 * @param {HTMLElement} tableContext - Елемент таблиці або її тіло.
 */
function updateActionButtonsState(tableContext) {
    if (!tableContext) return;

    const checkedCount = tableContext.querySelectorAll('.row-checkbox:checked').length;
    
    // Визначаємо, де шукати кнопки
    const sidePanel = tableContext.closest('.related-section');
    let deleteButton, mergeButton;

    if (sidePanel) {
        deleteButton = sidePanel.querySelector('.btn-delete');
        mergeButton = sidePanel.querySelector('.btn-merge'); // Шукаємо і в панелі
    } else {
        deleteButton = document.querySelector('footer .btn-delete');
        mergeButton = document.querySelector('footer #mergeBtn'); // Шукаємо в футері
    }

    if (deleteButton) {
        deleteButton.disabled = (checkedCount === 0);
    }
    
    // Оновлюємо стан кнопки "Об'єднати"
    if (mergeButton) {
        mergeButton.disabled = (checkedCount < 2);
    }
}