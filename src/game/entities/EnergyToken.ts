import { Scene } from 'phaser';
import { ENTITY_VISUALS } from '../config';

type EnergyTokenOptions = {
    id: string;
    ownerId: string;
    x: number;
    y: number;
    radius: number;
    zoneId: string;
};

export class EnergyToken
{
    private readonly scene: Scene;
    readonly id: string;
    readonly uniqueId: string;
    readonly ownerId: string;
    readonly body: Phaser.GameObjects.Ellipse;

    private attachedToCardId: string | null;
    private zoneId: string;

    constructor (scene: Scene, options: EnergyTokenOptions)
    {
        this.scene = scene;
        this.id = options.id;
        this.uniqueId = options.id;
        this.ownerId = options.ownerId;
        this.zoneId = options.zoneId;
        this.attachedToCardId = null;

        const diameter = options.radius * 2;

        this.body = scene.add.ellipse(options.x, options.y, diameter, diameter, ENTITY_VISUALS.energyTokenFillColor, ENTITY_VISUALS.energyTokenFillAlpha)
            .setStrokeStyle(ENTITY_VISUALS.energyTokenStrokeWidth, ENTITY_VISUALS.energyTokenStrokeColor, ENTITY_VISUALS.energyTokenStrokeAlpha)
            .setInteractive({ draggable: true, useHandCursor: true });

        (this.body as Phaser.GameObjects.Ellipse & {
            __avgeEnableDraggableClickSfx?: boolean;
        }).__avgeEnableDraggableClickSfx = true;
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

    toStandardModel (): {
        UniqueID: string;
        AttachedToCard: boolean;
        CardUniqueID: string | null;
        ZoneUniqueID: string | null;
    }
    {
        const attachedToCard = this.attachedToCardId !== null;
        return {
            UniqueID: this.uniqueId,
            AttachedToCard: attachedToCard,
            CardUniqueID: this.attachedToCardId,
            ZoneUniqueID: attachedToCard ? null : this.zoneId,
        };
    }

    setPosition (x: number, y: number): void
    {
        this.body.setPosition(x, y);
    }

    setDepth (depth: number): void
    {
        this.body.setDepth(depth);
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

    destroy (): void
    {
        this.body.destroy();
    }
}