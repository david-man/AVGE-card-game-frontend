import {
    DECK_BUILDER_SEARCH_MENU_LAYOUT,
    DECK_BUILDER_TEXT_LAYOUT,
    GAME_CENTER_X,
    GAME_HEIGHT,
    GAME_WIDTH,
    UI_SCALE,
} from '../config';
import {
    CardCatalogCategory,
    CardCatalogEntry,
    CharacterCardType,
} from '../data/cardCatalog';

type DeckBuilderUiBuildScene = any;

export const buildDeckSlotButtons = (
    scene: DeckBuilderUiBuildScene,
    fixedDeckSlotCount: number
): void => {
    const panelX = Math.round(GAME_CENTER_X - 380 * UI_SCALE);
    const startY = Math.round(GAME_HEIGHT * 0.33);
    const spacing = Math.round(64 * UI_SCALE);
    const width = Math.round(180 * UI_SCALE);
    const height = Math.round(50 * UI_SCALE);
    const titleSize = Math.max(DECK_BUILDER_TEXT_LAYOUT.slotTitleFontSizeMin, Math.round(DECK_BUILDER_TEXT_LAYOUT.slotTitleFontSizeBase * UI_SCALE));
    const labelSize = Math.max(DECK_BUILDER_TEXT_LAYOUT.slotLabelFontSizeMin, Math.round(DECK_BUILDER_TEXT_LAYOUT.slotLabelFontSizeBase * UI_SCALE));

    scene.add.text(panelX, Math.round(startY - 58 * UI_SCALE), 'SAVED DECKS').setFontSize(titleSize)
        .setOrigin(0.5)
        .setTint(0xffffff);

    for (let i = 0; i < fixedDeckSlotCount; i += 1) {
        const y = startY + (i * spacing);
        const body = scene.add.rectangle(panelX, y, width, height, 0x0b1220, 0.88)
            .setStrokeStyle(2, 0xffffff, 0.55)
            .setInteractive({ useHandCursor: true });

        const label = scene.add.text(panelX, y, scene.defaultDeckName(i)).setFontSize(labelSize)
            .setOrigin(0.5)
            .setTint(0xe2e8f0);

        body.on('pointerdown', () => {
            void scene.selectDeckSlot(i);
        });

        scene.bindHoverHighlight(
            body,
            label,
            () => {
                const slotDeck = scene.slotDecks[i] ?? null;
                const active = slotDeck !== null && slotDeck.deckId === scene.state.deckId;
                return {
                    fillColor: active ? 0x1d4ed8 : 0x0b1220,
                    fillAlpha: active ? 0.95 : 0.88,
                    labelTint: active ? 0xfef08a : 0xe2e8f0,
                };
            },
            () => {
                const slotDeck = scene.slotDecks[i] ?? null;
                const active = slotDeck !== null && slotDeck.deckId === scene.state.deckId;
                return {
                    fillColor: active ? 0x2563eb : 0x1e293b,
                    fillAlpha: 0.98,
                    labelTint: 0xfef08a,
                };
            }
        );

        scene.deckSlotButtons.push({ index: i, body, label });
    }
};

export const buildCategoryButtons = (
    scene: DeckBuilderUiBuildScene
): void => {
    const categories: Array<{ category: CardCatalogCategory; label: string }> = [
        { category: 'character', label: 'CHAR' },
        { category: 'item', label: 'ITEM' },
        { category: 'supporter', label: 'SUP' },
        { category: 'stadium', label: 'STA' },
        { category: 'tool', label: 'TOOL' },
    ];

    const startX = Math.round(GAME_CENTER_X - (categories.length - 1) * 68 * UI_SCALE * 0.5);
    const y = Math.round(GAME_HEIGHT * 0.22);
    const width = Math.round(64 * UI_SCALE);
    const height = Math.round(34 * UI_SCALE);
    const spacing = Math.round(68 * UI_SCALE);
    const fontSize = Math.max(DECK_BUILDER_TEXT_LAYOUT.categoryFontSizeMin, Math.round(DECK_BUILDER_TEXT_LAYOUT.categoryFontSizeBase * UI_SCALE));

    for (let i = 0; i < categories.length; i += 1) {
        const def = categories[i];
        const x = startX + (i * spacing);

        const body = scene.add.rectangle(x, y, width, height, 0x0f172a, 0.9)
            .setStrokeStyle(2, 0xffffff, 0.65)
            .setInteractive({ useHandCursor: true });

        const label = scene.add.text(x, y, def.label).setFontSize(fontSize)
            .setOrigin(0.5)
            .setTint(0xffffff);

        body.on('pointerdown', () => {
            if (scene.state.activeCategory === def.category) {
                return;
            }

            scene.state.activeCategory = def.category;
            scene.state.pageIndex = 0;
            scene.renderRows();
            scene.updateSummaryText();
        });

        scene.bindHoverHighlight(
            body,
            label,
            () => {
                const active = scene.state.activeCategory === def.category;
                return {
                    fillColor: active ? 0x0f766e : 0x0f172a,
                    fillAlpha: active ? 0.95 : 0.9,
                    labelTint: active ? 0xfef08a : 0xffffff,
                };
            },
            () => ({
                fillColor: 0x1e293b,
                fillAlpha: 0.98,
                labelTint: 0xfef08a,
            })
        );

        scene.categoryButtons.push({
            category: def.category,
            body,
            label,
        });
    }
};

export const buildCharacterTypeButtons = (
    scene: DeckBuilderUiBuildScene
): void => {
    const types: Array<{ cardType: CharacterCardType | 'all'; label: string }> = [
        { cardType: 'all', label: 'ALL' },
        { cardType: 'brass', label: 'BRASS' },
        { cardType: 'choir', label: 'CHOIR' },
        { cardType: 'guitars', label: 'GUITAR' },
        { cardType: 'percussion', label: 'PERC' },
        { cardType: 'pianos', label: 'PIANO' },
        { cardType: 'strings', label: 'STR' },
        { cardType: 'woodwinds', label: 'WOOD' },
    ];

    const startX = Math.round(GAME_CENTER_X - (types.length - 1) * 53 * UI_SCALE * 0.5);
    const y = Math.round(GAME_HEIGHT * 0.27);
    const width = Math.round(50 * UI_SCALE);
    const height = Math.round(30 * UI_SCALE);
    const spacing = Math.round(53 * UI_SCALE);
    const fontSize = Math.max(DECK_BUILDER_TEXT_LAYOUT.characterTypeFontSizeMin, Math.round(DECK_BUILDER_TEXT_LAYOUT.characterTypeFontSizeBase * UI_SCALE));

    for (let i = 0; i < types.length; i += 1) {
        const def = types[i];
        const buttonCardType = def.cardType;
        const x = startX + (i * spacing);

        const body = scene.add.rectangle(x, y, width, height, 0x0b1220, 0.88)
            .setStrokeStyle(2, 0xffffff, 0.5)
            .setInteractive({ useHandCursor: true });

        const label = scene.add.text(x, y, def.label).setFontSize(fontSize)
            .setOrigin(0.5)
            .setTint(0xffffff);

        body.on('pointerdown', () => {
            if (scene.state.activeCharacterCardType === def.cardType) {
                return;
            }

            scene.state.activeCharacterCardType = def.cardType;
            scene.state.pageIndex = 0;
            scene.renderRows();
            scene.updateSummaryText();
        });

        scene.bindHoverHighlight(
            body,
            label,
            () => {
                const active = buttonCardType === scene.state.activeCharacterCardType;
                return {
                    fillColor: active ? 0x1d4ed8 : 0x0b1220,
                    fillAlpha: active ? 0.95 : 0.88,
                    labelTint: active ? 0xfef08a : 0xffffff,
                };
            },
            () => ({
                fillColor: 0x1e293b,
                fillAlpha: 0.98,
                labelTint: 0xfef08a,
            }),
            () => scene.state.activeCategory === 'character'
        );

        scene.characterTypeButtons.push({
            cardType: def.cardType,
            body,
            label,
        });
    }
};

export const buildRows = (
    scene: DeckBuilderUiBuildScene,
    cardsPerPage: number
): void => {
    const rowStartY = Math.round(GAME_HEIGHT * 0.33);
    const rowBottom = Math.round(GAME_HEIGHT * 0.77);
    const rowGap = Math.max(52, Math.floor((rowBottom - rowStartY) / Math.max(1, cardsPerPage - 1)));

    for (let i = 0; i < cardsPerPage; i += 1) {
        const y = rowStartY + (i * rowGap);
        const container = scene.add.container(0, 0);

        const iconBody = scene.add.rectangle(
            Math.round(GAME_CENTER_X - 260 * UI_SCALE),
            y,
            Math.round(56 * UI_SCALE),
            Math.round(56 * UI_SCALE),
            0x1e293b,
            0.95
        )
            .setStrokeStyle(2, 0xffffff, 0.7)
            .setInteractive({ useHandCursor: true });

        const iconLabel = scene.add.text(iconBody.x, iconBody.y, '').setFontSize(Math.max(DECK_BUILDER_TEXT_LAYOUT.rowIconFontSizeMin, Math.round(DECK_BUILDER_TEXT_LAYOUT.rowIconFontSizeBase * UI_SCALE)))
            .setOrigin(0.5)
            .setTint(0xffffff)
            .setInteractive({ useHandCursor: true });

        const cardName = scene.add.text(Math.round(GAME_CENTER_X - 190 * UI_SCALE), y, '').setFontSize(Math.max(DECK_BUILDER_TEXT_LAYOUT.rowCardNameFontSizeMin, Math.round(DECK_BUILDER_TEXT_LAYOUT.rowCardNameFontSizeBase * UI_SCALE)))
            .setOrigin(0, 0.5)
            .setTint(0xffffff);

        const countLabel = scene.add.text(Math.round(GAME_CENTER_X + 148 * UI_SCALE), y, '0').setFontSize(Math.max(DECK_BUILDER_TEXT_LAYOUT.rowCountFontSizeMin, Math.round(DECK_BUILDER_TEXT_LAYOUT.rowCountFontSizeBase * UI_SCALE)))
            .setOrigin(0.5)
            .setTint(0xffffff);

        const plusButton = scene.add.rectangle(
            Math.round(GAME_CENTER_X + 214 * UI_SCALE),
            y,
            Math.round(40 * UI_SCALE),
            Math.round(40 * UI_SCALE),
            0x0f766e,
            0.95
        )
            .setStrokeStyle(2, 0xffffff, 0.75)
            .setInteractive({ useHandCursor: true });

        const plusLabel = scene.add.text(plusButton.x, plusButton.y, '+').setFontSize(Math.max(DECK_BUILDER_TEXT_LAYOUT.rowAdjustFontSizeMin, Math.round(DECK_BUILDER_TEXT_LAYOUT.rowAdjustFontSizeBase * UI_SCALE)))
            .setOrigin(0.5)
            .setTint(0xffffff);

        container.add([iconBody, iconLabel, cardName, countLabel, plusButton, plusLabel]);

        const row = {
            container,
            iconBody,
            iconLabel,
            cardName,
            countLabel,
            plusButton,
            plusLabel,
            card: null as CardCatalogEntry | null,
        };

        plusButton.on('pointerdown', () => {
            if (scene.busy || !row.card) {
                return;
            }
            scene.tryAddCardToDeck(row.card);
        });

        scene.bindHoverHighlight(
            plusButton,
            plusLabel,
            () => ({
                fillColor: 0x0f766e,
                fillAlpha: scene.canAddCardToDeck(row.card) ? 0.95 : 0.45,
                labelTint: 0xffffff,
                labelAlpha: scene.canAddCardToDeck(row.card) ? 1 : 0.45,
            }),
            () => ({
                fillColor: 0x0d9488,
                fillAlpha: 0.98,
                labelTint: 0xfef08a,
            }),
            () => scene.canAddCardToDeck(row.card)
        );

        const applyIconBaseStyle = (): void => {
            iconBody.setFillStyle(0x1e293b, 0.95);
            iconLabel.setTint(0xffffff);
        };
        const applyIconHoverStyle = (): void => {
            iconBody.setFillStyle(0x334155, 0.98);
            iconLabel.setTint(0xfef08a);
        };

        iconBody.on('pointerover', applyIconHoverStyle);
        iconBody.on('pointerout', applyIconBaseStyle);
        iconLabel.on('pointerover', applyIconHoverStyle);
        iconLabel.on('pointerout', applyIconBaseStyle);

        const showPreview = (pointer?: Phaser.Input.Pointer) => {
            if (!row.card) {
                return;
            }
            scene.showDeckCardPreview(row.card, pointer);
        };

        iconBody.on('pointerdown', (pointer: Phaser.Input.Pointer) => {
            showPreview(pointer);
        });

        iconLabel.on('pointerdown', (pointer: Phaser.Input.Pointer) => {
            showPreview(pointer);
        });

        applyIconBaseStyle();

        scene.rows.push(row);
    }
};

export const buildSearchMenu = (
    scene: DeckBuilderUiBuildScene,
    searchResultsPerPage: number
): void => {
    const panelWidth = Math.round(DECK_BUILDER_SEARCH_MENU_LAYOUT.panelWidthBase * UI_SCALE);
    const panelHeight = Math.round(DECK_BUILDER_SEARCH_MENU_LAYOUT.panelHeightBase * UI_SCALE);
    const panelX = GAME_CENTER_X;
    const panelY = Math.round(GAME_HEIGHT * 0.5);
    const panelTop = panelY - Math.round(panelHeight * 0.5);

    scene.searchBackdrop = scene.add.rectangle(
        GAME_CENTER_X,
        Math.round(GAME_HEIGHT * 0.5),
        GAME_WIDTH,
        GAME_HEIGHT,
        0x020617,
        0.75
    )
        .setDepth(1200)
        .setInteractive({ useHandCursor: true });

    scene.searchPanel = scene.add.rectangle(
        panelX,
        panelY,
        panelWidth,
        panelHeight,
        0x0f172a,
        0.98
    )
        .setStrokeStyle(2, 0xffffff, 0.9)
        .setDepth(1201)
        .setInteractive({ useHandCursor: true });

    scene.searchTitle = scene.add.text(panelX, panelTop + Math.round(DECK_BUILDER_SEARCH_MENU_LAYOUT.titleOffsetYBase * UI_SCALE), 'CARD SEARCH').setFontSize(Math.max(DECK_BUILDER_TEXT_LAYOUT.searchTitleFontSizeMin, Math.round(DECK_BUILDER_TEXT_LAYOUT.searchTitleFontSizeBase * UI_SCALE)))
        .setOrigin(0.5)
        .setTint(0xffffff)
        .setDepth(1202);

    scene.searchHint = scene.add.text(panelX, panelTop + Math.round(DECK_BUILDER_SEARCH_MENU_LAYOUT.hintOffsetYBase * UI_SCALE), 'Type to search all cards. Enter = add first result. Esc = close.').setFontSize(Math.max(DECK_BUILDER_TEXT_LAYOUT.searchHintFontSizeMin, Math.round(DECK_BUILDER_TEXT_LAYOUT.searchHintFontSizeBase * UI_SCALE)))
        .setOrigin(0.5)
        .setTint(0xcbd5e1)
        .setDepth(1202);

    scene.searchQueryLabel = scene.add.text(
        panelX - Math.round(panelWidth * 0.5) + Math.round(DECK_BUILDER_SEARCH_MENU_LAYOUT.queryOffsetXBase * UI_SCALE),
        panelTop + Math.round(DECK_BUILDER_SEARCH_MENU_LAYOUT.queryOffsetYBase * UI_SCALE),
        ''
    ).setFontSize(Math.max(DECK_BUILDER_TEXT_LAYOUT.searchQueryFontSizeMin, Math.round(DECK_BUILDER_TEXT_LAYOUT.searchQueryFontSizeBase * UI_SCALE)))
        .setOrigin(0, 0.5)
        .setTint(0xf8fafc)
        .setDepth(1202);

    scene.searchSaveButton = scene.add.rectangle(
        panelX + Math.round(panelWidth * 0.5) - Math.round(DECK_BUILDER_SEARCH_MENU_LAYOUT.saveButtonOffsetXBase * UI_SCALE),
        panelTop + Math.round(DECK_BUILDER_SEARCH_MENU_LAYOUT.actionButtonOffsetYBase * UI_SCALE),
        Math.round(DECK_BUILDER_SEARCH_MENU_LAYOUT.saveButtonWidthBase * UI_SCALE),
        Math.round(DECK_BUILDER_SEARCH_MENU_LAYOUT.saveButtonHeightBase * UI_SCALE),
        0x14532d,
        0.95
    )
        .setStrokeStyle(2, 0xffffff, 0.75)
        .setDepth(1202)
        .setInteractive({ useHandCursor: true });

    scene.searchSaveLabel = scene.add.text(scene.searchSaveButton.x, scene.searchSaveButton.y, 'SAVE').setFontSize(Math.max(DECK_BUILDER_TEXT_LAYOUT.searchButtonFontSizeMin, Math.round(DECK_BUILDER_TEXT_LAYOUT.searchButtonFontSizeBase * UI_SCALE)))
        .setOrigin(0.5)
        .setTint(0xffffff)
        .setDepth(1203);

    scene.searchClearButton = scene.add.rectangle(
        panelX + Math.round(panelWidth * 0.5) - Math.round(DECK_BUILDER_SEARCH_MENU_LAYOUT.clearButtonOffsetXBase * UI_SCALE),
        panelTop + Math.round(DECK_BUILDER_SEARCH_MENU_LAYOUT.actionButtonOffsetYBase * UI_SCALE),
        Math.round(DECK_BUILDER_SEARCH_MENU_LAYOUT.clearButtonWidthBase * UI_SCALE),
        Math.round(DECK_BUILDER_SEARCH_MENU_LAYOUT.clearButtonHeightBase * UI_SCALE),
        0x334155,
        0.95
    )
        .setStrokeStyle(2, 0xffffff, 0.75)
        .setDepth(1202)
        .setInteractive({ useHandCursor: true });

    scene.searchClearLabel = scene.add.text(scene.searchClearButton.x, scene.searchClearButton.y, 'CLEAR').setFontSize(Math.max(DECK_BUILDER_TEXT_LAYOUT.searchButtonFontSizeMin, Math.round(DECK_BUILDER_TEXT_LAYOUT.searchButtonFontSizeBase * UI_SCALE)))
        .setOrigin(0.5)
        .setTint(0xffffff)
        .setDepth(1203);

    scene.searchCloseButton = scene.add.rectangle(
        panelX + Math.round(panelWidth * 0.5) - Math.round(DECK_BUILDER_SEARCH_MENU_LAYOUT.closeButtonOffsetXBase * UI_SCALE),
        panelTop + Math.round(DECK_BUILDER_SEARCH_MENU_LAYOUT.actionButtonOffsetYBase * UI_SCALE),
        Math.round(DECK_BUILDER_SEARCH_MENU_LAYOUT.closeButtonWidthBase * UI_SCALE),
        Math.round(DECK_BUILDER_SEARCH_MENU_LAYOUT.closeButtonHeightBase * UI_SCALE),
        0x7f1d1d,
        0.95
    )
        .setStrokeStyle(2, 0xffffff, 0.75)
        .setDepth(1202)
        .setInteractive({ useHandCursor: true });

    scene.searchCloseLabel = scene.add.text(scene.searchCloseButton.x, scene.searchCloseButton.y, 'CLOSE').setFontSize(Math.max(DECK_BUILDER_TEXT_LAYOUT.searchButtonFontSizeMin, Math.round(DECK_BUILDER_TEXT_LAYOUT.searchButtonFontSizeBase * UI_SCALE)))
        .setOrigin(0.5)
        .setTint(0xffffff)
        .setDepth(1203);

    const rowsStartY = panelTop + Math.round(DECK_BUILDER_SEARCH_MENU_LAYOUT.rowsStartOffsetYBase * UI_SCALE);
    const rowsBottomY = panelTop + Math.round(DECK_BUILDER_SEARCH_MENU_LAYOUT.rowsBottomOffsetYBase * UI_SCALE);
    const rowGap = Math.max(DECK_BUILDER_SEARCH_MENU_LAYOUT.rowGapMin, Math.floor((rowsBottomY - rowsStartY) / Math.max(1, searchResultsPerPage - 1)));

    const nameX = panelX - Math.round(panelWidth * 0.5) + Math.round(DECK_BUILDER_SEARCH_MENU_LAYOUT.nameOffsetXBase * UI_SCALE);
    const countX = panelX + Math.round(panelWidth * 0.5) - Math.round(DECK_BUILDER_SEARCH_MENU_LAYOUT.countOffsetXBase * UI_SCALE);
    const plusX = panelX + Math.round(panelWidth * 0.5) - Math.round(DECK_BUILDER_SEARCH_MENU_LAYOUT.plusOffsetXBase * UI_SCALE);

    for (let i = 0; i < searchResultsPerPage; i += 1) {
        const y = rowsStartY + (i * rowGap);
        const container = scene.add.container(0, 0).setDepth(1202);

        const rowBackground = scene.add.rectangle(
            panelX,
            y,
            panelWidth - Math.round(DECK_BUILDER_SEARCH_MENU_LAYOUT.rowInsetXBase * UI_SCALE),
            Math.round(DECK_BUILDER_SEARCH_MENU_LAYOUT.rowHeightBase * UI_SCALE),
            0x1e293b,
            0.45
        )
            .setStrokeStyle(1, 0xffffff, 0.18)
            .setDepth(1202);

        const cardName = scene.add.text(nameX, y - Math.round(DECK_BUILDER_SEARCH_MENU_LAYOUT.rowNameOffsetYBase * UI_SCALE), '').setFontSize(Math.max(DECK_BUILDER_TEXT_LAYOUT.searchRowNameFontSizeMin, Math.round(DECK_BUILDER_TEXT_LAYOUT.searchRowNameFontSizeBase * UI_SCALE)))
            .setOrigin(0, 0.5)
            .setTint(0xffffff)
            .setDepth(1203);

        const cardMeta = scene.add.text(nameX, y + Math.round(DECK_BUILDER_SEARCH_MENU_LAYOUT.rowMetaOffsetYBase * UI_SCALE), '').setFontSize(Math.max(DECK_BUILDER_TEXT_LAYOUT.searchRowMetaFontSizeMin, Math.round(DECK_BUILDER_TEXT_LAYOUT.searchRowMetaFontSizeBase * UI_SCALE)))
            .setOrigin(0, 0.5)
            .setTint(0xcbd5e1)
            .setDepth(1203);

        const countLabel = scene.add.text(countX, y, '0').setFontSize(Math.max(DECK_BUILDER_TEXT_LAYOUT.searchRowCountFontSizeMin, Math.round(DECK_BUILDER_TEXT_LAYOUT.searchRowCountFontSizeBase * UI_SCALE)))
            .setOrigin(0.5)
            .setTint(0xffffff)
            .setDepth(1204);

        const plusButton = scene.add.rectangle(
            plusX,
            y,
            Math.round(DECK_BUILDER_SEARCH_MENU_LAYOUT.plusButtonWidthBase * UI_SCALE),
            Math.round(DECK_BUILDER_SEARCH_MENU_LAYOUT.plusButtonHeightBase * UI_SCALE),
            0x0f766e,
            0.95
        )
            .setStrokeStyle(2, 0xffffff, 0.75)
            .setDepth(1203)
            .setInteractive({ useHandCursor: true });

        const plusLabel = scene.add.text(plusButton.x, plusButton.y, '+').setFontSize(Math.max(DECK_BUILDER_TEXT_LAYOUT.searchRowAdjustFontSizeMin, Math.round(DECK_BUILDER_TEXT_LAYOUT.searchRowAdjustFontSizeBase * UI_SCALE)))
            .setOrigin(0.5)
            .setTint(0xffffff)
            .setDepth(1204);

        container.add([rowBackground, cardName, cardMeta, countLabel, plusButton, plusLabel]);

        const row = {
            container,
            cardName,
            cardMeta,
            countLabel,
            plusButton,
            plusLabel,
            card: null as CardCatalogEntry | null,
        };

        plusButton.on('pointerdown', () => {
            if (scene.busy || !row.card) {
                return;
            }
            scene.tryAddCardToDeck(row.card);
        });

        scene.bindHoverHighlight(
            plusButton,
            plusLabel,
            () => ({
                fillColor: 0x0f766e,
                fillAlpha: scene.canAddCardToDeck(row.card) ? 0.95 : 0.45,
                labelTint: 0xffffff,
                labelAlpha: scene.canAddCardToDeck(row.card) ? 1 : 0.45,
            }),
            () => ({ fillColor: 0x0d9488, fillAlpha: 0.98, labelTint: 0xfef08a }),
            () => scene.canAddCardToDeck(row.card)
        );

        scene.searchRows.push(row);
    }

    scene.searchPrevButton = scene.add.rectangle(
        panelX - Math.round(DECK_BUILDER_SEARCH_MENU_LAYOUT.pagerOffsetXBase * UI_SCALE),
        panelTop + Math.round(DECK_BUILDER_SEARCH_MENU_LAYOUT.pagerOffsetYBase * UI_SCALE),
        Math.round(DECK_BUILDER_SEARCH_MENU_LAYOUT.pagerWidthBase * UI_SCALE),
        Math.round(DECK_BUILDER_SEARCH_MENU_LAYOUT.pagerHeightBase * UI_SCALE),
        0x0f172a,
        0.95
    )
        .setStrokeStyle(2, 0xffffff, 0.75)
        .setDepth(1202)
        .setInteractive({ useHandCursor: true });

    scene.searchPrevLabel = scene.add.text(scene.searchPrevButton.x, scene.searchPrevButton.y, 'PREV').setFontSize(Math.max(DECK_BUILDER_TEXT_LAYOUT.searchPagerFontSizeMin, Math.round(DECK_BUILDER_TEXT_LAYOUT.searchPagerFontSizeBase * UI_SCALE)))
        .setOrigin(0.5)
        .setTint(0xffffff)
        .setDepth(1203);

    scene.searchNextButton = scene.add.rectangle(
        panelX + Math.round(DECK_BUILDER_SEARCH_MENU_LAYOUT.pagerOffsetXBase * UI_SCALE),
        panelTop + Math.round(DECK_BUILDER_SEARCH_MENU_LAYOUT.pagerOffsetYBase * UI_SCALE),
        Math.round(DECK_BUILDER_SEARCH_MENU_LAYOUT.pagerWidthBase * UI_SCALE),
        Math.round(DECK_BUILDER_SEARCH_MENU_LAYOUT.pagerHeightBase * UI_SCALE),
        0x0f172a,
        0.95
    )
        .setStrokeStyle(2, 0xffffff, 0.75)
        .setDepth(1202)
        .setInteractive({ useHandCursor: true });

    scene.searchNextLabel = scene.add.text(scene.searchNextButton.x, scene.searchNextButton.y, 'NEXT').setFontSize(Math.max(DECK_BUILDER_TEXT_LAYOUT.searchPagerFontSizeMin, Math.round(DECK_BUILDER_TEXT_LAYOUT.searchPagerFontSizeBase * UI_SCALE)))
        .setOrigin(0.5)
        .setTint(0xffffff)
        .setDepth(1203);

    scene.bindHoverHighlight(
        scene.searchSaveButton,
        scene.searchSaveLabel,
        () => ({ fillColor: 0x14532d, fillAlpha: 0.95, labelTint: 0xffffff }),
        () => ({ fillColor: 0x166534, fillAlpha: 0.98, labelTint: 0xfef08a })
    );

    scene.bindHoverHighlight(
        scene.searchClearButton,
        scene.searchClearLabel,
        () => ({ fillColor: 0x334155, fillAlpha: 0.95, labelTint: 0xffffff }),
        () => ({ fillColor: 0x475569, fillAlpha: 0.98, labelTint: 0xfef08a })
    );

    scene.bindHoverHighlight(
        scene.searchCloseButton,
        scene.searchCloseLabel,
        () => ({ fillColor: 0x7f1d1d, fillAlpha: 0.95, labelTint: 0xffffff }),
        () => ({ fillColor: 0x991b1b, fillAlpha: 0.98, labelTint: 0xfef08a })
    );

    scene.bindHoverHighlight(
        scene.searchPrevButton,
        scene.searchPrevLabel,
        () => ({
            fillColor: 0x0f172a,
            fillAlpha: scene.searchPageIndex > 0 ? 0.95 : 0.45,
            labelTint: 0xffffff,
            labelAlpha: scene.searchPageIndex > 0 ? 1 : 0.45,
        }),
        () => ({ fillColor: 0x1e293b, fillAlpha: 0.98, labelTint: 0xfef08a }),
        () => scene.searchPageIndex > 0
    );

    scene.bindHoverHighlight(
        scene.searchNextButton,
        scene.searchNextLabel,
        () => {
            const hasNext = scene.searchPageIndex < Math.max(0, Math.ceil(scene.getSearchFilteredCards().length / searchResultsPerPage) - 1);
            return {
                fillColor: 0x0f172a,
                fillAlpha: hasNext ? 0.95 : 0.45,
                labelTint: 0xffffff,
                labelAlpha: hasNext ? 1 : 0.45,
            };
        },
        () => ({ fillColor: 0x1e293b, fillAlpha: 0.98, labelTint: 0xfef08a }),
        () => scene.searchPageIndex < Math.max(0, Math.ceil(scene.getSearchFilteredCards().length / searchResultsPerPage) - 1)
    );

    scene.searchBackdrop.on('pointerdown', () => {
        scene.toggleSearchMenu(false);
    });

    scene.searchCloseButton.on('pointerdown', () => {
        scene.toggleSearchMenu(false);
    });

    scene.searchSaveButton.on('pointerdown', () => {
        void scene.saveDeck();
    });

    scene.searchClearButton.on('pointerdown', () => {
        scene.searchQuery = '';
        scene.searchPageIndex = 0;
        scene.renderSearchMenu();
    });

    scene.searchPrevButton.on('pointerdown', () => {
        if (scene.searchPageIndex <= 0) {
            return;
        }
        scene.searchPageIndex -= 1;
        scene.renderSearchMenu();
    });

    scene.searchNextButton.on('pointerdown', () => {
        const maxPage = Math.max(0, Math.ceil(scene.getSearchFilteredCards().length / searchResultsPerPage) - 1);
        if (scene.searchPageIndex >= maxPage) {
            return;
        }
        scene.searchPageIndex += 1;
        scene.renderSearchMenu();
    });

    scene.searchMenuObjects = [
        scene.searchBackdrop,
        scene.searchPanel,
        scene.searchTitle,
        scene.searchHint,
        scene.searchQueryLabel,
        scene.searchSaveButton,
        scene.searchSaveLabel,
        scene.searchCloseButton,
        scene.searchCloseLabel,
        scene.searchClearButton,
        scene.searchClearLabel,
        scene.searchPrevButton,
        scene.searchPrevLabel,
        scene.searchNextButton,
        scene.searchNextLabel,
        ...scene.searchRows.flatMap((row: {
            container: Phaser.GameObjects.Container;
            cardName: Phaser.GameObjects.Text;
            cardMeta: Phaser.GameObjects.Text;
            countLabel: Phaser.GameObjects.Text;
            plusButton: Phaser.GameObjects.Rectangle;
            plusLabel: Phaser.GameObjects.Text;
        }) => [
            row.container,
            row.cardName,
            row.cardMeta,
            row.countLabel,
            row.plusButton,
            row.plusLabel,
        ]),
    ];
};
