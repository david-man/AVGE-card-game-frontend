import {
    selectUserDeck,
    updateUserDeck,
} from '../Network';

type DeckBuilderSaveScene = any;

export const saveDeck = async (scene: DeckBuilderSaveScene): Promise<void> => {
    if (scene.busy) {
        return;
    }

    const sessionId = scene.getStoredSessionId();
    if (!sessionId) {
        scene.scene.start('Login');
        return;
    }

    scene.busy = true;
    scene.subtitle.setText('Saving all deck changes...');

    scene.persistCurrentDeckDraft();
    const dirtyDrafts = [...scene.draftByDeckId.values()].filter((draft: { dirty: boolean }) => draft.dirty);

    for (const draft of dirtyDrafts) {
        const validationError = scene.validateDeckCards(draft.cards);
        if (validationError) {
            scene.busy = false;
            scene.subtitle.setText(`${draft.deckName.toUpperCase()}: ${validationError}`);
            return;
        }
    }

    for (const draft of dirtyDrafts) {
        const updateResult = await updateUserDeck(draft.deckId, draft.deckName, draft.cards, sessionId);
        if (!updateResult.ok || !updateResult.deck) {
            scene.busy = false;
            scene.subtitle.setText(updateResult.error ?? `Failed to update ${draft.deckName}.`);
            return;
        }

        scene.replaceSlotDeck(updateResult.deck);
        scene.draftByDeckId.set(updateResult.deck.deckId, {
            deckId: updateResult.deck.deckId,
            deckName: updateResult.deck.name,
            cards: [...updateResult.deck.cards],
            dirty: false,
        });
    }

    const activeDeckId = scene.activeDeckId ?? scene.state.deckId;
    const selectResult = activeDeckId ? await selectUserDeck(activeDeckId, sessionId) : { ok: true };
    scene.busy = false;
    if (!selectResult.ok) {
        scene.subtitle.setText(selectResult.error ?? 'Failed to select deck.');
        return;
    }

    scene.activeDeckId = activeDeckId;

    scene.refreshDeckSlotButtons();
    scene.subtitle.setText('All deck changes saved.');
    scene.renderRows();
    scene.updateSummaryText();
};
