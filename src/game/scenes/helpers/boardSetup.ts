import { CardHolder, CardHolderConfig, EnergyHolder, EnergyHolderConfig } from '../../entities';
import {
    BASE_HEIGHT,
    BASE_WIDTH,
    BOARD_SCALE,
    CARD_BASE_HEIGHT,
    CARD_BASE_WIDTH,
    CARDHOLDER_BASE_WIDTH,
    CARDHOLDER_HEIGHT_MULTIPLIER,
    CARDHOLDER_SPACING_MULTIPLIERS,
    ENERGYHOLDER_LAYOUT,
    GAME_CENTER_X,
    GAME_CENTER_Y,
    GAME_LAYOUT,
    GAME_HEIGHT,
    GAME_WIDTH,
} from '../../config';

type BoardSetupScene = any;

export const buildCardHolderConfigsForScene = (scene: BoardSetupScene, scale: number): CardHolderConfig[] => {
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
        { id: 'p2-hand', label: 'P2 HAND', x: scaleX(baseCenterX), y: scaleY(topHandY), width: holderWidth('hand'), height: scene.objectHeight * CARDHOLDER_HEIGHT_MULTIPLIER, color: 0x264653 },
        { id: 'p2-bench', label: 'P2 BENCH', x: scaleX(baseCenterX), y: scaleY(topBenchY), width: holderWidth('bench'), height: scene.objectHeight * CARDHOLDER_HEIGHT_MULTIPLIER, color: 0x2a9d8f },
        { id: 'p2-active', label: 'P2 ACTIVE', x: scaleX(baseCenterX), y: scaleY(topActiveY), width: holderWidth('active'), height: scene.objectHeight * CARDHOLDER_HEIGHT_MULTIPLIER, color: 0xe9c46a },
        { id: 'p2-discard', label: 'P2 DISCARD', x: scaleX(leftSideX), y: scaleY(topActiveY), width: holderWidth('discard'), height: scene.objectHeight * CARDHOLDER_HEIGHT_MULTIPLIER, color: 0xf4a261 },
        { id: 'p2-deck', label: 'P2 DECK', x: scaleX(rightSideX), y: scaleY(topActiveY), width: holderWidth('deck'), height: scene.objectHeight * CARDHOLDER_HEIGHT_MULTIPLIER, color: 0xe76f51 },
        { id: 'stadium', label: 'STADIUM', x: scaleX(stadiumX), y: scaleY(baseCenterY), width: holderWidth('stadium'), height: scene.objectHeight * CARDHOLDER_HEIGHT_MULTIPLIER, color: 0x6d597a },

        // Player side (bottom)
        { id: 'p1-active', label: 'P1 ACTIVE', x: scaleX(baseCenterX), y: scaleY(bottomActiveY), width: holderWidth('active'), height: scene.objectHeight * CARDHOLDER_HEIGHT_MULTIPLIER, color: 0xe9c46a },
        { id: 'p1-discard', label: 'P1 DISCARD', x: scaleX(leftSideX), y: scaleY(bottomActiveY), width: holderWidth('discard'), height: scene.objectHeight * CARDHOLDER_HEIGHT_MULTIPLIER, color: 0xf4a261 },
        { id: 'p1-deck', label: 'P1 DECK', x: scaleX(rightSideX), y: scaleY(bottomActiveY), width: holderWidth('deck'), height: scene.objectHeight * CARDHOLDER_HEIGHT_MULTIPLIER, color: 0xe76f51 },
        { id: 'p1-bench', label: 'P1 BENCH', x: scaleX(baseCenterX), y: scaleY(bottomBenchY), width: holderWidth('bench'), height: scene.objectHeight * CARDHOLDER_HEIGHT_MULTIPLIER, color: 0x2a9d8f },
        { id: 'p1-hand', label: 'P1 HAND', x: scaleX(baseCenterX), y: scaleY(bottomHandY), width: holderWidth('hand'), height: scene.objectHeight * CARDHOLDER_HEIGHT_MULTIPLIER, color: 0x264653 }
    ];
};

export const createEnergyHoldersForScene = (scene: BoardSetupScene): void => {
    const p2Discard = scene.cardHolderById['p2-discard'];
    const p1Discard = scene.cardHolderById['p1-discard'];

    const holderWidth = Math.round(scene.objectWidth * ENERGYHOLDER_LAYOUT.widthMultiplier);
    const holderHeight = Math.round(scene.objectHeight * ENERGYHOLDER_LAYOUT.heightMultiplier);
    const xOffset = Math.round(scene.objectWidth * ENERGYHOLDER_LAYOUT.xOffsetMultiplier);
    const verticalSpread = Math.round(scene.objectHeight * ENERGYHOLDER_LAYOUT.verticalSpreadMultiplier);

    const p2EnergyX = p2Discard.x - xOffset;
    const p1EnergyX = p1Discard.x - xOffset;
    const p2EnergyY = p2Discard.y - verticalSpread;
    const p1EnergyY = p1Discard.y + verticalSpread;

    const sharedZoneId = scene.energyZoneIdByOwner.p1;
    const sharedX = Math.round((p1EnergyX + p2EnergyX) / 2);
    const sharedY = Math.round((p1EnergyY + p2EnergyY) / 2);

    const createHolder = (config: EnergyHolderConfig) => {
        const holder = new EnergyHolder(scene, config);
        scene.energyHolders.push(holder);
        scene.energyHolderById[holder.id] = holder;
        return holder;
    };

    const sharedHolder = createHolder({ id: sharedZoneId, label: 'SHARED ENERGY', x: sharedX, y: sharedY, width: holderWidth, height: holderHeight, color: 0x4361ee });
    // Hard-cutover shared-pool model: discard and shared energy resolve to
    // the same visible holder and drop zone.
    scene.energyHolderById['energy-discard'] = sharedHolder;
};

export const initializeBoardStateForScene = (
    scene: BoardSetupScene,
    createDefaultPlayerTurnAttributes: () => Record<string, number>
): void => {
    const xRatio = GAME_WIDTH / BASE_WIDTH;
    const yRatio = GAME_HEIGHT / BASE_HEIGHT;

    // Card size inherits from configured game dimensions.
    scene.objectWidth = Math.round(CARD_BASE_WIDTH * xRatio * BOARD_SCALE);
    scene.objectHeight = Math.round(CARD_BASE_HEIGHT * yRatio * BOARD_SCALE);

    const holderConfigs = buildCardHolderConfigsForScene(scene, BOARD_SCALE);
    scene.cardHolders = [];
    scene.cardHolderById = {};
    scene.baseCardHolderPositionById = {};
    scene.baseEnergyHolderPositionById = {};
    scene.activeViewMode = 'spectator';
    scene.gamePhase = 'phase2';
    scene.roundNumber = 0;
    scene.playerTurn = 'p1';
    scene.playerTurnAttributesByPlayer = {
        p1: createDefaultPlayerTurnAttributes(),
        p2: createDefaultPlayerTurnAttributes()
    };
    scene.playerSetupProfileById = {
        p1: { username: 'PLAYER 1', attributes: {} },
        p2: { username: 'PLAYER 2', attributes: {} }
    };

    for (const config of holderConfigs) {
        const holder = new CardHolder(scene, config);
        scene.cardHolders.push(holder);
        scene.cardHolderById[holder.id] = holder;
        scene.baseCardHolderPositionById[holder.id] = { x: holder.x, y: holder.y };
    }

    scene.energyTokens = [];
    scene.energyTokenById = {};
    scene.energyTokenByBody = new Map();
    scene.activelyDraggedEnergyTokenIds = new Set();
    scene.energyDragStartPositionById = new Map();
    scene.energyDragDistanceById = new Map();
    scene.activeSceneAnimationCount = 0;
    scene.energyZoneIdByOwner = {
        p1: 'shared-energy',
        p2: 'shared-energy'
    };
    scene.energyHolders = [];
    scene.energyHolderById = {};

    createEnergyHoldersForScene(scene);
    for (const holder of scene.energyHolders) {
        scene.baseEnergyHolderPositionById[holder.id] = { x: holder.x, y: holder.y };
    }

    scene.cards = [];
    scene.cardById = {};
    scene.cardByBody = new Map();
    scene.selectedCard = null;
    scene.overlayPreviewContext = null;
    scene.activelyDraggedCardIds = new Set();
    scene.dragOriginZoneByCardId = new Map();
    scene.dragStartPositionByCardId = new Map();
    scene.dragDistanceByCardId = new Map();
    scene.hpPulseAnimationByCardId = new Map();
};
