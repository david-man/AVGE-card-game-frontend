import { Scene } from 'phaser';
import {
    AVGE_CARD_TYPE_BORDER_COLORS,
    AVGECardType,
    CARD_ANIMATION,
    CARD_BORDER_WIDTH,
    CARD_DEFAULTS,
    CARD_SELECTED_BORDER_WIDTH,
    CARD_SELECTION_SCALE_MULTIPLIERS,
    CARD_TEXT_LAYOUT,
    CARD_VISUALS,
    UI_SCALE
} from '../config';
import { fitBitmapTextToSingleLine, fitBitmapTextToTwoLines } from '../ui/overlays/bitmapTextFit';

export type CardType = 'character' | 'tool' | 'item' | 'stadium' | 'supporter';
export type PlayerId = 'p1' | 'p2';
export type StandardCardType = 'TOOL' | 'ITEM' | 'STADIUM' | 'SUPPORTER' | 'CHARACTER';
export type CardStatusEffectMap = Record<string, number>;

export type CardOptions = {
    id: string;
    cardType: CardType;
    AVGECardType: AVGECardType;
    AVGECardClass: string;
    statusEffect: CardStatusEffectMap;
    ownerId: PlayerId;
    x: number;
    y: number;
    width: number;
    height: number;
    color: number;
    zoneId: string;
    has_atk_1?: boolean;
    has_atk_2?: boolean;
    has_active?: boolean;
};

export class Card
{
    private readonly scene: Scene;
    readonly id: string;
    readonly uniqueId: string;
    readonly cardType: CardType;
    readonly avgeCardType: AVGECardType;
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
        private statusLabel: Phaser.GameObjects.BitmapText;
    private turnedOver: boolean;
    private externallyVisible: boolean;
    private isFlipping: boolean;
    private isSelected: boolean;
    private hp: number;
    private maxHp: number;
    private statusEffect: CardStatusEffectMap;
    private borderColor: number;
    private baseScale: number;
    private currentStrokeWidth: number;
    private selectionTween?: Phaser.Tweens.Tween;
    private strokeTween?: Phaser.Tweens.Tween;

    constructor (scene: Scene, options: CardOptions)
    {
        this.scene = scene;
        this.id = options.id;
        this.uniqueId = options.id;
        this.cardType = options.cardType;
        this.avgeCardType = options.AVGECardType;
        this.ownerId = options.ownerId;
        this.cardClass = options.AVGECardClass;
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
        this.statusEffect = { ...options.statusEffect };
        this.borderColor = AVGE_CARD_TYPE_BORDER_COLORS[this.avgeCardType] ?? CARD_DEFAULTS.borderColor;
        this.baseScale = CARD_DEFAULTS.baseScale;
        this.currentStrokeWidth = CARD_BORDER_WIDTH;

        this.body = scene.add.rectangle(options.x, options.y, options.width, options.height, options.color, 1)
            .setStrokeStyle(CARD_BORDER_WIDTH, this.getCurrentBorderColor(), 1)
            .setInteractive({ draggable: true, useHandCursor: true });

        this.idLabel = scene.add.bitmapText(options.x, options.y - CARD_TEXT_LAYOUT.idYOffset, 'minogram', this.cardClass, this.baseIdFontSize)
            .setOrigin(0.5)
            .setCenterAlign()
            .setTint(0xffffff);

        this.typeLabel = scene.add.bitmapText(options.x, options.y + CARD_TEXT_LAYOUT.typeYOffset, 'minogram', this.cardType.toUpperCase(), this.baseTypeFontSize)
            .setOrigin(0.5, 1)
            .setTint(0xcde7ff);

        this.hpLabel = scene.add.bitmapText(options.x, options.y, 'minogram', '', this.baseHpFontSize)
            .setOrigin(0, 0)
            .setTint(0xffffff);

        this.statusLabel = scene.add.bitmapText(options.x, options.y, 'minogram', '', this.baseHpFontSize)
            .setOrigin(0, 0)
            .setTint(0xe2e8f0);

        this.turnedOver = false;
        this.externallyVisible = true;

        this.body.setData('cardId', this.id);
        this.body.setData('zoneId', options.zoneId);
        this.body.setData('attachedToCardId', null);
        this.body.setData('cardClass', this.cardClass);
        this.body.setData('AVGECardType', this.avgeCardType);

        this.applyFaceState();
        this.refreshHpLabel();
    }

    private toStandardCardType (cardType: CardType): StandardCardType
    {
        if (cardType === 'tool') {
            return 'TOOL';
        }
        if (cardType === 'item') {
            return 'ITEM';
        }
        if (cardType === 'stadium') {
            return 'STADIUM';
        }
        if (cardType === 'supporter') {
            return 'SUPPORTER';
        }
        return 'CHARACTER';
    }

    toStandardModel (): {
        UniqueID: string;
        CardType: StandardCardType;
        Flipped: boolean;
        PlayerOwnerID?: PlayerId;
        HP?: number;
        MAXHP?: number;
        HASATK1?: boolean;
        HASACTIVE?: boolean;
        HASATK2?: boolean;
        CardAttachedTo?: string | null;
    }
    {
        const base = {
            UniqueID: this.uniqueId,
            CardType: this.toStandardCardType(this.cardType),
            Flipped: this.turnedOver,
        };

        if (this.cardType === 'character') {
            return {
                ...base,
                PlayerOwnerID: this.ownerId,
                HP: this.hp,
                MAXHP: this.maxHp,
                HASATK1: this.hasAtk1,
                HASACTIVE: this.hasActive,
                HASATK2: this.hasAtk2,
            };
        }

        if (this.cardType === 'tool') {
            return {
                ...base,
                CardAttachedTo: this.getAttachedToCardId(),
            };
        }

        return base;
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
        this.applyBorderStyle();
    }

    getBorderColor (): number
    {
        return this.getCurrentBorderColor();
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

    getAVGECardType (): AVGECardType
    {
        return this.avgeCardType;
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

    setVisibility (visible: boolean): void
    {
        this.externallyVisible = visible;
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
            targets: [this.body, this.idLabel, this.typeLabel, this.hpLabel, this.statusLabel],
            scaleX: 0,
            duration: CARD_ANIMATION.flipDurationMs,
            ease: 'Sine.easeInOut',
            onComplete: () => {
                this.turnedOver = !this.turnedOver;
                this.applyFaceState();

                this.scene.tweens.add({
                    targets: [this.body, this.idLabel, this.typeLabel, this.hpLabel, this.statusLabel],
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

    getStatusEffects (): CardStatusEffectMap
    {
        return { ...this.statusEffect };
    }

    setStatusEffects (next: CardStatusEffectMap): void
    {
        this.statusEffect = { ...next };
        this.refreshStatusLabel();
        this.redrawMarks();
    }

    setStatusCount (statusKey: string, count: number): void
    {
        const normalizedCount = Math.max(0, Math.floor(count));
        this.statusEffect = {
            ...this.statusEffect,
            [statusKey]: normalizedCount
        };
        this.refreshStatusLabel();
        this.redrawMarks();
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
                this.applyBorderStyle();
            },
            onComplete: () => {
                this.currentStrokeWidth = targetStroke;
                this.applyBorderStyle();
            }
        });
    }

    getSelected (): boolean
    {
        return this.isSelected;
    }

    redrawMarks (): void
    {
        const idFontSize = Math.max(Math.round(CARD_TEXT_LAYOUT.minIdFontSize * UI_SCALE), Math.round(this.baseIdFontSize * this.body.scaleY));
        const typeFontSize = Math.max(Math.round(CARD_TEXT_LAYOUT.minTypeFontSize * UI_SCALE), Math.round(this.baseTypeFontSize * this.body.scaleY));
        const hpFontSize = Math.max(Math.round(CARD_TEXT_LAYOUT.minHpFontSize * UI_SCALE), Math.round(this.baseHpFontSize * this.body.scaleY));
        const bounds = this.body.getBounds();
        const hpPadding = Math.max(CARD_TEXT_LAYOUT.hpPadding, Math.round(CARD_TEXT_LAYOUT.hpPadding * this.body.scaleY));

        const classFit = fitBitmapTextToTwoLines({
            scene: this.scene,
            font: 'minogram',
            text: this.cardClass,
            preferredSize: idFontSize,
            // Long card names (for example "Steinert Practice Room") need a
            // lower font-size floor and slightly narrower width budget to stay
            // inside the card border at all scales.
            minSize: Math.max(6, Math.round(idFontSize * 0.56)),
            maxWidth: Math.max(10, Math.round(bounds.width * 0.82))
        });

        const classLineCount = classFit.text.includes('\n') ? 2 : 1;
        const yOffset = (CARD_TEXT_LAYOUT.idYOffset + (classLineCount > 1 ? CARD_TEXT_LAYOUT.classTwoLineYOffsetBoost : 0)) * this.body.scaleY;
        const bottomTypePadding = CARD_TEXT_LAYOUT.typeYOffset * this.body.scaleY;

        this.idLabel.setPosition(Math.round(this.body.x), Math.round(this.body.y - yOffset));
        this.typeLabel.setPosition(Math.round(this.body.x), Math.round(bounds.bottom - bottomTypePadding));

        this.idLabel.setScale(1);
        this.idLabel.setText(classFit.text);
        this.idLabel.setFontSize(classFit.fontSize);

        this.typeLabel.setScale(1);
        this.typeLabel.setFontSize(typeFontSize);
        this.typeLabel.setFontSize(fitBitmapTextToSingleLine({
            scene: this.scene,
            font: 'minogram',
            text: this.typeLabel.text,
            preferredSize: typeFontSize,
            minSize: Math.max(Math.round(CARD_TEXT_LAYOUT.minTypeFontSize * UI_SCALE), Math.round(typeFontSize * 0.72)),
            maxWidth: Math.max(10, Math.round(bounds.width * 0.9))
        }));

        this.hpLabel.setScale(1);
        this.hpLabel.setFontSize(hpFontSize);
        this.hpLabel.setFontSize(fitBitmapTextToSingleLine({
            scene: this.scene,
            font: 'minogram',
            text: this.hpLabel.text,
            preferredSize: hpFontSize,
            minSize: Math.max(Math.round(CARD_TEXT_LAYOUT.minHpFontSize * UI_SCALE), Math.round(hpFontSize * 0.75)),
            maxWidth: Math.max(10, Math.round(bounds.width * 0.56))
        }));
        this.hpLabel.setPosition(Math.round(bounds.left + hpPadding), Math.round(bounds.top + hpPadding));

        this.statusLabel.setScale(1);
        this.statusLabel.setFontSize(Math.max(Math.round(CARD_TEXT_LAYOUT.minTypeFontSize * UI_SCALE), Math.round(hpFontSize * 0.92)));
        this.statusLabel.setFontSize(fitBitmapTextToSingleLine({
            scene: this.scene,
            font: 'minogram',
            text: this.statusLabel.text,
            preferredSize: this.statusLabel.fontSize,
            minSize: Math.max(Math.round(CARD_TEXT_LAYOUT.minTypeFontSize * UI_SCALE), Math.round(this.statusLabel.fontSize * 0.75)),
            maxWidth: Math.max(10, Math.round(bounds.width * 0.8))
        }));
        this.statusLabel.setPosition(
            Math.round(bounds.left + hpPadding),
            Math.round(this.hpLabel.y + this.hpLabel.height + Math.max(1, Math.round(hpPadding * 0.7)))
        );

        this.idLabel.setDepth(this.body.depth + 0.01);
        this.typeLabel.setDepth(this.body.depth + 0.01);
        this.hpLabel.setDepth(this.body.depth + 0.01);
        this.statusLabel.setDepth(this.body.depth + 0.01);
    }

    private applyFaceState (): void
    {
        this.applyBorderStyle();
        this.body.setVisible(this.externallyVisible);

        if (this.turnedOver) {
            this.body.setFillStyle(CARD_VISUALS.faceDownFillColor, 1);
            this.idLabel.setVisible(false);
            this.typeLabel.setVisible(false);
            this.refreshHpLabel();
            this.refreshStatusLabel();
            this.redrawMarks();
            return;
        }

        this.body.setFillStyle(this.baseColor, 1);
    this.idLabel.setVisible(this.externallyVisible);
    this.typeLabel.setVisible(this.externallyVisible);
        this.refreshHpLabel();
        this.refreshStatusLabel();
        this.redrawMarks();
    }

    private refreshHpLabel (): void
    {
        if (this.cardType !== 'character') {
            this.hpLabel.setVisible(false);
            return;
        }

        this.hpLabel.setVisible(this.externallyVisible && !this.turnedOver);
        this.hpLabel.setText(`[${this.hp}/${this.maxHp}]`);
    }

    private refreshStatusLabel (): void
    {
        if (this.cardType !== 'character' || this.turnedOver || !this.externallyVisible) {
            this.statusLabel.setVisible(false);
            return;
        }

        const hasArranger = (this.statusEffect.Arranger ?? 0) > 0;
        const hasGoon = (this.statusEffect.Goon ?? 0) > 0;
        const hasMaid = (this.statusEffect.Maid ?? 0) > 0;
        const parts: string[] = [];

        if (hasArranger) {
            parts.push('A');
        }
        if (hasGoon) {
            parts.push('G');
        }
        if (hasMaid) {
            parts.push('M');
        }

        if (parts.length === 0) {
            this.statusLabel.setVisible(false);
            return;
        }

        this.statusLabel.setText(`[${parts.join(',')}]`).setVisible(true);
    }

    private isFaceDownZone (zoneId: string): boolean
    {
        return zoneId.endsWith('-discard') || zoneId.endsWith('-deck');
    }

    private getCurrentBorderColor (): number
    {
        // Keep flipped cards neutral; AVGE color borders only appear when face-up.
        return this.turnedOver ? CARD_DEFAULTS.borderColor : this.borderColor;
    }

    private applyBorderStyle (): void
    {
        this.body.setStrokeStyle(Math.round(this.currentStrokeWidth), this.getCurrentBorderColor(), 1);
    }

    destroy (): void
    {
        if (this.selectionTween) {
            this.selectionTween.stop();
            this.selectionTween = undefined;
        }

        if (this.strokeTween) {
            this.strokeTween.stop();
            this.strokeTween = undefined;
        }

        this.body.destroy();
        this.idLabel.destroy();
        this.typeLabel.destroy();
        this.hpLabel.destroy();
        this.statusLabel.destroy();
    }
}
