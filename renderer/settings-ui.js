// Relay Settings UI Logic
// Populates form controls from persisted settings, writes changes via IPC

const api = window.electronAPI;

let currentSettings = {};

// ============================================
// TAB SWITCHING
// ============================================
const tabs = document.querySelectorAll('.sidebar-item');
const sections = document.querySelectorAll('.section');

tabs.forEach(tab => {
    tab.addEventListener('click', () => {
        tabs.forEach(t => t.classList.remove('active'));
        sections.forEach(s => s.classList.remove('active'));
        tab.classList.add('active');
        document.getElementById(tab.dataset.tab).classList.add('active');
    });
});

// ============================================
// SETTINGS BINDING HELPERS
// ============================================

function bindToggle(id, settingsKey) {
    const el = document.getElementById(id);
    if (!el) return;
    el.checked = !!currentSettings[settingsKey];
    el.addEventListener('change', () => {
        currentSettings[settingsKey] = el.checked;
        api.setSettings(settingsKey, el.checked);
    });
}

function bindSelect(id, settingsKey) {
    const el = document.getElementById(id);
    if (!el) return;
    if (currentSettings[settingsKey] !== undefined) {
        el.value = currentSettings[settingsKey];
    }
    el.addEventListener('change', () => {
        currentSettings[settingsKey] = el.value;
        api.setSettings(settingsKey, el.value);
    });
}

function bindRange(id, settingsKey, valueDisplayId) {
    const el = document.getElementById(id);
    if (!el) return;
    if (currentSettings[settingsKey] !== undefined) {
        el.value = currentSettings[settingsKey];
    }
    const display = valueDisplayId ? document.getElementById(valueDisplayId) : null;
    if (display) display.textContent = el.value;

    el.addEventListener('input', () => {
        if (display) display.textContent = el.value;
        currentSettings[settingsKey] = Number(el.value);
        api.setSettings(settingsKey, Number(el.value));
        updateCaptionPreview();
    });
}

function bindTextInput(id, settingsKey) {
    const el = document.getElementById(id);
    if (!el) return;
    if (currentSettings[settingsKey] !== undefined) {
        el.value = currentSettings[settingsKey];
    }
    el.addEventListener('change', () => {
        currentSettings[settingsKey] = el.value;
        api.setSettings(settingsKey, el.value);
    });
}

function bindProfileToggle(id, profileKey) {
    const el = document.getElementById(id);
    if (!el) return;
    const profile = currentSettings.accessibilityPriorityProfile || {};
    el.checked = profile[profileKey] !== false;
    el.addEventListener('change', () => {
        if (!currentSettings.accessibilityPriorityProfile) currentSettings.accessibilityPriorityProfile = {};
        currentSettings.accessibilityPriorityProfile[profileKey] = el.checked;
        api.setSettings('accessibilityPriorityProfile', currentSettings.accessibilityPriorityProfile);
    });
}

function bindProfileSelect(id, profileKey) {
    const el = document.getElementById(id);
    if (!el) return;
    const profile = currentSettings.accessibilityPriorityProfile || {};
    if (profile[profileKey] !== undefined) {
        el.value = profile[profileKey];
    }
    el.addEventListener('change', () => {
        if (!currentSettings.accessibilityPriorityProfile) currentSettings.accessibilityPriorityProfile = {};
        currentSettings.accessibilityPriorityProfile[profileKey] = el.value;
        api.setSettings('accessibilityPriorityProfile', currentSettings.accessibilityPriorityProfile);
    });
}

function bindTagInput(id, settingsKey) {
    const container = document.getElementById(id);
    if (!container) return;
    const input = container.querySelector('input');
    const tagsEl = container.querySelector('.tags-list');
    const items = currentSettings[settingsKey] || [];

    function renderTags() {
        tagsEl.innerHTML = '';
        items.forEach((item, idx) => {
            const tag = document.createElement('span');
            tag.className = 'tag';
            tag.innerHTML = `${item} <span class="tag-remove" data-idx="${idx}">&times;</span>`;
            tagsEl.appendChild(tag);
        });
        tagsEl.querySelectorAll('.tag-remove').forEach(btn => {
            btn.addEventListener('click', () => {
                items.splice(Number(btn.dataset.idx), 1);
                currentSettings[settingsKey] = [...items];
                api.setSettings(settingsKey, currentSettings[settingsKey]);
                renderTags();
            });
        });
    }

    input.addEventListener('keydown', (e) => {
        if (e.key === 'Enter' && input.value.trim()) {
            items.push(input.value.trim());
            input.value = '';
            currentSettings[settingsKey] = [...items];
            api.setSettings(settingsKey, currentSettings[settingsKey]);
            renderTags();
        }
    });

    renderTags();
}

// ============================================
// ALERT CATEGORY TOGGLES
// ============================================
function bindAlertCategories() {
    const categories = ['emergency', 'attention', 'communication', 'appliance', 'environmental', 'media'];
    categories.forEach(cat => {
        const el = document.getElementById(`alert-${cat}`);
        if (!el) return;
        const cats = currentSettings.alertCategories || {};
        el.checked = cats[cat] !== false;
        el.addEventListener('change', () => {
            if (!currentSettings.alertCategories) currentSettings.alertCategories = {};
            currentSettings.alertCategories[cat] = el.checked;
            api.setSettings('alertCategories', currentSettings.alertCategories);
        });
    });
}

// ============================================
// CAPTION PREVIEW
// ============================================
function updateCaptionPreview() {
    const preview = document.getElementById('caption-preview');
    if (!preview) return;

    const size = currentSettings.captionFontSize || 24;
    const weight = currentSettings.captionFontWeight || 'medium';
    const font = currentSettings.captionFontFamily || '-apple-system, BlinkMacSystemFont, sans-serif';
    const textColor = currentSettings.captionTextColor || '#f5f5f7';
    const bgOpacity = (currentSettings.captionBackgroundOpacity ?? 85) / 100;
    const maxLines = currentSettings.captionMaxLines || 3;

    preview.style.fontFamily = font;
    preview.style.fontSize = `${size}px`;
    preview.style.fontWeight = weight === 'bold' ? '700' : weight === 'light' ? '300' : '500';
    preview.style.color = textColor;
    preview.style.background = `rgba(29, 29, 31, ${bgOpacity})`;
    preview.style.webkitLineClamp = maxLines;

    // Speaker colors
    const speakerSpans = preview.querySelectorAll('.preview-speaker');
    const showSpeakers = currentSettings.showSpeakerNames !== false;
    speakerSpans.forEach(s => s.style.display = showSpeakers ? 'inline' : 'none');

    // Filler words
    const fillerSpans = preview.querySelectorAll('.preview-filler');
    const fillerOpacity = currentSettings.showFillerWords !== false
        ? (currentSettings.fillerWordOpacity ?? 50) / 100
        : 1;
    fillerSpans.forEach(s => s.style.opacity = fillerOpacity);
}

// ============================================
// RESET BUTTON
// ============================================
function bindResetButton() {
    const btn = document.getElementById('reset-settings-btn');
    if (!btn) return;
    btn.addEventListener('click', async () => {
        if (confirm('Reset all settings to defaults? This cannot be undone.')) {
            await api.resetSettings();
            currentSettings = await api.getAllSettings();
            populateAll();
        }
    });
}

// ============================================
// POPULATE ALL CONTROLS
// ============================================
function populateAll() {
    // General
    bindToggle('setting-launch-login', 'launchAtLogin');
    bindToggle('setting-menu-bar', 'showInMenuBar');
    bindSelect('setting-language', 'language');

    // Captions
    bindSelect('setting-caption-font', 'captionFontFamily');
    bindRange('setting-caption-size', 'captionFontSize', 'caption-size-value');
    bindSelect('setting-caption-weight', 'captionFontWeight');
    bindSelect('setting-caption-position', 'captionPosition');
    bindRange('setting-caption-max-lines', 'captionMaxLines', 'caption-lines-value');
    bindRange('setting-caption-bg-opacity', 'captionBackgroundOpacity', 'caption-opacity-value');
    bindRange('setting-autohide-delay', 'autoHideDelay', 'autohide-value');
    bindToggle('setting-speaker-names', 'showSpeakerNames');
    bindToggle('setting-emotions', 'showEmotions');
    bindToggle('setting-timestamps', 'showTimestamps');
    bindToggle('setting-confidence', 'showConfidenceShading');
    bindToggle('setting-filler-words', 'showFillerWords');
    bindRange('setting-filler-opacity', 'fillerWordOpacity', 'filler-opacity-value');
    bindTagInput('keywords-input', 'customKeywords');

    // Sound Alerts
    bindToggle('setting-sound-alerts', 'soundAlertsEnabled');
    bindAlertCategories();

    // AI
    bindSelect('setting-ai-proactivity', 'aiProactivityLevel');
    bindSelect('setting-ai-detail', 'aiExplanationDetail');
    bindToggle('setting-guide-mode', 'guideModeEnabled');
    bindToggle('setting-priority-engine', 'priorityEngineEnabled');
    bindToggle('setting-priority-llm', 'priorityEngineUseLlm');
    bindRange('setting-priority-threshold', 'priorityInterruptThreshold', 'priority-threshold-value');
    bindProfileSelect('setting-priority-delivery', 'preferredDelivery');
    bindProfileToggle('setting-prioritize-questions', 'prioritizeQuestions');
    bindProfileToggle('setting-prioritize-actions', 'prioritizeActionItems');
    bindProfileToggle('setting-prioritize-names', 'prioritizeNameMentions');
    bindProfileToggle('setting-prioritize-sounds', 'prioritizeUrgentSounds');
    bindProfileToggle('setting-prioritize-screen', 'prioritizeScreenChanges');
    bindProfileToggle('setting-suppress-ambient', 'suppressAmbientAudio');

    // Meeting
    bindToggle('setting-meeting-detect', 'meetingAutoDetect');
    bindToggle('setting-meeting-summary', 'meetingAutoSummary');

    // Privacy
    bindToggle('setting-offline-mode', 'forceOfflineTranscription');
    bindToggle('setting-store-transcripts', 'storeTranscripts');
    bindRange('setting-retention', 'transcriptRetentionHours', 'retention-value');

    // Name Detection
    bindTagInput('names-input', 'userNames');

    // Advanced
    bindToggle('setting-debug', 'debugLogging');
    bindToggle('setting-performance', 'performanceMode');

    bindResetButton();
    updateCaptionPreview();
}

// ============================================
// INIT
// ============================================
(async function init() {
    try {
        currentSettings = await api.getAllSettings();
    } catch (e) {
        console.warn('Could not load settings:', e);
        currentSettings = {};
    }
    populateAll();

    // Listen for external settings changes
    if (api.onSettingsChanged) {
        api.onSettingsChanged(async (key, value) => {
            if (key === null) {
                currentSettings = await api.getAllSettings();
                populateAll();
            } else {
                currentSettings[key] = value;
            }
        });
    }
})();
