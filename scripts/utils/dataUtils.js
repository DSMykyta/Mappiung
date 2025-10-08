/**
 * scripts/utils/dataUtils.js
 * Допоміжні функції для обробки та структурування даних.
 */

/**
 * Будує ієрархічне дерево категорій з плоского списку.
 */
export function buildCategoryTree(categories) {
    const map = new Map(categories.map(cat => [cat.local_id, { ...cat, children: [] }]));
    const tree = [];

    map.forEach(node => {
        if (node.parent_local_id && map.has(node.parent_local_id)) {
            map.get(node.parent_local_id).children.push(node);
        } else if (!node.parent_local_id) {
            tree.push(node);
        }
    });
    
    // Сортування для стабільного відображення
    const sortByName = (a, b) => a.name_uk.localeCompare(b.name_uk);
    tree.sort(sortByName);
    map.forEach(node => node.children.sort(sortByName));

    return tree;
}

/**
 * Перетворює дерево назад в плоский список, відформатований для <select> з відступами.
 */
export function flattenTreeForSelect(tree, depth = 0) {
    let options = [];
    const indent = '\u00A0\u00A0\u00A0\u00A0'.repeat(depth);

    tree.forEach(node => {
        options.push({
            value: node.local_id,
            label: `${indent}${node.name_uk}`
        });
        if (node.children.length > 0) {
            options = options.concat(flattenTreeForSelect(node.children, depth + 1));
        }
    });
    return options;
}