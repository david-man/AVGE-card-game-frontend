import { Scene } from 'phaser';
import { GAME_INPUT_OVERLAY_HEADER_LAYOUT, GAME_INPUT_SELECTION_OVERLAY, GAME_OVERLAY_DEPTHS } from '../../config';
import { fitTextToMultiLine, fitTextToSingleLine } from './textFit';

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
    label: Phaser.GameObjects.Text;
    subLabel?: Phaser.GameObjects.Text;
    assignmentContainer: Phaser.GameObjects.Container;
    assignmentObjects: Phaser.GameObjects.GameObject[];
};

export class SelectionInputOverlay
{
    private scene: Scene;
    private inputLockOverlay: Phaser.GameObjects.Rectangle;
    private selectionItemsUi: SelectionItemUi[];
    private selectionBackdrop: Phaser.GameObjects.Rectangle | null;
    private selectionSubmitButton: { body: Phaser.GameObjects.Rectangle; label: Phaser.GameObjects.Text } | null;
    private selectionHintText: Phaser.GameObjects.Text | null;
    private selectionTitleText: Phaser.GameObjects.Text | null;
    private selectionByIndex: Array<string | null>;
    private activeExpandedItemContainer: Phaser.GameObjects.Container | null;
    private allowRepeat: boolean;
    private allowNone: boolean;
    private onSelectionSubmit: SelectionSubmitCallback | null;
    private onSelectionCardClick: SelectionCardClickCallback | null;
    private onSelectionBackgroundClick: SelectionBackgroundClickCallback | null;
    private hintPreferredFontSize: number;
    private assignmentChipFontSize: number;

    constructor (scene: Scene, inputLockOverlay: Phaser.GameObjects.Rectangle)
    {
        this.scene = scene;
        this.inputLockOverlay = inputLockOverlay;
        this.selectionItemsUi = [];
        this.selectionBackdrop = null;
        this.selectionSubmitButton = null;
        this.selectionHintText = null;
        this.selectionTitleText = null;
        this.selectionByIndex = [];
        this.activeExpandedItemContainer = null;
        this.allowRepeat = false;
        this.allowNone = false;
        this.onSelectionSubmit = null;
        this.onSelectionCardClick = null;
        this.onSelectionBackgroundClick = null;
        this.hintPreferredFontSize = Math.max(
            GAME_INPUT_OVERLAY_HEADER_LAYOUT.hintFontSizeMin,
            GAME_INPUT_SELECTION_OVERLAY.hintFontSizeMin
        );
        this.assignmentChipFontSize = GAME_INPUT_SELECTION_OVERLAY.assignmentFontSizeMin;
    }

    hasActiveOverlay (): boolean
    {
        return Boolean(
            this.selectionItemsUi.length > 0 ||
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
        this.activeExpandedItemContainer = null;
        this.allowRepeat = false;
        this.allowNone = false;
        this.onSelectionSubmit = null;
        this.onSelectionCardClick = null;
        this.onSelectionBackgroundClick = null;
        this.assignmentChipFontSize = GAME_INPUT_SELECTION_OVERLAY.assignmentFontSizeMin;
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
        this.onSelectionSubmit = onSubmit;
        this.onSelectionCardClick = onCardClick ?? null;
        this.onSelectionBackgroundClick = onBackgroundClick ?? null;

        const overlayDepth = Math.max(GAME_OVERLAY_DEPTHS.overlayBase, this.inputLockOverlay.depth + 1);

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
        const fittedTitleFontSize = fitTextToSingleLine({
            scene: this.scene,
            text: topMessage,
            preferredSize: titleFontSize,
            minSize: 10,
            maxWidth: Math.round(this.scene.scale.width * 0.92)
        });
        const hintFontSize = Math.max(
            GAME_INPUT_OVERLAY_HEADER_LAYOUT.hintFontSizeMin,
            Math.round(this.scene.scale.width * GAME_INPUT_OVERLAY_HEADER_LAYOUT.hintFontSizeRatio),
            GAME_INPUT_SELECTION_OVERLAY.hintFontSizeMin,
            Math.round(cardWidth * GAME_INPUT_SELECTION_OVERLAY.hintFontSizeRatio)
        );
        this.hintPreferredFontSize = hintFontSize;
        const itemLabelFontSize = Math.max(GAME_INPUT_SELECTION_OVERLAY.itemLabelFontSizeMin, Math.round(cardWidth * GAME_INPUT_SELECTION_OVERLAY.itemLabelFontSizeRatio));
        const itemSubLabelFontSize = Math.max(GAME_INPUT_SELECTION_OVERLAY.itemSubLabelFontSizeMin, Math.round(cardWidth * GAME_INPUT_SELECTION_OVERLAY.itemSubLabelFontSizeRatio));
        const assignmentFontSize = Math.max(9, Math.round(cardWidth * GAME_INPUT_SELECTION_OVERLAY.assignmentFontSizeRatio));
        const assignmentChipHeight = Math.max(14, assignmentFontSize + 5);
        const assignmentAnchorY = Math.round((cardHeight / 2) - (assignmentChipHeight / 2));
        const submitLabelFontSize = Math.max(GAME_INPUT_SELECTION_OVERLAY.submitLabelFontSizeMin, Math.round(cardWidth * GAME_INPUT_SELECTION_OVERLAY.submitLabelFontSizeRatio));
        const itemTextMaxWidth = cardWidth - GAME_INPUT_SELECTION_OVERLAY.itemTextMaxWidthPadding;
        const hintMessage = allowNone
            ? 'Click items to fill slots in order. Submit auto-fills missing slots as none.'
            : 'Click items to fill slots in order. Click a {n} chip to remove that slot.';
        const fittedHintFontSize = fitTextToSingleLine({
            scene: this.scene,
            text: hintMessage,
            preferredSize: hintFontSize,
            minSize: GAME_INPUT_OVERLAY_HEADER_LAYOUT.hintFitMinSize,
            maxWidth: Math.round(this.scene.scale.width * 0.92)
        });
        const startY = Math.round(this.scene.scale.height * GAME_INPUT_SELECTION_OVERLAY.startYRatio);
        const titleGap = Math.max(
            GAME_INPUT_OVERLAY_HEADER_LAYOUT.messageGapMin,
            Math.round(this.scene.scale.height * GAME_INPUT_OVERLAY_HEADER_LAYOUT.messageGapRatio)
        );
        const rowGap = Math.max(GAME_INPUT_SELECTION_OVERLAY.rowGapMin, Math.round(this.scene.scale.height * GAME_INPUT_SELECTION_OVERLAY.rowGapRatio));
        const rowSpacing = Math.max(GAME_INPUT_SELECTION_OVERLAY.rowSpacingMin, Math.round(this.scene.scale.width * GAME_INPUT_SELECTION_OVERLAY.rowSpacingRatio));

        const displayItems = items.map((item) => {
            const isNoneLabel = item.id.trim().toLowerCase() === 'none';
            if (allowNone && isNoneLabel && !item.selectable) {
                return {
                    ...item,
                    selectable: true
                };
            }

            return item;
        });

        const maxColumnsByWidth = Math.max(1, Math.floor((this.scene.scale.width + rowSpacing) / (cardWidth + rowSpacing)));
        const columnCount = Math.max(1, Math.min(displayItems.length, maxColumnsByWidth));
        const rowCount = Math.max(1, Math.ceil(displayItems.length / columnCount));
        const displayRowY = startY;

        this.selectionTitleText = this.scene.add.text(this.scene.scale.width / 2, displayRowY, topMessage).setFontSize(fittedTitleFontSize)
            .setOrigin(0.5)
            .setDepth(overlayDepth);

        const displayRowTopY = displayRowY - Math.round(cardHeight / 2);
        const titleOffset = Math.round(this.selectionTitleText.height / 2) + titleGap;
        this.selectionTitleText.setY(displayRowTopY - titleOffset);

        const makeItemUi = (item: SelectionOverlayItem, centerX: number, centerY: number): SelectionItemUi => {
            const container = this.scene.add.container(centerX, centerY).setDepth(overlayDepth);

            const fillColor = item.selectable
                ? (item.isCard ? (item.cardColor ?? 0x3a3a3a) : 0x1f2937)
                : 0x4b5563;
            const fillAlpha = item.selectable ? 1 : 0.6;
            const body = this.scene.add.rectangle(0, 0, cardWidth, cardHeight, fillColor, fillAlpha)
                .setStrokeStyle(3, 0xffffff, 1)
                .setInteractive({ useHandCursor: item.selectable });

            const isNoneOption = !item.isCard && item.id.trim().toLowerCase() === 'none';
            const primaryLabel = isNoneOption
                ? 'None'
                : (item.isCard ? (item.cardClassLabel ?? item.id) : item.id);
            const primaryLabelLayout = fitTextToMultiLine({
                scene: this.scene,
                text: primaryLabel,
                preferredSize: itemLabelFontSize,
                minSize: 9,
                maxWidth: itemTextMaxWidth,
                maxLines: item.isCard ? 3 : (isNoneOption ? 1 : 5)
            });
            const label = this.scene.add.text(0, -Math.round(cardHeight * GAME_INPUT_SELECTION_OVERLAY.itemLabelYOffsetRatio), primaryLabelLayout.text).setFontSize(primaryLabelLayout.fontSize)
                .setOrigin(0.5);
            if (!item.selectable) {
                label.setTint(0xcbd5e1);
            }

            const rawTypeLabel = item.cardTypeLabel ?? 'CARD';
            const subLabelText = rawTypeLabel.split('|')[0].trim() || 'CARD';
            const subLabelLayout = fitTextToMultiLine({
                scene: this.scene,
                text: subLabelText,
                preferredSize: itemSubLabelFontSize,
                minSize: 8,
                maxWidth: itemTextMaxWidth,
                maxLines: 3
            });
            const subLabel = item.isCard
                ? this.scene.add.text(0, Math.round(cardHeight * GAME_INPUT_SELECTION_OVERLAY.itemSubLabelYOffsetRatio), subLabelLayout.text).setFontSize(subLabelLayout.fontSize)
                    .setOrigin(0.5)
                : undefined;
            if (subLabel && !item.selectable) {
                subLabel.setTint(0xcbd5e1);
            }

            const assignmentContainer = this.scene.add.container(
                0,
                assignmentAnchorY
            );

            container.add([body, label, assignmentContainer]);
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
                this.assignTargetToLowestUnassignedSlot(item.id);
            });

            return {
                id: item.id,
                isCard: item.isCard,
                selectable: item.selectable,
                container,
                body,
                label,
                subLabel,
                assignmentContainer,
                assignmentObjects: [],
            };
        };

        displayItems.forEach((item, index) => {
            const row = Math.floor(index / columnCount);
            const col = index % columnCount;
            const rowStartIndex = row * columnCount;
            const remainingInRow = displayItems.length - rowStartIndex;
            const itemsInRow = Math.min(columnCount, remainingInRow);
            const rowWidth = (itemsInRow * cardWidth) + (Math.max(0, itemsInRow - 1) * rowSpacing);
            const rowStartX = Math.round((this.scene.scale.width - rowWidth) / 2) + Math.round(cardWidth / 2);
            const x = rowStartX + (col * (cardWidth + rowSpacing));
            const y = displayRowY + (row * (cardHeight + rowGap));
            this.selectionItemsUi.push(makeItemUi(item, x, y));
        });

        const gridBottomY = displayRowY + ((rowCount - 1) * (cardHeight + rowGap)) + Math.round(cardHeight / 2);
        const nextRowY = gridBottomY + Math.round(cardHeight / 2) + (rowGap * GAME_INPUT_SELECTION_OVERLAY.numbersRowGapMultiplier);

        this.selectionHintText = this.scene.add.text(this.scene.scale.width / 2, nextRowY, hintMessage).setFontSize(fittedHintFontSize)
            .setOrigin(0.5)
            .setDepth(overlayDepth);

        const submitY = this.selectionHintText.y + (rowGap * GAME_INPUT_SELECTION_OVERLAY.submitRowGapMultiplier);

        const submitWidth = Math.max(GAME_INPUT_SELECTION_OVERLAY.submitWidthMin, Math.round(this.scene.scale.width * GAME_INPUT_SELECTION_OVERLAY.submitWidthRatio));
        const submitHeight = Math.max(GAME_INPUT_SELECTION_OVERLAY.submitHeightMin, Math.round(this.scene.scale.height * GAME_INPUT_SELECTION_OVERLAY.submitHeightRatio));
        const submitBody = this.scene.add.rectangle(this.scene.scale.width / 2, submitY, submitWidth, submitHeight, 0x334155, 0.75)
            .setStrokeStyle(2, 0xffffff, 0.5)
            .setDepth(overlayDepth)
            .setInteractive({ useHandCursor: true });
        const submitLabel = this.scene.add.text(this.scene.scale.width / 2, submitY, 'SUBMIT').setFontSize(submitLabelFontSize)
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

        this.assignmentChipFontSize = assignmentFontSize;
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

    private findLowestUnassignedSlotIndex (): number
    {
        for (let i = 0; i < this.selectionByIndex.length; i += 1) {
            if (this.selectionByIndex[i] === null) {
                return i;
            }
        }

        return -1;
    }

    private assignTargetToLowestUnassignedSlot (targetId: string): void
    {
        const nextSlotIndex = this.findLowestUnassignedSlotIndex();
        if (nextSlotIndex < 0) {
            this.setHintText('All slots are already assigned. Click a numbered chip to remove one first.');
            return;
        }

        const isNoneTarget = targetId.trim().toLowerCase() === 'none';
        if (!this.allowRepeat && !isNoneTarget) {
            const selectedElsewhere = this.selectionByIndex.some((entry) => entry === targetId);
            if (selectedElsewhere) {
                this.setHintText('Repeat is disabled for this selection query.');
                return;
            }
        }

        this.selectionByIndex[nextSlotIndex] = targetId;
        this.refreshSelectionOverlayUi();
    }

    private removeAssignmentIndex (index: number): void
    {
        if (index < 0 || index >= this.selectionByIndex.length) {
            return;
        }

        if (this.selectionByIndex[index] === null) {
            return;
        }

        this.selectionByIndex[index] = null;
        this.setHintText(`Removed slot ${index + 1} assignment.`);
        this.refreshSelectionOverlayUi();
    }

    private renderAssignmentChipsForItem (ui: SelectionItemUi, assignedIndexes: number[]): void
    {
        ui.assignmentObjects.forEach((object) => object.destroy());
        ui.assignmentObjects = [];

        const chipFontSize = Math.max(9, Math.floor(this.assignmentChipFontSize));

        if (!ui.selectable) {
            const blocked = this.scene.add.text(0, 0, 'X').setFontSize(chipFontSize)
                .setOrigin(0.5)
                .setTint(0x94a3b8);
            ui.assignmentContainer.add(blocked);
            ui.assignmentObjects.push(blocked);
            ui.body.setStrokeStyle(3, 0x94a3b8, 1);
            return;
        }

        if (assignedIndexes.length === 0) {
            const empty = this.scene.add.text(0, 0, '-').setFontSize(chipFontSize)
                .setOrigin(0.5)
                .setTint(0xfff3b0);
            ui.assignmentContainer.add(empty);
            ui.assignmentObjects.push(empty);
            ui.body.setStrokeStyle(3, 0xffffff, 1);
            return;
        }

        ui.body.setStrokeStyle(3, 0xffe066, 1);
        const chipGap = Math.max(2, Math.floor(chipFontSize * 0.55));
        const chipHeight = Math.max(14, chipFontSize + 5);
        const chipTexts = assignedIndexes.map((slotIndex) => `${slotIndex + 1}`);
        const chipWidths = chipTexts.map((text) => Math.max(18, (text.length * chipFontSize) - 2));
        const totalWidth = chipWidths.reduce((acc, width) => acc + width, 0) + (Math.max(0, chipWidths.length - 1) * chipGap);
        let cursor = -Math.floor(totalWidth / 2);

        for (let i = 0; i < chipTexts.length; i += 1) {
            const text = chipTexts[i];
            const slotIndex = assignedIndexes[i];
            const chipWidth = chipWidths[i];
            const chipCenterX = cursor + Math.floor(chipWidth / 2);

            const chipBody = this.scene.add.rectangle(chipCenterX, 0, chipWidth, chipHeight, 0x0f172a, 0)
                .setStrokeStyle(1, 0xffffff, 0.9)
                .setInteractive({ useHandCursor: true });
            chipBody.on('pointerdown', (_pointer: Phaser.Input.Pointer, _localX: number, _localY: number, event: Phaser.Types.Input.EventData) => {
                event.stopPropagation();
                this.removeAssignmentIndex(slotIndex);
            });

            const chipLabel = this.scene.add.text(chipCenterX, 0, text).setFontSize(chipFontSize)
                .setOrigin(0.5)
                .setTint(0xfff3b0);

            ui.assignmentContainer.add([chipBody, chipLabel]);
            ui.assignmentObjects.push(chipBody, chipLabel);

            cursor += chipWidth + chipGap;
        }
    }

    private isSelectionComplete (): boolean
    {
        if (this.selectionByIndex.length === 0) {
            return true;
        }

        if (this.allowNone) {
            return true;
        }

        return this.selectionByIndex.every((entry) => entry !== null);
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
            const assigned = assignmentsByItemId.get(ui.id) ?? [];
            this.renderAssignmentChipsForItem(ui, assigned);
        };

        this.selectionItemsUi.forEach(updateItemUi);

        const complete = this.isSelectionComplete();
        if (this.selectionSubmitButton) {
            this.selectionSubmitButton.body.setFillStyle(complete ? 0x0f766e : 0x334155, complete ? 0.95 : 0.75);
            this.selectionSubmitButton.body.setStrokeStyle(2, 0xffffff, complete ? 0.95 : 0.5);
        }

        if (this.selectionHintText) {
            const assignedCount = this.selectionByIndex.filter((entry) => entry !== null).length;
            const suffix = this.allowNone ? ' (incomplete allowed)' : '';
            this.setHintText(`Assigned: ${assignedCount}/${this.selectionByIndex.length}${suffix}`);
        }
    }

    private setHintText (text: string): void
    {
        if (!this.selectionHintText) {
            return;
        }

        this.selectionHintText.setText(text);
        const fittedSize = fitTextToSingleLine({
            scene: this.scene,
            text,
            preferredSize: this.hintPreferredFontSize,
            minSize: GAME_INPUT_OVERLAY_HEADER_LAYOUT.hintFitMinSize,
            maxWidth: Math.round(this.scene.scale.width * 0.92)
        });
        this.selectionHintText.setFontSize(fittedSize);
    }
}
