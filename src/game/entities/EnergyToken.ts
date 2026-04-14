import { Scene } from 'phaser';
import { PlayerId } from './Card';
import { ENTITY_VISUALS } from '../config';

type EnergyTokenOptions = {
    id: number;
    ownerId: PlayerId;
    x: number;
    y: number;
    radius: number;
    zoneId: string;
};

export class EnergyToken
{
    private readonly scene: Scene;
    readonly id: number;
    readonly ownerId: PlayerId;
    readonly body: Phaser.GameObjects.Ellipse;

    private idLabel: Phaser.GameObjects.BitmapText;
    private attachedToCardId: string | null;
    private zoneId: string;

    constructor (scene: Scene, options: EnergyTokenOptions)
    {
        this.scene = scene;
        this.id = options.id;
        this.ownerId = options.ownerId;
        this.zoneId = options.zoneId;
        this.attachedToCardId = null;

        const diameter = options.radius * 2;

        this.body = scene.add.ellipse(options.x, options.y, diameter, diameter, ENTITY_VISUALS.energyTokenFillColor, ENTITY_VISUALS.energyTokenFillAlpha)
            .setStrokeStyle(ENTITY_VISUALS.energyTokenStrokeWidth, ENTITY_VISUALS.energyTokenStrokeColor, ENTITY_VISUALS.energyTokenStrokeAlpha)
            .setInteractive({ draggable: true, useHandCursor: true });

        this.idLabel = scene.add.bitmapText(options.x, options.y, 'minogram', String(this.id), Math.max(ENTITY_VISUALS.energyTokenLabelMinSize, Math.round(options.radius * ENTITY_VISUALS.energyTokenLabelRadiusSizeMultiplier)))
            .setOrigin(0.5)
            .setTint(ENTITY_VISUALS.energyTokenLabelTint);
    }

    getZoneId (): string
    {
        return this.zoneId;
    }

    setZoneId (zoneId: string): void
    {
        this.zoneId = zoneId;
    }

    getAttachedToCardId (): string | null
    {
        return this.attachedToCardId;
    }

    setAttachedToCardId (cardId: string | null): void
    {
        this.attachedToCardId = cardId;
        this.scene.input.setDraggable(this.body, !cardId);
        if (this.body.input) {
            this.body.input.cursor = cardId ? 'default' : 'pointer';
        }
    }

    setPosition (x: number, y: number): void
    {
        this.body.setPosition(x, y);
        this.idLabel.setPosition(x, y);
    }

    setDepth (depth: number): void
    {
        this.body.setDepth(depth);
        this.idLabel.setDepth(depth + ENTITY_VISUALS.energyTokenLabelDepthOffset);
    }

    getBounds (): Phaser.Geom.Rectangle
    {
        return this.body.getBounds();
    }

    get x (): number
    {
        return this.body.x;
    }

    get y (): number
    {
        return this.body.y;
    }

    getDisplayWidth (): number
    {
        return this.body.displayWidth;
    }

    getDisplayHeight (): number
    {
        return this.body.displayHeight;
    }
}