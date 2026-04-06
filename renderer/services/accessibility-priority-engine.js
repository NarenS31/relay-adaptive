import { normalizeAccessibilityProfile } from './accessibility-profile.js';
import { LocalPriorityModel } from './local-priority-model.js';

function clampScore(value) {
    const n = Number(value);
    if (!Number.isFinite(n)) return 1;
    return Math.max(1, Math.min(10, Math.round(n * 10) / 10));
}

function containsQuestion(text) {
    return /\?/.test(text) || /\b(what|why|how|when|where|who|can you|could you|would you|are you)\b/i.test(text);
}

function containsActionLanguage(text) {
    return /\b(click|press|open|join|submit|answer|reply|send|start|stop|mute|unmute|turn on|turn off)\b/i.test(text);
}

function containsUrgency(text) {
    return /\b(now|urgent|asap|immediately|hurry|quick|emergency|alert|warning)\b/i.test(text);
}

function containsDirectAddress(text, names = []) {
    const haystack = String(text || '').toLowerCase();
    return (names || []).some((name) => haystack.includes(String(name || '').toLowerCase()));
}

function deliveryForPriority(priority, preferredDelivery, mode) {
    if (priority === 'critical') return ['priority-card', mode === 'blind' ? 'tts' : 'caption-pin'];
    if (priority === 'high') return preferredDelivery === 'speech' ? ['tts', 'priority-card'] : ['priority-card'];
    if (priority === 'medium') return ['priority-card'];
    return ['history'];
}

export class AccessibilityPriorityEngine {
    constructor({ electronAPI = null } = {}) {
        this.electronAPI = electronAPI;
        this.localModelPromise = LocalPriorityModel.load();
    }

    async scoreEvent(eventPayload, options = {}) {
        const profile = normalizeAccessibilityProfile(options.profile || {});
        const mode = options.mode === 'blind' ? 'blind' : 'deaf';
        const settings = options.settings || {};
        const userNames = Array.isArray(settings.userNames) ? settings.userNames : [];
        const base = this.#ruleScore(eventPayload, { profile, mode, userNames });
        const localModel = await this.localModelPromise;

        let combined = { ...base };
        const learned = localModel.predict({
            event_type: eventPayload?.type,
            text: eventPayload?.text || eventPayload?.label || eventPayload?.message || '',
            mode,
            app_name: eventPayload?.appName || eventPayload?.app_name || '',
            sound_category: eventPayload?.category || eventPayload?.sound_category || ''
        }, { userNames });

        if (learned) {
            const blendedScore = clampScore((base.score * 0.55) + (learned.score * 0.45));
            combined = {
                ...base,
                score: blendedScore,
                priority: blendedScore >= 9 ? 'critical' : blendedScore >= 7 ? 'high' : blendedScore >= 5 ? 'medium' : 'low',
                reason: `${base.reason}; local ranker predicted ${learned.label} importance (${Math.round(learned.confidence * 100)}% confidence)`,
                learned: {
                    label: learned.label,
                    confidence: learned.confidence
                }
            };
        }

        if (settings.priorityEngineUseLlm === true && this.electronAPI?.rankAccessibilityEvent) {
            try {
                const refined = await this.electronAPI.rankAccessibilityEvent({
                    event: eventPayload,
                    base: combined,
                    profile,
                    mode
                });
                if (refined?.success) {
                    return {
                        ...combined,
                        score: clampScore(refined.score ?? combined.score),
                        priority: refined.priority || combined.priority,
                        reason: refined.reason || combined.reason,
                        delivery: Array.isArray(refined.delivery) && refined.delivery.length > 0
                            ? refined.delivery
                            : combined.delivery
                    };
                }
            } catch (error) {
                console.warn('[PriorityEngine] LLM refinement failed:', error?.message || error);
            }
        }

        return combined;
    }

    #ruleScore(eventPayload, { profile, mode, userNames }) {
        const type = String(eventPayload?.type || 'generic');
        const text = String(eventPayload?.text || eventPayload?.label || eventPayload?.message || '').trim();
        let score = 3;
        const reasons = [];

        if (type === 'transcript') {
            if (profile.prioritizeQuestions && containsQuestion(text)) {
                score += profile.weights.question;
                reasons.push('contains a direct question');
            }
            if (profile.prioritizeActionItems && containsActionLanguage(text)) {
                score += profile.weights.action;
                reasons.push('contains an actionable instruction');
            }
            if (profile.prioritizeNameMentions && containsDirectAddress(text, userNames)) {
                score += profile.weights.directAddress;
                reasons.push('mentions the user directly');
            }
            if (containsUrgency(text)) {
                score += profile.weights.urgency;
                reasons.push('uses urgent language');
            }
        } else if (type === 'sound') {
            const category = String(eventPayload?.category || '');
            if (category === 'emergency') {
                score = 10;
                reasons.push('emergency audio event');
            } else if (profile.prioritizeUrgentSounds && ['attention', 'communication', 'appliance'].includes(category)) {
                score += 4;
                reasons.push(`${category} sound may require user action`);
            } else if (profile.suppressAmbientAudio && category === 'media') {
                score += profile.weights.ambientPenalty;
                reasons.push('ambient/media sound is deprioritized');
            }
        } else if (type === 'screen') {
            if (profile.prioritizeScreenChanges) {
                score += profile.weights.screenChange;
                reasons.push('important screen change');
            }
            if (containsUrgency(text) || /\b(error|failed|warning|confirm|enabled|disabled)\b/i.test(text)) {
                score += profile.weights.urgency;
                reasons.push('screen state appears urgent or blocking');
            }
        } else if (type === 'meeting') {
            score += 3;
            reasons.push('meeting context often affects accessibility-critical awareness');
        }

        const priority = score >= 9 ? 'critical' : score >= 7 ? 'high' : score >= 5 ? 'medium' : 'low';
        return {
            id: eventPayload?.id || `${Date.now()}-${Math.random().toString(16).slice(2)}`,
            type,
            score: clampScore(score),
            priority,
            title: eventPayload?.title || this.#titleForEvent(eventPayload, type),
            summary: text || eventPayload?.summary || 'Important accessibility event detected',
            reason: reasons.join(', ') || 'general accessibility relevance',
            delivery: deliveryForPriority(priority, profile.preferredDelivery, mode),
            timestamp: Date.now()
        };
    }

    #titleForEvent(eventPayload, type) {
        if (type === 'transcript') return 'Priority speech moment';
        if (type === 'sound') return `Priority sound: ${eventPayload?.label || 'Detected event'}`;
        if (type === 'screen') return 'Priority screen change';
        if (type === 'meeting') return 'Meeting priority update';
        return 'Priority event';
    }
}

export default AccessibilityPriorityEngine;
