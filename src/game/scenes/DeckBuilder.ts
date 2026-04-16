import { Scene, GameObjects } from 'phaser';
import { GAME_CENTER_X, GAME_HEIGHT, GAME_WIDTH, UI_SCALE } from '../config';
import { CARD_CATALOG, CardCatalogEntry, CardCatalogCategory, CharacterCardType } from '../data/cardCatalog';
import {
    createUserDeck,
    fetchUserDecks,
    selectUserDeck,
    updateUserDeck,
    ROUTER_SESSION_ID_STORAGE_KEY,
    UserDeck,
} from '../Network';

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

const CARDS_PER_PAGE = 8;
const FIXED_DECK_SLOT_COUNT = 5;
const DECK_SLOT_IDS_STORAGE_KEY = 'avge_deck_slot_ids';
const DECK_REQUIRED_CARD_COUNT = 20;
const DECK_MAX_ITEM_OR_TOOL_COPIES = 2;
const DECK_MAX_OTHER_COPIES = 1;

const CARD_BY_ID: Map<string, CardCatalogEntry> = new Map(CARD_CATALOG.map((entry) => [entry.id, entry]));

export class DeckBuilder extends Scene
{
    background: GameObjects.Image;
    title: GameObjects.BitmapText;
    subtitle: GameObjects.BitmapText;
    pageIndicator: GameObjects.BitmapText;
    saveButton: GameObjects.Rectangle;
    saveLabel: GameObjects.BitmapText;
    backButton: GameObjects.Rectangle;
    backLabel: GameObjects.BitmapText;
    setActiveButton: GameObjects.Rectangle;
    setActiveLabel: GameObjects.BitmapText;
    renameButton: GameObjects.Rectangle;
    renameLabel: GameObjects.BitmapText;
    nextPageButton: GameObjects.Rectangle;
    prevPageButton: GameObjects.Rectangle;
    categoryButtons: Array<{
        category: CardCatalogCategory;
        body: GameObjects.Rectangle;
        label: GameObjects.BitmapText;
    }>;
    characterTypeButtons: Array<{
        cardType: CharacterCardType | 'all';
        body: GameObjects.Rectangle;
        label: GameObjects.BitmapText;
    }>;

    private state: DeckBuilderState;
    deckSlotButtons: Array<{
        index: number;
        body: GameObjects.Rectangle;
        label: GameObjects.BitmapText;
    }>;
    private slotDecks: Array<UserDeck | null>;
    private rows: Array<{
        container: Phaser.GameObjects.Container;
        iconBody: GameObjects.Rectangle;
        iconLabel: GameObjects.BitmapText;
        cardName: GameObjects.BitmapText;
        countLabel: GameObjects.BitmapText;
        plusButton: GameObjects.Rectangle;
        plusLabel: GameObjects.BitmapText;
        minusButton: GameObjects.Rectangle;
        minusLabel: GameObjects.BitmapText;
        card: CardCatalogEntry | null;
    }>;
    private busy: boolean;
    private draftByDeckId: Map<string, DeckDraft>;
    private activeDeckId: string | null;

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
    }

    preload (): void
    {
        this.load.setPath('assets');
        this.load.image('background', 'bg.png');
        this.load.bitmapFont('minogram', 'minogram_6x10.png', 'minogram_6x10.xml');
    }

    create (): void
    {
        // Phaser reuses the same Scene instance on restart; clear row refs from
        // prior runs so we never mutate destroyed BitmapText objects.
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

        this.cameras.main.fadeIn(180, 0, 0, 0);

        this.background = this.add.image(GAME_CENTER_X, Math.round(GAME_HEIGHT * 0.5), 'background');
        this.background.setDisplaySize(GAME_WIDTH, GAME_HEIGHT);
        this.background.setAlpha(0.9);

        this.title = this.add.bitmapText(
            GAME_CENTER_X,
            Math.round(GAME_HEIGHT * 0.09),
            'minogram',
            'DECK BUILDER',
            Math.max(20, Math.round(40 * UI_SCALE))
        )
            .setOrigin(0.5)
            .setTint(0xffffff);

        this.subtitle = this.add.bitmapText(
            GAME_CENTER_X,
            Math.round(GAME_HEIGHT * 0.15),
            'minogram',
            'Loading deck...',
            Math.max(12, Math.round(20 * UI_SCALE))
        )
            .setOrigin(0.5)
            .setTint(0xe2e8f0);

        this.pageIndicator = this.add.bitmapText(
            GAME_CENTER_X,
            Math.round(GAME_HEIGHT * 0.84),
            'minogram',
            '',
            Math.max(10, Math.round(16 * UI_SCALE))
        )
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

        this.add.bitmapText(this.prevPageButton.x, this.prevPageButton.y, 'minogram', 'PREV', Math.max(10, Math.round(16 * UI_SCALE)))
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

        this.add.bitmapText(this.nextPageButton.x, this.nextPageButton.y, 'minogram', 'NEXT', Math.max(10, Math.round(16 * UI_SCALE)))
            .setOrigin(0.5)
            .setTint(0xffffff);

        this.saveButton = this.add.rectangle(
            Math.round(GAME_CENTER_X + 280 * UI_SCALE),
            Math.round(GAME_HEIGHT * 0.93),
            Math.round(140 * UI_SCALE),
            Math.round(48 * UI_SCALE),
            0x0f172a,
            0.95
        )
            .setStrokeStyle(2, 0xffffff, 0.85)
            .setInteractive({ useHandCursor: true });

        this.saveLabel = this.add.bitmapText(
            this.saveButton.x,
            this.saveButton.y,
            'minogram',
            'SAVE',
            Math.max(12, Math.round(20 * UI_SCALE))
        )
            .setOrigin(0.5)
            .setTint(0xffffff);

        this.backButton = this.add.rectangle(
            Math.round(GAME_CENTER_X - 280 * UI_SCALE),
            Math.round(GAME_HEIGHT * 0.93),
            Math.round(140 * UI_SCALE),
            Math.round(48 * UI_SCALE),
            0x1e293b,
            0.95
        )
            .setStrokeStyle(2, 0xffffff, 0.75)
            .setInteractive({ useHandCursor: true });

        this.backLabel = this.add.bitmapText(
            this.backButton.x,
            this.backButton.y,
            'minogram',
            'BACK',
            Math.max(12, Math.round(20 * UI_SCALE))
        )
            .setOrigin(0.5)
            .setTint(0xffffff);

        this.renameButton = this.add.rectangle(
            Math.round(GAME_CENTER_X - 95 * UI_SCALE),
            Math.round(GAME_HEIGHT * 0.93),
            Math.round(140 * UI_SCALE),
            Math.round(48 * UI_SCALE),
            0x334155,
            0.95
        )
            .setStrokeStyle(2, 0xffffff, 0.75)
            .setInteractive({ useHandCursor: true });

        this.renameLabel = this.add.bitmapText(
            this.renameButton.x,
            this.renameButton.y,
            'minogram',
            'RENAME',
            Math.max(12, Math.round(20 * UI_SCALE))
        )
            .setOrigin(0.5)
            .setTint(0xffffff);

        this.setActiveButton = this.add.rectangle(
            Math.round(GAME_CENTER_X + 95 * UI_SCALE),
            Math.round(GAME_HEIGHT * 0.93),
            Math.round(180 * UI_SCALE),
            Math.round(48 * UI_SCALE),
            0x1d4ed8,
            0.95
        )
            .setStrokeStyle(2, 0xffffff, 0.85)
            .setInteractive({ useHandCursor: true });

        this.setActiveLabel = this.add.bitmapText(
            this.setActiveButton.x,
            this.setActiveButton.y,
            'minogram',
            'SET ACTIVE',
            Math.max(12, Math.round(20 * UI_SCALE))
        )
            .setOrigin(0.5)
            .setTint(0xffffff);

        this.buildDeckSlotButtons();
        this.buildCategoryButtons();
        this.buildCharacterTypeButtons();
        this.buildRows();
        this.renderRows();
        this.updateSummaryText();

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
            this.renameCurrentDeck();
        });

        this.setActiveButton.on('pointerdown', () => {
            void this.setActiveCurrentDeck();
        });

        this.backButton.on('pointerdown', () => {
            this.scene.start('MainMenu');
        });

        void this.loadDeck();
    }

    private buildDeckSlotButtons (): void
    {
        const panelX = Math.round(GAME_CENTER_X - 380 * UI_SCALE);
        const startY = Math.round(GAME_HEIGHT * 0.33);
        const spacing = Math.round(64 * UI_SCALE);
        const width = Math.round(180 * UI_SCALE);
        const height = Math.round(50 * UI_SCALE);
        const titleSize = Math.max(10, Math.round(16 * UI_SCALE));
        const labelSize = Math.max(9, Math.round(13 * UI_SCALE));

        this.add.bitmapText(panelX, Math.round(startY - 58 * UI_SCALE), 'minogram', 'SAVED DECKS', titleSize)
            .setOrigin(0.5)
            .setTint(0xffffff);

        for (let i = 0; i < FIXED_DECK_SLOT_COUNT; i += 1) {
            const y = startY + (i * spacing);
            const body = this.add.rectangle(panelX, y, width, height, 0x0b1220, 0.88)
                .setStrokeStyle(2, 0xffffff, 0.55)
                .setInteractive({ useHandCursor: true });

            const label = this.add.bitmapText(panelX, y, 'minogram', this.defaultDeckName(i), labelSize)
                .setOrigin(0.5)
                .setTint(0xe2e8f0);

            body.on('pointerdown', () => {
                void this.selectDeckSlot(i);
            });

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
            { category: 'status_effect', label: 'STATUS' },
        ];

        const startX = Math.round(GAME_CENTER_X - (categories.length - 1) * 68 * UI_SCALE * 0.5);
        const y = Math.round(GAME_HEIGHT * 0.22);
        const width = Math.round(64 * UI_SCALE);
        const height = Math.round(34 * UI_SCALE);
        const spacing = Math.round(68 * UI_SCALE);
        const fontSize = Math.max(8, Math.round(12 * UI_SCALE));

        for (let i = 0; i < categories.length; i += 1) {
            const def = categories[i];
            const x = startX + (i * spacing);

            const body = this.add.rectangle(x, y, width, height, 0x0f172a, 0.9)
                .setStrokeStyle(2, 0xffffff, 0.65)
                .setInteractive({ useHandCursor: true });

            const label = this.add.bitmapText(x, y, 'minogram', def.label, fontSize)
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

            this.categoryButtons.push({
                category: def.category,
                body,
                label,
            });
        }
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
        const fontSize = Math.max(7, Math.round(10 * UI_SCALE));

        for (let i = 0; i < types.length; i += 1) {
            const def = types[i];
            const x = startX + (i * spacing);

            const body = this.add.rectangle(x, y, width, height, 0x0b1220, 0.88)
                .setStrokeStyle(2, 0xffffff, 0.5)
                .setInteractive({ useHandCursor: true });

            const label = this.add.bitmapText(x, y, 'minogram', def.label, fontSize)
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
            ).setStrokeStyle(2, 0xffffff, 0.7);

            const iconLabel = this.add.bitmapText(
                iconBody.x,
                iconBody.y,
                'minogram',
                '',
                Math.max(8, Math.round(12 * UI_SCALE))
            )
                .setOrigin(0.5)
                .setTint(0xffffff);

            const cardName = this.add.bitmapText(
                Math.round(GAME_CENTER_X - 190 * UI_SCALE),
                y,
                'minogram',
                '',
                Math.max(10, Math.round(18 * UI_SCALE))
            )
                .setOrigin(0, 0.5)
                .setTint(0xffffff);

            const minusButton = this.add.rectangle(
                Math.round(GAME_CENTER_X + 120 * UI_SCALE),
                y,
                Math.round(40 * UI_SCALE),
                Math.round(40 * UI_SCALE),
                0x334155,
                0.95
            )
                .setStrokeStyle(2, 0xffffff, 0.75)
                .setInteractive({ useHandCursor: true });

            const minusLabel = this.add.bitmapText(minusButton.x, minusButton.y, 'minogram', '-', Math.max(14, Math.round(24 * UI_SCALE)))
                .setOrigin(0.5)
                .setTint(0xffffff);

            const countLabel = this.add.bitmapText(
                Math.round(GAME_CENTER_X + 170 * UI_SCALE),
                y,
                'minogram',
                '0',
                Math.max(12, Math.round(20 * UI_SCALE))
            )
                .setOrigin(0.5)
                .setTint(0xffffff);

            const plusButton = this.add.rectangle(
                Math.round(GAME_CENTER_X + 220 * UI_SCALE),
                y,
                Math.round(40 * UI_SCALE),
                Math.round(40 * UI_SCALE),
                0x0f766e,
                0.95
            )
                .setStrokeStyle(2, 0xffffff, 0.75)
                .setInteractive({ useHandCursor: true });

            const plusLabel = this.add.bitmapText(plusButton.x, plusButton.y, 'minogram', '+', Math.max(14, Math.round(24 * UI_SCALE)))
                .setOrigin(0.5)
                .setTint(0xffffff);

            container.add([iconBody, iconLabel, cardName, minusButton, minusLabel, countLabel, plusButton, plusLabel]);

            const row = {
                container,
                iconBody,
                iconLabel,
                cardName,
                countLabel,
                plusButton,
                plusLabel,
                minusButton,
                minusLabel,
                card: null as CardCatalogEntry | null,
            };

            plusButton.on('pointerdown', () => {
                if (this.busy || !row.card) {
                    return;
                }

                const totalCards = this.collectCards().length;
                if (totalCards >= DECK_REQUIRED_CARD_COUNT) {
                    this.subtitle.setText(`Deck must contain exactly ${DECK_REQUIRED_CARD_COUNT} cards.`);
                    return;
                }

                const current = this.state.countsByCardId.get(row.card.id) ?? 0;
                const maxCopies = this.getMaxCopiesForCard(row.card);
                if (current >= maxCopies) {
                    this.subtitle.setText(
                        maxCopies === DECK_MAX_ITEM_OR_TOOL_COPIES
                            ? `${row.card.label.toUpperCase()} max copies: ${DECK_MAX_ITEM_OR_TOOL_COPIES}.`
                            : `${row.card.label.toUpperCase()} max copies: ${DECK_MAX_OTHER_COPIES}.`
                    );
                    return;
                }

                this.state.countsByCardId.set(row.card.id, current + 1);
                this.persistCurrentDeckDraft();
                this.refreshDeckSlotButtons();
                this.renderRows();
                this.updateSummaryText();
            });

            minusButton.on('pointerdown', () => {
                if (this.busy || !row.card) {
                    return;
                }
                const current = this.state.countsByCardId.get(row.card.id) ?? 0;
                if (current <= 0) {
                    return;
                }
                this.state.countsByCardId.set(row.card.id, current - 1);
                this.persistCurrentDeckDraft();
                this.refreshDeckSlotButtons();
                this.renderRows();
                this.updateSummaryText();
            });

            this.rows.push(row);
        }
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
        let selectedDeck = selectedFromResult
            ?? (this.slotDecks.find((deck) => deck !== null) as UserDeck | undefined)
            ?? null;

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
            const activeMarker = deck && deck.deckId === this.activeDeckId ? '[A] ' : '';
            button.label.setText(`${activeMarker}${name}${dirtyMarker} (${draftCards.length})`);

            const active = deck !== null && deck.deckId === this.state.deckId;
            button.body.setFillStyle(active ? 0x1d4ed8 : 0x0b1220, active ? 0.95 : 0.88);
            button.label.setTint(active ? 0xfef08a : 0xe2e8f0);
        }
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

    private async setActiveCurrentDeck (): Promise<void>
    {
        if (!this.state.deckId || this.busy) {
            return;
        }

        const sessionId = this.getStoredSessionId();
        if (!sessionId) {
            this.scene.start('Login');
            return;
        }

        this.busy = true;
        this.subtitle.setText('Setting active deck...');

        const result = await selectUserDeck(this.state.deckId, sessionId);
        this.busy = false;
        if (!result.ok) {
            this.subtitle.setText(result.error ?? 'Failed to set active deck.');
            return;
        }

        this.activeDeckId = this.state.deckId;
        this.refreshDeckSlotButtons();
        this.updateSummaryText();
    }

    private async selectDeckSlot (index: number): Promise<void>
    {
        const deck = this.slotDecks[index] ?? null;
        if (!deck || this.busy) {
            return;
        }

        if (this.state.deckId === deck.deckId) {
            return;
        }

        this.persistCurrentDeckDraft();
        this.applyDeckFromDraftOrDeck(deck);
        this.state.pageIndex = 0;

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

    private getMaxCopiesForCard (card: CardCatalogEntry): number
    {
        return card.category === 'item' || card.category === 'tool'
            ? DECK_MAX_ITEM_OR_TOOL_COPIES
            : DECK_MAX_OTHER_COPIES;
    }

    private validateDeckCards (cards: string[]): string | null
    {
        if (cards.length !== DECK_REQUIRED_CARD_COUNT) {
            return `Deck must contain exactly ${DECK_REQUIRED_CARD_COUNT} cards.`;
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
