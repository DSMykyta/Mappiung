/**
 * scripts/config/marketplaceEngine.js
 * "Динамічний Рушій Маркетплейсів". 
 * Відповідає за завантаження конфігурації маркетплейсів та динамічну побудову UI для мапінгів.
 */

import { getMarketplaces, getMarketplaceFields } from '../api/googleSheetService.js';

const configuration = {
    marketplaces: {}, // { marketplace_id: { ... } }
    fields: {}        // { entity_type: { marketplace_id: [ ...fields ] } }
};

let isInitialized = false;

/**
 * Ініціалізує рушій, завантажуючи дані про маркетплейси та їхні поля.
 */
export async function initMarketplaceEngine(forceRefresh = false) {
    if (isInitialized && !forceRefresh) {
        return configuration;
    }
    console.log("[Engine] Ініціалізація Marketplace Engine...");
    try {
        const [marketplacesData, fieldsData] = await Promise.all([
            getMarketplaces(forceRefresh),
            getMarketplaceFields(forceRefresh)
        ]);

        configuration.marketplaces = {};
        marketplacesData.forEach(mp => {
            configuration.marketplaces[mp.marketplace_id] = mp;
        });

        configuration.fields = {};
        fieldsData.forEach(field => {
            const { entity_type, marketplace_id } = field;
            if (!configuration.fields[entity_type]) configuration.fields[entity_type] = {};
            if (!configuration.fields[entity_type][marketplace_id]) configuration.fields[entity_type][marketplace_id] = [];
            
            // Перетворюємо 'TRUE'/'FALSE' в boolean
            field.allow_multiple = String(field.allow_multiple).toUpperCase() === 'TRUE';
            configuration.fields[entity_type][marketplace_id].push(field);
        });

        isInitialized = true;
        console.log("[Engine] Marketplace Engine ініціалізовано успішно.", configuration);
        return configuration;

    } catch (error) {
        console.error("[Engine] Помилка ініціалізації Marketplace Engine:", error);
        return configuration; 
    }
}

export function getConfig() {
    return configuration;
}

/**
 * Будує HTML-форми для прив'язок на основі завантаженої конфігурації.
 */
export function renderMappingUI(container, entityType, existingMappings) {
    if (!container) return;
    container.innerHTML = '';

    const entityFieldsConfig = configuration.fields[entityType];

    if (!entityFieldsConfig && Object.keys(configuration.marketplaces).length > 0) {
        container.innerHTML = '<p>Для цієї сутності не налаштовано жодного поля прив\'язки.</p>';
        return;
    } else if (Object.keys(configuration.marketplaces).length === 0) {
        container.innerHTML = '<p>Немає налаштованих маркетплейсів.</p>';
        return;
    }

    for (const marketplaceId in configuration.marketplaces) {
        const marketplaceInfo = configuration.marketplaces[marketplaceId];
        const fieldsForThisMarketplace = entityFieldsConfig ? entityFieldsConfig[marketplaceId] : [];

        if (!fieldsForThisMarketplace || fieldsForThisMarketplace.length === 0) continue;
        
        const multiMapKey = `multi_map_${entityType}`;
        const isMultiMapEnabled = String(marketplaceInfo[multiMapKey]).toUpperCase() === 'TRUE';

        const groupElement = document.createElement('div');
        groupElement.className = 'mapping-group';
        groupElement.dataset.marketplaceId = marketplaceId;
        groupElement.innerHTML = `
            <h4 class="marketplace-heading">${escapeHTML(marketplaceInfo.display_name)}</h4>
            <div class="mapping-entries-container"></div>
        `;
        const entriesContainer = groupElement.querySelector('.mapping-entries-container');

        const currentMappingsForMP = existingMappings.filter(m => m.marketplace_id === marketplaceId);

        if (isMultiMapEnabled) {
            if (currentMappingsForMP.length > 0) {
                currentMappingsForMP.forEach(mappingData => renderMappingEntry(entriesContainer, fieldsForThisMarketplace, mappingData, true));
            }
            const addButton = document.createElement('button');
            addButton.textContent = '+ Додати прив\'язку';
            addButton.className = 'btn-outline btn-add-mapping-entry';
            addButton.type = 'button';
            addButton.addEventListener('click', () => renderMappingEntry(entriesContainer, fieldsForThisMarketplace, {}, true));
            groupElement.appendChild(addButton);
        } else {
            const mappingData = currentMappingsForMP[0] || {};
            renderMappingEntry(entriesContainer, fieldsForThisMarketplace, mappingData, false);
        }

        container.appendChild(groupElement);
    }
}

function renderMappingEntry(container, fieldsConfig, mappingData, isMultiMap) {
    const entryElement = document.createElement('div');
    entryElement.className = 'mapping-entry';
    if (mappingData.mapping_id) entryElement.dataset.mappingId = mappingData.mapping_id;

    const fieldsHTML = fieldsConfig.map(fieldConfig => {
        const fieldValue = mappingData[fieldConfig.field_key] || '';
        return generateFieldHTML(fieldConfig, fieldValue);
    }).join('');
    
    entryElement.innerHTML = `<div class="form-grid-dynamic">${fieldsHTML}</div>`;

    if (isMultiMap) {
        const deleteButton = document.createElement('button');
        deleteButton.innerHTML = '🗑️';
        deleteButton.className = 'btn-delete-mapping-entry';
        deleteButton.title = 'Видалити цю прив\'язку';
        deleteButton.type = 'button';
        deleteButton.addEventListener('click', () => container.removeChild(entryElement));
        entryElement.querySelector('.form-grid-dynamic').appendChild(deleteButton);
    }

    container.appendChild(entryElement);
}

function generateFieldHTML(config, value) {
    const { display_name, field_key, field_type } = config;
    const escapedName = escapeHTML(display_name);
    const escapedKey = escapeHTML(field_key);
    const escapedValue = escapeHTML(value);

    let inputHTML = '';
    switch (field_type) {
        case 'boolean':
            const checked = String(value).toUpperCase() === 'TRUE' ? 'checked' : '';
            return `<div class="form-group boolean-group"><input type="checkbox" data-field-key="${escapedKey}" ${checked}><label>${escapedName}</label></div>`;
        case 'textarea':
            inputHTML = `<textarea data-field-key="${escapedKey}" rows="2">${escapedValue}</textarea>`;
            break;
        default: // text, select, etc.
            inputHTML = `<input type="text" data-field-key="${escapedKey}" value="${escapedValue}">`;
    }
    return `<div class="form-group"><label>${escapedName}</label>${inputHTML}</div>`;
}

/**
 * Збирає дані з динамічно згенерованих полів UI.
 */
export function collectMappingData(container) {
    const mappings = [];
    if (!container) return mappings;

    container.querySelectorAll('.mapping-group').forEach(group => {
        const marketplaceId = group.dataset.marketplaceId;
        group.querySelectorAll('.mapping-entry').forEach(entry => {
            const mappingData = { marketplace_id: marketplaceId };
            if (entry.dataset.mappingId) mappingData.mapping_id = entry.dataset.mappingId;
            let hasData = false;
            entry.querySelectorAll('[data-field-key]').forEach(input => {
                const key = input.dataset.fieldKey;
                const value = input.type === 'checkbox' ? (input.checked ? 'TRUE' : 'FALSE') : input.value.trim();
                mappingData[key] = value;
                if (value && value !== 'FALSE') hasData = true;
            });
            if (hasData) mappings.push(mappingData);
        });
    });
    return mappings;
}

function escapeHTML(str) {
    if (str === null || str === undefined) return '';
    return String(str).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;').replace(/'/g, '&#039;');
}