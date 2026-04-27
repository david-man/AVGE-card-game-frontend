import { Scene } from 'phaser';
import { ENERGY_TOKEN_DEPTHS, GAME_DEPTHS, GAME_INTERACTION, MAX_BENCH_CARDS } from '../config';

export class BoardInteractionController
{
    private readonly scene: Scene;
    private readonly host: unknown;

    constructor (scene: Scene, host: unknown)
    {
        this.scene = scene;
        this.host = host;
    }

    register (): void
    {
        const g = this.host as any;

        this.scene.input.on('pointerdown', (_pointer: Phaser.Input.Pointer, currentlyOver: Phaser.GameObjects.GameObject[]) => {
            if (!g.boardInputEnabled) {
                return;
            }
            const clickedCard = currentlyOver.some((gameObject) => gameObject instanceof Phaser.GameObjects.Rectangle && g.cardByBody.has(gameObject as Phaser.GameObjects.Rectangle));
            if (!clickedCard) {
                g.clearCardSelection();
            }
        });

        this.scene.input.on('dragstart', (_pointer: Phaser.Input.Pointer, gameObject: Phaser.GameObjects.Rectangle) => {
            const card = g.getCardFromGameObject(gameObject);
            if (!card) {
                return;
            }

            if (!g.boardInputEnabled) {
                return;
            }

            if (g.isInteractionLockedByAnimation()) {
                return;
            }

            if (!g.canActOnCard(card)) {
                return;
            }

            if (!g.canDragCardByPhase(card)) {
                return;
            }

            const zoneId = card.getZoneId();
            if (zoneId.endsWith('-discard') || zoneId.endsWith('-deck')) {
                return;
            }

            g.activelyDraggedCardIds.add(card.id);
            g.dragOriginZoneByCardId.set(card.id, zoneId);
            g.dragStartPositionByCardId.set(card.id, { x: card.x, y: card.y });
            g.dragDistanceByCardId.set(card.id, 0);
        });

        this.scene.input.on('drag', (_pointer: Phaser.Input.Pointer, gameObject: Phaser.GameObjects.Rectangle, dragX: number, dragY: number) => {
            const card = g.getCardFromGameObject(gameObject);
            if (!card) {
                return;
            }

            if (!g.boardInputEnabled) {
                g.activelyDraggedCardIds.delete(card.id);
                g.dragOriginZoneByCardId.delete(card.id);
                g.dragStartPositionByCardId.delete(card.id);
                g.dragDistanceByCardId.delete(card.id);
                g.layoutAllHolders();
                g.redrawAllCardMarks();
                return;
            }

            if (g.isInteractionLockedByAnimation()) {
                g.activelyDraggedCardIds.delete(card.id);
                g.dragOriginZoneByCardId.delete(card.id);
                g.dragStartPositionByCardId.delete(card.id);
                g.dragDistanceByCardId.delete(card.id);
                g.layoutAllHolders();
                g.redrawAllCardMarks();
                return;
            }

            if (!g.activelyDraggedCardIds.has(card.id)) {
                return;
            }

            const attachedToCardId = card.getAttachedToCardId();
            if (attachedToCardId) {
                const parentCard = g.cardById[attachedToCardId];
                if (parentCard) {
                    g.updateAttachedCardPosition(card, parentCard);
                    g.redrawAllCardMarks();
                }
                return;
            }

            card.setPosition(dragX, dragY);
            card.setDepth(GAME_DEPTHS.cardDragging);

            const dragStartPosition = g.dragStartPositionByCardId.get(card.id);
            if (dragStartPosition) {
                const movedDistance = Phaser.Math.Distance.Between(dragStartPosition.x, dragStartPosition.y, dragX, dragY);
                const priorMaxDistance = g.dragDistanceByCardId.get(card.id) ?? 0;
                if (movedDistance > priorMaxDistance) {
                    g.dragDistanceByCardId.set(card.id, movedDistance);
                }
            }

            g.updateAttachedChildrenPositions(card);
            g.redrawAllCardMarks();
        });

        this.scene.input.on('drop', (_pointer: Phaser.Input.Pointer, gameObject: Phaser.GameObjects.Rectangle, dropZone: Phaser.GameObjects.Zone) => {
            const card = g.getCardFromGameObject(gameObject);
            if (!card) {
                return;
            }

            if (!g.boardInputEnabled) {
                g.activelyDraggedCardIds.delete(card.id);
                g.dragOriginZoneByCardId.delete(card.id);
                g.dragStartPositionByCardId.delete(card.id);
                g.dragDistanceByCardId.delete(card.id);
                g.layoutAllHolders();
                g.redrawAllCardMarks();
                return;
            }

            if (g.isInteractionLockedByAnimation()) {
                g.activelyDraggedCardIds.delete(card.id);
                g.dragOriginZoneByCardId.delete(card.id);
                g.dragStartPositionByCardId.delete(card.id);
                g.dragDistanceByCardId.delete(card.id);
                g.layoutAllHolders();
                g.redrawAllCardMarks();
                return;
            }

            if (!g.activelyDraggedCardIds.has(card.id)) {
                return;
            }

            g.activelyDraggedCardIds.delete(card.id);

            const dragStartPosition = g.dragStartPositionByCardId.get(card.id);
            const draggedDistance = g.dragDistanceByCardId.get(card.id) ?? 0;
            const originZoneId = g.dragOriginZoneByCardId.get(card.id) ?? card.getZoneId();
            g.dragOriginZoneByCardId.delete(card.id);
            g.dragStartPositionByCardId.delete(card.id);
            g.dragDistanceByCardId.delete(card.id);
            const minDragDistance = Math.max(GAME_INTERACTION.minDragDistancePx, Math.round(g.objectWidth * GAME_INTERACTION.minDragDistanceWidthRatio));

            if (dragStartPosition) {
                if (draggedDistance < minDragDistance) {
                    g.layoutAllHolders();
                    g.redrawAllCardMarks();
                    return;
                }
            }

            const targetZoneId = dropZone.getData('zoneId') as string;
            const ownerId = card.getOwnerId();
            const ownerHandZone = `${ownerId}-hand`;
            const ownerBenchZone = `${ownerId}-bench`;
            const ownerActiveZone = `${ownerId}-active`;
            const cardType = card.getCardType();

            if (g.isPregameInitActive && g.isPregameInitActive() && cardType !== 'character') {
                g.layoutAllHolders();
                g.redrawAllCardMarks();
                return;
            }

            if (cardType === 'character') {
                const isInitPhase = Boolean(g.isPregameInitActive && g.isPregameInitActive());
                const validCharacterMove = isInitPhase
                    ? (
                        (originZoneId === ownerHandZone && targetZoneId === ownerBenchZone) ||
                        (originZoneId === ownerBenchZone && targetZoneId === ownerHandZone) ||
                        (originZoneId === ownerBenchZone && targetZoneId === ownerActiveZone)
                    )
                    : (
                        (originZoneId === ownerHandZone && targetZoneId === ownerBenchZone) ||
                        (originZoneId === ownerBenchZone && targetZoneId === ownerActiveZone) ||
                        (originZoneId === ownerActiveZone && targetZoneId === ownerBenchZone)
                    );

                if (!validCharacterMove) {
                    g.layoutAllHolders();
                    g.redrawAllCardMarks();
                    return;
                }

                if (isInitPhase) {
                    if (originZoneId === ownerHandZone && targetZoneId === ownerBenchZone) {
                        const benchHolder = g.cardHolderById[ownerBenchZone];
                        const benchCharacterCount = Array.isArray(benchHolder?.cards)
                            ? benchHolder.cards.filter((benchCard: any) => (
                                benchCard
                                && benchCard.getCardType
                                && benchCard.getCardType() === 'character'
                            )).length
                            : 0;

                        if (benchCharacterCount >= MAX_BENCH_CARDS) {
                            g.appendTerminalLine(`Init setup bench is full (${MAX_BENCH_CARDS} max).`);
                            g.layoutAllHolders();
                            g.redrawAllCardMarks();
                            return;
                        }
                    }

                    const initMoveDurationMs = 140;
                    const animateCardBodyTo = (movingCard: any, x: number, y: number, onComplete: () => void): void => {
                        g.tweens.add({
                            targets: movingCard.body,
                            x,
                            y,
                            duration: initMoveDurationMs,
                            ease: 'Sine.easeOut',
                            onUpdate: () => {
                                movingCard.redrawMarks();
                                g.updateAttachedChildrenPositions(movingCard);
                            },
                            onComplete,
                        });
                    };

                    const completeLocalInitMove = (): void => {
                        g.layoutAllHolders();
                        g.redrawAllCardMarks();
                        if (g.onPregameInitLocalMove) {
                            g.onPregameInitLocalMove();
                        }
                    };

                    if (originZoneId === ownerBenchZone && targetZoneId === ownerActiveZone) {
                        const activeHolder = g.cardHolderById[ownerActiveZone];
                        const benchHolder = g.cardHolderById[ownerBenchZone];
                        const currentActive = activeHolder?.cards?.find((candidate: any) => candidate && candidate.id !== card.id && candidate.getCardType && candidate.getCardType() === 'character');

                        if (!activeHolder || !benchHolder) {
                            g.moveCardToZone(card, targetZoneId, () => {
                                completeLocalInitMove();
                            });
                            return;
                        }

                        if (currentActive) {
                            let completedAnimations = 0;
                            const finishSwapAnimation = (): void => {
                                completedAnimations += 1;
                                if (completedAnimations < 2) {
                                    return;
                                }

                                g.moveCardToZone(currentActive, ownerBenchZone);
                                g.moveCardToZone(card, targetZoneId, () => {
                                    completeLocalInitMove();
                                });
                            };

                            animateCardBodyTo(card, activeHolder.x, activeHolder.y, finishSwapAnimation);
                            animateCardBodyTo(currentActive, benchHolder.x, benchHolder.y, finishSwapAnimation);
                            return;
                        }

                        animateCardBodyTo(card, activeHolder.x, activeHolder.y, () => {
                            g.moveCardToZone(card, targetZoneId, () => {
                                completeLocalInitMove();
                            });
                        });
                        return;
                    }

                    const targetHolder = g.cardHolderById[targetZoneId];
                    if (!targetHolder) {
                        g.moveCardToZone(card, targetZoneId, () => {
                            completeLocalInitMove();
                        });
                        return;
                    }

                    animateCardBodyTo(card, targetHolder.x, targetHolder.y, () => {
                        g.moveCardToZone(card, targetZoneId, () => {
                            completeLocalInitMove();
                        });
                    });
                    return;
                }

                g.moveCardToZone(card, targetZoneId, () => {
                    g.emitBackendEvent('card_moved', {
                        card_id: card.id,
                        card_type: card.getCardType(),
                        owner_id: card.getOwnerId(),
                        from_zone: originZoneId,
                        to_zone: targetZoneId,
                        interaction: 'drag_drop'
                    });
                    g.layoutAllHolders();
                    g.redrawAllCardMarks();
                });
                return;
            }

            if (cardType === 'tool') {
                const fromHand = originZoneId === ownerHandZone;
                const onOwnBattleZone = targetZoneId === ownerBenchZone || targetZoneId === ownerActiveZone;
                const overlappedCard = g.findOverlappedCard(card, (otherCard: any) => (
                    otherCard.getZoneId() === targetZoneId &&
                    otherCard.getOwnerId() === ownerId &&
                    otherCard.getCardType() === 'character'
                ));

                if (!fromHand || !onOwnBattleZone || !overlappedCard) {
                    g.layoutAllHolders();
                    g.redrawAllCardMarks();
                    return;
                }

                const attachedChildren = g.getAttachedChildren(overlappedCard.id);
                const attachTarget = attachedChildren.length > 0
                    ? attachedChildren.reduce((topCard: any, nextCard: any) => (nextCard.depth > topCard.depth ? nextCard : topCard))
                    : overlappedCard;

                g.removeCardFromAllHolders(card);
                card.setZoneId(targetZoneId);
                g.attachCardToCard(card, attachTarget);
                g.emitBackendEvent('tool_attached', {
                    tool_card_id: card.id,
                    owner_id: card.getOwnerId(),
                    from_zone: originZoneId,
                    to_zone: targetZoneId,
                    attached_to_card_id: attachTarget.id,
                    interaction: 'drag_drop'
                });
                g.layoutAllHolders();
                g.redrawAllCardMarks();
                return;
            }

            if (cardType === 'item' || cardType === 'supporter') {
                const restoreToDragStart = (): void => {
                    if (dragStartPosition) {
                        card.setPosition(dragStartPosition.x, dragStartPosition.y);
                    }
                    g.layoutAllHolders();
                    g.redrawAllCardMarks();
                };

                if (originZoneId !== ownerHandZone) {
                    restoreToDragStart();
                    return;
                }

                if (targetZoneId === ownerHandZone) {
                    restoreToDragStart();
                }
                else {
                    restoreToDragStart();
                    g.emitBackendEvent('item_supporter_use', {
                        card_id: card.id,
                        card_type: card.getCardType(),
                        owner_id: card.getOwnerId(),
                        from_zone: originZoneId,
                        attempted_zone: targetZoneId,
                        to_zone: ownerHandZone,
                        reason: 'item_supporter_invalid_drop',
                        interaction: 'drag_drop'
                    });
                }
                return;
            }

            if (cardType === 'stadium') {
                if (originZoneId !== ownerHandZone || targetZoneId !== 'stadium') {
                    g.layoutAllHolders();
                    g.redrawAllCardMarks();
                    return;
                }

                g.moveCardToZone(card, 'stadium', () => {
                    g.emitBackendEvent('card_moved', {
                        card_id: card.id,
                        card_type: card.getCardType(),
                        owner_id: card.getOwnerId(),
                        from_zone: originZoneId,
                        to_zone: 'stadium',
                        interaction: 'drag_drop'
                    });
                    g.layoutAllHolders();
                    g.redrawAllCardMarks();
                });
                return;
            }

            g.layoutAllHolders();
            g.redrawAllCardMarks();
        });

        this.scene.input.on('dragend', (_pointer: Phaser.Input.Pointer, gameObject: Phaser.GameObjects.Rectangle, dropped: boolean) => {
            const card = g.getCardFromGameObject(gameObject);
            if (!card) {
                return;
            }

            if (!g.boardInputEnabled) {
                g.activelyDraggedCardIds.delete(card.id);
                g.dragOriginZoneByCardId.delete(card.id);
                g.dragStartPositionByCardId.delete(card.id);
                g.dragDistanceByCardId.delete(card.id);
                g.layoutAllHolders();
                g.redrawAllCardMarks();
                return;
            }

            if (g.isInteractionLockedByAnimation()) {
                g.activelyDraggedCardIds.delete(card.id);
                g.dragOriginZoneByCardId.delete(card.id);
                g.dragStartPositionByCardId.delete(card.id);
                g.dragDistanceByCardId.delete(card.id);
                g.layoutAllHolders();
                g.redrawAllCardMarks();
                return;
            }

            const wasDragged = g.activelyDraggedCardIds.has(card.id);
            const draggedDistance = g.dragDistanceByCardId.get(card.id) ?? 0;
            const originZoneId = g.dragOriginZoneByCardId.get(card.id) ?? card.getZoneId();
            const dragStartPosition = g.dragStartPositionByCardId.get(card.id);
            const minDragDistance = Math.max(GAME_INTERACTION.minDragDistancePx, Math.round(g.objectWidth * GAME_INTERACTION.minDragDistanceWidthRatio));

            g.activelyDraggedCardIds.delete(card.id);
            g.dragOriginZoneByCardId.delete(card.id);
            g.dragStartPositionByCardId.delete(card.id);
            g.dragDistanceByCardId.delete(card.id);

            if (!dropped) {
                const ownerHandZone = `${card.getOwnerId()}-hand`;
                const isItemSupporterReturnFromFreeDrop =
                    wasDragged &&
                    draggedDistance >= minDragDistance &&
                    (card.getCardType() === 'item' || card.getCardType() === 'supporter') &&
                    originZoneId === ownerHandZone;

                if (isItemSupporterReturnFromFreeDrop) {
                    if (dragStartPosition) {
                        card.setPosition(dragStartPosition.x, dragStartPosition.y);
                    }
                    g.emitBackendEvent('item_supporter_use', {
                        card_id: card.id,
                        card_type: card.getCardType(),
                        owner_id: card.getOwnerId(),
                        from_zone: originZoneId,
                        to_zone: ownerHandZone,
                        reason: 'item_supporter_free_drop',
                        interaction: 'drag_drop'
                    });
                    g.layoutAllHolders();
                    g.updateAttachedChildrenPositions(card);
                    g.redrawAllCardMarks();
                    return;
                }

                g.layoutAllHolders();
                g.updateAttachedChildrenPositions(card);
            }

            g.redrawAllCardMarks();
        });

        this.scene.input.on('dragstart', (_pointer: Phaser.Input.Pointer, gameObject: Phaser.GameObjects.GameObject) => {
            const token = g.energyTokenByBody.get(gameObject);
            if (!token || token.getAttachedToCardId()) {
                return;
            }

            if (!g.boardInputEnabled) {
                return;
            }

            if (g.isInteractionLockedByAnimation()) {
                return;
            }

            if (!g.canActOnToken(token)) {
                return;
            }

            if (!g.canDragTokenByPhase(token)) {
                return;
            }

            g.activelyDraggedEnergyTokenIds.add(token.id);
            g.energyDragStartPositionById.set(token.id, { x: token.x, y: token.y });
            g.energyDragDistanceById.set(token.id, 0);
            token.setDepth(ENERGY_TOKEN_DEPTHS.maxBelowUi);
        });

        this.scene.input.on('drag', (_pointer: Phaser.Input.Pointer, gameObject: Phaser.GameObjects.GameObject, dragX: number, dragY: number) => {
            const token = g.energyTokenByBody.get(gameObject);
            if (!token || !g.activelyDraggedEnergyTokenIds.has(token.id)) {
                return;
            }

            if (!g.boardInputEnabled) {
                g.activelyDraggedEnergyTokenIds.delete(token.id);
                g.energyDragStartPositionById.delete(token.id);
                g.energyDragDistanceById.delete(token.id);
                g.layoutEnergyTokensInZone(token.getZoneId());
                return;
            }

            if (g.isInteractionLockedByAnimation()) {
                g.activelyDraggedEnergyTokenIds.delete(token.id);
                g.energyDragStartPositionById.delete(token.id);
                g.energyDragDistanceById.delete(token.id);
                g.layoutEnergyTokensInZone(token.getZoneId());
                return;
            }

            token.setPosition(dragX, dragY);

            const dragStartPosition = g.energyDragStartPositionById.get(token.id);
            if (dragStartPosition) {
                const movedDistance = Phaser.Math.Distance.Between(dragStartPosition.x, dragStartPosition.y, dragX, dragY);
                const priorMaxDistance = g.energyDragDistanceById.get(token.id) ?? 0;
                if (movedDistance > priorMaxDistance) {
                    g.energyDragDistanceById.set(token.id, movedDistance);
                }
            }
        });

        this.scene.input.on('drop', (_pointer: Phaser.Input.Pointer, gameObject: Phaser.GameObjects.GameObject, dropZone: Phaser.GameObjects.Zone) => {
            const token = g.energyTokenByBody.get(gameObject);
            if (!token || !g.activelyDraggedEnergyTokenIds.has(token.id)) {
                return;
            }

            if (!g.boardInputEnabled) {
                g.activelyDraggedEnergyTokenIds.delete(token.id);
                g.energyDragStartPositionById.delete(token.id);
                g.energyDragDistanceById.delete(token.id);
                g.layoutEnergyTokensInZone(token.getZoneId());
                return;
            }

            if (g.isInteractionLockedByAnimation()) {
                g.activelyDraggedEnergyTokenIds.delete(token.id);
                g.energyDragStartPositionById.delete(token.id);
                g.energyDragDistanceById.delete(token.id);
                g.layoutEnergyTokensInZone(token.getZoneId());
                return;
            }

            g.activelyDraggedEnergyTokenIds.delete(token.id);
            g.energyDragStartPositionById.delete(token.id);
            g.energyDragDistanceById.delete(token.id);

            const fromZoneId = token.getZoneId();
            const fromAttachedToCardId = token.getAttachedToCardId();

            const sharedEnergyZoneId = g.energyZoneIdByOwner.p1;
            const targetZoneId = (dropZone?.getData('zoneId') as string | undefined) ?? null;
            const characterTarget = g.findOverlappedOwnedCharacterForToken(token);

            if (characterTarget) {
                g.attachEnergyTokenToCard(token, characterTarget);
                g.emitBackendEvent('energy_moved', {
                    energy_id: token.id,
                    owner_id: token.ownerId,
                    from_zone_id: fromZoneId,
                    to_zone_id: characterTarget.getZoneId(),
                    from_attached_to_card_id: fromAttachedToCardId,
                    to_attached_to_card_id: characterTarget.id,
                    interaction: 'drag_drop'
                });
                return;
            }

            if (targetZoneId === sharedEnergyZoneId) {
                token.setAttachedToCardId(null);
                g.setEnergyTokenZone(token, sharedEnergyZoneId);
                g.layoutEnergyTokensInZone(sharedEnergyZoneId);
                const didMove = fromZoneId !== sharedEnergyZoneId || fromAttachedToCardId !== null;
                if (didMove) {
                    g.emitBackendEvent('energy_moved', {
                        energy_id: token.id,
                        owner_id: token.ownerId,
                        from_zone_id: fromZoneId,
                        to_zone_id: sharedEnergyZoneId,
                        from_attached_to_card_id: fromAttachedToCardId,
                        to_attached_to_card_id: null,
                        interaction: 'drag_drop'
                    });
                }
                return;
            }

            g.layoutEnergyTokensInZone(token.getZoneId());
        });

        this.scene.input.on('dragend', (_pointer: Phaser.Input.Pointer, gameObject: Phaser.GameObjects.GameObject, dropped: boolean) => {
            const token = g.energyTokenByBody.get(gameObject);
            if (!token) {
                return;
            }

            if (!g.boardInputEnabled) {
                g.activelyDraggedEnergyTokenIds.delete(token.id);
                g.energyDragStartPositionById.delete(token.id);
                g.energyDragDistanceById.delete(token.id);
                g.layoutEnergyTokensInZone(token.getZoneId());
                return;
            }

            if (g.isInteractionLockedByAnimation()) {
                g.activelyDraggedEnergyTokenIds.delete(token.id);
                g.energyDragStartPositionById.delete(token.id);
                g.energyDragDistanceById.delete(token.id);
                g.layoutEnergyTokensInZone(token.getZoneId());
                return;
            }

            g.activelyDraggedEnergyTokenIds.delete(token.id);
            g.energyDragStartPositionById.delete(token.id);
            g.energyDragDistanceById.delete(token.id);

            if (!dropped) {
                g.layoutEnergyTokensInZone(token.getZoneId());
            }
        });
    }
}
