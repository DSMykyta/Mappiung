// scripts/features/tooltip.js (ОНОВЛЕНА ВЕРСІЯ)

let tooltipElement;

/**
 * Ініціалізує систему кастомних спливаючих підказок.
 */
export function initTooltips() {
    document.body.addEventListener('mouseover', handleMouseOver);
    document.body.addEventListener('mouseout', handleMouseOut);
    document.body.addEventListener('mousemove', handleMouseMove);
}

function handleMouseOver(event) {
    const target = event.target.closest('[data-tooltip]');
    if (!target) return;

    // ===================================================================
    // === НОВА ПЕРЕВІРКА: Показуємо підказку, лише якщо текст не вміщується ===
    // ===================================================================
    // scrollWidth - це повна ширина вмісту, clientWidth - видима ширина.
    // Якщо повна ширина більша за видиму, значить текст обрізано.
    if (target.scrollWidth <= target.clientWidth) {
        return; // Виходимо, якщо весь текст вже видно
    }
    // ===================================================================

    const tooltipText = target.getAttribute('data-tooltip');
    if (!tooltipText) return;

    // Створюємо елемент підказки
    tooltipElement = document.createElement('div');
    tooltipElement.className = 'custom-tooltip';
    tooltipElement.textContent = tooltipText;
    document.body.appendChild(tooltipElement);

    // Позиціонуємо його і робимо видимим
    positionTooltip(event);
    requestAnimationFrame(() => {
        if (tooltipElement) {
            tooltipElement.classList.add('visible');
        }
    });
}

function handleMouseOut(event) {
    if (tooltipElement) {
        tooltipElement.remove();
        tooltipElement = null;
    }
}

function handleMouseMove(event) {
    if (tooltipElement) {
        positionTooltip(event);
    }
}

function positionTooltip(event) {
    const offsetX = 15;
    const offsetY = 15;
    
    let x = event.clientX + offsetX;
    let y = event.clientY + offsetY;

    // Використовуємо requestAnimationFrame для плавного оновлення позиції
    // та для того, щоб отримати розміри елемента після його рендерингу.
    requestAnimationFrame(() => {
        if (!tooltipElement) return;

        const tooltipRect = tooltipElement.getBoundingClientRect();
        
        // Перевірка, щоб підказка не виходила за межі екрану
        if (x + tooltipRect.width > window.innerWidth) {
            x = event.clientX - tooltipRect.width - offsetX;
        }
        if (y + tooltipRect.height > window.innerHeight) {
            y = event.clientY - tooltipRect.height - offsetY;
        }

        tooltipElement.style.left = `${x}px`;
        tooltipElement.style.top = `${y}px`;
    });
}