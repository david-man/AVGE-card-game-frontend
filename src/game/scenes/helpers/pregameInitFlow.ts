import {
    GAME_CENTER_X,
    GAME_CENTER_Y,
    GAME_HEIGHT,
    GAME_INIT_COUNTDOWN_OVERLAY,
    GAME_OVERLAY_DEPTHS,
    GAME_SCENE_VISUALS,
    GAME_WIDTH,
    MAX_BENCH_CARDS,
    UI_SCALE,
} from '../../config';
import { isSfxPlaybackAllowed } from './sceneAudioAnimations';

type PregameInitScene = any;

const COUNTDOWN_LOW_BEEP_SOUND_KEY = 'countdown-lowbeep';
const COUNTDOWN_HIGH_BEEP_SOUND_KEY = 'countdown-highbeep';

export const createInitStartCountdownOverlay = (scene: PregameInitScene): void => {
    const overlayDepth = Math.max(
        GAME_OVERLAY_DEPTHS.overlayBase + GAME_INIT_COUNTDOWN_OVERLAY.depthOffset,
        scene.inputLockOverlay.depth + 1
    );

    scene.initStartCountdownOverlay = scene.add.rectangle(
        GAME_CENTER_X,
        GAME_CENTER_Y,
        GAME_WIDTH,
        GAME_HEIGHT,
        GAME_SCENE_VISUALS.inputLockColor,
        GAME_INIT_COUNTDOWN_OVERLAY.backdropAlpha
    )
        .setDepth(overlayDepth)
        .setInteractive({ useHandCursor: false })
        .setVisible(false)
        .setAlpha(0);

    scene.initStartCountdownOverlay.on('pointerdown', (
        _pointer: Phaser.Input.Pointer,
        _localX: number,
        _localY: number,
        event: Phaser.Types.Input.EventData
    ) => {
        event.stopPropagation();
    });

    const numberFontSize = Math.max(
        GAME_INIT_COUNTDOWN_OVERLAY.fontSizeMin,
        Math.round(GAME_INIT_COUNTDOWN_OVERLAY.numberFontSizeBase * UI_SCALE)
    );

    scene.initStartCountdownText = scene.add.text(GAME_CENTER_X, GAME_CENTER_Y, '')
        .setFontSize(numberFontSize)
        .setOrigin(0.5)
        .setAlign('center')
        .setDepth(overlayDepth + 1)
        .setTint(GAME_INIT_COUNTDOWN_OVERLAY.numberTint)
        .setVisible(false)
        .setAlpha(0);

    scene.initStartCountdownTimer = null;
    scene.initStartCountdownTween = null;
    scene.initStartCountdownBackdropTween = null;
    scene.initStartCountdownAnimationLocked = false;
    scene.initStartCountdownAckGateActive = false;
};

export const stopInitStartCountdownAnimation = (scene: PregameInitScene): void => {
    if (scene.initStartCountdownTimer) {
        scene.initStartCountdownTimer.remove(false);
        scene.initStartCountdownTimer = null;
    }

    if (scene.initStartCountdownTween) {
        scene.initStartCountdownTween.remove();
        scene.initStartCountdownTween = null;
    }

    if (scene.initStartCountdownBackdropTween) {
        scene.initStartCountdownBackdropTween.remove();
        scene.initStartCountdownBackdropTween = null;
    }

    scene.initStartCountdownOverlay
        .setVisible(false)
        .setAlpha(0);
    scene.initStartCountdownText
        .setVisible(false)
        .setAlpha(0)
        .setScale(1);

    const hadAckGate = scene.initStartCountdownAckGateActive;
    scene.initStartCountdownAckGateActive = false;

    if (scene.initStartCountdownAnimationLocked) {
        scene.initStartCountdownAnimationLocked = false;
        scene.endSceneAnimation();
        return;
    }

    if (hadAckGate && !scene.commandExecutionInProgress && !scene.isInteractionLockedByAnimation()) {
        scene.flushPendingBackendEvents();
    }
};

export const playInitStartCountdownAnimation = (scene: PregameInitScene): void => {
    stopInitStartCountdownAnimation(scene);
    scene.initStartCountdownAnimationLocked = true;
    scene.beginSceneAnimation();

    scene.initStartCountdownOverlay
        .setVisible(true)
        .setAlpha(0);
    scene.initStartCountdownText
        .setVisible(true)
        .setText('')
        .setAlpha(0)
        .setScale(1);

    scene.initStartCountdownBackdropTween = scene.tweens.add({
        targets: scene.initStartCountdownOverlay,
        alpha: GAME_INIT_COUNTDOWN_OVERLAY.backdropAlpha,
        duration: GAME_INIT_COUNTDOWN_OVERLAY.backdropFadeInMs,
        ease: 'Sine.easeOut'
    });

    let messageIndex = 0;
    const runStep = (): void => {
        if (messageIndex >= GAME_INIT_COUNTDOWN_OVERLAY.messages.length) {
            scene.initStartCountdownBackdropTween = scene.tweens.add({
                targets: scene.initStartCountdownOverlay,
                alpha: 0,
                duration: GAME_INIT_COUNTDOWN_OVERLAY.backdropFadeOutMs,
                ease: 'Sine.easeIn',
                onComplete: () => {
                    stopInitStartCountdownAnimation(scene);
                }
            });
            return;
        }

        const message = GAME_INIT_COUNTDOWN_OVERLAY.messages[messageIndex];
        const isFinalStep = messageIndex === GAME_INIT_COUNTDOWN_OVERLAY.messages.length - 1;
        const holdDuration = isFinalStep
            ? GAME_INIT_COUNTDOWN_OVERLAY.fightHoldMs
            : GAME_INIT_COUNTDOWN_OVERLAY.numberHoldMs;
        const baseFontSize = isFinalStep
            ? GAME_INIT_COUNTDOWN_OVERLAY.fightFontSizeBase
            : GAME_INIT_COUNTDOWN_OVERLAY.numberFontSizeBase;
        const fontSize = Math.max(
            GAME_INIT_COUNTDOWN_OVERLAY.fontSizeMin,
            Math.round(baseFontSize * UI_SCALE)
        );

        scene.initStartCountdownText
            .setText(message)
            .setFontSize(fontSize)
            .setTint(isFinalStep ? GAME_INIT_COUNTDOWN_OVERLAY.fightTint : GAME_INIT_COUNTDOWN_OVERLAY.numberTint)
            .setScale(GAME_INIT_COUNTDOWN_OVERLAY.popStartScale)
            .setAlpha(0);

        const countdownSoundKey = isFinalStep
            ? COUNTDOWN_HIGH_BEEP_SOUND_KEY
            : COUNTDOWN_LOW_BEEP_SOUND_KEY;
        const countdownSoundVolume = isFinalStep
            ? GAME_INIT_COUNTDOWN_OVERLAY.highBeepVolume
            : GAME_INIT_COUNTDOWN_OVERLAY.lowBeepVolume;
        if (scene.cache.audio.exists(countdownSoundKey) && isSfxPlaybackAllowed(scene)) {
            scene.sound.play(countdownSoundKey, { volume: countdownSoundVolume });
        }

        const popDuration = GAME_INIT_COUNTDOWN_OVERLAY.popDurationMs;
        const fadeOutDuration = GAME_INIT_COUNTDOWN_OVERLAY.fadeOutDurationMs;
        const holdAfterPopMs = Math.max(0, holdDuration - popDuration - fadeOutDuration);

        scene.tweens.killTweensOf(scene.initStartCountdownText);
        messageIndex += 1;

        scene.initStartCountdownTween = scene.tweens.add({
            targets: scene.initStartCountdownText,
            alpha: 1,
            scaleX: 1,
            scaleY: 1,
            duration: popDuration,
            ease: 'Back.easeOut',
            onComplete: () => {
                scene.initStartCountdownTween = scene.tweens.add({
                    targets: scene.initStartCountdownText,
                    alpha: 0,
                    duration: fadeOutDuration,
                    delay: holdAfterPopMs,
                    ease: 'Sine.easeIn',
                    onComplete: () => {
                        runStep();
                    }
                });
            }
        });
        scene.initStartCountdownTimer = null;
    };

    runStep();
};

export const submitInitSetupDone = (scene: PregameInitScene): void => {
    if (!isPregameInitActive(scene)) {
        return;
    }

    if (scene.activeViewMode !== 'p1' && scene.activeViewMode !== 'p2') {
        scene.appendTerminalLine('Init setup is only available in player view.');
        return;
    }

    const owner = scene.activeViewMode;
    const activeHolder = scene.cardHolderById[`${owner}-active`];
    const benchHolder = scene.cardHolderById[`${owner}-bench`];
    if (!activeHolder || !benchHolder) {
        scene.appendTerminalLine('Could not resolve your board zones for init setup.');
        return;
    }

    const activeCharacters = activeHolder.cards.filter((card: any) => card.getCardType() === 'character');
    if (activeCharacters.length !== 1) {
        scene.appendTerminalLine('Init setup requires exactly 1 active character.');
        return;
    }

    const benchCharacterIds = benchHolder.cards
        .filter((card: any) => card.getCardType() === 'character')
        .map((card: any) => card.id);

    if (benchCharacterIds.length > MAX_BENCH_CARDS) {
        scene.appendTerminalLine(`Init setup allows up to ${MAX_BENCH_CARDS} bench characters.`);
        return;
    }

    scene.appendTerminalLine('Submitting init setup...');
    scene.setInputAcknowledged(false);

    scene.enqueueProtocolPacket('init_setup_done', {
        active_card_id: activeCharacters[0].id,
        bench_card_ids: benchCharacterIds,
    });
};

export const isPregameInitActive = (scene: PregameInitScene): boolean => {
    return scene.pregameInitStage === 'init';
};

export const isInitWaitingForOpponent = (scene: PregameInitScene): boolean => {
    return isPregameInitActive(scene) && scene.initSetupConfirmed && !scene.opponentInitSetupConfirmed;
};

export const onPregameInitLocalMove = (scene: PregameInitScene): void => {
    if (!isPregameInitActive(scene)) {
        return;
    }
    scene.refreshPhaseStateActionButton();
};