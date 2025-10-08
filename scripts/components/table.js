/**
 * scripts/components/table.js
 * * Уніфікована логіка для рендерингу, сортування та пагінації всіх таблиць.
 */
import { getCategories, getCharacteristics, getOptions, getBrands, ENTITY_CONFIGS } from '../api/googleSheetService.js';
import { loadAndShowModal } from './modalManager.js';
import { showToast } from '../features/toast.js';
import { updatePaginationUI } from '../features/pagination.js';
import { updateSortUI } from '../features/sorting.js';

// Глобальний стан для кожної сутності
const state = {};

function initializeState() {
    for (const entityType in ENTITY_CONFIGS) {
        state[entityType] = {
            sourceData: [],
            filteredData: [],
            currentPage: 1,
            pageSize: 25,
            sortKey: ENTITY_CONFIGS[entityType].idField,
            sortOrder: 'asc',
            selectedIds: new Set(),
        };
    }
}

export const getPaginationState = (entityType) => state[entityType];
export const updatePaginationState = (entityType, newState) => {
    if (state[entityType]) {
        state[entityType] = { ...state[entityType], ...newState };
    }
};
export const setFilteredData = (entityType, data) => {
    if (state[entityType]) {
        state[entityType].filteredData = data;
        state[entityType].currentPage = 1; // Завжди скидаємо на першу сторінку при фільтрації
    }
};

// --- Ініціалізація та обробники подій ---

export function initTableInteractions() {
    initializeState();
    document.addEventListener('dataChanged', handleDataChange);
    document.querySelector('.tabs-container')?.addEventListener('click', handleTableClick);
}

async function handleDataChange(event) {
    const { entityType } = event.detail;
    // Якщо прийшла подія, перемальовуємо відповідну таблицю з примусовим оновленням
    await renderTable(entityType, true);
}

async function handleTableClick(event) {
    const editButton = event.target.closest('.btn-edit');
    if (!editButton) return;

    const entityType = editButton.closest('.tab-content')?.id;
    const entityId = editButton.dataset.id;
    if (!entityType || !entityId) return;

    loadAndShowModal(`${entityType}-form`, { id: entityId });
}

// --- Основна логіка рендерингу ---

export async function renderActiveTable(forceReload = false) {
    const activeTab = document.querySelector('.tab-content.active');
    if (activeTab) {
        await renderTable(activeTab.id, forceReload);
    }
}

export function clearActiveTable() {
    const activeTab = document.querySelector('.tab-content.active');
    if (!activeTab) return;
    const tableBody = activeTab.querySelector('.pseudo-table-body');
    if(tableBody) tableBody.innerHTML = '<p>Будь ласка, авторизуйтесь для доступу до даних.</p>';
    updateCounters(activeTab.id, 0, 0);
}

async function renderTable(entityType, forceReload = false) {
    const tableBody = document.querySelector(`#${entityType} .pseudo-table-body`);
    if (!tableBody) return;

    try {
        // 1. Завантаження та обробка даних
        if (forceReload || state[entityType].sourceData.length === 0) {
            tableBody.innerHTML = '<p>Завантаження...</p>';
            const rawData = await fetchDataFor(entityType);
            const processedData = processDataFor(entityType, rawData);
            updatePaginationState(entityType, { sourceData: processedData, filteredData: processedData });
        }

        // 2. Сортування та пагінація
        let { filteredData, currentPage, pageSize, sortKey, sortOrder } = getPaginationState(entityType);

        if (sortKey) {
            filteredData.sort((a, b) => {
                const valA = a[sortKey] ?? '';
                const valB = b[sortKey] ?? '';
                const comparison = String(valA).localeCompare(String(valB), undefined, { numeric: true });
                return sortOrder === 'asc' ? comparison : -comparison;
            });
        }

        const startIndex = (currentPage - 1) * pageSize;
        const pageData = filteredData.slice(startIndex, startIndex + pageSize);

        // 3. Рендеринг HTML
        tableBody.innerHTML = pageData.length > 0 
            ? pageData.map(item => getRowHtml(entityType, item)).join('') 
            : '<p>Немає даних для відображення.</p>';

        // 4. Оновлення UI елементів
        updateCounters(entityType, pageData.length, filteredData.length);
        updatePaginationUI(entityType, filteredData.length);
        updateSortUI(entityType);

    } catch (error) {
        console.error(`Помилка рендерингу ${entityType}:`, error);
        tableBody.innerHTML = `<p style="color: red;">Помилка: ${error.message}</p>`;
        showToast(`Не вдалося завантажити ${entityType}.`, 'error');
    }
}

// --- Допоміжні функції для завантаження та обробки ---

async function fetchDataFor(entityType) {
    switch (entityType) {
        case 'categories':
            return await Promise.all([getCategories(true), getCharacteristics(true)]);
        case 'characteristics':
            return await Promise.all([getCharacteristics(true), getCategories(true), getOptions(true)]);
        case 'options':
            return await Promise.all([getOptions(true), getCharacteristics(true), getCategories(true)]);
        case 'brands':
            return await getBrands(true);
        default:
            return [];
    }
}

function processDataFor(entityType, rawData) {
    // Обробка даних для кожної сутності (додавання розрахункових полів)
    if (entityType === 'categories') {
        const [categories, characteristics] = rawData;
        const categoryMap = new Map(categories.map(c => [c.local_id, { ...c, level: 0, charCount: 0 }]));
        // Розрахунок рівня вкладеності
        categoryMap.forEach(cat => {
            let level = 0; let current = cat;
            while(current.parent_local_id && categoryMap.has(current.parent_local_id)) {
                current = categoryMap.get(current.parent_local_id);
                level++;
            }
            cat.level = level;
        });
        // Розрахунок кількості характеристик
        const globalCharCount = characteristics.filter(c => c.is_global === 'TRUE').length;
        characteristics.forEach(char => {
            if (char.is_global !== 'TRUE') {
                (char.category_local_ids || '').split(',').forEach(id => {
                    const cat = categoryMap.get(id.trim());
                    if (cat) cat.charCount++;
                });
            }
        });
        categoryMap.forEach(cat => cat.charCount += globalCharCount);
        return Array.from(categoryMap.values());
    }
    
    if (entityType === 'characteristics') {
        const [characteristics, categories, options] = rawData;
        const categoryMap = new Map(categories.map(c => [c.local_id, c.name_uk]));
        const optionCountMap = options.reduce((map, opt) => {
            map.set(opt.char_local_id, (map.get(opt.char_local_id) || 0) + 1);
            return map;
        }, new Map());
        return characteristics.map(char => ({
            ...char,
            optionCount: optionCountMap.get(char.local_id) || 0,
            linkedCategoryNames: (char.category_local_ids || '').split(',').map(id => categoryMap.get(id.trim())).filter(Boolean).join(', ')
        }));
    }
    
     if (entityType === 'options') {
        const [options, characteristics, categories] = rawData;
        const charMap = new Map(characteristics.map(c => [c.local_id, c]));
        const categoryMap = new Map(categories.map(c => [c.local_id, c.name_uk]));
        return options.map(opt => {
            const parentChar = charMap.get(opt.char_local_id);
            let categoryNames = '—';
            if (parentChar && parentChar.is_global !== 'TRUE') {
                categoryNames = (parentChar.category_local_ids || '').split(',').map(id => categoryMap.get(id.trim())).filter(Boolean).join(', ');
            } else if (parentChar) {
                categoryNames = 'Глобальна';
            }
            return {
                ...opt,
                parentCharacteristicName: parentChar ? parentChar.name_uk : 'Невідомо',
                parentCharacteristicCategoryNames: categoryNames,
            };
        });
    }

    return rawData; // Для 'brands' та інших простих сутностей
}

// --- Допоміжні функції для HTML та UI ---

function getRowHtml(entityType, item) {
    const idField = ENTITY_CONFIGS[entityType].idField;
    const isChecked = state[entityType].selectedIds.has(item[idField]);
    const checkbox = `<input type="checkbox" class="row-checkbox" data-id="${item[idField]}" ${isChecked ? 'checked' : ''}>`;
    const editBtn = `<button class="btn-edit" data-id="${item[idField]}" title="Редагувати">✎</button>`;
    const actions = `<div class="pseudo-table-cell cell-actions">${checkbox}${editBtn}</div>`;

    let cells = '';
    switch (entityType) {
        case 'categories':
            cells = `
                <div class="pseudo-table-cell cell-id">${item.local_id}</div>
                <div class="pseudo-table-cell cell-level">${item.level}</div>
                <div class="pseudo-table-cell cell-main-name" data-tooltip="${item.name_uk}">${item.name_uk}</div>
                <div class="pseudo-table-cell">${item.parent_local_id || '—'}</div>
                <div class="pseudo-table-cell">${item.category_type}</div>
                <div class="pseudo-table-cell cell-count">${item.charCount}</div>
            `;
            break;
        case 'characteristics':
            cells = `
                <div class="pseudo-table-cell cell-id">${item.local_id}</div>
                <div class="pseudo-table-cell cell-main-name" data-tooltip="${item.name_uk}">${item.name_uk}</div>
                <div class="pseudo-table-cell" data-tooltip="${item.linkedCategoryNames}">${item.linkedCategoryNames || 'Глобальна'}</div>
                <div class="pseudo-table-cell">${item.is_global === 'TRUE' ? 'Так' : 'Ні'}</div>
                <div class="pseudo-table-cell cell-count">${item.optionCount}</div>
            `;
            break;
        case 'options':
             cells = `
                <div class="pseudo-table-cell cell-id">${item.local_id}</div>
                <div class="pseudo-table-cell cell-main-name" data-tooltip="${item.name_uk}">${item.name_uk}</div>
                <div class="pseudo-table-cell" data-tooltip="${item.parentCharacteristicName}">${item.parentCharacteristicName}</div>
                <div class="pseudo-table-cell" data-tooltip="${item.parentCharacteristicCategoryNames}">${item.parentCharacteristicCategoryNames}</div>
            `;
            break;
        case 'brands':
            cells = `
                <div class="pseudo-table-cell cell-id">${item.local_id}</div>
                <div class="pseudo-table-cell cell-main-name" data-tooltip="${item.name}">${item.name}</div>
            `;
            break;
    }
    return `<div class="pseudo-table-row" data-id="${item[idField]}">${actions}${cells}</div>`;
}

function updateCounters(entityType, pageCount, totalFiltered) {
    const pageCounter = document.getElementById(`${entityType}-counter-page`);
    const allCounter = document.getElementById(`${entityType}-counter-all`);
    if(pageCounter) pageCounter.textContent = pageCount;
    if(allCounter) allCounter.textContent = totalFiltered;
}