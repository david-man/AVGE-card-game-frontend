import { Scene } from 'phaser';
import { GAME_INPUT_OVERLAY_HEADER_LAYOUT, GAME_INPUT_SELECTION_OVERLAY, GAME_OVERLAY_DEPTHS } from '../../config';
import { fitBitmapTextToSingleLine } from './bitmapTextFit';

type NumericalSubmitCallback = (value: number) => void;
type NumericalBackgroundClickCallback = () => void;

export class NumericalEntryInputOverlay
{
    private scene: Scene;
    private inputLockOverlay: Phaser.GameObjects.Rectangle;
    private backdrop: Phaser.GameObjects.Rectangle | null;
    private titleText: Phaser.GameObjects.BitmapText | null;
    private hintText: Phaser.GameObjects.BitmapText | null;
    private valueText: Phaser.GameObjects.BitmapText | null;
    private panel: Phaser.GameObjects.Rectangle | null;
    private submitButton: { body: Phaser.GameObjects.Rectangle; label: Phaser.GameObjects.BitmapText } | null;
    private currentValue: string;
    private onSubmit: NumericalSubmitCallback | null;
    private onBackgroundClick: NumericalBackgroundClickCallback | null;
    private keyboardHandler: ((event: KeyboardEvent) => void) | null;

    constructor (scene: Scene, inputLockOverlay: Phaser.GameObjects.Rectangle)
    {
        this.scene = scene;
        this.inputLockOverlay = inputLockOverlay;
        this.backdrop = null;
        this.titleText = null;
        this.hintText = null;
        this.valueText = null;
        this.panel = null;
        this.submitButton = null;
        this.currentValue = '';
        this.onSubmit = null;
        this.onBackgroundClick = null;
        this.keyboardHandler = null;
    }

    hasActiveOverlay (): boolean
    {
        return Boolean(this.backdrop || this.titleText || this.hintText || this.valueText || this.submitButton);
    }

    stopActiveOverlay (): void
    {
        this.backdrop?.destroy();
        this.backdrop = null;

        this.titleText?.destroy();
        this.titleText = null;

        this.hintText?.destroy();
        this.hintText = null;

        this.valueText?.destroy();
        this.valueText = null;

        this.panel?.destroy();
        this.panel = null;

        if (this.submitButton) {
            this.submitButton.body.destroy();
            this.submitButton.label.destroy();
            this.submitButton = null;
        }

        if (this.keyboardHandler) {
            this.scene.input.keyboard?.off('keydown', this.keyboardHandler);
            this.keyboardHandler = null;
        }

        this.currentValue = '';
        this.onSubmit = null;
        this.onBackgroundClick = null;
    }

    start (topMessage: string, onSubmit: NumericalSubmitCallback, onBackgroundClick?: NumericalBackgroundClickCallback): void
    {
        this.stopActiveOverlay();
        this.onSubmit = onSubmit;
        this.onBackgroundClick = onBackgroundClick ?? null;

        const overlayDepth = Math.max(GAME_OVERLAY_DEPTHS.overlayBase, this.inputLockOverlay.depth + 1);
        const panelWidth = Math.max(420, Math.round(this.scene.scale.width * 0.34));
        const panelHeight = Math.max(220, Math.round(this.scene.scale.height * 0.28));
        const panelX = Math.round(this.scene.scale.width / 2);
        const panelY = Math.round(this.scene.scale.height / 2);

        const titleFontSize = Math.max(
            GAME_INPUT_OVERLAY_HEADER_LAYOUT.titleFontSizeMin,
            Math.round(this.scene.scale.width * GAME_INPUT_OVERLAY_HEADER_LAYOUT.titleFontSizeRatio)
        );
        const fittedTitleFontSize = fitBitmapTextToSingleLine({
            scene: this.scene,
            font: 'minogram',
            text: topMessage,
            preferredSize: titleFontSize,
            minSize: 10,
            maxWidth: Math.round(panelWidth * 0.86)
        });
        const hintFontSize = Math.max(
            GAME_INPUT_OVERLAY_HEADER_LAYOUT.hintFontSizeMin,
            Math.round(this.scene.scale.width * GAME_INPUT_OVERLAY_HEADER_LAYOUT.hintFontSizeRatio),
            GAME_INPUT_SELECTION_OVERLAY.hintFontSizeMin,
            Math.round(panelWidth * GAME_INPUT_SELECTION_OVERLAY.hintFontSizeRatio)
        );
        const valueFontSize = Math.max(28, Math.round(panelWidth * 0.08));
        const hintMessage = 'Type a number and press Enter or Submit';
        const fittedHintFontSize = fitBitmapTextToSingleLine({
            scene: this.scene,
            font: 'minogram',
            text: hintMessage,
            preferredSize: hintFontSize,
            minSize: GAME_INPUT_OVERLAY_HEADER_LAYOUT.hintFitMinSize,
            maxWidth: Math.round(panelWidth * 0.86)
        });

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
            if (this.onBackgroundClick) {
                this.onBackgroundClick();
            }
        });

        this.panel = this.scene.add.rectangle(panelX, panelY, panelWidth, panelHeight, 0x0f172a, 0.97)
            .setStrokeStyle(3, 0xffffff, 0.85)
            .setDepth(overlayDepth);

        this.titleText = this.scene.add.bitmapText(
            panelX,
            panelY - Math.round(panelHeight * 0.36),
            'minogram',
            topMessage,
            fittedTitleFontSize
        )
            .setOrigin(0.5)
            .setDepth(overlayDepth + 1);

        this.hintText = this.scene.add.bitmapText(
            panelX,
            panelY - Math.round(panelHeight * 0.1),
            'minogram',
            hintMessage,
            fittedHintFontSize
        )
            .setOrigin(0.5)
            .setDepth(overlayDepth + 1)
            .setMaxWidth(Math.round(panelWidth * 0.86));

        this.valueText = this.scene.add.bitmapText(
            panelX,
            panelY + Math.round(panelHeight * 0.1),
            'minogram',
            '_',
            valueFontSize
        )
            .setOrigin(0.5)
            .setDepth(overlayDepth + 2);

        const submitWidth = Math.max(GAME_INPUT_SELECTION_OVERLAY.submitWidthMin, Math.round(panelWidth * 0.45));
        const submitHeight = Math.max(GAME_INPUT_SELECTION_OVERLAY.submitHeightMin, Math.round(panelHeight * 0.23));
        const submitY = panelY + Math.round(panelHeight * 0.34);
        const submitBody = this.scene.add.rectangle(panelX, submitY, submitWidth, submitHeight, 0x334155, 0.75)
            .setStrokeStyle(2, 0xffffff, 0.5)
            .setDepth(overlayDepth + 1)
            .setInteractive({ useHandCursor: true });
        const submitLabel = this.scene.add.bitmapText(
            panelX,
            submitY,
            'minogram',
            'SUBMIT',
            Math.max(GAME_INPUT_SELECTION_OVERLAY.submitLabelFontSizeMin, Math.round(valueFontSize * 0.5))
        )
            .setOrigin(0.5)
            .setDepth(overlayDepth + 2);

        submitBody.on('pointerdown', () => {
            this.submitIfValid();
        });

        this.submitButton = { body: submitBody, label: submitLabel };

        this.keyboardHandler = (event: KeyboardEvent) => {
            if (event.key === 'Enter') {
                this.submitIfValid();
                return;
            }

            if (event.key === 'Backspace') {
                this.currentValue = this.currentValue.slice(0, -1);
                this.refreshValueUi();
                return;
            }

            if (event.key === '-' && this.currentValue.length === 0) {
                this.currentValue = '-';
                this.refreshValueUi();
                return;
            }

            if (event.key === '.' && !this.currentValue.includes('.')) {
                this.currentValue += '.';
                this.refreshValueUi();
                return;
            }

            if (/^[0-9]$/.test(event.key)) {
                this.currentValue += event.key;
                this.refreshValueUi();
            }
        };

        this.scene.input.keyboard?.on('keydown', this.keyboardHandler);
        this.refreshValueUi();

        // Panel is tracked as a field and cleaned up in stopActiveOverlay.
    }

    private submitIfValid (): void
    {
        const parsed = Number(this.currentValue);
        if (!Number.isFinite(parsed)) {
            return;
        }

        const callback = this.onSubmit;
        this.stopActiveOverlay();
        if (callback) {
            callback(parsed);
        }
    }

    private refreshValueUi (): void
    {
        const parsed = Number(this.currentValue);
        const valid = this.currentValue.length > 0 && this.currentValue !== '-' && this.currentValue !== '.' && this.currentValue !== '-.' && Number.isFinite(parsed);

        if (this.valueText) {
            this.valueText.setText(this.currentValue.length > 0 ? this.currentValue : '_');
            this.valueText.setTint(valid ? 0xffffff : 0xffe066);
        }

        if (this.submitButton) {
            this.submitButton.body.setFillStyle(valid ? 0x0f766e : 0x334155, valid ? 0.95 : 0.75);
            this.submitButton.body.setStrokeStyle(2, 0xffffff, valid ? 0.95 : 0.5);
        }
    }
}
