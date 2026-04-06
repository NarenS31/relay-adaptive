export class HearingAssistant {
    constructor({ meetingMode, transcriptStore, captionRenderer, alertSystem, confusionDetector } = {}) {
        this.meetingMode = meetingMode;
        this.transcriptStore = transcriptStore;
        this.captionRenderer = captionRenderer;
        this.alertSystem = alertSystem;
        this.confusionDetector = confusionDetector;
    }

    handleTranscript(result) {
        if (!result?.transcript?.trim()) return;

        if (result.isFinal) {
            this.captionRenderer?.addFinalSegment?.(result);
            this.transcriptStore?.store?.({
                text: result.transcript,
                words: result.words,
                speaker: result.words?.[0]?.speaker ?? null,
                confidence: result.confidence,
                timestamp: Date.now()
            });
            this.meetingMode?.addTranscript?.(result);

            if (result.words) {
                const nameMention = this.captionRenderer?.checkNameMention?.(result.words);
                if (nameMention) {
                    this.alertSystem?.show?.({
                        category: 'nameMention',
                        label: `"${nameMention}" was mentioned`,
                        detail: result.transcript
                    });
                    this.confusionDetector?.onNameMentioned?.(nameMention);
                }
            }
        } else {
            this.captionRenderer?.setInterim?.(result);
        }

        this.confusionDetector?.recordActivity?.();
    }

    async generateMeetingSummary() {
        return this.meetingMode?.generateSummary?.() || null;
    }

    toggleMeeting() {
        if (!this.meetingMode?.toggleManualSession) return false;
        return this.meetingMode.toggleManualSession();
    }
}

export default HearingAssistant;
