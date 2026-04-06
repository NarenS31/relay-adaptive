export class VisionAssistant {
    constructor({ screenExplainer, imageDescriber, blindMode, commandBar } = {}) {
        this.screenExplainer = screenExplainer;
        this.imageDescriber = imageDescriber;
        this.blindMode = blindMode;
        this.commandBar = commandBar;
    }

    toggleScreenExplanation() {
        this.screenExplainer?.toggle?.();
    }

    hideScreenExplanation() {
        this.screenExplainer?.hide?.();
    }

    toggleCommandBar() {
        this.commandBar?.toggle?.();
    }

    hideCommandBar() {
        this.commandBar?.hide?.();
    }

    async describeVisibleImages() {
        return this.imageDescriber?.describePageImages?.() || null;
    }

    stop() {
        try {
            window.speechSynthesis?.cancel?.();
        } catch (error) {
            // Ignore browser speech synthesis cancellation failures.
        }

        this.hideScreenExplanation();
        this.hideCommandBar();
        this.blindMode?.stopSpeaking?.();
    }
}

export default VisionAssistant;
