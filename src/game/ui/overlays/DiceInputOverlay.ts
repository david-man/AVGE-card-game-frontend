import { Scene } from 'phaser';
import { GAME_INPUT_OVERLAY_HEADER_LAYOUT } from '../../config';
import { fitBitmapTextToSingleLine } from './bitmapTextFit';

const DICE_FACE_TEXTURE_BY_VALUE: Record<number, string> = {
    1: 'dice-six-faces-one',
    2: 'dice-six-faces-two',
    3: 'dice-six-faces-three',
    4: 'dice-six-faces-four',
    5: 'dice-six-faces-five',
    6: 'dice-six-faces-six'
};

type DiceRollCompleteCallback = (value: number) => void;

export class DiceInputOverlay
{
    static preloadAssets (scene: Scene): void
    {
        scene.load.image('dice-six-faces-one', 'dice/dice-six-faces-one.png');
        scene.load.image('dice-six-faces-two', 'dice/dice-six-faces-two.png');
        scene.load.image('dice-six-faces-three', 'dice/dice-six-faces-three.png');
        scene.load.image('dice-six-faces-four', 'dice/dice-six-faces-four.png');
        scene.load.image('dice-six-faces-five', 'dice/dice-six-faces-five.png');
        scene.load.image('dice-six-faces-six', 'dice/dice-six-faces-six.png');
    }

    private scene: Scene;
    private inputLockOverlay: Phaser.GameObjects.Rectangle;
    private image: Phaser.GameObjects.Image | null;
    private titleText: Phaser.GameObjects.BitmapText | null;
    private hintText: Phaser.GameObjects.BitmapText | null;
    private tickerEvent: Phaser.Time.TimerEvent | null;
    private isRolling: boolean;
    private awaitingConfirm: boolean;
    private settledValue: number | null;
    private onComplete: DiceRollCompleteCallback | null;
    private forcedFinalValue: number | null;
    private hintPreferredFontSize: number;

    constructor (scene: Scene, inputLockOverlay: Phaser.GameObjects.Rectangle)
    {
        this.scene = scene;
        this.inputLockOverlay = inputLockOverlay;
        this.image = null;
        this.titleText = null;
        this.hintText = null;
        this.tickerEvent = null;
        this.isRolling = false;
        this.awaitingConfirm = false;
        this.settledValue = null;
        this.onComplete = null;
        this.forcedFinalValue = null;
        this.hintPreferredFontSize = GAME_INPUT_OVERLAY_HEADER_LAYOUT.hintFontSizeMin;
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

        this.isRolling = false;
        this.awaitingConfirm = false;
        this.settledValue = null;
        this.onComplete = null;
        this.forcedFinalValue = null;
        this.hintPreferredFontSize = GAME_INPUT_OVERLAY_HEADER_LAYOUT.hintFontSizeMin;
    }

    start (onComplete: DiceRollCompleteCallback, topMessage: string, forcedValue?: number): void
    {
        this.stopActiveOverlay();
        this.onComplete = onComplete;
        this.forcedFinalValue = forcedValue ?? null;

        const startValue = this.getRandomDieFaceValue();
        const overlayDepth = this.inputLockOverlay.depth + 5;
        const diceSize = Math.max(140, Math.round(this.scene.scale.width * 0.1));
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
        const hintMessage = 'CLICK DIE TO ROLL D6';
        this.hintPreferredFontSize = Math.max(
            GAME_INPUT_OVERLAY_HEADER_LAYOUT.hintFontSizeMin,
            Math.round(this.scene.scale.width * GAME_INPUT_OVERLAY_HEADER_LAYOUT.hintFontSizeRatio)
        );
        const fittedHintFontSize = fitBitmapTextToSingleLine({
            scene: this.scene,
            font: 'minogram',
            text: hintMessage,
            preferredSize: this.hintPreferredFontSize,
            minSize: GAME_INPUT_OVERLAY_HEADER_LAYOUT.hintFitMinSize,
            maxWidth: Math.round(this.scene.scale.width * 0.92)
        });

        this.image = this.scene.add.image(
            this.scene.scale.width / 2,
            this.scene.scale.height / 2,
            DICE_FACE_TEXTURE_BY_VALUE[startValue]
        )
            .setDisplaySize(diceSize, diceSize)
            .setDepth(overlayDepth)
            .setInteractive({ useHandCursor: true });

        this.titleText = this.scene.add.bitmapText(
            this.scene.scale.width / 2,
            this.scene.scale.height / 2 - Math.round(diceSize / 2) - titleGap,
            'minogram',
            topMessage,
            fittedTitleFontSize
        )
            .setOrigin(0.5)
            .setDepth(overlayDepth);

        this.hintText = this.scene.add.bitmapText(
            this.scene.scale.width / 2,
            this.scene.scale.height / 2 + Math.round(diceSize * 0.8),
            'minogram',
            hintMessage,
            fittedHintFontSize
        )
            .setOrigin(0.5)
            .setDepth(overlayDepth);

        this.image.on('pointerdown', () => {
            if (this.awaitingConfirm) {
                const callback = this.onComplete;
                const finalValue = this.settledValue;
                this.stopActiveOverlay();
                if (callback && finalValue !== null) {
                    callback(finalValue);
                }
                return;
            }

            this.startRollAnimation();
        });
    }

    private startRollAnimation (): void
    {
        if (!this.image || this.isRolling) {
            return;
        }

        this.isRolling = true;
        const finalValue = this.forcedFinalValue ?? this.getRandomDieFaceValue();
        const totalTicks = 14;
        let tickCount = 0;

        this.tickerEvent = this.scene.time.addEvent({
            delay: 65,
            repeat: totalTicks - 1,
            callback: () => {
                if (!this.image) {
                    return;
                }

                const nextValue = tickCount < totalTicks - 1 ? this.getRandomDieFaceValue() : finalValue;
                this.image.setTexture(DICE_FACE_TEXTURE_BY_VALUE[nextValue]);
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
                            this.isRolling = false;
                            this.awaitingConfirm = true;
                            this.settledValue = finalValue;
                            if (this.hintText) {
                                const confirmHint = 'CLICK AGAIN TO CONFIRM';
                                this.hintText.setText(confirmHint);
                                this.hintText.setFontSize(fitBitmapTextToSingleLine({
                                    scene: this.scene,
                                    font: 'minogram',
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

    private getRandomDieFaceValue (): number
    {
        return Phaser.Math.Between(1, 6);
    }
}
