// scripts/components/table.js (ПОВНА УНІФІКОВАНА ВЕРСІЯ)

import { getCategories, getCharacteristics, getOptions, getCategoryById, getCharacteristicById, getOptionById } from '../api/googleSheetService.js';
import { loadAndShowModal } from './modal.js';
import { showToast } from '../features/toast.js';
import { updatePaginationUI } from '../features/pagination.js';
import { updateSortUI } from '../features/sorting.js';
import { getSelectedIds, isSelected } from '../actions/selection.js';

let state = {
    categories: {
        sourceData: [], filteredData: [], currentPage: 1, pageSize: 10,
        sortKey: 'local_id', sortOrder: 'asc', selectedIds: new Set(),
    },
    characteristics: {
        sourceData: [], filteredData: [], currentPage: 1, pageSize: 10,
        sortKey: 'local_id', sortOrder: 'asc', selectedIds: new Set(),
    },
    options: {
        sourceData: [], filteredData: [], currentPage: 1, pageSize: 10,
        sortKey: 'local_id', sortOrder: 'asc', selectedIds: new Set(),
    }
};

export const getPaginationState = (entityType) => state[entityType];
export const updatePaginationState = (entityType, newState) => {
    if (state[entityType]) {
        state[entityType] = { ...state[entityType], ...newState };
    }
};
export const setFilteredData = (entityType, data) => {
    if (state[entityType]) {
        state[entityType].filteredData = data;
        state[entityType].currentPage = 1;
    }
};

/**
 * (НОВА ФУНКЦІЯ) Очищує активну таблицю, наприклад, при виході з системи.
 */
export function clearActiveTable() {
    const activeTab = document.querySelector('.tab-content.active');
    if (!activeTab) return;
    const tableBody = activeTab.querySelector('.pseudo-table-body');
    if (tableBody) {
        tableBody.innerHTML = '<p style="padding: 16px;">Для роботи з даними необхідно авторизуватися.</p>';
    }
    updateCounters(activeTab.id, 0, 0);
}

// ... (CORE LOGIC & EVENT HANDLERS без змін) ...
export function renderActiveTable() {
    const activeTab = document.querySelector('.tab-content.active');
    if (!activeTab) return;
    switch (activeTab.id) {
        case 'categories': renderCategoriesTable(false); break;
        case 'characteristics': renderCharacteristicsTable(false); break;
        case 'options': renderOptionsTable(false); break;
    }
}
function dispatchRenderComplete(entityType) {
    const event = new CustomEvent('renderComplete', { detail: { entityType } });
    document.dispatchEvent(event);
}
function updateCounters(entityType, pageCount, totalCount) {
    const pageCounterEl = document.getElementById(`${entityType}-counter-page`);
    const totalCounterEl = document.getElementById(`${entityType}-counter-all`);
    if (pageCounterEl) pageCounterEl.textContent = pageCount;
    if (totalCounterEl) totalCounterEl.textContent = (totalCount !== undefined) ? totalCount : state[entityType]?.filteredData?.length || 0;
}
export function initTableInteractions() {
    document.addEventListener('dataChanged', handleDataChange);
    document.querySelector('.tabs-container')?.addEventListener('click', handleTableClick);
}
async function handleDataChange(event) {
    const { entityType } = event.detail;
    switch (entityType) {
        case 'categories': await renderCategoriesTable(true); break;
        case 'characteristics': await renderCharacteristicsTable(true); break;
        case 'options': await renderOptionsTable(true); break;
    }
}
async function handleTableClick(event) {
    const editButton = event.target.closest('.btn-edit');
    if (!editButton) return;
    const tabId = editButton.closest('.tab-content')?.id;
    const entityId = editButton.dataset.id;
    if (!tabId || !entityId) return;
    editButton.disabled = true;
    try {
        let data, modalName;
        switch (tabId) {
            case 'categories':
                data = await getCategoryById(entityId);
                modalName = 'category-form';
                break;
            case 'characteristics':
                data = await getCharacteristicById(entityId);
                modalName = 'characteristic-form';
                break;
            case 'options':
                data = await getOptionById(entityId);
                modalName = 'option-form';
                break;
        }
        if (data && modalName) {
            await loadAndShowModal(modalName, data);
        } else {
            showToast("Дані не знайдено або невідомий тип вкладки.", 'error');
        }
    } catch (error) {
        console.error("Помилка завантаження даних для редагування:", error);
        showToast("Помилка завантаження даних.", 'error');
    } finally {
        if (document.body.contains(editButton)) {
           editButton.disabled = false;
        }
    }
}


// ========================================================================
// === RENDER FUNCTIONS (Функції рендерингу) ===
// ========================================================================

export async function renderCategoriesTable(forceReload = false) {
    const entityType = 'categories';
    const tableBody = document.querySelector(`#${entityType} .pseudo-table-body`);
    if (!tableBody) return;

    try {
        if (forceReload || state[entityType].sourceData.length === 0) {
            tableBody.innerHTML = '<p style="padding: 16px;">Завантаження...</p>';
            // (ВИПРАВЛЕНО) Одночасно завантажуємо і категорії, і характеристики для підрахунку
            const [categoriesData, characteristicsData] = await Promise.all([
                getCategories(),
                getCharacteristics()
            ]);
            const processedData = processCategoriesData(categoriesData, characteristicsData);
            updatePaginationState(entityType, { sourceData: processedData, filteredData: processedData });
        }
        // ... (решта логіки рендерингу без змін) ...
        const currentState = getPaginationState(entityType);
        let { filteredData, currentPage, pageSize, sortKey, sortOrder } = currentState;
        if (sortKey) {
            filteredData = [...filteredData].sort((a, b) => {
                const valA = a[sortKey] === undefined ? '' : a[sortKey];
                const valB = b[sortKey] === undefined ? '' : b[sortKey];
                if (typeof valA === 'number' && typeof valB === 'number') {
                    return sortOrder === 'asc' ? valA - valB : valB - valA;
                }
                return sortOrder === 'asc' ? String(valA).localeCompare(String(valB)) : String(valB).localeCompare(String(valA));
            });
        }
        const startIndex = (currentPage - 1) * pageSize;
        const endIndex = startIndex + pageSize;
        const pageData = filteredData.slice(startIndex, endIndex);
        if (pageData.length === 0) {
            tableBody.innerHTML = filteredData.length > 0 ? `<p style="padding: 16px;">Немає результатів на цій сторінці.</p>` : `<p style="padding: 16px;">Дані відсутні.</p>`;
        } else {
            tableBody.innerHTML = pageData.map(category => {
                const isChecked = isSelected('categories', category.local_id); // (ОНОВЛЕНО)
                const nameDisplay = category.name_uk || 'Без назви';
                const charCount = category.charCount || 0;
                 return `
                    <div class="pseudo-table-row" data-id="${category.local_id}">
                        <div class="pseudo-table-cell cell-actions">
                            <input type="checkbox" class="row-checkbox" data-id="${category.local_id}" ${isChecked ? 'checked' : ''}>
                            <button class="btn-edit" data-id="${category.local_id}" title="Редагувати">✎</button>
                        </div>

                        <div class="pseudo-table-cell cell-id" data-tooltip="${category.local_id}">${category.local_id}</div>
                        <div class="pseudo-table-cell cell-level">${category.level || 0}</div>
                        <div class="pseudo-table-cell" data-tooltip="${nameDisplay}">${nameDisplay}</div>
                        <div class="pseudo-table-cell" data-tooltip="${category.etalon_name}">${category.etalon_name || '—'}</div>
                        <div class="pseudo-table-cell" data-tooltip="${category.rztk_name}">${category.rztk_name || '—'}</div>
                        <div class="pseudo-table-cell" data-tooltip="${category.epicenter_name}">${category.epicenter_name || '—'}</div>
                        <div class="pseudo-table-cell" data-tooltip="${category.allo_name}">${category.allo_name || '—'}</div>
                        <div class="pseudo-table-cell" data-tooltip="${category.fua_name}">${category.fua_name || '—'}</div>
                        <div class="pseudo-table-cell" data-tooltip="${category.maudau_name}">${category.maudau_name || '—'}</div>
                        <div class="pseudo-table-cell cell-count">${charCount}</div>
                    </div>
                `;
            }).join('');
        }
        updateCounters(entityType, pageData.length, filteredData.length);
        updatePaginationUI(entityType, filteredData.length);
        updateSortUI(entityType);
    } catch (error) {
        console.error(`Помилка рендерингу ${entityType}:`, error);
        tableBody.innerHTML = `<p style="padding: 16px; color: red;">Помилка: ${error.message}</p>`;
    } finally {
        dispatchRenderComplete(entityType);
    }
}
// ... (renderCharacteristicsTable, renderOptionsTable без змін) ...
export async function renderCharacteristicsTable(forceReload = false) {
    const entityType = 'characteristics';
    const tableBody = document.querySelector(`#${entityType} .pseudo-table-body`);
    if (!tableBody) return;
    try {
        if (forceReload || state[entityType].sourceData.length === 0) {
            tableBody.innerHTML = '<p style="padding: 16px;">Завантаження...</p>';
            // 1. ЗАВАНТАЖУЄМО ОПЦІЇ РАЗОМ З ІНШИМИ ДАНИМИ
            const [charData, catData, optData] = await Promise.all([
                getCharacteristics(), 
                getCategories(),
                getOptions() // Додано завантаження опцій
            ]);
            // 2. СТВОРЮЄМО МАПУ ДЛЯ ШВИДКОГО ПІДРАХУНКУ ОПЦІЙ
            const optionCountMap = new Map();
            optData.forEach(opt => {
                const charId = opt.char_local_id;
                if (charId) {
                    optionCountMap.set(charId, (optionCountMap.get(charId) || 0) + 1);
                }
            });

            const categoryMap = new Map(catData.map(cat => [cat.local_id, cat.name_uk]));
            // 3. ДОДАЄМО КІЛЬКІСТЬ ОПЦІЙ (`optionCount`) ДО КОЖНОГО ОБ'ЄКТА ХАРАКТЕРИСТИКИ
            const processedData = charData.map(char => ({
                ...char,
                linkedCategoryNames: (char.category_local_ids || '')
                    .split(',')
                    .map(id => categoryMap.get(id.trim()))
                    .filter(Boolean)
                    .join(', '),
                optionCount: optionCountMap.get(char.local_id) || 0 // Додаємо нову властивість
            }));
            updatePaginationState(entityType, { sourceData: processedData, filteredData: processedData });
        }
        const currentState = getPaginationState(entityType);
        let { filteredData, currentPage, pageSize, sortKey, sortOrder } = currentState;
        if (sortKey) {
            filteredData = [...filteredData].sort((a, b) => {
                const valA = a[sortKey] === undefined ? '' : a[sortKey];
                const valB = b[sortKey] === undefined ? '' : b[sortKey];
                if (typeof valA === 'number' && typeof valB === 'number') {
                    return sortOrder === 'asc' ? valA - valB : valB - valA;
                }
                return sortOrder === 'asc' ? String(valA).localeCompare(String(valB)) : String(valB).localeCompare(String(valA));
            });
        }
        const startIndex = (currentPage - 1) * pageSize;
        const endIndex = startIndex + pageSize;
        const pageData = filteredData.slice(startIndex, endIndex);
        if (pageData.length === 0) {
            tableBody.innerHTML = filteredData.length > 0 ? `<p style="padding: 16px;">Немає результатів на цій сторінці.</p>` : `<p style="padding: 16px;">Дані відсутні.</p>`;
        } else {
            tableBody.innerHTML = pageData.map(char => {
                const isChecked = isSelected('characteristics', char.local_id);
                return `
                    <div class="pseudo-table-row" data-id="${char.local_id}">
                        <div class="pseudo-table-cell cell-actions">
                            <input type="checkbox" class="row-checkbox" data-id="${char.local_id}" ${isChecked ? 'checked' : ''}>
                            <button class="btn-edit" data-id="${char.local_id}" title="Редагувати">✎</button>
                        </div>
                        <div class="pseudo-table-cell cell-id" data-tooltip="${char.local_id}">${char.local_id}</div>
                        <div class="pseudo-table-cell cell-linked-cats" data-tooltip="${char.linkedCategoryNames}">${char.linkedCategoryNames || 'Глобальна'}</div>
                        <div class="pseudo-table-cell" data-tooltip="${char.name_uk}">${char.name_uk || '—'}</div>
                        <div class="pseudo-table-cell" data-tooltip="${char.etalon_name}">${char.etalon_name || '—'}</div>
                        <div class="pseudo-table-cell" data-tooltip="${char.rztk_name}">${char.rztk_name || '—'}</div>
                        <div class="pseudo-table-cell cell-bool">${char.is_global === 'TRUE' ? 'Так' : 'Ні'}</div>
                        <div class="pseudo-table-cell cell-count">${char.optionCount}</div>
                    </div>
                `;
            }).join('');
        }
        updateCounters(entityType, pageData.length, filteredData.length);
        updatePaginationUI(entityType, filteredData.length);
        updateSortUI(entityType);
    } catch (error) {
        console.error(`Помилка рендерингу ${entityType}:`, error);
        tableBody.innerHTML = `<p style="padding: 16px; color: red;">Помилка: ${error.message}</p>`;
    } finally {
        dispatchRenderComplete(entityType);
    }
}

export async function renderOptionsTable(forceReload = false) {
    const entityType = 'options';
    const tableBody = document.querySelector(`#${entityType} .pseudo-table-body`);
    if (!tableBody) return;

    try {
        if (forceReload || state[entityType].sourceData.length === 0) {
            tableBody.innerHTML = '<p style="padding: 16px;">Завантаження...</p>';
            const [optData, charData, catData] = await Promise.all([getOptions(), getCharacteristics(), getCategories()]);
            const categoryMap = new Map(catData.map(cat => [cat.local_id, cat.name_uk]));
            
            // Тепер charMap зберігає ВЕСЬ об'єкт характеристики, а не тільки ім'я
            const charMap = new Map(charData.map(char => [char.local_id, char]));

            const processedData = optData.map(opt => {
                const parentChar = charMap.get(opt.char_local_id);
                let categoryNames = '—';

                // Якщо батьківська характеристика знайдена і вона не глобальна
                if (parentChar && parentChar.is_global !== 'TRUE' && parentChar.category_local_ids) {
                    categoryNames = parentChar.category_local_ids
                        .split(',')
                        .map(id => categoryMap.get(id.trim()))
                        .filter(Boolean) // Видаляємо порожні значення
                        .join(', ');
                } else if (parentChar && parentChar.is_global === 'TRUE') {
                    categoryNames = 'Глобальна';
                }

                return {
                    ...opt,
                    parentCharacteristicName: parentChar ? parentChar.name_uk : 'Невідомо',
                    parentCharacteristicCategoryNames: categoryNames
                };
            });
            updatePaginationState(entityType, { sourceData: processedData, filteredData: processedData });
        }

        const currentState = getPaginationState(entityType);
        let { filteredData, currentPage, pageSize, sortKey, sortOrder } = currentState;
        
        if (sortKey) {
             filteredData = [...filteredData].sort((a,b) => {
                const valA = a[sortKey] === undefined ? '' : a[sortKey];
                const valB = b[sortKey] === undefined ? '' : b[sortKey];
                if (typeof valA === 'number' && typeof valB === 'number') {
                    return sortOrder === 'asc' ? valA - valB : valB - valA;
                }
                return sortOrder === 'asc' ? String(valA).localeCompare(String(valB)) : String(valB).localeCompare(String(valA));
             }); 
        }

        const startIndex = (currentPage - 1) * pageSize;
        const endIndex = startIndex + pageSize;
        const pageData = filteredData.slice(startIndex, endIndex);

        if (pageData.length === 0) {
            tableBody.innerHTML = filteredData.length > 0 ? `<p style="padding: 16px;">Немає результатів на цій сторінці.</p>` : `<p style="padding: 16px;">Дані відсутні.</p>`;
        } else {
                        tableBody.innerHTML = pageData.map(opt => {
                const isChecked = isSelected('options', opt.local_id);
                return `
                <div class="pseudo-table-row" data-id="${opt.local_id}">
                    <div class="pseudo-table-cell cell-actions">
                        <input type="checkbox" class="row-checkbox" data-id="${opt.local_id}" ${isChecked ? 'checked' : ''}>
                        <button class="btn-edit" data-id="${opt.local_id}" title="Редагувати">✎</button>
                    </div>
                    <div class="pseudo-table-cell cell-id" data-tooltip="${opt.local_id}">${opt.local_id}</div>

                    <div class="pseudo-table-cell cell-linked-cats" data-tooltip="${opt.parentCharacteristicCategoryNames}">${opt.parentCharacteristicCategoryNames || '—'}</div>
                    <div class="pseudo-table-cell" data-tooltip="${opt.parentCharacteristicName}">${opt.parentCharacteristicName}</div>

                    <div class="pseudo-table-cell" data-tooltip="${opt.name_uk}">${opt.name_uk || '—'}</div>                    
                    <div class="pseudo-table-cell" data-tooltip="${opt.etalon_name}">${opt.etalon_name || '—'}</div>
                    <div class="pseudo-table-cell" data-tooltip="${opt.rztk_name}">${opt.rztk_name || '—'}</div>

                    
                </div>
            `;
            }).join('');
        }
        
        updateCounters(entityType, pageData.length, filteredData.length);
        updatePaginationUI(entityType, filteredData.length);
        updateSortUI(entityType);

    } catch (error) { 
        console.error(`Помилка рендерингу ${entityType}:`, error);
        tableBody.innerHTML = `<p style="padding: 16px; color: red;">Помилка: ${error.message}</p>`;
    } finally { 
        dispatchRenderComplete(entityType); 
    }
}


// ========================================================================
// === HELPER FUNCTIONS (Допоміжні функції) ===
// ========================================================================

/**
 * (ВИПРАВЛЕНО) Обробляє дані категорій, обчислюючи рівень вкладеності та
 * коректну кількість прив'язаних характеристик.
 */
function processCategoriesData(categoriesData, characteristicsData) {
    const categoryMap = new Map();
    const charCountMap = new Map();

    // Ініціалізуємо лічильники
    categoriesData.forEach(cat => {
        charCountMap.set(cat.local_id, 0);
    });

    // Рахуємо глобальні та специфічні характеристики
    const globalCharCount = characteristicsData.filter(char => char.is_global === 'TRUE').length;
    characteristicsData.forEach(char => {
        if (char.is_global !== 'TRUE' && char.category_local_ids) {
            char.category_local_ids.split(',').forEach(id => {
                const trimmedId = id.trim();
                if (charCountMap.has(trimmedId)) {
                    charCountMap.set(trimmedId, charCountMap.get(trimmedId) + 1);
                }
            });
        }
    });

    // Створюємо фінальну мапу категорій з усіма даними
    categoriesData.forEach(cat => {
        const specificCharCount = charCountMap.get(cat.local_id) || 0;
        categoryMap.set(cat.local_id, {
            ...cat,
            level: 0,
            charCount: specificCharCount + globalCharCount // (ВИПРАВЛЕНО) Коректний підрахунок
        });
    });

    // Розраховуємо рівень вкладеності
    categoryMap.forEach(cat => {
        let current = cat;
        let level = 0;
        const visited = new Set();
        while (current && current.parent_local_id) {
            if (visited.has(current.local_id)) {
                console.warn("Виявлено циклічну залежність для категорії:", cat.local_id);
                level = 99;
                break;
            };
            visited.add(current.local_id);
            current = categoryMap.get(current.parent_local_id);
            level++;
        }
        cat.level = level;
    });

    return Array.from(categoryMap.values());
}