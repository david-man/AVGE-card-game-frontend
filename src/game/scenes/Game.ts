import { Scene } from 'phaser';

import { GameCommandProcessor } from '../commands/GameCommandProcessor';
import { Card, CardHolder, CardHolderConfig, EnergyHolder, EnergyHolderConfig, EnergyToken, PlayerId, CardOptions, initializeCards } from '../entities';
import { sendBackendEvent, waitForNextScannerCommand } from '../Network';
import { BoardInteractionController } from '../ui/BoardInteractionController';
import { CardPreviewController } from '../ui/CardPreviewController';
import { InputOverlayController } from '../ui/InputOverlayController';
import { PlayerStatsHudController } from '../ui/PlayerStatsHudController';
import { SurrenderController } from '../ui/SurrenderController';
import {
    BASE_HEIGHT,
    BASE_WIDTH,
    BOARD_SCALE,
    CARD_BASE_HEIGHT,
    CARD_BASE_WIDTH,
    GAME_CARD_ACTION_BUTTON_LAYOUT,
    GAME_DEPTHS,
    GAME_EXPLOSION,
    GAME_LAYOUT,
    GAME_SCENE_VISUALS,
    GAME_SHUFFLE_ANIMATION,
    ENERGY_TOKEN_DEPTHS,
    CARDHOLDER_BASE_WIDTH,
    CARDHOLDER_HEIGHT_MULTIPLIER,
    ENERGYHOLDER_LAYOUT,
    CARDHOLDER_SPACING_MULTIPLIERS,
    GAME_CENTER_X,
    GAME_CENTER_Y,
    GAME_HEIGHT,
    GAME_WIDTH,
    PLAYER_STARTING_ENERGY_TOKEN_IDS,
    PLAYER_TURN_ATTRIBUTE_DEFAULTS,
    UI_SCALE
} from '../config';

type ViewMode = PlayerId | 'admin';
type GamePhase = 'no-input' | 'phase2' | 'atk';
type CardActionKey = 'atk1' | 'atk2' | 'active';
type OverlayPreviewContext = 'input' | 'reveal' | null;
type PlayerTurnAttributeKey = keyof typeof PLAYER_TURN_ATTRIBUTE_DEFAULTS;
type PlayerTurnAttributes = Record<PlayerTurnAttributeKey, number>;

export class Game extends Scene
{
    camera: Phaser.Cameras.Scene2D.Camera;
    background: Phaser.GameObjects.Image;

    cards: Card[];
    cardById: Record<string, Card>;
    cardByBody: Map<Phaser.GameObjects.Rectangle, Card>;
    selectedCard: Card | null;
    overlayPreviewContext: OverlayPreviewContext;
    activelyDraggedCardIds: Set<string>;
    dragOriginZoneByCardId: Map<string, string>;
    dragStartPositionByCardId: Map<string, { x: number; y: number }>;
    dragDistanceByCardId: Map<string, number>;

    cardHolders: CardHolder[];
    cardHolderById: Record<string, CardHolder>;

    energyHolders: EnergyHolder[];
    energyHolderById: Record<string, EnergyHolder>;

    energyTokens: EnergyToken[];
    energyTokenById: Record<number, EnergyToken>;
    energyTokenByBody: Map<Phaser.GameObjects.GameObject, EnergyToken>;
    activelyDraggedEnergyTokenIds: Set<number>;
    energyDragStartPositionById: Map<number, { x: number; y: number }>;
    energyDragDistanceById: Map<number, number>;
    activeSceneAnimationCount: number;

    energyZoneIdByOwner: Record<PlayerId, string>;
    activeViewMode: ViewMode;
    gamePhase: GamePhase;
    playerTurn: PlayerId;
    playerTurnAttributesByPlayer: Record<PlayerId, PlayerTurnAttributes>;
    baseCardHolderPositionById: Record<string, { x: number; y: number }>;
    baseEnergyHolderPositionById: Record<string, { x: number; y: number }>;

    objectWidth: number;
    objectHeight: number;

    commandProcessor: GameCommandProcessor;
    boardInputEnabled: boolean;
    inputLockOverlay: Phaser.GameObjects.Rectangle;
    inputOverlayController: InputOverlayController;
    boardInteractionController: BoardInteractionController;
    cardPreviewController: CardPreviewController;
    surrenderController: SurrenderController;
    playerStatsHudController: PlayerStatsHudController;
    scannerWaitLoopActive: boolean;
    scannerCommandInProgress: boolean;

    cardActionButtons: Array<{
        key: CardActionKey;
        body: Phaser.GameObjects.Arc;
        label: Phaser.GameObjects.BitmapText;
    }>;

    constructor ()
    {
        super('Game');
    }

    preload ()
    {
        this.load.setPath('assets');
        this.load.image('background', 'bg.png');
        this.load.image('logo', 'logo.png');
        this.load.image('minecraftfont', 'minecraftfont.png');
        this.load.image('font2bitmap', 'font2bitmap.png');
        this.load.image('pixelviolin', 'pixelviolin.jpg');
        this.load.bitmapFont('minogram', 'minogram_6x10.png', 'minogram_6x10.xml');
        InputOverlayController.preloadDiceAssets(this);
    }

    create ()
    {
        this.camera = this.cameras.main;
        this.camera.setBackgroundColor(GAME_SCENE_VISUALS.backgroundColor);
        this.camera.roundPixels = true;

        this.background = this.add.image(GAME_CENTER_X, GAME_CENTER_Y, 'background');
        this.background.setDisplaySize(GAME_WIDTH, GAME_HEIGHT);
        this.background.setAlpha(GAME_SCENE_VISUALS.backgroundAlpha);

        this.boardInputEnabled = true;
        this.inputLockOverlay = this.add.rectangle(GAME_CENTER_X, GAME_CENTER_Y, GAME_WIDTH, GAME_HEIGHT, GAME_SCENE_VISUALS.inputLockColor, GAME_SCENE_VISUALS.inputLockAlpha)
            .setDepth(GAME_SCENE_VISUALS.inputLockDepth)
            .setVisible(false);
        this.inputOverlayController = new InputOverlayController(this, this.inputLockOverlay);
        this.boardInteractionController = new BoardInteractionController(this, this);
        this.cardPreviewController = new CardPreviewController(this);
        this.surrenderController = new SurrenderController(this, {
            onArm: (seconds) => {
                this.appendTerminalLine(`${this.getViewModeLabel(this.activeViewMode)} surrender armed for ${seconds}s. Click again to confirm.`);
            },
            onConfirm: () => {
                const winningPlayerLabel = this.activeViewMode === 'p1' ? 'PLAYER-2' : 'PLAYER-1';
                this.appendTerminalLine(`${winningPlayerLabel} won by surrender.`);
                this.emitBackendEvent('surrender_result', {
                    winner: winningPlayerLabel,
                    loser: this.getViewModeLabel(this.activeViewMode)
                });
            },
            onTimeout: () => {
                this.appendTerminalLine('Surrender confirmation timed out.');
                this.emitBackendEvent('surrender_timeout', {
                    view_mode: this.getViewModeLabel(this.activeViewMode)
                });
            }
        });
        this.playerStatsHudController = new PlayerStatsHudController(this);
        this.commandProcessor = new GameCommandProcessor(this);
        this.scannerWaitLoopActive = false;
        this.scannerCommandInProgress = false;

        const xRatio = GAME_WIDTH / BASE_WIDTH;
        const yRatio = GAME_HEIGHT / BASE_HEIGHT;

        // Card size inherits from configured game dimensions.
        this.objectWidth = Math.round(CARD_BASE_WIDTH * xRatio * BOARD_SCALE);
        this.objectHeight = Math.round(CARD_BASE_HEIGHT * yRatio * BOARD_SCALE);

        const holderConfigs = this.buildCardHolderConfigs(BOARD_SCALE);
        this.cardHolders = [];
        this.cardHolderById = {};
        this.baseCardHolderPositionById = {};
        this.baseEnergyHolderPositionById = {};
        this.activeViewMode = 'p1';
        this.gamePhase = 'phase2';
        this.playerTurn = 'p1';
        this.playerTurnAttributesByPlayer = {
            p1: this.createDefaultPlayerTurnAttributes(),
            p2: this.createDefaultPlayerTurnAttributes()
        };

        for (const config of holderConfigs) {
            const holder = new CardHolder(this, config);
            this.cardHolders.push(holder);
            this.cardHolderById[holder.id] = holder;
            this.baseCardHolderPositionById[holder.id] = { x: holder.x, y: holder.y };
        }

        this.energyTokens = [];
        this.energyTokenById = {};
        this.energyTokenByBody = new Map();
        this.activelyDraggedEnergyTokenIds = new Set();
        this.energyDragStartPositionById = new Map();
        this.energyDragDistanceById = new Map();
        this.activeSceneAnimationCount = 0;
        this.energyZoneIdByOwner = {
            p1: 'p1-energy',
            p2: 'p2-energy'
        };
        this.energyHolders = [];
        this.energyHolderById = {};

        this.createEnergyHolders();
        for (const holder of this.energyHolders) {
            this.baseEnergyHolderPositionById[holder.id] = { x: holder.x, y: holder.y };
        }
        this.createEnergyTokens();

        this.cards = [];
        this.cardById = {};
        this.cardByBody = new Map();
        this.selectedCard = null;
        this.overlayPreviewContext = null;
        this.activelyDraggedCardIds = new Set();
        this.dragOriginZoneByCardId = new Map();
        this.dragStartPositionByCardId = new Map();
        this.dragDistanceByCardId = new Map();

        const cardTypeColors = {
            character: 0xe76f51,
            tool: 0x457b9d,
            item: 0x2a9d8f,
            stadium: 0x6d597a
        } as const;

        const cardTemplates: Array<{
            ownerId: 'p1' | 'p2';
            cardType: 'character' | 'tool' | 'item' | 'stadium';
            hasAtk1?: boolean;
            hasAtk2?: boolean;
            hasActive?: boolean;
        }> = [
            { ownerId: 'p1', cardType: 'character', hasAtk1: true, hasAtk2: true, hasActive: true },
            { ownerId: 'p1', cardType: 'character', hasAtk1: true, hasAtk2: true, hasActive: true },
            { ownerId: 'p1', cardType: 'character', hasAtk1: true, hasAtk2: true, hasActive: true },
            { ownerId: 'p1', cardType: 'character', hasAtk1: true, hasAtk2: true, hasActive: true },
            { ownerId: 'p1', cardType: 'character', hasAtk1: true, hasAtk2: true, hasActive: true },
            { ownerId: 'p1', cardType: 'character', hasAtk1: true, hasAtk2: true, hasActive: true },
            { ownerId: 'p1', cardType: 'character', hasAtk1: true, hasAtk2: true, hasActive: true },
            { ownerId: 'p1', cardType: 'character', hasAtk1: true, hasAtk2: true, hasActive: true },
            { ownerId: 'p1', cardType: 'character', hasAtk1: true, hasAtk2: true, hasActive: true },
            { ownerId: 'p1', cardType: 'character', hasAtk1: true, hasAtk2: true, hasActive: true },
            { ownerId: 'p1', cardType: 'tool' },
            { ownerId: 'p1', cardType: 'item' },
            { ownerId: 'p1', cardType: 'stadium' },
            { ownerId: 'p2', cardType: 'character', hasAtk1: true, hasAtk2: true, hasActive: true },
            { ownerId: 'p2', cardType: 'tool' },
            { ownerId: 'p2', cardType: 'item' },
            { ownerId: 'p2', cardType: 'stadium' }
        ];

        const cardOptions: CardOptions[] = cardTemplates.map((template, index) => {
            const zoneId = `${template.ownerId}-hand`;
            const startingHolder = this.cardHolderById[zoneId];
            const cardId = `CARD-${index + 1}`;

            return {
                id: cardId,
                cardType: template.cardType,
                ownerId: template.ownerId,
                x: startingHolder.x,
                y: startingHolder.y,
                width: this.objectWidth,
                height: this.objectHeight,
                color: cardTypeColors[template.cardType],
                zoneId,
                card_class: template.cardType,
                has_atk_1: template.hasAtk1 ?? false,
                has_atk_2: template.hasAtk2 ?? false,
                has_active: template.hasActive ?? false
            };
        });

        this.cards = initializeCards(this, cardOptions);

        this.cards.forEach((card) => {
            this.cardById[card.id] = card;
            this.cardByBody.set(card.body, card);
            const startingHolder = this.cardHolderById[card.getZoneId()];
            startingHolder.addCard(card);
            this.input.setDraggable(card.body);

            card.body.on('pointerdown', () => {
                if (!this.boardInputEnabled) {
                    return;
                }

                if (!this.canPreviewCard(card)) {
                    return;
                }
                this.selectCard(card);
            });
        });

        this.createCardPreviewPanel();
        this.createCardActionButtons();
        this.createSurrenderButton();
        this.createPlayerStatsHud();

        this.layoutAllHolders();
        this.redrawAllCardMarks();
        this.applyBoardView(this.activeViewMode);
        this.boardInteractionController.register();
        this.startScannerWaitLoop();
    }

    public isInteractionLockedByAnimation (): boolean
    {
        if (!this.boardInputEnabled) {
            return true;
        }

        if (this.activeSceneAnimationCount > 0) {
            return true;
        }

        return this.cards.some((card) => card.isCurrentlyFlipping());
    }

    public setBoardInputEnabled (enabled: boolean): void
    {
        this.boardInputEnabled = enabled;
        this.inputLockOverlay.setVisible(!enabled);

        if (enabled && this.inputOverlayController?.hasActiveOverlay()) {
            this.inputOverlayController.stopActiveOverlay();
            this.overlayPreviewContext = null;
            this.refreshCardActionButtons();
        }

        if (!enabled) {
            this.clearCardSelection();
            this.activelyDraggedCardIds.clear();
            this.dragOriginZoneByCardId.clear();
            this.dragStartPositionByCardId.clear();
            this.dragDistanceByCardId.clear();
            this.activelyDraggedEnergyTokenIds.clear();
            this.energyDragStartPositionById.clear();
            this.energyDragDistanceById.clear();
        }
    }

    private beginSceneAnimation (): void
    {
        this.activeSceneAnimationCount += 1;
    }

    private endSceneAnimation (): void
    {
        this.activeSceneAnimationCount = Math.max(0, this.activeSceneAnimationCount - 1);
    }

    private createEnergyHolders (): void
    {
        const p2Discard = this.cardHolderById['p2-discard'];
        const p1Discard = this.cardHolderById['p1-discard'];

        const holderWidth = Math.round(this.objectWidth * ENERGYHOLDER_LAYOUT.widthMultiplier);
        const holderHeight = Math.round(this.objectHeight * ENERGYHOLDER_LAYOUT.heightMultiplier);
        const xOffset = Math.round(this.objectWidth * ENERGYHOLDER_LAYOUT.xOffsetMultiplier);

        const p2EnergyX = p2Discard.x - xOffset;
        const p1EnergyX = p1Discard.x - xOffset;
        const p2EnergyY = p2Discard.y;
        const p1EnergyY = p1Discard.y;

        const discardZoneId = 'energy-discard';
        const discardX = Math.round((p1EnergyX + p2EnergyX) / 2);
        const discardY = Math.round((p1EnergyY + p2EnergyY) / 2);

        const createHolder = (config: EnergyHolderConfig) => {
            const holder = new EnergyHolder(this, config);
            this.energyHolders.push(holder);
            this.energyHolderById[holder.id] = holder;
        };

        createHolder({ id: this.energyZoneIdByOwner.p2, label: 'P2 ENERGY', x: p2EnergyX, y: p2EnergyY, width: holderWidth, height: holderHeight, color: 0x4361ee });
        createHolder({ id: discardZoneId, label: 'ENERGY DISCARD', x: discardX, y: discardY, width: holderWidth, height: holderHeight, color: 0x6c757d });
        createHolder({ id: this.energyZoneIdByOwner.p1, label: 'P1 ENERGY', x: p1EnergyX, y: p1EnergyY, width: holderWidth, height: holderHeight, color: 0x3a0ca3 });
    }

    private createEnergyTokens (): void
    {
        this.initializePlayerEnergySet('p1', PLAYER_STARTING_ENERGY_TOKEN_IDS.p1);
        this.initializePlayerEnergySet('p2', PLAYER_STARTING_ENERGY_TOKEN_IDS.p2);
    }

    private initializePlayerEnergySet (ownerId: PlayerId, tokenIds: number[]): void
    {
        const zoneId = this.energyZoneIdByOwner[ownerId];
        const holder = this.energyHolderById[zoneId];
        if (!holder) {
            return;
        }

        const radius = Math.max(GAME_LAYOUT.energyTokenRadiusMin, Math.round(this.objectWidth * GAME_LAYOUT.energyTokenRadiusWidthRatio));
        for (const rawTokenId of tokenIds) {
            const tokenId = Number(rawTokenId);
            if (!Number.isInteger(tokenId) || tokenId < 0 || this.energyTokenById[tokenId]) {
                continue;
            }

            const token = new EnergyToken(this, {
                id: tokenId,
                ownerId,
                x: holder.x,
                y: holder.y,
                radius,
                zoneId
            });

            this.energyTokens.push(token);
            this.energyTokenById[tokenId] = token;
            this.energyTokenByBody.set(token.body, token);
            this.input.setDraggable(token.body);
            holder.addToken(token);
        }

        this.layoutEnergyTokensInZone(zoneId);
    }

    private buildCardHolderConfigs (scale: number): CardHolderConfig[]
    {
        // Scale the board around the configured game center from the base layout size.
        const xRatio = GAME_WIDTH / BASE_WIDTH;
        const yRatio = GAME_HEIGHT / BASE_HEIGHT;

        // Use full-screen coordinate mapping for holder spacing so zones are not center-cramped.
        const scaleX = (value: number) => Math.round(((value - (BASE_WIDTH / 2)) * xRatio) + GAME_CENTER_X);
        const scaleY = (value: number) => Math.round(((value - (BASE_HEIGHT / 2)) * yRatio) + GAME_CENTER_Y);
        const scaleSizeX = (value: number) => Math.round(value * xRatio * scale);
        const spacing = CARD_BASE_HEIGHT;

        const holderWidth = (holderType: keyof typeof CARDHOLDER_BASE_WIDTH) => scaleSizeX(CARDHOLDER_BASE_WIDTH[holderType]);

        const baseCenterX = BASE_WIDTH / 2;
        const baseCenterY = BASE_HEIGHT / 2;
        const topActiveY = baseCenterY - (spacing * CARDHOLDER_SPACING_MULTIPLIERS.activeRowOffset);
        const bottomActiveY = baseCenterY + (spacing * CARDHOLDER_SPACING_MULTIPLIERS.activeRowOffset);
        const benchYOffset = spacing * CARDHOLDER_SPACING_MULTIPLIERS.benchFromActive;
        const handYOffset = spacing * CARDHOLDER_SPACING_MULTIPLIERS.handFromBench;
        const sideXOffset = spacing * CARDHOLDER_SPACING_MULTIPLIERS.sideFromActiveX;

        const topBenchY = topActiveY - benchYOffset;
        const topHandY = topBenchY - handYOffset;
        const bottomBenchY = bottomActiveY + benchYOffset;
        const bottomHandY = bottomBenchY + handYOffset;
        const leftSideX = baseCenterX - sideXOffset;
        const rightSideX = baseCenterX + sideXOffset;
        const stadiumX = leftSideX - (spacing * GAME_LAYOUT.energyStadiumOffsetMultiplier);

        return [
            // Opponent side (top)
            { id: 'p2-hand', label: 'P2 HAND', x: scaleX(baseCenterX), y: scaleY(topHandY), width: holderWidth('hand'), height: this.objectHeight * CARDHOLDER_HEIGHT_MULTIPLIER, color: 0x264653 },
            { id: 'p2-bench', label: 'P2 BENCH', x: scaleX(baseCenterX), y: scaleY(topBenchY), width: holderWidth('bench'), height: this.objectHeight * CARDHOLDER_HEIGHT_MULTIPLIER, color: 0x2a9d8f },
            { id: 'p2-active', label: 'P2 ACTIVE', x: scaleX(baseCenterX), y: scaleY(topActiveY), width: holderWidth('active'), height: this.objectHeight * CARDHOLDER_HEIGHT_MULTIPLIER, color: 0xe9c46a },
            { id: 'p2-discard', label: 'P2 DISCARD', x: scaleX(leftSideX), y: scaleY(topActiveY), width: holderWidth('discard'), height: this.objectHeight * CARDHOLDER_HEIGHT_MULTIPLIER, color: 0xf4a261 },
            { id: 'p2-deck', label: 'P2 DECK', x: scaleX(rightSideX), y: scaleY(topActiveY), width: holderWidth('deck'), height: this.objectHeight * CARDHOLDER_HEIGHT_MULTIPLIER, color: 0xe76f51 },
            { id: 'stadium', label: 'STADIUM', x: scaleX(stadiumX), y: scaleY(baseCenterY), width: holderWidth('stadium'), height: this.objectHeight * CARDHOLDER_HEIGHT_MULTIPLIER, color: 0x6d597a },

            // Player side (bottom)
            { id: 'p1-active', label: 'P1 ACTIVE', x: scaleX(baseCenterX), y: scaleY(bottomActiveY), width: holderWidth('active'), height: this.objectHeight * CARDHOLDER_HEIGHT_MULTIPLIER, color: 0xe9c46a },
            { id: 'p1-discard', label: 'P1 DISCARD', x: scaleX(leftSideX), y: scaleY(bottomActiveY), width: holderWidth('discard'), height: this.objectHeight * CARDHOLDER_HEIGHT_MULTIPLIER, color: 0xf4a261 },
            { id: 'p1-deck', label: 'P1 DECK', x: scaleX(rightSideX), y: scaleY(bottomActiveY), width: holderWidth('deck'), height: this.objectHeight * CARDHOLDER_HEIGHT_MULTIPLIER, color: 0xe76f51 },
            { id: 'p1-bench', label: 'P1 BENCH', x: scaleX(baseCenterX), y: scaleY(bottomBenchY), width: holderWidth('bench'), height: this.objectHeight * CARDHOLDER_HEIGHT_MULTIPLIER, color: 0x2a9d8f },
            { id: 'p1-hand', label: 'P1 HAND', x: scaleX(baseCenterX), y: scaleY(bottomHandY), width: holderWidth('hand'), height: this.objectHeight * CARDHOLDER_HEIGHT_MULTIPLIER, color: 0x264653 }
        ];
    }

    private createCardPreviewPanel (): void
    {
        this.cardPreviewController.create(this.objectWidth, this.objectHeight);
    }

    private createCardActionButtons (): void
    {
        const radius = Math.max(12, Math.round((GAME_CARD_ACTION_BUTTON_LAYOUT.buttonRadiusBase / BASE_WIDTH) * GAME_WIDTH));
        const leftMargin = Math.round((GAME_CARD_ACTION_BUTTON_LAYOUT.leftMarginBase / BASE_WIDTH) * GAME_WIDTH);
        const bottomMargin = Math.round((GAME_CARD_ACTION_BUTTON_LAYOUT.bottomMarginBase / BASE_HEIGHT) * GAME_HEIGHT);
        const fontSize = Math.max(10, Math.round(GAME_CARD_ACTION_BUTTON_LAYOUT.fontSize * UI_SCALE));

        const defs: Array<{ key: CardActionKey; text: string }> = [
            { key: 'atk1', text: 'ATK1' },
            { key: 'atk2', text: 'ATK2' },
            { key: 'active', text: 'ACTIVE' }
        ];

        this.cardActionButtons = defs.map((def) => {
            const x = leftMargin + radius;
            const y = GAME_HEIGHT - bottomMargin - radius;

            const body = this.add.circle(
                x,
                y,
                radius,
                GAME_CARD_ACTION_BUTTON_LAYOUT.fillColor,
                GAME_CARD_ACTION_BUTTON_LAYOUT.fillAlpha
            )
                .setStrokeStyle(
                    GAME_CARD_ACTION_BUTTON_LAYOUT.strokeWidth,
                    GAME_CARD_ACTION_BUTTON_LAYOUT.strokeColor,
                    GAME_CARD_ACTION_BUTTON_LAYOUT.strokeAlpha
                )
                .setDepth(GAME_DEPTHS.terminalInputText)
                .setInteractive({ useHandCursor: true })
                .setVisible(false);

            const label = this.add.bitmapText(x, y, 'minogram', def.text, fontSize)
                .setOrigin(0.5)
                .setTint(GAME_CARD_ACTION_BUTTON_LAYOUT.textTint)
                .setDepth(GAME_DEPTHS.terminalInputText + 1)
                .setVisible(false);

            body.on('pointerdown', () => {
                this.handleCardActionButtonClick(def.key);
            });

            body.on('pointerover', () => {
                this.tweens.killTweensOf([body, label]);
                this.tweens.add({
                    targets: [body, label],
                    scaleX: GAME_CARD_ACTION_BUTTON_LAYOUT.hoverScale,
                    scaleY: GAME_CARD_ACTION_BUTTON_LAYOUT.hoverScale,
                    duration: GAME_CARD_ACTION_BUTTON_LAYOUT.hoverDurationMs,
                    ease: 'Sine.easeOut'
                });
            });

            body.on('pointerout', () => {
                this.tweens.killTweensOf([body, label]);
                this.tweens.add({
                    targets: [body, label],
                    scaleX: 1,
                    scaleY: 1,
                    duration: GAME_CARD_ACTION_BUTTON_LAYOUT.hoverDurationMs,
                    ease: 'Sine.easeOut'
                });
            });

            return { key: def.key, body, label };
        });
    }

    private createSurrenderButton (): void
    {
        this.surrenderController.create();
        this.refreshSurrenderButton();
    }

    private refreshSurrenderButton (): void
    {
        const handHolder = this.activeViewMode === 'admin' ? undefined : this.cardHolderById[`${this.activeViewMode}-hand`];
        this.surrenderController.refresh(this.activeViewMode, handHolder);
    }

    private createPlayerStatsHud (): void
    {
        this.playerStatsHudController.create();
        this.refreshPlayerStatsHud();
    }

    private createDefaultPlayerTurnAttributes (): PlayerTurnAttributes
    {
        return {
            ENERGY_ADD_REMAINING_IN_TURN: PLAYER_TURN_ATTRIBUTE_DEFAULTS.ENERGY_ADD_REMAINING_IN_TURN,
            KO_COUNT: PLAYER_TURN_ATTRIBUTE_DEFAULTS.KO_COUNT,
            SUPPORTER_USES_REMAINING_IN_TURN: PLAYER_TURN_ATTRIBUTE_DEFAULTS.SUPPORTER_USES_REMAINING_IN_TURN,
            SWAP_REMAINING_IN_TURN: PLAYER_TURN_ATTRIBUTE_DEFAULTS.SWAP_REMAINING_IN_TURN,
            ATTACKS_LEFT: PLAYER_TURN_ATTRIBUTE_DEFAULTS.ATTACKS_LEFT
        };
    }

    public formatPlayerTurnAttributeLabel (attributeKey: PlayerTurnAttributeKey): string
    {
        return attributeKey.toLowerCase().replace(/_/g, '-');
    }

    public parsePlayerTurnAttributeKey (rawAttribute: string): PlayerTurnAttributeKey | null
    {
        const normalized = rawAttribute.toUpperCase().replace(/[^A-Z0-9]+/g, '_');
        if (normalized in PLAYER_TURN_ATTRIBUTE_DEFAULTS) {
            return normalized as PlayerTurnAttributeKey;
        }

        return null;
    }

    private refreshPlayerStatsHud (): void
    {
        this.playerStatsHudController.refresh(this.activeViewMode, this.playerTurnAttributesByPlayer);
    }

    private handleCardActionButtonClick (actionKey: CardActionKey): void
    {
        const card = this.selectedCard;
        if (!card) {
            return;
        }

        const actionName = actionKey === 'active' ? 'activate-ability' : actionKey;
        const message = `${card.id} ${actionName}`;

        this.appendTerminalLine(message);
        this.emitBackendEvent('card_action', {
            action: actionName,
            card_id: card.id,
            card_type: card.getCardType(),
            owner_id: card.getOwnerId(),
            zone_id: card.getZoneId(),
            message
        });
    }

    private refreshCardActionButtons (): void
    {
        if (!this.cardActionButtons || this.cardActionButtons.length === 0) {
            return;
        }

        if (this.overlayPreviewContext) {
            for (const button of this.cardActionButtons) {
                button.body.setVisible(false);
                button.label.setVisible(false);
                button.body.setScale(1);
                button.label.setScale(1);
            }
            return;
        }

        const card = this.selectedCard;
        const isEligibleZone = card ? /-(hand|bench|active)$/.test(card.getZoneId()) : false;
        const isActiveSlot = Boolean(card && card.getZoneId() === `${card.getOwnerId()}-active`);
        const showAtk1 = Boolean(card && this.gamePhase === 'atk' && card.getCardType() === 'character' && isActiveSlot && card.hasAttackOne());
        const showAtk2 = Boolean(card && this.gamePhase === 'atk' && card.getCardType() === 'character' && isActiveSlot && card.hasAttackTwo());
        const showActive = Boolean(card && card.getCardType() === 'character' && isEligibleZone && card.hasActiveAbility());

        const radius = Math.max(12, Math.round((GAME_CARD_ACTION_BUTTON_LAYOUT.buttonRadiusBase / BASE_WIDTH) * GAME_WIDTH));
        const leftMargin = Math.round((GAME_CARD_ACTION_BUTTON_LAYOUT.leftMarginBase / BASE_WIDTH) * GAME_WIDTH);
        const bottomMargin = Math.round((GAME_CARD_ACTION_BUTTON_LAYOUT.bottomMarginBase / BASE_HEIGHT) * GAME_HEIGHT);
        const gap = Math.round((GAME_CARD_ACTION_BUTTON_LAYOUT.buttonGapBase / BASE_WIDTH) * GAME_WIDTH);
        const diameter = radius * 2;
        const anchorLeftX = leftMargin;
        const anchorY = GAME_HEIGHT - bottomMargin - radius;

        const visibleButtons: Array<{ key: CardActionKey; body: Phaser.GameObjects.Arc; label: Phaser.GameObjects.BitmapText }> = [];
        for (const button of this.cardActionButtons) {
            const visible =
                (button.key === 'atk1' && showAtk1) ||
                (button.key === 'atk2' && showAtk2) ||
                (button.key === 'active' && showActive);
            button.body.setScale(1);
            button.label.setScale(1);
            button.body.setVisible(visible);
            button.label.setVisible(visible);

            if (visible) {
                visibleButtons.push(button);
            }
        }

        if (visibleButtons.length === 0) {
            return;
        }

        const startX = anchorLeftX + radius;

        visibleButtons.forEach((button, index) => {
            const x = startX + (index * (diameter + gap));
            button.body.setPosition(x, anchorY);
            button.label.setPosition(x, anchorY);
        });
    }

    private showCardPreview (card: Card): void
    {
        this.cardPreviewController.show(card);
        this.refreshCardActionButtons();
    }

    private hideCardPreview (): void
    {
        this.cardPreviewController.hide();
        this.refreshCardActionButtons();
    }

    private appendTerminalLine (line: string): void
    {
        console.info(`[Command] ${line}`);
        this.emitBackendEvent('terminal_log', {
            line
        });
    }

    public scrollTerminalToLatest (): void
    {
        // Frontend terminal was removed; keep method for command processor compatibility.
    }

    private emitBackendEvent (eventType: string, responseData: Record<string, unknown>): void
    {
        void sendBackendEvent(eventType, responseData, {
            scene: 'Game',
            view_mode: this.activeViewMode,
            game_phase: this.gamePhase,
            player_turn: this.playerTurn
        });
    }

    public clearOverlayPreviewIfActive (): void
    {
        if (!this.overlayPreviewContext) {
            return;
        }

        this.overlayPreviewContext = null;
        this.hideCardPreview();
    }

    private startScannerWaitLoop (): void
    {
        if (this.scannerWaitLoopActive) {
            return;
        }

        this.scannerWaitLoopActive = true;
        this.events.once(Phaser.Scenes.Events.SHUTDOWN, () => {
            this.scannerWaitLoopActive = false;
        });

        void this.waitForScannerCommands();
    }

    private async waitForScannerCommands (): Promise<void>
    {
        while (this.scannerWaitLoopActive) {
            const scannerMessage = await waitForNextScannerCommand(25);
            if (!this.scannerWaitLoopActive) {
                break;
            }

            if (!scannerMessage) {
                continue;
            }

            this.emitBackendEvent('scanner_command_received', {
                source: scannerMessage.source,
                command: scannerMessage.command,
                received_at: scannerMessage.received_at ?? null
            });
            this.scannerCommandInProgress = true;
            try {
                this.commandProcessor.execute(scannerMessage.command);
            }
            finally {
                this.scannerCommandInProgress = false;
            }
        }
    }

    public resetDraggingCards (ownerId?: PlayerId): number
    {
        let resetCount = 0;
        const draggingCardIds = Array.from(this.activelyDraggedCardIds);

        for (const cardId of draggingCardIds) {
            const card = this.cardById[cardId];
            if (!card) {
                this.activelyDraggedCardIds.delete(cardId);
                this.dragOriginZoneByCardId.delete(cardId);
                this.dragStartPositionByCardId.delete(cardId);
                this.dragDistanceByCardId.delete(cardId);
                continue;
            }

            if (ownerId && card.getOwnerId() !== ownerId) {
                continue;
            }

            this.activelyDraggedCardIds.delete(cardId);
            this.dragOriginZoneByCardId.delete(cardId);
            this.dragStartPositionByCardId.delete(cardId);
            this.dragDistanceByCardId.delete(cardId);
            resetCount += 1;
        }

        if (resetCount > 0) {
            this.layoutAllHolders();
            this.redrawAllCardMarks();
        }

        return resetCount;
    }

    public getCardFromGameObject (gameObject: Phaser.GameObjects.Rectangle): Card | undefined
    {
        return this.cardByBody.get(gameObject);
    }

    private selectCard (card: Card): void
    {
        if (this.selectedCard === card) {
            this.selectedCard.setDepth(GAME_DEPTHS.cardSelected);
            this.selectedCard.redrawMarks();
            this.showCardPreview(this.selectedCard);
            return;
        }

        if (this.selectedCard) {
            const previouslySelectedCard = this.selectedCard;
            this.selectedCard.setSelected(false);
            this.scheduleAttachmentResync(previouslySelectedCard);
        }

        // Restore baseline holder depths before applying the temporary selection depth.
        this.layoutAllHolders();

        this.selectedCard = card;
        this.selectedCard.setSelected(true);
        this.selectedCard.setDepth(GAME_DEPTHS.cardSelected);
        this.selectedCard.redrawMarks();
        this.showCardPreview(this.selectedCard);
        this.scheduleAttachmentResync(this.selectedCard);
    }

    private clearCardSelection (): void
    {
        if (!this.selectedCard) {
            return;
        }

        const deselectedCard = this.selectedCard;
        this.selectedCard.setSelected(false);
        this.selectedCard = null;
        this.hideCardPreview();

        // Return all cards to their normal holder-controlled depths.
        this.layoutAllHolders();
        this.redrawAllCardMarks();
        this.scheduleAttachmentResync(deselectedCard);
    }

    private scheduleAttachmentResync (card: Card): void
    {
        // Selection animation runs for ~140ms, so keep attached entities synced through the tween.
        this.time.addEvent({
            delay: GAME_LAYOUT.selectionResyncDelayMs,
            repeat: GAME_LAYOUT.selectionResyncRepeats,
            callback: () => {
                this.updateAttachedChildrenPositions(card);
                this.redrawAllCardMarks();
            }
        });
    }

    private layoutAllHolders (): void
    {
        const preferredHorizontalStep = this.objectWidth + Math.round((GAME_LAYOUT.holderExtraHorizontalStepBase / BASE_WIDTH) * GAME_WIDTH);

        for (const holder of this.cardHolders) {
            if (holder.id === 'stadium') {
                continue;
            }

            holder.layoutHorizontal(this.objectWidth, preferredHorizontalStep, (card) => {
                this.updateAttachedChildrenPositions(card);
            });
        }

        this.layoutStadiumStack();
        this.layoutEnergyTokensInZone(this.energyZoneIdByOwner.p1);
        this.layoutEnergyTokensInZone(this.energyZoneIdByOwner.p2);
        this.layoutEnergyTokensInZone('energy-discard');
        this.applyCardVisibilityByView();
    }

    private applyBoardView (viewMode: ViewMode): void
    {
        this.activeViewMode = viewMode;
        this.surrenderController.disarm(false);
        const rotateTopBottom = viewMode === 'p2';

        for (const holder of this.cardHolders) {
            const basePosition = this.baseCardHolderPositionById[holder.id];
            if (!basePosition) {
                continue;
            }

            const x = basePosition.x;
            const y = rotateTopBottom ? ((GAME_CENTER_Y * 2) - basePosition.y) : basePosition.y;
            holder.setPosition(x, y);
        }

        for (const holder of this.energyHolders) {
            const basePosition = this.baseEnergyHolderPositionById[holder.id];
            if (!basePosition) {
                continue;
            }

            const x = basePosition.x;
            const y = rotateTopBottom ? ((GAME_CENTER_Y * 2) - basePosition.y) : basePosition.y;
            holder.setPosition(x, y);
        }

        this.layoutAllHolders();
        this.redrawAllCardMarks();
        this.refreshSurrenderButton();
        this.refreshPlayerStatsHud();
    }

    private applyCardVisibilityByView (): void
    {
        if (this.activeViewMode === 'admin') {
            for (const card of this.cards) {
                card.setTurnedOver(false);
            }
            return;
        }

        const hiddenOwner: PlayerId = this.activeViewMode === 'p1' ? 'p2' : 'p1';
        const visibleHandZone = `${this.activeViewMode}-hand`;
        const hiddenHandZone = `${hiddenOwner}-hand`;

        for (const card of this.cards) {
            const zoneId = card.getZoneId();
            if (zoneId === hiddenHandZone) {
                card.setTurnedOver(true);
                continue;
            }

            if (zoneId === visibleHandZone) {
                card.setTurnedOver(false);
            }
        }
    }

    public canActOnCard (card: Card): boolean
    {
        if (this.scannerCommandInProgress) {
            return true;
        }

        if (this.activeViewMode === 'admin') {
            return true;
        }

        if (card.isTurnedOver()) {
            return false;
        }

        return card.getOwnerId() === this.activeViewMode;
    }

    private canPreviewCard (card: Card): boolean
    {
        if (this.activeViewMode === 'admin') {
            return true;
        }

        if (card.isTurnedOver()) {
            return false;
        }

        return true;
    }

    public canDragCardByPhase (card: Card): boolean
    {
        if (this.gamePhase !== 'phase2') {
            return false;
        }

        return card.getOwnerId() === this.playerTurn;
    }

    public canActOnToken (token: EnergyToken): boolean
    {
        if (this.scannerCommandInProgress) {
            return true;
        }

        if (this.activeViewMode === 'admin') {
            return true;
        }

        return token.ownerId === this.activeViewMode;
    }

    public canDragTokenByPhase (token: EnergyToken): boolean
    {
        if (this.gamePhase !== 'phase2') {
            return false;
        }

        return token.ownerId === this.playerTurn;
    }

    public parseGamePhaseArg (rawPhase: string): GamePhase | null
    {
        const normalized = rawPhase.toLowerCase();
        if (normalized === 'no-input') {
            return 'no-input';
        }

        if (normalized === 'phase2') {
            return 'phase2';
        }

        if (normalized === 'atk') {
            return 'atk';
        }

        return null;
    }

    public parsePlayerTurnArg (rawTurn: string): PlayerId | null
    {
        const normalized = rawTurn.toLowerCase();
        if (normalized === 'p1' || normalized === 'player-1' || normalized === 'player1') {
            return 'p1';
        }

        if (normalized === 'p2' || normalized === 'player-2' || normalized === 'player2') {
            return 'p2';
        }

        return null;
    }

    public getPlayerTurnLabel (playerTurn: PlayerId): string
    {
        return playerTurn === 'p1' ? 'PLAYER-1' : 'PLAYER-2';
    }

    public setGamePhase (nextPhase: GamePhase): void
    {
        this.gamePhase = nextPhase;
        this.refreshCardActionButtons();

        if (nextPhase !== 'phase2') {
            this.activelyDraggedCardIds.clear();
            this.dragOriginZoneByCardId.clear();
            this.dragStartPositionByCardId.clear();
            this.dragDistanceByCardId.clear();
            this.activelyDraggedEnergyTokenIds.clear();
            this.energyDragStartPositionById.clear();
            this.energyDragDistanceById.clear();
        }
    }

    public setPlayerTurn (nextTurn: PlayerId): void
    {
        this.playerTurn = nextTurn;
    }

    public parseViewModeArg (rawMode: string): ViewMode | null
    {
        if (rawMode === 'admin') {
            return 'admin';
        }

        if (rawMode === 'p1' || rawMode === 'player-1' || rawMode === 'player1') {
            return 'p1';
        }

        if (rawMode === 'p2' || rawMode === 'player-2' || rawMode === 'player2') {
            return 'p2';
        }

        return null;
    }

    private getViewModeLabel (viewMode: ViewMode): string
    {
        if (viewMode === 'admin') {
            return 'ADMIN';
        }

        return viewMode === 'p1' ? 'PLAYER-1' : 'PLAYER-2';
    }

    private redrawAllCardMarks (): void
    {
        for (const card of this.cards) {
            card.redrawMarks();
        }

        if (this.selectedCard) {
            this.showCardPreview(this.selectedCard);
        }
    }

    public findOverlappedCard (
        card: Card,
        filter?: (otherCard: Card) => boolean
    ): Card | null
    {
        const droppedBounds = card.getBounds();
        const cardId = card.id;
        const attachedToCardId = card.getAttachedToCardId();
        let bestMatch: Card | null = null;
        let bestOverlapArea = -1;

        for (const otherCard of this.cards) {
            if (otherCard === card) {
                continue;
            }

            const otherCardId = otherCard.id;
            const otherAttachedToCardId = otherCard.getAttachedToCardId();

            // Ignore cards in the same direct attachment link (parent <-> child).
            if (otherAttachedToCardId === cardId || attachedToCardId === otherCardId) {
                continue;
            }

            if (filter && !filter(otherCard)) {
                continue;
            }

            const otherBounds = otherCard.getBounds();
            if (!Phaser.Geom.Intersects.RectangleToRectangle(droppedBounds, otherBounds)) {
                continue;
            }

            const overlapLeft = Math.max(droppedBounds.left, otherBounds.left);
            const overlapRight = Math.min(droppedBounds.right, otherBounds.right);
            const overlapTop = Math.max(droppedBounds.top, otherBounds.top);
            const overlapBottom = Math.min(droppedBounds.bottom, otherBounds.bottom);
            const overlapWidth = Math.max(0, overlapRight - overlapLeft);
            const overlapHeight = Math.max(0, overlapBottom - overlapTop);
            const overlapArea = overlapWidth * overlapHeight;

            if (overlapArea > bestOverlapArea) {
                bestOverlapArea = overlapArea;
                bestMatch = otherCard;
            }
        }

        return bestMatch;
    }

    public animateCardToZone (
        card: Card,
        zoneId: string,
        onComplete: () => void
    ): void
    {
        const holder = this.cardHolderById[zoneId];
        card.setDepth(GAME_DEPTHS.cardDragging);
        this.beginSceneAnimation();

        this.tweens.add({
            targets: card.body,
            x: holder.x,
            y: holder.y,
            duration: GAME_LAYOUT.cardMoveDurationMs,
            ease: 'Sine.easeInOut',
            onUpdate: () => {
                this.updateAttachedChildrenPositions(card);
                this.redrawAllCardMarks();
            },
            onComplete: () => {
                this.endSceneAnimation();
                onComplete();
            }
        });
    }

    public animateCardBetweenPoints (
        card: Card,
        fromX: number,
        fromY: number,
        toX: number,
        toY: number,
        onComplete: () => void
    ): void
    {
        card.setPosition(fromX, fromY);
        card.setDepth(GAME_DEPTHS.cardDragging);
        this.beginSceneAnimation();

        this.tweens.add({
            targets: card.body,
            x: toX,
            y: toY,
            duration: GAME_LAYOUT.cardMoveDurationMs,
            ease: 'Sine.easeInOut',
            onUpdate: () => {
                this.updateAttachedChildrenPositions(card);
                this.redrawAllCardMarks();
            },
            onComplete: () => {
                this.endSceneAnimation();
                onComplete();
            }
        });
    }

    public attachCardToCard (child: Card, parent: Card): void
    {
        if (child === parent) {
            return;
        }

        this.detachCard(child);

        const parentId = parent.id;
        const parentZoneId = parent.getZoneId();

        child.setAttachedToCardId(parentId);
        child.setZoneId(parentZoneId);
        child.setScale(GAME_LAYOUT.cardMoveToolScale);
        this.updateAttachedCardPosition(child, parent);
    }

    public animateToolAttachToCard (child: Card, parent: Card, onComplete?: () => void): void
    {
        if (child === parent) {
            if (onComplete) {
                onComplete();
            }
            return;
        }

        this.detachCard(child);
        this.removeCardFromAllHolders(child);
        child.setZoneId(parent.getZoneId());
        child.setAttachedToCardId(parent.id);
        child.setDepth(GAME_DEPTHS.cardDragging);

        const parentBounds = parent.getBounds();
        const edgePadding = GAME_LAYOUT.toolAttachmentEdgePadding;
        const targetScale = GAME_LAYOUT.cardMoveToolScale;
        const targetWidth = child.body.width * targetScale;
        const targetHeight = child.body.height * targetScale;
        const targetX = parentBounds.right - (targetWidth / 2) - edgePadding;
        const targetY = parentBounds.bottom - (targetHeight / 2) - edgePadding;

        const tweenState = {
            x: child.x,
            y: child.y,
            scale: child.body.scaleX
        };

        this.beginSceneAnimation();
        this.tweens.add({
            targets: tweenState,
            x: targetX,
            y: targetY,
            scale: targetScale,
            duration: GAME_LAYOUT.cardMoveDurationMs,
            ease: 'Sine.easeInOut',
            onUpdate: () => {
                child.setPosition(tweenState.x, tweenState.y);
                child.setScale(tweenState.scale);
                this.updateAttachedChildrenPositions(child);
                this.redrawAllCardMarks();
            },
            onComplete: () => {
                this.updateAttachedCardPosition(child, parent);
                this.updateAttachedChildrenPositions(parent);
                this.redrawAllCardMarks();
                this.endSceneAnimation();
                if (onComplete) {
                    onComplete();
                }
            }
        });
    }

    public getTopAttachmentTarget (baseCard: Card): Card
    {
        const attachedChildren = this.getAttachedChildren(baseCard.id);
        if (attachedChildren.length === 0) {
            return baseCard;
        }

        return attachedChildren.reduce((topCard, nextCard) => (nextCard.depth > topCard.depth ? nextCard : topCard));
    }

    private detachCard (card: Card): void
    {
        card.setAttachedToCardId(null);
        card.setScale(1);
    }

    private getAttachedChildren (parentCardId: string): Card[]
    {
        return this.cards.filter((card) => card.getAttachedToCardId() === parentCardId);
    }

    private updateAttachedChildrenPositions (parent: Card): void
    {
        const parentCardId = parent.id;
        const children = this.getAttachedChildren(parentCardId);

        for (const child of children) {
            this.updateAttachedCardPosition(child, parent);
        }

        this.updateAttachedEnergyTokenPositions(parent);
    }

    private getAttachedEnergyTokens (parentCardId: string): EnergyToken[]
    {
        return this.energyTokens
            .filter((token) => token.getAttachedToCardId() === parentCardId)
            .sort((a, b) => a.id - b.id);
    }

    private updateAttachedEnergyTokenPositions (parent: Card): void
    {
        const attachedTokens = this.getAttachedEnergyTokens(parent.id);
        if (attachedTokens.length === 0) {
            return;
        }

        const parentBounds = parent.getBounds();
        const tokenWidth = attachedTokens[0].getDisplayWidth();
        const tokenHeight = attachedTokens[0].getDisplayHeight();
        const horizontalStep = tokenWidth * GAME_LAYOUT.energyTokenAttachedHorizontalStepRatio;

        const startX = parentBounds.left + (tokenWidth / 2) + GAME_LAYOUT.energyTokenAttachedPadding;
        const y = parentBounds.bottom - (tokenHeight / 2) - GAME_LAYOUT.energyTokenAttachedPadding;

        attachedTokens.forEach((token, index) => {
            token.setPosition(startX + (index * horizontalStep), y);
            const tentativeDepth = ENERGY_TOKEN_DEPTHS.minAttached + index;
            token.setDepth(Math.min(ENERGY_TOKEN_DEPTHS.maxBelowUi, tentativeDepth));
        });
    }

    public findOverlappedOwnedCharacterForToken (token: EnergyToken): Card | null
    {
        const tokenBounds = token.getBounds();
        const ownerId = token.ownerId;

        if (token.getZoneId() !== this.energyZoneIdByOwner[ownerId]) {
            return null;
        }

        for (const card of this.cards) {
            if (card.getOwnerId() !== ownerId || card.getCardType() !== 'character') {
                continue;
            }

            const zoneId = card.getZoneId();
            if (zoneId !== `${ownerId}-bench` && zoneId !== `${ownerId}-active`) {
                continue;
            }

            if (Phaser.Geom.Intersects.RectangleToRectangle(tokenBounds, card.getBounds())) {
                return card;
            }
        }

        return null;
    }

    public attachEnergyTokenToCard (token: EnergyToken, parent: Card): void
    {
        token.setAttachedToCardId(parent.id);
        this.setEnergyTokenZone(token, this.energyZoneIdByOwner[token.ownerId]);
        this.updateAttachedEnergyTokenPositions(parent);
    }

    private layoutEnergyTokensInZone (zoneId: string): void
    {
        const holder = this.energyHolderById[zoneId];
        if (!holder) {
            return;
        }

        const zoneArea = holder.getBounds();

        const tokens = holder.tokens
            .filter((token) => !token.getAttachedToCardId())
            .sort((a, b) => a.id - b.id);

        if (tokens.length === 0) {
            return;
        }

        const columns = zoneId === 'energy-discard' ? GAME_LAYOUT.energyTokenZoneColumnsDiscard : GAME_LAYOUT.energyTokenZoneColumnsDefault;
        const rowGap = Math.max(GAME_LAYOUT.energyTokenZoneMinGapPx, Math.round(tokens[0].getDisplayHeight() * GAME_LAYOUT.energyTokenZoneRowGapRatio));
        const colGap = Math.max(GAME_LAYOUT.energyTokenZoneMinGapPx, Math.round(tokens[0].getDisplayWidth() * GAME_LAYOUT.energyTokenZoneColGapRatio));

        const startX = zoneArea.left + Math.round(zoneArea.width * GAME_LAYOUT.energyTokenZoneStartXRatio);
        const startY = zoneArea.top + Math.round(zoneArea.height * GAME_LAYOUT.energyTokenZoneStartYRatio);

        tokens.forEach((token, index) => {
            const row = Math.floor(index / columns);
            const col = index % columns;
            const x = startX + (col * (token.getDisplayWidth() + colGap));
            const y = startY + (row * (token.getDisplayHeight() + rowGap));
            const depth = ENERGY_TOKEN_DEPTHS.minZone + index;

            token.setPosition(x, y);
            token.setDepth(depth);
        });
    }

    public moveEnergyTokenToDiscard (token: EnergyToken): void
    {
        const attachedToCardId = token.getAttachedToCardId();
        if (attachedToCardId) {
            token.setAttachedToCardId(null);
        }

        this.setEnergyTokenZone(token, 'energy-discard');
        this.layoutEnergyTokensInZone('energy-discard');
    }

    private setEnergyTokenZone (token: EnergyToken, zoneId: string): void
    {
        const oldZoneId = token.getZoneId();
        if (oldZoneId === zoneId) {
            token.setZoneId(zoneId);
            return;
        }

        const oldHolder = this.energyHolderById[oldZoneId];
        if (oldHolder) {
            oldHolder.removeToken(token);
        }

        const newHolder = this.energyHolderById[zoneId];
        if (newHolder) {
            newHolder.addToken(token);
        }

        token.setZoneId(zoneId);
    }

    public resolveBoomTextureKey (rawAssetName?: string): string | null
    {
        if (!rawAssetName) {
            return 'pixelviolin';
        }

        const key = rawAssetName.toLowerCase();
        const aliases: Record<string, string> = {
            pixelviolin: 'pixelviolin',
            'pixelviolin.jpg': 'pixelviolin',
            background: 'background',
            bg: 'background',
            'bg.png': 'background',
            logo: 'logo',
            'logo.png': 'logo',
            minecraftfont: 'minecraftfont',
            'minecraftfont.png': 'minecraftfont',
            font2bitmap: 'font2bitmap',
            'font2bitmap.png': 'font2bitmap'
        };

        const resolved = aliases[key];
        if (!resolved) {
            return null;
        }

        return this.textures.exists(resolved) ? resolved : null;
    }

    public playPixelViolinExplosion (card: Card, textureKey: string): void
    {
        const durationMs = GAME_EXPLOSION.durationMs;
        const count = GAME_EXPLOSION.count;
        const baseScale = Math.max(GAME_EXPLOSION.minScale, this.objectWidth / GAME_EXPLOSION.scaleDivisor);

        for (let i = 0; i < count; i += 1) {
            const image = this.add.image(card.x, card.y, textureKey)
                .setDepth(GAME_DEPTHS.explosionBase + i)
                .setScale(baseScale * Phaser.Math.FloatBetween(GAME_EXPLOSION.scaleMinMultiplier, GAME_EXPLOSION.scaleMaxMultiplier))
                .setAlpha(1)
                .setAngle(Phaser.Math.Between(GAME_EXPLOSION.initialRotationMin, GAME_EXPLOSION.initialRotationMax));

            const angle = Phaser.Math.FloatBetween(0, Math.PI * 2);
            const distance = Phaser.Math.FloatBetween(this.objectWidth * GAME_EXPLOSION.distanceMinWidthRatio, this.objectWidth * GAME_EXPLOSION.distanceMaxWidthRatio);
            const targetX = card.x + (Math.cos(angle) * distance);
            const targetY = card.y + (Math.sin(angle) * distance);

            this.beginSceneAnimation();
            this.tweens.add({
                targets: image,
                x: targetX,
                y: targetY,
                alpha: 0,
                angle: image.angle + Phaser.Math.Between(GAME_EXPLOSION.rotationDeltaMin, GAME_EXPLOSION.rotationDeltaMax),
                duration: durationMs,
                ease: 'Cubic.easeOut',
                onComplete: () => {
                    image.destroy();
                    this.endSceneAnimation();
                }
            });
        }
    }

    private updateAttachedCardPosition (child: Card, parent: Card): void
    {
        const parentBounds = parent.getBounds();
        const childBounds = child.getBounds();
        const edgePadding = GAME_LAYOUT.toolAttachmentEdgePadding;
        const x = parentBounds.right - (childBounds.width / 2) - edgePadding;
        const y = parentBounds.bottom - (childBounds.height / 2) - edgePadding;

        child.setPosition(x, y);
        child.setDepth(parent.depth + GAME_DEPTHS.attachmentDepthOffset);
    }

    public playShuffleAnimationForPile (holder: CardHolder): boolean
    {
        const pileCards = holder.cards.slice();
        if (pileCards.length < GAME_SHUFFLE_ANIMATION.minCardsRequired) {
            return false;
        }

        const scatterX = Math.max(GAME_SHUFFLE_ANIMATION.scatterXMinPx, Math.round(this.objectWidth * GAME_SHUFFLE_ANIMATION.scatterXWidthRatio));
        const scatterY = Math.max(GAME_SHUFFLE_ANIMATION.scatterYMinPx, Math.round(this.objectHeight * GAME_SHUFFLE_ANIMATION.scatterYHeightRatio));
        const spreadDuration = Math.max(GAME_SHUFFLE_ANIMATION.spreadDurationMinMs, Math.round(GAME_LAYOUT.cardMoveDurationMs * GAME_SHUFFLE_ANIMATION.spreadDurationMoveDurationRatio));
        const settleDuration = Math.max(GAME_SHUFFLE_ANIMATION.settleDurationMinMs, Math.round(GAME_LAYOUT.cardMoveDurationMs * GAME_SHUFFLE_ANIMATION.settleDurationMoveDurationRatio));

        this.beginSceneAnimation();
        let pendingCards = pileCards.length;

        pileCards.forEach((card, index) => {
            const startX = card.x;
            const startY = card.y;
            const shuffleX = startX + Phaser.Math.Between(-scatterX, scatterX);
            const shuffleY = startY + Phaser.Math.Between(-scatterY, scatterY);

            card.setDepth(GAME_DEPTHS.cardDragging + index);

            this.tweens.add({
                targets: card.body,
                x: shuffleX,
                y: shuffleY,
                duration: spreadDuration,
                delay: index * GAME_SHUFFLE_ANIMATION.cardDelayStepMs,
                ease: 'Sine.easeOut',
                onUpdate: () => {
                    card.redrawMarks();
                    this.updateAttachedChildrenPositions(card);
                },
                onComplete: () => {
                    this.tweens.add({
                        targets: card.body,
                        x: startX,
                        y: startY,
                        duration: settleDuration,
                        ease: 'Sine.easeInOut',
                        onUpdate: () => {
                            card.redrawMarks();
                            this.updateAttachedChildrenPositions(card);
                        },
                        onComplete: () => {
                            pendingCards -= 1;
                            if (pendingCards === 0) {
                                this.layoutAllHolders();
                                this.redrawAllCardMarks();
                                this.endSceneAnimation();
                            }
                        }
                    });
                }
            });
        });

        return true;
    }

    private removeCardFromAllHolders (card: Card): void
    {
        for (const holder of this.cardHolders) {
            holder.removeCard(card);
        }
    }

    private moveCardToZone (card: Card, zoneId: string, onComplete?: () => void, insertIndex?: number): void
    {
        const originZoneId = card.getZoneId();
        const requiresFaceFlipBeforeMove = this.isFaceDownZone(originZoneId) !== this.isFaceDownZone(zoneId);

        const completeMove = () => {
            this.detachCard(card);
            this.removeCardFromAllHolders(card);
            const targetHolder = this.cardHolderById[zoneId];
            if (insertIndex !== undefined) {
                targetHolder.insertCard(card, insertIndex);
            }
            else {
                targetHolder.addCard(card);
            }
            card.setZoneId(zoneId);
            if (onComplete) {
                onComplete();
            }
        };

        if (requiresFaceFlipBeforeMove) {
            card.flip(() => {
                completeMove();
            });
            return;
        }

        completeMove();
    }

    public sendCardToOwnerDiscard (card: Card, onComplete?: () => void): void
    {
        const discardZone = `${card.getOwnerId()}-discard`;
        this.moveCardToZone(card, discardZone, onComplete);
    }

    private isFaceDownZone (zoneId: string): boolean
    {
        return zoneId.endsWith('-discard') || zoneId.endsWith('-deck');
    }

    private layoutStadiumStack (): void
    {
        const stadiumHolder = this.cardHolderById['stadium'];
        if (!stadiumHolder) {
            return;
        }

        stadiumHolder.cards.forEach((card, index) => {
            card.setPosition(stadiumHolder.x, stadiumHolder.y);
            card.setDepth(card.getSelected() ? GAME_DEPTHS.cardSelected : (GAME_DEPTHS.stadiumBase + index));
        });
    }

}
