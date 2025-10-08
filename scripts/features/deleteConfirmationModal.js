// scripts/features/deleteConfirmationModal.js

let resolveCallback;

async function showModal(analysisData) {
    const response = await fetch('modals/delete-confirmation-modal.html');
    const html = await response.text();
    document.getElementById('modal-placeholder').innerHTML = html;

    populateModal(analysisData);
    attachEventListeners();
}

function populateModal(data) {
    const summaryEl = document.getElementById('delete-summary-text');
    const detailsEl = document.getElementById('delete-details-container');
    const btnSafe = document.getElementById('btn-delete-safe');
    const btnCascade = document.getElementById('btn-delete-cascade');

    const totalSelected = data.safeToDelete.length + data.parentsInSelection.length;
    summaryEl.textContent = `Вибрано ${totalSelected} елементів. Серед них ${data.parentsInSelection.length} мають залежності.`;

    let detailsHtml = '';
    if (data.parentsInSelection.length > 0) {
        // Визначаємо, про які залежності йдеться
        const parent = data.parentsInSelection[0];
        let dependencyText = 'дочірніх елементів';
        if (parent.entityType === 'options') dependencyText = 'прив\'язаних опцій';
        if (parent.entityType === 'characteristics') dependencyText = 'залежних характеристик';

        detailsHtml += `<p><strong>Елементи, що мають залежності:</strong></p>`;
        detailsHtml += '<ul class="deletion-details-list">';
        data.parentsInSelection.forEach(p => {
            detailsHtml += `<li><strong>${p.name_uk}</strong> (має ${p.linkedEntities.length} ${dependencyText})</li>`;
        });
        detailsHtml += '</ul>';
    }
    detailsEl.innerHTML = detailsHtml;

    // Підрахунок загальної кількості елементів для каскадного видалення
    let cascadeCount = 0;
    if (data.cascadeDeleteList) {
        cascadeCount = Object.values(data.cascadeDeleteList).reduce((sum, arr) => sum + arr.length, 0);
    }

    if (data.safeToDelete.length > 0) {
        btnSafe.style.display = 'block';
        btnSafe.querySelector('.label').textContent = `Видалити безпечні (${data.safeToDelete.length})`;
    } else {
        btnSafe.style.display = 'none';
    }

    if (data.parentsInSelection.length > 0 && cascadeCount > 0) {
        btnCascade.style.display = 'block';
        btnCascade.querySelector('.label').textContent = `Видалити все (${cascadeCount})`;
    } else {
        btnCascade.style.display = 'none';
    }
}


function attachEventListeners() {
    const modal = document.querySelector('#modal-placeholder .modal-overlay');
    modal.querySelector('.modal-close-btn').addEventListener('click', () => resolveAndClose('cancel'));
    modal.querySelector('#btn-cancel-delete').addEventListener('click', () => resolveAndClose('cancel'));
    modal.querySelector('#btn-delete-safe').addEventListener('click', () => resolveAndClose('safe'));
    modal.querySelector('#btn-delete-cascade').addEventListener('click', () => resolveAndClose('cascade'));
}

function resolveAndClose(choice) {
    if (resolveCallback) {
        resolveCallback(choice);
    }
    document.getElementById('modal-placeholder').innerHTML = '';
}

export function showDeleteConfirmationModal(analysisData) {
    showModal(analysisData);
    return new Promise(resolve => {
        resolveCallback = resolve;
    });
}