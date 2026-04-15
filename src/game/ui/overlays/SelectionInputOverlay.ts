import { Scene } from 'phaser';
import { GAME_INPUT_OVERLAY_HEADER_LAYOUT, GAME_INPUT_SELECTION_OVERLAY } from '../../config';
import { fitBitmapTextToSingleLine } from './bitmapTextFit';

type SelectionSubmitCallback = (orderedSelections: string[]) => void;
type SelectionCardClickCallback = (cardId: string) => void;
type SelectionBackgroundClickCallback = () => void;

export type SelectionOverlayItem = {
    id: string;
    isCard: boolean;
    selectable: boolean;
    cardColor?: number;
    cardClassLabel?: string;
    cardTypeLabel?: string;
};

type SelectionItemUi = {
    id: string;
    isCard: boolean;
    selectable: boolean;
    container: Phaser.GameObjects.Container;
    body: Phaser.GameObjects.Rectangle;
    label: Phaser.GameObjects.BitmapText;
    subLabel?: Phaser.GameObjects.BitmapText;
    assignmentText: Phaser.GameObjects.BitmapText;
};

export class SelectionInputOverlay
{
    private scene: Scene;
    private inputLockOverlay: Phaser.GameObjects.Rectangle;
    private selectionItemsUi: SelectionItemUi[];
    private selectionBackdrop: Phaser.GameObjects.Rectangle | null;
    private selectionNoneUi: SelectionItemUi | null;
    private selectionNumberButtons: Array<{ index: number; body: Phaser.GameObjects.Rectangle; label: Phaser.GameObjects.BitmapText }>;
    private selectionSubmitButton: { body: Phaser.GameObjects.Rectangle; label: Phaser.GameObjects.BitmapText } | null;
    private selectionHintText: Phaser.GameObjects.BitmapText | null;
    private selectionTitleText: Phaser.GameObjects.BitmapText | null;
    private selectionByIndex: Array<string | null>;
    private activeSelectionIndex: number | null;
    private selectionDirectSingleMode: boolean;
    private activeExpandedItemContainer: Phaser.GameObjects.Container | null;
    private allowRepeat: boolean;
    private allowNone: boolean;
    private onSelectionSubmit: SelectionSubmitCallback | null;
    private onSelectionCardClick: SelectionCardClickCallback | null;
    private onSelectionBackgroundClick: SelectionBackgroundClickCallback | null;
    private hintPreferredFontSize: number;

    constructor (scene: Scene, inputLockOverlay: Phaser.GameObjects.Rectangle)
    {
        this.scene = scene;
        this.inputLockOverlay = inputLockOverlay;
        this.selectionItemsUi = [];
        this.selectionBackdrop = null;
        this.selectionNoneUi = null;
        this.selectionNumberButtons = [];
        this.selectionSubmitButton = null;
        this.selectionHintText = null;
        this.selectionTitleText = null;
        this.selectionByIndex = [];
        this.activeSelectionIndex = null;
        this.selectionDirectSingleMode = false;
        this.activeExpandedItemContainer = null;
        this.allowRepeat = false;
        this.allowNone = false;
        this.onSelectionSubmit = null;
        this.onSelectionCardClick = null;
        this.onSelectionBackgroundClick = null;
        this.hintPreferredFontSize = GAME_INPUT_SELECTION_OVERLAY.hintFontSizeMin;
        this.hintPreferredFontSize = GAME_INPUT_SELECTION_OVERLAY.hintFontSizeMin;
    }

    hasActiveOverlay (): boolean
    {
        return Boolean(
            this.selectionItemsUi.length > 0 ||
            this.selectionNoneUi ||
            this.selectionNumberButtons.length > 0 ||
            this.selectionSubmitButton ||
            this.selectionHintText ||
            this.selectionTitleText
        );
    }

    stopActiveOverlay (): void
    {
        this.selectionItemsUi.forEach((ui) => ui.container.destroy());
        this.selectionItemsUi = [];

        this.selectionBackdrop?.destroy();
        this.selectionBackdrop = null;

        this.selectionNoneUi?.container.destroy();
        this.selectionNoneUi = null;

        this.selectionNumberButtons.forEach((button) => {
            button.body.destroy();
            button.label.destroy();
        });
        this.selectionNumberButtons = [];

        if (this.selectionSubmitButton) {
            this.selectionSubmitButton.body.destroy();
            this.selectionSubmitButton.label.destroy();
            this.selectionSubmitButton = null;
        }

        this.selectionHintText?.destroy();
        this.selectionHintText = null;

        this.selectionTitleText?.destroy();
        this.selectionTitleText = null;

        this.selectionByIndex = [];
        this.activeSelectionIndex = null;
        this.selectionDirectSingleMode = false;
        this.activeExpandedItemContainer = null;
        this.allowRepeat = false;
        this.allowNone = false;
        this.onSelectionSubmit = null;
        this.onSelectionCardClick = null;
        this.onSelectionBackgroundClick = null;
    }

    start (
        items: SelectionOverlayItem[],
        numberOfSelections: number,
        allowRepeat: boolean,
        allowNone: boolean,
        topMessage: string,
        onSubmit: SelectionSubmitCallback,
        onCardClick?: SelectionCardClickCallback,
        onBackgroundClick?: SelectionBackgroundClickCallback
    ): void
    {
        this.stopActiveOverlay();

        this.allowRepeat = allowRepeat;
        this.allowNone = allowNone;
        this.selectionByIndex = Array.from({ length: numberOfSelections }, () => null);
        this.selectionDirectSingleMode = numberOfSelections === 1;
        this.onSelectionSubmit = onSubmit;
        this.onSelectionCardClick = onCardClick ?? null;
        this.onSelectionBackgroundClick = onBackgroundClick ?? null;

        const overlayDepth = this.inputLockOverlay.depth + 5;

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
            this.setExpandedItemContainer(null);
            if (this.onSelectionBackgroundClick) {
                this.onSelectionBackgroundClick();
            }
        });
        this.selectionBackdrop = clickBackdrop;
        const cardWidth = Math.max(GAME_INPUT_SELECTION_OVERLAY.cardWidthMin, Math.round(this.scene.scale.width * GAME_INPUT_SELECTION_OVERLAY.cardWidthRatio));
        const cardHeight = Math.round(cardWidth * GAME_INPUT_SELECTION_OVERLAY.cardHeightRatio);
        const titleFontSize = Math.max(GAME_INPUT_SELECTION_OVERLAY.titleFontSizeMin, Math.round(cardWidth * GAME_INPUT_SELECTION_OVERLAY.titleFontSizeRatio));
        const fittedTitleFontSize = fitBitmapTextToSingleLine({
            scene: this.scene,
            font: 'minogram',
            text: topMessage,
            preferredSize: titleFontSize,
            minSize: 10,
            maxWidth: Math.round(this.scene.scale.width * 0.92)
        });
        const hintFontSize = Math.max(GAME_INPUT_SELECTION_OVERLAY.hintFontSizeMin, Math.round(cardWidth * GAME_INPUT_SELECTION_OVERLAY.hintFontSizeRatio));
            this.hintPreferredFontSize = hintFontSize;
        const itemLabelFontSize = Math.max(GAME_INPUT_SELECTION_OVERLAY.itemLabelFontSizeMin, Math.round(cardWidth * GAME_INPUT_SELECTION_OVERLAY.itemLabelFontSizeRatio));
        const itemSubLabelFontSize = Math.max(GAME_INPUT_SELECTION_OVERLAY.itemSubLabelFontSizeMin, Math.round(cardWidth * GAME_INPUT_SELECTION_OVERLAY.itemSubLabelFontSizeRatio));
        const assignmentFontSize = Math.max(GAME_INPUT_SELECTION_OVERLAY.assignmentFontSizeMin, Math.round(cardWidth * GAME_INPUT_SELECTION_OVERLAY.assignmentFontSizeRatio));
        const numberLabelFontSize = Math.max(GAME_INPUT_SELECTION_OVERLAY.numberLabelFontSizeMin, Math.round(cardWidth * GAME_INPUT_SELECTION_OVERLAY.numberLabelFontSizeRatio));
        const submitLabelFontSize = Math.max(GAME_INPUT_SELECTION_OVERLAY.submitLabelFontSizeMin, Math.round(cardWidth * GAME_INPUT_SELECTION_OVERLAY.submitLabelFontSizeRatio));
        const itemTextMaxWidth = cardWidth - GAME_INPUT_SELECTION_OVERLAY.itemTextMaxWidthPadding;
        const hintMessage = this.selectionDirectSingleMode
            ? 'Click item, then submit'
            : 'Select a number, click item, click number again to clear';
        const fittedHintFontSize = fitBitmapTextToSingleLine({
            scene: this.scene,
            font: 'minogram',
            text: hintMessage,
            preferredSize: hintFontSize,
            minSize: 10,
            maxWidth: Math.round(this.scene.scale.width * 0.92)
        });
        const startY = Math.round(this.scene.scale.height * GAME_INPUT_SELECTION_OVERLAY.startYRatio);
        const titleGap = Math.max(
            GAME_INPUT_OVERLAY_HEADER_LAYOUT.messageGapMin,
            Math.round(this.scene.scale.height * GAME_INPUT_OVERLAY_HEADER_LAYOUT.messageGapRatio)
        );
        const rowGap = Math.max(GAME_INPUT_SELECTION_OVERLAY.rowGapMin, Math.round(this.scene.scale.height * GAME_INPUT_SELECTION_OVERLAY.rowGapRatio));
        const rowSpacing = Math.max(GAME_INPUT_SELECTION_OVERLAY.rowSpacingMin, Math.round(this.scene.scale.width * GAME_INPUT_SELECTION_OVERLAY.rowSpacingRatio));
        const totalWidth = (items.length * cardWidth) + (Math.max(0, items.length - 1) * rowSpacing);
        const startX = Math.round((this.scene.scale.width - totalWidth) / 2) + Math.round(cardWidth / 2);
        const displayRowY = startY;

        this.selectionTitleText = this.scene.add.bitmapText(
            this.scene.scale.width / 2,
            displayRowY - titleGap,
            'minogram',
            topMessage,
            fittedTitleFontSize
        )
            .setOrigin(0.5)
            .setDepth(overlayDepth);

        const makeItemUi = (item: SelectionOverlayItem, centerX: number, centerY: number): SelectionItemUi => {
            const container = this.scene.add.container(centerX, centerY).setDepth(overlayDepth);

            const fillColor = item.selectable
                ? (item.isCard ? (item.cardColor ?? 0x3a3a3a) : 0x1f2937)
                : 0x4b5563;
            const fillAlpha = item.selectable ? 1 : 0.6;
            const body = this.scene.add.rectangle(0, 0, cardWidth, cardHeight, fillColor, fillAlpha)
                .setStrokeStyle(3, 0xffffff, 1)
                .setInteractive({ useHandCursor: item.selectable });

            const primaryLabel = item.isCard ? (item.cardClassLabel ?? item.id) : item.id;
            const label = this.scene.add.bitmapText(0, -Math.round(cardHeight * GAME_INPUT_SELECTION_OVERLAY.itemLabelYOffsetRatio), 'minogram', primaryLabel, itemLabelFontSize)
                .setOrigin(0.5)
                .setMaxWidth(itemTextMaxWidth);
            label.setFontSize(fitBitmapTextToSingleLine({
                scene: this.scene,
                font: 'minogram',
                text: primaryLabel,
                preferredSize: itemLabelFontSize,
                minSize: 9,
                maxWidth: itemTextMaxWidth
            }));
            if (!item.selectable) {
                label.setTint(0xcbd5e1);
            }

            const subLabel = item.isCard
                ? this.scene.add.bitmapText(
                    0,
                    Math.round(cardHeight * GAME_INPUT_SELECTION_OVERLAY.itemSubLabelYOffsetRatio),
                    'minogram',
                    `${item.cardTypeLabel ?? 'CARD'} | ${item.id}`,
                    itemSubLabelFontSize
                )
                    .setOrigin(0.5)
                    .setMaxWidth(itemTextMaxWidth)
                : undefined;
            if (subLabel) {
                subLabel.setFontSize(fitBitmapTextToSingleLine({
                    scene: this.scene,
                    font: 'minogram',
                    text: `${item.cardTypeLabel ?? 'CARD'} | ${item.id}`,
                    preferredSize: itemSubLabelFontSize,
                    minSize: 8,
                    maxWidth: itemTextMaxWidth
                }));
            }
            if (subLabel && !item.selectable) {
                subLabel.setTint(0xcbd5e1);
            }

            const assignmentText = this.scene.add.bitmapText(0, Math.round(cardHeight * GAME_INPUT_SELECTION_OVERLAY.assignmentLabelYOffsetRatio), 'minogram', item.selectable ? '-' : 'X', assignmentFontSize)
                .setOrigin(0.5)
                .setTint(item.selectable ? 0xfff3b0 : 0x94a3b8);

            container.add([body, label, assignmentText]);
            if (subLabel) {
                container.add(subLabel);
            }

            body.on('pointerdown', () => {
                if (item.isCard) {
                    this.setExpandedItemContainer(container);
                }

                if (item.isCard && this.onSelectionCardClick) {
                    this.onSelectionCardClick(item.id);
                }

                if (!item.selectable) {
                    this.setHintText('This item is display-only');
                    return;
                }
                this.assignActiveIndexToTarget(item.id);
            });

            return {
                id: item.id,
                isCard: item.isCard,
                selectable: item.selectable,
                container,
                body,
                label,
                subLabel,
                assignmentText
            };
        };

        items.forEach((item, index) => {
            const x = startX + (index * (cardWidth + rowSpacing));
            this.selectionItemsUi.push(makeItemUi(item, x, displayRowY));
        });

        let nextRowY = displayRowY + cardHeight + (rowGap * GAME_INPUT_SELECTION_OVERLAY.noneRowGapMultiplier);

        if (allowNone) {
            this.selectionNoneUi = makeItemUi(
                { id: 'none', isCard: false, selectable: true },
                this.scene.scale.width / 2,
                nextRowY
            );
            this.selectionNoneUi.label.setText('NONE');
            nextRowY += cardHeight + (rowGap * GAME_INPUT_SELECTION_OVERLAY.numbersRowGapMultiplier);
        }
        else {
            nextRowY += rowGap * GAME_INPUT_SELECTION_OVERLAY.numbersRowGapMultiplier;
        }

        this.selectionHintText = this.scene.add.bitmapText(
            this.scene.scale.width / 2,
            nextRowY,
            'minogram',
            hintMessage,
            fittedHintFontSize
        )
            .setOrigin(0.5)
            .setDepth(overlayDepth);

        const numbersY = this.selectionHintText.y + (rowGap * GAME_INPUT_SELECTION_OVERLAY.numbersRowGapMultiplier);
        const numberButtonSize = Math.max(GAME_INPUT_SELECTION_OVERLAY.numberButtonSizeMin, Math.round(this.scene.scale.width * GAME_INPUT_SELECTION_OVERLAY.numberButtonSizeRatio));
        const numberGap = Math.max(GAME_INPUT_SELECTION_OVERLAY.numberButtonGapMin, Math.round(numberButtonSize * GAME_INPUT_SELECTION_OVERLAY.numberButtonGapRatio));
        let submitY = numbersY;

        if (!this.selectionDirectSingleMode) {
            const numbersTotalWidth = (numberOfSelections * numberButtonSize) + (Math.max(0, numberOfSelections - 1) * numberGap);
            const numbersStartX = Math.round((this.scene.scale.width - numbersTotalWidth) / 2) + Math.round(numberButtonSize / 2);

            for (let i = 0; i < numberOfSelections; i += 1) {
                const x = numbersStartX + (i * (numberButtonSize + numberGap));
                const body = this.scene.add.rectangle(x, numbersY, numberButtonSize, numberButtonSize, 0x0f172a, 0.96)
                    .setStrokeStyle(2, 0xffffff, 0.7)
                    .setDepth(overlayDepth)
                    .setInteractive({ useHandCursor: true });
                const label = this.scene.add.bitmapText(x, numbersY, 'minogram', String(i), numberLabelFontSize)
                    .setOrigin(0.5)
                    .setDepth(overlayDepth + 1);

                body.on('pointerdown', () => {
                    if (this.activeSelectionIndex === i) {
                        this.selectionByIndex[i] = null;
                        this.activeSelectionIndex = null;
                        this.selectionHintText?.setText(`Cleared slot ${i}`);
                        this.refreshSelectionOverlayUi();
                        return;
                    }

                    this.activeSelectionIndex = i;
                    this.refreshSelectionOverlayUi();
                });

                this.selectionNumberButtons.push({ index: i, body, label });
            }

            submitY = numbersY + numberButtonSize + (rowGap * GAME_INPUT_SELECTION_OVERLAY.submitRowGapMultiplier);
        }

        const submitWidth = Math.max(GAME_INPUT_SELECTION_OVERLAY.submitWidthMin, Math.round(this.scene.scale.width * GAME_INPUT_SELECTION_OVERLAY.submitWidthRatio));
        const submitHeight = Math.max(GAME_INPUT_SELECTION_OVERLAY.submitHeightMin, Math.round(this.scene.scale.height * GAME_INPUT_SELECTION_OVERLAY.submitHeightRatio));
        const submitBody = this.scene.add.rectangle(this.scene.scale.width / 2, submitY, submitWidth, submitHeight, 0x334155, 0.75)
            .setStrokeStyle(2, 0xffffff, 0.5)
            .setDepth(overlayDepth)
            .setInteractive({ useHandCursor: true });
        const submitLabel = this.scene.add.bitmapText(this.scene.scale.width / 2, submitY, 'minogram', 'SUBMIT', submitLabelFontSize)
            .setOrigin(0.5)
            .setDepth(overlayDepth + 1);

        submitBody.on('pointerdown', () => {
            if (!this.isSelectionComplete()) {
                return;
            }

            const orderedSelections = this.selectionByIndex.map((entry) => entry ?? 'none');
            const callback = this.onSelectionSubmit;
            this.stopActiveOverlay();
            if (callback) {
                callback(orderedSelections);
            }
        });

        this.selectionSubmitButton = { body: submitBody, label: submitLabel };
        this.refreshSelectionOverlayUi();
    }

    private setExpandedItemContainer (container: Phaser.GameObjects.Container | null): void
    {
        if (this.activeExpandedItemContainer) {
            this.activeExpandedItemContainer.setScale(1, 1);
        }

        this.activeExpandedItemContainer = container;

        if (this.activeExpandedItemContainer) {
            this.activeExpandedItemContainer.setScale(1.08, 1.08);
        }
    }

    private assignActiveIndexToTarget (targetId: string): void
    {
        if (this.selectionDirectSingleMode) {
            if (this.selectionByIndex[0] === targetId) {
                this.selectionByIndex[0] = null;
                this.refreshSelectionOverlayUi();
                return;
            }

            this.selectionByIndex[0] = targetId;
            this.refreshSelectionOverlayUi();
            return;
        }

        if (this.activeSelectionIndex === null) {
            this.setHintText('Select a number first');
            return;
        }

        if (!this.allowNone && targetId === 'none') {
            return;
        }

        if (!this.allowRepeat) {
            const selectedElsewhere = this.selectionByIndex.some((entry, index) => entry === targetId && index !== this.activeSelectionIndex);
            if (selectedElsewhere) {
                this.setHintText('Repeat not allowed for this selection');
                return;
            }
        }

        this.selectionByIndex[this.activeSelectionIndex] = targetId;
        this.activeSelectionIndex = null;
        this.refreshSelectionOverlayUi();
    }

    private isSelectionComplete (): boolean
    {
        return this.selectionByIndex.length > 0 && this.selectionByIndex.every((entry) => entry !== null);
    }

    private refreshSelectionOverlayUi (): void
    {
        const assignmentsByItemId = new Map<string, number[]>();
        this.selectionByIndex.forEach((itemId, index) => {
            if (!itemId) {
                return;
            }

            if (!assignmentsByItemId.has(itemId)) {
                assignmentsByItemId.set(itemId, []);
            }
            assignmentsByItemId.get(itemId)?.push(index);
        });

        const updateItemUi = (ui: SelectionItemUi) => {
            if (!ui.selectable) {
                ui.assignmentText.setText('X');
                ui.body.setStrokeStyle(3, 0x94a3b8, 1);
                return;
            }

            const assigned = assignmentsByItemId.get(ui.id) ?? [];
            ui.assignmentText.setText(assigned.length > 0 ? assigned.join(',') : '-');
            ui.body.setStrokeStyle(3, assigned.length > 0 ? 0xffe066 : 0xffffff, 1);
        };

        this.selectionItemsUi.forEach(updateItemUi);
        if (this.selectionNoneUi) {
            updateItemUi(this.selectionNoneUi);
        }

        this.selectionNumberButtons.forEach((button) => {
            const assignedTarget = this.selectionByIndex[button.index];
            if (this.activeSelectionIndex === button.index) {
                button.body.setFillStyle(0x3b82f6, 0.95);
            }
            else if (assignedTarget) {
                button.body.setFillStyle(0x15803d, 0.95);
            }
            else {
                button.body.setFillStyle(0x0f172a, 0.96);
            }
        });

        const complete = this.isSelectionComplete();
        if (this.selectionSubmitButton) {
            this.selectionSubmitButton.body.setFillStyle(complete ? 0x0f766e : 0x334155, complete ? 0.95 : 0.75);
            this.selectionSubmitButton.body.setStrokeStyle(2, 0xffffff, complete ? 0.95 : 0.5);
        }

        if (this.selectionHintText) {
            const assignedCount = this.selectionByIndex.filter((entry) => entry !== null).length;
            this.setHintText(`Assigned: ${assignedCount}/${this.selectionByIndex.length}`);
        }
    }

    private setHintText (text: string): void
    {
        if (!this.selectionHintText) {
            return;
        }

        this.selectionHintText.setText(text);
        const fittedSize = fitBitmapTextToSingleLine({
            scene: this.scene,
            font: 'minogram',
            text,
            preferredSize: this.hintPreferredFontSize,
            minSize: 10,
            maxWidth: Math.round(this.scene.scale.width * 0.92)
        });
        this.selectionHintText.setFontSize(fittedSize);
    }
}
