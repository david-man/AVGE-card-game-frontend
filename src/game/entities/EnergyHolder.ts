import { Scene } from 'phaser';

import { EnergyToken } from './EnergyToken';
import { ENTITY_VISUALS, UI_SCALE } from '../config';

export type EnergyHolderConfig = {
    id: string;
    label: string;
    x: number;
    y: number;
    width: number;
    height: number;
    color: number;
};

export class EnergyHolder
{
    readonly id: string;
    readonly label: string;
    x: number;
    y: number;
    readonly width: number;
    readonly height: number;
    readonly zone: Phaser.GameObjects.Zone;
    readonly background: Phaser.GameObjects.Rectangle;
    readonly labelText: Phaser.GameObjects.BitmapText;

    readonly tokens: EnergyToken[];

    constructor (scene: Scene, config: EnergyHolderConfig)
    {
        this.id = config.id;
        this.label = config.label;
        this.x = config.x;
        this.y = config.y;
        this.width = config.width;
        this.height = config.height;
        this.tokens = [];

        this.background = scene.add.rectangle(config.x, config.y, config.width, config.height, config.color, ENTITY_VISUALS.energyHolderFillAlpha)
            .setStrokeStyle(ENTITY_VISUALS.energyHolderStrokeWidth, ENTITY_VISUALS.energyHolderStrokeColor, ENTITY_VISUALS.energyHolderStrokeAlpha)
            .setDepth(ENTITY_VISUALS.energyHolderDepth);

        this.zone = scene.add.zone(config.x, config.y, config.width, config.height)
            .setRectangleDropZone(config.width, config.height)
            .setData('zoneId', config.id);

        this.labelText = scene.add.bitmapText(config.x, config.y - Math.round(config.height * ENTITY_VISUALS.energyHolderLabelYOffsetRatio), 'minogram', config.label, Math.max(ENTITY_VISUALS.energyHolderLabelMinSize, Math.round(ENTITY_VISUALS.energyHolderLabelBaseSize * UI_SCALE)))
            .setOrigin(0.5)
            .setTint(ENTITY_VISUALS.energyHolderLabelTint)
            .setDepth(ENTITY_VISUALS.energyHolderLabelDepth);
    }

    setPosition (x: number, y: number): void
    {
        this.x = x;
        this.y = y;
        this.background.setPosition(x, y);
        this.zone.setPosition(x, y);
        this.labelText.setPosition(x, y - Math.round(this.height * ENTITY_VISUALS.energyHolderLabelYOffsetRatio));
    }

    addToken (token: EnergyToken): void
    {
        if (!this.tokens.includes(token)) {
            this.tokens.push(token);
        }
    }

    removeToken (token: EnergyToken): void
    {
        const index = this.tokens.indexOf(token);
        if (index !== -1) {
            this.tokens.splice(index, 1);
        }
    }

    getBounds (): Phaser.Geom.Rectangle
    {
        return new Phaser.Geom.Rectangle(
            this.x - Math.round(this.width / 2),
            this.y - Math.round(this.height / 2),
            this.width,
            this.height
        );
    }
}