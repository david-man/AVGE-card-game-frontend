import { Scene } from 'phaser';
import { PlayerId } from './Card';

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

        this.body = scene.add.ellipse(options.x, options.y, diameter, diameter, 0xffd166, 1)
            .setStrokeStyle(3, 0xffffff, 1)
            .setInteractive({ draggable: true, useHandCursor: true });

        this.idLabel = scene.add.bitmapText(options.x, options.y, 'minogram', String(this.id), Math.max(10, Math.round(options.radius * 0.95)))
            .setOrigin(0.5)
            .setTint(0x1b1b1b);
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
        this.idLabel.setDepth(depth + 0.5);
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