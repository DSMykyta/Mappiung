// scripts/components/toast.js

/**
 * Знаходить або створює контейнер для toast-повідомлень.
 */
function getOrCreateToastContainer() {
    let container = document.getElementById('toast-container');
    if (!container) {
        container = document.createElement('div');
        container.id = 'toast-container';
        document.body.appendChild(container);
    }
    return container;
}

/**
 * Показує спливаюче повідомлення (toast).
 * @param {string} message - Текст повідомлення.
 * @param {string} [type='success'] - Тип повідомлення ('success', 'error', 'info').
 * @param {number} [duration=3000] - Тривалість показу в мілісекундах.
 */
export function showToast(message, type = 'success', duration = 3000) {
    const toastContainer = getOrCreateToastContainer();

    const toast = document.createElement('div');
    toast.className = `toast toast--${type}`;
    toast.textContent = message;

    toastContainer.appendChild(toast);

    // Запускаємо анімацію появи
    setTimeout(() => {
        toast.classList.add('toast--visible');
    }, 10);

    // Зникнення та видалення після завершення тривалості
    setTimeout(() => {
        toast.classList.remove('toast--visible');
        
        // Чекаємо завершення анімації зникнення перед видаленням з DOM
        toast.addEventListener('transitionend', () => {
            if (toast.parentNode) {
                toast.parentNode.removeChild(toast);
            }
        });
    }, duration);
}