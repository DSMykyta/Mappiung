// /scripts/components/modal.js (ПОВНА, ВІДНОВЛЕНА ТА ВИПРАВЛЕНА ВЕРСІЯ) 11:17

import {
    getCategories, saveCategory, getChildCategories, getLinkedCharacteristics, getCategoryById,
    getOptions, saveCharacteristic, getCharacteristicById, getOptionById, getCharacteristics,
    saveOption, getOptionsForCharacteristic
} from '../api/googleSheetService.js';
import { showToast } from '../features/toast.js';
import { reinitializeCustomSelect } from './select.js';
import { getPaginationState } from './table.js';
import { updateSortUI } from '../features/sorting.js';
import { updateSelectAllState } from '../actions/selection.js'; 

const modalPlaceholder = document.getElementById('modal-placeholder');
let modalHistory = [];
// Для зберігання вихідних даних бічних панелей для пошуку
let sidePanelDataSources = {};

// ========================================================================
// === CORE MODAL FUNCTIONS (Основні функції модального вікна) ===
// ========================================================================

export async function loadAndShowModal(modalName, data = null) {
    let initialData = data || {};
    sidePanelDataSources = {};

    if (data && data.local_id) {
        try {
            let freshData = null;
            const forceRefresh = true;
            switch(modalName) {
                case 'category-form':
                    freshData = await getCategoryById(data.local_id, forceRefresh);
                    break;
                case 'characteristic-form':
                    freshData = await getCharacteristicById(data.local_id, forceRefresh);
                    break;
                case 'option-form':
                    freshData = await getOptionById(data.local_id, forceRefresh);
                    break;
            }
            if (freshData) {
                initialData = freshData;
            } else {
                showToast('Не вдалося знайти запис. Можливо, він був видалений.', 'error');
                const entityType = modalName.split('-')[0] + 's';
                document.dispatchEvent(new CustomEvent('dataChanged', { detail: { entityType: entityType } }));
                return;
            }
        } catch (error) {
            console.error("Помилка при оновленні даних перед відкриттям форми:", error);
            showToast('Помилка завантаження свіжих даних. Перевірте підключення.', 'error');
        }
    }

    modalHistory = [initialData];
    try {
        const modalPath = `modals/${modalName}.html`;
        const response = await fetch(modalPath);
        if (!response.ok) throw new Error(`Не вдалося завантажити шаблон: ${response.statusText}`);
        
        const tempDiv = document.createElement('div');
        tempDiv.innerHTML = await response.text();
        const modalElement = tempDiv.firstElementChild;
        modalPlaceholder.appendChild(modalElement);

        const contentEl = modalElement.querySelector('.modal-content');
        if (contentEl) contentEl.dataset.formType = modalName;

        try {
            switch(modalName) {
                case 'category-form':
                    await renderCategoryFormContent(contentEl, initialData);
                    break;
                case 'characteristic-form':
                    await renderCharacteristicFormContent(contentEl, initialData);
                    break;
                case 'option-form':
                    await renderOptionFormContent(contentEl, initialData);
                    break;
            }
        } catch (renderError) {
            console.error(`Помилка під час рендерингу вмісту модального вікна (${modalName}):`, renderError);
            showToast('Помилка відображення даних форми.', 'error');
             if (contentEl) {
                contentEl.innerHTML = `<div class="modal-header"><h2 id="modal-title">Помилка</h2></div>
                                       <div class="modal-body" style="padding: 20px; color: red;">Не вдалося завантажити дані для форми.</div>`;
            }
        }

        initModalLogic(modalElement);
        document.addEventListener('dataChanged', handleDataChangeForModal);
        document.addEventListener('sidePanelSortChanged', handleSidePanelSortForModal);

    } catch (error) {
        console.error('Помилка при завантаженні модального вікна:', error);
        showToast('Помилка при завантаженні модального вікна', 'error');
    }
}

function closeModal() {
    if (modalPlaceholder.lastChild) {
        modalPlaceholder.removeChild(modalPlaceholder.lastChild);
    }
    modalHistory = [];
    sidePanelDataSources = {};
    document.removeEventListener('dataChanged', handleDataChangeForModal);
    document.removeEventListener('sidePanelSortChanged', handleSidePanelSortForModal);
}

// ========================================================================
// === EVENT HANDLERS (Обробники подій) ===
// ========================================================================

async function handleDataChangeForModal(event) {
    const modalContentEl = modalPlaceholder.querySelector('.modal-overlay .modal-content');
    if (!modalContentEl || modalHistory.length === 0) return;
    const currentData = modalHistory[modalHistory.length - 1];
    if (!currentData.local_id) return;
    const formType = modalContentEl.dataset.formType;
    let freshData = null;
    let renderFunction = null;

    try {
        const forceRefresh = true;
        switch(formType) {
            case 'category-form':
                if (['categories', 'characteristics'].includes(event.detail.entityType)) {
                    freshData = await getCategoryById(currentData.local_id, forceRefresh);
                    renderFunction = renderCategoryFormContent;
                }
                break;
            case 'characteristic-form':
                 if (['characteristics', 'options', 'categories'].includes(event.detail.entityType)) {
                    freshData = await getCharacteristicById(currentData.local_id, forceRefresh);
                    renderFunction = renderCharacteristicFormContent;
                }
                break;
            case 'option-form':
                if (['options', 'characteristics'].includes(event.detail.entityType)) {
                    freshData = await getOptionById(currentData.local_id, forceRefresh);
                    renderFunction = renderOptionFormContent;
                }
                break;
        }
    } catch (error) {
        console.error("Помилка при оновленні даних в модальному вікні:", error);
        return;
    }

    if (!renderFunction) return;

    if (freshData) {
        modalHistory[modalHistory.length - 1] = freshData;
        await renderFunction(modalContentEl, freshData);
    } else {
        showToast('Сутність, яку ви редагували, було видалено.', 'info');
        closeModal();
    }
}

function handleSidePanelSortForModal(event) {
    const { entityType } = event.detail || {};
    const modalEl = modalPlaceholder.querySelector('.modal-overlay .modal-content');
    if (!modalEl) return;
    const visiblePanel = modalEl.querySelector('.related-section.visible');
    const table = visiblePanel ? visiblePanel.querySelector('.pseudo-table') : null;
    if (table) {
        sortSidePanelTable(table, entityType);
        updateSortUI(entityType);
    }
}

function sortSidePanelTable(table, entityType) {
    const state = getPaginationState(entityType);
    if (!state || !state.sortKey) return;
    const { sortKey, sortOrder } = state;
    const body = table.querySelector('.pseudo-table-body');
    const rows = Array.from(body.querySelectorAll('.pseudo-table-row-inner'));
    const headerCells = Array.from(table.querySelectorAll('.pseudo-table-header .sortable-header'));
    const sortIndex = headerCells.findIndex(cell => cell.dataset.sortKey === sortKey);
    if (sortIndex === -1) return;
    rows.sort((a, b) => {
        const cellsA = a.querySelectorAll('.pseudo-table-cell:not(.cell-actions)');
        const cellsB = b.querySelectorAll('.pseudo-table-cell:not(.cell-actions)');
        const valA = (cellsA[sortIndex]?.textContent || '').trim();
        const valB = (cellsB[sortIndex]?.textContent || '').trim();
        return sortOrder === 'asc' ? valA.localeCompare(valB) : valB.localeCompare(valA);
    });
    rows.forEach(row => body.appendChild(row));
}


// ========================================================================
// === CATEGORY FORM LOGIC (Логіка для форми Категорій) ===
// ========================================================================

async function renderCategoryFormContent(modalEl, data) {
    const isEditing = !!data.local_id;
    const titleEl = modalEl.querySelector('#modal-title');
    const backBtn = modalEl.querySelector('#modal-back-btn');

    if (modalHistory.length > 1) {
        if (titleEl) titleEl.innerText = `Дочірня категорія "${data.name_uk || ''}"`;
        if (backBtn) backBtn.style.display = 'block';
    } else {
        if (titleEl) titleEl.innerText = isEditing ? `Редагування категорії "${data.name_uk || ''}"` : 'Створити категорію';
        if (backBtn) backBtn.style.display = 'none';
    }

    modalEl.querySelector('.modal-body--split')?.classList.remove('side-panel-visible');
    modalEl.querySelector('#children-panel')?.classList.remove('visible');
    modalEl.querySelector('#characteristics-panel')?.classList.remove('visible');
    modalEl.querySelectorAll('.header-actions .segment.active').forEach(btn => btn.classList.remove('active'));

    await populateParentCategorySelect(modalEl, data);
    populateCategoryForm(modalEl, data);
    const parentSelect = modalEl.querySelector('#cat-parent_local_id');
    if (parentSelect) reinitializeCustomSelect(parentSelect);

    const childrenBtn = modalEl.querySelector('#show-children-btn');
    if (childrenBtn) childrenBtn.style.display = 'none';
    const charsBtn = modalEl.querySelector('#show-chars-btn');
    if (charsBtn) charsBtn.style.display = 'none';

    if (isEditing) {
        await loadSidePanelsData(modalEl, data.local_id);
    }
}

function buildHierarchicalCategoryList(allCategories, excludeId = null) {
    const categoryMap = new Map(allCategories.map(c => [c.local_id, { ...c }]));
    const hierarchicalList = [];
    for (const category of allCategories) {
        if (category.local_id === excludeId) continue;
        let path = [category.name_uk];
        let level = 0;
        let current = category;
        const visited = new Set([category.local_id]);
        while (current.parent_local_id && categoryMap.has(current.parent_local_id)) {
            current = categoryMap.get(current.parent_local_id);
             if (visited.has(current.local_id)) {
                console.error("Циклічне посилання виявлено:", current.local_id);
                break; 
            }
            visited.add(current.local_id);
            path.unshift(current.name_uk);
            level++;
        }
        hierarchicalList.push({ ...category, level, fullName: path.join(' > ') });
    }
    hierarchicalList.sort((a, b) => a.fullName.localeCompare(b.fullName));
    return hierarchicalList;
}

async function populateParentCategorySelect(modalEl, currentCategoryData) {
    const select = modalEl.querySelector('#cat-parent_local_id');
    if (!select) return;
    while (select.options.length > 1) select.remove(1); // Зберігаємо перший "-- Коренева --"
    const allCategories = await getCategories();
    const hierarchicalCategories = buildHierarchicalCategoryList(allCategories, currentCategoryData.local_id);
    hierarchicalCategories.forEach(cat => {
        const option = new Option(cat.fullName, cat.local_id); // Text content = повний шлях
        option.dataset.htmlContent = `${'&nbsp;'.repeat(cat.level * 4)}${cat.name_uk}`;
        select.add(option);
    });
}

function populateCategoryForm(modalEl, data) {
    const safeSetValue = (selector, value) => {
        const element = modalEl.querySelector(selector);
        if (element) element.value = value || '';
    };
    const safeSetToggle = (selector, value, onValue = 'leaf') => {
        const element = modalEl.querySelector(selector);
        if (element) element.checked = (value === onValue);
    };

    safeSetValue('#cat-local_id', data.local_id);
    safeSetValue('#cat-parent_local_id', data.parent_local_id);
    safeSetToggle('#cat-category_type', data.category_type, 'leaf');
    safeSetValue('#cat-name_uk', data.name_uk);
    safeSetValue('#cat-name_ru', data.name_ru);
    safeSetValue('#cat-etalon_id', data.etalon_id);
    safeSetValue('#cat-etalon_name', data.etalon_name);
    safeSetValue('#cat-rztk_id', data.rztk_id);
    safeSetValue('#cat-rztk_name', data.rztk_name);
    safeSetValue('#cat-epicenter_id', data.epicenter_id);
    safeSetValue('#cat-epicenter_name', data.epicenter_name);
    safeSetValue('#cat-allo_id', data.allo_id);
    safeSetValue('#cat-allo_name', data.allo_name);
    safeSetValue('#cat-fua_id', data.fua_id);
    safeSetValue('#cat-fua_name', data.fua_name);
    safeSetValue('#cat-maudau_id', data.maudau_id);
    safeSetValue('#cat-maudau_name', data.maudau_name);
}

function getCategoryDataFromForm(modalEl) {
    const getValue = (selector) => modalEl.querySelector(selector)?.value || '';
    const getToggleValue = (selector, onValue = 'leaf', offValue = 'grouping') => modalEl.querySelector(selector)?.checked ? onValue : offValue;
    return {
        local_id: getValue('#cat-local_id'),
        parent_local_id: getValue('#cat-parent_local_id'),
        category_type: getToggleValue('#cat-category_type'),
        name_uk: getValue('#cat-name_uk').trim(),
        name_ru: getValue('#cat-name_ru').trim(),
        etalon_id: getValue('#cat-etalon_id').trim(),
        etalon_name: getValue('#cat-etalon_name').trim(),
        rztk_id: getValue('#cat-rztk_id').trim(),
        rztk_name: getValue('#cat-rztk_name').trim(),
        epicenter_id: getValue('#cat-epicenter_id').trim(),
        epicenter_name: getValue('#cat-epicenter_name').trim(),
        allo_id: getValue('#cat-allo_id').trim(),
        allo_name: getValue('#cat-allo_name').trim(),
        fua_id: getValue('#cat-fua_id').trim(),
        fua_name: getValue('#cat-fua_name').trim(),
        maudau_id: getValue('#cat-maudau_id').trim(),
        maudau_name: getValue('#cat-maudau_name').trim(),
    };
}

// ========================================================================
// === CHARACTERISTIC FORM LOGIC (Відновлена логіка) ===
// ========================================================================

async function renderCharacteristicFormContent(modalEl, data) {
    const isEditing = !!data.local_id;
    const titleEl = modalEl.querySelector('#modal-title');
    if (titleEl) titleEl.innerText = isEditing ? `Редагування характеристики "${data.name_uk || ''}"` : 'Створити характеристику';

    modalEl.querySelector('#options-panel')?.classList.remove('visible');
    modalEl.querySelector('#show-options-btn')?.classList.remove('active');
    modalEl.querySelector('.modal-body--split')?.classList.remove('side-panel-visible');

    const optionsBtn = modalEl.querySelector('#show-options-btn');
    if (optionsBtn) optionsBtn.style.display = 'none';

    await Promise.all([
        populateAllCategoriesSelect(modalEl, data.category_local_ids),
        populateAllOptionsSelect(modalEl, data.triggering_option_id, data)
    ]);
    populateCharacteristicForm(modalEl, data);
    
    // (ОНОВЛЕНО) Цей код тепер знаходить і ініціалізує ВСІ кастомні селекти в модальному вікні
    modalEl.querySelectorAll('select[data-custom-select]').forEach(selectEl => {
        if (selectEl) {
            reinitializeCustomSelect(selectEl);
        }
    });

    initGlobalParamToggle(modalEl);

    if (isEditing) {
        const optionsContainer = modalEl.querySelector('#options-panel .related-content-container');
        if (optionsContainer) optionsContainer.innerHTML = '<p>Завантаження опцій...</p>';
        const options = await getOptionsForCharacteristic(data.local_id);
        if (options.length > 0) {
            if (optionsBtn) optionsBtn.style.display = 'block';
            if (optionsContainer) optionsContainer.innerHTML = await generateSidePanelTableHTML('options', "Опції", { name_uk: "Назва" }, options, 'modals/partials/options-panel-table.html');
        } else if (optionsContainer) {
            optionsContainer.innerHTML = '<p style="padding: 16px;">Опції для цієї характеристики відсутні.</p>';
        }
    }
}


async function populateAllCategoriesSelect(modalEl, selectedIds = '') {
    const select = modalEl.querySelector('#char-category_local_ids');
    if (!select) return;
    select.innerHTML = '';
    const selectedIdSet = new Set((selectedIds || '').split(',').map(id => id.trim()));
    const allCategories = await getCategories();
    const hierarchicalCategories = buildHierarchicalCategoryList(allCategories);
    hierarchicalCategories.forEach(cat => {
        const option = new Option(cat.fullName, cat.local_id); // Text content = повний шлях
        option.selected = selectedIdSet.has(cat.local_id);
        option.dataset.name = cat.name_uk;
        option.dataset.level = cat.level;
        option.dataset.htmlContent = `${'&nbsp;'.repeat(cat.level * 4)}${cat.name_uk}`;
        select.add(option);
    });
}

async function populateAllOptionsSelect(modalEl, selectedId, currentCharacteristicData) {
    const select = modalEl.querySelector('#char-triggering_option_id');
    if (!select) return;
    select.innerHTML = '<option value="">-- Не належить --</option>';

    // Отримуємо всі опції та всі характеристики
    const [allOptions, allCharacteristics] = await Promise.all([getOptions(), getCharacteristics()]);

    // Створюємо мапу характеристик для швидкого доступу
    const charMap = new Map(allCharacteristics.map(char => [char.local_id, char]));

    // Отримуємо ID категорій поточної характеристики, яку редагуємо
    const currentCategoryIds = new Set(
        (currentCharacteristicData.category_local_ids || '').split(',').map(id => id.trim()).filter(Boolean)
    );

    // Фільтруємо опції за новими правилами
    const filteredOptions = allOptions.filter(option => {
        const parentChar = charMap.get(option.char_local_id);
        if (!parentChar) return false; // Опція без батька не може бути тригером

        // Правило 1: Батьківська характеристика НЕ повинна бути глобальною
        const isNotGlobal = parentChar.is_global !== 'TRUE';
        if (!isNotGlobal) return false;

        // Правило 2: Батьківська характеристика повинна бути в тій же категорії
        const parentCategoryIds = (parentChar.category_local_ids || '').split(',').map(id => id.trim());
        const hasCommonCategory = parentCategoryIds.some(id => currentCategoryIds.has(id));
        
        return hasCommonCategory;
    });

    filteredOptions.sort((a, b) => (a.name_uk || '').localeCompare(b.name_uk || ''));
    filteredOptions.forEach(opt => {
        const option = new Option(opt.name_uk, opt.local_id);
        option.selected = (opt.local_id === selectedId);
        select.add(option);
    });
}


function populateCharacteristicForm(modalEl, data) {
    const safeSetValue = (selector, value) => {
        const element = modalEl.querySelector(selector);
        if (element) element.value = value || '';
    };
    const safeSetCheckbox = (selector, value) => {
        const element = modalEl.querySelector(selector);
        if (element) element.checked = (value === 'TRUE' || value === true);
    };
    // (НОВЕ) Встановлюємо значення для нового перемикача "Тип фільтра"
    const safeSetToggle = (selector, value, onValue) => {
        const element = modalEl.querySelector(selector);
        if(element) element.checked = (value === onValue);
    };

    safeSetCheckbox('#char-is_global', data.is_global);

    safeSetValue('#char-local_id', data.local_id);
    safeSetValue('#char-name_uk', data.name_uk);
    safeSetValue('#char-name_ru', data.name_ru);
    safeSetValue('#char-unit', data.unit);
    safeSetValue('#char-notes', data.notes);
    safeSetToggle('#char-filter_type', data.filter_type, 'Main');
    safeSetValue('#char-param_type', data.param_type);

    safeSetValue('#char-etalon_id', data.etalon_id);
    safeSetValue('#char-etalon_name', data.etalon_name);
    safeSetValue('#char-etalon_param_type', data.etalon_param_type);
    safeSetValue('#char-etalon_filter_type', data.etalon_filter_type);
    safeSetValue('#char-etalon_unit', data.etalon_unit);
    
    safeSetValue('#char-rztk_id', data.rztk_id);
    safeSetValue('#char-rztk_name', data.rztk_name);
    safeSetValue('#char-rztk_param_type', data.rztk_param_type);
    safeSetValue('#char-rztk_filter_type', data.rztk_filter_type);
    safeSetValue('#char-rztk_unit', data.rztk_unit);

}

function getCharacteristicDataFromForm(modalEl) {
    const getValue = (selector) => modalEl.querySelector(selector)?.value || '';
    const getCheckboxValue = (selector) => modalEl.querySelector(selector)?.checked ? 'TRUE' : 'FALSE';
    const getMultiSelectValue = (selector) => Array.from(modalEl.querySelector(selector)?.selectedOptions || []).map(opt => opt.value).join(',');
    const getToggleValue = (selector, onValue, offValue) => modalEl.querySelector(selector)?.checked ? onValue : offValue;

    const isGlobal = getCheckboxValue('#char-is_global') === 'TRUE';

    return {
        local_id: getValue('#char-local_id'),
        name_uk: getValue('#char-name_uk').trim(),
        name_ru: getValue('#char-name_ru').trim(),
        // (ОНОВЛЕНО) Якщо параметр глобальний, зберігаємо порожній рядок для категорій
        category_local_ids: isGlobal ? '' : getMultiSelectValue('#char-category_local_ids'),
        triggering_option_id: getValue('#char-triggering_option_id'),
        param_type: getValue('#char-param_type'),
        unit: getValue('#char-unit').trim(),
        filter_type: getToggleValue('#char-filter_type', 'Main', 'Disable'),
        is_global: isGlobal ? 'TRUE' : 'FALSE',
        notes: getValue('#char-notes').trim(),
        
        etalon_id: getValue('#char-etalon_id').trim(),
        etalon_name: getValue('#char-etalon_name').trim(),
        etalon_param_type: getValue('#char-etalon_param_type').trim(),
        etalon_filter_type: getValue('#char-etalon_filter_type').trim(),
        etalon_unit: getValue('#char-etalon_unit').trim(),

        rztk_id: getValue('#char-rztk_id').trim(),
        rztk_name: getValue('#char-rztk_name').trim(),
        rztk_param_type: getValue('#char-rztk_param_type').trim(),
        rztk_filter_type: getValue('#char-rztk_filter_type').trim(),
        rztk_unit: getValue('#char-rztk_unit').trim(),

    };
}

function initGlobalParamToggle(modalEl) {
    const isGlobalToggle = modalEl.querySelector('#char-is_global');
    const categoriesSelectEl = modalEl.querySelector('#char-category_local_ids');
    if (!isGlobalToggle || !categoriesSelectEl) return;

    const customSelectWrapper = categoriesSelectEl.closest('.custom-select-wrapper');
    let lastCategorySelection = [];

    const updateState = () => {
        if (isGlobalToggle.checked) {
            // Зберігаємо поточний вибір
            lastCategorySelection = Array.from(categoriesSelectEl.selectedOptions).map(opt => opt.value);
            // Очищуємо вибір
            Array.from(categoriesSelectEl.options).forEach(opt => opt.selected = false);
            // Блокуємо селект
            if (customSelectWrapper) customSelectWrapper.classList.add('disabled');
        } else {
            // Розблоковуємо селект
            if (customSelectWrapper) customSelectWrapper.classList.remove('disabled');
            // Відновлюємо вибір
            Array.from(categoriesSelectEl.options).forEach(opt => {
                if (lastCategorySelection.includes(opt.value)) {
                    opt.selected = true;
                }
            });
        }
        // Оновлюємо відображення кастомного селекту
        if (categoriesSelectEl.customSelect) {
            categoriesSelectEl.customSelect._updateSelection();
        }
    };
    
    // Встановлюємо початковий стан при завантаженні
    if (isGlobalToggle.checked) {
        if (customSelectWrapper) customSelectWrapper.classList.add('disabled');
    }
    
    isGlobalToggle.addEventListener('change', updateState);
}

// ========================================================================
// === OPTION FORM LOGIC (Відновлена логіка) ===
// ========================================================================

async function renderOptionFormContent(modalEl, data) {
    const isEditing = !!data.local_id;
    const titleEl = modalEl.querySelector('#modal-title');
    if (titleEl) titleEl.innerText = isEditing ? `Редагування опції "${data.name_uk || ''}"` : 'Створити опцію';

    await populateParentCharacteristicSelect(modalEl, data.char_local_id);
    populateOptionForm(modalEl, data);

    const parentSelect = modalEl.querySelector('#opt-char_local_id');
    if (parentSelect) reinitializeCustomSelect(parentSelect);
}

async function populateParentCharacteristicSelect(modalEl, selectedId) {
    const select = modalEl.querySelector('#opt-char_local_id');
    if (!select) return;
    select.innerHTML = '';
    const allCharacteristics = await getCharacteristics();
    allCharacteristics.sort((a,b) => (a.name_uk || '').localeCompare(b.name_uk || ''));
    allCharacteristics.forEach(char => {
        const option = new Option(char.name_uk, char.local_id);
        option.selected = (char.local_id === selectedId);
        select.add(option);
    });
}

function populateOptionForm(modalEl, data) {
    const safeSetValue = (selector, value) => {
        const element = modalEl.querySelector(selector);
        if (element) element.value = value || '';
    };

    safeSetValue('#opt-local_id', data.local_id);
    safeSetValue('#opt-name_uk', data.name_uk);
    safeSetValue('#opt-name_ru', data.name_ru);

    // (ВИПРАВЛЕНО) Заповнюємо дані маркетплейсів
    safeSetValue('#opt-etalon_id', data.etalon_id);
    safeSetValue('#opt-etalon_name', data.etalon_name);
    safeSetValue('#opt-rztk_id', data.rztk_id);
    safeSetValue('#opt-rztk_name', data.rztk_name);
}


function getOptionDataFromForm(modalEl) {
    const getValue = (selector) => modalEl.querySelector(selector)?.value || '';
    return {
        local_id: getValue('#opt-local_id'),
        char_local_id: getValue('#opt-char_local_id'),
        name_uk: getValue('#opt-name_uk').trim(),
        name_ru: getValue('#opt-name_ru').trim(),

        // (ВИПРАВЛЕНО) Зчитуємо дані маркетплейсів
        etalon_id: getValue('#opt-etalon_id').trim(),
        etalon_name: getValue('#opt-etalon_name').trim(),
        rztk_id: getValue('#opt-rztk_id').trim(),
        rztk_name: getValue('#opt-rztk_name').trim(),
    };
}


// ========================================================================
// === GENERAL MODAL LOGIC (Загальна логіка модальних вікон) ===
// ========================================================================

async function loadSidePanelsData(modalEl, categoryId) {
    const childrenContainer = modalEl.querySelector('#children-panel .related-content-container');
    const charsContainer = modalEl.querySelector('#characteristics-panel .related-content-container');
    if (childrenContainer) childrenContainer.innerHTML = '<p>Завантаження...</p>';
    if (charsContainer) charsContainer.innerHTML = '<p>Завантаження...</p>';

    const [children, characteristics] = await Promise.all([
        getChildCategories(categoryId),
        getLinkedCharacteristics(categoryId)
    ]);

    const childrenBtn = modalEl.querySelector('#show-children-btn');
    const charsBtn = modalEl.querySelector('#show-chars-btn');

    if (children.length > 0) {
        if (childrenBtn) childrenBtn.style.display = 'block';
        if (childrenContainer) childrenContainer.innerHTML = await generateSidePanelTableHTML('categories', "Дочірні категорії", { name_uk: "Назва" }, children, 'modals/partials/child-category-panel.html');
    } else if (childrenContainer) {
        childrenContainer.innerHTML = '<p style="padding: 16px;">Дочірні категорії відсутні.</p>';
    }

    if (characteristics.length > 0) {
        if (charsBtn) charsBtn.style.display = 'block';
        if (charsContainer) charsContainer.innerHTML = await generateSidePanelTableHTML('characteristics', "Прив'язані характеристики", { name_uk: "Назва" }, characteristics, 'modals/partials/linked-characteristic-panel.html');
    } else if (charsContainer) {
        charsContainer.innerHTML = '<p style="padding: 16px;">Прив\'язані характеристики відсутні.</p>';
    }
}

function initModalLogic(modalEl) {
  modalEl.addEventListener('click', e => { if (e.target === modalEl) closeModal(); });
  modalEl.querySelector('.modal-close-btn')?.addEventListener('click', closeModal);

  modalEl.querySelector('#saveCategoryBtn')?.addEventListener('click', () => handleSaveCategory(modalEl));
  modalEl.querySelector('#saveCharacteristicBtn')?.addEventListener('click', () => handleSaveCharacteristic(modalEl));
  modalEl.querySelector('#saveOptionBtn')?.addEventListener('click', () => handleSaveOption(modalEl));

  modalEl.addEventListener('click', (event) => handleModalClick(event, modalEl));
  modalEl.addEventListener('input', (event) => {
    if (event.target.classList.contains('side-panel-search')) handleSidePanelSearch(event.target);
  });

  // ⬇ ВСТАВИТИ ЦЕЙ БЛОК ТУТ
  modalEl.addEventListener('change', (e) => {
    const target = e.target;
    if (!target.matches('.row-checkbox, .header-select-all')) return;

    const table = target.closest('.pseudo-table');
    if (!table) return;

    const entityType = table.dataset.entityType;     // бічні панелі мають його
    const state = getPaginationState(entityType);
    if (!state) return;

    const body = table.querySelector('.pseudo-table-body');

    if (target.classList.contains('header-select-all')) {
      const cbs = table.querySelectorAll('.row-checkbox');
      cbs.forEach(cb => {
        cb.checked = target.checked;
        const id = cb.dataset.id;
        if (target.checked) state.selectedIds.add(id);
        else state.selectedIds.delete(id);
      });
    } else {
      const id = target.dataset.id;
      if (target.checked) state.selectedIds.add(id);
      else state.selectedIds.delete(id);
    }

    if (body) updateSelectAllState(body);

    const sidePanel = table.closest('.related-section');
    const delBtn = sidePanel?.querySelector('.btn-delete');
    if (delBtn) delBtn.disabled = table.querySelectorAll('.row-checkbox:checked').length === 0;

    e.stopPropagation(); // щоб глобальний слухач на <body> не дублював дію
  });

    
    const childrenBtn = modalEl.querySelector('#show-children-btn');
    const charsBtn = modalEl.querySelector('#show-chars-btn');
    const optionsBtn = modalEl.querySelector('#show-options-btn');
    const childrenPanel = modalEl.querySelector('#children-panel');
    const charsPanel = modalEl.querySelector('#characteristics-panel');
    const optionsPanel = modalEl.querySelector('#options-panel');
    const modalBody = modalEl.querySelector('.modal-body--split');

    const togglePanel = (panelToShow, buttonToActivate) => {
        if (!panelToShow || !buttonToActivate) return;
        const isAlreadyVisible = panelToShow.classList.contains('visible');
        [childrenBtn, charsBtn, optionsBtn].forEach(btn => btn?.classList.remove('active'));
        [childrenPanel, charsPanel, optionsPanel].forEach(panel => panel?.classList.remove('visible'));
        if (isAlreadyVisible) {
            modalBody?.classList.remove('side-panel-visible');
        } else {
            panelToShow.classList.add('visible');
            buttonToActivate.classList.add('active');
            modalBody?.classList.add('side-panel-visible');
        }
    };
    if (childrenBtn) childrenBtn.addEventListener('click', () => togglePanel(childrenPanel, childrenBtn));
    if (charsBtn) charsBtn.addEventListener('click', () => togglePanel(charsPanel, charsBtn));
    if (optionsBtn) optionsBtn.addEventListener('click', () => togglePanel(optionsPanel, optionsBtn));
}

async function handleSaveCategory(modalEl) {
    const formData = getCategoryDataFromForm(modalEl);
    if (!formData.name_uk) {
        showToast('Назва (укр) є обов\'язковим полем!', 'error');
        return;
    }
    const result = await saveCategory(formData);
    if (result.status === 'success') {
        showToast('Категорію успішно збережено!', 'success');
        document.dispatchEvent(new CustomEvent('dataChanged', { detail: { entityType: 'categories' } }));
        if (modalHistory.length > 1) {
             modalHistory.pop();
             await renderCategoryFormContent(modalEl.querySelector('.modal-content'), modalHistory[modalHistory.length - 1]);
        } else {
            closeModal();
        }
    } else {
        showToast(result.message || 'Помилка при збереженні.', 'error');
    }
}

async function handleSaveCharacteristic(modalEl) {
    const formData = getCharacteristicDataFromForm(modalEl);
    if (!formData.name_uk) {
        showToast('Назва (укр) є обов\'язковим полем!', 'error');
        return;
    }
    const result = await saveCharacteristic(formData);
    if (result.status === 'success') {
        showToast('Характеристику успішно збережено!', 'success');
        document.dispatchEvent(new CustomEvent('dataChanged', { detail: { entityType: 'characteristics' } }));
        closeModal();
    } else {
        showToast(result.message || 'Помилка при збереженні.', 'error');
    }
}

async function handleSaveOption(modalEl) {
    const formData = getOptionDataFromForm(modalEl);
    if (!formData.name_uk || !formData.char_local_id) {
        showToast('Обидва поля є обов\'язковими!', 'error');
        return;
    }
    const result = await saveOption(formData);
    if (result.status === 'success') {
        showToast('Опцію успішно збережено!', 'success');
        document.dispatchEvent(new CustomEvent('dataChanged', { detail: { entityType: 'options' } }));
        // Оскільки опції редагуються з вікна характеристики, треба оновити і її
        document.dispatchEvent(new CustomEvent('dataChanged', { detail: { entityType: 'characteristics' } }));
        closeModal();
    } else {
        showToast(result.message || 'Помилка при збереженні.', 'error');
    }
}


async function handleModalClick(event, modalEl) {
    const target = event.target.closest('button');
    if (!target) return;
    const contentEl = modalEl.querySelector('.modal-content');
    const formType = contentEl.dataset.formType;

    if (target.id === 'modal-back-btn' && formType === 'category-form' && modalHistory.length > 1) {
        modalHistory.pop();
        await renderCategoryFormContent(contentEl, modalHistory[modalHistory.length - 1]);
        return;
    }

    let entityId = target.dataset.id;
    if (!entityId) return;
    
    let entityToEdit = null;
    let nextModalName = null;

    try {
        if (target.classList.contains('btn-edit-child-category')) {
            entityToEdit = await getCategoryById(entityId, true);
        } else if (target.classList.contains('btn-edit-char')) {
            entityToEdit = await getCharacteristicById(entityId, true); 
            nextModalName = 'characteristic-form';
        } else if (target.classList.contains('btn-edit-option')) {
            entityToEdit = await getOptionById(entityId, true); 
            nextModalName = 'option-form';
        }

        if (entityToEdit) {
            if (nextModalName) {
                // Закриваємо поточне вікно і відкриваємо нове
                closeModal(); 
                loadAndShowModal(nextModalName, entityToEdit);
            } else if (formType === 'category-form') {
                // Перехід до дочірньої категорії всередині одного вікна
                modalHistory.push(entityToEdit);
                await renderCategoryFormContent(contentEl, entityToEdit);
            }
        } else {
             showToast('Запис не знайдено.', 'error');
        }
    } catch(e) {
        showToast('Помилка завантаження даних.', 'error');
    }
}

// Уніфікований пошук у бічній панелі
function handleSidePanelSearch(searchInput) {
    const query = searchInput.value.toLowerCase().trim();
    const tableId = searchInput.dataset.tableTargetId;
    const table = document.getElementById(tableId);
    if (!table) return;

    const sourceData = sidePanelDataSources[tableId];
    if (!sourceData) return;

    const filteredData = sourceData.filter(row => (row.name_uk || '').toLowerCase().includes(query));

    const body = table.querySelector('.pseudo-table-body');
    const entityType = table.dataset.entityType;
    
    body.innerHTML = renderSidePanelRows(entityType, { name_uk: "Назва" }, filteredData);
}

// Рендерить тільки рядки
function renderSidePanelRows(entityType, headers, dataRows) {
     let editButtonClass;
        switch (entityType) {
            case 'child-category': editButtonClass = 'btn-edit-child-category'; break;
            case 'char': editButtonClass = 'btn-edit-char'; break;
            case 'option': editButtonClass = 'btn-edit-option'; break;
            default: editButtonClass = `btn-edit-${entityType}`;
        }
    return dataRows.map(row => {
        const cellsHtml = Object.keys(headers).map(key => `<div class="pseudo-table-cell cell-main-name" data-tooltip="${row[key] || ''}">${row[key] || '—'}</div>`).join('');
        return `<div class="pseudo-table-row-inner" data-id="${row.local_id}">
                    <div class="pseudo-table-cell cell-actions">
                        <input type="checkbox" class="row-checkbox" data-id="${row.local_id}">
                        <button class="${editButtonClass}" data-id="${row.local_id}" title="Редагувати">✎</button>
                    </div>
                    ${cellsHtml}
                </div>`;
    }).join('');
}

async function generateSidePanelTableHTML(entityType, title, headers, dataRows, templatePath) {
    try {
        const response = await fetch(templatePath);
        if (!response.ok) throw new Error(`Шаблон не знайдено: ${templatePath}`);
        let template = await response.text();
        const headerHtml = Object.keys(headers).map(key => `<div class="pseudo-table-cell cell-main-name sortable-header" data-sort-key="${key}"><span>${headers[key]}</span><span class="sort-indicator"></span></div>`).join('');
        const rowsHtml = renderSidePanelRows(entityType, headers, dataRows);
        const tableId = `side-table-${entityType}-${Date.now()}`;

        sidePanelDataSources[tableId] = dataRows;

        template = template.replace('{{TITLE}}', title).replace(/{{TABLE_ID}}/g, tableId).replace('{{HEADER_CELLS}}', headerHtml).replace('{{BODY_ROWS}}', rowsHtml);

        const tempDiv = document.createElement('div');
        tempDiv.innerHTML = template;
        const tableEl = tempDiv.querySelector('.pseudo-table');
        if (tableEl) tableEl.dataset.entityType = entityType;
        return tempDiv.innerHTML;
    } catch (error) {
        console.error('Помилка при генерації таблиці:', error);
        return '<p style="color: red;">Помилка.</p>';
    }
}