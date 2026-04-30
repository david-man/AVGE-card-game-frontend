import { CardCatalogEntry } from '../data/cardCatalog';

type DeckBuilderRowsScene = any;

export const renderRows = (
    scene: DeckBuilderRowsScene,
    cardsPerPage: number
): void => {
    const activeCards = scene.getActiveCategoryCards();
    const maxPage = Math.max(1, Math.ceil(activeCards.length / cardsPerPage));
    if (scene.state.pageIndex > (maxPage - 1)) {
        scene.state.pageIndex = maxPage - 1;
    }

    const offset = scene.state.pageIndex * cardsPerPage;
    for (let i = 0; i < scene.rows.length; i += 1) {
        const card = activeCards[offset + i] ?? null;
        const row = scene.rows[i];
        row.card = card;

        if (!card) {
            row.container.setVisible(false);
            continue;
        }

        row.container.setVisible(true);
        row.cardName.setText(card.label.toUpperCase());

        // Icon abstraction: if/when card.iconKey assets are loaded, swap this text fallback for sprite rendering.
        row.iconLabel.setText(card.iconFallback);

        const count = scene.state.countsByCardId.get(card.id) ?? 0;
        row.countLabel.setText(String(count));

        const canAdd = scene.canAddCardToDeck(card);
        row.plusButton.setFillStyle(0x0f766e, canAdd ? 0.95 : 0.45);
        row.plusLabel.setTint(0xffffff);
        row.plusLabel.setAlpha(canAdd ? 1 : 0.45);
    }

    for (const button of scene.categoryButtons) {
        const active = button.category === scene.state.activeCategory;
        button.body.setFillStyle(active ? 0x0f766e : 0x0f172a, active ? 0.95 : 0.9);
        button.label.setTint(active ? 0xfef08a : 0xffffff);
    }

    const showCharacterTypes = scene.state.activeCategory === 'character';
    for (const button of scene.characterTypeButtons) {
        button.body.setVisible(showCharacterTypes);
        button.label.setVisible(showCharacterTypes);
        if (!showCharacterTypes) {
            continue;
        }

        const active = button.cardType === scene.state.activeCharacterCardType;
        button.body.setFillStyle(active ? 0x1d4ed8 : 0x0b1220, active ? 0.95 : 0.88);
        button.label.setTint(active ? 0xfef08a : 0xffffff);
    }

    scene.pageIndicator.setText(`Page ${scene.state.pageIndex + 1}/${maxPage}`);

    scene.renderCurrentDeckPanel();

    if (scene.searchMenuVisible) {
        scene.renderSearchMenu();
    }
};

export const tryAddCardToDeck = (
    scene: DeckBuilderRowsScene,
    card: CardCatalogEntry,
    deckRequiredCardCount: number,
    maxItemOrToolCopies: number,
    maxOtherCopies: number
): boolean => {
    if (scene.busy) {
        return false;
    }

    const totalCards = scene.collectCards().length;
    if (totalCards >= deckRequiredCardCount) {
        scene.subtitle.setText(`Deck must contain exactly ${deckRequiredCardCount} cards.`);
        return false;
    }

    const current = scene.state.countsByCardId.get(card.id) ?? 0;
    const maxCopies = scene.getMaxCopiesForCard(card);
    if (current >= maxCopies) {
        scene.subtitle.setText(
            maxCopies === maxItemOrToolCopies
                ? `${card.label.toUpperCase()} max copies: ${maxItemOrToolCopies}.`
                : `${card.label.toUpperCase()} max copies: ${maxOtherCopies}.`
        );
        return false;
    }

    scene.state.countsByCardId.set(card.id, current + 1);
    scene.persistCurrentDeckDraft();
    scene.refreshDeckSlotButtons();
    scene.renderRows();
    scene.updateSummaryText();
    return true;
};

export const tryRemoveCardFromDeck = (
    scene: DeckBuilderRowsScene,
    card: CardCatalogEntry
): boolean => {
    if (scene.busy) {
        return false;
    }

    const current = scene.state.countsByCardId.get(card.id) ?? 0;
    if (current <= 0) {
        return false;
    }

    if (current === 1) {
        scene.state.countsByCardId.delete(card.id);
    }
    else {
        scene.state.countsByCardId.set(card.id, current - 1);
    }

    scene.persistCurrentDeckDraft();
    scene.refreshDeckSlotButtons();
    scene.renderRows();
    scene.updateSummaryText();
    return true;
};
