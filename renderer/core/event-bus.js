export class EventBus {
    constructor() {
        this.listeners = new Map();
    }

    on(eventName, listener) {
        if (typeof listener !== 'function') {
            return () => {};
        }

        const key = String(eventName || '').trim();
        if (!key) {
            return () => {};
        }

        if (!this.listeners.has(key)) {
            this.listeners.set(key, new Set());
        }

        const bucket = this.listeners.get(key);
        bucket.add(listener);

        return () => {
            bucket.delete(listener);
            if (bucket.size === 0) {
                this.listeners.delete(key);
            }
        };
    }

    emit(eventName, payload) {
        const key = String(eventName || '').trim();
        if (!key) return;

        const bucket = this.listeners.get(key);
        if (!bucket || bucket.size === 0) return;

        [...bucket].forEach((listener) => {
            try {
                listener(payload);
            } catch (error) {
                console.error(`[EventBus] listener failed for ${key}`, error);
            }
        });
    }
}

export default EventBus;
