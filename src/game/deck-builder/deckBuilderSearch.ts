import { CardCatalogEntry } from '../data/cardCatalog';

type DeckBuilderSearchScene = any;

export const setSearchMenuVisible = (scene: DeckBuilderSearchScene, visible: boolean): void => {
    for (const object of scene.searchMenuObjects) {
        object.setVisible(visible);
        const maybeInput = object as Phaser.GameObjects.GameObject & { input?: { enabled: boolean } };
        if (maybeInput.input) {
            maybeInput.input.enabled = visible;
        }
    }

    scene.searchMenuVisible = visible;
    scene.searchButton.setFillStyle(visible ? 0x1e293b : 0x0f172a, 0.95);
};

export const toggleSearchMenu = (
    scene: DeckBuilderSearchScene,
    visible: boolean,
    searchResultsPerPage: number,
    cardCatalog: CardCatalogEntry[]
): void => {
    if (visible === scene.searchMenuVisible) {
        return;
    }

    if (visible) {
        scene.searchPageIndex = 0;
        renderSearchMenu(scene, searchResultsPerPage, cardCatalog);
    }

    setSearchMenuVisible(scene, visible);
};

export const handleSearchKeydown = (
    scene: DeckBuilderSearchScene,
    event: KeyboardEvent,
    searchResultsPerPage: number,
    cardCatalog: CardCatalogEntry[]
): void => {
    if (!scene.searchMenuVisible) {
        return;
    }

    if (event.key === 'Escape') {
        toggleSearchMenu(scene, false, searchResultsPerPage, cardCatalog);
        return;
    }

    if (event.key === 'Enter') {
        const results = getSearchFilteredCards(scene, cardCatalog);
        const firstVisible = results[scene.searchPageIndex * searchResultsPerPage] ?? null;
        if (firstVisible) {
            scene.tryAddCardToDeck(firstVisible);
        }
        return;
    }

    if (event.key === 'Backspace') {
        event.preventDefault();
        if (scene.searchQuery.length === 0) {
            return;
        }
        scene.searchQuery = scene.searchQuery.slice(0, -1);
        scene.searchPageIndex = 0;
        renderSearchMenu(scene, searchResultsPerPage, cardCatalog);
        return;
    }

    if (event.key === 'Delete') {
        scene.searchQuery = '';
        scene.searchPageIndex = 0;
        renderSearchMenu(scene, searchResultsPerPage, cardCatalog);
        return;
    }

    if (event.ctrlKey || event.metaKey || event.altKey || event.key.length !== 1) {
        return;
    }

    if (scene.searchQuery.length >= 48) {
        return;
    }

    scene.searchQuery += event.key;
    scene.searchPageIndex = 0;
    renderSearchMenu(scene, searchResultsPerPage, cardCatalog);
};

export const getSearchFilteredCards = (
    scene: DeckBuilderSearchScene,
    cardCatalog: CardCatalogEntry[]
): CardCatalogEntry[] => {
    const sorted = [...cardCatalog].sort((a, b) => a.label.localeCompare(b.label));
    const query = scene.searchQuery.trim().toLowerCase();
    if (query.length === 0) {
        return sorted;
    }

    return sorted.filter((card) => {
        const haystack = `${card.label} ${card.id} ${card.category} ${card.cardType ?? ''}`.toLowerCase();
        return haystack.includes(query);
    });
};

export const renderSearchMenu = (
    scene: DeckBuilderSearchScene,
    searchResultsPerPage: number,
    cardCatalog: CardCatalogEntry[]
): void => {
    if (scene.searchRows.length === 0) {
        return;
    }

    const filteredCards = getSearchFilteredCards(scene, cardCatalog);
    const maxPage = Math.max(1, Math.ceil(filteredCards.length / searchResultsPerPage));
    if (scene.searchPageIndex > (maxPage - 1)) {
        scene.searchPageIndex = maxPage - 1;
    }

    const startIndex = scene.searchPageIndex * searchResultsPerPage;
    for (let i = 0; i < scene.searchRows.length; i += 1) {
        const row = scene.searchRows[i];
        const card = filteredCards[startIndex + i] ?? null;
        row.card = card;

        if (!card) {
            row.container.setVisible(false);
            continue;
        }

        row.container.setVisible(true);
        row.cardName.setText(card.label.toUpperCase());
        const categoryLabel = scene.getCategoryLabel(card.category);
        const metaLabel = card.cardType ? card.cardType.toUpperCase() : categoryLabel;
        row.cardMeta.setText(metaLabel);

        const count = scene.state.countsByCardId.get(card.id) ?? 0;
        row.countLabel.setText(String(count));

        const canAdd = scene.canAddCardToDeck(card);
        row.plusButton.setFillStyle(0x0f766e, canAdd ? 0.95 : 0.45);
        row.plusLabel.setTint(0xffffff);
        row.plusLabel.setAlpha(canAdd ? 1 : 0.45);
    }

    scene.searchQueryLabel.setText(`QUERY: ${scene.searchQuery || '(ALL CARDS)'}`);

    const hasPrevPage = scene.searchPageIndex > 0;
    const hasNextPage = scene.searchPageIndex < (maxPage - 1);
    scene.searchPrevButton.setAlpha(hasPrevPage ? 1 : 0.45);
    scene.searchPrevLabel.setAlpha(hasPrevPage ? 1 : 0.45);
    scene.searchNextButton.setAlpha(hasNextPage ? 1 : 0.45);
    scene.searchNextLabel.setAlpha(hasNextPage ? 1 : 0.45);
};