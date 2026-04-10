import { Scene } from 'phaser';

import { Card } from './index';
import { CARDHOLDER_LAYOUT_SIDE_PADDING_MULTIPLIER, UI_SCALE } from '../config';

export type CardHolderConfig = {
    id: string;
    label: string;
    x: number;
    y: number;
    width: number;
    height: number;
    color: number;
};

export class CardHolder
{
    readonly id: string;
    readonly label: string;
    readonly x: number;
    readonly y: number;
    readonly width: number;
    readonly height: number;
    readonly zone: Phaser.GameObjects.Zone;

    readonly cards: Card[];

    constructor (scene: Scene, config: CardHolderConfig)
    {
        this.id = config.id;
        this.label = config.label;
        this.x = config.x;
        this.y = config.y;
        this.width = config.width;
        this.height = config.height;
        this.cards = [];

        scene.add.rectangle(config.x, config.y, config.width, config.height, config.color, 0.22)
            .setStrokeStyle(3, 0xffffff, 0.9)
            .setDepth(1);

        this.zone = scene.add.zone(config.x, config.y, config.width, config.height)
            .setRectangleDropZone(config.width, config.height)
            .setData('zoneId', config.id);

        scene.add.bitmapText(config.x, config.y, 'minogram', config.label, Math.max(12, Math.round(18 * UI_SCALE)))
            .setOrigin(0.5)
            .setTint(0xffffff)
            .setDepth(2);
    }

    addCard (card: Card): void
    {
        if (!this.cards.includes(card)) {
            this.cards.push(card);
        }
    }

    insertCard (card: Card, index : number): void
    {
        if(index < 0 || index > this.cards.length){
            return
        }
        if (!this.cards.includes(card)) {
            this.cards.splice(index, 0, card);
        }
    }

    removeCard (card: Card): void
    {
        const index = this.cards.indexOf(card);
        if (index !== -1) {
            this.cards.splice(index, 1);
        }
    }

    layoutHorizontal (
        cardWidth: number,
        preferredHorizontalStep: number,
        onCardPositioned: (card: Card) => void
    ): void
    {
        if (this.cards.length === 0) {
            return;
        }

        const count = this.cards.length;
        const sidePadding = cardWidth * CARDHOLDER_LAYOUT_SIDE_PADDING_MULTIPLIER;
        const availableWidth = Math.max(cardWidth, this.width - (sidePadding * 2));

        let stepBetweenCentersX = 0;
        if (count > 1) {
            const maxStepToFit = Math.max(0, (availableWidth - cardWidth) / (count - 1));
            stepBetweenCentersX = Math.min(preferredHorizontalStep, maxStepToFit);
        }

        const rowWidth = cardWidth + ((count - 1) * stepBetweenCentersX);
        const startX = this.x - (rowWidth / 2) + (cardWidth / 2);

        this.cards.forEach((card, index) => {
            card.setPosition(startX + (index * stepBetweenCentersX), this.y);
            card.setDepth(card.getSelected() ? 10000 : (10 + index));
            onCardPositioned(card);
        });
    }
}
