import {
    clearClientSessionState,
    createUserDeck,
    ROUTER_SESSION_ID_STORAGE_KEY,
    subscribeToRouterSessionEvents,
    UserDeck,
} from '../Network';

type DeckBuilderSessionScene = any;

export const startAuthSessionPush = (
    scene: DeckBuilderSessionScene,
    sessionId: string
): void => {
    stopAuthSessionPush(scene);
    scene.authSessionUnsubscribe = subscribeToRouterSessionEvents(sessionId, ({ reason, message }) => {
        if (reason !== 'session_superseded') {
            return;
        }

        stopAuthSessionPush(scene);
        clearClientSessionState();
        scene.scene.start('Login', {
            systemMessage: typeof message === 'string' && message.trim().length > 0
                ? message
                : 'Signed out: account opened on another client.'
        });
    });
};

export const stopAuthSessionPush = (scene: DeckBuilderSessionScene): void => {
    if (!scene.authSessionUnsubscribe) {
        return;
    }

    scene.authSessionUnsubscribe();
    scene.authSessionUnsubscribe = null;
};

export const readDeckSlotIds = (
    sessionId: string,
    deckSlotIdsStorageKey: string
): Array<string | null> => {
    if (typeof window === 'undefined') {
        return [];
    }

    const key = `${deckSlotIdsStorageKey}:${sessionId}`;
    const raw = window.localStorage.getItem(key);
    if (!raw) {
        return [];
    }

    try {
        const parsed = JSON.parse(raw) as unknown;
        if (!Array.isArray(parsed)) {
            return [];
        }
        return parsed.map((item) => (typeof item === 'string' && item.trim().length > 0 ? item.trim() : null));
    }
    catch {
        return [];
    }
};

export const writeDeckSlotIds = (
    sessionId: string,
    deckIds: Array<string | null>,
    deckSlotIdsStorageKey: string,
    fixedDeckSlotCount: number
): void => {
    if (typeof window === 'undefined') {
        return;
    }

    const key = `${deckSlotIdsStorageKey}:${sessionId}`;
    window.localStorage.setItem(key, JSON.stringify(deckIds.slice(0, fixedDeckSlotCount)));
};

export const defaultDeckName = (index: number): string => {
    return `DECK-${index + 1}`;
};

export const getStoredSessionId = (): string | null => {
    if (typeof window === 'undefined') {
        return null;
    }

    const raw = window.sessionStorage.getItem(ROUTER_SESSION_ID_STORAGE_KEY);
    if (typeof raw !== 'string' || raw.trim().length === 0) {
        return null;
    }

    return raw.trim();
};

export const ensureFixedDeckSlots = async (
    sessionId: string,
    decks: UserDeck[],
    fixedDeckSlotCount: number,
    deckSlotIdsStorageKey: string
): Promise<Array<UserDeck | null>> => {
    const byId = new Map<string, UserDeck>();
    for (const deck of decks) {
        byId.set(deck.deckId, deck);
    }

    const slotIds = readDeckSlotIds(sessionId, deckSlotIdsStorageKey);
    const usedDeckIds = new Set<string>();
    const slots: Array<UserDeck | null> = new Array<UserDeck | null>(fixedDeckSlotCount).fill(null);

    for (let i = 0; i < fixedDeckSlotCount; i += 1) {
        const slotId = slotIds[i];
        if (!slotId) {
            continue;
        }
        const existing = byId.get(slotId);
        if (!existing) {
            continue;
        }

        slots[i] = existing;
        usedDeckIds.add(existing.deckId);
    }

    const unassigned = decks.filter((deck) => !usedDeckIds.has(deck.deckId));
    for (let i = 0; i < fixedDeckSlotCount; i += 1) {
        if (slots[i] !== null) {
            continue;
        }
        const fallbackDeck = unassigned.shift() ?? null;
        if (!fallbackDeck) {
            continue;
        }
        slots[i] = fallbackDeck;
        usedDeckIds.add(fallbackDeck.deckId);
    }

    for (let i = 0; i < fixedDeckSlotCount; i += 1) {
        if (slots[i] !== null) {
            continue;
        }

        const created = await createUserDeck(defaultDeckName(i), [], sessionId);
        if (created.ok && created.deck) {
            slots[i] = created.deck;
            byId.set(created.deck.deckId, created.deck);
        }
    }

    writeDeckSlotIds(
        sessionId,
        slots.map((deck) => deck?.deckId ?? null),
        deckSlotIdsStorageKey,
        fixedDeckSlotCount
    );
    return slots;
};
