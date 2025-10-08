/**
 * scripts/components/modalManager.js
 * * Керує життєвим циклом модальних вікон.
 */
import { showToast } from '../features/toast.js';
import { ENTITY_CONFIGS, getCategories, getCharacteristics, getOptions, getBrands, saveEntity, saveMappings, getMappings } from '../api/googleSheetService.js';
import { reinitializeCustomSelect } from './select.js';
import { initMarketplaceEngine, renderMappingUI, collectMappingData } from '../config/marketplaceEngine.js';
import { buildCategoryTree, flattenTreeForSelect } from '../utils/dataUtils.js';

const modalPlaceholder = document.getElementById('modal-placeholder');
let currentModal = null;

// --- Основні функції менеджера ---

export async function loadAndShowModal(templateName, data = {}) {
    if (currentModal) closeModal();
    try {
        const response = await fetch(`modals/${templateName}.html`);
        if (!response.ok) throw new Error(`Шаблон ${templateName} не знайдено.`);
        
        const templateHTML = await response.text();
        modalPlaceholder.innerHTML = templateHTML;
        currentModal = modalPlaceholder.querySelector('.modal-overlay');

        const entityType = templateName.replace('-form', '');
        await populateAndInitForm(entityType, data.id);

        currentModal.addEventListener('click', (e) => {
            if (e.target === currentModal) closeModal();
        });
        currentModal.querySelector('.modal-close-btn')?.addEventListener('click', closeModal);
        
    } catch (error) {
        console.error("Помилка завантаження модального вікна:", error);
        showToast(error.message, 'error');
    }
}

function closeModal() {
    if (currentModal) {
        modalPlaceholder.innerHTML = '';
        currentModal = null;
    }
}

// --- Логіка форм ---

async function populateAndInitForm(entityType, entityId = null) {
    const form = currentModal.querySelector('form');
    if (!form) return;

    let entityData = {};
    let entityMappings = [];

    // 1. Завантаження даних
    if (entityId) {
        const dataLoader = {
            categories: getCategories,
            characteristics: getCharacteristics,
            options: getOptions,
            brands: getBrands
        }[entityType];
        
        if(dataLoader) {
            const allItems = await dataLoader(true);
            entityData = allItems.find(item => item[ENTITY_CONFIGS[entityType].idField] === entityId) || {};
            entityMappings = await getMappings(entityType, true);
            entityMappings = entityMappings.filter(m => m[ENTITY_CONFIGS[entityType].mappingIdColumn] === entityId);
        }
    }

    // 2. Заповнення основних полів
    await populateMainFields(entityType, form, entityData);

    // 3. Рендеринг полів маркетплейсів
    await initMarketplaceEngine(true); // Завжди оновлюємо конфіг
    const mappingsContainer = form.querySelector('.mappings-container');
    if (mappingsContainer) {
        renderMappingUI(mappingsContainer, entityType, entityMappings);
    }
    
    // 4. Ініціалізація кастомних селектів
    form.querySelectorAll('select[data-custom-select]').forEach(reinitializeCustomSelect);

    // 5. Налаштування обробника збереження
    form.addEventListener('submit', async (e) => {
        e.preventDefault();
        await handleSave(entityType, form, entityData);
    });
}

async function populateMainFields(entityType, form, data) {
    // Заповнюємо поля форми даними з 'data'
    for (const key in data) {
        const input = form.querySelector(`[name="${key}"]`);
        if (input) {
            if(input.type === 'checkbox') input.checked = data[key] === 'TRUE';
            else input.value = data[key];
        }
    }
    
    // Специфічна логіка для селектів
    if (entityType === 'categories') {
        const parentSelect = form.querySelector('[name="parent_local_id"]');
        const categories = await getCategories();
        const tree = buildCategoryTree(categories.filter(c => c.local_id !== data.local_id));
        const flatList = flattenTreeForSelect(tree);
        flatList.forEach(opt => parentSelect.add(new Option(opt.label, opt.value)));
        parentSelect.value = data.parent_local_id || '';
    }
    if (entityType === 'characteristics') {
        const categoriesSelect = form.querySelector('[name="category_local_ids"]');
        const categories = await getCategories();
        const tree = buildCategoryTree(categories);
        const flatList = flattenTreeForSelect(tree);
        const selectedIds = new Set((data.category_local_ids || '').split(','));
        flatList.forEach(opt => {
            const option = new Option(opt.label, opt.value);
            if(selectedIds.has(opt.value)) option.selected = true;
            categoriesSelect.add(option);
        });
    }
    if (entityType === 'options') {
        const charSelect = form.querySelector('[name="char_local_id"]');
        const characteristics = await getCharacteristics();
        characteristics.forEach(c => charSelect.add(new Option(c.name_uk, c.local_id)));
        charSelect.value = data.char_local_id || '';
    }
}

async function handleSave(entityType, form, initialData) {
    const mainData = new FormData(form);
    const entityPayload = { ...initialData }; // Зберігаємо _rowIndex, якщо він є
    
    for (const [key, value] of mainData.entries()) {
        const input = form.querySelector(`[name="${key}"]`);
        if(input && input.type === 'checkbox') continue; // Обробляємо чекбокси окремо
        entityPayload[key] = value;
    }
     form.querySelectorAll('input[type="checkbox"]').forEach(cb => {
        entityPayload[cb.name] = cb.checked ? 'TRUE' : 'FALSE';
    });

    const mappingsContainer = form.querySelector('.mappings-container');
    const mappingsPayload = mappingsContainer ? collectMappingData(mappingsContainer) : [];

    try {
        const {data: savedEntity} = await saveEntity(entityType, entityPayload);
        const masterId = savedEntity[ENTITY_CONFIGS[entityType].idField];
        
        await saveMappings(entityType, masterId, mappingsPayload);
        
        showToast('Дані успішно збережено!', 'success');
        closeModal();
        document.dispatchEvent(new CustomEvent('dataChanged', { detail: { entityType } }));

    } catch (error) {
        showToast(`Помилка збереження: ${error.message}`, 'error');
    }
}