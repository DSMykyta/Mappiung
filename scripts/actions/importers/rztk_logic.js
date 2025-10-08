// scripts/actions/importers/rztk_logic.js
import { getCharacteristics, getOptions, getMappings, batchSaveCharacteristics, batchSaveOptions, invalidateAllCaches } from '../../api/googleSheetService.js';
import { generateNextId, initializeIdGenerator } from '../../utils/idGenerator.js';
import { showToast } from '../../features/toast.js';

async function runProcessingLogic(rows, header, targetCategoryId, log, updateProgress) {
    log('3/5: Завантаження існуючих довідників...');
    const [existingChars, existingOptions, existingCharMappings] = await Promise.all([
        getCharacteristics(true), 
        getOptions(true),
        getMappings('characteristics', true)
    ]);
    
    // Ініціалізуємо генератори ID на основі завантажених даних
    initializeIdGenerator('cha', existingChars);
    initializeIdGenerator('opt', existingOptions);

    const mappedRztkIds = new Set(
        existingCharMappings
            .filter(m => m.marketplace_id === 'rozetka' && m.rztk_id)
            .map(m => m.rztk_id.toString())
    );

    log(`Завантажено ${existingChars.length} характеристик та ${existingOptions.length} опцій.`);
    log('4/5: Аналіз даних...');

    let charsToCreate = [];
    let charsToUpdate = [];
    let optionsToCreate = [];
    let charMappingsToCreate = [];
    let ignoredCharsCount = 0;
    let ignoredOptionsCount = 0;
    const processedCharRztkIds = new Set();
    
    const h = (name) => header.indexOf(name);

    for (const [index, row] of rows.entries()) {
        const rztkParamId = row[h('ID параметра')]?.toString();
        if (!rztkParamId || rztkParamId.trim() === '') continue;

        let char;
        const existingMapping = existingCharMappings.find(m => m.rztk_id === rztkParamId && m.marketplace_id === 'rozetka');
        char = existingMapping ? existingChars.find(c => c.local_id === existingMapping.characteristic_local_id) : null;

        const isGlobal = (row[h('Наскрізний параметр')] || '').trim().toLowerCase() === 'так' ? 'TRUE' : 'FALSE';

        if (char) { // Характеристика вже існує
            if (isGlobal !== 'TRUE' && !char.category_local_ids.split(',').includes(targetCategoryId)) {
                char.category_local_ids = [char.category_local_ids, targetCategoryId].filter(Boolean).join(',');
                charsToUpdate.push(char);
            } else {
                ignoredCharsCount++;
            }
        } else { // Створюємо нову характеристику та її мапінг
            char = {
                local_id: generateNextId('cha'),
                name_uk: row[h('Назва параметра')],
                is_global: isGlobal,
                category_local_ids: isGlobal === 'TRUE' ? '' : targetCategoryId,
                // інші поля за замовчуванням
            };
            charsToCreate.push(char);

            const newMapping = {
                characteristic_local_id: char.local_id,
                marketplace_id: 'rozetka',
                rztk_id: rztkParamId,
                rztk_name: row[h('Назва параметра')]
                // інші поля мапінгу
            };
            charMappingsToCreate.push(newMapping);
        }
        
        // ... логіка для опцій (потребує аналогічного оновлення) ...

        if ((index + 1) % 50 === 0 || index === rows.length - 1) {
            updateProgress(index + 1, rows.length);
            await new Promise(resolve => setTimeout(resolve, 0));
        }
    }

    log(`Аналіз завершено.`);
    log('5/5: Збереження даних у Google Sheets...');
    
    // Потрібно реалізувати batchSaveMappings або зберігати по одному
    // await saveMappings('characteristics', charMappingsToCreate); 
    await batchSaveCharacteristics(charsToCreate, charsToUpdate);
    await batchSaveOptions(optionsToCreate, []);

    log('Імпорт завершено!');
    invalidateAllCaches();

    return {
        charsCreated: charsToCreate.length,
        charsIgnored: charsToUpdate.length + ignoredCharsCount,
        optionsCreated: optionsToCreate.length,
        optionsIgnored: ignoredOptionsCount,
    };
}

export async function processRztkFile(file, targetCategoryId, log, updateProgress) {
    try {
        log('1/5: Читання файлу .xls...');
        const data = await file.arrayBuffer();
        const workbook = XLSX.read(data, { type: 'array' });
        const firstSheetName = workbook.SheetNames[0];
        const worksheet = workbook.Sheets[firstSheetName];
        const jsonData = XLSX.utils.sheet_to_json(worksheet, { header: 1 });

        log('2/5: Парсинг даних...');
        const headerRowIndex = jsonData.findIndex(row => row.includes('ID параметра'));
        if (headerRowIndex === -1) throw new Error("Не знайдено заголовок 'ID параметра'.");
        
        const header = jsonData[headerRowIndex];
        const rows = jsonData.slice(headerRowIndex + 1);
        log(`Знайдено ${rows.length} рядків для обробки.`);

        return await runProcessingLogic(rows, header, targetCategoryId, log, updateProgress);
    } catch (error) {
        log(`КРИТИЧНА ПОМИЛКА: ${error.message}`);
        showToast(error.message, 'error');
        throw error;
    }
}