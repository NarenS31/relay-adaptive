export class ActionController {
    constructor(options = {}) {
        this.captionBar = options.captionBar || null;
        this.alertOverlay = options.alertOverlay || null;
        this.appStore = options.appStore || null;
        this.appBus = options.appBus || null;
        this.appSettingsRef = options.appSettingsRef || (() => ({}));
        this.alertSystem = options.alertSystem || null;
        this.captionRenderer = options.captionRenderer || null;
        this.hearingAssistant = options.hearingAssistant || null;
        this.visionAssistant = options.visionAssistant || null;
        this.meetingMode = options.meetingMode || null;
        this.navigator = options.navigator || null;
        this.electronAPI = options.electronAPI || null;
        this.onMeetingSummary = typeof options.onMeetingSummary === 'function' ? options.onMeetingSummary : () => {};
        this.onSpeakActionCompletion = typeof options.onSpeakActionCompletion === 'function' ? options.onSpeakActionCompletion : () => {};
        this.onSpeakBlindConfirmation = typeof options.onSpeakBlindConfirmation === 'function' ? options.onSpeakBlindConfirmation : () => {};
        this.onSetStatusText = typeof options.onSetStatusText === 'function' ? options.onSetStatusText : () => {};
        this.onResetListeningStatus = typeof options.onResetListeningStatus === 'function' ? options.onResetListeningStatus : () => {};
    }

    handleAction(action, { source = 'unknown' } = {}) {
        this.appStore?.setState?.({
            lastAction: {
                action,
                source,
                timestamp: Date.now()
            }
        });
        this.appBus?.emit?.('action.requested', { action, source });

        const appSettings = this.appSettingsRef() || {};

        switch (action) {
            case 'toggle-captions': {
                const vis = this.captionBar?.style?.display;
                if (this.captionBar) {
                    this.captionBar.style.display = vis === 'none' ? 'flex' : 'none';
                }
                this.onSpeakActionCompletion('toggle-captions', { source });
                break;
            }
            case 'explain-screen':
                this.visionAssistant?.toggleScreenExplanation?.();
                break;
            case 'command-bar':
                this.visionAssistant?.toggleCommandBar?.();
                break;
            case 'request-guidance':
                if (appSettings.accessibilityMode === 'blind') {
                    break;
                }
                this.navigator?.toggle?.();
                break;
            case 'dismiss-alerts':
                this.alertSystem?.dismissAll?.();
                if (this.alertOverlay) {
                    this.alertOverlay.className = '';
                }
                this.onSpeakActionCompletion('dismiss-alerts', { source });
                break;
            case 'caption-larger': {
                const newSize = this.captionRenderer?.increaseFontSize?.();
                if (newSize && this.electronAPI?.setSettings) {
                    this.electronAPI.setSettings('captionFontSize', newSize);
                }
                break;
            }
            case 'caption-smaller': {
                const newSize = this.captionRenderer?.decreaseFontSize?.();
                if (newSize && this.electronAPI?.setSettings) {
                    this.electronAPI.setSettings('captionFontSize', newSize);
                }
                break;
            }
            case 'open-settings':
                this.electronAPI?.openSettings?.();
                this.onSpeakActionCompletion('open-settings', { source });
                break;
            case 'meeting-summary':
                if (this.meetingMode?.isActive) {
                    this.onMeetingSummary();
                    this.onSpeakActionCompletion('meeting-summary', { source });
                } else {
                    this.onSetStatusText('No active meeting');
                    this.onResetListeningStatus(1400);
                    this.onSpeakBlindConfirmation('No active meeting', 'meeting-summary-empty', 1000);
                }
                break;
            case 'meeting-toggle': {
                const isActive = this.hearingAssistant?.toggleMeeting?.();
                this.meetingMode?.updateBadge?.();
                this.appStore?.setState?.({
                    meeting: {
                        active: Boolean(isActive),
                        summaryAvailable: Boolean(isActive)
                    }
                });
                this.onSetStatusText(isActive ? 'Meeting mode active' : 'Meeting mode ended');
                this.onResetListeningStatus(1400);
                this.onSpeakActionCompletion('meeting-toggle', {
                    source,
                    extra: isActive ? 'Meeting mode active' : 'Meeting mode ended'
                });
                break;
            }
            case 'show-transcripts':
                if (appSettings.accessibilityMode === 'blind') {
                    break;
                }
                if (this.electronAPI?.openTranscriptViewer) {
                    this.electronAPI.openTranscriptViewer();
                    this.onSpeakActionCompletion('show-transcripts', { source });
                }
                break;
            case 'stop-all':
                this.visionAssistant?.stop?.();
                this.onSetStatusText('Stopped');
                this.onResetListeningStatus(1200);
                this.onSpeakActionCompletion('stop-all', { source });
                break;
            default:
                console.log('Unknown action:', action);
        }
    }
}

export default ActionController;
