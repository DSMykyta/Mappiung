// /scripts/api/googleSheetService.js

const SPREADSHEET_ID = '1iFOCQUbisLprSfIkfCar3Oc5f8JW12kA0dpHzjEXSsk';

const SHEET_CONFIG = {
    CATEGORIES: {
        SHEET_ID: 0,
        NAME: 'Categories',
        RANGE: 'Categories!A:Q',
        DATA_TO_ARRAY: (data) => [
            data.local_id, data.parent_local_id, data.name_uk, data.name_ru, data.category_type, 
            data.etalon_id, data.etalon_name, data.rztk_id, data.rztk_name,
            data.epicenter_id, data.epicenter_name, data.allo_id, data.allo_name, 
            data.fua_id, data.fua_name, data.maudau_id, data.maudau_name
        ]
    },
    CHARACTERISTICS: {
        SHEET_ID: 1920085899,
        NAME: 'Characteristics',
        RANGE: 'Characteristics!A:V',
        DATA_TO_ARRAY: (data) => [
            data.local_id, data.name_uk, data.name_ru, data.category_local_ids, data.triggering_option_id,
            data.param_type, data.unit, data.filter_type, data.is_global, data.notes,
            data.etalon_id, data.etalon_name, data.etalon_param_type, data.etalon_filter_type, data.etalon_unit,
            data.rztk_id, data.rztk_name, data.rztk_param_type, data.rztk_filter_type, data.rztk_unit
        ]
    },
    OPTIONS: {
        SHEET_ID: 28101212,
        NAME: 'Options',
        RANGE: 'Options!A:H',
        DATA_TO_ARRAY: (data) => [
            data.local_id, data.char_local_id, data.name_uk, data.name_ru,
            data.etalon_id, data.etalon_name, data.rztk_id, data.rztk_name
        ]
    }
};

let categoryCache = null, characteristicCache = null, optionCache = null;

export function _generateNewId(prefix, allItems) {
    const maxId = allItems.reduce((max, item) => {
        if (item.local_id && item.local_id.startsWith(`${prefix}_`)) {
            const idNum = parseInt(item.local_id.split('_')[1], 10);
            return !isNaN(idNum) && idNum > max ? idNum : max;
        }
        return max;
    }, 0);
    const newIdNumber = maxId + 1;
    const paddedId = String(newIdNumber).padStart(13, '0');
    return `${prefix}_${paddedId}`;
}

async function _deleteRowsByIndexes(sheetId, rowIndexes) {
    if (rowIndexes.length === 0) return;
    rowIndexes.sort((a, b) => b - a);
    const requests = rowIndexes.map(rowIndex => ({
        deleteDimension: {
            range: { sheetId, dimension: 'ROWS', startIndex: rowIndex - 1, endIndex: rowIndex }
        }
    }));
    await gapi.client.sheets.spreadsheets.batchUpdate({
        spreadsheetId: SPREADSHEET_ID,
        resource: { requests }
    });
}

async function _findAndSave(entityData, config, getter) {
    if (!gapi.client.getToken()) return { status: 'error', message: 'Не авторизовано.' };
    try {
        const isNew = !entityData.local_id;
        const allItems = await getter(true);
        if (isNew) {
            entityData.local_id = _generateNewId(config.NAME.slice(0, 3).toLowerCase(), allItems);
        }
        const values = config.DATA_TO_ARRAY(entityData);
        let itemToUpdate = !isNew ? allItems.find(item => item.local_id === entityData.local_id) : null;
        if (itemToUpdate) {
            const range = `${config.NAME}!A${itemToUpdate.rowIndex}`;
            const updateRange = range.split('!')[0] + '!' + range.split('!')[1].split(':')[0] + ':' + String.fromCharCode(65 + values.length - 1) + itemToUpdate.rowIndex;
            await gapi.client.sheets.spreadsheets.values.update({
                spreadsheetId: SPREADSHEET_ID, range: updateRange, valueInputOption: 'USER_ENTERED', resource: { values: [values] }
            });
        } else {
            await gapi.client.sheets.spreadsheets.values.append({
                spreadsheetId: SPREADSHEET_ID, range: config.RANGE, valueInputOption: 'USER_ENTERED', resource: { values: [values] }
            });
        }
        clearAllCaches();
        return { status: 'success', updatedData: entityData };
    } catch (err) {
        console.error(`Помилка збереження для ${config.NAME}:`, err);
        return { status: 'error', message: 'Помилка Google API: ' + err.message };
    }
}

export function clearAllCaches() {
    categoryCache = null; characteristicCache = null; optionCache = null;
    console.log("Усі кеші очищено.");
}

// --- КАТЕГОРІЇ ---
export async function getCategories(forceRefresh = false) {
    if (categoryCache && !forceRefresh) return categoryCache;
    try {
        const response = await gapi.client.sheets.spreadsheets.values.get({ spreadsheetId: SPREADSHEET_ID, range: 'Categories!A2:R' });
        const values = response.result.values || [];
        categoryCache = values.map((row, index) => ({
            rowIndex: index + 2, local_id: row[0], parent_local_id: row[1], name_uk: row[2],
            name_ru: row[3], category_type: row[4], etalon_id: row[5], etalon_name: row[6],
            rztk_id: row[7], rztk_name: row[8], epicenter_id: row[9], epicenter_name: row[10],
            allo_id: row[11], allo_name: row[12], fua_id: row[13], fua_name: row[14],
            maudau_id: row[15], maudau_name: row[16],
        }));
        return categoryCache;
    } catch (err) { console.error("Помилка завантаження категорій:", err); throw err; }
}

export async function getCategoryById(categoryId, forceRefresh = false) {
    const allCategories = await getCategories(forceRefresh);
    return allCategories.find(category => category.local_id === categoryId) || null;
}

export async function saveCategory(categoryData) { return _findAndSave(categoryData, SHEET_CONFIG.CATEGORIES, getCategories); }

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
            parentsInSelection.push({ ...category, children });
        } else {
            safeToDelete.push(category);
        }
    }
    let cascadeDeleteSet = new Set();
    if (parentsInSelection.length > 0) {
        let toProcess = parentsInSelection.map(p => p.local_id);
        while (toProcess.length > 0) {
            const currentId = toProcess.shift();
            if (!cascadeDeleteSet.has(currentId)) {
                cascadeDeleteSet.add(currentId);
                const children = allCategories.filter(c => c.parent_local_id === currentId);
                toProcess.push(...children.map(c => c.local_id));
            }
        }
    }
    safeToDelete.forEach(c => cascadeDeleteSet.add(c.local_id));
    return { parentsInSelection, safeToDelete, cascadeDeleteList: Array.from(cascadeDeleteSet) };
}

export async function analyzeCharacteristicsForDeletion(ids) {
    const [allChars, allOptions] = await Promise.all([getCharacteristics(true), getOptions(true)]);
    const charsMap = new Map(allChars.map(c => [c.local_id, c]));
    
    const parentsInSelection = [];
    const safeToDelete = [];

    // Створюємо мапу для швидкого пошуку опцій за ID характеристики
    const optionsByCharId = new Map();
    allOptions.forEach(opt => {
        if (!optionsByCharId.has(opt.char_local_id)) {
            optionsByCharId.set(opt.char_local_id, []);
        }
        optionsByCharId.get(opt.char_local_id).push(opt);
    });

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
    
    const triggersInSelection = [];
    const safeToDelete = [];

    const charsByTriggerId = new Map();
    allChars.forEach(char => {
        if (char.triggering_option_id) {
            if (!charsByTriggerId.has(char.triggering_option_id)) {
                charsByTriggerId.set(char.triggering_option_id, []);
            }
            charsByTriggerId.get(char.triggering_option_id).push(char);
        }
    });

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
    
    // Потрібно також знайти і видалити опції, що належали характеристикам, які ми видаляємо
    const charsToDeleteCascaded = cascadeDeleteList.characteristics;
    const allOptionsToDelete = new Set(cascadeDeleteList.options);
    allOptions.forEach(opt => {
        if (charsToDeleteCascaded.includes(opt.char_local_id)) {
            allOptionsToDelete.add(opt.local_id);
        }
    });
    cascadeDeleteList.options = Array.from(allOptionsToDelete);

    // `parentsInSelection` - це узагальнена назва для сутностей із залежностями
    return { parentsInSelection: triggersInSelection, safeToDelete, cascadeDeleteList };
}

/**
 * (НОВА ФУНКЦІЯ) Пакетно видаляє записи з різних таблиць.
 * @param {object} itemsToDelete - Об'єкт з масивами ID для видалення, напр. { categories: [...], options: [...] }
 */
export async function batchDelete(itemsToDelete) {
    if (Object.keys(itemsToDelete).length === 0) return { status: 'success' };
    
    try {
        const [allCategories, allCharacteristics, allOptions] = await Promise.all([
            getCategories(true), getCharacteristics(true), getOptions(true)
        ]);
        
        const requests = [];

        if (itemsToDelete.categories?.length > 0) {
            const rowIndexes = allCategories.filter(c => itemsToDelete.categories.includes(c.local_id)).map(c => c.rowIndex);
            requests.push(...rowIndexes.map(idx => ({ sheetId: SHEET_CONFIG.CATEGORIES.SHEET_ID, rowIndex: idx })));
        }
        if (itemsToDelete.characteristics?.length > 0) {
            const rowIndexes = allCharacteristics.filter(c => itemsToDelete.characteristics.includes(c.local_id)).map(c => c.rowIndex);
            requests.push(...rowIndexes.map(idx => ({ sheetId: SHEET_CONFIG.CHARACTERISTICS.SHEET_ID, rowIndex: idx })));
        }
        if (itemsToDelete.options?.length > 0) {
            const rowIndexes = allOptions.filter(o => itemsToDelete.options.includes(o.local_id)).map(o => o.rowIndex);
            requests.push(...rowIndexes.map(idx => ({ sheetId: SHEET_CONFIG.OPTIONS.SHEET_ID, rowIndex: idx })));
        }

        const uniqueRequests = Array.from(new Map(requests.map(r => [`${r.sheetId}-${r.rowIndex}`, r])).values());
        
        uniqueRequests.sort((a, b) => b.rowIndex - a.rowIndex);
        
        const batchRequests = uniqueRequests.map(req => ({
            deleteDimension: {
                range: { sheetId: req.sheetId, dimension: 'ROWS', startIndex: req.rowIndex - 1, endIndex: req.rowIndex }
            }
        }));

        if(batchRequests.length > 0) {
            await gapi.client.sheets.spreadsheets.batchUpdate({
                spreadsheetId: SPREADSHEET_ID,
                resource: { requests: batchRequests }
            });
        }
        
        clearAllCaches();
        return { status: 'success' };
    } catch (error) {
        console.error("Помилка в batchDelete:", error);
        return { status: 'error', message: `Помилка API: ${error.result?.error?.message || error.message}` };
    }
}

export async function deleteCategoriesByIds(finalIdsToDelete) {
    try {
        const allCategories = await getCategories(true);
        const rowIndexesToDelete = allCategories
            .filter(cat => finalIdsToDelete.includes(cat.local_id))
            .map(cat => cat.rowIndex)
            .filter(Boolean);
        await _deleteRowsByIndexes(SHEET_CONFIG.CATEGORIES.SHEET_ID, rowIndexesToDelete);
        clearAllCaches();
        return { status: 'success' };
    } catch (error) {
        console.error("Помилка в deleteCategoriesByIds:", error);
        return { status: 'error', message: `Помилка API: ${error.result?.error?.message || error.message}` };
    }
}

// --- ХАРАКТЕРИСТИКИ ---
export async function getCharacteristics(forceRefresh = false) {
    if (characteristicCache && !forceRefresh) return characteristicCache;
    try {
        const response = await gapi.client.sheets.spreadsheets.values.get({ spreadsheetId: SPREADSHEET_ID, range: 'Characteristics!A2:V' });
        const values = response.result.values || [];
        characteristicCache = values.map((row, index) => ({
            rowIndex: index + 2, local_id: row[0], name_uk: row[1], name_ru: row[2],
            category_local_ids: row[3] || '', triggering_option_id: row[4], param_type: row[5], unit: row[6],
            filter_type: row[7], is_global: row[8], notes: row[9] || '',
            etalon_id: row[10], etalon_name: row[11], etalon_param_type: row[12], etalon_filter_type: row[13], etalon_unit: row[14],
            rztk_id: row[15], rztk_name: row[16], rztk_param_type: row[17], rztk_filter_type: row[18], rztk_unit: row[19],
        }));
        return characteristicCache;
    } catch (err) { console.error("Помилка завантаження характеристик:", err); throw err; }
}

export async function getCharacteristicById(charId, forceRefresh = false) {
    const allCharacteristics = await getCharacteristics(forceRefresh);
    return allCharacteristics.find(c => c.local_id === charId) || null;
}

export async function saveCharacteristic(charData) { return _findAndSave(charData, SHEET_CONFIG.CHARACTERISTICS, getCharacteristics); }

export async function deleteCharacteristicsByIds(idsToDelete) {
    try {
        const [allOptions, allCharacteristics] = await Promise.all([getOptions(true), getCharacteristics(true)]);
        const optionsParentIds = new Set(allOptions.map(opt => opt.char_local_id));
        const characteristicsToDelete = allCharacteristics.filter(char => idsToDelete.includes(char.local_id));
        for (const char of characteristicsToDelete) {
            if (optionsParentIds.has(char.local_id)) {
                return { status: 'error', message: `Не можна видалити '${char.name_uk}', бо до неї прив'язані опції.` };
            }
        }
        const rowIndexesToDelete = characteristicsToDelete.map(c => c.rowIndex).filter(Boolean);
        await _deleteRowsByIndexes(SHEET_CONFIG.CHARACTERISTICS.SHEET_ID, rowIndexesToDelete);
        clearAllCaches();
        return { status: 'success' };
    } catch (error) {
        return { status: 'error', message: `Помилка API: ${error.result?.error?.message || error.message}` };
    }
}

// --- ОПЦІЇ ---
export async function getOptions(forceRefresh = false) {
    if (optionCache && !forceRefresh) return optionCache;
    try {
        const response = await gapi.client.sheets.spreadsheets.values.get({ spreadsheetId: SPREADSHEET_ID, range: 'Options!A2:H' });
        const values = response.result.values || [];
        optionCache = values.map((row, index) => ({
            rowIndex: index + 2, local_id: row[0], char_local_id: row[1], name_uk: row[2], name_ru: row[3],
            etalon_id: row[4], etalon_name: row[5], rztk_id: row[6], rztk_name: row[7],
        }));
        return optionCache;
    } catch (err) { console.error("Помилка завантаження опцій:", err); throw err; }
}

export async function getOptionById(optionId, forceRefresh = false) {
    const allOptions = await getOptions(forceRefresh);
    return allOptions.find(option => option.local_id === optionId) || null;
}

export async function saveOption(optionData) { return _findAndSave(optionData, SHEET_CONFIG.OPTIONS, getOptions); }

export async function deleteOptionsByIds(idsToDelete) {
    try {
        const [allChars, allOptions] = await Promise.all([getCharacteristics(true), getOptions(true)]);
        const triggerIds = new Set(allChars.map(c => c.triggering_option_id));
        for (const id of idsToDelete) {
            if (triggerIds.has(id)) {
                return { status: 'error', message: `Не можна видалити опцію з ID ${id}, бо вона є тригером.` };
            }
        }
        const rowIndexesToDelete = allOptions.filter(opt => idsToDelete.includes(opt.local_id)).map(o => o.rowIndex).filter(Boolean);
        await _deleteRowsByIndexes(SHEET_CONFIG.OPTIONS.SHEET_ID, rowIndexesToDelete);
        clearAllCaches();
        return { status: 'success' };
    } catch (error) {
        return { status: 'error', message: `Помилка API: ${error.result?.error?.message || error.message}` };
    }
}

// --- ЗВ'ЯЗКИ ---
export async function getChildCategories(parentId) {
    const allCategories = await getCategories();
    return allCategories.filter(category => category.parent_local_id === parentId);
}

export async function getLinkedCharacteristics(categoryId) {
    const allCharacteristics = await getCharacteristics();
    return allCharacteristics.filter(char => {
        if (char.is_global === 'TRUE') return true;
        if (char.category_local_ids) {
            const categoryIds = char.category_local_ids.split(',').map(id => id.trim());
            return categoryIds.includes(categoryId);
        }
        return false;
    });
}

export async function getOptionsForCharacteristic(characteristicId) {
    const allOptions = await getOptions();
    return allOptions.filter(option => option.char_local_id === characteristicId);
}

export async function getCharacteristicsTriggeredByOption(optionId) {
    const allCharacteristics = await getCharacteristics();
    return allCharacteristics.filter(char => char.triggering_option_id === optionId);
}


// --- ПАКЕТНІ ОПЕРАЦІЇ ---
// (ВИПРАВЛЕНО) Додано `export`, щоб зробити функції доступними для імпортера
export async function _batchAppend(sheetName, dataArrays) {
    if (dataArrays.length === 0) return;
    await gapi.client.sheets.spreadsheets.values.append({
        spreadsheetId: SPREADSHEET_ID, range: `${sheetName}!A:A`, valueInputOption: 'USER_ENTERED', resource: { values: dataArrays }
    });
}
export async function _batchUpdate(sheetName, data) {
    if (data.length === 0) return;
    const dataForUpdate = data.map(item => ({
        range: `${sheetName}!A${item.rowIndex}:${String.fromCharCode(65 + item.values.length - 1)}${item.rowIndex}`,
        values: [item.values]
    }));
    await gapi.client.sheets.spreadsheets.values.batchUpdate({
        spreadsheetId: SPREADSHEET_ID, resource: { valueInputOption: 'USER_ENTERED', data: dataForUpdate }
    });
}

export async function batchSaveCharacteristics(toCreate, toUpdate) {
    const creator = SHEET_CONFIG.CHARACTERISTICS.DATA_TO_ARRAY;
    if (toCreate.length > 0) await _batchAppend('Characteristics', toCreate.map(creator));
    if (toUpdate.length > 0) {
        const updater = toUpdate.map(d => ({ rowIndex: d.rowIndex, values: creator(d) }));
        await _batchUpdate('Characteristics', updater);
    }
}

export async function batchSaveOptions(toCreate, toUpdate) {
    const creator = SHEET_CONFIG.OPTIONS.DATA_TO_ARRAY;
    if (toCreate.length > 0) await _batchAppend('Options', toCreate.map(creator));
    if (toUpdate.length > 0) {
        const updater = toUpdate.map(d => ({ rowIndex: d.rowIndex, values: creator(d) }));
        await _batchUpdate('Options', updater);
    }
}
