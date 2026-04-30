type BackendAnimationKeyframe = {
    key: string;
    kind: 'sound' | 'particles';
    cardId: string | null;
};

type BackendAnimationPayload = {
    target: string | null;
    keyframes: BackendAnimationKeyframe[];
};

type AnimationScene = any;

const normalizeBackendAnimationKind = (raw: unknown): 'sound' | 'particles' | null => {
    if (typeof raw !== 'string') {
        return null;
    }

    const normalized = raw.trim().toLowerCase();
    if (normalized === 'sound') {
        return 'sound';
    }
    if (normalized === 'particles') {
        return 'particles';
    }

    return null;
};

const parseBackendAnimationPayload = (payload: Record<string, unknown> | null): BackendAnimationPayload | null => {
    if (!payload) {
        return null;
    }

    if (typeof payload.animation !== 'object' || payload.animation === null) {
        return null;
    }

    const animationCandidate = payload.animation as Record<string, unknown>;
    const rawKeyframes = animationCandidate.keyframes;
    if (!Array.isArray(rawKeyframes) || rawKeyframes.length === 0) {
        return null;
    }

    const keyframes: BackendAnimationKeyframe[] = [];
    for (const rawKeyframe of rawKeyframes) {
        let key: unknown;
        let kindRaw: unknown;
        let cardIdRaw: unknown;

        if (Array.isArray(rawKeyframe)) {
            key = rawKeyframe[0];
            kindRaw = rawKeyframe[1];
            cardIdRaw = rawKeyframe[2];
        }
        else if (typeof rawKeyframe === 'object' && rawKeyframe !== null) {
            const keyframeObject = rawKeyframe as Record<string, unknown>;
            key = keyframeObject.key;
            kindRaw = keyframeObject.kind ?? keyframeObject.type;
            cardIdRaw = keyframeObject.card_id ?? keyframeObject.cardId;
        }
        else {
            continue;
        }

        if (typeof key !== 'string' || key.trim().length === 0) {
            continue;
        }

        const kind = normalizeBackendAnimationKind(kindRaw);
        if (!kind) {
            continue;
        }

        const cardId = typeof cardIdRaw === 'string' && cardIdRaw.trim().length > 0
            ? cardIdRaw.trim()
            : null;

        keyframes.push({
            key: key.trim(),
            kind,
            cardId,
        });
    }

    if (keyframes.length === 0) {
        return null;
    }

    const rawTarget = animationCandidate.target;
    return {
        target: typeof rawTarget === 'string' && rawTarget.trim().length > 0
            ? rawTarget.trim().toLowerCase()
            : null,
        keyframes,
    };
};

const isBackendAnimationTargetActiveView = (target: string | null, activeViewMode: string): boolean => {
    if (target === null) {
        return true;
    }

    const normalizedTarget = target.trim().toLowerCase();
    if (normalizedTarget === 'both' || normalizedTarget === 'all') {
        return true;
    }

    if (normalizedTarget === 'player-1' || normalizedTarget === 'p1' || normalizedTarget === 'player1') {
        return activeViewMode === 'p1';
    }

    if (normalizedTarget === 'player-2' || normalizedTarget === 'p2' || normalizedTarget === 'player2') {
        return activeViewMode === 'p2';
    }

    return true;
};

const resolveCardByIdCaseInsensitive = (cardById: Record<string, unknown>, rawCardId: string): unknown | null => {
    const direct = cardById[rawCardId] ?? cardById[rawCardId.toUpperCase()] ?? cardById[rawCardId.toLowerCase()];
    if (direct) {
        return direct;
    }

    const target = rawCardId.trim().toLowerCase();
    if (!target) {
        return null;
    }

    const matchedId = Object.keys(cardById).find((key) => key.toLowerCase() === target);
    return matchedId ? cardById[matchedId] : null;
};

const findCardReferencedByCommand = (cardById: Record<string, unknown>, command: string): unknown | null => {
    const tokens = command
        .trim()
        .split(/\s+/)
        .filter((token) => token.length > 0);
    if (tokens.length < 2) {
        return null;
    }

    const candidateCount = Math.min(tokens.length, 5);
    for (let i = 1; i < candidateCount; i += 1) {
        const card = resolveCardByIdCaseInsensitive(cardById, tokens[i]);
        if (card) {
            return card;
        }
    }

    return null;
};

export const executeBackendAnimationPayload = (
    scene: AnimationScene,
    command: string,
    payload: Record<string, unknown> | null
): void => {
    const animation = parseBackendAnimationPayload(payload);
    if (!animation) {
        return;
    }

    if (!isBackendAnimationTargetActiveView(animation.target, scene.activeViewMode)) {
        return;
    }

    const commandCard = findCardReferencedByCommand(scene.cardById, command);
    for (const keyframe of animation.keyframes) {
        if (keyframe.kind === 'sound') {
            const played = scene.playCommandSoundAsSceneAnimation(keyframe.key);
            if (!played) {
                console.warn('[Protocol] animation sound key missing', { key: keyframe.key, command });
            }
            continue;
        }

        if (keyframe.kind === 'particles') {
            const particleCard = (keyframe.cardId
                ? resolveCardByIdCaseInsensitive(scene.cardById, keyframe.cardId)
                : null) ?? commandCard;
            if (!particleCard) {
                console.warn('[Protocol] animation particles target card missing', {
                    key: keyframe.key,
                    cardId: keyframe.cardId,
                    command,
                });
                continue;
            }

            const textureKey = scene.resolveBoomTextureKey(keyframe.key);
            if (!textureKey) {
                console.warn('[Protocol] animation particles key missing', { key: keyframe.key, command });
                continue;
            }

            scene.playBoomExplosion(particleCard, textureKey);
        }
    }
};
