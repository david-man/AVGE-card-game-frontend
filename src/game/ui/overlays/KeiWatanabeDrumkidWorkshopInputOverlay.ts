import { Scene } from 'phaser';
import { GAME_INPUT_OVERLAY_HEADER_LAYOUT, GAME_INPUT_SELECTION_OVERLAY, GAME_OVERLAY_DEPTHS } from '../../config';
import { fitTextToSingleLine } from './textFit';

export type KeiWatanabeDrumkidWorkshopItem = {
    id: string;
    cardClassLabel: string;
    cardColor: number;
    cardTypeLabel: string;
    hasAtk1: boolean;
    hasAtk2: boolean;
};

type KeiSelectionSubmitCallback = (result: { cardId: string; attack: 'atk1' | 'atk2' }) => void;
type KeiCardClickCallback = (cardId: string) => void;
type KeiBackgroundClickCallback = () => void;

type KeiItemUi = {
    item: KeiWatanabeDrumkidWorkshopItem;
    container: Phaser.GameObjects.Container;
    body: Phaser.GameObjects.Rectangle;
};

export class KeiWatanabeDrumkidWorkshopInputOverlay
{
    private scene: Scene;
    private inputLockOverlay: Phaser.GameObjects.Rectangle;
    private backdrop: Phaser.GameObjects.Rectangle | null;
    private titleText: Phaser.GameObjects.Text | null;
    private hintText: Phaser.GameObjects.Text | null;
    private cardUis: KeiItemUi[];
    private selectedCardId: string | null;
    private selectedAttack: 'atk1' | 'atk2' | null;
    private atkButtons: Array<{ attack: 'atk1' | 'atk2'; body: Phaser.GameObjects.Rectangle; label: Phaser.GameObjects.Text }>;
    private submitButton: { body: Phaser.GameObjects.Rectangle; label: Phaser.GameObjects.Text } | null;
    private onSubmit: KeiSelectionSubmitCallback | null;
    private onCardClick: KeiCardClickCallback | null;
    private onBackgroundClick: KeiBackgroundClickCallback | null;
    private hintPreferredFontSize: number;

    constructor (scene: Scene, inputLockOverlay: Phaser.GameObjects.Rectangle)
    {
        this.scene = scene;
        this.inputLockOverlay = inputLockOverlay;
        this.backdrop = null;
        this.titleText = null;
        this.hintText = null;
        this.cardUis = [];
        this.selectedCardId = null;
        this.selectedAttack = null;
        this.atkButtons = [];
        this.submitButton = null;
        this.onSubmit = null;
        this.onCardClick = null;
        this.onBackgroundClick = null;
        this.hintPreferredFontSize = Math.max(
            GAME_INPUT_OVERLAY_HEADER_LAYOUT.hintFontSizeMin,
            GAME_INPUT_SELECTION_OVERLAY.hintFontSizeMin
        );
    }

    hasActiveOverlay (): boolean
    {
        return Boolean(this.backdrop || this.titleText || this.hintText || this.cardUis.length > 0 || this.atkButtons.length > 0 || this.submitButton);
    }

    stopActiveOverlay (): void
    {
        this.backdrop?.destroy();
        this.backdrop = null;

        this.titleText?.destroy();
        this.titleText = null;

        this.hintText?.destroy();
        this.hintText = null;

        this.cardUis.forEach((ui) => ui.container.destroy());
        this.cardUis = [];

        this.atkButtons.forEach((button) => {
            button.body.destroy();
            button.label.destroy();
        });
        this.atkButtons = [];

        if (this.submitButton) {
            this.submitButton.body.destroy();
            this.submitButton.label.destroy();
            this.submitButton = null;
        }

        this.selectedCardId = null;
        this.selectedAttack = null;
        this.onSubmit = null;
        this.onCardClick = null;
        this.onBackgroundClick = null;
        this.hintPreferredFontSize = Math.max(
            GAME_INPUT_OVERLAY_HEADER_LAYOUT.hintFontSizeMin,
            GAME_INPUT_SELECTION_OVERLAY.hintFontSizeMin
        );
    }

    start (
        items: KeiWatanabeDrumkidWorkshopItem[],
        topMessage: string,
        onSubmit: KeiSelectionSubmitCallback,
        onCardClick?: KeiCardClickCallback,
        onBackgroundClick?: KeiBackgroundClickCallback
    ): void
    {
        this.stopActiveOverlay();

        this.onSubmit = onSubmit;
        this.onCardClick = onCardClick ?? null;
        this.onBackgroundClick = onBackgroundClick ?? null;

        const overlayDepth = Math.max(GAME_OVERLAY_DEPTHS.overlayBase, this.inputLockOverlay.depth + 1);
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
        const itemTextMaxWidth = cardWidth - GAME_INPUT_SELECTION_OVERLAY.itemTextMaxWidthPadding;
        const hintDefaultMessage = 'Select 1 character card';
        const fittedHintFontSize = fitTextToSingleLine({
            scene: this.scene,
            text: hintDefaultMessage,
            preferredSize: hintFontSize,
            minSize: GAME_INPUT_OVERLAY_HEADER_LAYOUT.hintFitMinSize,
            maxWidth: Math.round(this.scene.scale.width * 0.92)
        });
        const startY = Math.round(this.scene.scale.height * GAME_INPUT_SELECTION_OVERLAY.startYRatio);
        const rowGap = Math.max(GAME_INPUT_SELECTION_OVERLAY.rowGapMin, Math.round(this.scene.scale.height * GAME_INPUT_SELECTION_OVERLAY.rowGapRatio));
        const rowSpacing = Math.max(GAME_INPUT_SELECTION_OVERLAY.rowSpacingMin, Math.round(this.scene.scale.width * GAME_INPUT_SELECTION_OVERLAY.rowSpacingRatio));
        const titleGap = Math.max(
            GAME_INPUT_OVERLAY_HEADER_LAYOUT.messageGapMin,
            Math.round(this.scene.scale.height * GAME_INPUT_OVERLAY_HEADER_LAYOUT.messageGapRatio)
        );

        this.backdrop = this.scene.add.rectangle(
            this.scene.scale.width / 2,
            this.scene.scale.height / 2,
            this.scene.scale.width,
            this.scene.scale.height,
            0x000000,
            0.001
        )
            .setDepth(overlayDepth - 1)
            .setInteractive({ useHandCursor: false });
        this.backdrop.on('pointerdown', () => {
            this.clearSelection();
            if (this.onBackgroundClick) {
                this.onBackgroundClick();
            }
        });

        this.titleText = this.scene.add.text(this.scene.scale.width / 2, startY, topMessage).setFontSize(fittedTitleFontSize)
            .setOrigin(0.5)
            .setDepth(overlayDepth);

        const cardRowTopY = startY - Math.round(cardHeight / 2);
        const titleOffset = Math.round(this.titleText.height / 2) + titleGap;
        this.titleText.setY(cardRowTopY - titleOffset);

        const totalWidth = (items.length * cardWidth) + (Math.max(0, items.length - 1) * rowSpacing);
        const startX = Math.round((this.scene.scale.width - totalWidth) / 2) + Math.round(cardWidth / 2);

        items.forEach((item, index) => {
            const x = startX + (index * (cardWidth + rowSpacing));
            const y = startY;
            const body = this.scene.add.rectangle(0, 0, cardWidth, cardHeight, item.cardColor, 1)
                .setStrokeStyle(3, 0xffffff, 1)
                .setInteractive({ useHandCursor: true });

            const idText = this.scene.add.text(0, -Math.round(cardHeight * 0.2), item.cardClassLabel).setFontSize(itemLabelFontSize)
                .setOrigin(0.5)
                .setWordWrapWidth(itemTextMaxWidth);
            idText.setFontSize(fitTextToSingleLine({
                scene: this.scene,
                text: item.cardClassLabel,
                preferredSize: itemLabelFontSize,
                minSize: 9,
                maxWidth: itemTextMaxWidth
            }));

            const typeText = this.scene.add.text(0, Math.round(cardHeight * 0.23), item.cardTypeLabel).setFontSize(itemSubLabelFontSize)
                .setOrigin(0.5)
                .setWordWrapWidth(itemTextMaxWidth);
            typeText.setFontSize(fitTextToSingleLine({
                scene: this.scene,
                text: item.cardTypeLabel,
                preferredSize: itemSubLabelFontSize,
                minSize: 8,
                maxWidth: itemTextMaxWidth
            }));

            const container = this.scene.add.container(x, y, [body, idText, typeText]).setDepth(overlayDepth);

            body.on('pointerdown', () => {
                this.selectedCardId = item.id;
                this.selectedAttack = null;
                this.onCardClick?.(item.id);
                this.refreshUi();
            });

            this.cardUis.push({ item, container, body });
        });

        this.hintText = this.scene.add.text(this.scene.scale.width / 2, startY + cardHeight + rowGap, hintDefaultMessage).setFontSize(fittedHintFontSize)
            .setOrigin(0.5)
            .setDepth(overlayDepth);

        const attackY = this.hintText.y + rowGap;
        const attackWidth = Math.max(80, Math.round(cardWidth * 0.58));
        const attackHeight = Math.max(34, Math.round(cardHeight * 0.2));
        const attackGap = Math.max(14, Math.round(attackWidth * 0.2));

        (['atk1', 'atk2'] as const).forEach((attack, index) => {
            const x = Math.round(this.scene.scale.width / 2) + ((index === 0 ? -1 : 1) * Math.round((attackWidth + attackGap) / 2));
            const body = this.scene.add.rectangle(x, attackY, attackWidth, attackHeight, 0x0f172a, 0.85)
                .setStrokeStyle(2, 0xffffff, 0.7)
                .setDepth(overlayDepth)
                .setInteractive({ useHandCursor: true })
                .setVisible(false);
            const label = this.scene.add.text(x, attackY, attack.toUpperCase()).setFontSize(Math.max(12, Math.round(hintFontSize * 0.9)))
                .setOrigin(0.5)
                .setDepth(overlayDepth + 1)
                .setVisible(false);

            body.on('pointerdown', () => {
                if (!body.visible) {
                    return;
                }
                this.selectedAttack = attack;
                this.refreshUi();
            });

            this.atkButtons.push({ attack, body, label });
        });

        const submitY = attackY + attackHeight + rowGap;
        const submitWidth = Math.max(GAME_INPUT_SELECTION_OVERLAY.submitWidthMin, Math.round(this.scene.scale.width * GAME_INPUT_SELECTION_OVERLAY.submitWidthRatio));
        const submitHeight = Math.max(GAME_INPUT_SELECTION_OVERLAY.submitHeightMin, Math.round(this.scene.scale.height * GAME_INPUT_SELECTION_OVERLAY.submitHeightRatio));
        const submitBody = this.scene.add.rectangle(this.scene.scale.width / 2, submitY, submitWidth, submitHeight, 0x334155, 0.75)
            .setStrokeStyle(2, 0xffffff, 0.5)
            .setDepth(overlayDepth)
            .setInteractive({ useHandCursor: true });
        const submitLabel = this.scene.add.text(this.scene.scale.width / 2, submitY, 'SUBMIT').setFontSize(Math.max(GAME_INPUT_SELECTION_OVERLAY.submitLabelFontSizeMin, Math.round(cardWidth * GAME_INPUT_SELECTION_OVERLAY.submitLabelFontSizeRatio)))
            .setOrigin(0.5)
            .setDepth(overlayDepth + 1);

        submitBody.on('pointerdown', () => {
            if (!this.selectedCardId || !this.selectedAttack) {
                return;
            }

            const callback = this.onSubmit;
            const result = { cardId: this.selectedCardId, attack: this.selectedAttack };
            this.stopActiveOverlay();
            if (callback) {
                callback(result);
            }
        });

        this.submitButton = { body: submitBody, label: submitLabel };
        this.refreshUi();
    }

    private clearSelection (): void
    {
        this.selectedCardId = null;
        this.selectedAttack = null;
        this.refreshUi();
    }

    private refreshUi (): void
    {
        const selectedItem = this.cardUis.find((ui) => ui.item.id === this.selectedCardId)?.item ?? null;

        this.cardUis.forEach((ui) => {
            const selected = ui.item.id === this.selectedCardId;
            ui.container.setScale(selected ? 1.08 : 1);
            ui.body.setStrokeStyle(3, selected ? 0xffe066 : 0xffffff, 1);
        });

        this.atkButtons.forEach((button) => {
            const available = Boolean(
                selectedItem &&
                ((button.attack === 'atk1' && selectedItem.hasAtk1) || (button.attack === 'atk2' && selectedItem.hasAtk2))
            );
            button.body.setVisible(available);
            button.label.setVisible(available);

            if (!available) {
                return;
            }

            const selected = this.selectedAttack === button.attack;
            button.body.setFillStyle(selected ? 0x15803d : 0x0f172a, selected ? 0.95 : 0.85);
            button.body.setStrokeStyle(2, selected ? 0xffe066 : 0xffffff, selected ? 0.95 : 0.7);
        });

        if (this.hintText) {
            if (!selectedItem) {
                this.setHintText('Select 1 character card');
            }
            else if (!this.selectedAttack) {
                this.setHintText(`Select 1 attack for ${selectedItem.id}`);
            }
            else {
                this.setHintText(`${selectedItem.id} -> ${this.selectedAttack.toUpperCase()}`);
            }
        }

        const canSubmit = Boolean(this.selectedCardId && this.selectedAttack);
        if (this.submitButton) {
            this.submitButton.body.setFillStyle(canSubmit ? 0x0f766e : 0x334155, canSubmit ? 0.95 : 0.75);
            this.submitButton.body.setStrokeStyle(2, 0xffffff, canSubmit ? 0.95 : 0.5);
        }
    }

    private setHintText (text: string): void
    {
        if (!this.hintText) {
            return;
        }

        this.hintText.setText(text);
        const fittedSize = fitTextToSingleLine({
            scene: this.scene,
            text,
            preferredSize: this.hintPreferredFontSize,
            minSize: GAME_INPUT_OVERLAY_HEADER_LAYOUT.hintFitMinSize,
            maxWidth: Math.round(this.scene.scale.width * 0.92)
        });
        this.hintText.setFontSize(fittedSize);
    }
}
