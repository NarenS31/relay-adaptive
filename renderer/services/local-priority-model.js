const QUESTION_RE = /\?|\b(what|why|how|when|where|who|can you|could you|would you|are you)\b/i;
const ACTION_RE = /\b(click|press|open|join|submit|answer|reply|send|start|stop|mute|unmute|turn on|turn off|review|check)\b/i;
const URGENCY_RE = /\b(now|urgent|asap|immediately|hurry|quick|emergency|alert|warning|right away)\b/i;
const ERROR_RE = /\b(error|failed|unable|warning|confirm|denied|expired|required)\b/i;

function normalizeText(text) {
    return String(text || '')
        .toLowerCase()
        .replace(/[^a-z0-9\s]/g, ' ')
        .replace(/\s+/g, ' ')
        .trim();
}

function tokenize(text) {
    return normalizeText(text).split(' ').filter(Boolean);
}

function softmax(logits) {
    const max = Math.max(...logits);
    const exps = logits.map((value) => Math.exp(value - max));
    const total = exps.reduce((sum, value) => sum + value, 0) || 1;
    return exps.map((value) => value / total);
}

function containsName(text, names = []) {
    const lowered = String(text || '').toLowerCase();
    return names.some((name) => {
        const token = String(name || '').trim().toLowerCase();
        return token && lowered.includes(token);
    });
}

export class LocalPriorityModel {
    constructor(model) {
        this.model = model || null;
    }

    static async load() {
        try {
            const modelUrl = new URL('../../assets/models/accessibility-priority-model.json', import.meta.url);
            const response = await fetch(modelUrl);
            if (!response.ok) return new LocalPriorityModel(null);
            const model = await response.json();
            return new LocalPriorityModel(model);
        } catch (error) {
            console.warn('[LocalPriorityModel] Failed to load model:', error?.message || error);
            return new LocalPriorityModel(null);
        }
    }

    isReady() {
        return Boolean(this.model && Array.isArray(this.model.labels) && Array.isArray(this.model.weights));
    }

    predict(example, { userNames = [] } = {}) {
        if (!this.isReady()) return null;

        const features = this.#extractFeatures(example, userNames);
        const logits = this.model.weights.map((classWeights) => {
            let total = 0;
            for (const [featureName, featureValue] of Object.entries(features)) {
                total += Number(classWeights?.[featureName] || 0) * featureValue;
            }
            return total;
        });

        const probabilities = softmax(logits);
        const bestIndex = probabilities.reduce((best, value, index, array) => value > array[best] ? index : best, 0);
        const label = this.model.labels[bestIndex];
        const scoreByLabel = this.model.score_by_label || {};

        return {
            label,
            confidence: probabilities[bestIndex],
            score: Number(scoreByLabel[label] || 5.5),
        };
    }

    #extractFeatures(example, userNames) {
        const text = String(example?.text || '');
        const tokens = tokenize(text);
        const features = {
            bias: 1,
            [`type=${String(example?.event_type || 'generic')}`]: 1,
            [`mode=${String(example?.mode || 'deaf')}`]: 1,
        };

        const appName = normalizeText(example?.app_name || '');
        if (appName) features[`app=${appName}`] = 1;

        const soundCategory = String(example?.sound_category || '').trim().toLowerCase();
        if (soundCategory) features[`sound=${soundCategory}`] = 1;

        const flags = {
            contains_question: QUESTION_RE.test(text),
            contains_action: ACTION_RE.test(text),
            contains_urgency: URGENCY_RE.test(text),
            contains_error: ERROR_RE.test(text),
            contains_name: containsName(text, userNames),
        };

        Object.entries(flags).forEach(([key, enabled]) => {
            if (enabled) features[`flag=${key}`] = 1;
        });

        const lengthBucket = tokens.length < 6 ? 'short' : tokens.length < 14 ? 'medium' : 'long';
        features[`length=${lengthBucket}`] = 1;

        tokens.slice(0, 20).forEach((token) => {
            const key = `tok=${token}`;
            features[key] = (features[key] || 0) + 1;
        });

        for (let index = 0; index < tokens.length - 1; index += 1) {
            const key = `bi=${tokens[index]}_${tokens[index + 1]}`;
            features[key] = (features[key] || 0) + 1;
        }

        return features;
    }
}

export default LocalPriorityModel;
