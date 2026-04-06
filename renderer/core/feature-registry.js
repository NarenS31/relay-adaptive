export class FeatureRegistry {
    constructor({ eventBus = null, store = null } = {}) {
        this.eventBus = eventBus;
        this.store = store;
        this.features = new Map();
        this.groupState = new Map();
    }

    register(name, definition = {}) {
        const key = String(name || '').trim();
        if (!key) return;

        this.features.set(key, {
            groups: Array.isArray(definition.groups) ? [...definition.groups] : [],
            start: typeof definition.start === 'function' ? definition.start : () => {},
            stop: typeof definition.stop === 'function' ? definition.stop : () => {},
            isActive: false
        });
    }

    setGroupActive(groupName, nextActive, context = {}) {
        const group = String(groupName || '').trim();
        if (!group) return;

        const enabled = Boolean(nextActive);
        if (this.groupState.get(group) === enabled) return;
        this.groupState.set(group, enabled);

        for (const [featureName, feature] of this.features.entries()) {
            if (!feature.groups.includes(group)) continue;

            if (enabled && !feature.isActive) {
                feature.start(context);
                feature.isActive = true;
                this.eventBus?.emit('feature.started', { feature: featureName, group, context });
            }

            if (!enabled && feature.isActive) {
                feature.stop(context);
                feature.isActive = false;
                this.eventBus?.emit('feature.stopped', { feature: featureName, group, context });
            }
        }

        this.store?.setState({
            features: {
                [group]: enabled
            }
        });
    }
}

export default FeatureRegistry;
