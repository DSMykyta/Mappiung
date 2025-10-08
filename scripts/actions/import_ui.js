// scripts/actions/import_ui.js
import { getCategories } from '../api/googleSheetService.js';
import { reinitializeCustomSelect } from '../components/select.js';
import { processRztkFile } from './importers/rztk_logic.js';

let logElement, progressBar, summaryElement, startBtn;
let fileToProcess = null;

function log(message) {
    if (logElement) {
        logElement.innerHTML += message + '\n';
        logElement.scrollTop = logElement.scrollHeight;
    }
    console.log(message);
}

function updateProgress(value, total) {
    const percentage = total > 0 ? (value / total) * 100 : 0;
    if (progressBar) {
        progressBar.style.width = `${percentage}%`;
    }
}

function handleFileSelect(file) {
    if (!file || !file.name.endsWith('.xls')) {
        log('Помилка: будь ласка, виберіть файл у форматі .xls');
        startBtn.disabled = true;
        return;
    }
    fileToProcess = file;
    document.getElementById('import-file-name').textContent = `Вибрано файл: ${file.name}`;
    log(`Файл "${file.name}" готовий до імпорту.`);
    startBtn.disabled = false;
}

async function startImportProcess() {
    startBtn.disabled = true;
    logElement.innerHTML = '';
    summaryElement.innerHTML = '';
    updateProgress(0, 1);
    
    const targetCategoryId = document.getElementById('import-target-category').value;

    if (!targetCategoryId || !fileToProcess) {
        log('ПОМИЛКА: Не обрано категорію або файл.');
        startBtn.disabled = false;
        return;
    }
    
    try {
        const summary = await processRztkFile(fileToProcess, targetCategoryId, log, updateProgress);
        summaryElement.innerHTML = `
            <p>✓ Характеристики: Створено <b>${summary.charsCreated}</b> | Оновлено/Знайдено <b>${summary.charsIgnored}</b></p>
            <p>✓ Опції: Створено <b>${summary.optionsCreated}</b> | Проігноровано (вже існували) <b>${summary.optionsIgnored}</b></p>
        `;
        // Сповіщаємо всі таблиці про необхідність оновитись
        document.dispatchEvent(new CustomEvent('dataChanged', { detail: { forceAll: true } }));
    } catch(error) {
        log(`Імпорт зупинено через помилку.`);
    } finally {
        startBtn.disabled = false;
        fileToProcess = null;
    }
}

async function updateCategoryList() {
    const marketplaceSelect = document.getElementById('import-marketplace');
    const categorySelect = document.getElementById('import-target-category');
    const categoryLabel = document.getElementById('import-category-label');
    const selectedMarketplace = marketplaceSelect.value;
    
    categoryLabel.textContent = `Прив'язати до категорії (з ID ${selectedMarketplace})`;
    categorySelect.innerHTML = ''; // Очищуємо список

    const categories = await getCategories();
    // Фільтруємо категорії, які мають ID для вибраного маркетплейсу
    const filteredCategories = categories.filter(c => c[`${selectedMarketplace}_id`] && c[`${selectedMarketplace}_id`].toString().trim() !== '');

    if (filteredCategories.length === 0) {
        log(`ПОПЕРЕДЖЕННЯ: Не знайдено категорій з ID для '${selectedMarketplace}'.`);
    } else {
        filteredCategories.forEach(cat => {
            const option = new Option(cat.name_uk, cat.local_id);
            categorySelect.add(option);
        });
    }
    reinitializeCustomSelect(categorySelect);
}

export async function initImportModal() {
    logElement = document.getElementById('import-log');
    progressBar = document.getElementById('import-progress-bar');
    summaryElement = document.getElementById('import-summary');
    startBtn = document.getElementById('btn-start-import');
    
    const dropArea = document.getElementById('import-drop-area');
    const fileInput = document.getElementById('import-file-input');

    dropArea.addEventListener('click', () => fileInput.click());
    fileInput.addEventListener('change', (e) => handleFileSelect(e.target.files[0]));
    
    ['dragenter', 'dragover', 'dragleave', 'drop'].forEach(eventName => {
        dropArea.addEventListener(eventName, (e) => { e.preventDefault(); e.stopPropagation(); }, false);
    });
    ['dragenter', 'dragover'].forEach(eventName => {
        dropArea.addEventListener(eventName, () => dropArea.style.borderColor = 'var(--color-main)');
    });
    ['dragleave', 'drop'].forEach(eventName => {
        dropArea.addEventListener(eventName, () => dropArea.style.borderColor = 'var(--color-outline)');
    });
    dropArea.addEventListener('drop', (e) => handleFileSelect(e.dataTransfer.files[0]));

    startBtn.addEventListener('click', startImportProcess);

    const marketplaceSelect = document.getElementById('import-marketplace');
    const categorySelect = document.getElementById('import-target-category');
    marketplaceSelect.addEventListener('change', updateCategoryList);
    
    log('Ініціалізація... Завантаження категорій...');
    
    const categories = (await getCategories()).filter(c => c.rztk_id && c.rztk_id.toString().trim() !== '');
    
    if (categories.length === 0) {
        log('ПОПЕРЕДЖЕННЯ: Не знайдено жодної категорії з проставленим ID Rozetka.');
    } else {
        categories.forEach(cat => {
            const option = new Option(cat.name_uk, cat.local_id);
            categorySelect.add(option);
        });
    }

    reinitializeCustomSelect(marketplaceSelect);
    reinitializeCustomSelect(categorySelect);
    reinitializeCustomSelect(marketplaceSelect);
    await updateCategoryList(); 
    
    log('Ініціалізація завершена. Оберіть категорію та файл.');
}