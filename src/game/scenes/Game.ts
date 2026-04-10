import { Scene } from 'phaser';

import { Card, CardHolder, CardHolderConfig, EnergyHolder, EnergyHolderConfig, EnergyToken, PlayerId } from '../entities';
import {
    BASE_HEIGHT,
    BASE_WIDTH,
    BOARD_SCALE,
    CARD_BASE_HEIGHT,
    CARD_BASE_WIDTH,
    CARDHOLDER_BASE_WIDTH,
    CARDHOLDER_HEIGHT_MULTIPLIER,
    ENERGYHOLDER_LAYOUT,
    CARDHOLDER_SPACING_MULTIPLIERS,
    GAME_CENTER_X,
    GAME_CENTER_Y,
    GAME_HEIGHT,
    GAME_WIDTH,
    UI_SCALE
} from '../config';

export class Game extends Scene
{
    camera: Phaser.Cameras.Scene2D.Camera;
    background: Phaser.GameObjects.Image;

    cards: Card[];
    cardById: Record<string, Card>;
    cardByBody: Map<Phaser.GameObjects.Rectangle, Card>;
    selectedCard: Card | null;
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

    energyZoneIdByOwner: Record<PlayerId, string>;
    activeViewPlayerId: PlayerId;
    baseCardHolderPositionById: Record<string, { x: number; y: number }>;
    baseEnergyHolderPositionById: Record<string, { x: number; y: number }>;

    objectWidth: number;
    objectHeight: number;

    terminalLines: string[];
    terminalInput: string;
    terminalOutputText: Phaser.GameObjects.BitmapText;
    terminalInputText: Phaser.GameObjects.BitmapText;
    maxTerminalLines: number;
    terminalVisibleLineCount: number;
    terminalScrollOffset: number;
    terminalPanelBounds: Phaser.Geom.Rectangle;
    terminalCursorVisible: boolean;
    terminalOutputMaskGraphics: Phaser.GameObjects.Graphics;

    cardPreviewPanel: Phaser.GameObjects.Rectangle;
    cardPreviewBody: Phaser.GameObjects.Rectangle;
    cardPreviewIdText: Phaser.GameObjects.BitmapText;
    cardPreviewTypeText: Phaser.GameObjects.BitmapText;
    cardPreviewParagraphText: Phaser.GameObjects.BitmapText;

    constructor ()
    {
        super('Game');
    }

    preload ()
    {
        this.load.setPath('assets');
        this.load.image('background', 'bg.png');
        this.load.image('pixelviolin', 'pixelviolin.jpg');
        this.load.bitmapFont('minogram', 'minogram_6x10.png', 'minogram_6x10.xml');
    }

    create ()
    {
        this.camera = this.cameras.main;
        this.camera.setBackgroundColor(0x00ff00);
        this.camera.roundPixels = true;

        this.background = this.add.image(GAME_CENTER_X, GAME_CENTER_Y, 'background');
        this.background.setDisplaySize(GAME_WIDTH, GAME_HEIGHT);
        this.background.setAlpha(0.5);

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
        this.activeViewPlayerId = 'p1';

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

        const cardTemplates: Array<{ ownerId: 'p1' | 'p2'; cardType: 'character' | 'tool' | 'item' | 'stadium' }> = [
            { ownerId: 'p1', cardType: 'character' },
            { ownerId: 'p1', cardType: 'character' },
            { ownerId: 'p1', cardType: 'character' },
            { ownerId: 'p1', cardType: 'character' },
            { ownerId: 'p1', cardType: 'character' },
            { ownerId: 'p1', cardType: 'character' },
            { ownerId: 'p1', cardType: 'character' },
            { ownerId: 'p1', cardType: 'character' },
            { ownerId: 'p1', cardType: 'character' },
            { ownerId: 'p1', cardType: 'character' },
            { ownerId: 'p1', cardType: 'tool' },
            { ownerId: 'p1', cardType: 'item' },
            { ownerId: 'p1', cardType: 'stadium' },
            { ownerId: 'p2', cardType: 'character' },
            { ownerId: 'p2', cardType: 'tool' },
            { ownerId: 'p2', cardType: 'item' },
            { ownerId: 'p2', cardType: 'stadium' }
        ];

        cardTemplates.forEach((template, index) => {
            const zoneId = `${template.ownerId}-hand`;
            const startingHolder = this.cardHolderById[zoneId];
            const cardId = `CARD-${index + 1}`;

            const card = new Card(this, {
                id: cardId,
                cardType: template.cardType,
                ownerId: template.ownerId,
                x: startingHolder.x,
                y: startingHolder.y,
                width: this.objectWidth,
                height: this.objectHeight,
                color: cardTypeColors[template.cardType],
                zoneId
            });

            this.cards.push(card);
            this.cardById[card.id] = card;
            this.cardByBody.set(card.body, card);
            startingHolder.addCard(card);
            this.input.setDraggable(card.body);

            card.body.on('pointerdown', () => {
                this.selectCard(card);
            });
        });

        this.input.on('pointerdown', (_pointer: Phaser.Input.Pointer, currentlyOver: Phaser.GameObjects.GameObject[]) => {
            const clickedCard = currentlyOver.some((gameObject) => gameObject instanceof Phaser.GameObjects.Rectangle && this.cardByBody.has(gameObject as Phaser.GameObjects.Rectangle));
            if (!clickedCard) {
                this.clearCardSelection();
            }
        });

        this.createCommandTerminal();
        this.createCardPreviewPanel();

        this.layoutAllHolders();
        this.redrawAllCardMarks();
        this.applyBoardView(this.activeViewPlayerId);

        this.input.on('dragstart', (_pointer: Phaser.Input.Pointer, gameObject: Phaser.GameObjects.Rectangle) => {
            const card = this.getCardFromGameObject(gameObject);
            if (!card) {
                return;
            }

            const zoneId = card.getZoneId();
            if (zoneId.endsWith('-discard') || zoneId.endsWith('-deck')) {
                return;
            }

            this.activelyDraggedCardIds.add(card.id);
            this.dragOriginZoneByCardId.set(card.id, zoneId);
            this.dragStartPositionByCardId.set(card.id, { x: card.x, y: card.y });
            this.dragDistanceByCardId.set(card.id, 0);
        });

        this.input.on('drag', (_pointer: Phaser.Input.Pointer, gameObject: Phaser.GameObjects.Rectangle, dragX: number, dragY: number) => {
            const card = this.getCardFromGameObject(gameObject);
            if (!card) {
                return;
            }

            if (!this.activelyDraggedCardIds.has(card.id)) {
                return;
            }

            const attachedToCardId = card.getAttachedToCardId();
            if (attachedToCardId) {
                const parentCard = this.cardById[attachedToCardId];
                if (parentCard) {
                    this.updateAttachedCardPosition(card, parentCard);
                    this.redrawAllCardMarks();
                }
                return;
            }

            card.setPosition(dragX, dragY);
            card.setDepth(1000);

            const dragStartPosition = this.dragStartPositionByCardId.get(card.id);
            if (dragStartPosition) {
                const movedDistance = Phaser.Math.Distance.Between(dragStartPosition.x, dragStartPosition.y, dragX, dragY);
                const priorMaxDistance = this.dragDistanceByCardId.get(card.id) ?? 0;
                if (movedDistance > priorMaxDistance) {
                    this.dragDistanceByCardId.set(card.id, movedDistance);
                }
            }

            this.updateAttachedChildrenPositions(card);
            this.redrawAllCardMarks();
        });

        this.input.on('drop', (_pointer: Phaser.Input.Pointer, gameObject: Phaser.GameObjects.Rectangle, dropZone: Phaser.GameObjects.Zone) => {
            const card = this.getCardFromGameObject(gameObject);
            if (!card) {
                return;
            }

            // Ignore click/release over zones unless this card was actively dragged.
            if (!this.activelyDraggedCardIds.has(card.id)) {
                return;
            }

            this.activelyDraggedCardIds.delete(card.id);

            const dragStartPosition = this.dragStartPositionByCardId.get(card.id);
            const draggedDistance = this.dragDistanceByCardId.get(card.id) ?? 0;
            const originZoneId = this.dragOriginZoneByCardId.get(card.id) ?? card.getZoneId();
            this.dragOriginZoneByCardId.delete(card.id);
            this.dragStartPositionByCardId.delete(card.id);
            this.dragDistanceByCardId.delete(card.id);
            const minDragDistance = Math.max(8, Math.round(this.objectWidth * 0.08));

            if (dragStartPosition) {
                if (draggedDistance < minDragDistance) {
                    this.layoutAllHolders();
                    this.redrawAllCardMarks();
                    return;
                }
            }

            const targetZoneId = dropZone.getData('zoneId') as string;
            const droppingIntoDiscard = targetZoneId === 'p1-discard';
            const overlappedCard = droppingIntoDiscard ? null : this.findOverlappedCard(card);
            const ownerId = card.getOwnerId();
            const ownerHandZone = `${ownerId}-hand`;
            const ownerBenchZone = `${ownerId}-bench`;
            const ownerActiveZone = `${ownerId}-active`;
            const cardType = card.getCardType();

            if (cardType === 'character') {
                const validCharacterMove =
                    (originZoneId === ownerHandZone && targetZoneId === ownerBenchZone) ||
                    (originZoneId === ownerBenchZone && targetZoneId === ownerActiveZone) ||
                    (originZoneId === ownerActiveZone && targetZoneId === ownerBenchZone);

                if (!validCharacterMove) {
                    this.layoutAllHolders();
                    this.redrawAllCardMarks();
                    return;
                }

                this.moveCardToZone(card, targetZoneId, () => {
                    this.layoutAllHolders();
                    this.redrawAllCardMarks();
                });
                return;
            }

            if (cardType === 'tool') {
                const fromHand = originZoneId === ownerHandZone;
                const onOwnBattleZone = targetZoneId === ownerBenchZone || targetZoneId === ownerActiveZone;

                if (!fromHand || !onOwnBattleZone || !overlappedCard) {
                    this.layoutAllHolders();
                    this.redrawAllCardMarks();
                    return;
                }

                if (overlappedCard.getOwnerId() !== ownerId || overlappedCard.getCardType() !== 'character') {
                    this.layoutAllHolders();
                    this.redrawAllCardMarks();
                    return;
                }

                const attachedChildren = this.getAttachedChildren(overlappedCard.id);
                const attachTarget = attachedChildren.length > 0
                    ? attachedChildren.reduce((topCard, nextCard) => (nextCard.depth > topCard.depth ? nextCard : topCard))
                    : overlappedCard;

                this.removeCardFromAllHolders(card);
                card.setZoneId(targetZoneId);
                this.attachCardToCard(card, attachTarget);
                this.layoutAllHolders();
                this.redrawAllCardMarks();
                return;
            }

            if (cardType === 'item') {
                if (originZoneId !== ownerHandZone) {
                    this.layoutAllHolders();
                    this.redrawAllCardMarks();
                    return;
                }

                if (targetZoneId === ownerHandZone) {
                    this.moveCardToZone(card, ownerHandZone, () => {
                        this.layoutAllHolders();
                        this.redrawAllCardMarks();
                    });
                }
                else {
                    this.sendCardToOwnerDiscard(card, () => {
                        this.layoutAllHolders();
                        this.redrawAllCardMarks();
                    });
                }
                return;
            }

            if (cardType === 'stadium') {
                if (originZoneId !== ownerHandZone || targetZoneId !== 'stadium') {
                    this.layoutAllHolders();
                    this.redrawAllCardMarks();
                    return;
                }

                this.moveCardToZone(card, 'stadium', () => {
                    this.layoutAllHolders();
                    this.redrawAllCardMarks();
                });
                return;
            }

            this.layoutAllHolders();
            this.redrawAllCardMarks();
        });

        this.input.on('dragend', (_pointer: Phaser.Input.Pointer, gameObject: Phaser.GameObjects.Rectangle, dropped: boolean) => {
            const card = this.getCardFromGameObject(gameObject);
            if (!card) {
                return;
            }

            const wasDragged = this.activelyDraggedCardIds.has(card.id);
            const draggedDistance = this.dragDistanceByCardId.get(card.id) ?? 0;
            const originZoneId = this.dragOriginZoneByCardId.get(card.id) ?? card.getZoneId();
            const minDragDistance = Math.max(8, Math.round(this.objectWidth * 0.08));

            this.activelyDraggedCardIds.delete(card.id);
            this.dragOriginZoneByCardId.delete(card.id);
            this.dragStartPositionByCardId.delete(card.id);
            this.dragDistanceByCardId.delete(card.id);

            if (!dropped) {
                const ownerHandZone = `${card.getOwnerId()}-hand`;
                const isItemDiscardFromFreeDrop =
                    wasDragged &&
                    draggedDistance >= minDragDistance &&
                    card.getCardType() === 'item' &&
                    originZoneId === ownerHandZone;

                if (isItemDiscardFromFreeDrop) {
                    this.sendCardToOwnerDiscard(card, () => {
                        this.layoutAllHolders();
                        this.updateAttachedChildrenPositions(card);
                        this.redrawAllCardMarks();
                    });
                    return;
                }

                this.layoutAllHolders();
                this.updateAttachedChildrenPositions(card);
            }

            this.redrawAllCardMarks();
        });

        this.input.on('dragstart', (_pointer: Phaser.Input.Pointer, gameObject: Phaser.GameObjects.GameObject) => {
            const token = this.energyTokenByBody.get(gameObject);
            if (!token || token.getAttachedToCardId()) {
                return;
            }

            this.activelyDraggedEnergyTokenIds.add(token.id);
            this.energyDragStartPositionById.set(token.id, { x: token.x, y: token.y });
            this.energyDragDistanceById.set(token.id, 0);
            token.setDepth(1200);
        });

        this.input.on('drag', (_pointer: Phaser.Input.Pointer, gameObject: Phaser.GameObjects.GameObject, dragX: number, dragY: number) => {
            const token = this.energyTokenByBody.get(gameObject);
            if (!token || !this.activelyDraggedEnergyTokenIds.has(token.id)) {
                return;
            }

            token.setPosition(dragX, dragY);

            const dragStartPosition = this.energyDragStartPositionById.get(token.id);
            if (dragStartPosition) {
                const movedDistance = Phaser.Math.Distance.Between(dragStartPosition.x, dragStartPosition.y, dragX, dragY);
                const priorMaxDistance = this.energyDragDistanceById.get(token.id) ?? 0;
                if (movedDistance > priorMaxDistance) {
                    this.energyDragDistanceById.set(token.id, movedDistance);
                }
            }
        });

        this.input.on('drop', (_pointer: Phaser.Input.Pointer, gameObject: Phaser.GameObjects.GameObject, dropZone: Phaser.GameObjects.Zone) => {
            const token = this.energyTokenByBody.get(gameObject);
            if (!token || !this.activelyDraggedEnergyTokenIds.has(token.id)) {
                return;
            }

            this.activelyDraggedEnergyTokenIds.delete(token.id);
            this.energyDragStartPositionById.delete(token.id);
            this.energyDragDistanceById.delete(token.id);

            const ownerEnergyZoneId = this.energyZoneIdByOwner[token.ownerId];
            const targetZoneId = (dropZone?.getData('zoneId') as string | undefined) ?? null;
            const characterTarget = this.findOverlappedOwnedCharacterForToken(token);

            if (characterTarget) {
                this.attachEnergyTokenToCard(token, characterTarget);
                return;
            }

            if (targetZoneId === ownerEnergyZoneId) {
                token.setAttachedToCardId(null);
                this.setEnergyTokenZone(token, ownerEnergyZoneId);
                this.layoutEnergyTokensInZone(ownerEnergyZoneId);
                return;
            }

            this.layoutEnergyTokensInZone(token.getZoneId());
        });

        this.input.on('dragend', (_pointer: Phaser.Input.Pointer, gameObject: Phaser.GameObjects.GameObject, dropped: boolean) => {
            const token = this.energyTokenByBody.get(gameObject);
            if (!token) {
                return;
            }

            this.activelyDraggedEnergyTokenIds.delete(token.id);
            this.energyDragStartPositionById.delete(token.id);
            this.energyDragDistanceById.delete(token.id);

            if (!dropped) {
                this.layoutEnergyTokensInZone(token.getZoneId());
            }
        });
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
        const makeTokensForOwner = (ownerId: PlayerId, idStart: number) => {
            const zoneId = this.energyZoneIdByOwner[ownerId];
            const holder = this.energyHolderById[zoneId];
            const radius = Math.max(10, Math.round(this.objectWidth * 0.14));

            for (let i = 0; i < 10; i += 1) {
                const tokenId = idStart + i;
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
        };

        makeTokensForOwner('p1', 1);
        makeTokensForOwner('p2', 11);
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
        const stadiumX = leftSideX - (spacing * 1.8);

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

    private createCommandTerminal (): void
    {
        const panelWidth = Math.round((220 / BASE_WIDTH) * GAME_WIDTH);
        const panelHeight = Math.round((220 / BASE_HEIGHT) * GAME_HEIGHT);
        const marginX = Math.round((24 / BASE_WIDTH) * GAME_WIDTH);
        const marginY = Math.round((24 / BASE_HEIGHT) * GAME_HEIGHT);
        const panelX = GAME_WIDTH - marginX - Math.round(panelWidth / 2);
        const panelY = marginY + Math.round(panelHeight / 2);
        const textScale = UI_SCALE * 1.35;
        const titleSize = Math.max(14, Math.round(14 * textScale));
        const outputSize = Math.max(10, Math.round(11 * textScale));
        const inputSize = Math.max(12, Math.round(12 * textScale));
        const leftPadding = Math.round(panelWidth * 0.07);
        const contentWidth = panelWidth - (leftPadding * 2);
        const topY = panelY - Math.round(panelHeight / 2);
        const bottomY = panelY + Math.round(panelHeight / 2);
        const outputTopY = topY + Math.round(panelHeight * 0.20);
        const inputStripHeight = Math.max(22, Math.round(panelHeight * 0.15));
        const inputStripTopY = bottomY - inputStripHeight - Math.round(panelHeight * 0.03);
        const outputBottomY = inputStripTopY - Math.round(panelHeight * 0.03);
        const inputY = bottomY - Math.round(panelHeight * 0.09);

        this.add.rectangle(panelX, panelY, panelWidth, panelHeight, 0x0b132b, 0.92)
            .setStrokeStyle(2, 0xffffff, 0.7)
            .setDepth(30);

        this.terminalPanelBounds = new Phaser.Geom.Rectangle(
            panelX - Math.round(panelWidth / 2),
            panelY - Math.round(panelHeight / 2),
            panelWidth,
            panelHeight
        );

        this.add.bitmapText(panelX, topY + Math.round(panelHeight * 0.06), 'minogram', 'COMMAND TERMINAL', titleSize)
            .setOrigin(0.5)
            .setTint(0xffffff)
            .setDepth(31);

        this.terminalLines = [
            'Ready.',
            'Examples: mv CARD-2 p1-discard',
            '          mv CARD-2 p1-hand 0',
            '          flip CARD-2',
            '          rm 3',
            '          boom CARD-1',
            '          view p2'
        ];
        this.terminalInput = '';
        this.maxTerminalLines = 300;
        this.terminalScrollOffset = 0;
        this.terminalCursorVisible = true;
        this.terminalVisibleLineCount = Math.max(4, Math.floor((outputBottomY - outputTopY) / Math.max(1, outputSize)) - 1);

        this.terminalOutputText = this.add.bitmapText(panelX - Math.round(panelWidth / 2) + leftPadding, outputTopY, 'minogram', '', outputSize)
            .setOrigin(0, 0)
            .setTint(0xd6e8ff)
            .setMaxWidth(contentWidth)
            .setDepth(31);

        this.terminalOutputMaskGraphics = this.add.graphics();
        this.terminalOutputMaskGraphics.fillStyle(0xffffff, 1);
        this.terminalOutputMaskGraphics.fillRect(
            panelX - Math.round(panelWidth / 2) + leftPadding,
            outputTopY,
            contentWidth,
            Math.max(1, outputBottomY - outputTopY)
        );
        this.terminalOutputText.setMask(this.terminalOutputMaskGraphics.createGeometryMask());

        this.add.rectangle(panelX, inputStripTopY + Math.round(inputStripHeight / 2), panelWidth - Math.round(panelWidth * 0.06), inputStripHeight, 0x0f172a, 0.95)
            .setStrokeStyle(1, 0xffffff, 0.35)
            .setDepth(31.2);

        this.terminalInputText = this.add.bitmapText(panelX - Math.round(panelWidth / 2) + leftPadding, inputY, 'minogram', '', inputSize)
            .setOrigin(0, 0)
            .setTint(0xffffff)
            .setDepth(31.3);

        this.refreshTerminalText();

        this.time.addEvent({
            delay: 450,
            loop: true,
            callback: () => {
                this.terminalCursorVisible = !this.terminalCursorVisible;
                this.refreshTerminalText();
            }
        });

        this.input.keyboard?.on('keydown', (event: KeyboardEvent) => {
            if (event.key === 'ArrowUp') {
                this.scrollTerminalBy(1);
                return;
            }

            if (event.key === 'ArrowDown') {
                this.scrollTerminalBy(-1);
                return;
            }

            if (event.key === 'PageUp') {
                this.scrollTerminalBy(this.terminalVisibleLineCount);
                return;
            }

            if (event.key === 'PageDown') {
                this.scrollTerminalBy(-this.terminalVisibleLineCount);
                return;
            }

            if (event.key === 'End') {
                this.terminalScrollOffset = 0;
                this.refreshTerminalText();
                return;
            }

            if (event.key === 'Backspace') {
                this.terminalInput = this.terminalInput.slice(0, -1);
                this.refreshTerminalText();
                return;
            }

            if (event.key === 'Enter') {
                this.executeTerminalCommand(this.terminalInput.trim());
                this.terminalInput = '';
                this.refreshTerminalText();
                return;
            }

            if (event.key === 'Escape') {
                this.terminalInput = '';
                this.refreshTerminalText();
                return;
            }

            if (event.key.length === 1 && this.terminalInput.length < 40) {
                this.terminalInput += event.key;
                this.refreshTerminalText();
            }
        });

        this.input.on('wheel', (pointer: Phaser.Input.Pointer, _gameObjects: Phaser.GameObjects.GameObject[], _deltaX: number, deltaY: number) => {
            if (!this.terminalPanelBounds.contains(pointer.worldX, pointer.worldY)) {
                return;
            }

            const step = deltaY > 0 ? 2 : -2;
            this.scrollTerminalBy(step);
        });
    }

    private createCardPreviewPanel (): void
    {
        const panelWidth = Math.round((260 / BASE_WIDTH) * GAME_WIDTH);
        const panelHeight = Math.round((340 / BASE_HEIGHT) * GAME_HEIGHT);
        const gapY = Math.round((20 / BASE_HEIGHT) * GAME_HEIGHT);
        const sideMargin = Math.round((24 / BASE_WIDTH) * GAME_WIDTH);

        const terminalCenterX = this.terminalPanelBounds.centerX;
        const previewYFromTerminal = this.terminalPanelBounds.bottom + gapY + Math.round(panelHeight / 2);
        const clampedY = Phaser.Math.Clamp(
            previewYFromTerminal,
            Math.round(panelHeight / 2) + sideMargin,
            GAME_HEIGHT - Math.round(panelHeight / 2) - sideMargin
        );

        const panelX = terminalCenterX;
        const panelY = clampedY;
        const topY = panelY - Math.round(panelHeight / 2);
        const leftX = panelX - Math.round(panelWidth / 2);

        const previewCardWidth = Math.round(this.objectWidth * 1.9);
        const previewCardHeight = Math.round(this.objectHeight * 1.9);
        const previewCardCenterY = topY + Math.round(panelHeight * 0.34);

        this.cardPreviewPanel = this.add.rectangle(panelX, panelY, panelWidth, panelHeight, 0x101828, 0.92)
            .setStrokeStyle(2, 0xffffff, 0.7)
            .setDepth(30)
            .setVisible(false);

        this.cardPreviewBody = this.add.rectangle(panelX, previewCardCenterY, previewCardWidth, previewCardHeight, 0x1f2937, 1)
            .setStrokeStyle(4, 0xffffff, 1)
            .setDepth(31)
            .setVisible(false);

        this.cardPreviewIdText = this.add.bitmapText(panelX, previewCardCenterY - Math.round(previewCardHeight * 0.16), 'minogram', '', Math.max(14, Math.round(16 * UI_SCALE)))
            .setOrigin(0.5)
            .setTint(0xffffff)
            .setDepth(32)
            .setVisible(false);

        this.cardPreviewTypeText = this.add.bitmapText(panelX, previewCardCenterY + Math.round(previewCardHeight * 0.16), 'minogram', '', Math.max(12, Math.round(14 * UI_SCALE)))
            .setOrigin(0.5)
            .setTint(0xcde7ff)
            .setDepth(32)
            .setVisible(false);

        this.cardPreviewParagraphText = this.add.bitmapText(
            leftX + Math.round(panelWidth * 0.08),
            topY + Math.round(panelHeight * 0.70),
            'minogram',
            '',
            Math.max(9, Math.round(10 * UI_SCALE))
        )
            .setOrigin(0, 0)
            .setTint(0xe2e8f0)
            .setMaxWidth(Math.round(panelWidth * 0.84))
            .setDepth(32)
            .setVisible(false);
    }

    private showCardPreview (card: Card): void
    {
        const isFaceDown = card.isTurnedOver();

        this.cardPreviewPanel.setVisible(true);
        this.cardPreviewBody
            .setVisible(true)
            .setFillStyle(isFaceDown ? 0x1f2937 : card.baseColor, 1);

        this.cardPreviewIdText
            .setVisible(true)
            .setText(card.id);

        this.cardPreviewTypeText
            .setVisible(true)
            .setText(card.getCardType().toUpperCase());

        this.cardPreviewParagraphText
            .setVisible(true)
            .setText(
                `Preview panel: ${card.id} (${card.getCardType().toUpperCase()})\n` +
                `Owner: ${card.getOwnerId().toUpperCase()}\n` +
                `Status: ${isFaceDown ? 'TURNED OVER' : 'FACE UP'}\n\n` +
                'This is an expanded inspection view, separate from the in-play card. It only appears while the card is selected.'
            );
    }

    private hideCardPreview (): void
    {
        this.cardPreviewPanel.setVisible(false);
        this.cardPreviewBody.setVisible(false);
        this.cardPreviewIdText.setVisible(false);
        this.cardPreviewTypeText.setVisible(false);
        this.cardPreviewParagraphText.setVisible(false);
    }

    private appendTerminalLine (line: string): void
    {
        this.terminalLines.push(line);
        if (this.terminalScrollOffset > 0) {
            this.terminalScrollOffset += 1;
        }
        if (this.terminalLines.length > this.maxTerminalLines) {
            const removed = this.terminalLines.length - this.maxTerminalLines;
            this.terminalLines.splice(0, removed);
            this.terminalScrollOffset = Math.max(0, this.terminalScrollOffset - removed);
        }
        this.clampTerminalScrollOffset();
        this.refreshTerminalText();
    }

    private refreshTerminalText (): void
    {
        const totalLines = this.terminalLines.length;
        const visibleCount = this.terminalVisibleLineCount;
        const maxOffset = Math.max(0, totalLines - visibleCount);
        const offset = Phaser.Math.Clamp(this.terminalScrollOffset, 0, maxOffset);

        const endIndex = totalLines - offset;
        const startIndex = Math.max(0, endIndex - visibleCount);
        this.terminalOutputText.setText(this.terminalLines.slice(startIndex, endIndex).join('\n'));

        const cursor = this.terminalCursorVisible ? '_' : ' ';
        this.terminalInputText.setText(`> ${this.terminalInput}${cursor}`);
    }

    private scrollTerminalBy (delta: number): void
    {
        this.terminalScrollOffset += delta;
        this.clampTerminalScrollOffset();
        this.refreshTerminalText();
    }

    private clampTerminalScrollOffset (): void
    {
        const maxOffset = Math.max(0, this.terminalLines.length - this.terminalVisibleLineCount);
        this.terminalScrollOffset = Phaser.Math.Clamp(this.terminalScrollOffset, 0, maxOffset);
    }

    private executeTerminalCommand (command: string): void
    {
        if (!command) {
            return;
        }

        this.appendTerminalLine(`> ${command}`);

        const [rawAction, rawArgOne, rawArgTwo, rawArgThree] = command.split(/\s+/);
        const action = rawAction.toLowerCase();

        if (action === 'rm') {
            if (!rawArgOne) {
                this.appendTerminalLine('Usage: rm [energyid]');
                return;
            }

            const tokenId = Number(rawArgOne);
            if (!Number.isInteger(tokenId)) {
                this.appendTerminalLine(`Invalid energy id: ${rawArgOne}`);
                return;
            }

            const token = this.energyTokenById[tokenId];
            if (!token) {
                this.appendTerminalLine(`Unknown energy token: ${tokenId}`);
                return;
            }

            this.moveEnergyTokenToDiscard(token);
            this.appendTerminalLine(`ENERGY-${tokenId} -> energy-discard`);
            return;
        }

        if (action === 'flip') {
            if (!rawArgOne) {
                this.appendTerminalLine('Usage: flip [cardid]');
                return;
            }

            const cardId = rawArgOne.toUpperCase();
            const card = this.cardById[cardId];

            if (!card) {
                this.appendTerminalLine(`Unknown card: ${cardId}`);
                return;
            }

            const nextStateTurnedOver = !card.isTurnedOver();
            card.flip();
            this.appendTerminalLine(`${cardId} ${nextStateTurnedOver ? 'turned over' : 'face up'}`);
            return;
        }

        if (action === 'boom') {
            if (!rawArgOne) {
                this.appendTerminalLine('Usage: boom [cardid]');
                return;
            }

            const cardId = rawArgOne.toUpperCase();
            const card = this.cardById[cardId];

            if (!card) {
                this.appendTerminalLine(`Unknown card: ${cardId}`);
                return;
            }

            if (card.getCardType() !== 'character') {
                this.appendTerminalLine(`boom only works on character cards: ${cardId}`);
                return;
            }

            this.playPixelViolinExplosion(card);
            this.appendTerminalLine(`BOOM on ${cardId}`);
            return;
        }

        if (action === 'view') {
            const requestedView = rawArgOne?.toLowerCase();

            if (!requestedView) {
                const nextView: PlayerId = this.activeViewPlayerId === 'p1' ? 'p2' : 'p1';
                this.applyBoardView(nextView);
                this.appendTerminalLine(`View -> ${nextView.toUpperCase()}`);
                return;
            }

            if (requestedView !== 'p1' && requestedView !== 'p2') {
                this.appendTerminalLine('Usage: view [p1|p2]');
                return;
            }

            this.applyBoardView(requestedView);
            this.appendTerminalLine(`View -> ${requestedView.toUpperCase()}`);
            return;
        }

        if (action !== 'mv' || !rawArgOne || !rawArgTwo) {
            this.appendTerminalLine('Usage: mv [cardid] [cardholderid] [index?]');
            this.appendTerminalLine('       flip [cardid]');
            this.appendTerminalLine('       rm [energyid]');
            this.appendTerminalLine('       boom [cardid]');
            this.appendTerminalLine('       view [p1|p2]');
            return;
        }

        const cardId = rawArgOne.toUpperCase();
        const holderId = rawArgTwo.toLowerCase();
        const card = this.cardById[cardId];
        const targetHolder = this.cardHolderById[holderId];

        if (!card) {
            this.appendTerminalLine(`Unknown card: ${cardId}`);
            return;
        }

        if (!targetHolder) {
            this.appendTerminalLine(`Unknown holder: ${holderId}`);
            return;
        }

        let insertIndex: number | undefined;
        if (rawArgThree !== undefined) {
            const parsedIndex = Number(rawArgThree);
            if (!Number.isInteger(parsedIndex) || parsedIndex < 0) {
                this.appendTerminalLine(`Invalid index: ${rawArgThree}`);
                this.appendTerminalLine('Index must be a non-negative integer.');
                return;
            }

            if (parsedIndex > targetHolder.cards.length) {
                this.appendTerminalLine(`Index out of range: ${parsedIndex}`);
                this.appendTerminalLine(`Valid range for ${holderId}: 0-${targetHolder.cards.length}`);
                return;
            }

            insertIndex = parsedIndex;
        }

        if (card.getZoneId() === holderId) {
            this.appendTerminalLine(`${cardId} already in ${holderId}`);
            return;
        }

        if (card.getAttachedToCardId()) {
            this.detachCard(card);
        }

        this.moveCardToZone(card, holderId, () => {
            this.animateCardToZone(card, holderId, () => {
                this.detachChildrenIfParentInDiscard(card);
                this.layoutAllHolders();
                this.redrawAllCardMarks();
                if (insertIndex !== undefined) {
                    this.appendTerminalLine(`${cardId} -> ${holderId}[${insertIndex}]`);
                    return;
                }
                this.appendTerminalLine(`${cardId} -> ${holderId}`);
            });
        }, insertIndex);
    }

    private getCardFromGameObject (gameObject: Phaser.GameObjects.Rectangle): Card | undefined
    {
        return this.cardByBody.get(gameObject);
    }

    private selectCard (card: Card): void
    {
        if (this.selectedCard === card) {
            this.selectedCard.setDepth(10000);
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
        this.selectedCard.setDepth(10000);
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
            delay: 16,
            repeat: 10,
            callback: () => {
                this.updateAttachedChildrenPositions(card);
                this.redrawAllCardMarks();
            }
        });
    }

    private layoutAllHolders (): void
    {
        const preferredHorizontalStep = this.objectWidth + Math.round((18 / BASE_WIDTH) * GAME_WIDTH);

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
        this.applyHandVisibilityByView();
    }

    private applyBoardView (viewPlayerId: PlayerId): void
    {
        this.activeViewPlayerId = viewPlayerId;
        const rotateTopBottom = viewPlayerId === 'p2';

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
    }

    private applyHandVisibilityByView (): void
    {
        const hiddenOwner: PlayerId = this.activeViewPlayerId === 'p1' ? 'p2' : 'p1';
        const visibleHandZone = `${this.activeViewPlayerId}-hand`;
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

    private redrawAllCardMarks (): void
    {
        for (const card of this.cards) {
            card.redrawMarks();
        }

        if (this.selectedCard) {
            this.showCardPreview(this.selectedCard);
        }
    }

    private findOverlappedCard (card: Card): Card | null
    {
        const droppedBounds = card.getBounds();
        const cardId = card.id;
        const attachedToCardId = card.getAttachedToCardId();

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

            if (Phaser.Geom.Intersects.RectangleToRectangle(droppedBounds, otherCard.getBounds())) {
                return otherCard;
            }
        }

        return null;
    }

    private animateCardToZone (
        card: Card,
        zoneId: string,
        onComplete: () => void
    ): void
    {
        const holder = this.cardHolderById[zoneId];
        card.setDepth(1000);

        this.tweens.add({
            targets: card.body,
            x: holder.x,
            y: holder.y,
            duration: 260,
            ease: 'Sine.easeInOut',
            onUpdate: () => {
                this.updateAttachedChildrenPositions(card);
                this.redrawAllCardMarks();
            },
            onComplete: () => {
                onComplete();
            }
        });
    }

    private attachCardToCard (child: Card, parent: Card): void
    {
        if (child === parent) {
            return;
        }

        this.detachCard(child);

        const parentId = parent.id;
        const parentZoneId = parent.getZoneId();

        child.setAttachedToCardId(parentId);
        child.setZoneId(parentZoneId);
        child.setScale(0.55);
        this.updateAttachedCardPosition(child, parent);
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
        const horizontalStep = tokenWidth * 0.25;

        const startX = parentBounds.left + (tokenWidth / 2) + 2;
        const y = parentBounds.bottom - (tokenHeight / 2) - 2;

        attachedTokens.forEach((token, index) => {
            token.setPosition(startX + (index * horizontalStep), y);
            token.setDepth(parent.depth + 1 + (index * 2));
        });
    }

    private findOverlappedOwnedCharacterForToken (token: EnergyToken): Card | null
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

    private attachEnergyTokenToCard (token: EnergyToken, parent: Card): void
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

        const columns = zoneId === 'energy-discard' ? 4 : 5;
        const rowGap = Math.max(2, Math.round(tokens[0].getDisplayHeight() * 0.25));
        const colGap = Math.max(2, Math.round(tokens[0].getDisplayWidth() * 0.2));

        const startX = zoneArea.left + Math.round(zoneArea.width * 0.14);
        const startY = zoneArea.top + Math.round(zoneArea.height * 0.26);

        tokens.forEach((token, index) => {
            const row = Math.floor(index / columns);
            const col = index % columns;
            const x = startX + (col * (token.getDisplayWidth() + colGap));
            const y = startY + (row * (token.getDisplayHeight() + rowGap));

            token.setPosition(x, y);
            token.setDepth(20 + (index * 2));
        });
    }

    private moveEnergyTokenToDiscard (token: EnergyToken): void
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

    private playPixelViolinExplosion (card: Card): void
    {
        const durationMs = 1000;
        const count = 28;
        const baseScale = Math.max(0.08, this.objectWidth / 900);

        for (let i = 0; i < count; i += 1) {
            const image = this.add.image(card.x, card.y, 'pixelviolin')
                .setDepth(20000 + i)
                .setScale(baseScale * Phaser.Math.FloatBetween(0.9, 1.3))
                .setAlpha(1)
                .setAngle(Phaser.Math.Between(0, 360));

            const angle = Phaser.Math.FloatBetween(0, Math.PI * 2);
            const distance = Phaser.Math.FloatBetween(this.objectWidth * 0.2, this.objectWidth * 1.0);
            const targetX = card.x + (Math.cos(angle) * distance);
            const targetY = card.y + (Math.sin(angle) * distance);

            this.tweens.add({
                targets: image,
                x: targetX,
                y: targetY,
                alpha: 0,
                angle: image.angle + Phaser.Math.Between(-180, 180),
                duration: durationMs,
                ease: 'Cubic.easeOut',
                onComplete: () => {
                    image.destroy();
                }
            });
        }
    }

    private updateAttachedCardPosition (child: Card, parent: Card): void
    {
        const parentBounds = parent.getBounds();
        const childBounds = child.getBounds();
        const edgePadding = 2;
        const x = parentBounds.right - (childBounds.width / 2) - edgePadding;
        const y = parentBounds.bottom - (childBounds.height / 2) - edgePadding;

        child.setPosition(x, y);
        child.setDepth(parent.depth + 0.5);
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

    private sendCardToOwnerDiscard (card: Card, onComplete?: () => void): void
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
            card.setDepth(card.getSelected() ? 10000 : (30 + index));
        });
    }

    private detachChildrenIfParentInDiscard (parent: Card): void
    {
        const parentZoneId = parent.getZoneId();
        const ownerDiscardZone = `${parent.getOwnerId()}-discard`;
        if (parentZoneId !== ownerDiscardZone) {
            return;
        }

        const parentCardId = parent.id;
        const children = this.getAttachedChildren(parentCardId);

        for (const child of children) {
            this.detachCard(child);
            this.removeCardFromAllHolders(child);
            child.setZoneId(ownerDiscardZone);
            this.cardHolderById[ownerDiscardZone].addCard(child);
        }

        const attachedEnergyTokens = this.getAttachedEnergyTokens(parentCardId);
        for (const token of attachedEnergyTokens) {
            this.moveEnergyTokenToDiscard(token);
        }
    }
}
