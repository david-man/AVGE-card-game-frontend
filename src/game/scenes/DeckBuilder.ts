import { Scene, GameObjects } from 'phaser';
import {
    CARD_VISUALS,
    DECK_BUILDER_TRANSFER_ICON_ASSETS,
    DECK_BUILDER_TRANSFER_ICON_LAYOUT,
    DECK_BUILDER_TEXT_LAYOUT,
    GAME_CENTER_X,
    GAME_HEIGHT,
    UI_SCALE
} from '../config';
import { CARD_CATALOG, CardCatalogEntry, CardCatalogCategory, CharacterCardType } from '../data/cardCatalog';
import { Card, CardType } from '../entities';
import {
    clearClientSessionState,
    fetchUserDecks,
    isSessionSupersededError,
    selectUserDeck,
    UserDeck,
} from '../Network';
import { setImageToSceneCover } from '../ui/backgroundCover';
import { CardPreviewController } from '../ui/CardPreviewController';
import { registerUiClickSoundForScene } from '../ui/clickSfx';
import { createVolumeControlForScene, preloadVolumeControlAssets } from '../ui/volumeControl';
import {
    canAddCardToDeck as sceneCanAddCardToDeck,
    collectCards as sceneCollectCards,
    getActiveCategoryCards as sceneGetActiveCategoryCards,
    getCategoryColor as sceneGetCategoryColor,
    getCategoryLabel as sceneGetCategoryLabel,
    getCurrentDeckGroupedCards as sceneGetCurrentDeckGroupedCards,
    getMaxCopiesForCard as sceneGetMaxCopiesForCard,
    validateDeckCards as sceneValidateDeckCards,
} from '../deck-builder/deckBuilderRules';
import {
    getSearchFilteredCards as sceneGetSearchFilteredCards,
    handleSearchKeydown as sceneHandleSearchKeydown,
    renderSearchMenu as sceneRenderSearchMenu,
    setSearchMenuVisible as sceneSetSearchMenuVisible,
    toggleSearchMenu as sceneToggleSearchMenu,
} from '../deck-builder/deckBuilderSearch';
import {
    buildCurrentDeckPanel as sceneBuildCurrentDeckPanel,
    renderCurrentDeckPanelContents as sceneRenderCurrentDeckPanelContents,
} from '../deck-builder/deckBuilderCurrentDeckPanel';
import {
    buildDeckPreviewPanel as sceneBuildDeckPreviewPanel,
    createPreviewProxyCard as sceneCreatePreviewProxyCard,
    handleGlobalPointerDown as sceneHandleGlobalPointerDown,
    hideDeckCardPreview as sceneHideDeckCardPreview,
    isPointerInsideDeckPreview as sceneIsPointerInsideDeckPreview,
    mapCatalogCardTypeToAVGECardType as sceneMapCatalogCardTypeToAVGECardType,
    mapCatalogCategoryToCardType as sceneMapCatalogCategoryToCardType,
    showDeckCardPreview as sceneShowDeckCardPreview,
} from '../deck-builder/deckBuilderPreview';
import {
    applyConfirmedDeckReset as sceneApplyConfirmedDeckReset,
    armResetDeckConfirm as sceneArmResetDeckConfirm,
    disarmResetDeckConfirm as sceneDisarmResetDeckConfirm,
    shouldDisarmResetConfirmOnGameObjectDown as sceneShouldDisarmResetConfirmOnGameObjectDown,
} from '../deck-builder/deckBuilderResetConfirm';
import {
    buildCategoryButtons as sceneBuildCategoryButtons,
    buildCharacterTypeButtons as sceneBuildCharacterTypeButtons,
    buildDeckSlotButtons as sceneBuildDeckSlotButtons,
    buildRows as sceneBuildRows,
    buildSearchMenu as sceneBuildSearchMenu,
} from '../deck-builder/deckBuilderUiBuild';
import {
    applyButtonStyle as sceneApplyButtonStyle,
    bindHoverHighlight as sceneBindHoverHighlight,
} from '../deck-builder/deckBuilderButtonStyle';
import {
    renderRows as sceneRenderRows,
    tryAddCardToDeck as sceneTryAddCardToDeck,
    tryRemoveCardFromDeck as sceneTryRemoveCardFromDeck,
} from '../deck-builder/deckBuilderRowsRender';
import {
    positionDeckTransferButtons as scenePositionDeckTransferButtons,
    refreshDeckSlotButtons as sceneRefreshDeckSlotButtons,
    updateSummaryText as sceneUpdateSummaryText,
} from '../deck-builder/deckBuilderSlotUiState';
import {
    defaultDeckName as sceneDefaultDeckName,
    ensureFixedDeckSlots as sceneEnsureFixedDeckSlots,
    getStoredSessionId as sceneGetStoredSessionId,
    readDeckSlotIds as sceneReadDeckSlotIds,
    startAuthSessionPush as sceneStartAuthSessionPush,
    stopAuthSessionPush as sceneStopAuthSessionPush,
    writeDeckSlotIds as sceneWriteDeckSlotIds,
} from '../deck-builder/deckBuilderSessionSlots';
import {
    applyDeck as sceneApplyDeck,
    applyDeckFromDraftOrDeck as sceneApplyDeckFromDraftOrDeck,
    areCardListsEqual as sceneAreCardListsEqual,
    persistCurrentDeckDraft as scenePersistCurrentDeckDraft,
    replaceSlotDeck as sceneReplaceSlotDeck,
    selectDeckSlot as sceneSelectDeckSlot,
} from '../deck-builder/deckBuilderDraftLifecycle';
import {
    exportCurrentDeckShare as sceneExportCurrentDeckShare,
    importDeckShare as sceneImportDeckShare,
    renameCurrentDeck as sceneRenameCurrentDeck,
    runPromptActionAfterClickSfx as sceneRunPromptActionAfterClickSfx,
} from '../deck-builder/deckBuilderTransferActions';
import { saveDeck as sceneSaveDeck } from '../deck-builder/deckBuilderSaveFlow';

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
    renameButton: GameObjects.Rectangle;
    renameIcon: GameObjects.Image;
    renameLabel: GameObjects.Text;
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
    public rows: Array<{
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
    public authSessionUnsubscribe: (() => void) | null;
    private draftByDeckId: Map<string, DeckDraft>;
    public activeDeckId: string | null;
    private searchMenuVisible: boolean;
    public searchQuery: string;
    public searchPageIndex: number;
    public searchMenuObjects: Array<GameObjects.Rectangle | GameObjects.Text | Phaser.GameObjects.Container>;
    public searchBackdrop: GameObjects.Rectangle;
    public searchPanel: GameObjects.Rectangle;
    public searchTitle: GameObjects.Text;
    public searchHint: GameObjects.Text;
    public searchQueryLabel: GameObjects.Text;
    public searchSaveButton: GameObjects.Rectangle;
    public searchSaveLabel: GameObjects.Text;
    public searchCloseButton: GameObjects.Rectangle;
    public searchCloseLabel: GameObjects.Text;
    public searchClearButton: GameObjects.Rectangle;
    public searchClearLabel: GameObjects.Text;
    public searchPrevButton: GameObjects.Rectangle;
    public searchPrevLabel: GameObjects.Text;
    public searchNextButton: GameObjects.Rectangle;
    public searchNextLabel: GameObjects.Text;
    public searchRows: Array<{
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
    private resetDeckConfirmTimer: Phaser.Time.TimerEvent | null;
    public resetDeckConfirmSecondsRemaining: number;

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
        this.resetDeckConfirmTimer = null;
        this.resetDeckConfirmSecondsRemaining = 0;
    }

    preload (): void
    {
        this.load.setPath('assets');
        this.load.image('background', 'background/background_element.png');
        this.load.image(CARD_VISUALS.faceDownTextureKey, CARD_VISUALS.faceDownTexturePath);
        this.load.image(DECK_BUILDER_TRANSFER_ICON_ASSETS.renameKey, DECK_BUILDER_TRANSFER_ICON_ASSETS.renamePath);
        this.load.image(DECK_BUILDER_TRANSFER_ICON_ASSETS.exportKey, DECK_BUILDER_TRANSFER_ICON_ASSETS.exportPath);
        this.load.image(DECK_BUILDER_TRANSFER_ICON_ASSETS.importKey, DECK_BUILDER_TRANSFER_ICON_ASSETS.importPath);
        this.load.image(DECK_BUILDER_TRANSFER_ICON_ASSETS.resetKey, DECK_BUILDER_TRANSFER_ICON_ASSETS.resetPath);
        preloadVolumeControlAssets(this);
    }

    create (): void
    {
        registerUiClickSoundForScene(this);
        createVolumeControlForScene(this);

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

        this.background = this.add.image(0, 0, 'background');
        setImageToSceneCover(this, this.background);
        this.background.setAlpha(1);

        this.title = this.add.text(GAME_CENTER_X, Math.round(GAME_HEIGHT * 0.09), 'DECK BUILDER').setFontSize(Math.max(DECK_BUILDER_TEXT_LAYOUT.titleFontSizeMin, Math.round(DECK_BUILDER_TEXT_LAYOUT.titleFontSizeBase * UI_SCALE)))
            .setOrigin(0.5)
            .setTint(0xffffff);

        this.subtitle = this.add.text(GAME_CENTER_X, Math.round(GAME_HEIGHT * 0.15), 'Loading deck...').setFontSize(Math.max(DECK_BUILDER_TEXT_LAYOUT.subtitleFontSizeMin, Math.round(DECK_BUILDER_TEXT_LAYOUT.subtitleFontSizeBase * UI_SCALE)))
            .setOrigin(0.5)
            .setTint(0xe2e8f0);

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

        this.renameButton = this.add.rectangle(
            Math.round(GAME_CENTER_X + 58 * UI_SCALE),
            Math.round(GAME_HEIGHT * 0.93),
            Math.round(DECK_BUILDER_TRANSFER_ICON_LAYOUT.buttonSizeBase * UI_SCALE),
            Math.round(DECK_BUILDER_TRANSFER_ICON_LAYOUT.buttonSizeBase * UI_SCALE),
            0x1f2937,
            0.95
        )
            .setStrokeStyle(2, 0xffffff, 0.75)
            .setInteractive({ useHandCursor: true });

        this.renameIcon = this.add.image(this.renameButton.x, this.renameButton.y, DECK_BUILDER_TRANSFER_ICON_ASSETS.renameKey)
            .setDepth(this.renameButton.depth + 1);

        this.renameLabel = this.add.text(this.renameButton.x, this.renameButton.y, 'Rename').setFontSize(Math.max(DECK_BUILDER_TEXT_LAYOUT.actionFontSizeMin, Math.round(DECK_BUILDER_TEXT_LAYOUT.actionFontSizeBase * UI_SCALE)))
            .setOrigin(0.5)
            .setTint(0xfef08a)
            .setDepth(this.renameButton.depth + 2)
            .setVisible(false);

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
            0x1d4ed8,
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
        this.renameIcon.setDisplaySize(iconMaxSize, iconMaxSize);
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
            this.renameButton,
            null,
            () => ({ fillColor: 0x1f2937, fillAlpha: 0.95 }),
            () => ({ fillColor: 0x334155, fillAlpha: 0.98 })
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
            () => ({ fillColor: 0x1d4ed8, fillAlpha: 0.95, labelTint: 0xffffff }),
            () => ({ fillColor: 0x2563eb, fillAlpha: 0.98, labelTint: 0xfef08a })
        );

        this.bindHoverHighlight(
            this.importButton,
            null,
            () => ({ fillColor: 0x78350f, fillAlpha: 0.95, labelTint: 0xffffff }),
            () => ({ fillColor: 0x92400e, fillAlpha: 0.98, labelTint: 0xfef08a })
        );

        this.renameButton.on('pointerover', () => {
            this.renameIcon.setTint(0xfef08a);
            this.renameLabel.setVisible(true);
        });
        this.renameButton.on('pointerout', () => {
            this.renameIcon.clearTint();
            this.renameLabel.setVisible(false);
        });

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

        this.renameButton.on('pointerdown', () => {
            this.runPromptActionAfterClickSfx(() => {
                this.renameCurrentDeck();
            });
        });

        this.resetButton.on('pointerdown', () => {
            this.handleResetDeckButtonClick();
        });

        this.exportButton.on('pointerdown', () => {
            this.runPromptActionAfterClickSfx(() => {
                this.exportCurrentDeckShare();
            });
        });

        this.importButton.on('pointerdown', () => {
            this.runPromptActionAfterClickSfx(() => {
                this.importDeckShare();
            });
        });

        this.searchButton.on('pointerdown', () => {
            this.toggleSearchMenu(!this.searchMenuVisible);
        });

        this.backButton.on('pointerdown', () => {
            this.scene.start('MainMenu');
        });

        void this.loadDeck();

        this.keyboardKeydownHandler = (event: KeyboardEvent) => {
            this.handleKeydown(event);
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

    private runPromptActionAfterClickSfx (action: () => void): void
    {
        sceneRunPromptActionAfterClickSfx(this, action);
    }

    private buildDeckSlotButtons (): void
    {
        sceneBuildDeckSlotButtons(this, FIXED_DECK_SLOT_COUNT);
    }

    private buildCategoryButtons (): void
    {
        sceneBuildCategoryButtons(this);
    }

    private handleResetDeckButtonClick (): void
    {
        if (!this.state.deckId || this.busy) {
            return;
        }

        if (this.resetDeckConfirmTimer) {
            sceneApplyConfirmedDeckReset(this);
            this.disarmResetDeckConfirm();
            return;
        }

        this.resetDeckConfirmTimer = sceneArmResetDeckConfirm(
            this,
            DECK_BUILDER_TRANSFER_ICON_LAYOUT.resetConfirmWindowSeconds,
            () => {
                this.disarmResetDeckConfirm();
                this.updateSummaryText();
            }
        );
    }

    private disarmResetDeckConfirm (): void
    {
        sceneDisarmResetDeckConfirm(this);
    }

    private buildCharacterTypeButtons (): void
    {
        sceneBuildCharacterTypeButtons(this);
    }

    private buildRows (): void
    {
        sceneBuildRows(this, CARDS_PER_PAGE);
    }

    private buildCurrentDeckPanel (): void
    {
        const { panel, hint } = sceneBuildCurrentDeckPanel(this);
        this.currentDeckPanel = panel;
        this.currentDeckHint = hint;
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
        return sceneGetCurrentDeckGroupedCards(this, CARD_BY_ID);
    }

    private getCategoryColor (category: CardCatalogCategory): number
    {
        return sceneGetCategoryColor(category);
    }

    public renderCurrentDeckPanel (): void
    {
        this.clearCurrentDeckCardObjects();

        const grouped = this.getCurrentDeckGroupedCards();
        this.currentDeckCardObjects = sceneRenderCurrentDeckPanelContents(
            this,
            this.currentDeckPanel,
            this.currentDeckHint,
            grouped,
            DECK_REQUIRED_CARD_COUNT,
            (category) => this.getCategoryLabel(category),
            (category) => this.getCategoryColor(category)
        );
    }

    private buildDeckPreviewPanel (): void
    {
        const { previewObjectWidth, previewObjectHeight, previewController } = sceneBuildDeckPreviewPanel(this);
        this.deckPreviewObjectWidth = previewObjectWidth;
        this.deckPreviewObjectHeight = previewObjectHeight;
        this.deckCardPreviewController = previewController;
    }

    private mapCatalogCategoryToCardType (category: CardCatalogCategory): CardType
    {
        return sceneMapCatalogCategoryToCardType(category);
    }

    private mapCatalogCardTypeToAVGECardType (card: CardCatalogEntry): 'NONE' | 'WW' | 'PERC' | 'PIANO' | 'STRING' | 'GUITAR' | 'CHOIR' | 'BRASS'
    {
        return sceneMapCatalogCardTypeToAVGECardType(card);
    }

    private createPreviewProxyCard (card: CardCatalogEntry): Card
    {
        return sceneCreatePreviewProxyCard(
            this,
            card,
            this.deckPreviewObjectWidth,
            this.deckPreviewObjectHeight,
            this.getCategoryColor(card.category),
            (category) => this.mapCatalogCategoryToCardType(category),
            (entry) => this.mapCatalogCardTypeToAVGECardType(entry)
        );
    }

    public showDeckCardPreview (card: CardCatalogEntry, pointer?: Phaser.Input.Pointer): void
    {
        this.deckPreviewProxyCard = sceneShowDeckCardPreview(
            this,
            card,
            this.deckPreviewProxyCard,
            (entry) => this.createPreviewProxyCard(entry),
            this.deckCardPreviewController,
            pointer,
            (value) => {
                this.deckPreviewSuppressOutsideClose = value;
            }
        );
    }

    private hideDeckCardPreview (): void
    {
        this.deckPreviewSuppressOutsideClose = false;
        this.deckPreviewProxyCard = sceneHideDeckCardPreview(this.deckCardPreviewController, this.deckPreviewProxyCard);
    }

    private isPointerInsideDeckPreview (pointer: Phaser.Input.Pointer): boolean
    {
        return sceneIsPointerInsideDeckPreview(this.deckCardPreviewController, pointer);
    }

    private handleGlobalPointerDown (pointer: Phaser.Input.Pointer): void
    {
        sceneHandleGlobalPointerDown(
            this.deckCardPreviewController,
            this.deckPreviewSuppressOutsideClose,
            this.isPointerInsideDeckPreview(pointer),
            () => this.hideDeckCardPreview()
        );
    }

    private handleGlobalGameObjectDown (_pointer: Phaser.Input.Pointer, gameObject: Phaser.GameObjects.GameObject): void
    {
        if (!this.resetDeckConfirmTimer) {
            return;
        }

        if (!sceneShouldDisarmResetConfirmOnGameObjectDown(this, gameObject)) {
            return;
        }

        this.disarmResetDeckConfirm();
        this.updateSummaryText();
    }

    private buildSearchMenu (): void
    {
        sceneBuildSearchMenu(this, SEARCH_RESULTS_PER_PAGE);
    }

    private setSearchMenuVisible (visible: boolean): void
    {
        sceneSetSearchMenuVisible(this, visible);
    }

    private toggleSearchMenu (visible: boolean): void
    {
        sceneToggleSearchMenu(this, visible, SEARCH_RESULTS_PER_PAGE, CARD_CATALOG);
    }

    private handleSearchKeydown (event: KeyboardEvent): void
    {
        sceneHandleSearchKeydown(this, event, SEARCH_RESULTS_PER_PAGE, CARD_CATALOG);
    }

    private handleKeydown (event: KeyboardEvent): void
    {
        const isSaveShortcut = (event.ctrlKey || event.metaKey) && event.key.toLowerCase() === 's';
        if (isSaveShortcut) {
            event.preventDefault();
            if (!event.repeat) {
                void this.saveDeck();
            }
            return;
        }

        this.handleSearchKeydown(event);
    }

    public getSearchFilteredCards (): CardCatalogEntry[]
    {
        return sceneGetSearchFilteredCards(this, CARD_CATALOG);
    }

    private renderSearchMenu (): void
    {
        sceneRenderSearchMenu(this, SEARCH_RESULTS_PER_PAGE, CARD_CATALOG);
    }

    public tryAddCardToDeck (card: CardCatalogEntry): boolean
    {
        return sceneTryAddCardToDeck(
            this,
            card,
            DECK_REQUIRED_CARD_COUNT,
            DECK_MAX_ITEM_OR_TOOL_COPIES,
            DECK_MAX_OTHER_COPIES
        );
    }

    public tryRemoveCardFromDeck (card: CardCatalogEntry): boolean
    {
        return sceneTryRemoveCardFromDeck(this, card);
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
        sceneStartAuthSessionPush(this, sessionId);
    }

    private stopAuthSessionPush (): void
    {
        sceneStopAuthSessionPush(this);
    }

    private async ensureFixedDeckSlots (sessionId: string, decks: UserDeck[]): Promise<Array<UserDeck | null>>
    {
        return sceneEnsureFixedDeckSlots(
            sessionId,
            decks,
            FIXED_DECK_SLOT_COUNT,
            DECK_SLOT_IDS_STORAGE_KEY
        );
    }

    public readDeckSlotIds (sessionId: string): Array<string | null>
    {
        return sceneReadDeckSlotIds(sessionId, DECK_SLOT_IDS_STORAGE_KEY);
    }

    public writeDeckSlotIds (sessionId: string, deckIds: Array<string | null>): void
    {
        sceneWriteDeckSlotIds(sessionId, deckIds, DECK_SLOT_IDS_STORAGE_KEY, FIXED_DECK_SLOT_COUNT);
    }

    public defaultDeckName (index: number): string
    {
        return sceneDefaultDeckName(index);
    }

    private refreshDeckSlotButtons (): void
    {
        sceneRefreshDeckSlotButtons(this);
    }

    private positionDeckTransferButtons (): void
    {
        scenePositionDeckTransferButtons(this);
    }

    private renameCurrentDeck (): void
    {
        sceneRenameCurrentDeck(this);
    }

    private exportCurrentDeckShare (): void
    {
        sceneExportCurrentDeckShare(this);
    }

    private importDeckShare (): void
    {
        sceneImportDeckShare(this);
    }

    public async selectDeckSlot (index: number): Promise<void>
    {
        await sceneSelectDeckSlot(this, index);
    }

    private applyDeck (deck: UserDeck): void
    {
        sceneApplyDeck(this, deck);
    }

    public applyDeckFromDraftOrDeck (deck: UserDeck): void
    {
        sceneApplyDeckFromDraftOrDeck(this, deck);
    }

    public persistCurrentDeckDraft (): void
    {
        scenePersistCurrentDeckDraft(this);
    }

    public areCardListsEqual (a: string[] | undefined, b: string[]): boolean
    {
        return sceneAreCardListsEqual(a, b);
    }

    private renderRows (): void
    {
        sceneRenderRows(this, CARDS_PER_PAGE);
    }

    private getActiveCategoryCards (): CardCatalogEntry[]
    {
        return sceneGetActiveCategoryCards(this, CARD_CATALOG);
    }

    private getCategoryLabel (category: CardCatalogCategory): string
    {
        return sceneGetCategoryLabel(category);
    }

    public collectCards (): string[]
    {
        return sceneCollectCards(this);
    }

    public canAddCardToDeck (card: CardCatalogEntry | null): boolean
    {
        return sceneCanAddCardToDeck(
            this,
            card,
            DECK_REQUIRED_CARD_COUNT,
            DECK_MAX_ITEM_OR_TOOL_COPIES,
            DECK_MAX_OTHER_COPIES
        );
    }

    public applyButtonStyle (
        button: GameObjects.Rectangle,
        label: GameObjects.Text | null | undefined,
        style: DeckBuilderButtonStyle
    ): void
    {
        sceneApplyButtonStyle(button, label, style);
    }

    public bindHoverHighlight (
        button: GameObjects.Rectangle,
        label: GameObjects.Text | null | undefined,
        getBaseStyle: () => DeckBuilderButtonStyle,
        getHoverStyle: () => DeckBuilderButtonStyle,
        isEnabled?: () => boolean
    ): void
    {
        sceneBindHoverHighlight(button, label, getBaseStyle, getHoverStyle, isEnabled);
    }

    public getMaxCopiesForCard (card: CardCatalogEntry): number
    {
        return sceneGetMaxCopiesForCard(
            card,
            DECK_MAX_ITEM_OR_TOOL_COPIES,
            DECK_MAX_OTHER_COPIES
        );
    }

    public validateDeckCards (cards: string[]): string | null
    {
        return sceneValidateDeckCards(
            cards,
            CARD_BY_ID,
            DECK_REQUIRED_CARD_COUNT,
            DECK_MAX_ITEM_OR_TOOL_COPIES,
            DECK_MAX_OTHER_COPIES
        );
    }

    private async saveDeck (): Promise<void>
    {
        await sceneSaveDeck(this);
    }

    public replaceSlotDeck (deck: UserDeck): void
    {
        sceneReplaceSlotDeck(this, deck);
    }

    private updateSummaryText (): void
    {
        sceneUpdateSummaryText(this);
    }

    private getStoredSessionId (): string | null
    {
        return sceneGetStoredSessionId();
    }
}
