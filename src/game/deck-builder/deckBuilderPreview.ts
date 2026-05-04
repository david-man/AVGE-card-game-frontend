import { CardCatalogCategory, CardCatalogEntry } from '../data/cardCatalog';
import { Card, CardType } from '../entities';
import { CardPreviewController } from '../ui/CardPreviewController';
import { createCardPreviewPanel as createSharedCardPreviewPanel } from '../ui/cardPreviewPanelFactory';

type DeckBuilderPreviewScene = any;

export const buildDeckPreviewPanel = (
    scene: DeckBuilderPreviewScene,
    previewController?: CardPreviewController
): {
    previewObjectWidth: number;
    previewObjectHeight: number;
    previewController: CardPreviewController;
} => {
    return createSharedCardPreviewPanel(scene, {
        variant: 'deck-builder',
        previewController,
    });
};

export const mapCatalogCategoryToCardType = (category: CardCatalogCategory): CardType => {
    switch (category) {
    case 'character':
        return 'character';
    case 'item':
        return 'item';
    case 'supporter':
        return 'supporter';
    case 'stadium':
        return 'stadium';
    case 'tool':
        return 'tool';
    case 'status_effect':
        return 'item';
    default:
        return 'item';
    }
};

export const mapCatalogCardTypeToAVGECardType = (
    card: CardCatalogEntry
): 'NONE' | 'WW' | 'PERC' | 'PIANO' | 'STRING' | 'GUITAR' | 'CHOIR' | 'BRASS' => {
    if (card.category !== 'character') {
        return 'NONE';
    }

    switch (card.cardType) {
    case 'woodwinds':
        return 'WW';
    case 'percussion':
        return 'PERC';
    case 'pianos':
        return 'PIANO';
    case 'strings':
        return 'STRING';
    case 'guitars':
        return 'GUITAR';
    case 'choir':
        return 'CHOIR';
    case 'brass':
        return 'BRASS';
    default:
        return 'NONE';
    }
};

export const createPreviewProxyCard = (
    scene: DeckBuilderPreviewScene,
    card: CardCatalogEntry,
    previewObjectWidth: number,
    previewObjectHeight: number,
    categoryColor: number,
    toCardType: (category: CardCatalogCategory) => CardType,
    toAVGECardType: (entry: CardCatalogEntry) => 'NONE' | 'WW' | 'PERC' | 'PIANO' | 'STRING' | 'GUITAR' | 'CHOIR' | 'BRASS'
): Card => {
    const previewCardType = toCardType(card.category);
    const previewAVGECardType = card.category === 'character'
        ? toAVGECardType(card)
        : (card.cardType ?? 'NONE');

    const proxy = new Card(scene, {
        id: `deck_builder_preview_${card.id}_${Date.now()}`,
        cardType: previewCardType,
        AVGECardType: previewAVGECardType,
        AVGECardClass: card.id,
        statusEffect: {},
        ownerId: 'p1',
        x: -10000,
        y: -10000,
        width: previewObjectWidth,
        height: previewObjectHeight,
        color: categoryColor,
        zoneId: 'deck-preview',
        has_atk_1: false,
        has_atk_2: false,
        has_active: false,
        has_passive: false,
        retreat_cost: 0,
        atk_1_name: null,
        atk_2_name: null,
        active_name: null,
        atk_1_cost: 0,
        atk_2_cost: 0,
    });

    proxy.setVisibility(false);
    proxy.body.disableInteractive();
    return proxy;
};

export const showDeckCardPreview = (
    scene: DeckBuilderPreviewScene,
    card: CardCatalogEntry,
    currentProxy: Card | null,
    createProxyCard: (entry: CardCatalogEntry) => Card,
    previewController: CardPreviewController,
    pointer: Phaser.Input.Pointer | undefined,
    setSuppressOutsideClose: (value: boolean) => void
): Card => {
    if (currentProxy) {
        currentProxy.destroy();
    }

    const nextProxy = createProxyCard(card);
    previewController.show(nextProxy, {
        ownerUsername: 'Deck Builder',
        forceFaceUp: true,
        hideOwnerLine: true
    });

    if (pointer) {
        setSuppressOutsideClose(true);
        scene.time.delayedCall(0, () => {
            setSuppressOutsideClose(false);
        });
    }

    return nextProxy;
};

export const hideDeckCardPreview = (
    previewController: CardPreviewController,
    currentProxy: Card | null
): Card | null => {
    previewController.hide();
    if (currentProxy) {
        currentProxy.destroy();
    }
    return null;
};

export const isPointerInsideDeckPreview = (
    previewController: CardPreviewController,
    pointer: Phaser.Input.Pointer
): boolean => {
    return previewController.containsPoint(pointer.worldX, pointer.worldY);
};

export const handleGlobalPointerDown = (
    previewController: CardPreviewController,
    suppressOutsideClose: boolean,
    pointerInsidePreview: boolean,
    hidePreview: () => void
): void => {
    if (!previewController.isVisible() || suppressOutsideClose) {
        return;
    }

    if (pointerInsidePreview) {
        return;
    }

    hidePreview();
};