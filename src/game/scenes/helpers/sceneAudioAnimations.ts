import { Card, CardHolder } from '../../entities';
import { GAME_DEPTHS, GAME_LAYOUT, GAME_SHUFFLE_ANIMATION } from '../../config';

type SceneAudioAnimationScene = any;

const SHUFFLE_DECK_SOUND_KEY = 'shuffle-deck';
const SHUFFLE_DECK_FALLBACK_DURATION_MS = 900;
const REVEAL_SOUND_KEY = 'reveal';
const ENERGY_TOKEN_ATTACH_SOUND_KEY = 'energy-token-attach';
const SPARKLE_SOUND_KEY = 'sparkle';
const PUNCH_SOUND_KEY = 'punch';
const HEAVY_PUNCH_SOUND_KEY = 'heavy-punch';
const CARD_SLIDE_SOUND_KEY = 'card-slide';
const CARD_SHOVE_SOUND_KEY = 'card-shove';

export const isSfxPlaybackAllowed = (scene: SceneAudioAnimationScene): boolean => {
    const soundManager = scene.sound as Phaser.Sound.BaseSoundManager & {
        mute?: boolean;
        volume?: number;
    };
    if (soundManager.mute === true) {
        return false;
    }

    const masterVolume = typeof soundManager.volume === 'number' ? soundManager.volume : 1;
    return Number.isFinite(masterVolume) && masterVolume > 0.001;
};

const resolveCommandSoundKey = (scene: SceneAudioAnimationScene, rawSoundKey: string): string | null => {
    const requested = rawSoundKey.trim();
    if (!requested) {
        return null;
    }

    const normalizedRequested = requested.toLowerCase();
    const aliases: Record<string, string> = {
        'reveal.mp3': REVEAL_SOUND_KEY,
        'shuffle_deck.wav': SHUFFLE_DECK_SOUND_KEY,
        'shuffle-deck.wav': SHUFFLE_DECK_SOUND_KEY,
        'play_chip.ogg': ENERGY_TOKEN_ATTACH_SOUND_KEY,
        'play-chip.ogg': ENERGY_TOKEN_ATTACH_SOUND_KEY,
        'sparkle.mp3': SPARKLE_SOUND_KEY,
        sparkle: SPARKLE_SOUND_KEY,
        'punch.mp3': PUNCH_SOUND_KEY,
        'punch': PUNCH_SOUND_KEY,
        'heavy_punch.mp3': HEAVY_PUNCH_SOUND_KEY,
        'heavy-punch.mp3': HEAVY_PUNCH_SOUND_KEY,
        'heavy_punch': HEAVY_PUNCH_SOUND_KEY,
        'heavy-punch': HEAVY_PUNCH_SOUND_KEY,
        'card_slide.ogg': CARD_SLIDE_SOUND_KEY,
        'card-slide.ogg': CARD_SLIDE_SOUND_KEY,
        'card_slide': CARD_SLIDE_SOUND_KEY,
        'card-slide': CARD_SLIDE_SOUND_KEY,
        'card_shove.ogg': CARD_SHOVE_SOUND_KEY,
        'card-shove.ogg': CARD_SHOVE_SOUND_KEY,
        'card_shove': CARD_SHOVE_SOUND_KEY,
        'card-shove': CARD_SHOVE_SOUND_KEY,
    };
    const resolved = aliases[normalizedRequested] ?? requested;
    if (!scene.cache.audio.exists(resolved)) {
        return null;
    }

    return resolved;
};

const getShuffleDeckSoundDurationMs = (scene: SceneAudioAnimationScene): number => {
    if (!scene.cache.audio.exists(SHUFFLE_DECK_SOUND_KEY)) {
        return SHUFFLE_DECK_FALLBACK_DURATION_MS;
    }

    const sound = scene.sound.add(SHUFFLE_DECK_SOUND_KEY);
    const durationCandidate = (sound as { duration?: number; totalDuration?: number }).duration
        ?? (sound as { totalDuration?: number }).totalDuration;
    sound.destroy();

    if (!Number.isFinite(durationCandidate) || (durationCandidate ?? 0) <= 0) {
        return SHUFFLE_DECK_FALLBACK_DURATION_MS;
    }

    return Math.max(1, Math.round((durationCandidate as number) * 1000));
};

const resolveShuffleAnimationTiming = (cardCount: number, totalDurationMs?: number): {
    spreadDuration: number;
    settleDuration: number;
    cardDelayStepMs: number;
} => {
    const spreadDuration = Math.max(
        GAME_SHUFFLE_ANIMATION.spreadDurationMinMs,
        Math.round(GAME_LAYOUT.cardMoveDurationMs * GAME_SHUFFLE_ANIMATION.spreadDurationMoveDurationRatio)
    );
    const settleDuration = Math.max(
        GAME_SHUFFLE_ANIMATION.settleDurationMinMs,
        Math.round(GAME_LAYOUT.cardMoveDurationMs * GAME_SHUFFLE_ANIMATION.settleDurationMoveDurationRatio)
    );
    const baseDelayStep = GAME_SHUFFLE_ANIMATION.cardDelayStepMs;

    if (!Number.isFinite(totalDurationMs) || (totalDurationMs ?? 0) <= 0) {
        return {
            spreadDuration,
            settleDuration,
            cardDelayStepMs: baseDelayStep,
        };
    }

    const cardsAfterFirst = Math.max(0, cardCount - 1);
    const targetDurationMs = Math.max(2, Math.round(totalDurationMs as number));
    const maxDelayBudgetMs = Math.round(targetDurationMs * 0.22);
    const cardDelayStepMs = cardsAfterFirst > 0
        ? Math.min(baseDelayStep, Math.floor(maxDelayBudgetMs / cardsAfterFirst))
        : 0;
    const totalDelayMs = cardDelayStepMs * cardsAfterFirst;
    const motionBudgetMs = Math.max(2, targetDurationMs - totalDelayMs);
    const spreadRatioNumerator = GAME_SHUFFLE_ANIMATION.spreadDurationMoveDurationRatio;
    const spreadRatioDenominator = GAME_SHUFFLE_ANIMATION.spreadDurationMoveDurationRatio
        + GAME_SHUFFLE_ANIMATION.settleDurationMoveDurationRatio;
    const spreadRatio = spreadRatioDenominator > 0
        ? (spreadRatioNumerator / spreadRatioDenominator)
        : 0.5;
    const syncedSpreadDuration = Math.max(1, Math.round(motionBudgetMs * spreadRatio));
    const syncedSettleDuration = Math.max(1, motionBudgetMs - syncedSpreadDuration);

    return {
        spreadDuration: syncedSpreadDuration,
        settleDuration: syncedSettleDuration,
        cardDelayStepMs,
    };
};

export const playShuffleDeckSoundAndGetDurationMs = (scene: SceneAudioAnimationScene): number => {
    // Backend animations now own shuffle sound playback; frontend keeps
    // this helper for duration-based shuffle visual timing only.
    return getShuffleDeckSoundDurationMs(scene);
};

export const playRevealSound = (scene: SceneAudioAnimationScene, minIntervalMs: number = 0): void => {
    if (!scene.cache.audio.exists(REVEAL_SOUND_KEY) || !isSfxPlaybackAllowed(scene)) {
        return;
    }

    const nowMs = scene.time.now;
    if (Number.isFinite(minIntervalMs) && minIntervalMs > 0) {
        const elapsedMs = nowMs - scene.lastRevealSoundPlayedAtMs;
        if (Number.isFinite(elapsedMs) && elapsedMs < minIntervalMs) {
            return;
        }
    }

    scene.sound.play(REVEAL_SOUND_KEY);
    scene.lastRevealSoundPlayedAtMs = nowMs;
};

export const playCommandSound = (scene: SceneAudioAnimationScene, rawSoundKey: string): boolean => {
    const resolved = resolveCommandSoundKey(scene, rawSoundKey);
    if (!resolved) {
        return false;
    }

    if (!isSfxPlaybackAllowed(scene)) {
        return true;
    }

    scene.sound.play(resolved);
    return true;
};

export const playCommandSoundAsSceneAnimation = (scene: SceneAudioAnimationScene, rawSoundKey: string): boolean => {
    const resolved = resolveCommandSoundKey(scene, rawSoundKey);
    if (!resolved) {
        return false;
    }

    if (!isSfxPlaybackAllowed(scene)) {
        return true;
    }

    scene.beginSceneAnimation();
    const maybeWebAudioContext = (scene.sound as Phaser.Sound.BaseSoundManager & {
        context?: { state?: string; resume?: () => Promise<unknown> };
    }).context;
    if (maybeWebAudioContext?.state === 'suspended' && typeof maybeWebAudioContext.resume === 'function') {
        void maybeWebAudioContext.resume().catch(() => {
            // Best effort only; retry loop below still handles delayed readiness.
        });
    }

    let settled = false;
    const settle = () => {
        if (settled) {
            return;
        }

        settled = true;
        scene.endSceneAnimation();
    };

    const maxAttempts = 8;
    const retryDelayMs = 120;
    const tryPlayAttempt = (attempt: number): void => {
        const sound = scene.sound.add(resolved);
        let completed = false;

        const finish = () => {
            if (completed) {
                return;
            }

            completed = true;
            sound.destroy();
            settle();
        };

        const durationCandidate = (sound as { duration?: number; totalDuration?: number }).duration
            ?? (sound as { totalDuration?: number }).totalDuration;
        const fallbackDelayMs = Number.isFinite(durationCandidate) && (durationCandidate ?? 0) > 0
            ? Math.max(1, Math.round((durationCandidate as number) * 1000) + 40)
            : 1200;

        sound.once('complete', finish);
        const played = sound.play();
        if (!played) {
            sound.destroy();
            if (attempt + 1 < maxAttempts) {
                scene.time.delayedCall(retryDelayMs, () => {
                    tryPlayAttempt(attempt + 1);
                });
                return;
            }

            settle();
            return;
        }

        scene.time.delayedCall(fallbackDelayMs, finish);
    };

    tryPlayAttempt(0);
    return true;
};

export const playShuffleAnimationForPile = (
    scene: SceneAudioAnimationScene,
    holder: CardHolder,
    totalDurationMs?: number
): boolean => {
    if (!scene.isDeckOrDiscardHolderId(holder.id)) {
        return false;
    }

    const pileCards = holder.cards.slice();
    if (pileCards.length < GAME_SHUFFLE_ANIMATION.minCardsRequired) {
        return false;
    }

    const scatterX = Math.max(GAME_SHUFFLE_ANIMATION.scatterXMinPx, Math.round(scene.objectWidth * GAME_SHUFFLE_ANIMATION.scatterXWidthRatio));
    const scatterY = Math.max(GAME_SHUFFLE_ANIMATION.scatterYMinPx, Math.round(scene.objectHeight * GAME_SHUFFLE_ANIMATION.scatterYHeightRatio));
    const timing = resolveShuffleAnimationTiming(pileCards.length, totalDurationMs);

    scene.beginSceneAnimation();
    let pendingCards = pileCards.length;

    pileCards.forEach((card: Card, index: number) => {
        const startX = card.x;
        const startY = card.y;
        const shuffleX = startX + Phaser.Math.Between(-scatterX, scatterX);
        const shuffleY = startY + Phaser.Math.Between(-scatterY, scatterY);

        card.setDepth(GAME_DEPTHS.cardDragging + index);

        scene.tweens.add({
            targets: card.body,
            x: shuffleX,
            y: shuffleY,
            duration: timing.spreadDuration,
            delay: index * timing.cardDelayStepMs,
            ease: 'Sine.easeOut',
            onUpdate: () => {
                card.redrawMarks();
                scene.updateAttachedChildrenPositions(card);
            },
            onComplete: () => {
                scene.tweens.add({
                    targets: card.body,
                    x: startX,
                    y: startY,
                    duration: timing.settleDuration,
                    ease: 'Sine.easeInOut',
                    onUpdate: () => {
                        card.redrawMarks();
                        scene.updateAttachedChildrenPositions(card);
                    },
                    onComplete: () => {
                        pendingCards -= 1;
                        if (pendingCards === 0) {
                            scene.layoutAllHolders();
                            scene.redrawAllCardMarks();
                            scene.endSceneAnimation();
                        }
                    }
                });
            }
        });
    });

    return true;
};

export const playSingleCardShuffleAnimationForPile = (
    scene: SceneAudioAnimationScene,
    card: Card,
    holder: CardHolder
): boolean => {
    if (!scene.isDeckOrDiscardHolderId(holder.id)) {
        return false;
    }

    if (!holder.cards.includes(card)) {
        return false;
    }

    const scatterX = Math.max(GAME_SHUFFLE_ANIMATION.scatterXMinPx, Math.round(scene.objectWidth * GAME_SHUFFLE_ANIMATION.scatterXWidthRatio));
    const scatterY = Math.max(GAME_SHUFFLE_ANIMATION.scatterYMinPx, Math.round(scene.objectHeight * GAME_SHUFFLE_ANIMATION.scatterYHeightRatio));
    const spreadDuration = Math.max(GAME_SHUFFLE_ANIMATION.spreadDurationMinMs, Math.round(GAME_LAYOUT.cardMoveDurationMs * GAME_SHUFFLE_ANIMATION.spreadDurationMoveDurationRatio));
    const settleDuration = Math.max(GAME_SHUFFLE_ANIMATION.settleDurationMinMs, Math.round(GAME_LAYOUT.cardMoveDurationMs * GAME_SHUFFLE_ANIMATION.settleDurationMoveDurationRatio));
    const startX = card.x;
    const startY = card.y;
    const shuffleX = startX + Phaser.Math.Between(-scatterX, scatterX);
    const shuffleY = startY + Phaser.Math.Between(-scatterY, scatterY);

    scene.beginSceneAnimation();
    card.setDepth(GAME_DEPTHS.cardDragging + 1);

    scene.tweens.add({
        targets: card.body,
        x: shuffleX,
        y: shuffleY,
        duration: spreadDuration,
        ease: 'Sine.easeOut',
        onUpdate: () => {
            card.redrawMarks();
            scene.updateAttachedChildrenPositions(card);
        },
        onComplete: () => {
            scene.tweens.add({
                targets: card.body,
                x: startX,
                y: startY,
                duration: settleDuration,
                ease: 'Sine.easeInOut',
                onUpdate: () => {
                    card.redrawMarks();
                    scene.updateAttachedChildrenPositions(card);
                },
                onComplete: () => {
                    scene.layoutAllHolders();
                    scene.redrawAllCardMarks();
                    scene.endSceneAnimation();
                }
            });
        }
    });

    return true;
};
