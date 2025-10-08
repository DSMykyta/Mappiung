/**
 * scripts/utils/idGenerator.js
 * Генерує послідовні ID у форматі prefix_000000000001.
 */

const ID_LENGTH = 12;
const sequenceCache = {}; // { prefix: maxNumber }

/**
 * Ініціалізує генератор ID для заданого префіксу на основі існуючих даних.
 */
export function initializeIdGenerator(prefix, data, idField = 'local_id') {
    let maxNumber = 0;
    const regex = new RegExp(`^${prefix}_(\\d{${ID_LENGTH}})$`);

    data.forEach(item => {
        const id = item[idField];
        if (id) {
            const match = id.match(regex);
            if (match) {
                const number = parseInt(match[1], 10);
                if (!isNaN(number) && number > maxNumber) {
                    maxNumber = number;
                }
            }
        }
    });

    sequenceCache[prefix] = maxNumber;
    console.log(`[ID Gen] Ініціалізовано '${prefix}' з максимальним номером: ${maxNumber}`);
}

/**
 * Генерує наступний ID для заданого префіксу.
 */
export function generateNextId(prefix) {
    if (sequenceCache[prefix] === undefined) {
        console.warn(`[ID Gen] Генератор для '${prefix}' не ініціалізовано. Починаємо з 1.`);
        sequenceCache[prefix] = 0;
    }

    sequenceCache[prefix]++;
    const nextNumber = sequenceCache[prefix];
    const paddedNumber = String(nextNumber).padStart(ID_LENGTH, '0');

    return `${prefix}_${paddedNumber}`;
}