import { DECK_BUILDER_CATEGORY_FILL_COLORS } from '../config';
import { CARD_CATALOG, CardCatalogCategory, CardCatalogEntry } from '../data/cardCatalog';

type DeckBuilderRulesScene = any;

export const getCurrentDeckGroupedCards = (
    scene: DeckBuilderRulesScene,
    cardById: Map<string, CardCatalogEntry>
): Array<{ category: CardCatalogCategory; cards: CardCatalogEntry[] }> => {
    const categoryOrder: CardCatalogCategory[] = ['character', 'item', 'supporter', 'stadium', 'tool', 'status_effect'];
    const cardsByCategory = new Map<CardCatalogCategory, CardCatalogEntry[]>();

    for (const category of categoryOrder) {
        cardsByCategory.set(category, []);
    }

    for (const [cardId, count] of scene.state.countsByCardId.entries()) {
        if (count <= 0) {
            continue;
        }

        const card = cardById.get(cardId);
        if (!card) {
            continue;
        }

        const bucket = cardsByCategory.get(card.category);
        if (!bucket) {
            continue;
        }

        for (let i = 0; i < count; i += 1) {
            bucket.push(card);
        }
    }

    const grouped: Array<{ category: CardCatalogCategory; cards: CardCatalogEntry[] }> = [];
    for (const category of categoryOrder) {
        const cards = cardsByCategory.get(category) ?? [];
        if (cards.length === 0) {
            continue;
        }

        cards.sort((a, b) => a.label.localeCompare(b.label));
        grouped.push({ category, cards });
    }

    return grouped;
};

export const getCategoryColor = (category: CardCatalogCategory): number => {
    return DECK_BUILDER_CATEGORY_FILL_COLORS[category] ?? DECK_BUILDER_CATEGORY_FILL_COLORS.item;
};

export const getActiveCategoryCards = (
    scene: DeckBuilderRulesScene,
    cardCatalog: CardCatalogEntry[] = CARD_CATALOG
): CardCatalogEntry[] => {
    const categoryCards = cardCatalog
        .filter((card) => card.category === scene.state.activeCategory)
        .sort((a, b) => a.label.localeCompare(b.label));
    if (scene.state.activeCategory !== 'character') {
        return categoryCards;
    }

    if (scene.state.activeCharacterCardType === 'all') {
        return categoryCards;
    }

    return categoryCards
        .filter((card) => card.cardType === scene.state.activeCharacterCardType)
        .sort((a, b) => a.label.localeCompare(b.label));
};

export const getCategoryLabel = (category: CardCatalogCategory): string => {
    switch (category) {
    case 'character':
        return 'CHARACTERS';
    case 'item':
        return 'ITEMS';
    case 'supporter':
        return 'SUPPORTERS';
    case 'stadium':
        return 'STADIUMS';
    case 'tool':
        return 'TOOLS';
    case 'status_effect':
        return 'STATUS EFFECTS';
    default:
        return 'CARDS';
    }
};

export const collectCards = (scene: DeckBuilderRulesScene): string[] => {
    const cards: string[] = [];
    for (const [cardId, count] of scene.state.countsByCardId.entries()) {
        for (let i = 0; i < count; i += 1) {
            cards.push(cardId);
        }
    }
    return cards;
};

export const getMaxCopiesForCard = (
    card: CardCatalogEntry,
    maxItemOrToolCopies: number,
    maxOtherCopies: number
): number => {
    return card.category === 'item' || card.category === 'tool'
        ? maxItemOrToolCopies
        : maxOtherCopies;
};

export const canAddCardToDeck = (
    scene: DeckBuilderRulesScene,
    card: CardCatalogEntry | null,
    deckRequiredCardCount: number,
    maxItemOrToolCopies: number,
    maxOtherCopies: number
): boolean => {
    if (!card) {
        return false;
    }

    const count = scene.state.countsByCardId.get(card.id) ?? 0;
    const maxCopies = getMaxCopiesForCard(card, maxItemOrToolCopies, maxOtherCopies);
    const totalCards = collectCards(scene).length;
    return count < maxCopies && totalCards < deckRequiredCardCount;
};

export const validateDeckCards = (
    cards: string[],
    cardById: Map<string, CardCatalogEntry>,
    deckRequiredCardCount: number,
    maxItemOrToolCopies: number,
    maxOtherCopies: number
): string | null => {
    if (cards.length > deckRequiredCardCount) {
        return `Deck cannot exceed ${deckRequiredCardCount} cards.`;
    }

    const countByCardId = new Map<string, number>();
    for (const cardId of cards) {
        const card = cardById.get(cardId);
        if (!card) {
            return `Unknown card in deck: ${cardId}`;
        }

        const nextCount = (countByCardId.get(cardId) ?? 0) + 1;
        const maxCopies = getMaxCopiesForCard(card, maxItemOrToolCopies, maxOtherCopies);
        if (nextCount > maxCopies) {
            return maxCopies === maxItemOrToolCopies
                ? `${card.label.toUpperCase()} exceeds max copies (${maxItemOrToolCopies}) for item/tool cards.`
                : `${card.label.toUpperCase()} exceeds max copies (${maxOtherCopies}).`;
        }

        countByCardId.set(cardId, nextCount);
    }

    return null;
};