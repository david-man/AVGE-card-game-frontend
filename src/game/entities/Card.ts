import { Scene } from 'phaser';
import {
    CARD_ANIMATION,
    CARD_BORDER_WIDTH,
    CARD_DEFAULTS,
    CARD_SELECTED_BORDER_WIDTH,
    CARD_SELECTION_SCALE_MULTIPLIERS,
    CARD_TEXT_LAYOUT,
    CARD_VISUALS,
    UI_SCALE
} from '../config';

export type CardType = 'character' | 'tool' | 'item' | 'stadium';
export type PlayerId = 'p1' | 'p2';

export type CardOptions = {
    id: string;
    cardType: CardType;
    ownerId: PlayerId;
    x: number;
    y: number;
    width: number;
    height: number;
    color: number;
    zoneId: string;
    card_class?: string;
    has_atk_1?: boolean;
    has_atk_2?: boolean;
    has_active?: boolean;
};

export class Card
{
    private readonly scene: Scene;
    readonly id: string;
    readonly cardType: CardType;
    readonly ownerId: PlayerId;
    readonly cardClass: string;
    readonly hasAtk1: boolean;
    readonly hasAtk2: boolean;
    readonly hasActive: boolean;
    readonly body: Phaser.GameObjects.Rectangle;
    readonly baseColor: number;

    private readonly baseIdFontSize: number;
    private readonly baseTypeFontSize: number;
    private readonly baseHpFontSize: number;

    private idLabel: Phaser.GameObjects.BitmapText;
    private typeLabel: Phaser.GameObjects.BitmapText;
    private hpLabel: Phaser.GameObjects.BitmapText;
    private turnedOver: boolean;
    private isFlipping: boolean;
    private isSelected: boolean;
    private hp: number;
    private maxHp: number;
    private borderColor: number;
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
        this.cardClass = options.card_class ?? 'default';
        this.hasAtk1 = options.has_atk_1 ?? false;
        this.hasAtk2 = options.has_atk_2 ?? false;
        this.hasActive = options.has_active ?? false;
        this.baseColor = options.color;
        this.baseIdFontSize = Math.max(CARD_TEXT_LAYOUT.minIdFontSize, Math.round(CARD_TEXT_LAYOUT.baseIdFontSize * UI_SCALE));
        this.baseTypeFontSize = Math.max(CARD_TEXT_LAYOUT.minTypeFontSize + 1, Math.round(CARD_TEXT_LAYOUT.baseTypeFontSize * UI_SCALE));
        this.baseHpFontSize = Math.max(CARD_TEXT_LAYOUT.minTypeFontSize, Math.round(CARD_TEXT_LAYOUT.baseHpFontSize * UI_SCALE));
        this.isFlipping = false;
        this.isSelected = false;
        this.hp = options.cardType === 'character' ? CARD_DEFAULTS.characterHp : 0;
        this.maxHp = options.cardType === 'character' ? CARD_DEFAULTS.characterMaxHp : 0;
        this.borderColor = CARD_DEFAULTS.borderColor;
        this.baseScale = CARD_DEFAULTS.baseScale;
        this.currentStrokeWidth = CARD_BORDER_WIDTH;

        this.body = scene.add.rectangle(options.x, options.y, options.width, options.height, options.color, 1)
            .setStrokeStyle(CARD_BORDER_WIDTH, this.borderColor, 1)
            .setInteractive({ draggable: true, useHandCursor: true });

        this.idLabel = scene.add.bitmapText(options.x, options.y - CARD_TEXT_LAYOUT.idYOffset, 'minogram', this.id, this.baseIdFontSize)
            .setOrigin(0.5)
            .setTint(0xffffff);

        this.typeLabel = scene.add.bitmapText(options.x, options.y + CARD_TEXT_LAYOUT.typeYOffset, 'minogram', this.cardType.toUpperCase(), this.baseTypeFontSize)
            .setOrigin(0.5)
            .setTint(0xcde7ff);

        this.hpLabel = scene.add.bitmapText(options.x, options.y, 'minogram', '', this.baseHpFontSize)
            .setOrigin(0, 0)
            .setTint(0xffffff);

        this.turnedOver = false;

        this.body.setData('cardId', this.id);
        this.body.setData('zoneId', options.zoneId);
        this.body.setData('attachedToCardId', null);
        this.body.setData('cardClass', this.cardClass);

        this.applyFaceState();
        this.refreshHpLabel();
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

    setHpValues (hp: number, maxHp: number): void
    {
        if (this.cardType !== 'character') {
            return;
        }

        this.hp = hp;
        this.maxHp = maxHp;
        this.refreshHpLabel();
        this.redrawMarks();
    }

    setBorderColor (color: number): void
    {
        this.borderColor = color;
        this.body.setStrokeStyle(Math.round(this.currentStrokeWidth), this.borderColor, 1);
    }

    getBorderColor (): number
    {
        return this.borderColor;
    }

    getHp (): number
    {
        return this.hp;
    }

    getMaxHp (): number
    {
        return this.maxHp;
    }

    setScale (value: number): void
    {
        this.baseScale = value;
        const effectiveScaleX = this.baseScale * (this.isSelected ? CARD_SELECTION_SCALE_MULTIPLIERS.x : 1);
        const effectiveScaleY = this.baseScale * (this.isSelected ? CARD_SELECTION_SCALE_MULTIPLIERS.y : 1);
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

    getCardClass (): string
    {
        return this.cardClass;
    }

    hasAttackOne (): boolean
    {
        return this.hasAtk1;
    }

    hasAttackTwo (): boolean
    {
        return this.hasAtk2;
    }

    hasActiveAbility (): boolean
    {
        return this.hasActive;
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
            targets: [this.body, this.idLabel, this.typeLabel, this.hpLabel],
            scaleX: 0,
            duration: CARD_ANIMATION.flipDurationMs,
            ease: 'Sine.easeInOut',
            onComplete: () => {
                this.turnedOver = !this.turnedOver;
                this.applyFaceState();

                this.scene.tweens.add({
                    targets: [this.body, this.idLabel, this.typeLabel, this.hpLabel],
                    scaleX: originalScaleX,
                    duration: CARD_ANIMATION.flipDurationMs,
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

        const targetScaleX = this.baseScale * (selected ? CARD_SELECTION_SCALE_MULTIPLIERS.x : 1);
        const targetScaleY = this.baseScale * (selected ? CARD_SELECTION_SCALE_MULTIPLIERS.y : 1);
        const strokeState = { width: this.currentStrokeWidth };
        const targetStroke = selected ? CARD_SELECTED_BORDER_WIDTH : CARD_BORDER_WIDTH;

        this.selectionTween = this.scene.tweens.add({
            targets: this.body,
            scaleX: targetScaleX,
            scaleY: targetScaleY,
            duration: CARD_ANIMATION.selectionDurationMs,
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
            duration: CARD_ANIMATION.selectionDurationMs,
            ease: 'Sine.easeInOut',
            onUpdate: () => {
                this.currentStrokeWidth = strokeState.width;
                this.body.setStrokeStyle(Math.round(this.currentStrokeWidth), this.borderColor, 1);
            },
            onComplete: () => {
                this.currentStrokeWidth = targetStroke;
                this.body.setStrokeStyle(targetStroke, this.borderColor, 1);
            }
        });
    }

    getSelected (): boolean
    {
        return this.isSelected;
    }

    redrawMarks (): void
    {
        const yOffset = CARD_TEXT_LAYOUT.idYOffset * this.body.scaleY;
        const yTypeOffset = CARD_TEXT_LAYOUT.typeYOffset * this.body.scaleY;

        const idFontSize = Math.max(Math.round(CARD_TEXT_LAYOUT.minIdFontSize * UI_SCALE), Math.round(this.baseIdFontSize * this.body.scaleY));
        const typeFontSize = Math.max(Math.round(CARD_TEXT_LAYOUT.minTypeFontSize * UI_SCALE), Math.round(this.baseTypeFontSize * this.body.scaleY));
        const hpFontSize = Math.max(Math.round(CARD_TEXT_LAYOUT.minHpFontSize * UI_SCALE), Math.round(this.baseHpFontSize * this.body.scaleY));
        const bounds = this.body.getBounds();
        const hpPadding = Math.max(CARD_TEXT_LAYOUT.hpPadding, Math.round(CARD_TEXT_LAYOUT.hpPadding * this.body.scaleY));

        this.idLabel.setPosition(Math.round(this.body.x), Math.round(this.body.y - yOffset));
        this.typeLabel.setPosition(Math.round(this.body.x), Math.round(this.body.y + yTypeOffset));

        this.idLabel.setScale(1);
        this.idLabel.setFontSize(idFontSize);

        this.typeLabel.setScale(1);
        this.typeLabel.setFontSize(typeFontSize);

        this.hpLabel.setScale(1);
        this.hpLabel.setFontSize(hpFontSize);
        this.hpLabel.setPosition(Math.round(bounds.left + hpPadding), Math.round(bounds.top + hpPadding));

        this.idLabel.setDepth(this.body.depth + 0.01);
        this.typeLabel.setDepth(this.body.depth + 0.01);
        this.hpLabel.setDepth(this.body.depth + 0.01);
    }

    private applyFaceState (): void
    {
        if (this.turnedOver) {
            this.body.setFillStyle(CARD_VISUALS.faceDownFillColor, 1);
            this.idLabel.setVisible(false);
            this.typeLabel.setVisible(false);
            this.refreshHpLabel();
            this.redrawMarks();
            return;
        }

        this.body.setFillStyle(this.baseColor, 1);
        this.idLabel.setVisible(true);
        this.typeLabel.setVisible(true);
        this.refreshHpLabel();
        this.redrawMarks();
    }

    private refreshHpLabel (): void
    {
        if (this.cardType !== 'character') {
            this.hpLabel.setVisible(false);
            return;
        }

        this.hpLabel.setVisible(!this.turnedOver);
        this.hpLabel.setText(`[${this.hp}/${this.maxHp}]`);
    }

    private isFaceDownZone (zoneId: string): boolean
    {
        return zoneId.endsWith('-discard') || zoneId.endsWith('-deck');
    }
}
