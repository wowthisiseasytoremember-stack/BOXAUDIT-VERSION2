/**
 * Data Management Module
 * Handles session state, persistence, and data normalization.
 */

// Global State
let currentSession = {
    id: null,
    startedAt: null,
    boxes: {}
};

let history = [];
let historyIndex = -1;
let saveInProgress = false;
let savePending = false;
let autoSaveInterval = null;

// --- Data Shape & Normalization ---

function createEmptyBoxData() {
    return {
        items: [],
        completed: false,
        completedAt: null,
        secondaryLocation: null
    };
}

function ensureBoxDataShape(boxData) {
    if (!boxData || typeof boxData !== 'object') return createEmptyBoxData();
    if (!Array.isArray(boxData.items)) boxData.items = [];
    if (typeof boxData.completed !== 'boolean') boxData.completed = false;
    if (!boxData.completedAt) boxData.completedAt = null;
    if (!Object.prototype.hasOwnProperty.call(boxData, 'secondaryLocation')) boxData.secondaryLocation = null;
    return boxData;
}

function ensureBoxExists(boxKey) {
    const existing = currentSession.boxes[boxKey];
    if (!existing) {
        const created = createEmptyBoxData();
        currentSession.boxes[boxKey] = created;
        return created;
    }
    return ensureBoxDataShape(existing);
}

// Normalize box/shelf number to consistent format
function normalizeBoxNumber(boxNumber) {
    if (!boxNumber) return null;
    
    const upper = boxNumber.toUpperCase().trim();
    
    // Handle SHELF patterns: SHELF 2C, SHELF 1A, SHELF XY, etc.
    const shelfMatch = upper.match(/^SHELF\s*(\d+)([A-Za-z]*)$/i);
    if (shelfMatch) {
        const num = shelfMatch[1];
        const letter = shelfMatch[2] || '';
        return `SHELF ${num}${letter}`;
    }
    
    // Handle shorthand S patterns: S 2C, S1A, etc.
    const sMatch = upper.match(/^S\s*(\d+)([A-Za-z]*)$/i);
    if (sMatch) {
        const num = sMatch[1];
        const letter = sMatch[2] || '';
        return `SHELF ${num}${letter}`;
    }
    
    // Handle BOX patterns: BOX###, B###, or just ###
    const numMatch = upper.match(/\d+/);
    if (numMatch) {
        const numStr = numMatch[0];
        const num = parseInt(numStr, 10);
        // Pad to 3 digits and return as BOX###
        return `BOX${num.toString().padStart(3, '0')}`;
    }
    
    // If no pattern matches, return uppercase as-is
    return upper;
}

function normalizeShelfLocation(value) {
    if (!value) return null;
    const upper = value.toUpperCase().trim();
    const shelfMatch = upper.match(/^SHELF\s*(\d+)([A-Za-z]*)$/i);
    if (shelfMatch) {
        const num = shelfMatch[1];
        const letter = shelfMatch[2] || '';
        return `SHELF ${num}${letter}`;
    }
    const sMatch = upper.match(/^S\s*(\d+)([A-Za-z]*)$/i);
    if (sMatch) {
        const num = sMatch[1];
        const letter = sMatch[2] || '';
        return `SHELF ${num}${letter}`;
    }
    return null;
}

function isShelfLocation(value) {
    return typeof value === 'string' && value.startsWith('SHELF ');
}

function isBoxLocation(value) {
    return typeof value === 'string' && value.startsWith('BOX');
}

function parseLocationInput(raw) {
    if (!raw) return null;
    const trimmed = raw.trim();
    if (!trimmed) return null;

    const shelfMatch = trimmed.match(/SHELF\s*\d+[A-Za-z]*|S\s*\d+[A-Za-z]*/i);
    const shelf = shelfMatch ? normalizeShelfLocation(shelfMatch[0]) : null;
    let remaining = shelfMatch ? trimmed.replace(shelfMatch[0], ' ') : trimmed;

    const boxMatch = remaining.match(/BOX\s*\d+|B\s*\d+|\b\d+\b/i);
    const box = boxMatch ? normalizeBoxNumber(boxMatch[0]) : null;
    if (boxMatch) {
        remaining = remaining.replace(boxMatch[0], ' ');
    }

    // Reject if extra words exist (likely an item name)
    if (remaining.trim().length > 0) {
        return null;
    }

    if (box && shelf) {
        return { primary: box, secondary: shelf };
    }
    if (box) {
        return { primary: box, secondary: null };
    }
    if (shelf) {
        return { primary: shelf, secondary: null };
    }
    return null;
}

// Parse quantity from item name (e.g., "batteries x3" -> {name: "batteries", qty: 3})
function parseQuantity(itemName) {
    if (!itemName) return { name: itemName, qty: 1 };
    
    let name = itemName.trim();
    let qty = 1;
    
    // Pattern: "item x3" or "item X3"
    const xPattern = /\s+[xX](\d+)\s*$/;
    const xMatch = name.match(xPattern);
    if (xMatch) {
        qty = parseInt(xMatch[1], 10) || 1;
        name = name.replace(xPattern, '').trim();
    } else {
        // Pattern: "item (3)" or "item (03)"
        const parenPattern = /\s*\((\d+)\)\s*$/;
        const parenMatch = name.match(parenPattern);
        if (parenMatch) {
            qty = parseInt(parenMatch[1], 10) || 1;
            name = name.replace(parenPattern, '').trim();
        }
    }
    
    return { name: name || itemName, qty: qty || 1 };
}

function normalizeItemQuantities() {
    for (const [boxKey, boxData] of Object.entries(currentSession.boxes)) {
        if (!boxData.items) continue;
        
        for (const item of boxData.items) {
            // Only normalize if qty is 1 and name contains quantity pattern
            if (item.qty === 1 || !item.qty) {
                const parsed = parseQuantity(item.name);
                if (parsed.qty > 1) {
                    item.name = parsed.name;
                    item.qty = parsed.qty;
                } else if (!item.qty) {
                    item.qty = 1;
                }
            }
        }
    }
}

function normalizeSessionBoxes() {
    const normalizedBoxes = {};
    
    for (const [boxKey, boxData] of Object.entries(currentSession.boxes)) {
        const normalizedKey = normalizeBoxNumber(boxKey);
        const safeBoxData = ensureBoxDataShape(boxData);
        
        if (normalizedBoxes[normalizedKey]) {
            ensureBoxDataShape(normalizedBoxes[normalizedKey]);
            // Merge items if box already exists
            normalizedBoxes[normalizedKey].items = [
                ...normalizedBoxes[normalizedKey].items,
                ...safeBoxData.items
            ];
            // Preserve completed status if either was completed
            if (safeBoxData.completed || normalizedBoxes[normalizedKey].completed) {
                normalizedBoxes[normalizedKey].completed = true;
                normalizedBoxes[normalizedKey].completedAt = normalizedBoxes[normalizedKey].completedAt || safeBoxData.completedAt;
            }
            // Preserve secondary location if either has one
            if (safeBoxData.secondaryLocation && !normalizedBoxes[normalizedKey].secondaryLocation) {
                normalizedBoxes[normalizedKey].secondaryLocation = safeBoxData.secondaryLocation;
            }
        } else {
            normalizedBoxes[normalizedKey] = { 
                ...safeBoxData,
                completed: safeBoxData.completed || false,
                completedAt: safeBoxData.completedAt || null,
                secondaryLocation: safeBoxData.secondaryLocation || null
            };
        }
    }
    
    currentSession.boxes = normalizedBoxes;
    normalizeItemQuantities();
    
    // Update currentBox if it exists (global variable assumed to be managed by app.js)
    // Note: We perform this normalization but updating the active UI state 'currentBox' happens in app.js
}

function markExistingBoxesAsCompleted() {
    const migrationKey = 'boxAudit_completedMigration_v1';
    const migrationDone = localStorage.getItem(migrationKey);
    
    if (migrationDone === 'true') return;
    
    let markedCount = 0;
    const now = new Date().toISOString();
    
    for (const [boxKey, boxData] of Object.entries(currentSession.boxes)) {
        if (boxData.items && boxData.items.length > 0 && !boxData.completed) {
            boxData.completed = true;
            boxData.completedAt = boxData.completedAt || now;
            markedCount++;
        }
    }
    
    if (markedCount > 0) {
        localStorage.setItem(migrationKey, 'true');
        saveToStorage();
        console.log(`Marked ${markedCount} existing boxes as completed`);
    } else {
        localStorage.setItem(migrationKey, 'true');
    }
}


// --- Persistence ---

function startNewSession() {
    const now = new Date();
    currentSession = {
        id: `session-${now.toISOString().replace(/[:.]/g, '-')}`,
        startedAt: now.toISOString(),
        boxes: {}
    };
    saveToStorage();
}

function loadSession() {
    try {
        let data = null;
        
        // Try Electron
        if (window.electronAPI && window.electronAPI.loadData) {
            const fileData = window.electronAPI.loadData();
            if (fileData) {
                data = fileData;
                console.log('✓ Loaded from Electron file system');
            }
        }
        
        // Fallback LocalStorage
        if (!data) {
            let stored = localStorage.getItem('boxAuditSession');
            if (!stored) {
                stored = sessionStorage.getItem('boxAuditSession_backup');
                if (stored) {
                    localStorage.setItem('boxAuditSession', stored);
                }
            }
            if (stored) {
                data = JSON.parse(stored);
            }
        }
        
        if (data && typeof data === 'object') {
            if (!data.boxes || typeof data.boxes !== 'object') {
                console.error('Invalid data structure: missing boxes');
                data = { id: null, startedAt: new Date().toISOString(), boxes: {} };
            }
            
            currentSession = data;
            
            for (const [boxKey, boxData] of Object.entries(currentSession.boxes)) {
                currentSession.boxes[boxKey] = ensureBoxDataShape(boxData);
            }
            
            normalizeSessionBoxes();
            saveToStorage(); 
            markExistingBoxesAsCompleted();
            
            return true; // Loaded successfully
        } else {
            console.warn('No valid session data found, starting new session');
            startNewSession();
            return false;
        }
    } catch (e) {
        console.error('Error loading session:', e);
        try {
            const backup = sessionStorage.getItem('boxAuditSession_backup');
            if (backup) {
                currentSession = JSON.parse(backup);
                return true;
            }
        } catch (e2) {}
        return false;
    }
}

function saveToStorage() {
    if (saveInProgress) {
        savePending = true;
        return;
    }
    
    saveInProgress = true;
    
    try {
        const dataToSave = JSON.stringify(currentSession);
        
        // Electron
        if (window.electronAPI && window.electronAPI.saveData) {
            const success = window.electronAPI.saveData(currentSession);
            if (success) {
                try {
                    localStorage.setItem('boxAuditSession', dataToSave);
                } catch (e) {}
                return;
            }
        }
        
        // LocalStorage
        try {
            localStorage.setItem('boxAuditSession', dataToSave);
            const verify = localStorage.getItem('boxAuditSession');
            if (!verify || verify !== dataToSave) {
                throw new Error("Verification failed");
            }
        } catch (e) {
            sessionStorage.setItem('boxAuditSession_backup', dataToSave);
            if (window.showSaveError) window.showSaveError('Data saved to session backup only (Persistence failed).');
        }
    } catch (e) {
        console.error('Error saving session:', e);
        if (window.showSaveError) window.showSaveError('Error saving: ' + e.message);
    } finally {
        saveInProgress = false;
        if (savePending) {
            savePending = false;
            setTimeout(() => saveToStorage(), 0);
        }
    }
}

function autoSave() {
    saveToStorage();
}

// History Management
function saveStateToHistory() {
    // Remove future history
    history = history.slice(0, historyIndex + 1);
    // Push current
    history.push(JSON.parse(JSON.stringify(currentSession)));
    historyIndex = history.length - 1;
    
    if (history.length > (window.CONFIG?.MAX_HISTORY_SIZE || 50)) {
        history.shift();
        historyIndex--;
    }
}

function undo() {
    if (historyIndex > 0) {
        historyIndex--;
        currentSession = JSON.parse(JSON.stringify(history[historyIndex]));
        return true;
    }
    return false;
}

function redo() {
    if (historyIndex < history.length - 1) {
        historyIndex++;
        currentSession = JSON.parse(JSON.stringify(history[historyIndex]));
        return true;
    }
    return false;
}

// Make accessible to window
window.BoxData = {
    currentSession,
    history,
    createEmptyBoxData,
    ensureBoxDataShape,
    ensureBoxExists,
    normalizeBoxNumber,
    normalizeShelfLocation,
    isShelfLocation,
    isBoxLocation,
    parseLocationInput,
    parseQuantity,
    loadSession,
    saveToStorage,
    autoSave,
    saveStateToHistory,
    undo,
    redo,
    startNewSession
};
