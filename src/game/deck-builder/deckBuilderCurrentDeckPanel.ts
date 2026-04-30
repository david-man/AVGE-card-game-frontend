import { GameObjects } from 'phaser';

import {
    DECK_BUILDER_CURRENT_DECK_PANEL_LAYOUT,
    DECK_BUILDER_CURRENT_DECK_PREVIEW_TEXT_LAYOUT,
    GAME_HEIGHT,
    GAME_WIDTH,
    UI_SCALE,
} from '../config';
import { CardCatalogCategory, CardCatalogEntry } from '../data/cardCatalog';
import { fitTextToMultiLine } from '../ui/overlays/textFit';

type DeckBuilderCurrentDeckScene = any;

export const buildCurrentDeckPanel = (
    scene: DeckBuilderCurrentDeckScene
): { panel: GameObjects.Rectangle; hint: GameObjects.Text } => {
    const panelWidth = Math.round(DECK_BUILDER_CURRENT_DECK_PANEL_LAYOUT.panelWidthBase * UI_SCALE);
    const panelHeight = Math.round(DECK_BUILDER_CURRENT_DECK_PANEL_LAYOUT.panelHeightBase * UI_SCALE);
    const panelX = Math.round(GAME_WIDTH - (panelWidth * 0.5) - Math.round(DECK_BUILDER_CURRENT_DECK_PANEL_LAYOUT.rightInsetBase * UI_SCALE));
    const panelY = Math.round(GAME_HEIGHT * 0.5);

    const panel = scene.add.rectangle(panelX, panelY, panelWidth, panelHeight, 0x0f172a, 0.92)
        .setStrokeStyle(2, 0xffffff, 0.8)
        .setDepth(10);

    scene.add.text(panelX, panelY - Math.round(panelHeight * 0.5) + Math.round(DECK_BUILDER_CURRENT_DECK_PANEL_LAYOUT.titleOffsetYBase * UI_SCALE), 'CURRENT DECK').setFontSize(Math.max(
        DECK_BUILDER_CURRENT_DECK_PREVIEW_TEXT_LAYOUT.titleFontSizeMin,
        Math.round(DECK_BUILDER_CURRENT_DECK_PREVIEW_TEXT_LAYOUT.titleFontSizeBase * UI_SCALE)
    ))
        .setOrigin(0.5)
        .setTint(0xffffff)
        .setDepth(11);

    const hint = scene.add.text(panelX, panelY - Math.round(panelHeight * 0.5) + Math.round(DECK_BUILDER_CURRENT_DECK_PANEL_LAYOUT.hintOffsetYBase * UI_SCALE), '').setFontSize(Math.max(
        DECK_BUILDER_CURRENT_DECK_PREVIEW_TEXT_LAYOUT.hintFontSizeMin,
        Math.round(DECK_BUILDER_CURRENT_DECK_PREVIEW_TEXT_LAYOUT.hintFontSizeBase * UI_SCALE)
    ))
        .setOrigin(0.5)
        .setTint(0xcbd5e1)
        .setDepth(11);

    return { panel, hint };
};

export const renderCurrentDeckPanelContents = (
    scene: DeckBuilderCurrentDeckScene,
    panel: GameObjects.Rectangle,
    hint: GameObjects.Text,
    grouped: Array<{ category: CardCatalogCategory; cards: CardCatalogEntry[] }>,
    deckRequiredCardCount: number,
    getCategoryLabel: (category: CardCatalogCategory) => string,
    getCategoryColor: (category: CardCatalogCategory) => number
): Phaser.GameObjects.GameObject[] => {
    const createdObjects: Phaser.GameObjects.GameObject[] = [];
    const totalCards = grouped.reduce((sum, group) => sum + group.cards.length, 0);
    hint.setText(totalCards > 0 ? `Click a card to preview (${totalCards}/${deckRequiredCardCount})` : '(EMPTY DECK)');

    const panelLeft = panel.x - Math.round(panel.width * 0.5) + Math.round(DECK_BUILDER_CURRENT_DECK_PANEL_LAYOUT.innerPaddingXBase * UI_SCALE);
    const panelRight = panel.x + Math.round(panel.width * 0.5) - Math.round(DECK_BUILDER_CURRENT_DECK_PANEL_LAYOUT.innerPaddingXBase * UI_SCALE);
    const panelBottom = panel.y + Math.round(panel.height * 0.5) - Math.round(DECK_BUILDER_CURRENT_DECK_PANEL_LAYOUT.bottomPaddingBase * UI_SCALE);

    const tileWidth = Math.round(DECK_BUILDER_CURRENT_DECK_PANEL_LAYOUT.tileWidthBase * UI_SCALE);
    const tileHeight = Math.round(DECK_BUILDER_CURRENT_DECK_PANEL_LAYOUT.tileHeightBase * UI_SCALE);
    const tileGapX = Math.round(DECK_BUILDER_CURRENT_DECK_PANEL_LAYOUT.tileGapXBase * UI_SCALE);
    const tileGapY = Math.round(DECK_BUILDER_CURRENT_DECK_PANEL_LAYOUT.tileGapYBase * UI_SCALE);
    const sectionGap = Math.round(DECK_BUILDER_CURRENT_DECK_PANEL_LAYOUT.sectionGapBase * UI_SCALE);
    const headerFontSize = Math.max(
        DECK_BUILDER_CURRENT_DECK_PREVIEW_TEXT_LAYOUT.sectionHeaderFontSizeMin,
        Math.round(DECK_BUILDER_CURRENT_DECK_PREVIEW_TEXT_LAYOUT.sectionHeaderFontSizeBase * UI_SCALE)
    );
    const iconFontSize = Math.max(
        DECK_BUILDER_CURRENT_DECK_PREVIEW_TEXT_LAYOUT.tileIconFontSizeMin,
        Math.round(DECK_BUILDER_CURRENT_DECK_PREVIEW_TEXT_LAYOUT.tileIconFontSizeBase * UI_SCALE)
    );
    const nameFontSize = Math.max(
        DECK_BUILDER_CURRENT_DECK_PREVIEW_TEXT_LAYOUT.tileNameFontSizeMin,
        Math.round(DECK_BUILDER_CURRENT_DECK_PREVIEW_TEXT_LAYOUT.tileNameFontSizeBase * UI_SCALE)
    );
    const removeFontSize = Math.max(
        DECK_BUILDER_CURRENT_DECK_PREVIEW_TEXT_LAYOUT.tileCountFontSizeMin,
        Math.round(DECK_BUILDER_CURRENT_DECK_PREVIEW_TEXT_LAYOUT.tileCountFontSizeBase * UI_SCALE)
    );

    let cursorY = hint.y + Math.round(DECK_BUILDER_CURRENT_DECK_PANEL_LAYOUT.listTopOffsetBase * UI_SCALE);

    if (grouped.length === 0) {
        const empty = scene.add.text(panel.x, cursorY + Math.round(DECK_BUILDER_CURRENT_DECK_PANEL_LAYOUT.emptyOffsetYBase * UI_SCALE), 'ADD CARDS USING +').setFontSize(Math.max(
            DECK_BUILDER_CURRENT_DECK_PREVIEW_TEXT_LAYOUT.emptyStateFontSizeMin,
            Math.round(DECK_BUILDER_CURRENT_DECK_PREVIEW_TEXT_LAYOUT.emptyStateFontSizeBase * UI_SCALE)
        ))
            .setOrigin(0.5)
            .setTint(0x94a3b8)
            .setDepth(11);

        createdObjects.push(empty);
        return createdObjects;
    }

    for (const group of grouped) {
        if (cursorY >= panelBottom) {
            break;
        }

        const sectionTitle = scene.add.text(panelLeft, cursorY, getCategoryLabel(group.category)).setFontSize(headerFontSize)
            .setOrigin(0, 0.5)
            .setTint(0xf8fafc)
            .setDepth(11);
        createdObjects.push(sectionTitle);

        cursorY += Math.round(DECK_BUILDER_CURRENT_DECK_PANEL_LAYOUT.sectionHeaderAdvanceYBase * UI_SCALE);

        const innerWidth = panelRight - panelLeft;
        const columns = Math.max(1, Math.floor((innerWidth + tileGapX) / (tileWidth + tileGapX)));
        const sectionRows = Math.ceil(group.cards.length / columns);

        for (let i = 0; i < group.cards.length; i += 1) {
            const row = Math.floor(i / columns);
            const col = i % columns;
            const card = group.cards[i];

            const x = panelLeft + Math.round(tileWidth * 0.5) + (col * (tileWidth + tileGapX));
            const y = cursorY + Math.round(tileHeight * 0.5) + (row * (tileHeight + tileGapY));
            if (y + Math.round(tileHeight * 0.5) > panelBottom) {
                continue;
            }

            const body = scene.add.rectangle(
                x,
                y,
                tileWidth,
                tileHeight,
                getCategoryColor(card.category),
                0.95
            )
                .setStrokeStyle(2, 0xffffff, 0.82)
                .setDepth(11)
                .setInteractive({ useHandCursor: true });

            const icon = scene.add.text(x, y - Math.round(tileHeight * DECK_BUILDER_CURRENT_DECK_PANEL_LAYOUT.iconOffsetYRatio), card.iconFallback).setFontSize(iconFontSize)
                .setOrigin(0.5)
                .setTint(0xffffff)
                .setDepth(12)
                .setInteractive({ useHandCursor: true });

            const name = scene.add.text(x - Math.round(tileWidth * DECK_BUILDER_CURRENT_DECK_PANEL_LAYOUT.nameOffsetXRatio), y + Math.round(tileHeight * DECK_BUILDER_CURRENT_DECK_PANEL_LAYOUT.nameOffsetYRatio), '').setFontSize(nameFontSize)
                .setOrigin(0, 0.5)
                .setTint(0xf8fafc)
                .setDepth(12)
                .setInteractive({ useHandCursor: true });

            const tileNameMaxWidth = Math.round(tileWidth * DECK_BUILDER_CURRENT_DECK_PANEL_LAYOUT.tileNameMaxWidthRatio);
            const tileNameFit = fitTextToMultiLine({
                scene,
                text: card.label.toUpperCase(),
                preferredSize: nameFontSize,
                minSize: Math.max(
                    DECK_BUILDER_CURRENT_DECK_PREVIEW_TEXT_LAYOUT.tileNameFitMinSizeFloor,
                    Math.round(nameFontSize * DECK_BUILDER_CURRENT_DECK_PREVIEW_TEXT_LAYOUT.tileNameFitMinSizeRatio)
                ),
                maxWidth: Math.max(10, tileNameMaxWidth),
                maxLines: 3
            });
            name.setText(tileNameFit.text);
            name.setFontSize(tileNameFit.fontSize);

            const removeButton = scene.add.rectangle(
                x + Math.round(tileWidth * DECK_BUILDER_CURRENT_DECK_PANEL_LAYOUT.countBadgeOffsetXRatio),
                y + Math.round(tileHeight * DECK_BUILDER_CURRENT_DECK_PANEL_LAYOUT.countBadgeOffsetYRatio),
                Math.round(DECK_BUILDER_CURRENT_DECK_PANEL_LAYOUT.removeButtonWidthBase * UI_SCALE),
                Math.round(DECK_BUILDER_CURRENT_DECK_PANEL_LAYOUT.countBadgeHeightBase * UI_SCALE),
                0x020617,
                0.95
            )
                .setStrokeStyle(1, 0xffffff, 0.85)
                .setDepth(12)
                .setInteractive({ useHandCursor: true });

            const removeText = scene.add.text(
                removeButton.x,
                removeButton.y,
                DECK_BUILDER_CURRENT_DECK_PANEL_LAYOUT.removeButtonGlyph
            ).setFontSize(Math.round(removeFontSize * DECK_BUILDER_CURRENT_DECK_PANEL_LAYOUT.removeButtonGlyphFontSizeMultiplier))
                .setFontFamily(DECK_BUILDER_CURRENT_DECK_PANEL_LAYOUT.removeButtonGlyphFontFamily)
                .setFontStyle('bold')
                .setOrigin(0.5)
                .setTint(0xffffff)
                .setDepth(13)
                .setInteractive({ useHandCursor: true });

            const openPreview = (pointer?: Phaser.Input.Pointer) => {
                scene.showDeckCardPreview(card, pointer);
            };

            const applyTileBaseStyle = (): void => {
                body.setFillStyle(getCategoryColor(card.category), 0.95);
                icon.setTint(0xffffff);
                name.setTint(0xf8fafc);
            };

            const applyTileHoverStyle = (): void => {
                body.setFillStyle(0x1e293b, 0.98);
                icon.setTint(0xfef08a);
                name.setTint(0xfef08a);
            };

            body.on('pointerdown', (pointer: Phaser.Input.Pointer) => {
                openPreview(pointer);
            });
            icon.on('pointerdown', (pointer: Phaser.Input.Pointer) => {
                openPreview(pointer);
            });
            name.on('pointerdown', (pointer: Phaser.Input.Pointer) => {
                openPreview(pointer);
            });

            body.on('pointerover', applyTileHoverStyle);
            body.on('pointerout', applyTileBaseStyle);
            icon.on('pointerover', applyTileHoverStyle);
            icon.on('pointerout', applyTileBaseStyle);
            name.on('pointerover', applyTileHoverStyle);
            name.on('pointerout', applyTileBaseStyle);

            removeButton.on('pointerdown', () => {
                scene.tryRemoveCardFromDeck(card);
            });

            removeText.on('pointerdown', () => {
                scene.tryRemoveCardFromDeck(card);
            });

            scene.bindHoverHighlight(
                removeButton,
                removeText,
                () => ({ fillColor: 0x020617, fillAlpha: 0.95, labelTint: 0xffffff }),
                () => ({ fillColor: 0x334155, fillAlpha: 0.98, labelTint: 0xfef08a })
            );
            removeText.on('pointerover', () => {
                removeButton.emit('pointerover');
            });
            removeText.on('pointerout', () => {
                removeButton.emit('pointerout');
            });

            applyTileBaseStyle();

            createdObjects.push(body, icon, name, removeButton, removeText);
        }

        cursorY += (sectionRows * (tileHeight + tileGapY)) + sectionGap;
    }

    return createdObjects;
};