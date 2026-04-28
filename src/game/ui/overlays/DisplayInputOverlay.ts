import { Scene } from 'phaser';
import { GAME_INPUT_REVEAL_OVERLAY, GAME_INPUT_SELECTION_OVERLAY, GAME_OVERLAY_DEPTHS } from '../../config';
import { fitBitmapTextToMultiLine } from './bitmapTextFit';

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
    private activeTimer: Phaser.Time.TimerEvent | null;
    private activeCountdownTween: Phaser.Tweens.Tween | null;
    private activeCountdownFrame: Phaser.GameObjects.Graphics | null;

    constructor (scene: Scene, inputLockOverlay: Phaser.GameObjects.Rectangle)
    {
        this.scene = scene;
        this.inputLockOverlay = inputLockOverlay;
        this.activeObjects = [];
        this.activeRevealCardContainer = null;
        this.activeTimer = null;
        this.activeCountdownTween = null;
        this.activeCountdownFrame = null;
    }

    hasActiveOverlay (): boolean
    {
        return this.activeObjects.length > 0;
    }

    stopActiveOverlay (): void
    {
        this.clearActiveTimeout();
        this.activeObjects.forEach((obj) => obj.destroy());
        this.activeObjects = [];
        this.activeRevealCardContainer = null;
        this.activeCountdownFrame = null;
    }

    private clearActiveTimeout (): void
    {
        if (this.activeTimer) {
            this.activeTimer.remove(false);
            this.activeTimer = null;
        }
        if (this.activeCountdownTween) {
            this.activeCountdownTween.remove();
            this.activeCountdownTween = null;
        }
    }

    private cancelTimeoutAndHideFrame (): void
    {
        this.clearActiveTimeout();
        if (this.activeCountdownFrame) {
            this.activeCountdownFrame.setVisible(false);
        }
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

    private drawSquareCountdownFrame (
        graphics: Phaser.GameObjects.Graphics,
        centerX: number,
        centerY: number,
        size: number,
        remainingRatio: number
    ): void
    {
        const ratio = Math.max(0, Math.min(1, remainingRatio));
        graphics.clear();
        if (ratio <= 0) {
            return;
        }

        graphics.lineStyle(2, 0xfef08a, 0.95);

        const half = size / 2;
        const left = centerX - half;
        const top = centerY - half;
        const segmentLength = size;
        let remainingPerimeter = (segmentLength * 4) * ratio;

        let x = left;
        let y = top;
        graphics.beginPath();
        graphics.moveTo(x, y);

        const segments = [
            { dx: 1, dy: 0 },
            { dx: 0, dy: 1 },
            { dx: -1, dy: 0 },
            { dx: 0, dy: -1 },
        ];

        for (const segment of segments) {
            if (remainingPerimeter <= 0) {
                break;
            }
            const drawLength = Math.min(segmentLength, remainingPerimeter);
            x += segment.dx * drawLength;
            y += segment.dy * drawLength;
            graphics.lineTo(x, y);
            remainingPerimeter -= drawLength;
        }

        graphics.strokePath();
    }

    private normalizeOverlayLabel (value: string): string
    {
        return value
            .replace(/[_-]+/g, ' ')
            .replace(/\s+/g, ' ')
            .trim();
    }

    startNotifyOverlay (
        playerLabel: string,
        message: string,
        onClose: OverlayCloseCallback,
        timeoutSeconds: number | null = null
    ): void
    {
        this.stopActiveOverlay();

        const width = this.scene.scale.width;
        const height = this.scene.scale.height;
        const overlayDepth = Math.max(GAME_OVERLAY_DEPTHS.overlayBase, this.inputLockOverlay.depth + 1);
        const panelWidth = Math.max(300, Math.round(width * 0.56));
        const panelHeight = Math.max(180, Math.round(height * 0.34));
        const panelX = Math.round(width / 2);
        const panelY = Math.round(height / 2);
        const closeButtonSize = Math.max(28, Math.round(Math.min(panelWidth, panelHeight) * 0.12));
        const titleFontSize = Math.max(30, Math.round(panelWidth * 0.06));
        const bodyFontSize = Math.max(22, Math.round(panelWidth * 0.045));
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

        const panel = this.scene.add.rectangle(panelX, panelY, panelWidth, panelHeight, 0x0f172a, 0.97)
            .setStrokeStyle(3, 0xffffff, 0.8)
            .setDepth(overlayDepth)
            .setInteractive({ useHandCursor: false });

        const title = this.scene.add.bitmapText(panelX, panelY - Math.round(panelHeight * 0.36), 'minogram', `${playerLabel}`, titleFontSize)
            .setOrigin(0.5)
            .setDepth(overlayDepth + 1)
            .setMaxWidth(Math.round(panelWidth * 0.86))
            .setInteractive({ useHandCursor: false });

        const body = this.scene.add.bitmapText(panelX - Math.round(panelWidth * 0.42), panelY - Math.round(panelHeight * 0.16), 'minogram', message, bodyFontSize)
            .setOrigin(0, 0)
            .setDepth(overlayDepth + 1)
            .setMaxWidth(Math.round(panelWidth * 0.84))
            .setInteractive({ useHandCursor: false });

        const closeX = panelX + Math.round(panelWidth * 0.5) - Math.round(closeButtonSize * 0.7);
        const closeY = panelY - Math.round(panelHeight * 0.5) + Math.round(closeButtonSize * 0.7);

        const closeButton = this.scene.add.rectangle(closeX, closeY, closeButtonSize, closeButtonSize, 0x7f1d1d, 0.98)
            .setStrokeStyle(2, 0xffffff, 0.9)
            .setDepth(overlayDepth + 2)
            .setInteractive({ useHandCursor: true });

        const closeLabel = this.scene.add.bitmapText(closeX, closeY, 'minogram', 'X', closeFontSize)
            .setOrigin(0.5)
            .setDepth(overlayDepth + 3);

        const countdownFrameSize = closeButtonSize + 8;
        const timeoutFrame = this.scene.add.graphics().setDepth(overlayDepth + 4);
        this.drawSquareCountdownFrame(timeoutFrame, closeX, closeY, countdownFrameSize, 1);
        this.activeCountdownFrame = timeoutFrame;
        this.activeCountdownFrame = timeoutFrame;

        let closed = false;
        let timeoutCanceledByInteraction = false;
        const close = () => {
            if (closed) {
                return;
            }
            closed = true;
            this.stopActiveOverlay();
            onClose();
        };

        const cancelTimeoutFromInteraction = () => {
            if (timeoutCanceledByInteraction) {
                return;
            }
            timeoutCanceledByInteraction = true;
            this.cancelTimeoutAndHideFrame();
        };

        closeButton.on('pointerdown', close);
        clickBackdrop.on('pointerdown', cancelTimeoutFromInteraction);
        panel.on('pointerdown', cancelTimeoutFromInteraction);
        title.on('pointerdown', cancelTimeoutFromInteraction);
        body.on('pointerdown', cancelTimeoutFromInteraction);

        if (timeoutSeconds !== null && Number.isFinite(timeoutSeconds) && timeoutSeconds >= 0) {
            const timeoutMs = Math.max(0, Math.round(timeoutSeconds * 1000));
            const countdownState = { remaining: 1 };
            this.activeCountdownTween = this.scene.tweens.add({
                targets: countdownState,
                remaining: 0,
                duration: timeoutMs,
                ease: 'Linear',
                onUpdate: () => {
                    this.drawSquareCountdownFrame(timeoutFrame, closeX, closeY, countdownFrameSize, countdownState.remaining);
                },
                onComplete: () => {
                    this.drawSquareCountdownFrame(timeoutFrame, closeX, closeY, countdownFrameSize, 0);
                }
            });
            this.activeTimer = this.scene.time.delayedCall(timeoutMs, close);
        }
        else {
            timeoutFrame.setVisible(false);
        }

        this.activeObjects.push(clickBackdrop, panel, title, body, closeButton, closeLabel, timeoutFrame);
    }

    startRevealOverlay (
        cards: RevealOverlayCard[],
        message: string | null,
        timeoutSeconds: number | null,
        onClose: OverlayCloseCallback,
        onCardClick?: OverlayCardClickCallback,
        onBackgroundClick?: OverlayCloseCallback
    ): void
    {
        this.stopActiveOverlay();

        const width = this.scene.scale.width;
        const height = this.scene.scale.height;
        const overlayDepth = Math.max(GAME_OVERLAY_DEPTHS.overlayBase, this.inputLockOverlay.depth + 1);
        const panelWidth = Math.max(380, Math.round(width * 0.72));
        const panelHeight = Math.max(440, Math.round(height * 0.78));
        const panelX = Math.round(width / 2);
        const panelY = Math.round(height / 2);
        const closeButtonSize = Math.max(28, Math.round(panelWidth * 0.08));
        const messageFontSize = Math.max(18, Math.round(panelWidth * 0.03));
        const cardLabelFontSize = Math.max(14, Math.round(panelWidth * 0.022));
        const cardSubLabelFontSize = Math.max(12, Math.round(panelWidth * 0.018));
        const closeFontSize = Math.max(20, Math.round(closeButtonSize * 0.7));
        const revealMessage = (message ?? '').trim();
        const panelTop = panelY - Math.round(panelHeight / 2);
        const panelBottom = panelY + Math.round(panelHeight / 2);
        const panelInnerPaddingX = Math.max(16, Math.round(panelWidth * 0.07));
        const panelTopPadding = Math.max(closeButtonSize + 10, Math.round(panelWidth * 0.12));
        const panelBottomPadding = Math.max(16, Math.round(panelWidth * 0.05));
        const sectionGap = Math.max(10, Math.round(panelWidth * 0.03));
        const messageMaxWidth = Math.round(panelWidth * 0.84);
        const availableWidth = Math.max(1, panelWidth - (panelInnerPaddingX * 2));
        const titleY = panelTop + panelTopPadding;
        const messageTopY = titleY;
        const gridTopY = revealMessage
            ? messageTopY + Math.max(messageFontSize, Math.round(messageFontSize * 1.2)) + sectionGap
            : titleY + sectionGap;
        const gridBottomY = panelBottom - panelBottomPadding;
        let timeoutCanceledByInteraction = false;

        const cancelTimeoutFromInteraction = () => {
            if (timeoutCanceledByInteraction) {
                return;
            }
            timeoutCanceledByInteraction = true;
            this.cancelTimeoutAndHideFrame();
        };

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
            cancelTimeoutFromInteraction();
            this.setRevealExpandedCard(null);
            if (onBackgroundClick) {
                onBackgroundClick();
            }
        });

        const panel = this.scene.add.rectangle(panelX, panelY, panelWidth, panelHeight, 0x111827, 0.97)
            .setStrokeStyle(3, 0xffffff, 0.8)
            .setDepth(overlayDepth)
            .setInteractive({ useHandCursor: false });
        panel.on('pointerdown', cancelTimeoutFromInteraction);

        this.activeObjects.push(clickBackdrop, panel);


        const messageText = revealMessage
            ? this.scene.add.bitmapText(
                panelX - Math.round(messageMaxWidth / 2),
                messageTopY,
                'minogram',
                revealMessage,
                messageFontSize,
            )
                .setOrigin(0, 0)
                .setDepth(overlayDepth + 1)
                .setMaxWidth(messageMaxWidth)
                .setInteractive({ useHandCursor: false })
            : null;
        messageText?.on('pointerdown', cancelTimeoutFromInteraction);

        const availableHeight = Math.max(1, gridBottomY - gridTopY);
        if (messageText) {
            this.activeObjects.push(messageText);
        }

        if (cards.length === 0) {
            const emptyText = this.scene.add.bitmapText(panelX, panelY, 'minogram', '(NO CARDS)', Math.max(22, Math.round(panelWidth * 0.04)))
                .setOrigin(0.5)
                .setDepth(overlayDepth + 1);
            emptyText.setY(Math.round(gridTopY + (availableHeight / 2)));
            this.activeObjects.push(emptyText);
        }
        else {
            const desiredCardWidth = Math.max(
                GAME_INPUT_SELECTION_OVERLAY.cardWidthMin,
                Math.round(this.scene.scale.width * GAME_INPUT_SELECTION_OVERLAY.cardWidthRatio)
            );
            const maxRevealCardWidth = Math.max(
                GAME_INPUT_SELECTION_OVERLAY.cardWidthMin,
                Math.round(this.scene.scale.width * GAME_INPUT_REVEAL_OVERLAY.maxCardWidthRatio)
            );
            const horizontalGap = Math.max(
                4,
                Math.max(
                    GAME_INPUT_SELECTION_OVERLAY.rowSpacingMin,
                    Math.round(this.scene.scale.width * GAME_INPUT_SELECTION_OVERLAY.rowSpacingRatio)
                )
            );
            const verticalGap = Math.max(
                4,
                Math.max(
                    GAME_INPUT_SELECTION_OVERLAY.rowGapMin,
                    Math.round(this.scene.scale.height * GAME_INPUT_SELECTION_OVERLAY.rowGapRatio)
                )
            );
            let cardWidth = Math.min(desiredCardWidth, maxRevealCardWidth);
            let maxColumnsByWidth = Math.max(1, Math.floor((availableWidth + horizontalGap) / (cardWidth + horizontalGap)));
            let columnCount = Math.max(1, Math.min(cards.length, maxColumnsByWidth));
            let rowCount = Math.max(1, Math.ceil(cards.length / columnCount));
            let widthPerColumnLimit = Math.max(1, Math.floor((availableWidth - ((columnCount - 1) * horizontalGap)) / columnCount));
            cardWidth = Math.min(cardWidth, widthPerColumnLimit, maxRevealCardWidth);
            let cardHeight = Math.max(1, Math.round(cardWidth * GAME_INPUT_SELECTION_OVERLAY.cardHeightRatio));

            const totalGridHeightAtCurrentWidth = (rowCount * cardHeight) + ((rowCount - 1) * verticalGap);
            if (totalGridHeightAtCurrentWidth > availableHeight) {
                const availableHeightForCards = Math.max(1, availableHeight - ((rowCount - 1) * verticalGap));
                const widthByHeight = Math.max(1, Math.floor(availableHeightForCards / (rowCount * GAME_INPUT_SELECTION_OVERLAY.cardHeightRatio)));
                cardWidth = Math.min(cardWidth, widthByHeight, maxRevealCardWidth);
                cardHeight = Math.max(1, Math.round(cardWidth * GAME_INPUT_SELECTION_OVERLAY.cardHeightRatio));

                maxColumnsByWidth = Math.max(1, Math.floor((availableWidth + horizontalGap) / (cardWidth + horizontalGap)));
                columnCount = Math.max(1, Math.min(cards.length, maxColumnsByWidth));
                rowCount = Math.max(1, Math.ceil(cards.length / columnCount));
                widthPerColumnLimit = Math.max(1, Math.floor((availableWidth - ((columnCount - 1) * horizontalGap)) / columnCount));
                cardWidth = Math.min(cardWidth, widthPerColumnLimit, maxRevealCardWidth);
                cardHeight = Math.max(1, Math.round(cardWidth * GAME_INPUT_SELECTION_OVERLAY.cardHeightRatio));
            }

            const itemTextMaxWidth = Math.max(12, cardWidth - 8);
            const itemLabelPreferredSize = Math.max(8, Math.round(cardWidth * GAME_INPUT_SELECTION_OVERLAY.itemLabelFontSizeRatio));
            const itemSubLabelPreferredSize = Math.max(7, Math.round(cardWidth * GAME_INPUT_SELECTION_OVERLAY.itemSubLabelFontSizeRatio));

            const totalGridWidth = (columnCount * cardWidth) + ((columnCount - 1) * horizontalGap);
            const totalGridHeight = (rowCount * cardHeight) + ((rowCount - 1) * verticalGap);
            const startX = panelX - Math.round(totalGridWidth / 2) + Math.round(cardWidth / 2);
            const startY = gridTopY + Math.max(0, Math.round((availableHeight - totalGridHeight) / 2)) + Math.round(cardHeight / 2);

            cards.forEach((card, index) => {
                const row = Math.floor(index / columnCount);
                const col = index % columnCount;
                const x = startX + (col * (cardWidth + horizontalGap));
                const y = startY + (row * (cardHeight + verticalGap));
                const normalizedClassLabel = this.normalizeOverlayLabel(card.cardClassLabel);
                const normalizedTypeLabel = this.normalizeOverlayLabel(card.cardTypeLabel);

                const body = this.scene.add.rectangle(0, 0, cardWidth, cardHeight, card.cardColor, 1)
                    .setStrokeStyle(3, 0xffffff, 0.95);

                const classLabelLayout = fitBitmapTextToMultiLine({
                    scene: this.scene,
                    font: 'minogram',
                    text: normalizedClassLabel,
                    preferredSize: Math.min(cardLabelFontSize, itemLabelPreferredSize),
                    minSize: 7,
                    maxWidth: itemTextMaxWidth,
                    maxLines: 3
                });
                const idText = this.scene.add.bitmapText(
                    0,
                    -Math.round(cardHeight * 0.2),
                    'minogram',
                    classLabelLayout.text,
                    classLabelLayout.fontSize
                ).setOrigin(0.5).setCenterAlign();

                const typeLabelLayout = fitBitmapTextToMultiLine({
                    scene: this.scene,
                    font: 'minogram',
                    text: normalizedTypeLabel,
                    preferredSize: Math.min(cardSubLabelFontSize, itemSubLabelPreferredSize),
                    minSize: 6,
                    maxWidth: itemTextMaxWidth,
                    maxLines: 2
                });
                const typeText = this.scene.add.bitmapText(
                    0,
                    Math.round(cardHeight * 0.23),
                    'minogram',
                    typeLabelLayout.text,
                    typeLabelLayout.fontSize
                ).setOrigin(0.5).setCenterAlign();

                const cardContainer = this.scene.add.container(x, y, [body, idText, typeText])
                    .setDepth(overlayDepth + 1);

                body.setInteractive({ useHandCursor: card.isKnownCard === true });
                body.on('pointerdown', () => {
                    cancelTimeoutFromInteraction();
                    this.setRevealExpandedCard(cardContainer);
                    if (card.isKnownCard && onCardClick) {
                        onCardClick(card.id);
                    }
                });

                this.activeObjects.push(cardContainer);
            });
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

        const countdownFrameSize = closeButtonSize + 8;
        const timeoutFrame = this.scene.add.graphics().setDepth(overlayDepth + 4);
        this.drawSquareCountdownFrame(timeoutFrame, closeX, closeY, countdownFrameSize, 1);
        this.activeCountdownFrame = timeoutFrame;

        let closed = false;

        const close = () => {
            if (closed) {
                return;
            }
            closed = true;
            this.stopActiveOverlay();
            onClose();
        };

        closeButton.on('pointerdown', close);

        if (timeoutSeconds !== null && Number.isFinite(timeoutSeconds) && timeoutSeconds >= 0) {
            const timeoutMs = Math.max(0, Math.round(timeoutSeconds * 1000));
            const countdownState = { remaining: 1 };
            this.activeCountdownTween = this.scene.tweens.add({
                targets: countdownState,
                remaining: 0,
                duration: timeoutMs,
                ease: 'Linear',
                onUpdate: () => {
                    this.drawSquareCountdownFrame(timeoutFrame, closeX, closeY, countdownFrameSize, countdownState.remaining);
                },
                onComplete: () => {
                    this.drawSquareCountdownFrame(timeoutFrame, closeX, closeY, countdownFrameSize, 0);
                }
            });
            this.activeTimer = this.scene.time.delayedCall(timeoutMs, close);
        }
        else {
            timeoutFrame.setVisible(false);
        }

        this.activeObjects.push(closeButton, closeLabel, timeoutFrame);
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
        const overlayDepth = Math.max(GAME_OVERLAY_DEPTHS.overlayBase, this.inputLockOverlay.depth + 1);
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
