import { Scene } from 'phaser';
import { Card } from '../entities';
import {
    BASE_HEIGHT,
    BASE_WIDTH,
    CARD_BORDER_WIDTH,
    CARD_VISUALS,
    GAME_DEPTHS,
    GAME_HEIGHT,
    GAME_PREVIEW_LAYOUT,
    GAME_WIDTH,
    UI_SCALE
} from '../config';

export class CardPreviewController
{
    private readonly scene: Scene;
    private panel: Phaser.GameObjects.Rectangle | null;
    private body: Phaser.GameObjects.Rectangle | null;
    private idText: Phaser.GameObjects.BitmapText | null;
    private typeText: Phaser.GameObjects.BitmapText | null;
    private hpText: Phaser.GameObjects.BitmapText | null;
    private paragraphText: Phaser.GameObjects.BitmapText | null;

    constructor (scene: Scene)
    {
        this.scene = scene;
        this.panel = null;
        this.body = null;
        this.idText = null;
        this.typeText = null;
        this.hpText = null;
        this.paragraphText = null;
    }

    create (objectWidth: number, objectHeight: number): void
    {
        const panelWidth = Math.round((GAME_PREVIEW_LAYOUT.panelWidthBase / BASE_WIDTH) * GAME_WIDTH);
        const panelHeight = Math.round((GAME_PREVIEW_LAYOUT.panelHeightBase / BASE_HEIGHT) * GAME_HEIGHT);
        const sideMargin = Math.round((GAME_PREVIEW_LAYOUT.sideMarginBase / BASE_WIDTH) * GAME_WIDTH);

        const panelX = GAME_WIDTH - sideMargin - Math.round(panelWidth / 2);
        const panelY = GAME_HEIGHT - sideMargin - Math.round(panelHeight / 2);
        const topY = panelY - Math.round(panelHeight / 2);
        const leftX = panelX - Math.round(panelWidth / 2);

        const previewCardWidth = Math.round(objectWidth * GAME_PREVIEW_LAYOUT.cardWidthMultiplier);
        const previewCardHeight = Math.round(objectHeight * GAME_PREVIEW_LAYOUT.cardHeightMultiplier);
        const previewCardCenterY = topY + Math.round(panelHeight * GAME_PREVIEW_LAYOUT.cardCenterYRatio);

        this.panel = this.scene.add.rectangle(panelX, panelY, panelWidth, panelHeight, GAME_PREVIEW_LAYOUT.panelFillColor, GAME_PREVIEW_LAYOUT.panelFillAlpha)
            .setStrokeStyle(GAME_PREVIEW_LAYOUT.panelStrokeWidth, GAME_PREVIEW_LAYOUT.panelStrokeColor, GAME_PREVIEW_LAYOUT.panelStrokeAlpha)
            .setDepth(GAME_DEPTHS.previewPanel)
            .setVisible(false);

        this.body = this.scene.add.rectangle(panelX, previewCardCenterY, previewCardWidth, previewCardHeight, GAME_PREVIEW_LAYOUT.cardFillColor, GAME_PREVIEW_LAYOUT.cardFillAlpha)
            .setStrokeStyle(CARD_BORDER_WIDTH, GAME_PREVIEW_LAYOUT.panelStrokeColor, 1)
            .setDepth(GAME_DEPTHS.previewCard)
            .setVisible(false);

        this.idText = this.scene.add.bitmapText(panelX, previewCardCenterY - Math.round(previewCardHeight * GAME_PREVIEW_LAYOUT.idYOffsetRatio), 'minogram', '', Math.max(14, Math.round(GAME_PREVIEW_LAYOUT.idFontSize * UI_SCALE)))
            .setOrigin(0.5)
            .setTint(GAME_PREVIEW_LAYOUT.panelStrokeColor)
            .setDepth(GAME_DEPTHS.previewText)
            .setVisible(false);

        this.typeText = this.scene.add.bitmapText(panelX, previewCardCenterY + Math.round(previewCardHeight * GAME_PREVIEW_LAYOUT.typeYOffsetRatio), 'minogram', '', Math.max(12, Math.round(GAME_PREVIEW_LAYOUT.typeFontSize * UI_SCALE)))
            .setOrigin(0.5)
            .setTint(GAME_PREVIEW_LAYOUT.typeTint)
            .setDepth(GAME_DEPTHS.previewText)
            .setVisible(false);

        this.hpText = this.scene.add.bitmapText(
            panelX - Math.round(previewCardWidth / 2) + Math.round(previewCardWidth * GAME_PREVIEW_LAYOUT.hpOffsetXRatio),
            previewCardCenterY - Math.round(previewCardHeight / 2) + Math.round(previewCardHeight * GAME_PREVIEW_LAYOUT.hpOffsetYRatio),
            'minogram',
            '',
            Math.max(10, Math.round(GAME_PREVIEW_LAYOUT.hpFontSize * UI_SCALE))
        )
            .setOrigin(0, 0)
            .setTint(GAME_PREVIEW_LAYOUT.panelStrokeColor)
            .setDepth(GAME_DEPTHS.previewText)
            .setVisible(false);

        this.paragraphText = this.scene.add.bitmapText(
            leftX + Math.round(panelWidth * GAME_PREVIEW_LAYOUT.paragraphXRatio),
            topY + Math.round(panelHeight * GAME_PREVIEW_LAYOUT.paragraphYRatio),
            'minogram',
            '',
            Math.max(9, Math.round(GAME_PREVIEW_LAYOUT.paragraphFontSize * UI_SCALE))
        )
            .setOrigin(0, 0)
            .setTint(GAME_PREVIEW_LAYOUT.paragraphTint)
            .setMaxWidth(Math.round(panelWidth * GAME_PREVIEW_LAYOUT.paragraphWidthRatio))
            .setDepth(GAME_DEPTHS.previewText)
            .setVisible(false);
    }

    show (card: Card): void
    {
        if (!this.panel || !this.body || !this.idText || !this.typeText || !this.hpText || !this.paragraphText) {
            return;
        }

        const isFaceDown = card.isTurnedOver();

        this.panel.setVisible(true);
        this.body
            .setVisible(true)
            .setFillStyle(isFaceDown ? CARD_VISUALS.faceDownFillColor : card.baseColor, 1)
            .setStrokeStyle(CARD_BORDER_WIDTH, card.getBorderColor(), 1);

        this.idText.setVisible(true).setText(card.id);
        this.typeText.setVisible(true).setText(card.getCardType().toUpperCase());

        if (card.getCardType() === 'character') {
            this.hpText.setVisible(true).setText(`[${card.getHp()}/${card.getMaxHp()}]`);
        }
        else {
            this.hpText.setVisible(false);
        }

        this.paragraphText
            .setVisible(true)
            .setText(
                `Preview panel: ${card.id} (${card.getCardType().toUpperCase()})\n` +
                `Owner: ${card.getOwnerId().toUpperCase()}\n` +
                `Status: ${isFaceDown ? 'TURNED OVER' : 'FACE UP'}\n\n` +
                'This is an expanded inspection view, separate from the in-play card. It only appears while the card is selected.'
            );
    }

    hide (): void
    {
        this.panel?.setVisible(false);
        this.body?.setVisible(false);
        this.idText?.setVisible(false);
        this.typeText?.setVisible(false);
        this.hpText?.setVisible(false);
        this.paragraphText?.setVisible(false);
    }
}
