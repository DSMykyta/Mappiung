// scripts/features/pagination.js (ПОВНА ОНОВЛЕНА ВЕРСІЯ)

import { updatePaginationState, renderActiveTable, getPaginationState } from '../components/table.js';

const footer = document.querySelector('.footer');
const navContainer = document.getElementById('pagination-nav-container');
const pageSizeSelector = document.getElementById('page-size-selector');
const pageSizeLabel = document.getElementById('page-size-label');

export function initPagination() {
    if (!footer) return;
    
    // Делегований слухач для кнопок навігації та опцій розміру
    footer.addEventListener('click', handlePaginationClick);

    // Слухач для відкриття/закриття меню розміру сторінки
    pageSizeSelector.addEventListener('click', (e) => {
        if (e.target.closest('.page-size-trigger')) {
            pageSizeSelector.classList.toggle('is-open');
        }
    });

    // Закриття меню при кліку поза ним
    document.addEventListener('click', (e) => {
        if (!pageSizeSelector.contains(e.target)) {
            pageSizeSelector.classList.remove('is-open');
        }
    });
}

export function updatePaginationUI(entityType, totalFilteredItems) {
    const state = getPaginationState(entityType);
    if (!state) return;

    const { currentPage, pageSize } = state;
    const totalPages = Math.ceil(totalFilteredItems / pageSize);

    // Оновлюємо текст на головній кнопці селектора
    pageSizeLabel.textContent = pageSize > 1000 ? 'Всі' : pageSize;

    // Генеруємо та рендеримо кнопки навігації
    renderPageNumbers(currentPage, totalPages);
}

function handlePaginationClick(event) {
    const button = event.target.closest('.page-btn, .page-size-option');
    if (!button) return;

    const action = button.dataset.action;
    const page = button.dataset.page;
    const newPageSize = button.dataset.pageSize;
    
    const activeTab = document.querySelector('.tab-content.active');
    if (!activeTab) return;
    
    const entityType = activeTab.id;
    const state = getPaginationState(entityType);
    if (!state) return;

    let { currentPage, pageSize, filteredData } = state;
    const totalPages = Math.ceil(filteredData.length / pageSize);
    let needsRender = false;

    if (newPageSize) { // Зміна розміру сторінки
        pageSizeSelector.classList.remove('is-open');
        if (parseInt(newPageSize) !== pageSize) {
            updatePaginationState(entityType, { pageSize: parseInt(newPageSize), currentPage: 1 });
            needsRender = true;
        }
    } else if (page) { // Клік на конкретну сторінку
        const newPageNum = parseInt(page);
        if (newPageNum !== currentPage) {
            updatePaginationState(entityType, { currentPage: newPageNum });
            needsRender = true;
        }
    } else if (action) { // Клік на стрілки
        let newPage = currentPage;
        if (action === 'prev') newPage = Math.max(1, currentPage - 1);
        if (action === 'next') newPage = Math.min(totalPages, currentPage + 1);
        if (newPage !== currentPage) {
            updatePaginationState(entityType, { currentPage: newPage });
            needsRender = true;
        }
    }

    if (needsRender) {
        renderActiveTable();
    }
}

/**
 * Генерує HTML для кнопок навігації по сторінках.
 */
function renderPageNumbers(currentPage, totalPages) {
    navContainer.innerHTML = ''; // Очищуємо контейнер

    // Кнопка "Назад"
    const prevBtn = createPageButton({ icon: '<', action: 'prev', disabled: currentPage === 1 });
    navContainer.appendChild(prevBtn);

    const pageNumbers = getPageNumbers(totalPages, currentPage);
    
    pageNumbers.forEach(pageNum => {
        if (typeof pageNum === 'string') {
            const ellipsis = document.createElement('span');
            ellipsis.className = 'page-ellipsis';
            ellipsis.textContent = '...';
            navContainer.appendChild(ellipsis);
        } else {
            const pageBtn = createPageButton({
                text: pageNum,
                page: pageNum,
                active: pageNum === currentPage
            });
            navContainer.appendChild(pageBtn);
        }
    });

    // Кнопка "Вперед"
    const nextBtn = createPageButton({ icon: '>', action: 'next', disabled: currentPage >= totalPages });
    navContainer.appendChild(nextBtn);
}

/**
 * Створює елемент кнопки пагінації.
 */
function createPageButton({ text, icon, page, action, active = false, disabled = false }) {
    const btn = document.createElement('button');
    btn.className = 'page-btn';
    if (active) btn.classList.add('active');
    if (page) btn.dataset.page = page;
    if (action) btn.dataset.action = action;
    btn.disabled = disabled;
    btn.innerHTML = text || icon;
    return btn;
}

/**
 * Алгоритм для генерації масиву номерів сторінок з "трикрапкою".
 */
function getPageNumbers(totalPages, currentPage, maxVisible = 7) {
    if (totalPages <= maxVisible) {
        return Array.from({ length: totalPages }, (_, i) => i + 1);
    }

    const sideWidth = Math.floor((maxVisible - 3) / 2);
    const leftWidth = currentPage - 1;
    const rightWidth = totalPages - currentPage;

    if (leftWidth < sideWidth + 1) {
        return [
            ...Array.from({ length: maxVisible - 2 }, (_, i) => i + 1),
            '...',
            totalPages
        ];
    }
    
    if (rightWidth < sideWidth + 1) {
        return [
            1,
            '...',
            ...Array.from({ length: maxVisible - 2 }, (_, i) => totalPages - (maxVisible - 3) + i)
        ];
    }

    return [
        1,
        '...',
        ...Array.from({ length: maxVisible - 4 }, (_, i) => currentPage - sideWidth + 2 + i),
        '...',
        totalPages
    ];
}