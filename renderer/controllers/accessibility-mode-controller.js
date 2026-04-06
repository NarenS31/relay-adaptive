function normalizeMode(mode) {
    return String(mode || '').toLowerCase() === 'blind' ? 'blind' : 'deaf';
}

export class HearingAccessibilityController {
    constructor({ toneCaptioning, onShowTranscript, onHideTranscript, onSetBlindControls, onApplyGestureState } = {}) {
        this.toneCaptioning = toneCaptioning;
        this.onShowTranscript = typeof onShowTranscript === 'function' ? onShowTranscript : () => {};
        this.onHideTranscript = typeof onHideTranscript === 'function' ? onHideTranscript : () => {};
        this.onSetBlindControls = typeof onSetBlindControls === 'function' ? onSetBlindControls : () => {};
        this.onApplyGestureState = typeof onApplyGestureState === 'function' ? onApplyGestureState : () => {};
    }

    activate() {
        this.onSetBlindControls(false);
        this.toneCaptioning?.activate?.();
        this.onShowTranscript();
        this.onApplyGestureState('deaf');
    }

    deactivate() {
        this.toneCaptioning?.deactivate?.();
        this.onHideTranscript();
    }
}

export class VisionAccessibilityController {
    constructor({ blindMode, toneCaptioning, onShowTranscript, onHideTranscript, onSetBlindControls, onApplyGestureState } = {}) {
        this.blindMode = blindMode;
        this.toneCaptioning = toneCaptioning;
        this.onSetBlindControls = typeof onSetBlindControls === 'function' ? onSetBlindControls : () => {};
        this.onShowTranscript = typeof onShowTranscript === 'function' ? onShowTranscript : () => {};
        this.onHideTranscript = typeof onHideTranscript === 'function' ? onHideTranscript : () => {};
        this.onApplyGestureState = typeof onApplyGestureState === 'function' ? onApplyGestureState : () => {};
    }

    activate() {
        this.blindMode?.activate?.();
        this.toneCaptioning?.deactivate?.();
        this.onSetBlindControls(true);
        this.onHideTranscript();
        this.onApplyGestureState('blind');
    }

    deactivate() {
        this.blindMode?.deactivate?.();
        this.onSetBlindControls(false);
        this.onShowTranscript();
    }
}

export class AccessibilityModeCoordinator {
    constructor({ store, eventBus, persistMode, updateModeIndicator, onAfterModeApplied, controllers = {} } = {}) {
        this.store = store;
        this.eventBus = eventBus;
        this.persistMode = typeof persistMode === 'function' ? persistMode : () => {};
        this.updateModeIndicator = typeof updateModeIndicator === 'function' ? updateModeIndicator : () => {};
        this.onAfterModeApplied = typeof onAfterModeApplied === 'function' ? onAfterModeApplied : () => {};
        this.controllers = controllers;
        this.activeMode = normalizeMode(store?.getState?.().mode || 'deaf');
    }

    applyMode(nextMode, meta = {}) {
        const mode = normalizeMode(nextMode);
        const previousMode = normalizeMode(meta.previousMode || this.activeMode);

        if (previousMode !== mode) {
            this.controllers[previousMode]?.deactivate?.({ mode, previousMode });
        }

        this.controllers[mode]?.activate?.({ mode, previousMode });

        this.activeMode = mode;
        this.persistMode(mode);
        this.updateModeIndicator(mode);
        this.store?.setState({ mode });
        this.eventBus?.emit('mode.changed', { mode, previousMode });
        this.onAfterModeApplied(mode, previousMode);
        return mode;
    }
}

export default AccessibilityModeCoordinator;
