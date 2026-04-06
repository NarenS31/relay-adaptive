const DEFAULT_PROFILE = {
    profileName: 'Focused',
    detailLevel: 'balanced',
    prioritizeQuestions: true,
    prioritizeActionItems: true,
    prioritizeNameMentions: true,
    prioritizeUrgentSounds: true,
    prioritizeScreenChanges: true,
    suppressAmbientAudio: true,
    preferredDelivery: 'adaptive',
    weights: {
        question: 2,
        action: 2,
        directAddress: 2,
        urgency: 3,
        screenChange: 2,
        ambientPenalty: -2
    }
};

export function normalizeAccessibilityProfile(profile = {}) {
    const weights = profile?.weights || {};
    return {
        ...DEFAULT_PROFILE,
        ...profile,
        weights: {
            ...DEFAULT_PROFILE.weights,
            ...weights
        }
    };
}

export function profileToSettingsPatch(profile = {}) {
    return {
        accessibilityPriorityProfile: normalizeAccessibilityProfile(profile)
    };
}

export default normalizeAccessibilityProfile;
