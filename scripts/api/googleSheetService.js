/**
 * scripts/api/googleSheetService.js
 * * Оновлений шар доступу до даних Google Sheets.
 * Підтримує нову архітектуру з маркетплейсами, полями та мапінгами.
 */

import { SPREADSHEET_ID } from './auth.js';
import { showToast } from '../features/toast.js';
import { generateNextId, initializeIdGenerator } from '../utils/idGenerator.js';

// Кеш для зберігання даних та метаданих
const cache = {};
const CACHE_DURATION = 5 * 60 * 1000; // 5 хвилин
let sheetMetadataCache = null;

// Конфігурація сутностей для спрощення доступу до них
export const ENTITY_CONFIGS = {
    marketplaces: { sheet: "Marketplaces", idField: "marketplace_id" },
    marketplaceFields: { sheet: "MarketplaceFields", idField: "field_id" },
    categories: { sheet: "Categories", idField: "local_id", mappingSheet: "CategoryMappings", mappingIdColumn: 'category_local_id' },
    characteristics: { sheet: "Characteristics", idField: "local_id", mappingSheet: "CharacteristicMappings", mappingIdColumn: 'characteristic_local_id' },
    options: { sheet: "Options", idField: "local_id", mappingSheet: "OptionMappings", mappingIdColumn: 'option_local_id' },
    brands: { sheet: "Brands", idField: "local_id", mappingSheet: "BrandMappings", mappingIdColumn: 'brand_local_id' },
};


// --- Базові функції та Ініціалізація ---

async function ensureGapiReady() {
    // Ця функція тепер використовує isGapiReady з auth.js, яка повертає проміс
    // Це забезпечує надійне очікування завершення асинхронної ініціалізації GAPI
    try {
        await isGapiReady();
    } catch (error) {
        showToast("Користувач не авторизований. Будь ласка, увійдіть.", "error");
        throw new Error("Користувач не авторизований.");
    }
    if (typeof gapi === 'undefined' || !gapi.client || !gapi.client.sheets) {
        throw new Error("GAPI клієнт не ініціалізовано.");
    }
}

function handleGapiError(error, userMessage) {
    let detailMessage = userMessage;
    const gapiError = error.result?.error || error;

    if (gapiError.message) detailMessage += ` Деталі: ${gapiError.message}`;
    if (gapiError.code) detailMessage += ` (Код: ${gapiError.code})`;

    const errorMessages = {
        403: "Помилка доступу (403). Переконайтесь, що у вас є права на редагування цієї таблиці.",
        404: "Таблицю або аркуш не знайдено (404). Перевірте SPREADSHEET_ID та назви аркушів.",
        429: "Перевищено ліміт запитів до Google Sheets API (429). Спробуйте пізніше."
    };

    showToast(errorMessages[gapiError.code] || userMessage, 'error');
    console.error("[GSS Error Detail]:", detailMessage, error);
}

function invalidateCache(sheetName) {
    const cacheKey = `${SPREADSHEET_ID}:${sheetName}`;
    if (cache[cacheKey]) {
        cache[cacheKey].timestamp = 0;
        console.log(`[GSS] Кеш для ${sheetName} інвалідовано.`);
    }
}

export function invalidateAllCaches() {
    console.log("[GSS] Інвалідація всіх кешів...");
    for (const key in cache) {
        if (Object.hasOwnProperty.call(cache, key)) {
            cache[key].timestamp = 0;
        }
    }
    sheetMetadataCache = null;
}

// --- Функції Читання Даних (GET) ---

async function getSheetData(sheetName, forceRefresh = false) {
    const cacheKey = `${SPREADSHEET_ID}:${sheetName}`;
    const now = Date.now();

    if (!forceRefresh && cache[cacheKey] && (now - cache[cacheKey].timestamp < CACHE_DURATION) && cache[cacheKey].timestamp !== 0) {
        return JSON.parse(JSON.stringify(cache[cacheKey].data));
    }

    try {
        await ensureGapiReady();
        console.log(`[GSS] Завантаження свіжих даних для: ${sheetName}`);
        
        const response = await gapi.client.sheets.spreadsheets.values.get({
            spreadsheetId: SPREADSHEET_ID,
            range: `${sheetName}!A:Z`, // Завжди беремо до Z для гнучкості
        });

        const rows = response.result.values;
        if (!rows || rows.length < 1) { // Пустий аркуш
            const emptyData = [];
            cache[cacheKey] = { data: emptyData, headers: [], timestamp: now };
            return emptyData;
        }

        const headers = rows[0];
        const data = rows.slice(1).map((row, index) => {
            let obj = { _rowIndex: index + 2 }; // Зберігаємо реальний номер рядка в Sheets
            headers.forEach((header, i) => {
                obj[header] = row[i] || "";
            });
            return obj;
        });
        
        // Ініціалізуємо генератор ID, якщо це основна сутність
        const entityConfig = Object.values(ENTITY_CONFIGS).find(c => c.sheet === sheetName);
        if(entityConfig && entityConfig.idField === 'local_id') {
            const prefix = sheetName.slice(0, 3).toLowerCase();
            initializeIdGenerator(prefix, data, 'local_id');
        }

        cache[cacheKey] = { data, headers, timestamp: now };
        return JSON.parse(JSON.stringify(data));

    } catch (error) {
        handleGapiError(error, `Не вдалося завантажити дані з аркуша "${sheetName}".`);
        throw error;
    }
}

// Створюємо експортні функції для кожної сутності
export const getMarketplaces = (force) => getSheetData(ENTITY_CONFIGS.marketplaces.sheet, force);
export const getMarketplaceFields = (force) => getSheetData(ENTITY_CONFIGS.marketplaceFields.sheet, force);
export const getCategories = (force) => getSheetData(ENTITY_CONFIGS.categories.sheet, force);
export const getCharacteristics = (force) => getSheetData(ENTITY_CONFIGS.characteristics.sheet, force);
export const getOptions = (force) => getSheetData(ENTITY_CONFIGS.options.sheet, force);
export const getBrands = (force) => getSheetData(ENTITY_CONFIGS.brands.sheet, force);

// Універсальна функція для отримання мапінгів
export async function getMappings(entityType, forceRefresh = false) {
    const config = ENTITY_CONFIGS[entityType];
    if (!config || !config.mappingSheet) return [];
    return getSheetData(config.mappingSheet, forceRefresh);
}

// --- Універсальні функції Запису Даних (CRUD) ---

/**
 * Універсальна функція для збереження (створення/оновлення) основного запису сутності.
 */
export async function saveEntity(entityType, data) {
    const config = ENTITY_CONFIGS[entityType];
    if (!config) throw new Error(`Конфігурація для '${entityType}' не знайдена.`);
    
    await ensureGapiReady();

    try {
        const sheetName = config.sheet;
        const allItems = await getSheetData(sheetName, true); // Завжди свіжі дані для перевірки
        const isEditing = !!data._rowIndex;
        
        // Генеруємо новий ID, якщо це новий запис
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

/**
 * Універсальна функція для збереження прив'язок (мапінгів) для однієї сутності.
 * Використовує стратегію "видалити всі старі та додати всі нові".
 */
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

        // Пакетний запит на видалення старих та додавання нових
        const requests = [];
        
        // 1. Запити на видалення (якщо є що видаляти)
        if (oldRowIndexes.length > 0) {
            const sheetId = await getSheetIdByName(mappingSheet); // Потрібен ID аркуша для видалення
            // Сортуємо у зворотному порядку, щоб не збивати індекси
            oldRowIndexes.sort((a, b) => b - a).forEach(rowIndex => {
                requests.push({
                    deleteDimension: {
                        range: { sheetId, dimension: "ROWS", startIndex: rowIndex - 1, endIndex: rowIndex }
                    }
                });
            });
        }
        
        // 2. Запити на додавання (якщо є що додавати)
        if (mappingsData.length > 0) {
            const cacheEntry = cache[`${SPREADSHEET_ID}:${mappingSheet}`];
            const headers = cacheEntry ? cacheEntry.headers : Object.keys(mappingsData[0]).filter(k => !k.startsWith('_'));
            
            const rowsToAdd = mappingsData.map(mapping => {
                const newMapping = { ...mapping, [mappingIdColumn]: masterId };
                // Генеруємо ID для мапінгу, якщо його немає
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
        
        // Виконуємо пакетний запит, якщо є що робити
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

// --- Допоміжні функції (напр. для отримання ID аркуша) ---

async function getSheetIdByName(sheetName) {
    if (!sheetMetadataCache) {
        try {
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