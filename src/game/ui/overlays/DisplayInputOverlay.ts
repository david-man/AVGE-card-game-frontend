import { Scene } from 'phaser';
import { GAME_INPUT_SELECTION_OVERLAY } from '../../config';

type OverlayCloseCallback = () => void;
type OverlayCardClickCallback = (cardId: string) => void;

export type RevealOverlayCard = {
    id: string;
    cardClassLabel: string;
    cardColor: number;
    cardTypeLabel: string;
    isKnownCard?: boolean;
};

export class DisplayInputOverlay
{
    private scene: Scene;
    private inputLockOverlay: Phaser.GameObjects.Rectangle;
    private activeObjects: Phaser.GameObjects.GameObject[];
    private activeRevealCardContainer: Phaser.GameObjects.Container | null;

    constructor (scene: Scene, inputLockOverlay: Phaser.GameObjects.Rectangle)
    {
        this.scene = scene;
        this.inputLockOverlay = inputLockOverlay;
        this.activeObjects = [];
        this.activeRevealCardContainer = null;
    }

    hasActiveOverlay (): boolean
    {
        return this.activeObjects.length > 0;
    }

    stopActiveOverlay (): void
    {
        this.activeObjects.forEach((obj) => obj.destroy());
        this.activeObjects = [];
        this.activeRevealCardContainer = null;
    }

    private setRevealExpandedCard (container: Phaser.GameObjects.Container | null): void
    {
        if (this.activeRevealCardContainer) {
            this.activeRevealCardContainer.setScale(1, 1);
        }

        this.activeRevealCardContainer = container;

        if (this.activeRevealCardContainer) {
            this.activeRevealCardContainer.setScale(1.08, 1.08);
        }
    }

    startNotifyOverlay (playerLabel: string, message: string, onClose: OverlayCloseCallback): void
    {
        this.stopActiveOverlay();

        const width = this.scene.scale.width;
        const height = this.scene.scale.height;
        const overlayDepth = this.inputLockOverlay.depth + 5;
        const panelWidth = Math.max(300, Math.round(width * 0.56));
        const panelHeight = Math.max(180, Math.round(height * 0.34));
        const panelX = Math.round(width / 2);
        const panelY = Math.round(height / 2);
        const closeButtonSize = Math.max(28, Math.round(Math.min(panelWidth, panelHeight) * 0.12));
        const titleFontSize = Math.max(30, Math.round(panelWidth * 0.06));
        const bodyFontSize = Math.max(22, Math.round(panelWidth * 0.045));
        const closeFontSize = Math.max(20, Math.round(closeButtonSize * 0.7));

        const panel = this.scene.add.rectangle(panelX, panelY, panelWidth, panelHeight, 0x0f172a, 0.97)
            .setStrokeStyle(3, 0xffffff, 0.8)
            .setDepth(overlayDepth);

        const title = this.scene.add.bitmapText(panelX, panelY - Math.round(panelHeight * 0.36), 'minogram', `NOTIFY -> ${playerLabel}`, titleFontSize)
            .setOrigin(0.5)
            .setDepth(overlayDepth + 1)
            .setMaxWidth(Math.round(panelWidth * 0.86));

        const body = this.scene.add.bitmapText(panelX - Math.round(panelWidth * 0.42), panelY - Math.round(panelHeight * 0.16), 'minogram', message, bodyFontSize)
            .setOrigin(0, 0)
            .setDepth(overlayDepth + 1)
            .setMaxWidth(Math.round(panelWidth * 0.84));

        const closeX = panelX + Math.round(panelWidth * 0.5) - Math.round(closeButtonSize * 0.7);
        const closeY = panelY - Math.round(panelHeight * 0.5) + Math.round(closeButtonSize * 0.7);

        const closeButton = this.scene.add.rectangle(closeX, closeY, closeButtonSize, closeButtonSize, 0x7f1d1d, 0.98)
            .setStrokeStyle(2, 0xffffff, 0.9)
            .setDepth(overlayDepth + 2)
            .setInteractive({ useHandCursor: true });

        const closeLabel = this.scene.add.bitmapText(closeX, closeY, 'minogram', 'X', closeFontSize)
            .setOrigin(0.5)
            .setDepth(overlayDepth + 3);

        const close = () => {
            this.stopActiveOverlay();
            onClose();
        };

        closeButton.on('pointerdown', close);

        this.activeObjects.push(panel, title, body, closeButton, closeLabel);
    }

    startRevealOverlay (
        playerLabel: string,
        cards: RevealOverlayCard[],
        onClose: OverlayCloseCallback,
        onCardClick?: OverlayCardClickCallback,
        onBackgroundClick?: OverlayCloseCallback
    ): void
    {
        this.stopActiveOverlay();

        const width = this.scene.scale.width;
        const height = this.scene.scale.height;
        const overlayDepth = this.inputLockOverlay.depth + 5;
        const panelWidth = Math.max(380, Math.round(width * 0.72));
        const panelHeight = Math.max(260, Math.round(height * 0.56));
        const panelX = Math.round(width / 2);
        const panelY = Math.round(height / 2);
        const closeButtonSize = Math.max(28, Math.round(Math.min(panelWidth, panelHeight) * 0.12));
        const titleFontSize = Math.max(30, Math.round(panelWidth * 0.06));
        const cardLabelFontSize = Math.max(14, Math.round(panelWidth * 0.022));
        const cardSubLabelFontSize = Math.max(12, Math.round(panelWidth * 0.018));
        const closeFontSize = Math.max(20, Math.round(closeButtonSize * 0.7));

        const clickBackdrop = this.scene.add.rectangle(
            this.scene.scale.width / 2,
            this.scene.scale.height / 2,
            this.scene.scale.width,
            this.scene.scale.height,
            0x000000,
            0.001
        )
            .setDepth(overlayDepth - 1)
            .setInteractive({ useHandCursor: false });
        clickBackdrop.on('pointerdown', () => {
            this.setRevealExpandedCard(null);
            if (onBackgroundClick) {
                onBackgroundClick();
            }
        });

        const panel = this.scene.add.rectangle(panelX, panelY, panelWidth, panelHeight, 0x111827, 0.97)
            .setStrokeStyle(3, 0xffffff, 0.8)
            .setDepth(overlayDepth);

        const title = this.scene.add.bitmapText(panelX, panelY - Math.round(panelHeight * 0.4), 'minogram', `REVEAL -> ${playerLabel}`, titleFontSize)
            .setOrigin(0.5)
            .setDepth(overlayDepth + 1)
            .setMaxWidth(Math.round(panelWidth * 0.86));

        const gridTopY = panelY - Math.round(panelHeight * 0.26);
        const gridBottomY = panelY + Math.round(panelHeight * 0.35);
        const gridLeftX = panelX - Math.round(panelWidth * 0.43);
        const gridRightX = panelX + Math.round(panelWidth * 0.43);
        const availableWidth = Math.max(1, gridRightX - gridLeftX);
        const availableHeight = Math.max(1, gridBottomY - gridTopY);

        if (cards.length === 0) {
            const emptyText = this.scene.add.bitmapText(panelX, panelY, 'minogram', '(NO CARDS)', Math.max(22, Math.round(panelWidth * 0.04)))
                .setOrigin(0.5)
                .setDepth(overlayDepth + 1);
            this.activeObjects.push(clickBackdrop, panel, title, emptyText);
        }
        else {
            const preferredCardWidth = Math.max(
                GAME_INPUT_SELECTION_OVERLAY.cardWidthMin,
                Math.round(this.scene.scale.width * GAME_INPUT_SELECTION_OVERLAY.cardWidthRatio)
            );
            const maxColumns = Math.max(1, Math.floor(availableWidth / (preferredCardWidth + 12)));
            const columnCount = Math.min(cards.length, Math.max(1, maxColumns));
            const rowCount = Math.max(1, Math.ceil(cards.length / columnCount));

            const horizontalGap = Math.max(
                GAME_INPUT_SELECTION_OVERLAY.rowSpacingMin,
                Math.round(this.scene.scale.width * GAME_INPUT_SELECTION_OVERLAY.rowSpacingRatio)
            );
            const verticalGap = Math.max(
                GAME_INPUT_SELECTION_OVERLAY.rowGapMin,
                Math.round(this.scene.scale.height * GAME_INPUT_SELECTION_OVERLAY.rowGapRatio)
            );

            const maxCardWidthByGrid = Math.floor((availableWidth - ((columnCount - 1) * horizontalGap)) / columnCount);
            const maxCardHeightByGrid = Math.floor((availableHeight - ((rowCount - 1) * verticalGap)) / rowCount);

            const widthFromHeightConstraint = Math.floor(maxCardHeightByGrid / GAME_INPUT_SELECTION_OVERLAY.cardHeightRatio);
            const fittedCardWidth = Math.max(64, Math.min(preferredCardWidth, maxCardWidthByGrid, widthFromHeightConstraint));
            const fittedCardHeight = Math.max(96, Math.round(fittedCardWidth * GAME_INPUT_SELECTION_OVERLAY.cardHeightRatio));

            const cardWidth = fittedCardWidth;
            const cardHeight = fittedCardHeight;

            const totalGridWidth = (columnCount * cardWidth) + ((columnCount - 1) * horizontalGap);
            const totalGridHeight = (rowCount * cardHeight) + ((rowCount - 1) * verticalGap);
            const startX = panelX - Math.round(totalGridWidth / 2) + Math.round(cardWidth / 2);
            const startY = gridTopY + Math.max(0, Math.round((availableHeight - totalGridHeight) / 2)) + Math.round(cardHeight / 2);

            cards.forEach((card, index) => {
                const row = Math.floor(index / columnCount);
                const col = index % columnCount;
                const x = startX + (col * (cardWidth + horizontalGap));
                const y = startY + (row * (cardHeight + verticalGap));

                const body = this.scene.add.rectangle(0, 0, cardWidth, cardHeight, card.cardColor, 1)
                    .setStrokeStyle(3, 0xffffff, 0.95);

                const idText = this.scene.add.bitmapText(0, -Math.round(cardHeight * 0.2), 'minogram', card.cardClassLabel, cardLabelFontSize)
                    .setOrigin(0.5)
                    .setMaxWidth(cardWidth - 8);

                const typeText = this.scene.add.bitmapText(0, Math.round(cardHeight * 0.23), 'minogram', card.cardTypeLabel, cardSubLabelFontSize)
                    .setOrigin(0.5)
                    .setMaxWidth(cardWidth - 8);

                const cardContainer = this.scene.add.container(x, y, [body, idText, typeText])
                    .setDepth(overlayDepth + 1);

                body.setInteractive({ useHandCursor: card.isKnownCard === true });
                body.on('pointerdown', () => {
                    this.setRevealExpandedCard(cardContainer);
                    if (card.isKnownCard && onCardClick) {
                        onCardClick(card.id);
                    }
                });

                this.activeObjects.push(cardContainer);
            });

            this.activeObjects.push(clickBackdrop, panel, title);
        }

        const closeX = panelX - Math.round(panelWidth * 0.5) + Math.round(closeButtonSize * 0.7);
        const closeY = panelY - Math.round(panelHeight * 0.5) + Math.round(closeButtonSize * 0.7);

        const closeButton = this.scene.add.rectangle(closeX, closeY, closeButtonSize, closeButtonSize, 0x7f1d1d, 0.98)
            .setStrokeStyle(2, 0xffffff, 0.9)
            .setDepth(overlayDepth + 2)
            .setInteractive({ useHandCursor: true });

        const closeLabel = this.scene.add.bitmapText(closeX, closeY, 'minogram', 'X', closeFontSize)
            .setOrigin(0.5)
            .setDepth(overlayDepth + 3);

        const close = () => {
            this.stopActiveOverlay();
            onClose();
        };

        closeButton.on('pointerdown', close);

        this.activeObjects.push(closeButton, closeLabel);
    }

    startWinnerOverlay (
        winnerLabel: string,
        panelColor: number,
        onBackToMenu: OverlayCloseCallback
    ): void
    {
        this.stopActiveOverlay();

        const width = this.scene.scale.width;
        const height = this.scene.scale.height;
        const overlayDepth = this.inputLockOverlay.depth + 5;
        const panelWidth = Math.max(360, Math.round(width * 0.58));
        const panelHeight = Math.max(240, Math.round(height * 0.44));
        const panelX = Math.round(width / 2);
        const panelY = Math.round(height / 2);

        const titleFontSize = Math.max(34, Math.round(panelWidth * 0.085));
        const winnerFontSize = Math.max(28, Math.round(panelWidth * 0.062));
        const buttonWidth = Math.max(170, Math.round(panelWidth * 0.34));
        const buttonHeight = Math.max(52, Math.round(panelHeight * 0.18));
        const buttonFontSize = Math.max(16, Math.round(buttonHeight * 0.38));

        const backdrop = this.scene.add.rectangle(
            panelX,
            panelY,
            width,
            height,
            0x000000,
            0.35
        ).setDepth(overlayDepth - 1);

        const panel = this.scene.add.rectangle(panelX, panelY, panelWidth, panelHeight, panelColor, 0.96)
            .setStrokeStyle(3, 0xffffff, 0.9)
            .setDepth(overlayDepth);

        const title = this.scene.add.bitmapText(panelX, panelY - Math.round(panelHeight * 0.31), 'minogram', 'WINNER:', titleFontSize)
            .setOrigin(0.5)
            .setDepth(overlayDepth + 1)
            .setTint(0xffffff);

        const winnerText = this.scene.add.bitmapText(panelX, panelY - Math.round(panelHeight * 0.08), 'minogram', winnerLabel, winnerFontSize)
            .setOrigin(0.5)
            .setDepth(overlayDepth + 1)
            .setTint(0xffffff);

        const buttonY = panelY + Math.round(panelHeight * 0.26);
        const menuButton = this.scene.add.rectangle(panelX, buttonY, buttonWidth, buttonHeight, 0x111827, 0.95)
            .setStrokeStyle(2, 0xffffff, 0.9)
            .setDepth(overlayDepth + 2)
            .setInteractive({ useHandCursor: true });

        const menuLabel = this.scene.add.bitmapText(panelX, buttonY, 'minogram', 'MAIN MENU', buttonFontSize)
            .setOrigin(0.5)
            .setDepth(overlayDepth + 3)
            .setTint(0xffffff);

        menuButton.on('pointerover', () => {
            menuButton.setFillStyle(0x1f2937, 0.98);
            menuLabel.setTint(0xfef08a);
        });

        menuButton.on('pointerout', () => {
            menuButton.setFillStyle(0x111827, 0.95);
            menuLabel.setTint(0xffffff);
        });

        menuButton.on('pointerdown', () => {
            this.stopActiveOverlay();
            onBackToMenu();
        });

        this.activeObjects.push(backdrop, panel, title, winnerText, menuButton, menuLabel);
    }
}
