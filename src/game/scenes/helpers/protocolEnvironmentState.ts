import { BackendEntitiesSetup } from '../../Network';
import { PlayerId } from '../../entities';
import { GAME_CARD_TYPE_FILL_COLORS } from '../../config';

type ProtocolEnvironmentScene = any;

type InitStage = 'init' | 'live';

type PlayerTurnAttributeKey = string;

type PlayerTurnAttributes = Record<PlayerTurnAttributeKey, number>;

const applyBackendPlayerSetup = (scene: ProtocolEnvironmentScene, setup: BackendEntitiesSetup): void => {
    const players = setup.players;
    if (!players) {
        return;
    }

    const applyPlayer = (playerId: PlayerId): void => {
        const payload = players[playerId];
        if (!payload) {
            return;
        }

        if (typeof payload.username === 'string' && payload.username.trim().length > 0) {
            scene.playerSetupProfileById[playerId].username = payload.username.trim();
        }

        if (payload.attributes && typeof payload.attributes === 'object') {
            const defaults = scene.createDefaultPlayerTurnAttributes();
            const merged: PlayerTurnAttributes = {
                ...defaults,
                ...scene.playerTurnAttributesByPlayer[playerId]
            };
            const attributes = payload.attributes as Record<string, unknown>;

            const keys = Object.keys(defaults) as PlayerTurnAttributeKey[];
            for (const key of keys) {
                const rawValue = attributes[key];
                if (typeof rawValue !== 'number' || Number.isNaN(rawValue)) {
                    continue;
                }
                merged[key] = rawValue;
            }

            scene.playerTurnAttributesByPlayer[playerId] = merged;
            scene.playerSetupProfileById[playerId].attributes = {
                ...scene.playerSetupProfileById[playerId].attributes,
                ...payload.attributes
            };
        }
    };

    applyPlayer('p1');
    applyPlayer('p2');
};

export const applyBackendEntitySetup = (scene: ProtocolEnvironmentScene, setup: BackendEntitiesSetup): void => {
    scene.roundNumber = setup.roundNumber;

    if (setup.playerTurn === 'p1' || setup.playerTurn === 'p2') {
        scene.playerTurn = setup.playerTurn;
    }

    if (setup.gamePhase === 'no-input' || setup.gamePhase === 'phase2' || setup.gamePhase === 'atk') {
        scene.gamePhase = setup.gamePhase;
    }

    applyBackendPlayerSetup(scene, setup);

    const sortedCards = setup.cards.slice().sort((a, b) => {
        const aAttached = a.attachedToCardId ? 1 : 0;
        const bAttached = b.attachedToCardId ? 1 : 0;
        return aAttached - bAttached;
    });

    for (const cardDef of sortedCards) {
        const result = scene.createCardFromCommand({
            id: cardDef.id,
            ownerId: cardDef.ownerId,
            cardType: cardDef.cardType,
            holderId: cardDef.holderId,
            color: GAME_CARD_TYPE_FILL_COLORS[cardDef.cardType],
            AVGECardType: cardDef.AVGECardType,
            AVGECardClass: cardDef.AVGECardClass,
            hasAtk1: cardDef.hasAtk1 ?? false,
            hasActive: cardDef.hasActive ?? false,
            hasPassive: cardDef.hasPassive,
            hasAtk2: cardDef.hasAtk2 ?? false,
            atk1Name: cardDef.atk1Name,
            activeName: cardDef.activeName,
            atk2Name: cardDef.atk2Name,
            atk1Cost: cardDef.atk1Cost,
            atk2Cost: cardDef.atk2Cost,
            retreatCost: cardDef.retreatCost,
            hp: cardDef.hp,
            maxHp: cardDef.maxHp,
            statusEffect: cardDef.statusEffect,
            width: scene.objectWidth,
            height: scene.objectHeight,
            flipped: false,
            attachedToCardId: cardDef.attachedToCardId,
            deferLayoutAndRedraw: true
        });

        if (!result.ok) {
            scene.appendTerminalLine(`setup card skipped (${cardDef.id}): ${result.error}`);
        }
    }

    const sortedEnergy = setup.energyTokens.slice().sort((a, b) => {
        const aAttached = a.attachedToCardId ? 1 : 0;
        const bAttached = b.attachedToCardId ? 1 : 0;
        return aAttached - bAttached;
    });

    for (const tokenDef of sortedEnergy) {
        const result = scene.createEnergyTokenFromCommand({
            id: tokenDef.id,
            ownerId: tokenDef.ownerId,
            holderId: tokenDef.holderId,
            radius: scene.getDefaultEnergyTokenRadius(),
            attachedToCardId: tokenDef.attachedToCardId,
            deferLayout: true
        });

        if (!result.ok) {
            scene.appendTerminalLine(`setup energy skipped (${tokenDef.id}): ${result.error}`);
        }
    }

    const payloadView =
        setup.playerView === 'p1' || setup.playerView === 'p2' || setup.playerView === 'spectator'
            ? setup.playerView
            : null;
    const slotView = scene.protocolClientSlot === 'p1' || scene.protocolClientSlot === 'p2'
        ? scene.protocolClientSlot
        : null;
    const assignedView = payloadView ?? slotView ?? scene.activeViewMode;
    scene.applyBoardView(assignedView);
};

export const applyInitStatePacket = (scene: ProtocolEnvironmentScene, body: Record<string, unknown>): void => {
    const stageRaw = body.stage;
    const stage: InitStage = stageRaw === 'live' ? 'live' : 'init';
    const previousStage = scene.pregameInitStage;
    scene.pregameInitStage = stage;

    const selfReady = body.self_ready === true;
    const opponentReady = body.opponent_ready === true;
    scene.initSetupConfirmed = selfReady;
    scene.opponentInitSetupConfirmed = opponentReady;

    if (stage === 'init') {
        scene.stopInitStartCountdownAnimation();
        scene.waitingForOpponent = false;
        scene.setOpponentDisconnectedState(false);
        scene.setInputAcknowledged(true);
        if (selfReady) {
            scene.appendTerminalLine('Init setup submitted. Waiting for opponent...');
        }
        else {
            scene.appendTerminalLine('Arrange your starting board, then click Done.');
        }
    }
    else if (previousStage === 'init') {
        scene.appendTerminalLine('Both players finished setup. Starting game...');
        scene.initStartCountdownAckGateActive = true;
        scene.playInitStartCountdownAnimation();
    }

    scene.applyCardVisibilityByView();
    scene.refreshSurrenderButton();
    scene.refreshPhaseHud();
};
