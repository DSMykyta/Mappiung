// scripts/actions/importers/rztk_logic.js
import { getCharacteristics, getOptions, _generateNewId, batchSaveCharacteristics, batchSaveOptions, clearAllCaches } from '../../api/googleSheetService.js';

async function runProcessingLogic(rows, header, targetCategoryId, log, updateProgress) {
    log('3/5: Завантаження існуючих довідників та прив\'язок...');
    // --- ЗМІНА: Завантажуємо і прив'язки ---
    const [existingChars, existingOptions, allMappings] = await Promise.all([
        getCharacteristics(true), 
        getOptions(true),
        getMappings(true) // Додано
    ]);
    
    // --- ЗМІНА: Створюємо сет вже існуючих ID з прив'язок ---
    const mappedRztkIds = new Set(
        allMappings
            .filter(m => m.marketplace === 'Rozetka' && m.marketplace_id)
            .map(m => m.marketplace_id.toString())
    );

    const existingCharsMapRztk = new Map(existingChars.filter(c => c.rztk_id).map(c => [c.rztk_id.toString(), c]));
    const existingOptionsMapRztk = new Map(existingOptions.filter(o => o.rztk_id).map(o => [o.rztk_id.toString(), o]));
    log(`Завантажено ${existingChars.length} характеристик та ${existingOptions.length} опцій.`);

    log('4/5: Аналіз даних...');
    let charsToCreate = [], charsToUpdate = [], optionsToCreate = [];
    let ignoredCharsCount = 0, ignoredOptionsCount = 0;
    const processedCharRztkIds = new Set();

    const h = (name, alternativeName = null) => {
        let index = header.indexOf(name);
        if (index === -1 && alternativeName) {
            index = header.indexOf(alternativeName);
        }
        return index;
    };

    for (const [index, row] of rows.entries()) {
        const rztkParamId = row[h('ID параметра')]?.toString();
        if (!rztkParamId || rztkParamId.trim() === '') continue;

        let char;

        // (ВИПРАВЛЕНО) Шукаємо індекс стовпця з урахуванням можливої одруківки
        const isGlobalIndex = h('Наскрізний параметр', 'Наскрізниий параметр');
        const isGlobal = (row[isGlobalIndex] || '').trim().toLowerCase() === 'так' ? 'TRUE' : 'FALSE';

        if (!processedCharRztkIds.has(rztkParamId)) {
            processedCharRztkIds.add(rztkParamId);
            char = existingCharsMapRztk.get(rztkParamId);

            if (char) { // Оновлення
                let needsUpdate = false;
                if (!char.category_local_ids.includes(targetCategoryId) && isGlobal !== 'TRUE') {
                    char.category_local_ids = [char.category_local_ids, targetCategoryId].filter(Boolean).join(',');
                    needsUpdate = true;
                }
                if (needsUpdate) {
                    charsToUpdate.push(char);
                } else {
                    ignoredCharsCount++;
                }
            } else { // Створення
                char = {
                    local_id: _generateNewId('char', [...existingChars, ...charsToCreate]),
                    name_uk: row[h('Назва параметра')],
                    param_type: row[h('Тип параметра')],
                    filter_type: row[h('Тип фільтра')] === 'main' ? 'Main' : 'Disable',
                    unit: row[h('Одиниця вимірювання')] === 'N/D' ? '' : row[h('Одиниця вимірювання')],
                    is_global: isGlobal,
                    category_local_ids: isGlobal === 'TRUE' ? '' : targetCategoryId,
                    rztk_id: rztkParamId,
                    rztk_name: row[h('Назва параметра')],
                    rztk_param_type: row[h('Тип параметра')],
                    rztk_filter_type: row[h('Тип фільтра')],
                    rztk_unit: row[h('Одиниця вимірювання')],
                };
                charsToCreate.push(char);
            }
        } else {
            char = existingCharsMapRztk.get(rztkParamId) || charsToCreate.find(c => c.rztk_id === rztkParamId);
        }

        const rztkValueId = row[h('ID значення')]?.toString();
        if (rztkValueId && rztkValueId !== 'N/D') {
            if (existingOptionsMapRztk.has(rztkValueId)) {
                ignoredOptionsCount++;
            } else {
                if (!char) continue;
                const option = {
                    local_id: _generateNewId('opt', [...existingOptions, ...optionsToCreate]),
                    name_uk: row[h('Назва значення')],
                    char_local_id: char.local_id,
                    rztk_id: rztkValueId,
                    rztk_name: row[h('Назва значення')],
                };
                optionsToCreate.push(option);
            }
        }

        if ((index + 1) % 50 === 0 || index === rows.length - 1) {
            updateProgress(index + 1, rows.length);
            // Даємо браузеру мить на перемальовку
            await new Promise(resolve => setTimeout(resolve, 0));
        }
    }

    log(`Аналіз завершено.`);
    log('5/5: Збереження даних у Google Sheets...');
    await batchSaveCharacteristics(charsToCreate, charsToUpdate);
    await batchSaveOptions(optionsToCreate, []);

    log('Імпорт завершено!');
    clearAllCaches();

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
        if (headerRowIndex === -1) {
            throw new Error("Не вдалося знайти рядок із заголовками ('ID параметра').");
        }
        const header = jsonData[headerRowIndex];
        const rows = jsonData.slice(headerRowIndex + 1);
        log(`Знайдено ${rows.length} рядків для обробки.`);

        return await runProcessingLogic(rows, header, targetCategoryId, log, updateProgress);
    } catch (error) {
        log(`КРИТИЧНА ПОМИЛКА: ${error.message}`);
        throw error;
    }
}