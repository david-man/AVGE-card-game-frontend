import {
    decodeDeckShareHex,
    encodeDeckShareHex,
} from '../data/deckShareCodec';

type DeckBuilderTransferScene = any;

export const runPromptActionAfterClickSfx = (
    scene: DeckBuilderTransferScene,
    action: () => void
): void => {
    // Let the pointerdown click SFX start before browser prompt/confirm blocks.
    scene.time.delayedCall(70, action);
};

export const renameCurrentDeck = (scene: DeckBuilderTransferScene): void => {
    if (!scene.state.deckId || scene.busy) {
        return;
    }

    if (typeof window === 'undefined' || typeof window.prompt !== 'function') {
        return;
    }

    const input = window.prompt('Rename this deck', scene.state.deckName);
    if (typeof input !== 'string') {
        return;
    }

    const nextName = input.trim().slice(0, 64);
    if (!nextName) {
        scene.subtitle.setText('Deck name cannot be empty.');
        return;
    }

    scene.state.deckName = nextName;
    scene.persistCurrentDeckDraft();
    scene.refreshDeckSlotButtons();
    scene.updateSummaryText();
};

export const exportCurrentDeckShare = (scene: DeckBuilderTransferScene): void => {
    if (!scene.state.deckId || scene.busy) {
        return;
    }

    if (typeof window === 'undefined' || typeof window.prompt !== 'function') {
        return;
    }

    const cards = scene.collectCards();
    const encoded = encodeDeckShareHex(cards);
    if (!encoded.ok) {
        scene.subtitle.setText(encoded.message);
        return;
    }

    window.prompt('Deck share code (hex). Copy and save this value:', encoded.shareHex);
    scene.subtitle.setText(`Exported ${encoded.cardCount} cards to deck share hex.`);
};

export const importDeckShare = (scene: DeckBuilderTransferScene): void => {
    if (!scene.state.deckId || scene.busy) {
        return;
    }

    if (
        typeof window === 'undefined'
        || typeof window.prompt !== 'function'
        || typeof window.confirm !== 'function'
    ) {
        return;
    }

    const rawInput = window.prompt('Paste deck share hex code to import into current selected deck:');
    if (typeof rawInput !== 'string') {
        return;
    }

    const decoded = decodeDeckShareHex(rawInput);
    if (!decoded.ok) {
        scene.subtitle.setText(`Import failed: ${decoded.message}`);
        return;
    }

    const validationError = scene.validateDeckCards(decoded.cardIds);
    if (validationError) {
        scene.subtitle.setText(`Import failed: ${validationError}`);
        return;
    }

    const shouldOverwrite = window.confirm(`Overwrite current draft with ${decoded.cardCount} imported cards?`);
    if (!shouldOverwrite) {
        scene.subtitle.setText('Deck import canceled.');
        return;
    }

    scene.state.countsByCardId.clear();
    for (const cardId of decoded.cardIds) {
        const current = scene.state.countsByCardId.get(cardId) ?? 0;
        scene.state.countsByCardId.set(cardId, current + 1);
    }

    scene.persistCurrentDeckDraft();
    scene.refreshDeckSlotButtons();
    scene.renderRows();
    scene.updateSummaryText();
    scene.subtitle.setText(`Imported ${decoded.cardCount} cards into ${scene.state.deckName.toUpperCase()}. Save to persist.`);
};
