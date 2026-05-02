import { Card, EnergyToken } from '../../entities';
import {
    ENERGY_TOKEN_DEPTHS,
    GAME_DEPTHS,
    GAME_EXPLOSION,
    GAME_HP_PULSE_ANIMATION,
    GAME_LAYOUT,
} from '../../config';

type SceneAnimationScene = any;

const CRIT_PARTICLE_TEXTURE_KEY = 'crit-particle';
const REGENERATION_PARTICLE_TEXTURE_KEY = 'regeneration-particle';

const clearCardHpPulseAnimation = (scene: SceneAnimationScene, card: Card): void => {
    const active = scene.hpPulseAnimationByCardId.get(card.id);
    if (!active) {
        return;
    }

    active.pulseTween.remove();
    active.overlayTween.remove();
    active.overlay.destroy();

    card.body.setScale(active.baseScaleX, active.baseScaleY);
    scene.updateAttachedChildrenPositions(card);
    scene.redrawAllCardMarks();

    scene.hpPulseAnimationByCardId.delete(card.id);
    scene.endSceneAnimation();
};

export const clearAllCardHpPulseAnimations = (scene: SceneAnimationScene): void => {
    for (const card of scene.cards) {
        clearCardHpPulseAnimation(scene, card);
    }
};

export const animateCardToZone = (
    scene: SceneAnimationScene,
    card: Card,
    zoneId: string,
    onComplete: () => void
): void => {
    const holder = scene.cardHolderById[zoneId];
    card.setDepth(GAME_DEPTHS.cardDragging);
    scene.beginSceneAnimation();

    scene.tweens.add({
        targets: card.body,
        x: holder.x,
        y: holder.y,
        duration: GAME_LAYOUT.cardMoveDurationMs,
        ease: 'Sine.easeInOut',
        onUpdate: () => {
            scene.updateAttachedChildrenPositions(card);
            scene.redrawAllCardMarks();
        },
        onComplete: () => {
            scene.endSceneAnimation();
            onComplete();
        }
    });
};

export const animateCardBetweenPoints = (
    scene: SceneAnimationScene,
    card: Card,
    fromX: number,
    fromY: number,
    toX: number,
    toY: number,
    onComplete: () => void
): void => {
    card.setPosition(fromX, fromY);
    card.setDepth(GAME_DEPTHS.cardDragging);
    scene.beginSceneAnimation();

    scene.tweens.add({
        targets: card.body,
        x: toX,
        y: toY,
        duration: GAME_LAYOUT.cardMoveDurationMs,
        ease: 'Sine.easeInOut',
        onUpdate: () => {
            scene.updateAttachedChildrenPositions(card);
            scene.redrawAllCardMarks();
        },
        onComplete: () => {
            scene.endSceneAnimation();
            onComplete();
        }
    });
};

export const animateCardHpChange = (
    scene: SceneAnimationScene,
    card: Card,
    nextHp: number,
    nextMaxHp: number
): void => {
    const previousHp = card.getHp();

    card.setHpValues(nextHp, nextMaxHp);
    scene.redrawAllCardMarks();

    const hpDelta = nextHp - previousHp;
    if (hpDelta === 0) {
        return;
    }

    clearCardHpPulseAnimation(scene, card);
    scene.beginSceneAnimation();

    const isDamage = hpDelta < 0;
    const baseScaleX = card.body.scaleX;
    const baseScaleY = card.body.scaleY;
    const overlayColor = isDamage ? 0xff3b30 : 0x22c55e;
    const initialBounds = card.getBounds();
    const overlay = scene.add.rectangle(
        card.x,
        card.y,
        Math.max(1, initialBounds.width),
        Math.max(1, initialBounds.height),
        overlayColor,
        1
    )
        .setOrigin(0.5)
        .setDepth(card.depth + 0.02)
        .setBlendMode(Phaser.BlendModes.ADD)
        .setAlpha(0.8);

    const syncOverlayToCard = () => {
        const bounds = card.getBounds();
        overlay.setPosition(card.x, card.y);
        overlay.setDisplaySize(Math.max(1, bounds.width), Math.max(1, bounds.height));
        overlay.setDepth(card.depth + 0.02);
    };

    const pulseTween = scene.tweens.add({
        targets: card.body,
        scaleX: baseScaleX * GAME_HP_PULSE_ANIMATION.scaleMultiplier,
        scaleY: baseScaleY * GAME_HP_PULSE_ANIMATION.scaleMultiplier,
        duration: GAME_HP_PULSE_ANIMATION.durationMs,
        ease: 'Sine.easeOut',
        yoyo: true,
        onUpdate: () => {
            syncOverlayToCard();
            scene.updateAttachedChildrenPositions(card);
            scene.redrawAllCardMarks();
        },
        onComplete: () => {
            clearCardHpPulseAnimation(scene, card);
        }
    });

    const overlayTween = scene.tweens.add({
        targets: overlay,
        alpha: GAME_HP_PULSE_ANIMATION.overlayAlpha,
        duration: GAME_HP_PULSE_ANIMATION.durationMs,
        ease: 'Sine.easeOut',
        yoyo: true,
    });

    scene.hpPulseAnimationByCardId.set(card.id, {
        baseScaleX,
        baseScaleY,
        overlay,
        pulseTween,
        overlayTween,
    });
};

export const animateToolAttachToCard = (
    scene: SceneAnimationScene,
    child: Card,
    parent: Card,
    onComplete?: () => void
): void => {
    if (child === parent) {
        if (onComplete) {
            onComplete();
        }
        return;
    }

    scene.detachCard(child);
    scene.removeCardFromAllHolders(child);
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

    scene.beginSceneAnimation();
    scene.tweens.add({
        targets: tweenState,
        x: targetX,
        y: targetY,
        scale: targetScale,
        duration: GAME_LAYOUT.cardMoveDurationMs,
        ease: 'Sine.easeInOut',
        onUpdate: () => {
            child.setPosition(tweenState.x, tweenState.y);
            child.setScale(tweenState.scale);
            scene.updateAttachedChildrenPositions(child);
            scene.redrawAllCardMarks();
        },
        onComplete: () => {
            scene.updateAttachedCardPosition(child, parent);
            scene.updateAttachedChildrenPositions(parent);
            scene.redrawAllCardMarks();
            scene.endSceneAnimation();
            if (onComplete) {
                onComplete();
            }
        }
    });
};

export const animateEnergyTokenToZone = (
    scene: SceneAnimationScene,
    token: EnergyToken,
    zoneId: string,
    onComplete?: () => void
): void => {
    const destinationHolder = scene.energyHolderById[zoneId];
    if (!destinationHolder) {
        if (onComplete) {
            onComplete();
        }
        return;
    }

    const previousZoneId = token.getZoneId();
    const previousAttachedToCardId = token.getAttachedToCardId();
    if (previousAttachedToCardId) {
        token.setAttachedToCardId(null);
    }

    token.setDepth(ENERGY_TOKEN_DEPTHS.maxBelowUi);
    scene.beginSceneAnimation();
    scene.tweens.add({
        targets: token.body,
        x: destinationHolder.x,
        y: destinationHolder.y,
        duration: Math.round(GAME_LAYOUT.cardMoveDurationMs * 0.8),
        ease: 'Sine.easeInOut',
        onComplete: () => {
            scene.setEnergyTokenZone(token, zoneId);
            scene.layoutEnergyTokensInZone(previousZoneId);
            scene.layoutEnergyTokensInZone(zoneId);

            if (previousAttachedToCardId) {
                const previousParent = scene.cardById[previousAttachedToCardId];
                if (previousParent) {
                    scene.updateAttachedEnergyTokenPositions(previousParent);
                }
            }

            scene.endSceneAnimation();
            if (onComplete) {
                onComplete();
            }
        }
    });
};

export const animateAttachEnergyTokenToCard = (
    scene: SceneAnimationScene,
    token: EnergyToken,
    parent: Card,
    onComplete?: () => void
): void => {
    const ownerZoneId = scene.energyZoneIdByOwner.p1;
    const previousZoneId = token.getZoneId();
    const previousAttachedToCardId = token.getAttachedToCardId();

    const existingAttached = scene
        .getAttachedEnergyTokens(parent.id)
        .filter((candidate: EnergyToken) => candidate !== token);
    const tokenWidth = token.getDisplayWidth();
    const tokenHeight = token.getDisplayHeight();
    const parentBounds = parent.getBounds();
    const horizontalStep = tokenWidth * GAME_LAYOUT.energyTokenAttachedHorizontalStepRatio;
    const startX = parentBounds.left + (tokenWidth / 2) + GAME_LAYOUT.energyTokenAttachedPadding;
    const targetX = startX + (existingAttached.length * horizontalStep);
    const targetY = parentBounds.bottom - (tokenHeight / 2) - GAME_LAYOUT.energyTokenAttachedPadding;

    token.setDepth(ENERGY_TOKEN_DEPTHS.maxBelowUi);
    scene.beginSceneAnimation();
    scene.tweens.add({
        targets: token.body,
        x: targetX,
        y: targetY,
        duration: Math.round(GAME_LAYOUT.cardMoveDurationMs * 0.8),
        ease: 'Sine.easeInOut',
        onComplete: () => {
            token.setAttachedToCardId(parent.id);
            scene.setEnergyTokenZone(token, ownerZoneId);
            scene.layoutEnergyTokensInZone(previousZoneId);
            scene.layoutEnergyTokensInZone(ownerZoneId);
            scene.updateAttachedEnergyTokenPositions(parent);

            if (previousAttachedToCardId && previousAttachedToCardId !== parent.id) {
                const previousParent = scene.cardById[previousAttachedToCardId];
                if (previousParent) {
                    scene.updateAttachedEnergyTokenPositions(previousParent);
                }
            }

            scene.endSceneAnimation();
            if (onComplete) {
                onComplete();
            }
        }
    });
};

export const resolveBoomTextureKey = (scene: SceneAnimationScene, rawAssetName?: string): string | null => {
    if (!rawAssetName) {
        return scene.textures.exists(CRIT_PARTICLE_TEXTURE_KEY)
            ? CRIT_PARTICLE_TEXTURE_KEY
            : null;
    }

    const key = rawAssetName.toLowerCase();
    const aliases: Record<string, string> = {
        background: 'background',
        bg: 'background',
        'background/background_element.png': 'background',
        board: 'board-background',
        'base_board.png': 'board-background',
        'background/base_board.png': 'board-background',
        crit: CRIT_PARTICLE_TEXTURE_KEY,
        'crit.png': CRIT_PARTICLE_TEXTURE_KEY,
        'icons/crit.png': CRIT_PARTICLE_TEXTURE_KEY,
        regeneration: REGENERATION_PARTICLE_TEXTURE_KEY,
        'regeneration.png': REGENERATION_PARTICLE_TEXTURE_KEY,
        'icons/regeneration.png': REGENERATION_PARTICLE_TEXTURE_KEY,
    };

    const resolved = aliases[key];
    if (!resolved) {
        return null;
    }

    return scene.textures.exists(resolved) ? resolved : null;
};

export const playBoomExplosion = (scene: SceneAnimationScene, card: Card, textureKey: string): void => {
    const durationMs = GAME_EXPLOSION.durationMs;
    const count = GAME_EXPLOSION.count;
    const fallbackBaseScale = Math.max(GAME_EXPLOSION.minScale, scene.objectWidth / GAME_EXPLOSION.scaleDivisor);
    const texture = scene.textures.get(textureKey);
    const sourceImage = texture.getSourceImage() as { width?: number; height?: number } | undefined;
    const sourceWidth = Number(sourceImage?.width ?? 0);
    const sourceHeight = Number(sourceImage?.height ?? 0);
    const maxSourceDimension = Math.max(sourceWidth, sourceHeight);
    const targetParticleSizePx = Math.max(18, Math.round(scene.objectWidth * 0.58));
    const normalizedScale = maxSourceDimension > 0
        ? targetParticleSizePx / maxSourceDimension
        : fallbackBaseScale;
    const baseScale = Math.max(GAME_EXPLOSION.minScale, normalizedScale);

    for (let i = 0; i < count; i += 1) {
        const image = scene.add.image(card.x, card.y, textureKey)
            .setDepth(GAME_DEPTHS.explosionBase + i)
            .setScale(baseScale * Phaser.Math.FloatBetween(GAME_EXPLOSION.scaleMinMultiplier, GAME_EXPLOSION.scaleMaxMultiplier))
            .setAlpha(1)
            .setAngle(Phaser.Math.Between(GAME_EXPLOSION.initialRotationMin, GAME_EXPLOSION.initialRotationMax));

        const angle = Phaser.Math.FloatBetween(0, Math.PI * 2);
        const distance = Phaser.Math.FloatBetween(scene.objectWidth * GAME_EXPLOSION.distanceMinWidthRatio, scene.objectWidth * GAME_EXPLOSION.distanceMaxWidthRatio);
        const targetX = card.x + (Math.cos(angle) * distance);
        const targetY = card.y + (Math.sin(angle) * distance);

        scene.beginSceneAnimation();
        scene.tweens.add({
            targets: image,
            x: targetX,
            y: targetY,
            alpha: 0,
            angle: image.angle + Phaser.Math.Between(GAME_EXPLOSION.rotationDeltaMin, GAME_EXPLOSION.rotationDeltaMax),
            duration: durationMs,
            ease: 'Cubic.easeOut',
            onComplete: () => {
                image.destroy();
                scene.endSceneAnimation();
            }
        });
    }
};
