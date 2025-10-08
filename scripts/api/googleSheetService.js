/**
 * scripts/api/googleSheetService.js
 * * Фінальна об'єднана версія.
 */
import { isGapiReady, SPREADSHEET_ID } from './auth.js';
import { showToast } from '../features/toast.js';
import { generateNextId, initializeIdGenerator } from '../utils/idGenerator.js';

// --- КОНФІГУРАЦІЯ ---
export const ENTITY_CONFIGS = {
    categories: { sheet: "Categories", idField: "local_id", mappingSheet: "CategoryMappings", mappingIdColumn: 'category_local_id' },
    characteristics: { sheet: "Characteristics", idField: "local_id", mappingSheet: "CharacteristicMappings", mappingIdColumn: 'characteristic_local_id' },
    options: { sheet: "Options", idField: "local_id", mappingSheet: "OptionMappings", mappingIdColumn: 'option_local_id' },
    brands: { sheet: "Brands", idField: "local_id", mappingSheet: "BrandMappings", mappingIdColumn: 'brand_local_id' },
    marketplaces: { sheet: "Marketplaces", idField: "marketplace_id" },
    marketplaceFields: { sheet: "MarketplaceFields", idField: "field_id" },
};

const cache = {};
const CACHE_DURATION = 5 * 60 * 1000;
let sheetMetadataCache = null;

// --- БАЗОВІ ФУНКЦІЇ ---
async function ensureGapiReady() {
    try {
        await isGapiReady();
    } catch (error) {
        showToast("Користувач не авторизований.", "error");
        throw new Error("Користувач не авторизований.");
    }
}

function handleGapiError(error, userMessage) {
    let detailMessage = userMessage;
    const gapiError = error.result?.error || error;
    if (gapiError.message) detailMessage += ` Деталі: ${gapiError.message}`;
    showToast(userMessage, 'error');
    console.error("[GSS Error Detail]:", detailMessage, error);
}

function invalidateCache(sheetName) {
    const cacheKey = `${SPREADSHEET_ID}:${sheetName}`;
    if (cache[cacheKey]) {
        cache[cacheKey].timestamp = 0;
    }
}

export function invalidateAllCaches() {
    console.log("[GSS] Інвалідація всіх кешів...");
    Object.keys(cache).forEach(key => {
        if(cache[key]) cache[key].timestamp = 0;
    });
    sheetMetadataCache = null;
}

// --- ДОДАНО ВІДСУТНЮ ФУНКЦІЮ ---
export async function getSheetIdByName(sheetName) {
    if (!sheetMetadataCache) {
        try {
            await ensureGapiReady();
            const response = await gapi.client.sheets.spreadsheets.get({
                spreadsheetId: SPREADSHEET_ID,
                fields: "sheets.properties(sheetId,title)"
            });
            sheetMetadataCache = {};
            response.result.sheets.forEach(sheet => {
                sheetMetadataCache[sheet.properties.title] = sheet.properties.sheetId;
            });
        } catch (error) {
             handleGapiError(error, "Не вдалося отримати метадані таблиці.");
             throw error;
        }
    }
    const sheetId = sheetMetadataCache[sheetName];
    if (sheetId === undefined) throw new Error(`Аркуш з назвою "${sheetName}" не знайдено.`);
    return sheetId;
}
// --- КІНЕЦЬ ДОДАНОГО БЛОКУ ---

// --- ОТРИМАННЯ ДАНИХ (GET) ---
async function getSheetData(sheetName, forceRefresh = false) {
    const cacheKey = `${SPREADSHEET_ID}:${sheetName}`;
    const now = Date.now();

    if (!forceRefresh && cache[cacheKey] && (now - cache[cacheKey].timestamp < CACHE_DURATION)) {
        return JSON.parse(JSON.stringify(cache[cacheKey].data));
    }
    try {
        await ensureGapiReady();
        const response = await gapi.client.sheets.spreadsheets.values.get({
            spreadsheetId: SPREADSHEET_ID,
            range: `${sheetName}!A:Z`,
        });
        const rows = response.result.values;
        if (!rows || rows.length < 1) {
            cache[cacheKey] = { data: [], headers: [], timestamp: now };
            return [];
        }
        const headers = rows[0];
        const data = rows.slice(1).map((row, index) => {
            let obj = { _rowIndex: index + 2 };
            headers.forEach((header, i) => { obj[header] = row[i] || ""; });
            return obj;
        });
        
        const entityConfig = Object.values(ENTITY_CONFIGS).find(c => c.sheet === sheetName);
        if(entityConfig && entityConfig.idField === 'local_id') {
            const prefix = sheetName.slice(0, 3).toLowerCase();
            initializeIdGenerator(prefix, data, 'local_id');
        }

        cache[cacheKey] = { data, headers, timestamp: now };
        return JSON.parse(JSON.stringify(data));
    } catch (error) {
        handleGapiError(error, `Не вдалося завантажити дані з "${sheetName}".`);
        throw error;
    }
}

export const getCategories = (force) => getSheetData(ENTITY_CONFIGS.categories.sheet, force);
export const getCharacteristics = (force) => getSheetData(ENTITY_CONFIGS.characteristics.sheet, force);
export const getOptions = (force) => getSheetData(ENTITY_CONFIGS.options.sheet, force);
export const getBrands = (force) => getSheetData(ENTITY_CONFIGS.brands.sheet, force);
export const getMarketplaces = (force) => getSheetData(ENTITY_CONFIGS.marketplaces.sheet, force);
export const getMarketplaceFields = (force) => getSheetData(ENTITY_CONFIGS.marketplaceFields.sheet, force);
export const getMappings = (entityType, force) => getSheetData(ENTITY_CONFIGS[entityType]?.mappingSheet, force);


// --- ОПЕРАЦІЇ ЗАПИСУ (SAVE) ---
export async function saveEntity(entityType, data) {
    const config = ENTITY_CONFIGS[entityType];
    if (!config) throw new Error(`Конфігурація для '${entityType}' не знайдена.`);
    
    await ensureGapiReady();

    try {
        const sheetName = config.sheet;
        const isEditing = !!data._rowIndex;
        
        if (!isEditing && config.idField === 'local_id') {
            const prefix = sheetName.slice(0, 3).toLowerCase();
            data.local_id = generateNextId(prefix);
        }

        const cacheEntry = cache[`${SPREADSHEET_ID}:${sheetName}`];
        const headers = cacheEntry ? cacheEntry.headers : Object.keys(data).filter(k => !k.startsWith('_'));
        const values = headers.map(header => data[header] ?? "");

        if (isEditing) {
            await gapi.client.sheets.spreadsheets.values.update({
                spreadsheetId: SPREADSHEET_ID,
                range: `${sheetName}!A${data._rowIndex}`,
                valueInputOption: "USER_ENTERED",
                resource: { values: [values] }
            });
        } else {
            await gapi.client.sheets.spreadsheets.values.append({
                spreadsheetId: SPREADSHEET_ID,
                range: `${sheetName}!A1`,
                valueInputOption: "USER_ENTERED",
                insertDataOption: "INSERT_ROWS",
                resource: { values: [values] }
            });
        }

        invalidateCache(sheetName);
        return { status: 'success', data };

    } catch (error) {
        handleGapiError(error, `Помилка збереження запису в "${config.sheet}".`);
        throw error;
    }
}

export async function saveMappings(entityType, masterId, mappingsData) {
    const config = ENTITY_CONFIGS[entityType];
    if (!config || !config.mappingSheet) return;

    await ensureGapiReady();
    const { mappingSheet, mappingIdColumn } = config;

    try {
        const allMappings = await getSheetData(mappingSheet, true);
        const oldRowIndexes = allMappings
            .filter(m => m[mappingIdColumn] === masterId)
            .map(m => m._rowIndex);

        const requests = [];
        
        if (oldRowIndexes.length > 0) {
            const sheetId = await getSheetIdByName(mappingSheet);
            oldRowIndexes.sort((a, b) => b - a).forEach(rowIndex => {
                requests.push({
                    deleteDimension: {
                        range: { sheetId, dimension: "ROWS", startIndex: rowIndex - 1, endIndex: rowIndex }
                    }
                });
            });
        }
        
        if (mappingsData.length > 0) {
            const cacheEntry = cache[`${SPREADSHEET_ID}:${mappingSheet}`];
            const headers = cacheEntry ? cacheEntry.headers : Object.keys(mappingsData[0]).filter(k => !k.startsWith('_'));
            
            const rowsToAdd = mappingsData.map(mapping => {
                const newMapping = { ...mapping, [mappingIdColumn]: masterId };
                if (!newMapping.mapping_id) {
                    newMapping.mapping_id = `map_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
                }
                const values = headers.map(header => newMapping[header] ?? "");
                return { values };
            });

            requests.push({
                appendCells: {
                    sheetId: await getSheetIdByName(mappingSheet),
                    rows: rowsToAdd,
                    fields: "*"
                }
            });
        }
        
        if (requests.length > 0) {
            await gapi.client.sheets.spreadsheets.batchUpdate({
                spreadsheetId: SPREADSHEET_ID,
                resource: { requests }
            });
        }
        
        invalidateCache(mappingSheet);

    } catch (error) {
        handleGapiError(error, `Помилка збереження прив'язок в "${mappingSheet}".`);
        throw error;
    }
}

export async function analyzeCategoriesForDeletion(ids) {
    const allCategories = await getCategories(true);
    const categoriesMap = new Map(allCategories.map(c => [c.local_id, c]));
    const selectedCategories = ids.map(id => categoriesMap.get(id)).filter(Boolean);
    const parentIdsWithChildren = new Set(allCategories.map(c => c.parent_local_id).filter(Boolean));
    const parentsInSelection = [];
    const safeToDelete = [];
    for (const category of selectedCategories) {
        if (parentIdsWithChildren.has(category.local_id)) {
            const children = allCategories.filter(c => c.parent_local_id === category.local_id);
            parentsInSelection.push({ ...category, children, linkedEntities: children, entityType: 'categories' });
        } else {
            safeToDelete.push(category);
        }
    }
    let cascadeDeleteSet = new Set(safeToDelete.map(c => c.local_id));
    parentsInSelection.forEach(p => {
        let toProcess = [p.local_id];
        while (toProcess.length > 0) {
            const currentId = toProcess.shift();
            if (!cascadeDeleteSet.has(currentId)) {
                cascadeDeleteSet.add(currentId);
                const children = allCategories.filter(c => c.parent_local_id === currentId);
                toProcess.push(...children.map(c => c.local_id));
            }
        }
    });
    return { parentsInSelection, safeToDelete, cascadeDeleteList: { categories: Array.from(cascadeDeleteSet) } };
}

export async function analyzeCharacteristicsForDeletion(ids) {
    const [allChars, allOptions] = await Promise.all([getCharacteristics(true), getOptions(true)]);
    const charsMap = new Map(allChars.map(c => [c.local_id, c]));
    const optionsByCharId = new Map();
    allOptions.forEach(opt => {
        if (!optionsByCharId.has(opt.char_local_id)) optionsByCharId.set(opt.char_local_id, []);
        optionsByCharId.get(opt.char_local_id).push(opt);
    });

    const parentsInSelection = [];
    const safeToDelete = [];
    for (const id of ids) {
        const char = charsMap.get(id);
        if (!char) continue;
        const linkedOptions = optionsByCharId.get(id) || [];
        if (linkedOptions.length > 0) {
            parentsInSelection.push({ ...char, linkedEntities: linkedOptions, entityType: 'options' });
        } else {
            safeToDelete.push(char);
        }
    }
    const cascadeDeleteList = { characteristics: [], options: [] };
    parentsInSelection.forEach(p => {
        cascadeDeleteList.characteristics.push(p.local_id);
        p.linkedEntities.forEach(opt => cascadeDeleteList.options.push(opt.local_id));
    });
    safeToDelete.forEach(c => cascadeDeleteList.characteristics.push(c.local_id));
    return { parentsInSelection, safeToDelete, cascadeDeleteList };
}

export async function analyzeOptionsForDeletion(ids) {
    const [allOptions, allChars] = await Promise.all([getOptions(true), getCharacteristics(true)]);
    const optionsMap = new Map(allOptions.map(o => [o.local_id, o]));
    const charsByTriggerId = new Map();
    allChars.forEach(char => {
        if (char.triggering_option_id) {
            if (!charsByTriggerId.has(char.triggering_option_id)) charsByTriggerId.set(char.triggering_option_id, []);
            charsByTriggerId.get(char.triggering_option_id).push(char);
        }
    });

    const triggersInSelection = [];
    const safeToDelete = [];
    for (const id of ids) {
        const option = optionsMap.get(id);
        if (!option) continue;
        const triggeredChars = charsByTriggerId.get(id) || [];
        if (triggeredChars.length > 0) {
            triggersInSelection.push({ ...option, linkedEntities: triggeredChars, entityType: 'characteristics' });
        } else {
            safeToDelete.push(option);
        }
    }
    const cascadeDeleteList = { options: [], characteristics: [] };
    triggersInSelection.forEach(t => {
        cascadeDeleteList.options.push(t.local_id);
        t.linkedEntities.forEach(char => cascadeDeleteList.characteristics.push(char.local_id));
    });
    safeToDelete.forEach(o => cascadeDeleteList.options.push(o.local_id));
    
    const allOptionsToDelete = new Set(cascadeDeleteList.options);
    allOptions.forEach(opt => {
        if (cascadeDeleteList.characteristics.includes(opt.char_local_id)) {
            allOptionsToDelete.add(opt.local_id);
        }
    });
    cascadeDeleteList.options = Array.from(allOptionsToDelete);
    return { parentsInSelection: triggersInSelection, safeToDelete, cascadeDeleteList };
}

export async function batchDelete(itemsToDelete) {
    if (Object.keys(itemsToDelete).length === 0) return { status: 'success' };
    try {
        const [allCategories, allCharacteristics, allOptions, allBrands] = await Promise.all([
            getCategories(true), getCharacteristics(true), getOptions(true), getBrands(true)
        ]);
        const dataMap = { categories: allCategories, characteristics: allCharacteristics, options: allOptions, brands: allBrands };
        
        const requests = [];
        for (const entityType in itemsToDelete) {
            if (itemsToDelete[entityType]?.length > 0) {
                const config = ENTITY_CONFIGS[entityType];
                const data = dataMap[entityType];
                const sheetId = await getSheetIdByName(config.sheet);
                const rowIndexes = data.filter(item => itemsToDelete[entityType].includes(item[config.idField])).map(item => item._rowIndex);
                rowIndexes.sort((a,b) => b-a).forEach(rowIndex => {
                    requests.push({ deleteDimension: { range: { sheetId, dimension: 'ROWS', startIndex: rowIndex - 1, endIndex: rowIndex } } });
                });
            }
        }

        if(requests.length > 0) {
            await gapi.client.sheets.spreadsheets.batchUpdate({
                spreadsheetId: SPREADSHEET_ID,
                resource: { requests }
            });
        }
        
        invalidateAllCaches();
        return { status: 'success' };
    } catch (error) {
        console.error("Помилка в batchDelete:", error);
        return { status: 'error', message: `Помилка API: ${error.result?.error?.message || error.message}` };
    }
}

export async function performEntityMerge(entityType, masterId, idsToMerge) {
     if (!masterId || !idsToMerge || idsToMerge.length === 0) {
        throw new Error("Некоректні параметри для об'єднання.");
    }
    const config = ENTITY_CONFIGS[entityType];

    try {
        const referenceUpdateRequests = await validateAndGenerateReferenceUpdates(entityType, masterId, idsToMerge);
        const marketplaceConfig = (await getMarketplaces(true)).reduce((acc, mp) => { acc[mp.marketplace_id] = mp; return acc; }, {});
        const mappingUpdateRequests = await generateMappingTransferRequests(config, masterId, idsToMerge, marketplaceConfig);

        const allUpdateRequests = [...referenceUpdateRequests, ...mappingUpdateRequests];

        if (allUpdateRequests.length > 0) {
            await gapi.client.sheets.spreadsheets.batchUpdate({
                spreadsheetId: SPREADSHEET_ID,
                resource: { requests: allUpdateRequests }
            });
        }

        await batchDelete({ [entityType]: idsToMerge });
        invalidateAllCaches();

    } catch (error) {
        console.error(`[GSS Merge] Помилка під час об'єднання ${entityType}:`, error);
        invalidateAllCaches();
        throw error;
    }
}

async function validateAndGenerateReferenceUpdates(entityType, masterId, idsToMerge) {
    switch (entityType) {
        case 'categories':
            return await validateAndMergeCategoriesRefs(masterId, idsToMerge);
        case 'characteristics':
            return await validateAndMergeCharacteristicsRefs(masterId, idsToMerge);
        case 'options':
        case 'brands':
            return []; 
        default:
            throw new Error(`Об'єднання для сутності ${entityType} не підтримується.`);
    }
}

// --- ДОДАЙТЕ ЦЕЙ КОД В КІНЕЦЬ ФАЙЛУ googleSheetService.js ---

async function _batchAppend(sheetName, data) {
    if (data.length === 0) return;
    await gapi.client.sheets.spreadsheets.values.append({
        spreadsheetId: SPREADSHEET_ID,
        range: `${sheetName}!A1`,
        valueInputOption: "USER_ENTERED",
        insertDataOption: "INSERT_ROWS",
        resource: { values: data }
    });
}

async function _batchUpdate(sheetName, data) {
    if (data.length === 0) return;
    const dataForUpdate = data.map(item => ({
        range: `${sheetName}!A${item._rowIndex}`,
        values: [item.values]
    }));
    await gapi.client.sheets.spreadsheets.values.batchUpdate({
        spreadsheetId: SPREADSHEET_ID,
        resource: { 
            valueInputOption: 'USER_ENTERED', 
            data: dataForUpdate 
        }
    });
}

export async function batchSaveCharacteristics(toCreate, toUpdate) {
    const sheetName = ENTITY_CONFIGS.characteristics.sheet;
    const cacheEntry = cache[`${SPREADSHEET_ID}:${sheetName}`];
    if (!cacheEntry) throw new Error("Кеш для характеристик не ініціалізовано.");
    
    const headers = cacheEntry.headers;
    const creator = (data) => headers.map(h => data[h] ?? "");
    
    if (toCreate.length > 0) await _batchAppend(sheetName, toCreate.map(creator));
    if (toUpdate.length > 0) {
        const updater = toUpdate.map(d => ({ _rowIndex: d._rowIndex, values: creator(d) }));
        await _batchUpdate(sheetName, updater);
    }
}

export async function batchSaveOptions(toCreate, toUpdate) {
    const sheetName = ENTITY_CONFIGS.options.sheet;
    const cacheEntry = cache[`${SPREADSHEET_ID}:${sheetName}`];
    if (!cacheEntry) throw new Error("Кеш для опцій не ініціалізовано.");

    const headers = cacheEntry.headers;
    const creator = (data) => headers.map(h => data[h] ?? "");

    if (toCreate.length > 0) await _batchAppend(sheetName, toCreate.map(creator));
    if (toUpdate.length > 0) {
        const updater = toUpdate.map(d => ({ _rowIndex: d._rowIndex, values: creator(d) }));
        await _batchUpdate(sheetName, updater);
    }
}