// scripts/components/modalManager.js (ПОВНА ЗАМІНА)

import { showToast } from '../features/toast.js';
import { ENTITY_CONFIGS, getCategories, getCharacteristics, getOptions, getBrands, saveEntity, saveMappings, getMappings } from '../api/googleSheetService.js';
import { reinitializeCustomSelect } from './select.js';
import { initMarketplaceEngine, renderMappingUI, collectMappingData } from '../config/marketplaceEngine.js';
import { buildCategoryTree, flattenTreeForSelect } from '../utils/dataUtils.js';

const modalPlaceholder = document.getElementById('modal-placeholder');
let currentModal = null;

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

async function populateAndInitForm(entityType, entityId = null) {
    const form = currentModal.querySelector('form');
    if (!form) return;

    let entityData = {};
    let entityMappings = [];

    if (entityId) {
        const dataLoader = {
            category: getCategories,
            characteristic: getCharacteristics,
            option: getOptions,
            brand: getBrands
        }[entityType];
        
        if(dataLoader) {
            const allItems = await dataLoader(true);
            const idField = ENTITY_CONFIGS[entityType + 's']?.idField || 'local_id';
            entityData = allItems.find(item => item[idField] === entityId) || {};
            
            const mappingEntityType = entityType + 's';
            entityMappings = await getMappings(mappingEntityType, true);
            entityMappings = entityMappings.filter(m => m[ENTITY_CONFIGS[mappingEntityType].mappingIdColumn] === entityId);
        }
    }

    await populateMainFields(entityType, form, entityData);

    await initMarketplaceEngine(true);
    const mappingsContainer = form.querySelector('.mappings-container');
    if (mappingsContainer) {
        renderMappingUI(mappingsContainer, entityType + 's', entityMappings);
    }
    
    form.querySelectorAll('select[data-custom-select]').forEach(reinitializeCustomSelect);

    form.addEventListener('submit', async (e) => {
        e.preventDefault();
        await handleSave(entityType, form, entityData);
    });
}

async function populateMainFields(entityType, form, data) {
    for (const key in data) {
        const input = form.querySelector(`[name="${key}"]`);
        if (input) {
            if(input.type === 'checkbox') input.checked = data[key] === 'TRUE';
            else input.value = data[key];
        }
    }
    
    if (entityType === 'category') {
        const parentSelect = form.querySelector('[name="parent_local_id"]');
        const categories = await getCategories(true); // Примусове оновлення
        const tree = buildCategoryTree(categories.filter(c => c.local_id !== data.local_id));
        const flatList = flattenTreeForSelect(tree);
        flatList.forEach(opt => parentSelect.add(new Option(opt.label, opt.value)));
        parentSelect.value = data.parent_local_id || '';
        
        // Логіка для перемикача "Тип"
        const typeToggle = form.querySelector('#cat-category_type-toggle');
        const typeHiddenInput = form.querySelector('#cat-category_type');
        if(typeToggle && typeHiddenInput) {
            typeToggle.checked = data.category_type === 'Довідник';
            typeHiddenInput.value = data.category_type || 'Товарна';
            typeToggle.addEventListener('change', () => {
                typeHiddenInput.value = typeToggle.checked ? 'Довідник' : 'Товарна';
            });
        }
    }
    if (entityType === 'characteristic') {
        const categoriesSelect = form.querySelector('[name="category_local_ids"]');
        const categories = await getCategories(true);
        const tree = buildCategoryTree(categories);
        const flatList = flattenTreeForSelect(tree);
        const selectedIds = new Set((data.category_local_ids || '').split(','));
        flatList.forEach(opt => {
            const option = new Option(opt.label, opt.value);
            if(selectedIds.has(opt.value)) option.selected = true;
            categoriesSelect.add(option);
        });
    }
    if (entityType === 'option') {
        const charSelect = form.querySelector('[name="char_local_id"]');
        const characteristics = await getCharacteristics(true);
        characteristics.forEach(c => charSelect.add(new Option(c.name_uk, c.local_id)));
        charSelect.value = data.char_local_id || '';
    }
}

async function handleSave(entityType, form, initialData) {
    const mainData = new FormData(form);
    const entityPayload = { ...initialData };
    
    for (const [key, value] of mainData.entries()) {
        const input = form.querySelector(`[name="${key}"]`);
        if(input && (input.type === 'checkbox' && key !== 'category_type_toggle') ) continue;
        if(key !== 'category_type_toggle') entityPayload[key] = value;
    }
     form.querySelectorAll('input[type="checkbox"]:not(#cat-category_type-toggle)').forEach(cb => {
        entityPayload[cb.name] = cb.checked ? 'TRUE' : 'FALSE';
    });

    const mappingsContainer = form.querySelector('.mappings-container');
    const mappingsPayload = mappingsContainer ? collectMappingData(mappingsContainer) : [];
    
    const finalEntityType = entityType + 's';

    try {
        const {data: savedEntity} = await saveEntity(finalEntityType, entityPayload);
        const masterId = savedEntity[ENTITY_CONFIGS[finalEntityType].idField];
        
        await saveMappings(finalEntityType, masterId, mappingsPayload);
        
        showToast('Дані успішно збережено!', 'success');
        closeModal();
        document.dispatchEvent(new CustomEvent('dataChanged', { detail: { entityType: finalEntityType } }));

    } catch (error) {
        showToast(`Помилка збереження: ${error.message}`, 'error');
    }
}