/**
 * EcoVal Document Editor - Patched Engine (Anti-Crash Version)
 * Bugfix: Melindungi Event Listeners dari elemen HTML yang hilang (seperti tombol Print).
 */

document.addEventListener('DOMContentLoaded', () => {
    'use strict';

    // ==========================================================================
    // Inisialisasi UI Polish
    // ==========================================================================
    let tooltips = [];
    try {
        if (typeof bootstrap !== 'undefined') {
            const tooltipTriggerList = document.querySelectorAll('[data-bs-toggle="tooltip"]');
            tooltips = [...tooltipTriggerList].map(el => new bootstrap.Tooltip(el, { trigger: 'hover' }));
            
            document.addEventListener('click', () => {
                tooltips.forEach(t => t.hide());
            });
        }
    } catch (e) {
        console.warn("Bootstrap tooltips gagal dimuat, namun aplikasi tetap berjalan aman.");
    }

    // ==========================================================================
    // State Aplikasi
    // ==========================================================================
    const AppState = {
        data: null,
        history: [],
        historyIndex: -1,
        maxHistory: 30,
        autoSaveTimer: null,
        autoSaveDelay: 1500,
        currentZoom: 100,
        isEditing: false
    };

    // Cache Elemen DOM (Aman jika ada elemen yang tidak ditemukan / null)
    const DOM = {
        documentPage: document.getElementById('documentPage'),
        tblMatrixHeadRow: document.getElementById('tblMatrixHeadRow'),
        tblMatrixBody: document.getElementById('tblMatrixBody'),
        tblCompareHeadRow: document.getElementById('tblCompareHeadRow'),
        tblCompareBody: document.getElementById('tblCompareBody'),
        notesList: document.getElementById('notesList'),
        saveStatusText: document.getElementById('saveStatusText'),
        
        btnSave: document.getElementById('btnSave'),
        btnLoad: document.getElementById('btnLoad'),
        btnReset: document.getElementById('btnReset'),
        btnExportJson: document.getElementById('btnExportJson'),
        btnImportJson: document.getElementById('btnImportJson'),
        fileInputJson: document.getElementById('fileInputJson'),
        btnExportPdf: document.getElementById('btnExportPdf'),
        btnPrint: document.getElementById('btnPrint'), // Mungkin Null di versi Minimalis
        btnUndo: document.getElementById('btnUndo'),
        btnRedo: document.getElementById('btnRedo'),
        btnThemeToggle: document.getElementById('btnThemeToggle'),
        themeIcon: document.getElementById('themeIcon'),
        
        searchInput: document.getElementById('searchInput'),
        btnClearSearch: document.getElementById('btnClearSearch'),
        btnZoomIn: document.getElementById('btnZoomIn'),
        btnZoomOut: document.getElementById('btnZoomOut'),
        zoomLabel: document.getElementById('zoomLabel'),
        
        toastElement: document.getElementById('appToast'),
        toastMessage: document.getElementById('toastMessage')
    };

    let bsToast = null;
    if (typeof bootstrap !== 'undefined' && DOM.toastElement) {
        bsToast = new bootstrap.Toast(DOM.toastElement);
    }

    // ==========================================================================
    // Modul Keamanan: Sanitasi XSS
    // ==========================================================================
    function sanitizeHTML(htmlString) {
        if (!htmlString) return '';
        const parser = new DOMParser();
        const doc = parser.parseFromString(htmlString, 'text/html');
        
        doc.querySelectorAll('script, iframe, object, embed, style').forEach(el => el.remove());
        doc.querySelectorAll('*').forEach(el => {
            Array.from(el.attributes).forEach(attr => {
                if (attr.name.startsWith('on') || attr.value.trim().startsWith('javascript:')) {
                    el.removeAttribute(attr.name);
                }
            });
        });
        return doc.body.innerHTML;
    }

    // ==========================================================================
    // Inisialisasi & Memuat Data
    // ==========================================================================
    async function initApplication() {
        setupGlobalEventDelegation();
        setupToolbarEvents();
        setupKeyboardNavigation();
        loadThemePreference();

        const localSavedData = localStorage.getItem('ecoval_doc_data');
        if (localSavedData) {
            try {
                AppState.data = JSON.parse(localSavedData);
                renderDocument();
                
                if (!AppState.data.matrixHeaders || !AppState.data.compareHeaders) {
                    AppState.data = extractDataFromDOM();
                }
                
                showToast('Data dokumen berhasil dimuat dari penyimpanan.', 'success');
            } catch (e) {
                console.error('Gagal parsing data dari LocalStorage:', e);
                await fetchDefaultData();
            }
        } else {
            await fetchDefaultData();
        }

        pushHistoryState();
    }

    async function fetchDefaultData() {
        try {
            const response = await fetch('data.json');
            AppState.data = await response.json();
            renderDocument();
            AppState.data = extractDataFromDOM(); 
        } catch (error) {
            console.warn('Gagal memuat data.json, menggunakan struktur bawaan web.', error);
            AppState.data = extractDataFromDOM();
        }
    }

    // ==========================================================================
    // Engine Render Kolom Tabel Dinamis
    // ==========================================================================
    function renderDocument() {
        if (!AppState.data || AppState.isEditing) return;

        if (document.querySelector('[data-key="headerBadge"]')) document.querySelector('[data-key="headerBadge"]').innerHTML = sanitizeHTML(AppState.data.headerBadge || '');
        if (document.querySelector('[data-key="docTitle"]')) document.querySelector('[data-key="docTitle"]').innerHTML = sanitizeHTML(AppState.data.docTitle || '');
        if (document.querySelector('[data-key="docDescription"]')) document.querySelector('[data-key="docDescription"]').innerHTML = sanitizeHTML(AppState.data.docDescription || '');
        if (document.querySelector('[data-key="section1Title"]')) document.querySelector('[data-key="section1Title"]').innerHTML = sanitizeHTML(AppState.data.section1Title || '');
        if (document.querySelector('[data-key="section2Title"]')) document.querySelector('[data-key="section2Title"]').innerHTML = sanitizeHTML(AppState.data.section2Title || '');
        if (document.querySelector('[data-key="notesTitle"]')) document.querySelector('[data-key="notesTitle"]').innerHTML = sanitizeHTML(AppState.data.notesTitle || '');

        renderDynamicTable('tblMatrix', DOM.tblMatrixHeadRow, DOM.tblMatrixBody, AppState.data.matrixHeaders, AppState.data.matrixTable);
        renderDynamicTable('tblCompare', DOM.tblCompareHeadRow, DOM.tblCompareBody, AppState.data.compareHeaders, AppState.data.compareTable);
        renderNotesList();
    }

    function renderDynamicTable(tableId, headRowEl, bodyEl, headersData, tableData) {
        if (!headRowEl || !bodyEl) return;
        
        if (headersData && headersData.length > 0) {
            headRowEl.innerHTML = '';
            headersData.forEach(hdr => {
                const th = document.createElement('th');
                th.innerHTML = sanitizeHTML(hdr.html);
                th.dataset.field = hdr.field;
                th.setAttribute('role', 'columnheader');
                
                if (!hdr.isAction) th.contentEditable = "true";
                if (hdr.isAction) {
                    th.className = "no-print col-action-head";
                    th.setAttribute('aria-label', 'Aksi Baris');
                }
                headRowEl.appendChild(th);
            });
        }

        const currentHeaders = Array.from(headRowEl.querySelectorAll('th')).map(th => th.dataset.field);
        bodyEl.innerHTML = '';
        if (!tableData) return;

        tableData.forEach((rowObj, rowIndex) => {
            const tr = document.createElement('tr');
            tr.setAttribute('role', 'row');

            currentHeaders.forEach(field => {
                const td = document.createElement('td');
                if (field === 'action') {
                    td.className = "no-print align-middle";
                    td.setAttribute('role', 'gridcell');
                    td.innerHTML = `
                        <div class="cell-actions">
                            <button class="btn btn-row-action btn-outline-secondary btn-dup-row" data-table="${tableId}" data-index="${rowIndex}" title="Duplikat Baris"><i class="fa-solid fa-clone"></i></button>
                            <button class="btn btn-row-action btn-outline-danger btn-del-row" data-table="${tableId}" data-index="${rowIndex}" title="Hapus Baris"><i class="fa-solid fa-trash"></i></button>
                        </div>
                    `;
                } else if (field === 'prinsipRumus' && tableId === 'tblMatrix') {
                    td.dataset.field = field;
                    td.setAttribute('role', 'gridcell');
                    td.innerHTML = `
                        <div class="math-code" contenteditable="true" data-subfield="formula">${sanitizeHTML(rowObj.formula || rowObj[field] || '')}</div>
                        <div class="math-desc" contenteditable="true" data-subfield="formulaDesc">${sanitizeHTML(rowObj.formulaDesc || '')}</div>
                    `;
                } else {
                    td.contentEditable = "true";
                    td.dataset.field = field;
                    td.setAttribute('role', 'gridcell');
                    
                    if (field === 'metode') {
                        td.innerHTML = `<strong>${sanitizeHTML(rowObj[field] || '')}</strong>`;
                    } else {
                        td.innerHTML = sanitizeHTML(rowObj[field] || '');
                    }
                }
                tr.appendChild(td);
            });
            bodyEl.appendChild(tr);
        });
    }

    function renderNotesList() {
        if (!DOM.notesList) return;
        DOM.notesList.innerHTML = '';
        if (!AppState.data.notes) return;

        AppState.data.notes.forEach((noteText, index) => {
            const li = document.createElement('li');
            li.innerHTML = `
                <div class="d-flex justify-content-between align-items-start">
                    <span contenteditable="true" class="note-text flex-grow-1" data-index="${index}">${sanitizeHTML(noteText)}</span>
                    <button class="btn btn-xs text-danger btn-del-note no-print ms-3" data-index="${index}" title="Hapus Catatan"><i class="fa-solid fa-times"></i></button>
                </div>
            `;
            DOM.notesList.appendChild(li);
        });
    }

    // ==========================================================================
    // Event Delegation & Autosave Logic
    // ==========================================================================
    function setupGlobalEventDelegation() {
        if(!DOM.documentPage) return;
        
        DOM.documentPage.addEventListener('input', (e) => {
            if (e.target.isContentEditable || e.target.getAttribute('contenteditable') === 'true') {
                AppState.isEditing = true;
                triggerAutoSave();
            }
        });

        DOM.documentPage.addEventListener('blur', (e) => {
            if (e.target.isContentEditable) {
                AppState.isEditing = false;
            }
        }, true);
    }

    function setupKeyboardNavigation() {
        document.addEventListener('keydown', (e) => {
            if (e.ctrlKey && e.target.isContentEditable) {
                const currentCell = e.target.closest('td, th');
                if (!currentCell) return;
                
                const currentRow = currentCell.parentElement;
                const cellIndex = Array.from(currentRow.children).indexOf(currentCell);
                let targetCell = null;

                if (e.key === 'ArrowRight') targetCell = currentRow.children[cellIndex + 1];
                else if (e.key === 'ArrowLeft') targetCell = currentRow.children[cellIndex - 1];
                else if (e.key === 'ArrowUp') {
                    const prevRow = currentRow.previousElementSibling;
                    if (prevRow) targetCell = prevRow.children[cellIndex];
                } else if (e.key === 'ArrowDown') {
                    const nextRow = currentRow.nextElementSibling;
                    if (nextRow) targetCell = nextRow.children[cellIndex];
                }

                if (targetCell && targetCell.hasAttribute('contenteditable')) {
                    e.preventDefault();
                    targetCell.focus();
                }
            }
        });
    }

    // ==========================================================================
    // Ekstraksi & Penyimpanan Data Dinamis
    // ==========================================================================
    function extractTableData(headRowId, bodyId) {
        const thead = document.getElementById(headRowId);
        const tbody = document.getElementById(bodyId);
        if(!thead || !tbody) return { headers: [], rows: [] };
        
        const headers = Array.from(thead.querySelectorAll('th')).map(th => ({
            html: sanitizeHTML(th.innerHTML),
            field: th.dataset.field,
            isAction: th.classList.contains('col-action-head')
        }));

        const rows = [];
        tbody.querySelectorAll('tr').forEach(tr => {
            const rowData = {};
            tr.querySelectorAll('td[data-field]').forEach(td => {
                const fieldName = td.dataset.field;
                if (fieldName !== 'action') {
                    rowData[fieldName] = sanitizeHTML(td.innerHTML);
                    if (fieldName === 'prinsipRumus') {
                        const formula = td.querySelector('[data-subfield="formula"]');
                        const formulaDesc = td.querySelector('[data-subfield="formulaDesc"]');
                        if (formula) rowData.formula = sanitizeHTML(formula.innerHTML);
                        if (formulaDesc) rowData.formulaDesc = sanitizeHTML(formulaDesc.innerHTML);
                    }
                }
            });
            rows.push(rowData);
        });

        return { headers, rows };
    }

    function extractDataFromDOM() {
        const newData = AppState.data ? { ...AppState.data } : {};

        newData.headerBadge = sanitizeHTML(document.querySelector('[data-key="headerBadge"]')?.innerHTML || '');
        newData.docTitle = sanitizeHTML(document.querySelector('[data-key="docTitle"]')?.innerHTML || '');
        newData.docDescription = sanitizeHTML(document.querySelector('[data-key="docDescription"]')?.innerHTML || '');
        newData.section1Title = sanitizeHTML(document.querySelector('[data-key="section1Title"]')?.innerHTML || '');
        newData.section2Title = sanitizeHTML(document.querySelector('[data-key="section2Title"]')?.innerHTML || '');
        newData.notesTitle = sanitizeHTML(document.querySelector('[data-key="notesTitle"]')?.innerHTML || '');

        const matrixData = extractTableData('tblMatrixHeadRow', 'tblMatrixBody');
        newData.matrixHeaders = matrixData.headers;
        newData.matrixTable = matrixData.rows;

        const compareData = extractTableData('tblCompareHeadRow', 'tblCompareBody');
        newData.compareHeaders = compareData.headers;
        newData.compareTable = compareData.rows;

        const notes = [];
        if(DOM.notesList) {
            DOM.notesList.querySelectorAll('.note-text').forEach(span => {
                notes.push(sanitizeHTML(span.innerHTML));
            });
        }
        newData.notes = notes;

        return newData;
    }

    function triggerAutoSave() {
        if(!DOM.saveStatusText) return;
        DOM.saveStatusText.innerHTML = '<i class="fa-solid fa-spinner fa-spin text-warning me-1"></i> Menyimpan...';
        clearTimeout(AppState.autoSaveTimer);
        AppState.autoSaveTimer = setTimeout(() => {
            saveToLocalStorage(false);
            pushHistoryState();
            DOM.saveStatusText.innerHTML = '<i class="fa-solid fa-check-circle text-success me-1"></i> Tersimpan otomatis';
        }, AppState.autoSaveDelay);
    }

    function saveToLocalStorage(notify = true) {
        AppState.data = extractDataFromDOM();
        localStorage.setItem('ecoval_doc_data', JSON.stringify(AppState.data));
        if (notify) showToast('Dokumen tersimpan dengan aman.', 'success');
    }

    // ==========================================================================
    // Manajemen Riwayat (Undo / Redo)
    // ==========================================================================
    function pushHistoryState() {
        const currentData = JSON.stringify(extractDataFromDOM());
        if (AppState.historyIndex >= 0 && AppState.history[AppState.historyIndex] === currentData) return;
        
        AppState.history = AppState.history.slice(0, AppState.historyIndex + 1);
        AppState.history.push(currentData);

        if (AppState.history.length > AppState.maxHistory) AppState.history.shift();
        else AppState.historyIndex++;
        updateUndoRedoUI();
    }

    function undo() {
        if (AppState.historyIndex > 0) {
            AppState.historyIndex--;
            AppState.data = JSON.parse(AppState.history[AppState.historyIndex]);
            AppState.isEditing = false;
            renderDocument();
            updateUndoRedoUI();
            showToast('Langkah diurungkan (Undo)', 'dark');
        }
    }

    function redo() {
        if (AppState.historyIndex < AppState.history.length - 1) {
            AppState.historyIndex++;
            AppState.data = JSON.parse(AppState.history[AppState.historyIndex]);
            AppState.isEditing = false;
            renderDocument();
            updateUndoRedoUI();
            showToast('Langkah diulangi (Redo)', 'dark');
        }
    }

    function updateUndoRedoUI() {
        if(DOM.btnUndo) DOM.btnUndo.disabled = AppState.historyIndex <= 0;
        if(DOM.btnRedo) DOM.btnRedo.disabled = AppState.historyIndex >= AppState.history.length - 1;
    }

    // ==========================================================================
    // Operasi Tabel: Tambah Kolom & Baris
    // ==========================================================================
    
    function addColumn(tableId) {
        AppState.data = extractDataFromDOM();
        
        let targetTable = tableId === 'tblMatrix' ? AppState.data.matrixTable : AppState.data.compareTable;
        let targetHeaders = tableId === 'tblMatrix' ? AppState.data.matrixHeaders : AppState.data.compareHeaders;
        
        if (!targetHeaders) {
            showToast('Tabel belum siap. Ketik sesuatu di tabel terlebih dahulu.', 'warning');
            return;
        }

        const uniqueFieldId = 'col_' + Date.now() + Math.floor(Math.random() * 1000);
        const actionIndex = targetHeaders.findIndex(hdr => hdr.field === 'action' || hdr.isAction);
        const newHeader = {
            html: "Kolom Baru",
            field: uniqueFieldId,
            isAction: false
        };

        if (actionIndex > -1) {
            targetHeaders.splice(actionIndex, 0, newHeader);
        } else {
            targetHeaders.push(newHeader); 
        }

        if (targetTable && targetTable.length > 0) {
            targetTable.forEach(row => {
                row[uniqueFieldId] = "-";
            });
        }

        AppState.isEditing = false;
        renderDocument();
        pushHistoryState();
        triggerAutoSave();
        showToast('Kolom baru berhasil ditambahkan.', 'success');
    }

    function deleteLastColumn(tableId) {
        AppState.data = extractDataFromDOM();
        
        let targetTable = tableId === 'tblMatrix' ? AppState.data.matrixTable : AppState.data.compareTable;
        let targetHeaders = tableId === 'tblMatrix' ? AppState.data.matrixHeaders : AppState.data.compareHeaders;
        
        if (!targetHeaders || targetHeaders.length <= 2) {
            showToast('Tabel harus menyisakan setidaknya satu kolom data.', 'warning');
            return;
        }

        let lastColIndex = -1;
        for (let i = targetHeaders.length - 1; i >= 0; i--) {
            if (!targetHeaders[i].isAction && targetHeaders[i].field !== 'action') {
                lastColIndex = i;
                break;
            }
        }

        if (lastColIndex === -1) return;

        const colToDelete = targetHeaders[lastColIndex];
        const colName = colToDelete.html.replace(/<[^>]+>/g, '').trim() || 'Kolom Tanpa Nama';

        if (confirm(`Hapus kolom "${colName}" beserta isinya?`)) {
            targetHeaders.splice(lastColIndex, 1);
            if (targetTable) targetTable.forEach(row => delete row[colToDelete.field]);

            AppState.isEditing = false;
            renderDocument();
            pushHistoryState();
            triggerAutoSave();
            showToast(`Kolom dihapus.`, 'warning');
        }
    }

    function addRow(tableId) {
        AppState.data = extractDataFromDOM();
        
        let targetTable = tableId === 'tblMatrix' ? AppState.data.matrixTable : AppState.data.compareTable;
        let targetHeaders = tableId === 'tblMatrix' ? AppState.data.matrixHeaders : AppState.data.compareHeaders;
        
        if (!targetHeaders || !targetTable) return;

        const newRow = {};
        targetHeaders.forEach(hdr => {
            if (hdr.field !== 'action') newRow[hdr.field] = '-';
        });
        targetTable.push(newRow);

        AppState.isEditing = false;
        renderDocument();
        pushHistoryState();
        triggerAutoSave();
        showToast('Baris baru berhasil ditambahkan.', 'success');
    }

    function deleteRow(tableId, index) {
        AppState.data = extractDataFromDOM();
        if (tableId === 'tblMatrix') AppState.data.matrixTable.splice(index, 1);
        else if (tableId === 'tblCompare') AppState.data.compareTable.splice(index, 1);
        
        AppState.isEditing = false;
        renderDocument();
        pushHistoryState();
        triggerAutoSave();
        showToast('Baris telah dihapus.', 'warning');
    }

    function duplicateRow(tableId, index) {
        AppState.data = extractDataFromDOM();
        if (tableId === 'tblMatrix') {
            const cloned = JSON.parse(JSON.stringify(AppState.data.matrixTable[index]));
            AppState.data.matrixTable.splice(index + 1, 0, cloned);
        } else if (tableId === 'tblCompare') {
            const cloned = JSON.parse(JSON.stringify(AppState.data.compareTable[index]));
            AppState.data.compareTable.splice(index + 1, 0, cloned);
        }
        AppState.isEditing = false;
        renderDocument();
        pushHistoryState();
        triggerAutoSave();
        showToast('Baris berhasil diduplikasi.', 'success');
    }

    // ==========================================================================
    // Event Listeners Aman dari Crash
    // ==========================================================================
    function setupToolbarEvents() {
        if(DOM.btnSave) DOM.btnSave.addEventListener('click', () => saveToLocalStorage(true));
        if(DOM.btnLoad) DOM.btnLoad.addEventListener('click', () => {
            const saved = localStorage.getItem('ecoval_doc_data');
            if (saved) {
                AppState.data = JSON.parse(saved);
                AppState.isEditing = false;
                renderDocument();
                pushHistoryState();
                showToast('Dimuat ulang dari LocalStorage', 'success');
            }
        });
        if(DOM.btnReset) DOM.btnReset.addEventListener('click', async () => {
            if (confirm('Aksi ini akan menghapus semua perubahan dan mereset dokumen. Lanjutkan?')) {
                localStorage.removeItem('ecoval_doc_data');
                AppState.isEditing = false;
                await fetchDefaultData();
                pushHistoryState();
                showToast('Reset sistem berhasil.', 'info');
            }
        });
        if(DOM.btnExportJson) DOM.btnExportJson.addEventListener('click', exportToJsonFile);
        if(DOM.btnImportJson) DOM.btnImportJson.addEventListener('click', () => DOM.fileInputJson.click());
        if(DOM.fileInputJson) DOM.fileInputJson.addEventListener('change', importFromJsonFile);
        if(DOM.btnPrint) DOM.btnPrint.addEventListener('click', () => window.print());
        if(DOM.btnExportPdf) DOM.btnExportPdf.addEventListener('click', () => window.print());
        if(DOM.btnUndo) DOM.btnUndo.addEventListener('click', undo);
        if(DOM.btnRedo) DOM.btnRedo.addEventListener('click', redo);
        if(DOM.btnThemeToggle) DOM.btnThemeToggle.addEventListener('click', toggleTheme);
        if(DOM.btnZoomIn) DOM.btnZoomIn.addEventListener('click', () => setZoom(10));
        if(DOM.btnZoomOut) DOM.btnZoomOut.addEventListener('click', () => setZoom(-10));
        if(DOM.searchInput) DOM.searchInput.addEventListener('input', handleSearch);
        if(DOM.btnClearSearch) DOM.btnClearSearch.addEventListener('click', clearSearch);

        // Delegasi Klik Untuk Tombol Tabel
        document.addEventListener('click', (e) => {
            const addRowBtn = e.target.closest('.btn-add-row');
            if (addRowBtn) return addRow(addRowBtn.dataset.table);

            const addColBtn = e.target.closest('.btn-add-col');
            if (addColBtn) return addColumn(addColBtn.dataset.table);

            const delColBtn = e.target.closest('.btn-del-col');
            if (delColBtn) return deleteLastColumn(delColBtn.dataset.table);

            const delRowBtn = e.target.closest('.btn-del-row');
            if (delRowBtn) {
                if(confirm("Hapus baris ini?")) return deleteRow(delRowBtn.dataset.table, parseInt(delRowBtn.dataset.index, 10));
            }

            const dupRowBtn = e.target.closest('.btn-dup-row');
            if (dupRowBtn) return duplicateRow(dupRowBtn.dataset.table, parseInt(dupRowBtn.dataset.index, 10));

            const delNoteBtn = e.target.closest('.btn-del-note');
            if (delNoteBtn) {
                if(confirm("Hapus catatan ini?")) {
                    const idx = parseInt(delNoteBtn.dataset.index, 10);
                    AppState.data = extractDataFromDOM();
                    AppState.data.notes.splice(idx, 1);
                    AppState.isEditing = false;
                    renderDocument();
                    pushHistoryState();
                    triggerAutoSave();
                }
            }
        });

        const btnAddNote = document.getElementById('btnAddNote');
        if(btnAddNote) {
            btnAddNote.addEventListener('click', () => {
                AppState.data = extractDataFromDOM();
                AppState.data.notes.push('Tulis catatan Anda di sini...');
                AppState.isEditing = false;
                renderDocument();
                pushHistoryState();
                triggerAutoSave();
            });
        }

        document.addEventListener('keydown', (e) => {
            if (e.ctrlKey || e.metaKey) {
                if (e.key === 'z' || e.key === 'Z') {
                    e.preventDefault();
                    if (e.shiftKey) redo(); else undo();
                } else if (e.key === 'y' || e.key === 'Y') {
                    e.preventDefault(); redo();
                } else if (e.key === 's' || e.key === 'S') {
                    e.preventDefault(); saveToLocalStorage(true);
                } else if (e.key === 'p' || e.key === 'P') {
                    e.preventDefault(); window.print();
                }
            }
        });
    }

    // ==========================================================================
    // JSON Impor / Ekspor
    // ==========================================================================
    function exportToJsonFile() {
        AppState.data = extractDataFromDOM();
        const dataStr = "data:text/json;charset=utf-8," + encodeURIComponent(JSON.stringify(AppState.data, null, 2));
        const downloadAnchor = document.createElement('a');
        downloadAnchor.setAttribute("href", dataStr);
        downloadAnchor.setAttribute("download", "Cheat_Sheet_Ekosistem.json");
        document.body.appendChild(downloadAnchor);
        downloadAnchor.click();
        downloadAnchor.remove();
        showToast('Diekspor ke JSON', 'success');
    }

    function importFromJsonFile(e) {
        const file = e.target.files[0];
        if (!file) return;
        const reader = new FileReader();
        reader.onload = (event) => {
            try {
                AppState.data = JSON.parse(event.target.result);
                AppState.isEditing = false;
                renderDocument();
                pushHistoryState();
                saveToLocalStorage(false);
                showToast('JSON berhasil diimpor', 'success');
            } catch (err) {
                showToast('Struktur JSON tidak valid.', 'danger');
            }
        };
        reader.readAsText(file);
        if(DOM.fileInputJson) DOM.fileInputJson.value = '';
    }

    // ==========================================================================
    // Fitur Pencarian Visual
    // ==========================================================================
    function handleSearch() {
        if(!DOM.searchInput || !DOM.documentPage) return;
        const query = DOM.searchInput.value.trim().toLowerCase();
        clearSearchHighlights();
        if (!query) return;

        const editableNodes = DOM.documentPage.querySelectorAll('[contenteditable="true"]');
        let matches = 0;

        editableNodes.forEach(node => {
            const text = node.innerText;
            if (text.toLowerCase().includes(query)) {
                matches++;
                const regex = new RegExp(`(${escapeRegExp(query)})`, 'gi');
                node.innerHTML = node.innerHTML.replace(regex, '<mark class="search-highlight">$1</mark>');
            }
        });

        if (matches > 0) showToast(`Ditemukan ${matches} kecocokan.`, 'dark');
    }

    function clearSearch() {
        if(DOM.searchInput) DOM.searchInput.value = '';
        clearSearchHighlights();
    }

    function clearSearchHighlights() {
        if(!DOM.documentPage) return;
        DOM.documentPage.querySelectorAll('mark.search-highlight').forEach(mark => {
            const parent = mark.parentNode;
            parent.replaceChild(document.createTextNode(mark.innerText), mark);
            parent.normalize();
        });
    }

    function escapeRegExp(string) {
        return string.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    }

    // ==========================================================================
    // UI Helpers
    // ==========================================================================
    function toggleTheme() {
        const newTheme = document.body.getAttribute('data-theme') === 'light' ? 'dark' : 'light';
        document.body.setAttribute('data-theme', newTheme);
        localStorage.setItem('ecoval_theme', newTheme);
        if(DOM.themeIcon) DOM.themeIcon.className = newTheme === 'dark' ? 'fa-solid fa-sun' : 'fa-solid fa-moon';
        showToast(`Mode ${newTheme === 'dark' ? 'Gelap' : 'Terang'}.`, 'dark');
    }

    function loadThemePreference() {
        const savedTheme = localStorage.getItem('ecoval_theme') || 'light';
        document.body.setAttribute('data-theme', savedTheme);
        if(DOM.themeIcon) DOM.themeIcon.className = savedTheme === 'dark' ? 'fa-solid fa-sun' : 'fa-solid fa-moon';
    }

    function setZoom(delta) {
        if(!DOM.documentPage || !DOM.zoomLabel) return;
        AppState.currentZoom = Math.min(Math.max(AppState.currentZoom + delta, 70), 140);
        DOM.documentPage.style.transform = `scale(${AppState.currentZoom / 100})`;
        DOM.documentPage.style.transformOrigin = 'top center';
        DOM.zoomLabel.textContent = `${AppState.currentZoom}%`;
    }

    function showToast(message, type = 'dark') {
        if (!bsToast || !DOM.toastMessage) return;
        DOM.toastMessage.textContent = message;
        const bgClass = type === 'success' ? 'bg-success' : type === 'warning' ? 'bg-warning text-dark' : type === 'danger' ? 'bg-danger' : 'bg-dark';
        DOM.toastElement.className = `toast align-items-center text-white ${bgClass} border-0 shadow-lg`;
        bsToast.show();
    }

    initApplication();
});