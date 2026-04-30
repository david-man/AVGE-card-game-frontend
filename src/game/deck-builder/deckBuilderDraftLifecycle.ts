import {
    createUserDeck,
    selectUserDeck,
    UserDeck,
} from '../Network';

type DeckBuilderDraftScene = any;

export const applyDeck = (scene: DeckBuilderDraftScene, deck: UserDeck): void => {
    scene.state.deckId = deck.deckId;
    scene.state.deckName = deck.name;
    scene.state.countsByCardId.clear();
    for (const cardId of deck.cards) {
        const current = scene.state.countsByCardId.get(cardId) ?? 0;
        scene.state.countsByCardId.set(cardId, current + 1);
    }
};

export const applyDeckFromDraftOrDeck = (scene: DeckBuilderDraftScene, deck: UserDeck): void => {
    const draft = scene.draftByDeckId.get(deck.deckId);
    scene.state.deckId = deck.deckId;
    scene.state.deckName = draft?.deckName ?? deck.name;
    scene.state.countsByCardId.clear();

    const cards = draft?.cards ?? deck.cards;
    for (const cardId of cards) {
        const current = scene.state.countsByCardId.get(cardId) ?? 0;
        scene.state.countsByCardId.set(cardId, current + 1);
    }
};

export const areCardListsEqual = (a: string[] | undefined, b: string[]): boolean => {
    if (!a) {
        return false;
    }
    if (a.length !== b.length) {
        return false;
    }
    for (let i = 0; i < a.length; i += 1) {
        if (a[i] !== b[i]) {
            return false;
        }
    }
    return true;
};

export const persistCurrentDeckDraft = (scene: DeckBuilderDraftScene): void => {
    if (!scene.state.deckId) {
        return;
    }

    const cards = scene.collectCards();
    const existing = scene.draftByDeckId.get(scene.state.deckId);
    const dirty = existing?.dirty === true || existing?.deckName !== scene.state.deckName || !areCardListsEqual(existing.cards, cards);

    scene.draftByDeckId.set(scene.state.deckId, {
        deckId: scene.state.deckId,
        deckName: scene.state.deckName,
        cards,
        dirty,
    });
};

export const replaceSlotDeck = (scene: DeckBuilderDraftScene, deck: UserDeck): void => {
    for (let i = 0; i < scene.slotDecks.length; i += 1) {
        const slotDeck = scene.slotDecks[i];
        if (slotDeck?.deckId === deck.deckId || slotDeck?.name.toUpperCase() === deck.name.toUpperCase()) {
            scene.slotDecks[i] = deck;
            return;
        }
    }
};

export const selectDeckSlot = async (
    scene: DeckBuilderDraftScene,
    index: number
): Promise<void> => {
    if (scene.busy) {
        return;
    }

    let deck = scene.slotDecks[index] ?? null;
    if (!deck) {
        const sessionId = scene.getStoredSessionId();
        if (!sessionId) {
            scene.scene.start('Login');
            return;
        }

        scene.busy = true;
        scene.subtitle.setText(`Creating ${scene.defaultDeckName(index)}...`);
        const created = await createUserDeck(scene.defaultDeckName(index), [], sessionId);
        scene.busy = false;
        if (!created.ok || !created.deck) {
            scene.subtitle.setText(created.error ?? 'Failed to create deck slot.');
            scene.renderRows();
            return;
        }

        deck = created.deck;
        scene.slotDecks[index] = deck;
        scene.draftByDeckId.set(deck.deckId, {
            deckId: deck.deckId,
            deckName: deck.name,
            cards: [...deck.cards],
            dirty: false,
        });
        scene.writeDeckSlotIds(sessionId, scene.slotDecks.map((slotDeck: UserDeck | null) => slotDeck?.deckId ?? null));
    }

    const switchingDeck = scene.state.deckId !== deck.deckId;
    if (switchingDeck) {
        scene.persistCurrentDeckDraft();
        scene.applyDeckFromDraftOrDeck(deck);
        scene.state.pageIndex = 0;
    }

    const sessionId = scene.getStoredSessionId();
    if (!sessionId) {
        scene.scene.start('Login');
        return;
    }

    scene.busy = true;
    const selectResult = await selectUserDeck(deck.deckId, sessionId);
    scene.busy = false;
    if (!selectResult.ok) {
        scene.subtitle.setText(selectResult.error ?? 'Failed to set active deck.');
        scene.renderRows();
        return;
    }

    scene.activeDeckId = deck.deckId;

    scene.refreshDeckSlotButtons();
    scene.renderRows();
    scene.updateSummaryText();
};
