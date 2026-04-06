function isPlainObject(value) {
    return value && typeof value === 'object' && !Array.isArray(value);
}

function mergeState(current, patch) {
    if (!isPlainObject(patch)) return current;

    const next = { ...current };
    for (const [key, value] of Object.entries(patch)) {
        if (isPlainObject(value) && isPlainObject(current[key])) {
            next[key] = mergeState(current[key], value);
        } else {
            next[key] = value;
        }
    }
    return next;
}

export class AppStore {
    constructor(initialState = {}) {
        this.state = mergeState({
            mode: 'deaf',
            status: 'initializing',
            settings: {},
            capabilities: {},
            transcript: {
                interim: null,
                latestFinal: null
            },
            audio: {
                isRecording: false,
                isStreaming: false,
                sourceId: 'mic'
            },
            meeting: {
                active: false,
                summaryAvailable: false
            },
            lastSoundEvent: null,
            lastAction: null
        }, initialState);
        this.listeners = new Set();
    }

    getState() {
        return this.state;
    }

    subscribe(listener) {
        if (typeof listener !== 'function') {
            return () => {};
        }

        this.listeners.add(listener);
        return () => {
            this.listeners.delete(listener);
        };
    }

    setState(patch) {
        this.state = mergeState(this.state, patch);
        [...this.listeners].forEach((listener) => {
            try {
                listener(this.state);
            } catch (error) {
                console.error('[AppStore] subscriber failed', error);
            }
        });
        return this.state;
    }
}

export default AppStore;
