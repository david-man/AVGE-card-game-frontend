import { Scene } from 'phaser';
import { GAME_INPUT_OVERLAY_HEADER_LAYOUT } from '../../config';
import { fitBitmapTextToSingleLine } from './bitmapTextFit';

const COIN_FACE_TEXTURE_BY_RESULT: Record<'heads' | 'tails', string> = {
    heads: 'coin-heads',
    tails: 'coin-tails'
};

type CoinFlipCompleteCallback = (result: 'heads' | 'tails') => void;

export class CoinInputOverlay
{
    static preloadAssets (scene: Scene): void
    {
        scene.load.image('coin-heads', 'coin/heads.png');
        scene.load.image('coin-tails', 'coin/tails.png');
    }

    private scene: Scene;
    private inputLockOverlay: Phaser.GameObjects.Rectangle;
    private image: Phaser.GameObjects.Image | null;
    private titleText: Phaser.GameObjects.BitmapText | null;
    private hintText: Phaser.GameObjects.BitmapText | null;
    private tickerEvent: Phaser.Time.TimerEvent | null;
    private isFlipping: boolean;
    private onComplete: CoinFlipCompleteCallback | null;

    constructor (scene: Scene, inputLockOverlay: Phaser.GameObjects.Rectangle)
    {
        this.scene = scene;
        this.inputLockOverlay = inputLockOverlay;
        this.image = null;
        this.titleText = null;
        this.hintText = null;
        this.tickerEvent = null;
        this.isFlipping = false;
        this.onComplete = null;
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
        this.onComplete = null;
    }

    start (onComplete: CoinFlipCompleteCallback, topMessage: string): void
    {
        this.stopActiveOverlay();
        this.onComplete = onComplete;

        const startResult = this.getRandomCoinResult();
        const overlayDepth = this.inputLockOverlay.depth + 5;
        const coinSize = Math.max(140, Math.round(this.scene.scale.width * 0.1));
        const titleFontSize = Math.max(
            GAME_INPUT_OVERLAY_HEADER_LAYOUT.titleFontSizeMin,
            Math.round(this.scene.scale.width * GAME_INPUT_OVERLAY_HEADER_LAYOUT.titleFontSizeRatio)
        );
        const fittedTitleFontSize = fitBitmapTextToSingleLine({
            scene: this.scene,
            font: 'minogram',
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
        const hintFontSize = fitBitmapTextToSingleLine({
            scene: this.scene,
            font: 'minogram',
            text: hintMessage,
            preferredSize: 24,
            minSize: 10,
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

        this.titleText = this.scene.add.bitmapText(
            this.scene.scale.width / 2,
            this.scene.scale.height / 2 - Math.round(coinSize / 2) - titleGap,
            'minogram',
            topMessage,
            fittedTitleFontSize
        )
            .setOrigin(0.5)
            .setDepth(overlayDepth);

        this.hintText = this.scene.add.bitmapText(
            this.scene.scale.width / 2,
            this.scene.scale.height / 2 + Math.round(coinSize * 0.8),
            'minogram',
            hintMessage,
            hintFontSize
        )
            .setOrigin(0.5)
            .setDepth(overlayDepth);

        this.image.on('pointerdown', () => {
            this.startFlipAnimation();
        });
    }

    private startFlipAnimation (): void
    {
        if (!this.image || this.isFlipping) {
            return;
        }

        this.isFlipping = true;
        const finalResult = this.getRandomCoinResult();
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
                            const callback = this.onComplete;
                            this.stopActiveOverlay();
                            if (callback) {
                                callback(finalResult);
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
