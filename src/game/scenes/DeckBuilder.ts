import { Scene, GameObjects } from 'phaser';
import {
    BASE_HEIGHT,
    BASE_WIDTH,
    BOARD_SCALE,
    CARD_BASE_HEIGHT,
    CARD_BASE_WIDTH,
    DECK_BUILDER_CATEGORY_FILL_COLORS,
    DECK_BUILDER_CURRENT_DECK_PANEL_LAYOUT,
    DECK_BUILDER_CURRENT_DECK_PREVIEW_TEXT_LAYOUT,
    DECK_BUILDER_TRANSFER_ICON_ASSETS,
    DECK_BUILDER_TRANSFER_ICON_LAYOUT,
    DECK_BUILDER_TEXT_LAYOUT,
    GAME_CENTER_X,
    GAME_HEIGHT,
    GAME_WIDTH,
    UI_SCALE
} from '../config';
import { CARD_CATALOG, CardCatalogEntry, CardCatalogCategory, CharacterCardType } from '../data/cardCatalog';
import { decodeDeckShareHex, encodeDeckShareHex } from '../data/deckShareCodec';
import { Card, CardType } from '../entities';
import {
    clearClientSessionState,
    createUserDeck,
    fetchUserDecks,
    isSessionSupersededError,
    subscribeToRouterSessionEvents,
    selectUserDeck,
    updateUserDeck,
    ROUTER_SESSION_ID_STORAGE_KEY,
    UserDeck,
} from '../Network';
import { CardPreviewController } from '../ui/CardPreviewController';
import { fitTextToMultiLine } from '../ui/overlays/textFit';

type DeckBuilderState = {
    deckId: string | null;
    deckName: string;
    countsByCardId: Map<string, number>;
    pageIndex: number;
    activeCategory: CardCatalogCategory;
    activeCharacterCardType: CharacterCardType | 'all';
};

type DeckDraft = {
    deckId: string;
    deckName: string;
    cards: string[];
    dirty: boolean;
};

type DeckBuilderButtonStyle = {
    fillColor: number;
    fillAlpha: number;
    labelTint?: number;
    labelAlpha?: number;
};

const CARDS_PER_PAGE = 8;
const SEARCH_RESULTS_PER_PAGE = 8;
const FIXED_DECK_SLOT_COUNT = 5;
const DECK_SLOT_IDS_STORAGE_KEY = 'avge_deck_slot_ids';
const DECK_REQUIRED_CARD_COUNT = 20;
const DECK_MAX_ITEM_OR_TOOL_COPIES = 2;
const DECK_MAX_OTHER_COPIES = 1;

const CARD_BY_ID: Map<string, CardCatalogEntry> = new Map(CARD_CATALOG.map((entry) => [entry.id, entry]));

export class DeckBuilder extends Scene
{
    background: GameObjects.Image;
    title: GameObjects.Text;
    subtitle: GameObjects.Text;
    pageIndicator: GameObjects.Text;
    saveButton: GameObjects.Rectangle;
    saveLabel: GameObjects.Text;
    backButton: GameObjects.Rectangle;
    backLabel: GameObjects.Text;
    resetButton: GameObjects.Rectangle;
    resetIcon: GameObjects.Image;
    resetLabel: GameObjects.Text;
    resetHoverLabel: GameObjects.Text;
    exportButton: GameObjects.Rectangle;
    exportIcon: GameObjects.Image;
    exportLabel: GameObjects.Text;
    importButton: GameObjects.Rectangle;
    importIcon: GameObjects.Image;
    importLabel: GameObjects.Text;
    searchButton: GameObjects.Rectangle;
    searchLabel: GameObjects.Text;
    nextPageButton: GameObjects.Rectangle;
    prevPageButton: GameObjects.Rectangle;
    nextPageLabel: GameObjects.Text;
    prevPageLabel: GameObjects.Text;
    categoryButtons: Array<{
        category: CardCatalogCategory;
        body: GameObjects.Rectangle;
        label: GameObjects.Text;
    }>;
    characterTypeButtons: Array<{
        cardType: CharacterCardType | 'all';
        body: GameObjects.Rectangle;
        label: GameObjects.Text;
    }>;

    private state: DeckBuilderState;
    deckSlotButtons: Array<{
        index: number;
        body: GameObjects.Rectangle;
        label: GameObjects.Text;
    }>;
    private slotDecks: Array<UserDeck | null>;
    private rows: Array<{
        container: Phaser.GameObjects.Container;
        iconBody: GameObjects.Rectangle;
        iconLabel: GameObjects.Text;
        cardName: GameObjects.Text;
        countLabel: GameObjects.Text;
        plusButton: GameObjects.Rectangle;
        plusLabel: GameObjects.Text;
        card: CardCatalogEntry | null;
    }>;
    private busy: boolean;
    private authSessionUnsubscribe: (() => void) | null;
    private draftByDeckId: Map<string, DeckDraft>;
    private activeDeckId: string | null;
    private searchMenuVisible: boolean;
    private searchQuery: string;
    private searchPageIndex: number;
    private searchMenuObjects: Array<GameObjects.Rectangle | GameObjects.Text | Phaser.GameObjects.Container>;
    private searchBackdrop: GameObjects.Rectangle;
    private searchPanel: GameObjects.Rectangle;
    private searchTitle: GameObjects.Text;
    private searchHint: GameObjects.Text;
    private searchQueryLabel: GameObjects.Text;
    private searchSaveButton: GameObjects.Rectangle;
    private searchSaveLabel: GameObjects.Text;
    private searchCloseButton: GameObjects.Rectangle;
    private searchCloseLabel: GameObjects.Text;
    private searchClearButton: GameObjects.Rectangle;
    private searchClearLabel: GameObjects.Text;
    private searchPrevButton: GameObjects.Rectangle;
    private searchPrevLabel: GameObjects.Text;
    private searchNextButton: GameObjects.Rectangle;
    private searchNextLabel: GameObjects.Text;
    private searchRows: Array<{
        container: Phaser.GameObjects.Container;
        cardName: GameObjects.Text;
        cardMeta: GameObjects.Text;
        countLabel: GameObjects.Text;
        plusButton: GameObjects.Rectangle;
        plusLabel: GameObjects.Text;
        card: CardCatalogEntry | null;
    }>;
    private currentDeckPanel: GameObjects.Rectangle;
    private currentDeckHint: GameObjects.Text;
    private currentDeckCardObjects: Phaser.GameObjects.GameObject[];
    private deckCardPreviewController: CardPreviewController;
    private deckPreviewProxyCard: Card | null;
    private deckPreviewObjectWidth: number;
    private deckPreviewObjectHeight: number;
    private deckPreviewSuppressOutsideClose: boolean;
    private keyboardKeydownHandler: ((event: KeyboardEvent) => void) | null;
    private pointerDownHandler: ((pointer: Phaser.Input.Pointer) => void) | null;
    private gameObjectDownHandler: ((pointer: Phaser.Input.Pointer, gameObject: Phaser.GameObjects.GameObject) => void) | null;
    private lastDeckNameClickAtMs: number;
    private resetDeckConfirmTimer: Phaser.Time.TimerEvent | null;
    private resetDeckConfirmSecondsRemaining: number;

    constructor ()
    {
        super('DeckBuilder');
        this.rows = [];
        this.busy = false;
        this.state = {
            deckId: null,
            deckName: 'My Deck',
            countsByCardId: new Map<string, number>(),
            pageIndex: 0,
            activeCategory: 'character',
            activeCharacterCardType: 'all',
        };
        this.categoryButtons = [];
        this.characterTypeButtons = [];
        this.deckSlotButtons = [];
        this.slotDecks = [];
        this.draftByDeckId = new Map<string, DeckDraft>();
        this.activeDeckId = null;
        this.authSessionUnsubscribe = null;
        this.searchMenuVisible = false;
        this.searchQuery = '';
        this.searchPageIndex = 0;
        this.searchMenuObjects = [];
        this.searchRows = [];
        this.currentDeckCardObjects = [];
        this.deckCardPreviewController = new CardPreviewController(this);
        this.deckPreviewProxyCard = null;
        this.deckPreviewObjectWidth = 0;
        this.deckPreviewObjectHeight = 0;
        this.deckPreviewSuppressOutsideClose = false;
        this.keyboardKeydownHandler = null;
        this.pointerDownHandler = null;
        this.gameObjectDownHandler = null;
        this.lastDeckNameClickAtMs = 0;
        this.resetDeckConfirmTimer = null;
        this.resetDeckConfirmSecondsRemaining = 0;
    }

    preload (): void
    {
        this.load.setPath('assets');
        this.load.image('background', 'background/background_element.png');
        this.load.image(DECK_BUILDER_TRANSFER_ICON_ASSETS.exportKey, DECK_BUILDER_TRANSFER_ICON_ASSETS.exportPath);
        this.load.image(DECK_BUILDER_TRANSFER_ICON_ASSETS.importKey, DECK_BUILDER_TRANSFER_ICON_ASSETS.importPath);
        this.load.image(DECK_BUILDER_TRANSFER_ICON_ASSETS.resetKey, DECK_BUILDER_TRANSFER_ICON_ASSETS.resetPath);
    }

    create (): void
    {
        // Phaser reuses the same Scene instance on restart; clear row refs from
        // prior runs so we never mutate destroyed text objects.
        this.rows = [];
        this.state.deckId = null;
        this.state.deckName = 'My Deck';
        this.state.countsByCardId = new Map<string, number>();
        this.state.pageIndex = 0;
        this.state.activeCategory = 'character';
        this.state.activeCharacterCardType = 'all';
        this.categoryButtons = [];
        this.characterTypeButtons = [];
        this.deckSlotButtons = [];
        this.slotDecks = [];
        this.draftByDeckId = new Map<string, DeckDraft>();
        this.activeDeckId = null;
        this.searchMenuVisible = false;
        this.searchQuery = '';
        this.searchPageIndex = 0;
        this.searchMenuObjects = [];
        this.searchRows = [];
        this.currentDeckCardObjects = [];
        this.deckPreviewSuppressOutsideClose = false;
        this.lastDeckNameClickAtMs = 0;

        this.events.once(Phaser.Scenes.Events.SHUTDOWN, () => {
            this.stopAuthSessionPush();
            this.hideDeckCardPreview();
            if (this.deckPreviewProxyCard) {
                this.deckPreviewProxyCard.destroy();
                this.deckPreviewProxyCard = null;
            }
            if (this.keyboardKeydownHandler && this.input.keyboard) {
                this.input.keyboard.off('keydown', this.keyboardKeydownHandler);
                this.keyboardKeydownHandler = null;
            }
            if (this.pointerDownHandler) {
                this.input.off('pointerdown', this.pointerDownHandler);
                this.pointerDownHandler = null;
            }
            if (this.gameObjectDownHandler) {
                this.input.off('gameobjectdown', this.gameObjectDownHandler);
                this.gameObjectDownHandler = null;
            }
            this.disarmResetDeckConfirm();
        });

        this.cameras.main.fadeIn(180, 0, 0, 0);

        this.background = this.add.image(GAME_CENTER_X, Math.round(GAME_HEIGHT * 0.5), 'background');
        this.background.setDisplaySize(GAME_WIDTH, GAME_HEIGHT);
        this.background.setAlpha(0.9);

        this.title = this.add.text(GAME_CENTER_X, Math.round(GAME_HEIGHT * 0.09), 'DECK BUILDER').setFontSize(Math.max(DECK_BUILDER_TEXT_LAYOUT.titleFontSizeMin, Math.round(DECK_BUILDER_TEXT_LAYOUT.titleFontSizeBase * UI_SCALE)))
            .setOrigin(0.5)
            .setTint(0xffffff);

        this.subtitle = this.add.text(GAME_CENTER_X, Math.round(GAME_HEIGHT * 0.15), 'Loading deck...').setFontSize(Math.max(DECK_BUILDER_TEXT_LAYOUT.subtitleFontSizeMin, Math.round(DECK_BUILDER_TEXT_LAYOUT.subtitleFontSizeBase * UI_SCALE)))
            .setOrigin(0.5)
            .setTint(0xe2e8f0)
            .setInteractive({ useHandCursor: true });

        this.subtitle.on('pointerdown', () => {
            if (!this.state.deckId || this.busy) {
                return;
            }

            const now = this.time.now;
            if ((now - this.lastDeckNameClickAtMs) <= 320) {
                this.lastDeckNameClickAtMs = 0;
                this.renameCurrentDeck();
                return;
            }

            this.lastDeckNameClickAtMs = now;
        });

        this.pageIndicator = this.add.text(GAME_CENTER_X, Math.round(GAME_HEIGHT * 0.84), '').setFontSize(Math.max(DECK_BUILDER_TEXT_LAYOUT.pageIndicatorFontSizeMin, Math.round(DECK_BUILDER_TEXT_LAYOUT.pageIndicatorFontSizeBase * UI_SCALE)))
            .setOrigin(0.5)
            .setTint(0xcbd5e1);

        this.prevPageButton = this.add.rectangle(
            Math.round(GAME_CENTER_X - 160 * UI_SCALE),
            Math.round(GAME_HEIGHT * 0.84),
            Math.round(74 * UI_SCALE),
            Math.round(44 * UI_SCALE),
            0x0f172a,
            0.9
        )
            .setStrokeStyle(2, 0xffffff, 0.75)
            .setInteractive({ useHandCursor: true });

        this.prevPageLabel = this.add.text(this.prevPageButton.x, this.prevPageButton.y, 'PREV').setFontSize(Math.max(DECK_BUILDER_TEXT_LAYOUT.pageNavFontSizeMin, Math.round(DECK_BUILDER_TEXT_LAYOUT.pageNavFontSizeBase * UI_SCALE)))
            .setOrigin(0.5)
            .setTint(0xffffff);

        this.nextPageButton = this.add.rectangle(
            Math.round(GAME_CENTER_X + 160 * UI_SCALE),
            Math.round(GAME_HEIGHT * 0.84),
            Math.round(74 * UI_SCALE),
            Math.round(44 * UI_SCALE),
            0x0f172a,
            0.9
        )
            .setStrokeStyle(2, 0xffffff, 0.75)
            .setInteractive({ useHandCursor: true });

        this.nextPageLabel = this.add.text(this.nextPageButton.x, this.nextPageButton.y, 'NEXT').setFontSize(Math.max(DECK_BUILDER_TEXT_LAYOUT.pageNavFontSizeMin, Math.round(DECK_BUILDER_TEXT_LAYOUT.pageNavFontSizeBase * UI_SCALE)))
            .setOrigin(0.5)
            .setTint(0xffffff);

        this.saveButton = this.add.rectangle(
            Math.round(GAME_CENTER_X + 340 * UI_SCALE),
            Math.round(GAME_HEIGHT * 0.93),
            Math.round(112 * UI_SCALE),
            Math.round(48 * UI_SCALE),
            0x14532d,
            0.95
        )
            .setStrokeStyle(2, 0xffffff, 0.85)
            .setInteractive({ useHandCursor: true });

        this.saveLabel = this.add.text(this.saveButton.x, this.saveButton.y, 'SAVE').setFontSize(Math.max(DECK_BUILDER_TEXT_LAYOUT.actionFontSizeMin, Math.round(DECK_BUILDER_TEXT_LAYOUT.actionFontSizeBase * UI_SCALE)))
            .setOrigin(0.5)
            .setTint(0xffffff);

        this.backButton = this.add.rectangle(
            Math.round(GAME_CENTER_X - 340 * UI_SCALE),
            Math.round(GAME_HEIGHT * 0.93),
            Math.round(112 * UI_SCALE),
            Math.round(48 * UI_SCALE),
            0x1e293b,
            0.95
        )
            .setStrokeStyle(2, 0xffffff, 0.75)
            .setInteractive({ useHandCursor: true });

        this.backLabel = this.add.text(this.backButton.x, this.backButton.y, 'BACK').setFontSize(Math.max(DECK_BUILDER_TEXT_LAYOUT.actionFontSizeMin, Math.round(DECK_BUILDER_TEXT_LAYOUT.actionFontSizeBase * UI_SCALE)))
            .setOrigin(0.5)
            .setTint(0xffffff);
        this.resetButton = this.add.rectangle(
            Math.round(GAME_CENTER_X - 204 * UI_SCALE),
            Math.round(GAME_HEIGHT * 0.93),
            Math.round(DECK_BUILDER_TRANSFER_ICON_LAYOUT.buttonSizeBase * UI_SCALE),
            Math.round(DECK_BUILDER_TRANSFER_ICON_LAYOUT.buttonSizeBase * UI_SCALE),
            0x991b1b,
            0.95
        )
            .setStrokeStyle(2, 0xffffff, 0.75)
            .setInteractive({ useHandCursor: true });

        this.resetIcon = this.add.image(this.resetButton.x, this.resetButton.y, DECK_BUILDER_TRANSFER_ICON_ASSETS.resetKey)
            .setDepth(this.resetButton.depth + 1);

        this.resetLabel = this.add.text(this.resetButton.x, this.resetButton.y, '').setFontSize(Math.max(
                DECK_BUILDER_TRANSFER_ICON_LAYOUT.resetCountdownFontSizeMin,
                Math.round(DECK_BUILDER_TRANSFER_ICON_LAYOUT.resetCountdownFontSizeBase * UI_SCALE)
            ))
            .setOrigin(0.5)
            .setTint(0xffffff)
            .setDepth(this.resetButton.depth + 2)
            .setVisible(false);

            this.resetHoverLabel = this.add.text(this.resetButton.x, this.resetButton.y, 'Reset deck?').setFontSize(Math.max(
                DECK_BUILDER_TRANSFER_ICON_LAYOUT.hoverLabelFontSizeMin,
                Math.round(DECK_BUILDER_TRANSFER_ICON_LAYOUT.hoverLabelFontSizeBase * UI_SCALE)
                ))
                .setOrigin(0.5)
                .setTint(0xfef08a)
                .setDepth(this.resetButton.depth + 2)
                .setVisible(false);

        this.exportButton = this.add.rectangle(
            Math.round(GAME_CENTER_X - 136 * UI_SCALE),
            Math.round(GAME_HEIGHT * 0.93),
            Math.round(DECK_BUILDER_TRANSFER_ICON_LAYOUT.buttonSizeBase * UI_SCALE),
            Math.round(DECK_BUILDER_TRANSFER_ICON_LAYOUT.buttonSizeBase * UI_SCALE),
            0x1f2937,
            0.95
        )
            .setStrokeStyle(2, 0xffffff, 0.75)
            .setInteractive({ useHandCursor: true });

        this.exportIcon = this.add.image(this.exportButton.x, this.exportButton.y, DECK_BUILDER_TRANSFER_ICON_ASSETS.exportKey)
            .setDepth(this.exportButton.depth + 1);

        this.exportLabel = this.add.text(this.exportButton.x, this.exportButton.y, 'EXPORT').setFontSize(Math.max(DECK_BUILDER_TEXT_LAYOUT.actionFontSizeMin, Math.round(DECK_BUILDER_TEXT_LAYOUT.actionFontSizeBase * UI_SCALE)))
            .setOrigin(0.5)
            .setTint(0xfef08a)
            .setDepth(this.exportButton.depth + 2)
            .setVisible(false);

        this.importButton = this.add.rectangle(
            GAME_CENTER_X,
            Math.round(GAME_HEIGHT * 0.93),
            Math.round(DECK_BUILDER_TRANSFER_ICON_LAYOUT.buttonSizeBase * UI_SCALE),
            Math.round(DECK_BUILDER_TRANSFER_ICON_LAYOUT.buttonSizeBase * UI_SCALE),
            0x78350f,
            0.95
        )
            .setStrokeStyle(2, 0xffffff, 0.75)
            .setInteractive({ useHandCursor: true });

        this.importIcon = this.add.image(this.importButton.x, this.importButton.y, DECK_BUILDER_TRANSFER_ICON_ASSETS.importKey)
            .setDepth(this.importButton.depth + 1);

        this.importLabel = this.add.text(this.importButton.x, this.importButton.y, 'IMPORT').setFontSize(Math.max(DECK_BUILDER_TEXT_LAYOUT.actionFontSizeMin, Math.round(DECK_BUILDER_TEXT_LAYOUT.actionFontSizeBase * UI_SCALE)))
            .setOrigin(0.5)
            .setTint(0xfef08a)
            .setDepth(this.importButton.depth + 2)
            .setVisible(false);

        const iconMaxSize = Math.round(DECK_BUILDER_TRANSFER_ICON_LAYOUT.buttonSizeBase * UI_SCALE * DECK_BUILDER_TRANSFER_ICON_LAYOUT.iconMaxSizeRatio);
        this.resetIcon.setDisplaySize(iconMaxSize, iconMaxSize);
        this.exportIcon.setDisplaySize(iconMaxSize, iconMaxSize);
        this.importIcon.setDisplaySize(iconMaxSize, iconMaxSize);

        this.searchButton = this.add.rectangle(
            GAME_CENTER_X,
            Math.round(GAME_HEIGHT * 0.93),
            Math.round(112 * UI_SCALE),
            Math.round(48 * UI_SCALE),
            0x0f172a,
            0.95
        )
            .setStrokeStyle(2, 0xffffff, 0.75)
            .setInteractive({ useHandCursor: true });

        this.searchLabel = this.add.text(this.searchButton.x, this.searchButton.y, 'SEARCH').setFontSize(Math.max(DECK_BUILDER_TEXT_LAYOUT.actionFontSizeMin, Math.round(DECK_BUILDER_TEXT_LAYOUT.actionFontSizeBase * UI_SCALE)))
            .setOrigin(0.5)
            .setTint(0xffffff);

        this.bindHoverHighlight(
            this.prevPageButton,
            this.prevPageLabel,
            () => ({ fillColor: 0x0f172a, fillAlpha: 0.9, labelTint: 0xffffff }),
            () => ({ fillColor: 0x1e293b, fillAlpha: 0.98, labelTint: 0xfef08a }),
            () => this.state.pageIndex > 0
        );

        this.bindHoverHighlight(
            this.nextPageButton,
            this.nextPageLabel,
            () => ({ fillColor: 0x0f172a, fillAlpha: 0.9, labelTint: 0xffffff }),
            () => ({ fillColor: 0x1e293b, fillAlpha: 0.98, labelTint: 0xfef08a }),
            () => this.state.pageIndex < Math.max(0, Math.ceil(this.getActiveCategoryCards().length / CARDS_PER_PAGE) - 1)
        );

        this.bindHoverHighlight(
            this.saveButton,
            this.saveLabel,
            () => ({ fillColor: 0x14532d, fillAlpha: 0.95, labelTint: 0xffffff }),
            () => ({ fillColor: 0x166534, fillAlpha: 0.98, labelTint: 0xfef08a })
        );

        this.bindHoverHighlight(
            this.backButton,
            this.backLabel,
            () => ({ fillColor: 0x1e293b, fillAlpha: 0.95, labelTint: 0xffffff }),
            () => ({ fillColor: 0x334155, fillAlpha: 0.98, labelTint: 0xfef08a })
        );

        this.bindHoverHighlight(
            this.resetButton,
            null,
            () => ({ fillColor: 0x991b1b, fillAlpha: 0.95 }),
            () => ({ fillColor: 0xb91c1c, fillAlpha: 0.98 })
        );

        this.bindHoverHighlight(
            this.exportButton,
            null,
            () => ({ fillColor: 0x1f2937, fillAlpha: 0.95, labelTint: 0xffffff }),
            () => ({ fillColor: 0x334155, fillAlpha: 0.98, labelTint: 0xfef08a })
        );

        this.bindHoverHighlight(
            this.importButton,
            null,
            () => ({ fillColor: 0x78350f, fillAlpha: 0.95, labelTint: 0xffffff }),
            () => ({ fillColor: 0x92400e, fillAlpha: 0.98, labelTint: 0xfef08a })
        );

        this.resetButton.on('pointerover', () => {
            if (!this.resetLabel.visible) {
                this.resetIcon.setTint(0xfef08a);
                this.resetHoverLabel.setVisible(true);
            }
        });
        this.resetButton.on('pointerout', () => {
            if (!this.resetLabel.visible) {
                this.resetIcon.clearTint();
            }
            this.resetHoverLabel.setVisible(false);
        });

        this.exportButton.on('pointerover', () => {
            this.exportIcon.setTint(0xfef08a);
            this.exportLabel.setVisible(true);
        });
        this.exportButton.on('pointerout', () => {
            this.exportIcon.clearTint();
            this.exportLabel.setVisible(false);
        });

        this.importButton.on('pointerover', () => {
            this.importIcon.setTint(0xfef08a);
            this.importLabel.setVisible(true);
        });
        this.importButton.on('pointerout', () => {
            this.importIcon.clearTint();
            this.importLabel.setVisible(false);
        });

        this.bindHoverHighlight(
            this.searchButton,
            this.searchLabel,
            () => ({ fillColor: 0x0f172a, fillAlpha: 0.95, labelTint: 0xffffff }),
            () => ({ fillColor: 0x1e293b, fillAlpha: 0.98, labelTint: 0xfef08a })
        );

        this.buildDeckSlotButtons();
        this.buildCategoryButtons();
        this.buildCharacterTypeButtons();
        this.buildRows();
        this.buildCurrentDeckPanel();
        this.buildDeckPreviewPanel();
        this.buildSearchMenu();
        this.renderRows();
        this.renderSearchMenu();
        this.setSearchMenuVisible(false);
        this.hideDeckCardPreview();
        this.updateSummaryText();
        this.positionDeckTransferButtons();

        this.prevPageButton.on('pointerdown', () => {
            if (this.state.pageIndex <= 0) {
                return;
            }
            this.state.pageIndex -= 1;
            this.renderRows();
        });

        this.nextPageButton.on('pointerdown', () => {
            const maxPage = Math.max(0, Math.ceil(this.getActiveCategoryCards().length / CARDS_PER_PAGE) - 1);
            if (this.state.pageIndex >= maxPage) {
                return;
            }
            this.state.pageIndex += 1;
            this.renderRows();
        });

        this.saveButton.on('pointerdown', () => {
            void this.saveDeck();
        });

        this.resetButton.on('pointerdown', () => {
            this.handleResetDeckButtonClick();
        });

        this.exportButton.on('pointerdown', () => {
            this.exportCurrentDeckShare();
        });

        this.importButton.on('pointerdown', () => {
            this.importDeckShare();
        });

        this.searchButton.on('pointerdown', () => {
            this.toggleSearchMenu(!this.searchMenuVisible);
        });

        this.backButton.on('pointerdown', () => {
            this.scene.start('MainMenu');
        });

        void this.loadDeck();

        this.keyboardKeydownHandler = (event: KeyboardEvent) => {
            this.handleSearchKeydown(event);
        };
        this.input.keyboard?.on('keydown', this.keyboardKeydownHandler);

        this.pointerDownHandler = (pointer: Phaser.Input.Pointer) => {
            this.handleGlobalPointerDown(pointer);
        };
        this.input.on('pointerdown', this.pointerDownHandler);

        this.gameObjectDownHandler = (pointer: Phaser.Input.Pointer, gameObject: Phaser.GameObjects.GameObject) => {
            this.handleGlobalGameObjectDown(pointer, gameObject);
        };
        this.input.on('gameobjectdown', this.gameObjectDownHandler);

        const sessionId = this.getStoredSessionId();
        if (sessionId) {
            this.startAuthSessionPush(sessionId);
        }
    }

    private buildDeckSlotButtons (): void
    {
        const panelX = Math.round(GAME_CENTER_X - 380 * UI_SCALE);
        const startY = Math.round(GAME_HEIGHT * 0.33);
        const spacing = Math.round(64 * UI_SCALE);
        const width = Math.round(180 * UI_SCALE);
        const height = Math.round(50 * UI_SCALE);
        const titleSize = Math.max(DECK_BUILDER_TEXT_LAYOUT.slotTitleFontSizeMin, Math.round(DECK_BUILDER_TEXT_LAYOUT.slotTitleFontSizeBase * UI_SCALE));
        const labelSize = Math.max(DECK_BUILDER_TEXT_LAYOUT.slotLabelFontSizeMin, Math.round(DECK_BUILDER_TEXT_LAYOUT.slotLabelFontSizeBase * UI_SCALE));

        this.add.text(panelX, Math.round(startY - 58 * UI_SCALE), 'SAVED DECKS').setFontSize(titleSize)
            .setOrigin(0.5)
            .setTint(0xffffff);

        for (let i = 0; i < FIXED_DECK_SLOT_COUNT; i += 1) {
            const y = startY + (i * spacing);
            const body = this.add.rectangle(panelX, y, width, height, 0x0b1220, 0.88)
                .setStrokeStyle(2, 0xffffff, 0.55)
                .setInteractive({ useHandCursor: true });

            const label = this.add.text(panelX, y, this.defaultDeckName(i)).setFontSize(labelSize)
                .setOrigin(0.5)
                .setTint(0xe2e8f0);

            body.on('pointerdown', () => {
                void this.selectDeckSlot(i);
            });

            this.bindHoverHighlight(
                body,
                label,
                () => {
                    const slotDeck = this.slotDecks[i] ?? null;
                    const active = slotDeck !== null && slotDeck.deckId === this.state.deckId;
                    return {
                        fillColor: active ? 0x1d4ed8 : 0x0b1220,
                        fillAlpha: active ? 0.95 : 0.88,
                        labelTint: active ? 0xfef08a : 0xe2e8f0,
                    };
                },
                () => {
                    const slotDeck = this.slotDecks[i] ?? null;
                    const active = slotDeck !== null && slotDeck.deckId === this.state.deckId;
                    return {
                        fillColor: active ? 0x2563eb : 0x1e293b,
                        fillAlpha: 0.98,
                        labelTint: 0xfef08a,
                    };
                }
            );

            this.deckSlotButtons.push({ index: i, body, label });
        }
    }

    private buildCategoryButtons (): void
    {
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

            const body = this.add.rectangle(x, y, width, height, 0x0f172a, 0.9)
                .setStrokeStyle(2, 0xffffff, 0.65)
                .setInteractive({ useHandCursor: true });

            const label = this.add.text(x, y, def.label).setFontSize(fontSize)
                .setOrigin(0.5)
                .setTint(0xffffff);

            body.on('pointerdown', () => {
                if (this.state.activeCategory === def.category) {
                    return;
                }

                this.state.activeCategory = def.category;
                this.state.pageIndex = 0;
                this.renderRows();
                this.updateSummaryText();
            });

            this.bindHoverHighlight(
                body,
                label,
                () => {
                    const active = this.state.activeCategory === def.category;
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

            this.categoryButtons.push({
                category: def.category,
                body,
                label,
            });
        }
    }

    private handleResetDeckButtonClick (): void
    {
        if (!this.state.deckId || this.busy) {
            return;
        }

        if (this.resetDeckConfirmTimer) {
            this.state.countsByCardId.clear();
            this.persistCurrentDeckDraft();
            this.refreshDeckSlotButtons();
            this.renderRows();
            this.updateSummaryText();
            this.hideDeckCardPreview();
            this.subtitle.setText(`Reset ${this.state.deckName.toUpperCase()} to 0 cards. Save to persist.`);
            this.disarmResetDeckConfirm();
            return;
        }

        this.resetDeckConfirmSecondsRemaining = DECK_BUILDER_TRANSFER_ICON_LAYOUT.resetConfirmWindowSeconds;
        this.resetHoverLabel.setVisible(false);
        this.resetIcon.setVisible(false);
        this.resetIcon.clearTint();
        this.resetLabel
            .setVisible(true)
            .setText(`${this.resetDeckConfirmSecondsRemaining}s`);
        this.subtitle.setText(`Click reset again within ${this.resetDeckConfirmSecondsRemaining}s to confirm.`);

        this.resetDeckConfirmTimer = this.time.addEvent({
            delay: 1000,
            loop: true,
            callback: () => {
                this.resetDeckConfirmSecondsRemaining = Math.max(0, this.resetDeckConfirmSecondsRemaining - 1);
                if (this.resetDeckConfirmSecondsRemaining <= 0) {
                    this.disarmResetDeckConfirm();
                    this.updateSummaryText();
                    return;
                }

                this.resetLabel.setText(`${this.resetDeckConfirmSecondsRemaining}s`);
            }
        });
    }

    private disarmResetDeckConfirm (): void
    {
        if (this.resetDeckConfirmTimer) {
            this.resetDeckConfirmTimer.remove(false);
            this.resetDeckConfirmTimer = null;
        }

        this.resetDeckConfirmSecondsRemaining = 0;
        this.resetHoverLabel.setVisible(false);
        this.resetLabel.setVisible(false).setText('');
        this.resetIcon.setVisible(true);
        this.resetIcon.clearTint();
    }

    private buildCharacterTypeButtons (): void
    {
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

            const body = this.add.rectangle(x, y, width, height, 0x0b1220, 0.88)
                .setStrokeStyle(2, 0xffffff, 0.5)
                .setInteractive({ useHandCursor: true });

            const label = this.add.text(x, y, def.label).setFontSize(fontSize)
                .setOrigin(0.5)
                .setTint(0xffffff);

            body.on('pointerdown', () => {
                if (this.state.activeCharacterCardType === def.cardType) {
                    return;
                }

                this.state.activeCharacterCardType = def.cardType;
                this.state.pageIndex = 0;
                this.renderRows();
                this.updateSummaryText();
            });

            this.bindHoverHighlight(
                body,
                label,
                () => {
                    const active = buttonCardType === this.state.activeCharacterCardType;
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
                () => this.state.activeCategory === 'character'
            );

            this.characterTypeButtons.push({
                cardType: def.cardType,
                body,
                label,
            });
        }
    }

    private buildRows (): void
    {
        const rowStartY = Math.round(GAME_HEIGHT * 0.33);
        const rowBottom = Math.round(GAME_HEIGHT * 0.77);
        const rowGap = Math.max(52, Math.floor((rowBottom - rowStartY) / Math.max(1, CARDS_PER_PAGE - 1)));

        for (let i = 0; i < CARDS_PER_PAGE; i += 1) {
            const y = rowStartY + (i * rowGap);
            const container = this.add.container(0, 0);

            const iconBody = this.add.rectangle(
                Math.round(GAME_CENTER_X - 260 * UI_SCALE),
                y,
                Math.round(56 * UI_SCALE),
                Math.round(56 * UI_SCALE),
                0x1e293b,
                0.95
            )
                .setStrokeStyle(2, 0xffffff, 0.7)
                .setInteractive({ useHandCursor: true });

            const iconLabel = this.add.text(iconBody.x, iconBody.y, '').setFontSize(Math.max(DECK_BUILDER_TEXT_LAYOUT.rowIconFontSizeMin, Math.round(DECK_BUILDER_TEXT_LAYOUT.rowIconFontSizeBase * UI_SCALE)))
                .setOrigin(0.5)
                .setTint(0xffffff)
                .setInteractive({ useHandCursor: true });

            const cardName = this.add.text(Math.round(GAME_CENTER_X - 190 * UI_SCALE), y, '').setFontSize(Math.max(DECK_BUILDER_TEXT_LAYOUT.rowCardNameFontSizeMin, Math.round(DECK_BUILDER_TEXT_LAYOUT.rowCardNameFontSizeBase * UI_SCALE)))
                .setOrigin(0, 0.5)
                .setTint(0xffffff);

            const countLabel = this.add.text(Math.round(GAME_CENTER_X + 148 * UI_SCALE), y, '0').setFontSize(Math.max(DECK_BUILDER_TEXT_LAYOUT.rowCountFontSizeMin, Math.round(DECK_BUILDER_TEXT_LAYOUT.rowCountFontSizeBase * UI_SCALE)))
                .setOrigin(0.5)
                .setTint(0xffffff);

            const plusButton = this.add.rectangle(
                Math.round(GAME_CENTER_X + 214 * UI_SCALE),
                y,
                Math.round(40 * UI_SCALE),
                Math.round(40 * UI_SCALE),
                0x0f766e,
                0.95
            )
                .setStrokeStyle(2, 0xffffff, 0.75)
                .setInteractive({ useHandCursor: true });

            const plusLabel = this.add.text(plusButton.x, plusButton.y, '+').setFontSize(Math.max(DECK_BUILDER_TEXT_LAYOUT.rowAdjustFontSizeMin, Math.round(DECK_BUILDER_TEXT_LAYOUT.rowAdjustFontSizeBase * UI_SCALE)))
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
                if (this.busy || !row.card) {
                    return;
                }
                this.tryAddCardToDeck(row.card);
            });

            this.bindHoverHighlight(
                plusButton,
                plusLabel,
                () => ({
                    fillColor: 0x0f766e,
                    fillAlpha: this.canAddCardToDeck(row.card) ? 0.95 : 0.45,
                    labelTint: 0xffffff,
                    labelAlpha: this.canAddCardToDeck(row.card) ? 1 : 0.45,
                }),
                () => ({
                    fillColor: 0x0d9488,
                    fillAlpha: 0.98,
                    labelTint: 0xfef08a,
                }),
                () => this.canAddCardToDeck(row.card)
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
                this.showDeckCardPreview(row.card, pointer);
            };

            iconBody.on('pointerdown', (pointer: Phaser.Input.Pointer) => {
                showPreview(pointer);
            });

            iconLabel.on('pointerdown', (pointer: Phaser.Input.Pointer) => {
                showPreview(pointer);
            });

            applyIconBaseStyle();

            this.rows.push(row);
        }
    }

    private buildCurrentDeckPanel (): void
    {
        const panelWidth = Math.round(DECK_BUILDER_CURRENT_DECK_PANEL_LAYOUT.panelWidthBase * UI_SCALE);
        const panelHeight = Math.round(DECK_BUILDER_CURRENT_DECK_PANEL_LAYOUT.panelHeightBase * UI_SCALE);
        const panelX = Math.round(GAME_WIDTH - (panelWidth * 0.5) - Math.round(DECK_BUILDER_CURRENT_DECK_PANEL_LAYOUT.rightInsetBase * UI_SCALE));
        const panelY = Math.round(GAME_HEIGHT * 0.5);

        this.currentDeckPanel = this.add.rectangle(panelX, panelY, panelWidth, panelHeight, 0x0f172a, 0.92)
            .setStrokeStyle(2, 0xffffff, 0.8)
            .setDepth(10);

        this.add.text(panelX, panelY - Math.round(panelHeight * 0.5) + Math.round(DECK_BUILDER_CURRENT_DECK_PANEL_LAYOUT.titleOffsetYBase * UI_SCALE), 'CURRENT DECK').setFontSize(Math.max(
                DECK_BUILDER_CURRENT_DECK_PREVIEW_TEXT_LAYOUT.titleFontSizeMin,
                Math.round(DECK_BUILDER_CURRENT_DECK_PREVIEW_TEXT_LAYOUT.titleFontSizeBase * UI_SCALE)
            ))
            .setOrigin(0.5)
            .setTint(0xffffff)
            .setDepth(11);

        this.currentDeckHint = this.add.text(panelX, panelY - Math.round(panelHeight * 0.5) + Math.round(DECK_BUILDER_CURRENT_DECK_PANEL_LAYOUT.hintOffsetYBase * UI_SCALE), '').setFontSize(Math.max(
                DECK_BUILDER_CURRENT_DECK_PREVIEW_TEXT_LAYOUT.hintFontSizeMin,
                Math.round(DECK_BUILDER_CURRENT_DECK_PREVIEW_TEXT_LAYOUT.hintFontSizeBase * UI_SCALE)
            ))
            .setOrigin(0.5)
            .setTint(0xcbd5e1)
            .setDepth(11);

        this.currentDeckCardObjects = [];
    }

    private clearCurrentDeckCardObjects (): void
    {
        for (const object of this.currentDeckCardObjects) {
            object.destroy();
        }
        this.currentDeckCardObjects = [];
    }

    private getCurrentDeckGroupedCards (): Array<{ category: CardCatalogCategory; cards: CardCatalogEntry[] }>
    {
        const categoryOrder: CardCatalogCategory[] = ['character', 'item', 'supporter', 'stadium', 'tool', 'status_effect'];
        const cardsByCategory = new Map<CardCatalogCategory, CardCatalogEntry[]>();

        for (const category of categoryOrder) {
            cardsByCategory.set(category, []);
        }

        for (const [cardId, count] of this.state.countsByCardId.entries()) {
            if (count <= 0) {
                continue;
            }

            const card = CARD_BY_ID.get(cardId);
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
    }

    private getCategoryColor (category: CardCatalogCategory): number
    {
        return DECK_BUILDER_CATEGORY_FILL_COLORS[category] ?? DECK_BUILDER_CATEGORY_FILL_COLORS.item;
    }

    private renderCurrentDeckPanel (): void
    {
        this.clearCurrentDeckCardObjects();

        const grouped = this.getCurrentDeckGroupedCards();
        const totalCards = this.collectCards().length;
        this.currentDeckHint.setText(totalCards > 0 ? `Click a card to preview (${totalCards}/${DECK_REQUIRED_CARD_COUNT})` : '(EMPTY DECK)');

        const panelLeft = this.currentDeckPanel.x - Math.round(this.currentDeckPanel.width * 0.5) + Math.round(DECK_BUILDER_CURRENT_DECK_PANEL_LAYOUT.innerPaddingXBase * UI_SCALE);
        const panelRight = this.currentDeckPanel.x + Math.round(this.currentDeckPanel.width * 0.5) - Math.round(DECK_BUILDER_CURRENT_DECK_PANEL_LAYOUT.innerPaddingXBase * UI_SCALE);
        const panelBottom = this.currentDeckPanel.y + Math.round(this.currentDeckPanel.height * 0.5) - Math.round(DECK_BUILDER_CURRENT_DECK_PANEL_LAYOUT.bottomPaddingBase * UI_SCALE);

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

        let cursorY = this.currentDeckHint.y + Math.round(DECK_BUILDER_CURRENT_DECK_PANEL_LAYOUT.listTopOffsetBase * UI_SCALE);

        if (grouped.length === 0) {
            const empty = this.add.text(this.currentDeckPanel.x, cursorY + Math.round(DECK_BUILDER_CURRENT_DECK_PANEL_LAYOUT.emptyOffsetYBase * UI_SCALE), 'ADD CARDS USING +').setFontSize(Math.max(
                    DECK_BUILDER_CURRENT_DECK_PREVIEW_TEXT_LAYOUT.emptyStateFontSizeMin,
                    Math.round(DECK_BUILDER_CURRENT_DECK_PREVIEW_TEXT_LAYOUT.emptyStateFontSizeBase * UI_SCALE)
                ))
                .setOrigin(0.5)
                .setTint(0x94a3b8)
                .setDepth(11);

            this.currentDeckCardObjects.push(empty);
            return;
        }

        for (const group of grouped) {
            if (cursorY >= panelBottom) {
                break;
            }

            const sectionTitle = this.add.text(panelLeft, cursorY, this.getCategoryLabel(group.category)).setFontSize(headerFontSize)
                .setOrigin(0, 0.5)
                .setTint(0xf8fafc)
                .setDepth(11);
            this.currentDeckCardObjects.push(sectionTitle);

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

                const body = this.add.rectangle(
                    x,
                    y,
                    tileWidth,
                    tileHeight,
                    this.getCategoryColor(card.category),
                    0.95
                )
                    .setStrokeStyle(2, 0xffffff, 0.82)
                    .setDepth(11)
                    .setInteractive({ useHandCursor: true });

                const icon = this.add.text(x, y - Math.round(tileHeight * DECK_BUILDER_CURRENT_DECK_PANEL_LAYOUT.iconOffsetYRatio), card.iconFallback).setFontSize(iconFontSize)
                    .setOrigin(0.5)
                    .setTint(0xffffff)
                    .setDepth(12)
                    .setInteractive({ useHandCursor: true });

                const name = this.add.text(x - Math.round(tileWidth * DECK_BUILDER_CURRENT_DECK_PANEL_LAYOUT.nameOffsetXRatio), y + Math.round(tileHeight * DECK_BUILDER_CURRENT_DECK_PANEL_LAYOUT.nameOffsetYRatio), '').setFontSize(nameFontSize)
                    .setOrigin(0, 0.5)
                    .setTint(0xf8fafc)
                    .setDepth(12)
                    .setInteractive({ useHandCursor: true });

                const tileNameMaxWidth = Math.round(tileWidth * DECK_BUILDER_CURRENT_DECK_PANEL_LAYOUT.tileNameMaxWidthRatio);
                const tileNameFit = fitTextToMultiLine({
                    scene: this,
                    text: card.label.toUpperCase(),
                    preferredSize: nameFontSize,
                    minSize: Math.max(7, Math.round(nameFontSize * 0.7)),
                    maxWidth: Math.max(10, tileNameMaxWidth),
                    maxLines: 3
                });
                name.setText(tileNameFit.text);
                name.setFontSize(tileNameFit.fontSize);

                const removeButton = this.add.rectangle(
                    x + Math.round(tileWidth * DECK_BUILDER_CURRENT_DECK_PANEL_LAYOUT.countBadgeOffsetXRatio),
                    y + Math.round(tileHeight * DECK_BUILDER_CURRENT_DECK_PANEL_LAYOUT.countBadgeOffsetYRatio),
                    Math.round(DECK_BUILDER_CURRENT_DECK_PANEL_LAYOUT.countBadgeWidthBase * UI_SCALE),
                    Math.round(DECK_BUILDER_CURRENT_DECK_PANEL_LAYOUT.countBadgeHeightBase * UI_SCALE),
                    0x020617,
                    0.95
                )
                    .setStrokeStyle(1, 0xffffff, 0.85)
                    .setDepth(12)
                    .setInteractive({ useHandCursor: true });

                const removeText = this.add.text(removeButton.x, removeButton.y, '-').setFontSize(removeFontSize)
                    .setOrigin(0.5)
                    .setTint(0xffffff)
                    .setDepth(13)
                    .setInteractive({ useHandCursor: true });

                const openPreview = (pointer?: Phaser.Input.Pointer) => {
                    this.showDeckCardPreview(card, pointer);
                };

                const applyTileBaseStyle = (): void => {
                    body.setFillStyle(this.getCategoryColor(card.category), 0.95);
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
                    this.tryRemoveCardFromDeck(card);
                });

                removeText.on('pointerdown', () => {
                    this.tryRemoveCardFromDeck(card);
                });

                this.bindHoverHighlight(
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

                this.currentDeckCardObjects.push(body, icon, name, removeButton, removeText);
            }

            cursorY += (sectionRows * (tileHeight + tileGapY)) + sectionGap;
        }
    }

    private buildDeckPreviewPanel (): void
    {
        const xRatio = GAME_WIDTH / BASE_WIDTH;
        const yRatio = GAME_HEIGHT / BASE_HEIGHT;
        this.deckPreviewObjectWidth = Math.round(CARD_BASE_WIDTH * xRatio * BOARD_SCALE);
        this.deckPreviewObjectHeight = Math.round(CARD_BASE_HEIGHT * yRatio * BOARD_SCALE);

        this.deckCardPreviewController = new CardPreviewController(this);
        this.deckCardPreviewController.create(this.deckPreviewObjectWidth, this.deckPreviewObjectHeight, { side: 'left' });
    }

    private mapCatalogCategoryToCardType (category: CardCatalogCategory): CardType
    {
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
    }

    private mapCatalogCardTypeToAVGECardType (card: CardCatalogEntry): 'NONE' | 'WW' | 'PERC' | 'PIANO' | 'STRING' | 'GUITAR' | 'CHOIR' | 'BRASS'
    {
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
    }

    private createPreviewProxyCard (card: CardCatalogEntry): Card
    {
        const proxy = new Card(this, {
            id: `deck_builder_preview_${card.id}_${Date.now()}`,
            cardType: this.mapCatalogCategoryToCardType(card.category),
            AVGECardType: this.mapCatalogCardTypeToAVGECardType(card),
            AVGECardClass: card.id,
            statusEffect: {},
            ownerId: 'p1',
            x: -10000,
            y: -10000,
            width: this.deckPreviewObjectWidth,
            height: this.deckPreviewObjectHeight,
            color: this.getCategoryColor(card.category),
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
    }

    private showDeckCardPreview (card: CardCatalogEntry, pointer?: Phaser.Input.Pointer): void
    {
        if (this.deckPreviewProxyCard) {
            this.deckPreviewProxyCard.destroy();
            this.deckPreviewProxyCard = null;
        }

        this.deckPreviewProxyCard = this.createPreviewProxyCard(card);
        this.deckCardPreviewController.show(this.deckPreviewProxyCard, {
            ownerUsername: 'Deck Builder',
            forceFaceUp: true,
            hideOwnerLine: true
        });

        if (pointer) {
            this.deckPreviewSuppressOutsideClose = true;
            this.time.delayedCall(0, () => {
                this.deckPreviewSuppressOutsideClose = false;
            });
        }
    }

    private hideDeckCardPreview (): void
    {
        this.deckPreviewSuppressOutsideClose = false;
        this.deckCardPreviewController.hide();
        if (this.deckPreviewProxyCard) {
            this.deckPreviewProxyCard.destroy();
            this.deckPreviewProxyCard = null;
        }
    }

    private isPointerInsideDeckPreview (pointer: Phaser.Input.Pointer): boolean
    {
        return this.deckCardPreviewController.containsPoint(pointer.worldX, pointer.worldY);
    }

    private handleGlobalPointerDown (pointer: Phaser.Input.Pointer): void
    {
        if (!this.deckCardPreviewController.isVisible() || this.deckPreviewSuppressOutsideClose) {
            return;
        }

        if (this.isPointerInsideDeckPreview(pointer)) {
            return;
        }

        this.hideDeckCardPreview();
    }

    private handleGlobalGameObjectDown (_pointer: Phaser.Input.Pointer, gameObject: Phaser.GameObjects.GameObject): void
    {
        if (!this.resetDeckConfirmTimer) {
            return;
        }

        if (gameObject === this.resetButton) {
            return;
        }

        this.disarmResetDeckConfirm();
        this.updateSummaryText();
    }

    private buildSearchMenu (): void
    {
        const panelWidth = Math.round(620 * UI_SCALE);
        const panelHeight = Math.round(540 * UI_SCALE);
        const panelX = GAME_CENTER_X;
        const panelY = Math.round(GAME_HEIGHT * 0.5);
        const panelTop = panelY - Math.round(panelHeight * 0.5);

        this.searchBackdrop = this.add.rectangle(
            GAME_CENTER_X,
            Math.round(GAME_HEIGHT * 0.5),
            GAME_WIDTH,
            GAME_HEIGHT,
            0x020617,
            0.75
        )
            .setDepth(1200)
            .setInteractive({ useHandCursor: true });

        this.searchPanel = this.add.rectangle(
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

        this.searchTitle = this.add.text(panelX, panelTop + Math.round(30 * UI_SCALE), 'CARD SEARCH').setFontSize(Math.max(DECK_BUILDER_TEXT_LAYOUT.searchTitleFontSizeMin, Math.round(DECK_BUILDER_TEXT_LAYOUT.searchTitleFontSizeBase * UI_SCALE)))
            .setOrigin(0.5)
            .setTint(0xffffff)
            .setDepth(1202);

        this.searchHint = this.add.text(panelX, panelTop + Math.round(58 * UI_SCALE), 'Type to search all cards. Enter = add first result. Esc = close.').setFontSize(Math.max(DECK_BUILDER_TEXT_LAYOUT.searchHintFontSizeMin, Math.round(DECK_BUILDER_TEXT_LAYOUT.searchHintFontSizeBase * UI_SCALE)))
            .setOrigin(0.5)
            .setTint(0xcbd5e1)
            .setDepth(1202);

        this.searchQueryLabel = this.add.text(panelX - Math.round(panelWidth * 0.5) + Math.round(22 * UI_SCALE), panelTop + Math.round(88 * UI_SCALE), '').setFontSize(Math.max(DECK_BUILDER_TEXT_LAYOUT.searchQueryFontSizeMin, Math.round(DECK_BUILDER_TEXT_LAYOUT.searchQueryFontSizeBase * UI_SCALE)))
            .setOrigin(0, 0.5)
            .setTint(0xf8fafc)
            .setDepth(1202);

        this.searchSaveButton = this.add.rectangle(
            panelX + Math.round(panelWidth * 0.5) - Math.round(214 * UI_SCALE),
            panelTop + Math.round(88 * UI_SCALE),
            Math.round(82 * UI_SCALE),
            Math.round(34 * UI_SCALE),
            0x14532d,
            0.95
        )
            .setStrokeStyle(2, 0xffffff, 0.75)
            .setDepth(1202)
            .setInteractive({ useHandCursor: true });

        this.searchSaveLabel = this.add.text(this.searchSaveButton.x, this.searchSaveButton.y, 'SAVE').setFontSize(Math.max(DECK_BUILDER_TEXT_LAYOUT.searchButtonFontSizeMin, Math.round(DECK_BUILDER_TEXT_LAYOUT.searchButtonFontSizeBase * UI_SCALE)))
            .setOrigin(0.5)
            .setTint(0xffffff)
            .setDepth(1203);

        this.searchClearButton = this.add.rectangle(
            panelX + Math.round(panelWidth * 0.5) - Math.round(124 * UI_SCALE),
            panelTop + Math.round(88 * UI_SCALE),
            Math.round(86 * UI_SCALE),
            Math.round(34 * UI_SCALE),
            0x334155,
            0.95
        )
            .setStrokeStyle(2, 0xffffff, 0.75)
            .setDepth(1202)
            .setInteractive({ useHandCursor: true });

        this.searchClearLabel = this.add.text(this.searchClearButton.x, this.searchClearButton.y, 'CLEAR').setFontSize(Math.max(DECK_BUILDER_TEXT_LAYOUT.searchButtonFontSizeMin, Math.round(DECK_BUILDER_TEXT_LAYOUT.searchButtonFontSizeBase * UI_SCALE)))
            .setOrigin(0.5)
            .setTint(0xffffff)
            .setDepth(1203);

        this.searchCloseButton = this.add.rectangle(
            panelX + Math.round(panelWidth * 0.5) - Math.round(42 * UI_SCALE),
            panelTop + Math.round(88 * UI_SCALE),
            Math.round(62 * UI_SCALE),
            Math.round(34 * UI_SCALE),
            0x7f1d1d,
            0.95
        )
            .setStrokeStyle(2, 0xffffff, 0.75)
            .setDepth(1202)
            .setInteractive({ useHandCursor: true });

        this.searchCloseLabel = this.add.text(this.searchCloseButton.x, this.searchCloseButton.y, 'CLOSE').setFontSize(Math.max(DECK_BUILDER_TEXT_LAYOUT.searchButtonFontSizeMin, Math.round(DECK_BUILDER_TEXT_LAYOUT.searchButtonFontSizeBase * UI_SCALE)))
            .setOrigin(0.5)
            .setTint(0xffffff)
            .setDepth(1203);

        const rowsStartY = panelTop + Math.round(132 * UI_SCALE);
        const rowsBottomY = panelTop + Math.round(458 * UI_SCALE);
        const rowGap = Math.max(38, Math.floor((rowsBottomY - rowsStartY) / Math.max(1, SEARCH_RESULTS_PER_PAGE - 1)));

        const nameX = panelX - Math.round(panelWidth * 0.5) + Math.round(26 * UI_SCALE);
        const countX = panelX + Math.round(panelWidth * 0.5) - Math.round(98 * UI_SCALE);
        const plusX = panelX + Math.round(panelWidth * 0.5) - Math.round(36 * UI_SCALE);

        for (let i = 0; i < SEARCH_RESULTS_PER_PAGE; i += 1) {
            const y = rowsStartY + (i * rowGap);
            const container = this.add.container(0, 0).setDepth(1202);

            const rowBackground = this.add.rectangle(
                panelX,
                y,
                panelWidth - Math.round(28 * UI_SCALE),
                Math.round(36 * UI_SCALE),
                0x1e293b,
                0.45
            )
                .setStrokeStyle(1, 0xffffff, 0.18)
                .setDepth(1202);

            const cardName = this.add.text(nameX, y - Math.round(7 * UI_SCALE), '').setFontSize(Math.max(DECK_BUILDER_TEXT_LAYOUT.searchRowNameFontSizeMin, Math.round(DECK_BUILDER_TEXT_LAYOUT.searchRowNameFontSizeBase * UI_SCALE)))
                .setOrigin(0, 0.5)
                .setTint(0xffffff)
                .setDepth(1203);

            const cardMeta = this.add.text(nameX, y + Math.round(9 * UI_SCALE), '').setFontSize(Math.max(DECK_BUILDER_TEXT_LAYOUT.searchRowMetaFontSizeMin, Math.round(DECK_BUILDER_TEXT_LAYOUT.searchRowMetaFontSizeBase * UI_SCALE)))
                .setOrigin(0, 0.5)
                .setTint(0xcbd5e1)
                .setDepth(1203);

            const countLabel = this.add.text(countX, y, '0').setFontSize(Math.max(DECK_BUILDER_TEXT_LAYOUT.searchRowCountFontSizeMin, Math.round(DECK_BUILDER_TEXT_LAYOUT.searchRowCountFontSizeBase * UI_SCALE)))
                .setOrigin(0.5)
                .setTint(0xffffff)
                .setDepth(1204);

            const plusButton = this.add.rectangle(
                plusX,
                y,
                Math.round(36 * UI_SCALE),
                Math.round(30 * UI_SCALE),
                0x0f766e,
                0.95
            )
                .setStrokeStyle(2, 0xffffff, 0.75)
                .setDepth(1203)
                .setInteractive({ useHandCursor: true });

            const plusLabel = this.add.text(plusButton.x, plusButton.y, '+').setFontSize(Math.max(DECK_BUILDER_TEXT_LAYOUT.searchRowAdjustFontSizeMin, Math.round(DECK_BUILDER_TEXT_LAYOUT.searchRowAdjustFontSizeBase * UI_SCALE)))
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
                if (this.busy || !row.card) {
                    return;
                }
                this.tryAddCardToDeck(row.card);
            });

            this.bindHoverHighlight(
                plusButton,
                plusLabel,
                () => ({
                    fillColor: 0x0f766e,
                    fillAlpha: this.canAddCardToDeck(row.card) ? 0.95 : 0.45,
                    labelTint: 0xffffff,
                    labelAlpha: this.canAddCardToDeck(row.card) ? 1 : 0.45,
                }),
                () => ({ fillColor: 0x0d9488, fillAlpha: 0.98, labelTint: 0xfef08a }),
                () => this.canAddCardToDeck(row.card)
            );

            this.searchRows.push(row);
        }

        this.searchPrevButton = this.add.rectangle(
            panelX - Math.round(96 * UI_SCALE),
            panelTop + Math.round(500 * UI_SCALE),
            Math.round(92 * UI_SCALE),
            Math.round(36 * UI_SCALE),
            0x0f172a,
            0.95
        )
            .setStrokeStyle(2, 0xffffff, 0.75)
            .setDepth(1202)
            .setInteractive({ useHandCursor: true });

        this.searchPrevLabel = this.add.text(this.searchPrevButton.x, this.searchPrevButton.y, 'PREV').setFontSize(Math.max(DECK_BUILDER_TEXT_LAYOUT.searchPagerFontSizeMin, Math.round(DECK_BUILDER_TEXT_LAYOUT.searchPagerFontSizeBase * UI_SCALE)))
            .setOrigin(0.5)
            .setTint(0xffffff)
            .setDepth(1203);

        this.searchNextButton = this.add.rectangle(
            panelX + Math.round(96 * UI_SCALE),
            panelTop + Math.round(500 * UI_SCALE),
            Math.round(92 * UI_SCALE),
            Math.round(36 * UI_SCALE),
            0x0f172a,
            0.95
        )
            .setStrokeStyle(2, 0xffffff, 0.75)
            .setDepth(1202)
            .setInteractive({ useHandCursor: true });

        this.searchNextLabel = this.add.text(this.searchNextButton.x, this.searchNextButton.y, 'NEXT').setFontSize(Math.max(DECK_BUILDER_TEXT_LAYOUT.searchPagerFontSizeMin, Math.round(DECK_BUILDER_TEXT_LAYOUT.searchPagerFontSizeBase * UI_SCALE)))
            .setOrigin(0.5)
            .setTint(0xffffff)
            .setDepth(1203);

        this.bindHoverHighlight(
            this.searchSaveButton,
            this.searchSaveLabel,
            () => ({ fillColor: 0x14532d, fillAlpha: 0.95, labelTint: 0xffffff }),
            () => ({ fillColor: 0x166534, fillAlpha: 0.98, labelTint: 0xfef08a })
        );

        this.bindHoverHighlight(
            this.searchClearButton,
            this.searchClearLabel,
            () => ({ fillColor: 0x334155, fillAlpha: 0.95, labelTint: 0xffffff }),
            () => ({ fillColor: 0x475569, fillAlpha: 0.98, labelTint: 0xfef08a })
        );

        this.bindHoverHighlight(
            this.searchCloseButton,
            this.searchCloseLabel,
            () => ({ fillColor: 0x7f1d1d, fillAlpha: 0.95, labelTint: 0xffffff }),
            () => ({ fillColor: 0x991b1b, fillAlpha: 0.98, labelTint: 0xfef08a })
        );

        this.bindHoverHighlight(
            this.searchPrevButton,
            this.searchPrevLabel,
            () => ({
                fillColor: 0x0f172a,
                fillAlpha: this.searchPageIndex > 0 ? 0.95 : 0.45,
                labelTint: 0xffffff,
                labelAlpha: this.searchPageIndex > 0 ? 1 : 0.45,
            }),
            () => ({ fillColor: 0x1e293b, fillAlpha: 0.98, labelTint: 0xfef08a }),
            () => this.searchPageIndex > 0
        );

        this.bindHoverHighlight(
            this.searchNextButton,
            this.searchNextLabel,
            () => {
                const hasNext = this.searchPageIndex < Math.max(0, Math.ceil(this.getSearchFilteredCards().length / SEARCH_RESULTS_PER_PAGE) - 1);
                return {
                    fillColor: 0x0f172a,
                    fillAlpha: hasNext ? 0.95 : 0.45,
                    labelTint: 0xffffff,
                    labelAlpha: hasNext ? 1 : 0.45,
                };
            },
            () => ({ fillColor: 0x1e293b, fillAlpha: 0.98, labelTint: 0xfef08a }),
            () => this.searchPageIndex < Math.max(0, Math.ceil(this.getSearchFilteredCards().length / SEARCH_RESULTS_PER_PAGE) - 1)
        );

        this.searchBackdrop.on('pointerdown', () => {
            this.toggleSearchMenu(false);
        });

        this.searchCloseButton.on('pointerdown', () => {
            this.toggleSearchMenu(false);
        });

        this.searchSaveButton.on('pointerdown', () => {
            void this.saveDeck();
        });

        this.searchClearButton.on('pointerdown', () => {
            this.searchQuery = '';
            this.searchPageIndex = 0;
            this.renderSearchMenu();
        });

        this.searchPrevButton.on('pointerdown', () => {
            if (this.searchPageIndex <= 0) {
                return;
            }
            this.searchPageIndex -= 1;
            this.renderSearchMenu();
        });

        this.searchNextButton.on('pointerdown', () => {
            const maxPage = Math.max(0, Math.ceil(this.getSearchFilteredCards().length / SEARCH_RESULTS_PER_PAGE) - 1);
            if (this.searchPageIndex >= maxPage) {
                return;
            }
            this.searchPageIndex += 1;
            this.renderSearchMenu();
        });

        this.searchMenuObjects = [
            this.searchBackdrop,
            this.searchPanel,
            this.searchTitle,
            this.searchHint,
            this.searchQueryLabel,
            this.searchSaveButton,
            this.searchSaveLabel,
            this.searchCloseButton,
            this.searchCloseLabel,
            this.searchClearButton,
            this.searchClearLabel,
            this.searchPrevButton,
            this.searchPrevLabel,
            this.searchNextButton,
            this.searchNextLabel,
            ...this.searchRows.flatMap((row) => [
                row.container,
                row.cardName,
                row.cardMeta,
                row.countLabel,
                row.plusButton,
                row.plusLabel,
            ]),
        ];
    }

    private setSearchMenuVisible (visible: boolean): void
    {
        for (const object of this.searchMenuObjects) {
            object.setVisible(visible);
            const maybeInput = object as Phaser.GameObjects.GameObject & { input?: { enabled: boolean } };
            if (maybeInput.input) {
                maybeInput.input.enabled = visible;
            }
        }

        this.searchMenuVisible = visible;
        this.searchButton.setFillStyle(visible ? 0x1e293b : 0x0f172a, 0.95);
    }

    private toggleSearchMenu (visible: boolean): void
    {
        if (visible === this.searchMenuVisible) {
            return;
        }

        if (visible) {
            this.searchPageIndex = 0;
            this.renderSearchMenu();
        }

        this.setSearchMenuVisible(visible);
    }

    private handleSearchKeydown (event: KeyboardEvent): void
    {
        if (!this.searchMenuVisible) {
            return;
        }

        if (event.key === 'Escape') {
            this.toggleSearchMenu(false);
            return;
        }

        if (event.key === 'Enter') {
            const results = this.getSearchFilteredCards();
            const firstVisible = results[this.searchPageIndex * SEARCH_RESULTS_PER_PAGE] ?? null;
            if (firstVisible) {
                this.tryAddCardToDeck(firstVisible);
            }
            return;
        }

        if (event.key === 'Backspace') {
            event.preventDefault();
            if (this.searchQuery.length === 0) {
                return;
            }
            this.searchQuery = this.searchQuery.slice(0, -1);
            this.searchPageIndex = 0;
            this.renderSearchMenu();
            return;
        }

        if (event.key === 'Delete') {
            this.searchQuery = '';
            this.searchPageIndex = 0;
            this.renderSearchMenu();
            return;
        }

        if (event.ctrlKey || event.metaKey || event.altKey || event.key.length !== 1) {
            return;
        }

        if (this.searchQuery.length >= 48) {
            return;
        }

        this.searchQuery += event.key;
        this.searchPageIndex = 0;
        this.renderSearchMenu();
    }

    private getSearchFilteredCards (): CardCatalogEntry[]
    {
        const sorted = [...CARD_CATALOG].sort((a, b) => a.label.localeCompare(b.label));
        const query = this.searchQuery.trim().toLowerCase();
        if (query.length === 0) {
            return sorted;
        }

        return sorted.filter((card) => {
            const haystack = `${card.label} ${card.id} ${card.category} ${card.cardType ?? ''}`.toLowerCase();
            return haystack.includes(query);
        });
    }

    private renderSearchMenu (): void
    {
        if (this.searchRows.length === 0) {
            return;
        }

        const filteredCards = this.getSearchFilteredCards();
        const maxPage = Math.max(1, Math.ceil(filteredCards.length / SEARCH_RESULTS_PER_PAGE));
        if (this.searchPageIndex > (maxPage - 1)) {
            this.searchPageIndex = maxPage - 1;
        }

        const startIndex = this.searchPageIndex * SEARCH_RESULTS_PER_PAGE;
        for (let i = 0; i < this.searchRows.length; i += 1) {
            const row = this.searchRows[i];
            const card = filteredCards[startIndex + i] ?? null;
            row.card = card;

            if (!card) {
                row.container.setVisible(false);
                continue;
            }

            row.container.setVisible(true);
            row.cardName.setText(card.label.toUpperCase());
            const categoryLabel = this.getCategoryLabel(card.category);
            const typeLabel = card.cardType ? ` ${card.cardType.toUpperCase()}` : '';
            row.cardMeta.setText(`${categoryLabel}${typeLabel}`);

            const count = this.state.countsByCardId.get(card.id) ?? 0;
            row.countLabel.setText(String(count));

            const canAdd = this.canAddCardToDeck(card);
            row.plusButton.setFillStyle(0x0f766e, canAdd ? 0.95 : 0.45);
            row.plusLabel.setTint(0xffffff);
            row.plusLabel.setAlpha(canAdd ? 1 : 0.45);
        }

        this.searchQueryLabel.setText(`QUERY: ${this.searchQuery || '(ALL CARDS)'}`);

        const hasPrevPage = this.searchPageIndex > 0;
        const hasNextPage = this.searchPageIndex < (maxPage - 1);
        this.searchPrevButton.setAlpha(hasPrevPage ? 1 : 0.45);
        this.searchPrevLabel.setAlpha(hasPrevPage ? 1 : 0.45);
        this.searchNextButton.setAlpha(hasNextPage ? 1 : 0.45);
        this.searchNextLabel.setAlpha(hasNextPage ? 1 : 0.45);
    }

    private tryAddCardToDeck (card: CardCatalogEntry): boolean
    {
        if (this.busy) {
            return false;
        }

        const totalCards = this.collectCards().length;
        if (totalCards >= DECK_REQUIRED_CARD_COUNT) {
            this.subtitle.setText(`Deck must contain exactly ${DECK_REQUIRED_CARD_COUNT} cards.`);
            return false;
        }

        const current = this.state.countsByCardId.get(card.id) ?? 0;
        const maxCopies = this.getMaxCopiesForCard(card);
        if (current >= maxCopies) {
            this.subtitle.setText(
                maxCopies === DECK_MAX_ITEM_OR_TOOL_COPIES
                    ? `${card.label.toUpperCase()} max copies: ${DECK_MAX_ITEM_OR_TOOL_COPIES}.`
                    : `${card.label.toUpperCase()} max copies: ${DECK_MAX_OTHER_COPIES}.`
            );
            return false;
        }

        this.state.countsByCardId.set(card.id, current + 1);
        this.persistCurrentDeckDraft();
        this.refreshDeckSlotButtons();
        this.renderRows();
        this.updateSummaryText();
        return true;
    }

    private tryRemoveCardFromDeck (card: CardCatalogEntry): boolean
    {
        if (this.busy) {
            return false;
        }

        const current = this.state.countsByCardId.get(card.id) ?? 0;
        if (current <= 0) {
            return false;
        }

        if (current === 1) {
            this.state.countsByCardId.delete(card.id);
        }
        else {
            this.state.countsByCardId.set(card.id, current - 1);
        }

        this.persistCurrentDeckDraft();
        this.refreshDeckSlotButtons();
        this.renderRows();
        this.updateSummaryText();
        return true;
    }

    private async loadDeck (): Promise<void>
    {
        this.busy = true;
        this.subtitle.setText('Loading deck...');

        const sessionId = this.getStoredSessionId();
        if (!sessionId) {
            this.scene.start('Login');
            return;
        }

        const result = await fetchUserDecks(sessionId);
        if (!result.ok) {
            this.busy = false;
            if (isSessionSupersededError(result)) {
                this.stopAuthSessionPush();
                clearClientSessionState();
                this.scene.start('Login');
                return;
            }
            this.subtitle.setText(result.error ?? 'Failed to load decks.');
            this.renderRows();
            return;
        }

        this.slotDecks = await this.ensureFixedDeckSlots(sessionId, result.decks ?? []);
        this.draftByDeckId.clear();
        for (const deck of this.slotDecks) {
            if (!deck) {
                continue;
            }
            this.draftByDeckId.set(deck.deckId, {
                deckId: deck.deckId,
                deckName: deck.name,
                cards: [...deck.cards],
                dirty: false,
            });
        }
        const selectedFromResult = typeof result.selectedDeckId === 'string'
            ? this.slotDecks.find((deck) => deck?.deckId === result.selectedDeckId) as UserDeck | undefined
            : undefined;
        const isNewUser = (result.decks ?? []).length === 0;
        let selectedDeck = selectedFromResult
            ?? (isNewUser
                ? (this.slotDecks[0] as UserDeck | null)
                : ((this.slotDecks.find((deck) => deck !== null) as UserDeck | undefined) ?? null));

        if (selectedDeck && result.selectedDeckId !== selectedDeck.deckId) {
            await selectUserDeck(selectedDeck.deckId, sessionId);
        }

        this.activeDeckId = selectedDeck?.deckId ?? null;

        if (selectedDeck) {
            this.applyDeck(selectedDeck);
        }
        else {
            this.state.deckId = null;
            this.state.deckName = 'My Deck';
            this.state.countsByCardId.clear();
        }

        this.busy = false;
        this.refreshDeckSlotButtons();
        this.renderRows();
        this.updateSummaryText();
    }

    private startAuthSessionPush (sessionId: string): void
    {
        this.stopAuthSessionPush();
        this.authSessionUnsubscribe = subscribeToRouterSessionEvents(sessionId, ({ reason, message }) => {
            if (reason !== 'session_superseded') {
                return;
            }

            this.stopAuthSessionPush();
            clearClientSessionState();
            this.scene.start('Login', {
                systemMessage: typeof message === 'string' && message.trim().length > 0
                    ? message
                    : 'Signed out: account opened on another client.'
            });
        });
    }

    private stopAuthSessionPush (): void
    {
        if (!this.authSessionUnsubscribe) {
            return;
        }

        this.authSessionUnsubscribe();
        this.authSessionUnsubscribe = null;
    }

    private async ensureFixedDeckSlots (sessionId: string, decks: UserDeck[]): Promise<Array<UserDeck | null>>
    {
        const byId = new Map<string, UserDeck>();
        for (const deck of decks) {
            byId.set(deck.deckId, deck);
        }

        const slotIds = this.readDeckSlotIds(sessionId);
        const usedDeckIds = new Set<string>();
        const slots: Array<UserDeck | null> = new Array<UserDeck | null>(FIXED_DECK_SLOT_COUNT).fill(null);

        for (let i = 0; i < FIXED_DECK_SLOT_COUNT; i += 1) {
            const slotId = slotIds[i];
            if (!slotId) {
                continue;
            }
            const existing = byId.get(slotId);
            if (!existing) {
                continue;
            }

            slots[i] = existing;
            usedDeckIds.add(existing.deckId);
        }

        const unassigned = decks.filter((deck) => !usedDeckIds.has(deck.deckId));
        for (let i = 0; i < FIXED_DECK_SLOT_COUNT; i += 1) {
            if (slots[i] !== null) {
                continue;
            }
            const fallbackDeck = unassigned.shift() ?? null;
            if (!fallbackDeck) {
                continue;
            }
            slots[i] = fallbackDeck;
            usedDeckIds.add(fallbackDeck.deckId);
        }

        for (let i = 0; i < FIXED_DECK_SLOT_COUNT; i += 1) {
            if (slots[i] !== null) {
                continue;
            }

            const created = await createUserDeck(this.defaultDeckName(i), [], sessionId);
            if (created.ok && created.deck) {
                slots[i] = created.deck;
                byId.set(created.deck.deckId, created.deck);
            }
        }

        this.writeDeckSlotIds(sessionId, slots.map((deck) => deck?.deckId ?? null));
        return slots;
    }

    private readDeckSlotIds (sessionId: string): Array<string | null>
    {
        if (typeof window === 'undefined') {
            return [];
        }

        const key = `${DECK_SLOT_IDS_STORAGE_KEY}:${sessionId}`;
        const raw = window.localStorage.getItem(key);
        if (!raw) {
            return [];
        }

        try {
            const parsed = JSON.parse(raw) as unknown;
            if (!Array.isArray(parsed)) {
                return [];
            }
            return parsed.map((item) => (typeof item === 'string' && item.trim().length > 0 ? item.trim() : null));
        }
        catch {
            return [];
        }
    }

    private writeDeckSlotIds (sessionId: string, deckIds: Array<string | null>): void
    {
        if (typeof window === 'undefined') {
            return;
        }

        const key = `${DECK_SLOT_IDS_STORAGE_KEY}:${sessionId}`;
        window.localStorage.setItem(key, JSON.stringify(deckIds.slice(0, FIXED_DECK_SLOT_COUNT)));
    }

    private defaultDeckName (index: number): string
    {
        return `DECK-${index + 1}`;
    }

    private refreshDeckSlotButtons (): void
    {
        for (const button of this.deckSlotButtons) {
            const deck = this.slotDecks[button.index] ?? null;
            const draft = deck ? this.draftByDeckId.get(deck.deckId) : undefined;
            const draftCards = draft?.cards ?? deck?.cards ?? [];
            const name = (draft?.deckName ?? deck?.name ?? this.defaultDeckName(button.index)).toUpperCase();
            const dirtyMarker = draft?.dirty ? '*' : '';
            button.label.setText(`${name}${dirtyMarker} (${draftCards.length})`);

            const active = deck !== null && deck.deckId === this.state.deckId;
            button.body.setFillStyle(active ? 0x1d4ed8 : 0x0b1220, active ? 0.95 : 0.88);
            button.label.setTint(active ? 0xfef08a : 0xe2e8f0);
        }

        this.positionDeckTransferButtons();
    }

    private positionDeckTransferButtons (): void
    {
        if (!this.resetButton || !this.exportButton || !this.importButton || this.deckSlotButtons.length === 0) {
            return;
        }

        const activeSlot = this.deckSlotButtons.find((button) => {
            const slotDeck = this.slotDecks[button.index] ?? null;
            return slotDeck !== null && slotDeck.deckId === this.state.deckId;
        }) ?? this.deckSlotButtons[0];

        const buttonSize = Math.round(DECK_BUILDER_TRANSFER_ICON_LAYOUT.buttonSizeBase * UI_SCALE);
        const buttonGapX = Math.round(DECK_BUILDER_TRANSFER_ICON_LAYOUT.buttonGapXBase * UI_SCALE);
        const buttonOffsetX = Math.round(DECK_BUILDER_TRANSFER_ICON_LAYOUT.buttonOffsetXBase * UI_SCALE);
        const hoverLabelOffsetY = Math.round(DECK_BUILDER_TRANSFER_ICON_LAYOUT.hoverLabelOffsetYBase * UI_SCALE);
        const hoverLabelSize = Math.max(
            DECK_BUILDER_TRANSFER_ICON_LAYOUT.hoverLabelFontSizeMin,
            Math.round(DECK_BUILDER_TRANSFER_ICON_LAYOUT.hoverLabelFontSizeBase * UI_SCALE)
        );

        const slotLeftX = activeSlot.body.x - Math.round(activeSlot.body.width * 0.5);
        const importX = slotLeftX - buttonOffsetX - Math.round(buttonSize * 0.5);
        const exportX = importX - buttonSize - buttonGapX;
        const resetX = exportX - buttonSize - buttonGapX;
        const buttonsY = activeSlot.body.y;

        this.resetButton.setPosition(resetX, buttonsY);
        this.resetIcon.setPosition(resetX, buttonsY);
        this.resetLabel
            .setPosition(resetX, buttonsY)
            .setFontSize(Math.max(
                DECK_BUILDER_TRANSFER_ICON_LAYOUT.resetCountdownFontSizeMin,
                Math.round(DECK_BUILDER_TRANSFER_ICON_LAYOUT.resetCountdownFontSizeBase * UI_SCALE)
            ));
        this.resetHoverLabel
            .setPosition(resetX, buttonsY - hoverLabelOffsetY)
            .setFontSize(hoverLabelSize);

        this.exportButton.setPosition(exportX, buttonsY);
        this.exportIcon.setPosition(exportX, buttonsY);
        this.exportLabel
            .setPosition(exportX, buttonsY - hoverLabelOffsetY)
            .setFontSize(hoverLabelSize);

        this.importButton.setPosition(importX, buttonsY);
        this.importIcon.setPosition(importX, buttonsY);
        this.importLabel
            .setPosition(importX, buttonsY - hoverLabelOffsetY)
            .setFontSize(hoverLabelSize);
    }

    private renameCurrentDeck (): void
    {
        if (!this.state.deckId || this.busy) {
            return;
        }

        if (typeof window === 'undefined' || typeof window.prompt !== 'function') {
            return;
        }

        const input = window.prompt('Rename this deck', this.state.deckName);
        if (typeof input !== 'string') {
            return;
        }

        const nextName = input.trim().slice(0, 64);
        if (!nextName) {
            this.subtitle.setText('Deck name cannot be empty.');
            return;
        }

        this.state.deckName = nextName;
        this.persistCurrentDeckDraft();
        this.refreshDeckSlotButtons();
        this.updateSummaryText();
    }

    private exportCurrentDeckShare (): void
    {
        if (!this.state.deckId || this.busy) {
            return;
        }

        if (typeof window === 'undefined' || typeof window.prompt !== 'function') {
            return;
        }

        const cards = this.collectCards();
        const encoded = encodeDeckShareHex(cards);
        if (!encoded.ok) {
            this.subtitle.setText(encoded.message);
            return;
        }

        window.prompt('Deck share code (hex). Copy and save this value:', encoded.shareHex);
        this.subtitle.setText(`Exported ${encoded.cardCount} cards to deck share hex.`);
    }

    private importDeckShare (): void
    {
        if (!this.state.deckId || this.busy) {
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
            this.subtitle.setText(`Import failed: ${decoded.message}`);
            return;
        }

        const validationError = this.validateDeckCards(decoded.cardIds);
        if (validationError) {
            this.subtitle.setText(`Import failed: ${validationError}`);
            return;
        }

        const shouldOverwrite = window.confirm(`Overwrite current draft with ${decoded.cardCount} imported cards?`);
        if (!shouldOverwrite) {
            this.subtitle.setText('Deck import canceled.');
            return;
        }

        this.state.countsByCardId.clear();
        for (const cardId of decoded.cardIds) {
            const current = this.state.countsByCardId.get(cardId) ?? 0;
            this.state.countsByCardId.set(cardId, current + 1);
        }

        this.persistCurrentDeckDraft();
        this.refreshDeckSlotButtons();
        this.renderRows();
        this.updateSummaryText();
        this.subtitle.setText(`Imported ${decoded.cardCount} cards into ${this.state.deckName.toUpperCase()}. Save to persist.`);
    }

    private async selectDeckSlot (index: number): Promise<void>
    {
        if (this.busy) {
            return;
        }

        let deck = this.slotDecks[index] ?? null;
        if (!deck) {
            const sessionId = this.getStoredSessionId();
            if (!sessionId) {
                this.scene.start('Login');
                return;
            }

            this.busy = true;
            this.subtitle.setText(`Creating ${this.defaultDeckName(index)}...`);
            const created = await createUserDeck(this.defaultDeckName(index), [], sessionId);
            this.busy = false;
            if (!created.ok || !created.deck) {
                this.subtitle.setText(created.error ?? 'Failed to create deck slot.');
                this.renderRows();
                return;
            }

            deck = created.deck;
            this.slotDecks[index] = deck;
            this.draftByDeckId.set(deck.deckId, {
                deckId: deck.deckId,
                deckName: deck.name,
                cards: [...deck.cards],
                dirty: false,
            });
            this.writeDeckSlotIds(sessionId, this.slotDecks.map((slotDeck) => slotDeck?.deckId ?? null));
        }

        const switchingDeck = this.state.deckId !== deck.deckId;
        if (switchingDeck) {
            this.persistCurrentDeckDraft();
            this.applyDeckFromDraftOrDeck(deck);
            this.state.pageIndex = 0;
        }

        const sessionId = this.getStoredSessionId();
        if (!sessionId) {
            this.scene.start('Login');
            return;
        }

        this.busy = true;
        const selectResult = await selectUserDeck(deck.deckId, sessionId);
        this.busy = false;
        if (!selectResult.ok) {
            this.subtitle.setText(selectResult.error ?? 'Failed to set active deck.');
            this.renderRows();
            return;
        }

        this.activeDeckId = deck.deckId;

        this.refreshDeckSlotButtons();
        this.renderRows();
        this.updateSummaryText();
    }

    private applyDeck (deck: UserDeck): void
    {
        this.state.deckId = deck.deckId;
        this.state.deckName = deck.name;
        this.state.countsByCardId.clear();
        for (const cardId of deck.cards) {
            const current = this.state.countsByCardId.get(cardId) ?? 0;
            this.state.countsByCardId.set(cardId, current + 1);
        }
    }

    private applyDeckFromDraftOrDeck (deck: UserDeck): void
    {
        const draft = this.draftByDeckId.get(deck.deckId);
        this.state.deckId = deck.deckId;
        this.state.deckName = draft?.deckName ?? deck.name;
        this.state.countsByCardId.clear();

        const cards = draft?.cards ?? deck.cards;
        for (const cardId of cards) {
            const current = this.state.countsByCardId.get(cardId) ?? 0;
            this.state.countsByCardId.set(cardId, current + 1);
        }
    }

    private persistCurrentDeckDraft (): void
    {
        if (!this.state.deckId) {
            return;
        }

        const cards = this.collectCards();
        const existing = this.draftByDeckId.get(this.state.deckId);
        const dirty = existing?.dirty === true || existing?.deckName !== this.state.deckName || !this.areCardListsEqual(existing.cards, cards);

        this.draftByDeckId.set(this.state.deckId, {
            deckId: this.state.deckId,
            deckName: this.state.deckName,
            cards,
            dirty,
        });
    }

    private areCardListsEqual (a: string[] | undefined, b: string[]): boolean
    {
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
    }

    private renderRows (): void
    {
        const activeCards = this.getActiveCategoryCards();
        const maxPage = Math.max(1, Math.ceil(activeCards.length / CARDS_PER_PAGE));
        if (this.state.pageIndex > (maxPage - 1)) {
            this.state.pageIndex = maxPage - 1;
        }

        const offset = this.state.pageIndex * CARDS_PER_PAGE;
        for (let i = 0; i < this.rows.length; i += 1) {
            const card = activeCards[offset + i] ?? null;
            const row = this.rows[i];
            row.card = card;

            if (!card) {
                row.container.setVisible(false);
                continue;
            }

            row.container.setVisible(true);
            row.cardName.setText(card.label.toUpperCase());

            // Icon abstraction: if/when card.iconKey assets are loaded, swap this text fallback for sprite rendering.
            row.iconLabel.setText(card.iconFallback);

            const count = this.state.countsByCardId.get(card.id) ?? 0;
            row.countLabel.setText(String(count));

            const canAdd = this.canAddCardToDeck(card);
            row.plusButton.setFillStyle(0x0f766e, canAdd ? 0.95 : 0.45);
            row.plusLabel.setTint(0xffffff);
            row.plusLabel.setAlpha(canAdd ? 1 : 0.45);
        }

        for (const button of this.categoryButtons) {
            const active = button.category === this.state.activeCategory;
            button.body.setFillStyle(active ? 0x0f766e : 0x0f172a, active ? 0.95 : 0.9);
            button.label.setTint(active ? 0xfef08a : 0xffffff);
        }

        const showCharacterTypes = this.state.activeCategory === 'character';
        for (const button of this.characterTypeButtons) {
            button.body.setVisible(showCharacterTypes);
            button.label.setVisible(showCharacterTypes);
            if (!showCharacterTypes) {
                continue;
            }

            const active = button.cardType === this.state.activeCharacterCardType;
            button.body.setFillStyle(active ? 0x1d4ed8 : 0x0b1220, active ? 0.95 : 0.88);
            button.label.setTint(active ? 0xfef08a : 0xffffff);
        }

        this.pageIndicator.setText(`Page ${this.state.pageIndex + 1}/${maxPage}`);

        this.renderCurrentDeckPanel();

        if (this.searchMenuVisible) {
            this.renderSearchMenu();
        }
    }

    private getActiveCategoryCards (): CardCatalogEntry[]
    {
        const categoryCards = CARD_CATALOG
            .filter((card) => card.category === this.state.activeCategory)
            .sort((a, b) => a.label.localeCompare(b.label));
        if (this.state.activeCategory !== 'character') {
            return categoryCards;
        }

        if (this.state.activeCharacterCardType === 'all') {
            return categoryCards;
        }

        return categoryCards
            .filter((card) => card.cardType === this.state.activeCharacterCardType)
            .sort((a, b) => a.label.localeCompare(b.label));
    }

    private getActiveCategoryLabel (): string
    {
        const base = this.getCategoryLabel(this.state.activeCategory);
        if (this.state.activeCategory !== 'character') {
            return base;
        }

        if (this.state.activeCharacterCardType === 'all') {
            return base;
        }

        return `${base} ${this.state.activeCharacterCardType.toUpperCase()}`;
    }

    private getCategoryLabel (category: CardCatalogCategory): string
    {
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
    }

    private collectCards (): string[]
    {
        const cards: string[] = [];
        for (const [cardId, count] of this.state.countsByCardId.entries()) {
            for (let i = 0; i < count; i += 1) {
                cards.push(cardId);
            }
        }
        return cards;
    }

    private canAddCardToDeck (card: CardCatalogEntry | null): boolean
    {
        if (!card) {
            return false;
        }

        const count = this.state.countsByCardId.get(card.id) ?? 0;
        const maxCopies = this.getMaxCopiesForCard(card);
        const totalCards = this.collectCards().length;
        return count < maxCopies && totalCards < DECK_REQUIRED_CARD_COUNT;
    }

    private applyButtonStyle (
        button: GameObjects.Rectangle,
        label: GameObjects.Text | null | undefined,
        style: DeckBuilderButtonStyle
    ): void
    {
        button.setFillStyle(style.fillColor, style.fillAlpha);
        if (!label) {
            return;
        }

        if (typeof style.labelTint === 'number') {
            label.setTint(style.labelTint);
        }

        if (typeof style.labelAlpha === 'number') {
            label.setAlpha(style.labelAlpha);
        }
    }

    private bindHoverHighlight (
        button: GameObjects.Rectangle,
        label: GameObjects.Text | null | undefined,
        getBaseStyle: () => DeckBuilderButtonStyle,
        getHoverStyle: () => DeckBuilderButtonStyle,
        isEnabled?: () => boolean
    ): void
    {
        const applyBaseStyle = (): void => {
            this.applyButtonStyle(button, label, getBaseStyle());
        };

        button.on('pointerover', () => {
            if (isEnabled && !isEnabled()) {
                applyBaseStyle();
                return;
            }

            this.applyButtonStyle(button, label, getHoverStyle());
        });

        button.on('pointerout', () => {
            applyBaseStyle();
        });

        applyBaseStyle();
    }

    private getMaxCopiesForCard (card: CardCatalogEntry): number
    {
        return card.category === 'item' || card.category === 'tool'
            ? DECK_MAX_ITEM_OR_TOOL_COPIES
            : DECK_MAX_OTHER_COPIES;
    }

    private validateDeckCards (cards: string[]): string | null
    {
        if (cards.length > DECK_REQUIRED_CARD_COUNT) {
            return `Deck cannot exceed ${DECK_REQUIRED_CARD_COUNT} cards.`;
        }

        const countByCardId = new Map<string, number>();
        for (const cardId of cards) {
            const card = CARD_BY_ID.get(cardId);
            if (!card) {
                return `Unknown card in deck: ${cardId}`;
            }

            const nextCount = (countByCardId.get(cardId) ?? 0) + 1;
            const maxCopies = this.getMaxCopiesForCard(card);
            if (nextCount > maxCopies) {
                return maxCopies === DECK_MAX_ITEM_OR_TOOL_COPIES
                    ? `${card.label.toUpperCase()} exceeds max copies (${DECK_MAX_ITEM_OR_TOOL_COPIES}) for item/tool cards.`
                    : `${card.label.toUpperCase()} exceeds max copies (${DECK_MAX_OTHER_COPIES}).`;
            }

            countByCardId.set(cardId, nextCount);
        }

        return null;
    }

    private async saveDeck (): Promise<void>
    {
        if (this.busy) {
            return;
        }

        const sessionId = this.getStoredSessionId();
        if (!sessionId) {
            this.scene.start('Login');
            return;
        }

        this.busy = true;
        this.subtitle.setText('Saving all deck changes...');

        this.persistCurrentDeckDraft();
        const dirtyDrafts = [...this.draftByDeckId.values()].filter((draft) => draft.dirty);

        for (const draft of dirtyDrafts) {
            const validationError = this.validateDeckCards(draft.cards);
            if (validationError) {
                this.busy = false;
                this.subtitle.setText(`${draft.deckName.toUpperCase()}: ${validationError}`);
                return;
            }
        }

        for (const draft of dirtyDrafts) {
            const updateResult = await updateUserDeck(draft.deckId, draft.deckName, draft.cards, sessionId);
            if (!updateResult.ok || !updateResult.deck) {
                this.busy = false;
                this.subtitle.setText(updateResult.error ?? `Failed to update ${draft.deckName}.`);
                return;
            }

            this.replaceSlotDeck(updateResult.deck);
            this.draftByDeckId.set(updateResult.deck.deckId, {
                deckId: updateResult.deck.deckId,
                deckName: updateResult.deck.name,
                cards: [...updateResult.deck.cards],
                dirty: false,
            });
        }

        const activeDeckId = this.activeDeckId ?? this.state.deckId;
        const selectResult = activeDeckId ? await selectUserDeck(activeDeckId, sessionId) : { ok: true };
        this.busy = false;
        if (!selectResult.ok) {
            this.subtitle.setText(selectResult.error ?? 'Failed to select deck.');
            return;
        }

        this.activeDeckId = activeDeckId;

        this.refreshDeckSlotButtons();
        this.subtitle.setText('All deck changes saved.');
        this.renderRows();
        this.updateSummaryText();
    }

    private replaceSlotDeck (deck: UserDeck): void
    {
        for (let i = 0; i < this.slotDecks.length; i += 1) {
            const slotDeck = this.slotDecks[i];
            if (slotDeck?.deckId === deck.deckId || slotDeck?.name.toUpperCase() === deck.name.toUpperCase()) {
                this.slotDecks[i] = deck;
                return;
            }
        }
    }

    private updateSummaryText (): void
    {
        const total = this.collectCards().length;
        const categoryCount = this.getActiveCategoryCards().length;
        this.subtitle.setText(`${this.state.deckName.toUpperCase()} - ${total} CARDS (${categoryCount} ${this.getActiveCategoryLabel()})`);
    }

    private getStoredSessionId (): string | null
    {
        if (typeof window === 'undefined') {
            return null;
        }

        const raw = window.sessionStorage.getItem(ROUTER_SESSION_ID_STORAGE_KEY);
        if (typeof raw !== 'string' || raw.trim().length === 0) {
            return null;
        }

        return raw.trim();
    }
}
