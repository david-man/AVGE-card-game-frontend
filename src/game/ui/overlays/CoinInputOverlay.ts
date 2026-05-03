import { Scene } from 'phaser';
import { GAME_INPUT_OVERLAY_HEADER_LAYOUT, GAME_OVERLAY_DEPTHS } from '../../config';
import { fitTextToSingleLine } from './textFit';

const COIN_FACE_TEXTURE_BY_RESULT: Record<'heads' | 'tails', string> = {
    heads: 'coin-heads',
    tails: 'coin-tails'
};

const COIN_FLIP_SOUND_KEY = 'coin-flip';

type CoinFlipCompleteCallback = (result: 'heads' | 'tails') => void;

export class CoinInputOverlay
{
    static preloadAssets (scene: Scene): void
    {
        scene.load.image('coin-heads', 'coin/heads.png');
        scene.load.image('coin-tails', 'coin/tails.png');
        scene.load.audio(COIN_FLIP_SOUND_KEY, 'sfx/coinflip.mp3');
    }

    private scene: Scene;
    private inputLockOverlay: Phaser.GameObjects.Rectangle;
    private image: Phaser.GameObjects.Image | null;
    private titleText: Phaser.GameObjects.Text | null;
    private hintText: Phaser.GameObjects.Text | null;
    private tickerEvent: Phaser.Time.TimerEvent | null;
    private isFlipping: boolean;
    private awaitingConfirm: boolean;
    private settledResult: 'heads' | 'tails' | null;
    private onComplete: CoinFlipCompleteCallback | null;
    private forcedFinalResult: 'heads' | 'tails' | null;
    private hintPreferredFontSize: number;

    constructor (scene: Scene, inputLockOverlay: Phaser.GameObjects.Rectangle)
    {
        this.scene = scene;
        this.inputLockOverlay = inputLockOverlay;
        this.image = null;
        this.titleText = null;
        this.hintText = null;
        this.tickerEvent = null;
        this.isFlipping = false;
        this.awaitingConfirm = false;
        this.settledResult = null;
        this.onComplete = null;
        this.forcedFinalResult = null;
        this.hintPreferredFontSize = GAME_INPUT_OVERLAY_HEADER_LAYOUT.hintFontSizeMin;
    }

    private pinObjectToViewport (object: Phaser.GameObjects.GameObject | null): void
    {
        if (!object) {
            return;
        }

        const candidate = object as Phaser.GameObjects.GameObject & {
            setScrollFactor?: (x: number, y?: number) => Phaser.GameObjects.GameObject;
        };

        if (typeof candidate.setScrollFactor === 'function') {
            candidate.setScrollFactor(0);
        }
    }

    hasActiveOverlay (): boolean
    {
        return Boolean(this.image || this.titleText || this.hintText);
    }

    stopActiveOverlay (): void
    {
        if (this.tickerEvent) {
            this.tickerEvent.remove(false);
            this.tickerEvent = null;
        }

        this.image?.destroy();
        this.image = null;

        this.titleText?.destroy();
        this.titleText = null;

        this.hintText?.destroy();
        this.hintText = null;

        this.isFlipping = false;
        this.awaitingConfirm = false;
        this.settledResult = null;
        this.onComplete = null;
        this.forcedFinalResult = null;
        this.hintPreferredFontSize = GAME_INPUT_OVERLAY_HEADER_LAYOUT.hintFontSizeMin;
    }

    start (onComplete: CoinFlipCompleteCallback, topMessage: string, forcedResult?: 'heads' | 'tails'): void
    {
        this.stopActiveOverlay();
        this.onComplete = onComplete;
        this.forcedFinalResult = forcedResult ?? null;

        const startResult = this.getRandomCoinResult();
        const overlayDepth = Math.max(GAME_OVERLAY_DEPTHS.overlayBase, this.inputLockOverlay.depth + 1);
        const coinSize = Math.max(140, Math.round(this.scene.scale.width * 0.1));
        const titleFontSize = Math.max(
            GAME_INPUT_OVERLAY_HEADER_LAYOUT.titleFontSizeMin,
            Math.round(this.scene.scale.width * GAME_INPUT_OVERLAY_HEADER_LAYOUT.titleFontSizeRatio)
        );
        const fittedTitleFontSize = fitTextToSingleLine({
            scene: this.scene,
            text: topMessage,
            preferredSize: titleFontSize,
            minSize: 10,
            maxWidth: Math.round(this.scene.scale.width * 0.92)
        });
        const titleGap = Math.max(
            GAME_INPUT_OVERLAY_HEADER_LAYOUT.messageGapMin,
            Math.round(this.scene.scale.height * GAME_INPUT_OVERLAY_HEADER_LAYOUT.messageGapRatio)
        );
        const hintMessage = 'CLICK COIN TO FLIP';
        this.hintPreferredFontSize = Math.max(
            GAME_INPUT_OVERLAY_HEADER_LAYOUT.hintFontSizeMin,
            Math.round(this.scene.scale.width * GAME_INPUT_OVERLAY_HEADER_LAYOUT.hintFontSizeRatio)
        );
        const fittedHintFontSize = fitTextToSingleLine({
            scene: this.scene,
            text: hintMessage,
            preferredSize: this.hintPreferredFontSize,
            minSize: GAME_INPUT_OVERLAY_HEADER_LAYOUT.hintFitMinSize,
            maxWidth: Math.round(this.scene.scale.width * 0.92)
        });

        this.image = this.scene.add.image(
            this.scene.scale.width / 2,
            this.scene.scale.height / 2,
            COIN_FACE_TEXTURE_BY_RESULT[startResult]
        )
            .setDisplaySize(coinSize, coinSize)
            .setDepth(overlayDepth)
            .setInteractive({ useHandCursor: true });

        this.titleText = this.scene.add.text(this.scene.scale.width / 2, this.scene.scale.height / 2 - Math.round(coinSize / 2) - titleGap, topMessage).setFontSize(fittedTitleFontSize)
            .setOrigin(0.5)
            .setDepth(overlayDepth);

        this.hintText = this.scene.add.text(this.scene.scale.width / 2, this.scene.scale.height / 2 + Math.round(coinSize * 0.8), hintMessage).setFontSize(fittedHintFontSize)
            .setOrigin(0.5)
            .setDepth(overlayDepth);

        this.pinObjectToViewport(this.image);
        this.pinObjectToViewport(this.titleText);
        this.pinObjectToViewport(this.hintText);

        this.image.on('pointerdown', () => {
            if (this.awaitingConfirm) {
                const callback = this.onComplete;
                const finalResult = this.settledResult;
                this.stopActiveOverlay();
                if (callback && finalResult) {
                    callback(finalResult);
                }
                return;
            }

            this.startFlipAnimation();
        });
    }

    private startFlipAnimation (): void
    {
        if (!this.image || this.isFlipping) {
            return;
        }

        this.isFlipping = true;
        if (this.scene.cache.audio.exists(COIN_FLIP_SOUND_KEY)) {
            this.scene.sound.play(COIN_FLIP_SOUND_KEY);
        }
        const finalResult = this.forcedFinalResult ?? this.getRandomCoinResult();
        const totalTicks = 12;
        let tickCount = 0;

        this.tickerEvent = this.scene.time.addEvent({
            delay: 75,
            repeat: totalTicks - 1,
            callback: () => {
                if (!this.image) {
                    return;
                }

                const nextResult = tickCount < totalTicks - 1 ? this.getRandomCoinResult() : finalResult;
                this.image.setTexture(COIN_FACE_TEXTURE_BY_RESULT[nextResult]);
                tickCount += 1;

                if (tickCount >= totalTicks) {
                    this.tickerEvent = null;
                    this.scene.tweens.add({
                        targets: this.image,
                        scaleX: 1.12,
                        scaleY: 1.12,
                        yoyo: true,
                        duration: 140,
                        ease: 'Sine.easeOut',
                        onComplete: () => {
                            this.isFlipping = false;
                            this.awaitingConfirm = true;
                            this.settledResult = finalResult;
                            if (this.hintText) {
                                const confirmHint = 'CLICK AGAIN TO CONFIRM';
                                this.hintText.setText(confirmHint);
                                this.hintText.setFontSize(fitTextToSingleLine({
                                    scene: this.scene,
                                    text: confirmHint,
                                    preferredSize: this.hintPreferredFontSize,
                                    minSize: GAME_INPUT_OVERLAY_HEADER_LAYOUT.hintFitMinSize,
                                    maxWidth: Math.round(this.scene.scale.width * 0.92)
                                }));
                            }
                        }
                    });
                }
            }
        });
    }

    private getRandomCoinResult (): 'heads' | 'tails'
    {
        return Phaser.Math.Between(0, 1) === 0 ? 'heads' : 'tails';
    }
}
