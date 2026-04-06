const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('electronAPI', {
    setIgnoreMouseEvents: (ignore, options) => ipcRenderer.send('set-ignore-mouse-events', ignore, options),
    openSettings: () => ipcRenderer.invoke('open-settings'),
    log: (message) => ipcRenderer.send('console-log', message),
    quit: () => ipcRenderer.send('quit-app'),
    minimize: () => ipcRenderer.send('minimize-app'),
    expandOverlay: () => ipcRenderer.send('expand-overlay'),
    collapseOverlay: () => ipcRenderer.send('collapse-overlay'),
    setOverlayHeight: (height) => ipcRenderer.invoke('set-overlay-height', height),
    getSources: () => ipcRenderer.invoke('get-sources'),
    closeSetup: () => ipcRenderer.send('close-setup'),

    // Setup wizard testing
    testAccessibility: () => ipcRenderer.invoke('test-accessibility'),
    testDeepgram: () => ipcRenderer.invoke('test-deepgram'),
    testTTS: () => ipcRenderer.invoke('test-tts'),
    openSystemSettings: (type) => ipcRenderer.send('open-system-settings', type),

    // AI Guide
    aiGenerateGuide: (query) => ipcRenderer.invoke('ai-generate-guide', query),
    getActiveWindow: () => ipcRenderer.invoke('get-active-window'),
    desktopNavigateTarget: (targetPhrase) => ipcRenderer.invoke('desktop-navigate-target', targetPhrase),
    desktopClickTarget: (targetPhrase) => ipcRenderer.invoke('desktop-click-target', targetPhrase),
    desktopTypeText: (payload) => ipcRenderer.invoke('desktop-type-text', payload),
    desktopPressKey: (payload) => ipcRenderer.invoke('desktop-press-key', payload),
    desktopAutomationPlan: (payload) => ipcRenderer.invoke('desktop-automation-plan', payload),
    desktopAutomationExecute: (plan) => ipcRenderer.invoke('desktop-automation-execute', plan),
    desktopAutomationStatus: () => ipcRenderer.invoke('desktop-automation-status'),
    onAutomationPreflight: (callback) => ipcRenderer.on('automation-preflight', (_event, status) => callback(status)),

    // Legacy pre-recorded transcription (fallback)
    transcribeAudio: (audioData) => ipcRenderer.invoke('transcribe-audio', audioData),

    // Deepgram Real-Time Streaming API
    deepgramStart: () => ipcRenderer.invoke('deepgram-start'),
    deepgramStop: () => ipcRenderer.invoke('deepgram-stop'),
    deepgramSendAudio: (audioData) => ipcRenderer.send('deepgram-audio', audioData),

    // Deepgram event listeners
    onDeepgramTranscript: (callback) => ipcRenderer.on('deepgram-transcript', (_event, result) => callback(result)),
    onDeepgramStatus: (callback) => ipcRenderer.on('deepgram-status', (_event, status) => callback(status)),
    onDeepgramUtteranceEnd: (callback) => ipcRenderer.on('deepgram-utterance-end', () => callback()),

    // TTS
    ttsSpeak: (text) => ipcRenderer.invoke('tts-speak', text),

    // Context awareness
    onContextUpdate: (callback) => ipcRenderer.on('context-update', (_event, appName) => callback(appName)),

    // === NEW: Settings ===
    getSettings: (key) => ipcRenderer.invoke('settings-get', key),
    setSettings: (key, value) => ipcRenderer.invoke('settings-set', key, value),
    getAllSettings: () => ipcRenderer.invoke('settings-get-all'),
    resetSettings: () => ipcRenderer.invoke('settings-reset'),
    onSettingsChanged: (callback) => ipcRenderer.on('settings-changed', (_event, key, value) => callback(key, value)),

    // === NEW: Global Shortcuts ===
    onShortcut: (callback) => ipcRenderer.on('shortcut', (_event, action) => callback(action)),

    // === NEW: Screen Explanation AI ===
    explainScreen: () => ipcRenderer.invoke('explain-screen'),
    contextAssist: (payload) => ipcRenderer.invoke('context-assist', payload),
    askFollowUp: (question, context) => ipcRenderer.invoke('ask-follow-up', question, context),
    captureScreen: (options) => ipcRenderer.invoke('capture-screen', options),
    analyzeImage: (imageData, options) => ipcRenderer.invoke('analyze-image', imageData, options),
    rankAccessibilityEvent: (payload) => ipcRenderer.invoke('rank-accessibility-event', payload),

    // === NEW: Command Bar ===
    executeCommand: (query) => ipcRenderer.invoke('execute-command', query),

    // === NEW: Meeting Mode ===
    generateMeetingSummary: (data) => ipcRenderer.invoke('generate-meeting-summary', data),

    // === NEW: Transcript Export ===
    openTranscriptViewer: () => ipcRenderer.invoke('open-transcript-viewer'),
    exportTranscript: (format, data) => ipcRenderer.invoke('export-transcript', format, data),

    // === NEW: Audio Devices ===
    enumerateAudioDevices: () => ipcRenderer.invoke('enumerate-audio-devices'),

    // === NEW: Haptic Feedback ===
    triggerHaptic: (pattern) => ipcRenderer.send('trigger-haptic', pattern),

    // === ML Sound Classification ===
    classifyAudio: (audioData, sampleRate) => {
        // Preserve mono/stereo payloads while remaining IPC-serializable.
        let payload;
        if (audioData && typeof audioData === 'object' && (audioData.mono || audioData.left || audioData.right)) {
            payload = {
                mono: audioData.mono ? Array.from(audioData.mono) : null,
                left: audioData.left ? Array.from(audioData.left) : null,
                right: audioData.right ? Array.from(audioData.right) : null
            };
        } else if (audioData instanceof Float32Array) {
            payload = Array.from(audioData);
        } else {
            payload = Array.from(audioData || []);
        }
        return ipcRenderer.invoke('classify-audio', payload, sampleRate);
    },
    classifierStatus: () => ipcRenderer.invoke('classifier-status'),
    onClassifierReady: (callback) => ipcRenderer.on('classifier-ready', (_event, model) => callback(model)),
});
