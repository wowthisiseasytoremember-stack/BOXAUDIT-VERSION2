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
    
    if (locationMatch && !raw.includes("tag") && !raw.includes("context")) {
        // It looks like a pure navigation command
        // reconstructing standard format checks
        const type = locationMatch[1].toLowerCase().startsWith('s') ? 'SHELF' : 'BOX';
        const val = locationMatch[2].toUpperCase();
        
        // Use global switchBox
        window.switchBox(`${type} ${val}`);
        flashFeedback(`Switched to ${type} ${val}`);
        return;
    }
    
    // Command 2: "Tag [Context]" or "Set Context [Ctx]"
    // User Example: "adding photos from estate sale today, adding them to box 45"
    // Heuristic: If it mentions "box XX", do the switch. If it has extra words, treat as context/tags.
    
    // Check for embedded location switch in a longer sentence
    const embeddedBox = raw.match(/box\s+(\d+)/i);
    if (embeddedBox) {
        const boxNum = embeddedBox[1];
        window.switchBox(`BOX${boxNum.padStart(3, '0')}`);
        // Continue processing for tags...
    }
    
    // Extract "tags" or "context"
    // If user says "Tag estate sale", we add "Estate Sale" to context.
    // If user says "Clear context", we clear.
    
    if (raw.includes("clear context") || raw.includes("clear tags") || raw.includes("stop tagging")) {
        activeContext.tags = [];
        updateContextDisplay();
        flashFeedback("Context cleared");
        return;
    }
    
    // parsing "tag [something]"
    const tagMatch = raw.match(/(?:tag|context|add tag)\s+(.+)/i);
    
    if (tagMatch) {
       addContextTag(tagMatch[1]);
       return;
    }
    
    // Fallback: If not a location command, assume it describes the current context/item if explicitly triggered via FAB?
    // User requested: "adding photos from estate sale today" -> Tag: "Estate Sale", "Today"
    
    // Simple Keyword extraction for demo purposes (User can refine)
    if (raw.includes("estate sale")) addContextTag("Estate Sale");
    
    // Date handling
    if (raw.includes("today")) {
        addContextTag(new Date().toLocaleDateString());
    }
    
    // If nothing matched, maybe they just said a tag name directly?
    // We'll treat the whole phrase as a tag if it's short and we are in "listening" mode
    if (!locationMatch) {
        addContextTag(transcript); // Use original casing
    }
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
    const toast = document.createElement('div');
    toast.className = 'toast-feedback';
    toast.textContent = text;
    document.body.appendChild(toast);
    setTimeout(() => toast.remove(), 2500);
}

// Initialize
document.addEventListener('DOMContentLoaded', createFab);
