import {
    DECK_BUILDER_TRANSFER_ICON_LAYOUT,
    UI_SCALE,
} from '../config';

type DeckBuilderSlotUiScene = any;

export const refreshDeckSlotButtons = (scene: DeckBuilderSlotUiScene): void => {
    for (const button of scene.deckSlotButtons) {
        const deck = scene.slotDecks[button.index] ?? null;
        const draft = deck ? scene.draftByDeckId.get(deck.deckId) : undefined;
        const draftCards = draft?.cards ?? deck?.cards ?? [];
        const name = (draft?.deckName ?? deck?.name ?? scene.defaultDeckName(button.index)).toUpperCase();
        const dirtyMarker = draft?.dirty ? '*' : '';
        button.label.setText(`${name}${dirtyMarker} (${draftCards.length})`);

        const active = deck !== null && deck.deckId === scene.state.deckId;
        button.body.setFillStyle(active ? 0x1d4ed8 : 0x0b1220, active ? 0.95 : 0.88);
        button.label.setTint(active ? 0xfef08a : 0xe2e8f0);
    }

    scene.positionDeckTransferButtons();
};

export const positionDeckTransferButtons = (scene: DeckBuilderSlotUiScene): void => {
    if (!scene.renameButton || !scene.resetButton || !scene.exportButton || !scene.importButton || scene.deckSlotButtons.length === 0) {
        return;
    }

    const activeSlot = scene.deckSlotButtons.find((button: { index: number; body: Phaser.GameObjects.Rectangle }) => {
        const slotDeck = scene.slotDecks[button.index] ?? null;
        return slotDeck !== null && slotDeck.deckId === scene.state.deckId;
    }) ?? scene.deckSlotButtons[0];

    const buttonSize = Math.round(DECK_BUILDER_TRANSFER_ICON_LAYOUT.buttonSizeBase * UI_SCALE);
    const buttonGapX = Math.round(DECK_BUILDER_TRANSFER_ICON_LAYOUT.buttonGapXBase * UI_SCALE);
    const buttonOffsetX = Math.round(DECK_BUILDER_TRANSFER_ICON_LAYOUT.buttonOffsetXBase * UI_SCALE);
    const hoverLabelOffsetY = Math.round(DECK_BUILDER_TRANSFER_ICON_LAYOUT.hoverLabelOffsetYBase * UI_SCALE);
    const hoverLabelSize = Math.max(
        DECK_BUILDER_TRANSFER_ICON_LAYOUT.hoverLabelFontSizeMin,
        Math.round(DECK_BUILDER_TRANSFER_ICON_LAYOUT.hoverLabelFontSizeBase * UI_SCALE)
    );

    const slotLeftX = activeSlot.body.x - Math.round(activeSlot.body.width * 0.5);
    const renameX = slotLeftX - buttonOffsetX - Math.round(buttonSize * 0.5);
    const importX = renameX - buttonSize - buttonGapX;
    const exportX = importX - buttonSize - buttonGapX;
    const resetX = exportX - buttonSize - buttonGapX;
    const buttonsY = activeSlot.body.y;

    scene.renameButton.setPosition(renameX, buttonsY);
    scene.renameIcon.setPosition(renameX, buttonsY);
    scene.renameLabel
        .setPosition(renameX, buttonsY - hoverLabelOffsetY)
        .setFontSize(hoverLabelSize);

    scene.resetButton.setPosition(resetX, buttonsY);
    scene.resetIcon.setPosition(resetX, buttonsY);
    scene.resetLabel
        .setPosition(resetX, buttonsY)
        .setFontSize(Math.max(
            DECK_BUILDER_TRANSFER_ICON_LAYOUT.resetCountdownFontSizeMin,
            Math.round(DECK_BUILDER_TRANSFER_ICON_LAYOUT.resetCountdownFontSizeBase * UI_SCALE)
        ));
    scene.resetHoverLabel
        .setPosition(resetX, buttonsY - hoverLabelOffsetY)
        .setFontSize(hoverLabelSize);

    scene.exportButton.setPosition(exportX, buttonsY);
    scene.exportIcon.setPosition(exportX, buttonsY);
    scene.exportLabel
        .setPosition(exportX, buttonsY - hoverLabelOffsetY)
        .setFontSize(hoverLabelSize);

    scene.importButton.setPosition(importX, buttonsY);
    scene.importIcon.setPosition(importX, buttonsY);
    scene.importLabel
        .setPosition(importX, buttonsY - hoverLabelOffsetY)
        .setFontSize(hoverLabelSize);
};

export const updateSummaryText = (scene: DeckBuilderSlotUiScene): void => {
    const total = scene.collectCards().length;
    scene.subtitle.setText(`${scene.state.deckName.toUpperCase()} - ${total} CARDS`);
};
