/**
 * EcoVal Document Editor
 * 100% CLOUD LIVE SYNC (Tabel Read-Only + Teks Editable)
 */

document.addEventListener('DOMContentLoaded', () => {
    'use strict';

    // API Google Spreadsheet Anda (Otomatis Live)
    const SPREADSHEET_API_URL = "https://script.google.com/macros/s/AKfycbzQN1bXgZeqHlbbcRhe3ZLein0cHbSsij2hRV0lmiZ06xO7c-7jpm5mo918KTY1dfUH/exec";

    let tooltips = [];
    try {
        if (typeof bootstrap !== 'undefined') {
            const tooltipTriggerList = document.querySelectorAll('[data-bs-toggle="tooltip"]');
            tooltips = [...tooltipTriggerList].map(el => new bootstrap.Tooltip(el, { trigger: 'hover' }));
            document.addEventListener('click', () => tooltips.forEach(t => t.hide()));
        }
    } catch (e) {}

    const AppState = {
        data: null,
        history: [],
        historyIndex: -1,
        maxHistory: 30,
        autoSaveTimer: null,
        autoSaveDelay: 2000, // Disimpan otomatis 2 detik setelah berhenti mengetik
        currentZoom: 100,
        isEditing: false
    };

    const DOM = {
        documentPage: document.getElementById('documentPage'),
        tblMatrixBody: document.getElementById('tblMatrixBody'),
        tblCompareBody: document.getElementById('tblCompareBody'),
        notesList: document.getElementById('notesList'),
        saveStatusText: document.getElementById('saveStatusText'),
        
        loadingMatrix: document.getElementById('loadingMatrix'),
        loadingCompare: document.getElementById('loadingCompare'),
        tblMatrix: document.getElementById('tblMatrix'),
        tblCompare: document.getElementById('tblCompare'),

        btnSave: document.getElementById('btnSave'),
        btnLoad: document.getElementById('btnLoad'),
        btnReset: document.getElementById('btnReset'),
        btnSyncApi: document.getElementById('btnSyncApi'),
        btnExportJson: document.getElementById('btnExportJson'),
        btnImportJson: document.getElementById('btnImportJson'),
        fileInputJson: document.getElementById('fileInputJson'),
        btnExportPdf: document.getElementById('btnExportPdf'),
        btnPrint: document.getElementById('btnPrint'),
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

    function formatCellText(text) {
        if (!text && text !== 0) return '';
        let str = String(text).trim();
        if (str.toUpperCase() === 'V') return '<span class="check-item">✓</span>';
        if (str.toUpperCase() === 'X') return '<span class="cross-item">✗</span>';
        return sanitizeHTML(str).replace(/\n/g, '<br>');
    }

    // ==========================================================================
    // INIT & CLOUD FETCHING
    // ==========================================================================
    async function initApplication() {
        setupGlobalEventDelegation();
        setupToolbarEvents();
        loadThemePreference();

        if(DOM.saveStatusText) DOM.saveStatusText.innerHTML = '<i class="fa-solid fa-spinner fa-spin text-primary me-1"></i> Menyinkronkan seluruh data Cloud...';
        
        await fetchGoogleSpreadsheetData();
    }

    async function fetchGoogleSpreadsheetData() {
        DOM.tblMatrix.classList.add('d-none');
        DOM.loadingMatrix.classList.remove('d-none');
        DOM.tblCompare.classList.add('d-none');
        DOM.loadingCompare.classList.remove('d-none');

        try {
            const response = await fetch(SPREADSHEET_API_URL);
            const apiData = await response.json();

            if (apiData.status === "success") {
                // 1. Render Tabel
                renderReadonlyTables(apiData.matrixTable, apiData.compareTable);
                
                // 2. Render Teks dari Cloud
                if (apiData.textData && Object.keys(apiData.textData).length > 0) {
                    AppState.data = apiData.textData;
                    AppState.isEditing = false;
                    renderCategoryA();
                    pushHistoryState();
                } else {
                    // Jika tab Teks kosong, muat data bawaan lalu suntik ke Cloud
                    await fetchDefaultCategoryA();
                    saveToCloud(false);
                }
                
                showToast('Terhubung ke Cloud Database', 'success');
                if(DOM.saveStatusText) DOM.saveStatusText.innerHTML = '<i class="fa-solid fa-cloud text-success me-1"></i> Tersinkronisasi';
            }
        } catch (error) {
            console.error("Gagal sinkronisasi Cloud:", error);
            showToast('Gagal terhubung ke Cloud.', 'danger');
            if(DOM.saveStatusText) DOM.saveStatusText.innerHTML = '<i class="fa-solid fa-cloud-xmark text-danger me-1"></i> Offline';
        } finally {
            DOM.loadingMatrix.classList.add('d-none');
            DOM.tblMatrix.classList.remove('d-none');
            DOM.loadingCompare.classList.add('d-none');
            DOM.tblCompare.classList.remove('d-none');
        }
    }

    async function fetchDefaultCategoryA() {
        try {
            const response = await fetch('data.json');
            AppState.data = await response.json();
            renderCategoryA();
            AppState.data = extractCategoryAFromDOM(); 
        } catch (error) {
            AppState.data = extractCategoryAFromDOM();
        }
    }

    // ==========================================================================
    // RENDER LOGIC
    // ==========================================================================
    function renderReadonlyTables(matrixData, compareData) {
        const tplMatrix = document.getElementById('tplMatrixRow').content;
        DOM.tblMatrixBody.innerHTML = '';
        if (matrixData && matrixData.length > 0) {
            matrixData.forEach(row => {
                const clone = document.importNode(tplMatrix, true);
                clone.querySelector('[data-field="metode"]').innerHTML = `<strong>${formatCellText(row.metode)}</strong>`;
                clone.querySelector('[data-field="jenisJasa"]').innerHTML = formatCellText(row.jenisJasa);
                clone.querySelector('[data-field="digunakanKetika"]').innerHTML = formatCellText(row.digunakanKetika);
                clone.querySelector('[data-subfield="formula"]').innerHTML = formatCellText(row.rumus);
                clone.querySelector('[data-subfield="formulaDesc"]').innerHTML = formatCellText(row.deskripsiRumus);
                clone.querySelector('[data-field="dataDibutuhkan"]').innerHTML = formatCellText(row.dataDibutuhkan);
                clone.querySelector('[data-field="contohPenerapan"]').innerHTML = formatCellText(row.contohPenerapan);
                clone.querySelector('[data-field="kelebihan"]').innerHTML = formatCellText(row.kelebihan);
                clone.querySelector('[data-field="keterbatasan"]').innerHTML = formatCellText(row.keterbatasan);
                DOM.tblMatrixBody.appendChild(clone);
            });
        }

        const tplCompare = document.getElementById('tplCompareRow').content;
        DOM.tblCompareBody.innerHTML = '';
        if (compareData && compareData.length > 0) {
            compareData.forEach(row => {
                const clone = document.importNode(tplCompare, true);
                clone.querySelector('[data-field="metode"]').innerHTML = `<strong>${formatCellText(row.metode)}</strong>`;
                clone.querySelector('[data-field="hargaPasar"]').innerHTML = formatCellText(row.hargaPasar);
                clone.querySelector('[data-field="pendapatan"]').innerHTML = formatCellText(row.pendapatan);
                clone.querySelector('[data-field="biaya"]').innerHTML = formatCellText(row.biaya);
                clone.querySelector('[data-field="kesulitan"]').innerHTML = formatCellText(row.kesulitan);
                clone.querySelector('[data-field="kebutuhanData"]').innerHTML = formatCellText(row.kebutuhanData);
                DOM.tblCompareBody.appendChild(clone);
            });
        }
    }

    function renderCategoryA() {
        if (!AppState.data || AppState.isEditing) return;

        const safeSet = (key, field) => {
            const el = document.querySelector(`[data-key="${key}"]`);
            if (el) el.innerHTML = sanitizeHTML(AppState.data[field] || '');
        };

        safeSet("headerBadge", "headerBadge");
        safeSet("docTitle", "docTitle");
        safeSet("docDescription", "docDescription");
        safeSet("section1Title", "section1Title");
        safeSet("section2Title", "section2Title");
        safeSet("notesTitle", "notesTitle");
        safeSet("footerLeft", "footerLeft");
        safeSet("footerRight", "footerRight");

        if (DOM.notesList) {
            DOM.notesList.innerHTML = '';
            if (AppState.data.notes) {
                AppState.data.notes.forEach((noteText, index) => {
                    const li = document.createElement('li');
                    li.innerHTML = `<div class="d-flex justify-content-between align-items-start"><span contenteditable="true" class="note-text flex-grow-1" data-index="${index}">${sanitizeHTML(noteText)}</span><button class="btn btn-xs text-danger btn-del-note no-print ms-3" data-index="${index}"><i class="fa-solid fa-times"></i></button></div>`;
                    DOM.notesList.appendChild(li);
                });
            }
        }
    }

    function extractCategoryAFromDOM() {
        const newData = AppState.data ? { ...AppState.data } : {};
        const safeGet = (key) => sanitizeHTML(document.querySelector(`[data-key="${key}"]`)?.innerHTML || '');
        
        newData.headerBadge = safeGet("headerBadge");
        newData.docTitle = safeGet("docTitle");
        newData.docDescription = safeGet("docDescription");
        newData.section1Title = safeGet("section1Title");
        newData.section2Title = safeGet("section2Title");
        newData.notesTitle = safeGet("notesTitle");
        newData.footerLeft = safeGet("footerLeft");
        newData.footerRight = safeGet("footerRight");

        const notes = [];
        if(DOM.notesList) {
            DOM.notesList.querySelectorAll('.note-text').forEach(span => {
                notes.push(sanitizeHTML(span.innerHTML));
            });
        }
        newData.notes = notes;

        return newData;
    }

    // ==========================================================================
    // CLOUD SAVING (REPLACES LOCALSTORAGE)
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
            if (e.target.isContentEditable) AppState.isEditing = false;
        }, true);
    }

    function triggerAutoSave() {
        if(!DOM.saveStatusText) return;
        DOM.saveStatusText.innerHTML = '<i class="fa-solid fa-spinner fa-spin text-warning me-1"></i> Menunggu...';
        clearTimeout(AppState.autoSaveTimer);
        AppState.autoSaveTimer = setTimeout(() => {
            saveToCloud(false);
            pushHistoryState();
        }, AppState.autoSaveDelay);
    }

    async function saveToCloud(notify = true) {
        if(!DOM.saveStatusText) return;
        DOM.saveStatusText.innerHTML = '<i class="fa-solid fa-spinner fa-spin text-primary me-1"></i> Mengirim ke Cloud...';
        
        AppState.data = extractCategoryAFromDOM();
        
        try {
            const response = await fetch(SPREADSHEET_API_URL, {
                method: "POST",
                redirect: "follow",
                headers: { "Content-Type": "text/plain;charset=utf-8" }, // Mencegah pemblokiran CORS Preflight
                body: JSON.stringify(AppState.data)
            });
            const result = await response.json();
            
            if(result.status === "success") {
                if (notify) showToast('Teks tersimpan di Cloud', 'success');
                DOM.saveStatusText.innerHTML = '<i class="fa-solid fa-cloud-arrow-up text-success me-1"></i> Tersimpan di Cloud';
            } else {
                throw new Error("API Error");
            }
        } catch (e) {
            console.error("Gagal simpan ke cloud:", e);
            showToast('Koneksi internet bermasalah. Gagal menyimpan.', 'danger');
            DOM.saveStatusText.innerHTML = '<i class="fa-solid fa-cloud-xmark text-danger me-1"></i> Gagal menyimpan';
        }
    }

    // ==========================================================================
    // HISTORY & UI
    // ==========================================================================
    function pushHistoryState() {
        const currentData = JSON.stringify(extractCategoryAFromDOM());
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
            renderCategoryA();
            updateUndoRedoUI();
            saveToCloud(false); // Kirim undo ke cloud
        }
    }

    function redo() {
        if (AppState.historyIndex < AppState.history.length - 1) {
            AppState.historyIndex++;
            AppState.data = JSON.parse(AppState.history[AppState.historyIndex]);
            AppState.isEditing = false;
            renderCategoryA();
            updateUndoRedoUI();
            saveToCloud(false); // Kirim redo ke cloud
        }
    }

    function updateUndoRedoUI() {
        if(DOM.btnUndo) DOM.btnUndo.disabled = AppState.historyIndex <= 0;
        if(DOM.btnRedo) DOM.btnRedo.disabled = AppState.historyIndex >= AppState.history.length - 1;
    }

    function setupToolbarEvents() {
        if(DOM.btnSyncApi) DOM.btnSyncApi.addEventListener('click', () => {
            showToast('Menyinkronkan data Cloud...', 'dark');
            fetchGoogleSpreadsheetData();
        });
        if(DOM.btnSave) DOM.btnSave.addEventListener('click', () => saveToCloud(true));
        if(DOM.btnLoad) DOM.btnLoad.addEventListener('click', () => {
            fetchGoogleSpreadsheetData();
            showToast('Memuat ulang teks dari Cloud', 'success');
        });
        if(DOM.btnReset) DOM.btnReset.addEventListener('click', async () => {
            if (confirm('Aksi ini akan me-reset teks Anda ke bawaan pabrik dan menghapus yang di Cloud. Lanjutkan?')) {
                AppState.isEditing = false;
                await fetchDefaultCategoryA();
                saveToCloud(true);
                pushHistoryState();
                showToast('Teks direset.', 'info');
            }
        });
        
        if(DOM.btnExportJson) DOM.btnExportJson.addEventListener('click', () => {
            AppState.data = extractCategoryAFromDOM();
            const dataStr = "data:text/json;charset=utf-8," + encodeURIComponent(JSON.stringify(AppState.data, null, 2));
            const a = document.createElement('a');
            a.href = dataStr; a.download = "EcoVal_Cloud_Backup.json"; a.click();
        });
        
        if(DOM.btnImportJson) DOM.btnImportJson.addEventListener('click', () => DOM.fileInputJson.click());
        if(DOM.fileInputJson) DOM.fileInputJson.addEventListener('change', (e) => {
            const file = e.target.files[0];
            if (!file) return;
            const reader = new FileReader();
            reader.onload = (event) => {
                try {
                    AppState.data = JSON.parse(event.target.result);
                    AppState.isEditing = false;
                    renderCategoryA();
                    pushHistoryState();
                    saveToCloud(true);
                    showToast('Data teks diimpor dan dikirim ke Cloud', 'success');
                } catch (err) { showToast('Format JSON salah.', 'danger'); }
            };
            reader.readAsText(file);
            DOM.fileInputJson.value = '';
        });

        if(DOM.btnPrint) DOM.btnPrint.addEventListener('click', () => window.print());
        if(DOM.btnExportPdf) DOM.btnExportPdf.addEventListener('click', () => window.print());
        if(DOM.btnUndo) DOM.btnUndo.addEventListener('click', undo);
        if(DOM.btnRedo) DOM.btnRedo.addEventListener('click', redo);
        if(DOM.btnThemeToggle) DOM.btnThemeToggle.addEventListener('click', toggleTheme);
        if(DOM.btnZoomIn) DOM.btnZoomIn.addEventListener('click', () => setZoom(10));
        if(DOM.btnZoomOut) DOM.btnZoomOut.addEventListener('click', () => setZoom(-10));
        if(DOM.searchInput) DOM.searchInput.addEventListener('input', handleSearch);
        if(DOM.btnClearSearch) DOM.btnClearSearch.addEventListener('click', () => {
            if(DOM.searchInput) DOM.searchInput.value = '';
            clearSearchHighlights();
        });

        document.addEventListener('click', (e) => {
            const delNoteBtn = e.target.closest('.btn-del-note');
            if (delNoteBtn && confirm("Hapus catatan ini?")) {
                const idx = parseInt(delNoteBtn.dataset.index, 10);
                AppState.data = extractCategoryAFromDOM();
                AppState.data.notes.splice(idx, 1);
                AppState.isEditing = false;
                renderCategoryA();
                pushHistoryState();
                saveToCloud(false);
            }
        });

        const btnAddNote = document.getElementById('btnAddNote');
        if(btnAddNote) {
            btnAddNote.addEventListener('click', () => {
                AppState.data = extractCategoryAFromDOM();
                AppState.data.notes.push('Tulis catatan baru...');
                AppState.isEditing = false;
                renderCategoryA();
                pushHistoryState();
                saveToCloud(false);
            });
        }
    }

    // (Fungsi-fungsi pencarian & UI di bawah ini tidak berubah)
    function handleSearch() {
        if(!DOM.searchInput || !DOM.documentPage) return;
        const query = DOM.searchInput.value.trim().toLowerCase();
        clearSearchHighlights();
        if (!query) return;

        const nodes = DOM.documentPage.querySelectorAll('[contenteditable="true"], td');
        let matches = 0;

        nodes.forEach(node => {
            const text = node.innerText;
            if (text.toLowerCase().includes(query)) {
                matches++;
                const regex = new RegExp(`(${escapeRegExp(query)})`, 'gi');
                node.innerHTML = node.innerHTML.replace(regex, '<mark class="search-highlight">$1</mark>');
            }
        });
        if (matches > 0) showToast(`Ditemukan ${matches} kecocokan.`, 'dark');
    }
    function clearSearchHighlights() {
        if(!DOM.documentPage) return;
        DOM.documentPage.querySelectorAll('mark.search-highlight').forEach(mark => {
            const parent = mark.parentNode;
            parent.replaceChild(document.createTextNode(mark.innerText), mark);
            parent.normalize();
        });
    }
    function escapeRegExp(string) { return string.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'); }
    function toggleTheme() {
        const newTheme = document.body.getAttribute('data-theme') === 'light' ? 'dark' : 'light';
        document.body.setAttribute('data-theme', newTheme);
        localStorage.setItem('ecoval_theme', newTheme);
        if(DOM.themeIcon) DOM.themeIcon.className = newTheme === 'dark' ? 'fa-solid fa-sun' : 'fa-solid fa-moon';
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