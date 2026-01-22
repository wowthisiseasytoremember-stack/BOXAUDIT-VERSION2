/**
 * Voice Command & FAB Module
 * Handles microphone interaction and intent parsing.
 */

// State
let isListening = false;
let recognition = null;
let activeContext = {
    tags: []
};

// --- Speech Recognition Setup ---

function initSpeechRecognition() {
    if (!('webkitSpeechRecognition' in window)) {
        console.warn('Speech recognition not supported in this environment');
        return null;
    }
    
    const recognition = new webkitSpeechRecognition();
    recognition.continuous = false; // Stop after one command for "push-to-talk" feel
    recognition.interimResults = false;
    recognition.lang = 'en-US';
    
    recognition.onstart = function() {
        isListening = true;
        updateFabState('listening');
    };
    
    recognition.onend = function() {
        isListening = false;
        updateFabState('idle');
    };
    
    recognition.onresult = function(event) {
        const transcript = event.results[0][0].transcript;
        console.log('Voice Command:', transcript);
        processVoiceCommand(transcript);
    };
    
    recognition.onerror = function(event) {
        console.error('Speech recognition error', event.error);
        isListening = false;
        updateFabState('error');
        setTimeout(() => updateFabState('idle'), 2000);
    };
    
    return recognition;
}

// --- Intent Parsing ---

function processVoiceCommand(transcript) {
    const raw = transcript.toLowerCase().trim();
    
    // Command 1: "Box [Number]" or "Shelf [Number]" -> Location Switch
    // Regex looking for "box 45", "shelf 2c", "box number 50"
    const locationMatch = raw.match(/(?:go to |open |switch to )?(box|shelf|s)\s*(?:number\s*)?(\w+)/i);
    
    if (locationMatch && !raw.includes("tag") && !raw.includes("context") && !raw.includes("secondary") && !raw.includes("located on")) {
        // It looks like a pure navigation command
        const type = locationMatch[1].toLowerCase().startsWith('s') ? 'SHELF' : 'BOX';
        const val = locationMatch[2].toUpperCase();
        
        window.switchBox(`${type} ${val}`);
        flashFeedback(`Switched to ${type} ${val}`);
        return;
    }

    // Command 2: Set Secondary Location
    // "Set shelf 2C", "Located on Shelf 4A", "Secondary location Shelf B"
    const secondaryMatch = raw.match(/(?:set |located on |secondary(?: location)? )?(?:shelf|s)\s+(\w+)/i);
    // Use a stricter pattern to avoid confusing "Shelf 2" navigation with "Set Shelf 2" if keywords are present
    const isExplicitSecondary = raw.includes("set") || raw.includes("located") || raw.includes("secondary");
    
    if (isExplicitSecondary && secondaryMatch) {
         const val = secondaryMatch[1].toUpperCase();
         const shelfLoc = `SHELF ${val}`;
         
         // Assuming app.js exposes a way to set this, or we modify data directly
         // We see safe access in app.js via setSecondaryLocation if exposed, or fallback
         // app.js exposes 'setSecondaryLocation' but it takes the full string "SHELF 2C"
         // and check if it normalizeShelfLocation.
         
         // But setSecondaryLocation is NOT exposed on window in app.js currently!
         // We might need to handle this via data or expose it.
         // Let's assume we can trigger the input change or add to window.
         
         // Ideally, app.js should expose setSecondaryLocation. 
         // For now, let's try to find it or trigger the DOM.
         const input = document.getElementById('secondaryLocationInput');
         if (input) {
             input.value = shelfLoc;
             // Trigger blur/save
             input.dispatchEvent(new Event('blur'));
             flashFeedback(`Secondary: ${shelfLoc}`);
             return;
         }
    }
    
    // Command 3: "Tag [Context]" or "Set Context [Ctx]"
    // Check for "clear" first
    if (raw.includes("clear context") || raw.includes("clear tags") || raw.includes("stop tagging")) {
        activeContext.tags = [];
        updateContextDisplay();
        flashFeedback("Context cleared");
        return;
    }
    
    // Command: Undo / Correction
    if (raw === 'undo' || raw === 'correction' || raw === 'no' || raw === 'back') {
        if (window.BoxData && window.BoxData.undo) {
            const success = window.BoxData.undo();
            if (success) {
                // We need to trigger UI update since undo() affects state but doesn't redraw directly
                // except that app.js doesn't expose updateDisplay globally? 
                // Wait, app.js logic for undo key (Ctrl+Z) calls `updateDisplay()`.
                // We don't have access to `updateDisplay` here.
                // However, we can re-emit the event or dispatch custom event.
                // Or better, let's look: `addItem` calls `updateDisplay`.
                // Ideally `app.js` should listen to a 'data-changed' event or similar.
                // For now, let's try to reload or assume app.js exposes `updateDisplay`.
                // It does NOT expose it. 
                // WORKAROUND: Trigger a non-destructive input event or similar? 
                // Or expose it. Users prefer safe code. 
                // Let's modify app.js to expose `window.updateUI = updateDisplay` momentarily.
                // Actually, let's just dispatch a keydown event for Ctrl+Z? No, that's hacky.
                // Let's expose `updateDisplay` in app.js as `window.refreshUI`.
                if (window.refreshUI) window.refreshUI();
                
                flashFeedback("Undo successful");
                if (window.AudioFeedback) window.AudioFeedback.speak("Undo");
            } else {
                flashFeedback("Nothing to undo");
            }
        }
        return;
    }

    // parsing "tag [something]"
    const tagMatch = raw.match(/(?:tag|context|add tag|set context)\s+(.+)/i);
    
    if (tagMatch) {
       // Filter out common filler words if any
       let content = tagMatch[1].replace(/^(as|to|is)\s+/, '');
       addContextTag(content);
       return;
    }
    
    // If user says simple recognized keywords (can be extended via config later)
    if (raw.includes("fragile")) addContextTag("Fragile");
    if (raw.includes("heavy")) addContextTag("Heavy");
    if (raw.includes("photos")) addContextTag("Photos");
}

function addContextTag(text) {
    // Clean up text
    let clean = text.replace(/tag|add|set|context/gi, '').trim();
    // Capitalize
    clean = clean.charAt(0).toUpperCase() + clean.slice(1);
    
    if (!activeContext.tags.includes(clean)) {
        activeContext.tags.push(clean);
        updateContextDisplay();
        flashFeedback(`Context added: ${clean}`);
    }
    
    // Expose to window for app.js to read
    window.activeContext = activeContext;
}

// --- UI Components ---

function createFab() {
    const fab = document.createElement('button');
    fab.id = 'micFab';
    fab.className = 'fab-btn';
    fab.innerHTML = `
        <svg viewBox="0 0 24 24" width="24" height="24" fill="currentColor">
            <path d="M12 14c1.66 0 3-1.34 3-3V5c0-1.66-1.34-3-3-3S9 3.34 9 5v6c0 1.66 1.34 3 3 3z"/>
            <path d="M17 11c0 2.76-2.24 5-5 5s-5-2.24-5-5H5c0 3.53 2.61 6.43 6 6.92V21h2v-3.08c3.39-.49 6-3.39 6-6.92h-2z"/>
        </svg>
    `;
    fab.onclick = toggleListening;
    document.body.appendChild(fab);
    
    // Context Display Banner
    const banner = document.createElement('div');
    banner.id = 'contextBanner';
    banner.className = 'context-banner';
    banner.style.display = 'none';
    document.body.appendChild(banner);
}

function updateFabState(state) {
    const fab = document.getElementById('micFab');
    if (!fab) return;
    
    fab.classList.remove('listening', 'error');
    if (state === 'listening') fab.classList.add('listening');
    if (state === 'error') fab.classList.add('error');
}

function updateContextDisplay() {
    const banner = document.getElementById('contextBanner');
    if (!activeContext.tags.length) {
        banner.style.display = 'none';
        return;
    }
    
    banner.style.display = 'flex';
    banner.innerHTML = `
        <span style="opacity: 0.7; margin-right: 0.5rem;">Active Context:</span>
        ${activeContext.tags.map(t => `<span class="context-tag">${t}</span>`).join('')}
        <button class="context-clear-btn" onclick="clearContext()">×</button>
    `;
    
    // Sync global
    window.activeContext = activeContext;
}

function clearContext() {
    activeContext.tags = [];
    updateContextDisplay();
}
window.clearContext = clearContext;

function toggleListening() {
    if (!recognition) {
        recognition = initSpeechRecognition();
        if (!recognition) {
            alert("Speech recognition not supported in this browser/environment.");
            return;
        }
    }
    
    if (isListening) {
        recognition.stop();
    } else {
        recognition.start();
    }
}

function flashFeedback(text) {
    // Visual Toast
    const toast = document.createElement('div');
    toast.className = 'toast-feedback';
    toast.textContent = text;
    document.body.appendChild(toast);
    setTimeout(() => toast.remove(), 2500);
    
    // Audio Feedback
    if (window.AudioFeedback) {
        // "Switched to BOX 42" -> "Switched to Box four two"
        window.AudioFeedback.speak(text);
    }
}

// Initialize
document.addEventListener('DOMContentLoaded', createFab);
