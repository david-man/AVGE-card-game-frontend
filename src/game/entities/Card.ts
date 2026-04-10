import { Scene } from 'phaser';
import { UI_SCALE } from '../config';

export type CardType = 'character' | 'tool' | 'item' | 'stadium';
export type PlayerId = 'p1' | 'p2';

type CardOptions = {
    id: string;
    cardType: CardType;
    ownerId: PlayerId;
    x: number;
    y: number;
    width: number;
    height: number;
    color: number;
    zoneId: string;
};

export class Card
{
    private static readonly BASE_STROKE_WIDTH = 4;
    private static readonly SELECTED_STROKE_WIDTH = 8;
    private static readonly SELECTED_SCALE_X_MULTIPLIER = 1.0;
    private static readonly SELECTED_SCALE_Y_MULTIPLIER = 1.08;

    private readonly scene: Scene;
    readonly id: string;
    readonly cardType: CardType;
    readonly ownerId: PlayerId;
    readonly body: Phaser.GameObjects.Rectangle;
    readonly baseColor: number;

    private readonly baseIdFontSize: number;
    private readonly baseTypeFontSize: number;

    private idLabel: Phaser.GameObjects.BitmapText;
    private typeLabel: Phaser.GameObjects.BitmapText;
    private turnedOver: boolean;
    private isFlipping: boolean;
    private isSelected: boolean;
    private baseScale: number;
    private currentStrokeWidth: number;
    private selectionTween?: Phaser.Tweens.Tween;
    private strokeTween?: Phaser.Tweens.Tween;

    constructor (scene: Scene, options: CardOptions)
    {
        this.scene = scene;
        this.id = options.id;
        this.cardType = options.cardType;
        this.ownerId = options.ownerId;
        this.baseColor = options.color;
        this.baseIdFontSize = Math.max(10, Math.round(15 * UI_SCALE));
        this.baseTypeFontSize = Math.max(9, Math.round(11 * UI_SCALE));
        this.isFlipping = false;
        this.isSelected = false;
        this.baseScale = 1;
        this.currentStrokeWidth = Card.BASE_STROKE_WIDTH;

        this.body = scene.add.rectangle(options.x, options.y, options.width, options.height, options.color, 1)
            .setStrokeStyle(Card.BASE_STROKE_WIDTH, 0xffffff, 1)
            .setInteractive({ draggable: true, useHandCursor: true });

        this.idLabel = scene.add.bitmapText(options.x, options.y - 10, 'minogram', this.id, this.baseIdFontSize)
            .setOrigin(0.5)
            .setTint(0xffffff);

        this.typeLabel = scene.add.bitmapText(options.x, options.y + 10, 'minogram', this.cardType.toUpperCase(), this.baseTypeFontSize)
            .setOrigin(0.5)
            .setTint(0xcde7ff);

        this.turnedOver = false;

        this.body.setData('cardId', this.id);
        this.body.setData('zoneId', options.zoneId);
        this.body.setData('attachedToCardId', null);

        this.applyFaceState();
    }

    getZoneId (): string
    {
        return this.body.getData('zoneId') as string;
    }

    setZoneId (zoneId: string): void
    {
        const previousZoneId = this.getZoneId();
        const wasFaceDownZone = this.isFaceDownZone(previousZoneId);
        const isFaceDownZone = this.isFaceDownZone(zoneId);

        this.body.setData('zoneId', zoneId);

        if (wasFaceDownZone !== isFaceDownZone) {
            this.setTurnedOver(isFaceDownZone);
        }
    }

    getAttachedToCardId (): string | null
    {
        return this.body.getData('attachedToCardId') as string | null;
    }

    setAttachedToCardId (cardId: string | null): void
    {
        this.body.setData('attachedToCardId', cardId);
    }

    setScale (value: number): void
    {
        this.baseScale = value;
        const effectiveScaleX = this.baseScale * (this.isSelected ? Card.SELECTED_SCALE_X_MULTIPLIER : 1);
        const effectiveScaleY = this.baseScale * (this.isSelected ? Card.SELECTED_SCALE_Y_MULTIPLIER : 1);
        this.body.setScale(effectiveScaleX, effectiveScaleY);
        this.redrawMarks();
    }

    setPosition (x: number, y: number): void
    {
        this.body.setPosition(x, y);
    }

    setDepth (value: number): void
    {
        this.body.setDepth(value);
    }

    get x (): number
    {
        return this.body.x;
    }

    get y (): number
    {
        return this.body.y;
    }

    get depth (): number
    {
        return this.body.depth;
    }

    getBounds (): Phaser.Geom.Rectangle
    {
        return this.body.getBounds();
    }

    getCardType (): CardType
    {
        return this.cardType;
    }

    getOwnerId (): PlayerId
    {
        return this.ownerId;
    }

    isTurnedOver (): boolean
    {
        return this.turnedOver;
    }

    setTurnedOver (value: boolean): void
    {
        if (this.turnedOver === value) {
            return;
        }

        this.turnedOver = value;
        this.applyFaceState();
    }

    flip (onComplete?: () => void): void
    {
        if (this.isFlipping) {
            if (onComplete) {
                onComplete();
            }
            return;
        }

        this.isFlipping = true;
        const originalScaleX = this.body.scaleX;

        this.scene.tweens.add({
            targets: [this.body, this.idLabel, this.typeLabel],
            scaleX: 0,
            duration: 110,
            ease: 'Sine.easeInOut',
            onComplete: () => {
                this.turnedOver = !this.turnedOver;
                this.applyFaceState();

                this.scene.tweens.add({
                    targets: [this.body, this.idLabel, this.typeLabel],
                    scaleX: originalScaleX,
                    duration: 110,
                    ease: 'Sine.easeInOut',
                    onComplete: () => {
                        this.isFlipping = false;
                        this.redrawMarks();
                        if (onComplete) {
                            onComplete();
                        }
                    }
                });
            }
        });
    }

    isCurrentlyFlipping (): boolean
    {
        return this.isFlipping;
    }

    setSelected (selected: boolean): void
    {
        if (this.isSelected === selected) {
            return;
        }

        this.isSelected = selected;

        if (this.selectionTween) {
            this.selectionTween.stop();
        }

        if (this.strokeTween) {
            this.strokeTween.stop();
        }

        const targetScaleX = this.baseScale * (selected ? Card.SELECTED_SCALE_X_MULTIPLIER : 1);
        const targetScaleY = this.baseScale * (selected ? Card.SELECTED_SCALE_Y_MULTIPLIER : 1);
        const strokeState = { width: this.currentStrokeWidth };
        const targetStroke = selected ? Card.SELECTED_STROKE_WIDTH : Card.BASE_STROKE_WIDTH;

        this.selectionTween = this.scene.tweens.add({
            targets: this.body,
            scaleX: targetScaleX,
            scaleY: targetScaleY,
            duration: 140,
            ease: 'Sine.easeInOut',
            onUpdate: () => {
                this.redrawMarks();
            },
            onComplete: () => {
                this.redrawMarks();
            }
        });

        this.strokeTween = this.scene.tweens.add({
            targets: strokeState,
            width: targetStroke,
            duration: 140,
            ease: 'Sine.easeInOut',
            onUpdate: () => {
                this.currentStrokeWidth = strokeState.width;
                this.body.setStrokeStyle(Math.round(this.currentStrokeWidth), 0xffffff, 1);
            },
            onComplete: () => {
                this.currentStrokeWidth = targetStroke;
                this.body.setStrokeStyle(targetStroke, 0xffffff, 1);
            }
        });
    }

    getSelected (): boolean
    {
        return this.isSelected;
    }

    redrawMarks (): void
    {
        const yOffset = 10 * this.body.scaleY;
        const yTypeOffset = 10 * this.body.scaleY;

        const idFontSize = Math.max(Math.round(10 * UI_SCALE), Math.round(this.baseIdFontSize * this.body.scaleY));
        const typeFontSize = Math.max(Math.round(8 * UI_SCALE), Math.round(this.baseTypeFontSize * this.body.scaleY));

        this.idLabel.setPosition(Math.round(this.body.x), Math.round(this.body.y - yOffset));
        this.typeLabel.setPosition(Math.round(this.body.x), Math.round(this.body.y + yTypeOffset));

        this.idLabel.setScale(1);
        this.idLabel.setFontSize(idFontSize);

        this.typeLabel.setScale(1);
        this.typeLabel.setFontSize(typeFontSize);

        this.idLabel.setDepth(this.body.depth + 0.01);
        this.typeLabel.setDepth(this.body.depth + 0.01);
    }

    private applyFaceState (): void
    {
        if (this.turnedOver) {
            this.body.setFillStyle(0x1f2937, 1);
            this.redrawMarks();
            return;
        }

        this.body.setFillStyle(this.baseColor, 1);
        this.redrawMarks();
    }

    private isFaceDownZone (zoneId: string): boolean
    {
        return zoneId.endsWith('-discard') || zoneId.endsWith('-deck');
    }
}
