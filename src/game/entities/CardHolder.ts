import { Scene } from 'phaser';

import { Card } from './index';
import { CARDHOLDER_LAYOUT_SIDE_PADDING_MULTIPLIER, ENTITY_VISUALS, GAME_DEPTHS, UI_SCALE } from '../config';

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
    x: number;
    y: number;
    readonly width: number;
    readonly height: number;
    readonly zone: Phaser.GameObjects.Zone;
    readonly background: Phaser.GameObjects.Rectangle;
    readonly labelText: Phaser.GameObjects.BitmapText;

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

        this.background = scene.add.rectangle(config.x, config.y, config.width, config.height, config.color, ENTITY_VISUALS.cardHolderFillAlpha)
            .setStrokeStyle(ENTITY_VISUALS.cardHolderStrokeWidth, ENTITY_VISUALS.cardHolderStrokeColor, ENTITY_VISUALS.cardHolderStrokeAlpha)
            .setDepth(ENTITY_VISUALS.cardHolderDepth);

        this.zone = scene.add.zone(config.x, config.y, config.width, config.height)
            .setRectangleDropZone(config.width, config.height)
            .setData('zoneId', config.id);

        this.labelText = scene.add.bitmapText(config.x, config.y, 'minogram', config.label, Math.max(ENTITY_VISUALS.cardHolderLabelMinSize, Math.round(ENTITY_VISUALS.cardHolderLabelBaseSize * UI_SCALE)))
            .setOrigin(0.5)
            .setTint(ENTITY_VISUALS.cardHolderLabelTint)
            .setDepth(ENTITY_VISUALS.cardHolderLabelDepth);
    }

    setPosition (x: number, y: number): void
    {
        this.x = x;
        this.y = y;
        this.background.setPosition(x, y);
        this.zone.setPosition(x, y);
        this.labelText.setPosition(x, y);
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
            card.setDepth(card.getSelected() ? GAME_DEPTHS.cardSelected : (GAME_DEPTHS.cardBase + index));
            onCardPositioned(card);
        });
    }
}
