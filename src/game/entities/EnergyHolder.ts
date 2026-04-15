import { Scene } from 'phaser';

import { EnergyToken } from './EnergyToken';
import { ENTITY_VISUALS, GAME_LAYOUT, UI_SCALE } from '../config';
import { fitBitmapTextToSingleLine } from '../ui/overlays/bitmapTextFit';

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
    readonly pileCountTexts: Phaser.GameObjects.BitmapText[];

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

        const preferredLabelSize = Math.max(ENTITY_VISUALS.energyHolderLabelMinSize, Math.round(ENTITY_VISUALS.energyHolderLabelBaseSize * UI_SCALE));
        this.labelText = scene.add.bitmapText(config.x, config.y - Math.round(config.height * ENTITY_VISUALS.energyHolderLabelYOffsetRatio), 'minogram', config.label, preferredLabelSize)
            .setOrigin(0.5)
            .setCenterAlign()
            .setTint(ENTITY_VISUALS.energyHolderLabelTint)
            .setAlpha(ENTITY_VISUALS.energyHolderLabelAlpha)
            .setDepth(ENTITY_VISUALS.energyHolderLabelDepth);

        this.labelText.setFontSize(fitBitmapTextToSingleLine({
            scene,
            font: 'minogram',
            text: config.label,
            preferredSize: preferredLabelSize,
            minSize: Math.max(ENTITY_VISUALS.energyHolderLabelMinSize, Math.round(preferredLabelSize * 0.72)),
            maxWidth: Math.max(10, Math.round(config.width * 0.9))
        }));

        const countFontSize = Math.max(ENTITY_VISUALS.energyHolderLabelMinSize, Math.round(preferredLabelSize * 0.8));
        this.pileCountTexts = Array.from({ length: GAME_LAYOUT.energyTokenZonePileCount }, () => (
            scene.add.bitmapText(config.x, config.y, 'minogram', '', countFontSize)
                .setOrigin(0.5, 1)
                .setTint(ENTITY_VISUALS.energyHolderLabelTint)
                .setAlpha(Math.min(1, ENTITY_VISUALS.energyHolderLabelAlpha + 0.2))
                .setDepth(ENTITY_VISUALS.energyHolderLabelDepth + 0.1)
                .setVisible(false)
        ));
    }

    setPosition (x: number, y: number): void
    {
        this.x = x;
        this.y = y;
        this.background.setPosition(x, y);
        this.zone.setPosition(x, y);
        this.labelText.setPosition(x, y - Math.round(this.height * ENTITY_VISUALS.energyHolderLabelYOffsetRatio));
    }

    setPileCountDisplay (pileIndex: number, x: number, y: number, count: number): void
    {
        const label = this.pileCountTexts[pileIndex];
        if (!label) {
            return;
        }

        if (count <= 0) {
            label.setVisible(false);
            return;
        }

        label
            .setPosition(x, y)
            .setText(String(count))
            .setVisible(true);
    }

    hidePileCountDisplays (): void
    {
        this.pileCountTexts.forEach((label) => label.setVisible(false));
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