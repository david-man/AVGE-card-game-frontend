import { Card, EnergyToken, PlayerId } from '../../entities';

type GamePhase = 'no-input' | 'phase2' | 'atk';
type ViewMode = PlayerId | 'spectator';
type InteractionRulesScene = any;

export const canActOnCard = (scene: InteractionRulesScene, card: Card): boolean => {
    if (scene.scannerCommandInProgress) {
        return true;
    }

    if (!scene.boardInputEnabled) {
        return false;
    }

    if (scene.activeViewMode === 'spectator') {
        return false;
    }

    if (card.isTurnedOver()) {
        return false;
    }

    if (scene.isInitWaitingForOpponent()) {
        return false;
    }

    return card.getOwnerId() === scene.activeViewMode;
};

export const canPreviewCard = (card: Card): boolean => {
    if (card.isTurnedOver()) {
        return false;
    }

    return true;
};

export const canDragCardByPhase = (scene: InteractionRulesScene, card: Card): boolean => {
    if (scene.isInitWaitingForOpponent()) {
        return false;
    }

    if (scene.isPregameInitActive()) {
        if (scene.activeViewMode !== 'p1' && scene.activeViewMode !== 'p2') {
            return false;
        }

        if (card.getOwnerId() !== scene.activeViewMode) {
            return false;
        }

        if (card.getCardType() !== 'character') {
            return false;
        }

        const zoneId = card.getZoneId();
        return zoneId === `${scene.activeViewMode}-hand`
            || zoneId === `${scene.activeViewMode}-bench`;
    }

    if (scene.gamePhase !== 'phase2') {
        return false;
    }

    if (card.getZoneId().endsWith('-active')) {
        return false;
    }

    return card.getOwnerId() === scene.playerTurn;
};

export const canActOnToken = (scene: InteractionRulesScene, token: EnergyToken): boolean => {
    if (scene.scannerCommandInProgress) {
        return true;
    }

    if (!scene.boardInputEnabled) {
        return false;
    }

    if (scene.activeViewMode === 'spectator') {
        return false;
    }

    if (scene.isInitWaitingForOpponent()) {
        return false;
    }

    const attachedToCardId = token.getAttachedToCardId();
    if (attachedToCardId) {
        const attachedCard = scene.cardById[attachedToCardId];
        if (!attachedCard) {
            return false;
        }

        if (attachedCard.getOwnerId() !== scene.activeViewMode) {
            return false;
        }
    }

    return scene.activeViewMode === 'p1' || scene.activeViewMode === 'p2';
};

export const canDragTokenByPhase = (scene: InteractionRulesScene, token: EnergyToken): boolean => {
    if (scene.isInitWaitingForOpponent()) {
        return false;
    }

    if (scene.isPregameInitActive()) {
        return false;
    }

    if (scene.gamePhase !== 'phase2') {
        return false;
    }

    if (scene.activeViewMode !== scene.playerTurn) {
        return false;
    }

    const sharedEnergyZoneId = scene.energyZoneIdByOwner.p1;
    return token.getZoneId() === sharedEnergyZoneId || token.getZoneId() === 'energy-discard';
};

export const parseGamePhaseArg = (rawPhase: string): GamePhase | null => {
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
};

export const parsePlayerTurnArg = (rawTurn: string): PlayerId | null => {
    const normalized = rawTurn.toLowerCase();
    if (normalized === 'p1' || normalized === 'player-1' || normalized === 'player1') {
        return 'p1';
    }

    if (normalized === 'p2' || normalized === 'player-2' || normalized === 'player2') {
        return 'p2';
    }

    return null;
};

export const parseViewModeArg = (rawMode: string): ViewMode | null => {
    if (rawMode === 'spectator' || rawMode === 'spec') {
        return 'spectator';
    }

    if (rawMode === 'p1' || rawMode === 'player-1' || rawMode === 'player1') {
        return 'p1';
    }

    if (rawMode === 'p2' || rawMode === 'player-2' || rawMode === 'player2') {
        return 'p2';
    }

    return null;
};

export const parseCardTypeArg = (rawType: string): 'character' | 'tool' | 'item' | 'stadium' | 'supporter' | null => {
    const normalized = rawType.toLowerCase();
    if (normalized === 'character' || normalized === 'tool' || normalized === 'item' || normalized === 'stadium' || normalized === 'supporter') {
        return normalized;
    }

    return null;
};