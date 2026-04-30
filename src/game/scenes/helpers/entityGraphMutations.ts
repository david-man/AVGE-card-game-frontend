import { Card, EnergyToken } from '../../entities';
import {
    ENERGY_TOKEN_DEPTHS,
    GAME_DEPTHS,
    GAME_LAYOUT,
} from '../../config';

type EntityGraphScene = any;

export const detachCard = (_scene: EntityGraphScene, card: Card): void => {
    card.setAttachedToCardId(null);
    card.setScale(1);
};

export const getAttachedChildren = (scene: EntityGraphScene, parentCardId: string): Card[] => {
    return scene.cards.filter((card: Card) => card.getAttachedToCardId() === parentCardId);
};

export const compareEnergyTokenIds = (_scene: EntityGraphScene, a: string, b: string): number => {
    const aNumeric = Number(a);
    const bNumeric = Number(b);
    const aIsNumeric = Number.isFinite(aNumeric);
    const bIsNumeric = Number.isFinite(bNumeric);

    if (aIsNumeric && bIsNumeric) {
        return aNumeric - bNumeric;
    }

    return a.localeCompare(b, undefined, { numeric: true, sensitivity: 'base' });
};

export const getAttachedEnergyTokens = (scene: EntityGraphScene, parentCardId: string): EnergyToken[] => {
    return scene.energyTokens
        .filter((token: EnergyToken) => token.getAttachedToCardId() === parentCardId)
        .sort((a: EnergyToken, b: EnergyToken) => compareEnergyTokenIds(scene, a.id, b.id));
};

export const updateAttachedCardPosition = (_scene: EntityGraphScene, child: Card, parent: Card): void => {
    const parentBounds = parent.getBounds();
    const childBounds = child.getBounds();
    const edgePadding = GAME_LAYOUT.toolAttachmentEdgePadding;
    const x = parentBounds.right - (childBounds.width / 2) - edgePadding;
    const y = parentBounds.bottom - (childBounds.height / 2) - edgePadding;

    child.setPosition(x, y);
    child.setDepth(parent.depth + GAME_DEPTHS.attachmentDepthOffset);
};

export const updateAttachedEnergyTokenPositions = (scene: EntityGraphScene, parent: Card): void => {
    const attachedTokens = getAttachedEnergyTokens(scene, parent.id);
    if (attachedTokens.length === 0) {
        return;
    }

    const parentBounds = parent.getBounds();
    const tokenWidth = attachedTokens[0].getDisplayWidth();
    const tokenHeight = attachedTokens[0].getDisplayHeight();
    const horizontalStep = tokenWidth * GAME_LAYOUT.energyTokenAttachedHorizontalStepRatio;

    const startX = parentBounds.left + (tokenWidth / 2) + GAME_LAYOUT.energyTokenAttachedPadding;
    const y = parentBounds.bottom - (tokenHeight / 2) - GAME_LAYOUT.energyTokenAttachedPadding;

    attachedTokens.forEach((token: EnergyToken, index: number) => {
        token.setPosition(startX + (index * horizontalStep), y);
        const tentativeDepth = ENERGY_TOKEN_DEPTHS.minAttached + index;
        token.setDepth(Math.min(ENERGY_TOKEN_DEPTHS.maxBelowUi, tentativeDepth));
    });
};

export const updateAttachedChildrenPositions = (scene: EntityGraphScene, parent: Card): void => {
    const parentCardId = parent.id;
    const children = getAttachedChildren(scene, parentCardId);

    for (const child of children) {
        updateAttachedCardPosition(scene, child, parent);
    }

    updateAttachedEnergyTokenPositions(scene, parent);
};

export const removeCardFromAllHolders = (scene: EntityGraphScene, card: Card): void => {
    for (const holder of scene.cardHolders) {
        holder.removeCard(card);
    }
};

export const attachCardToCard = (scene: EntityGraphScene, child: Card, parent: Card): void => {
    if (child === parent) {
        return;
    }

    detachCard(scene, child);

    const parentId = parent.id;
    const parentZoneId = parent.getZoneId();

    child.setAttachedToCardId(parentId);
    child.setZoneId(parentZoneId);
    child.setScale(GAME_LAYOUT.cardMoveToolScale);
    updateAttachedCardPosition(scene, child, parent);
};

export const getTopAttachmentTarget = (scene: EntityGraphScene, baseCard: Card): Card => {
    const attachedChildren = getAttachedChildren(scene, baseCard.id);
    if (attachedChildren.length === 0) {
        return baseCard;
    }

    return attachedChildren.reduce((topCard: Card, nextCard: Card) => (nextCard.depth > topCard.depth ? nextCard : topCard));
};

export const setEnergyTokenZone = (scene: EntityGraphScene, token: EnergyToken, zoneId: string): void => {
    const oldZoneId = token.getZoneId();
    if (oldZoneId === zoneId) {
        token.setZoneId(zoneId);
        return;
    }

    const oldHolder = scene.energyHolderById[oldZoneId];
    if (oldHolder) {
        oldHolder.removeToken(token);
    }

    const newHolder = scene.energyHolderById[zoneId];
    if (newHolder) {
        newHolder.addToken(token);
    }

    token.setZoneId(zoneId);
};

export const layoutEnergyTokensInZone = (scene: EntityGraphScene, zoneId: string): void => {
    const holder = scene.energyHolderById[zoneId];
    if (!holder) {
        return;
    }

    const zoneArea = holder.getBounds();

    const tokens = holder.tokens
        .filter((token: EnergyToken) => !token.getAttachedToCardId())
        .sort((a: EnergyToken, b: EnergyToken) => compareEnergyTokenIds(scene, a.id, b.id));

    if (tokens.length === 0) {
        holder.hidePileCountDisplays();
        return;
    }
    holder.hidePileCountDisplays();

    const tokenWidth = tokens[0].getDisplayWidth();
    const tokenHeight = tokens[0].getDisplayHeight();
    const columns = Math.max(1, GAME_LAYOUT.energyTokenZoneColumnsDefault);
    const rowsPerColumn = Math.max(1, GAME_LAYOUT.energyTokenZoneRowsPerColumn);
    const tokensPerBand = Math.max(1, columns * rowsPerColumn);

    // Keep a clean 5x20-style matrix with only slight overlap between tokens.
    const columnStep = Math.max(1, tokenWidth * GAME_LAYOUT.energyTokenZoneColumnStepRatio);
    const rowStep = Math.max(1, tokenHeight * GAME_LAYOUT.energyTokenZoneRowStepRatio);
    const gridWidth = tokenWidth + ((columns - 1) * columnStep);
    const gridHeight = tokenHeight + ((rowsPerColumn - 1) * rowStep);
    const startX = zoneArea.centerX - (gridWidth / 2) + (tokenWidth / 2);
    const startY = zoneArea.centerY - (gridHeight / 2) + (tokenHeight / 2);
    const overflowOffsetX = Math.max(2, tokenWidth * GAME_LAYOUT.energyTokenZoneOverflowOffsetRatio);
    const overflowOffsetY = Math.max(2, tokenHeight * GAME_LAYOUT.energyTokenZoneOverflowOffsetRatio);

    tokens.forEach((token: EnergyToken, index: number) => {
        const bandIndex = Math.floor(index / tokensPerBand);
        const indexInBand = index % tokensPerBand;
        const columnIndex = Math.floor(indexInBand / rowsPerColumn);
        const rowIndex = indexInBand % rowsPerColumn;
        const x = startX + (columnIndex * columnStep) + (bandIndex * overflowOffsetX);
        const y = startY + (rowIndex * rowStep) + (bandIndex * overflowOffsetY);

        token.setPosition(x, y);
        token.setDepth(ENERGY_TOKEN_DEPTHS.minZone + index);
    });
};

export const attachEnergyTokenToCard = (scene: EntityGraphScene, token: EnergyToken, parent: Card): void => {
    token.setAttachedToCardId(parent.id);
    const ownerZoneId = scene.energyZoneIdByOwner.p1;
    setEnergyTokenZone(scene, token, ownerZoneId);
    layoutEnergyTokensInZone(scene, ownerZoneId);
    updateAttachedEnergyTokenPositions(scene, parent);
};

export const moveEnergyTokenToDiscard = (scene: EntityGraphScene, token: EnergyToken): void => {
    const attachedToCardId = token.getAttachedToCardId();
    if (attachedToCardId) {
        token.setAttachedToCardId(null);
    }

    setEnergyTokenZone(scene, token, 'energy-discard');
    layoutEnergyTokensInZone(scene, 'energy-discard');
};

export const moveEnergyTokenToOwnerEnergy = (scene: EntityGraphScene, token: EnergyToken): void => {
    const attachedToCardId = token.getAttachedToCardId();
    if (attachedToCardId) {
        token.setAttachedToCardId(null);
    }

    const ownerEnergyZoneId = scene.energyZoneIdByOwner.p1;
    setEnergyTokenZone(scene, token, ownerEnergyZoneId);
    layoutEnergyTokensInZone(scene, 'energy-discard');
    layoutEnergyTokensInZone(scene, ownerEnergyZoneId);
};

export const moveCardToZone = (
    scene: EntityGraphScene,
    card: Card,
    zoneId: string,
    onComplete?: () => void,
    insertIndex?: number
): void => {
    const originZoneId = card.getZoneId();
    const wasVisible = scene.isZoneVisibleToView(originZoneId, card.getOwnerId());
    const willBeVisible = scene.isZoneVisibleToView(zoneId, card.getOwnerId());
    const requiresFaceFlipBeforeMove = wasVisible && !willBeVisible;

    const completeMove = () => {
        detachCard(scene, card);
        removeCardFromAllHolders(scene, card);
        const targetHolder = scene.cardHolderById[zoneId];
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
};

export const sendCardToOwnerDiscard = (scene: EntityGraphScene, card: Card, onComplete?: () => void): void => {
    const discardZone = `${card.getOwnerId()}-discard`;
    moveCardToZone(scene, card, discardZone, onComplete);
};