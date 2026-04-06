export class CapabilityRegistry {
    constructor({ electronAPI = null, mediaDevices = null, speechSynthesis = null } = {}) {
        this.electronAPI = electronAPI;
        this.mediaDevices = mediaDevices || navigator.mediaDevices;
        this.speechSynthesis = speechSynthesis || window.speechSynthesis;
    }

    async collect() {
        const capabilities = {
            transcription: Boolean(this.electronAPI?.deepgramStart),
            meetingSummary: Boolean(this.electronAPI?.generateMeetingSummary),
            screenExplanation: Boolean(this.electronAPI?.explainScreen),
            followUpQuestions: Boolean(this.electronAPI?.askFollowUp),
            imageAnalysis: Boolean(this.electronAPI?.analyzeImage || this.electronAPI?.captureScreen),
            textToSpeech: Boolean(this.electronAPI?.ttsSpeak || this.speechSynthesis),
            screenCapture: Boolean(this.electronAPI?.captureScreen),
            sourceSelection: Boolean(this.electronAPI?.getSources),
            shortcuts: Boolean(this.electronAPI?.onShortcut),
            cameraAccess: false,
            microphoneAccess: false
        };

        if (this.mediaDevices?.enumerateDevices) {
            try {
                const devices = await this.mediaDevices.enumerateDevices();
                capabilities.cameraAccess = devices.some((device) => device.kind === 'videoinput');
                capabilities.microphoneAccess = devices.some((device) => device.kind === 'audioinput');
            } catch (error) {
                console.warn('[Capabilities] Unable to enumerate devices:', error?.message || error);
            }
        }

        return capabilities;
    }
}

export default CapabilityRegistry;
