import { Scene } from 'phaser';
import {
    BASE_HEIGHT,
    BASE_WIDTH,
    GAME_COMMAND_TERMINAL_LAYOUT,
    GAME_DEPTHS,
    GAME_HEIGHT,
    GAME_INTERACTION,
    GAME_WIDTH,
    UI_SCALE
} from '../config';

type CommandTerminalControllerOptions = {
    initialLines: string[];
    onCommandSubmit: (command: string) => void;
    isInputLocked: () => boolean;
};

export class CommandTerminalController
{
    private readonly scene: Scene;
    private readonly onCommandSubmit: (command: string) => void;
    private readonly isInputLocked: () => boolean;

    private terminalLines: string[];
    private terminalInput: string;
    private terminalOutputText: Phaser.GameObjects.Text;
    private terminalInputText: Phaser.GameObjects.Text;
    private maxTerminalLines: number;
    private terminalVisibleLineCount: number;
    private terminalScrollOffset: number;
    private terminalInputVisibleCharCount: number;
    private terminalInputViewOffset: number;
    private terminalPanelBounds: Phaser.Geom.Rectangle;
    private terminalCursorVisible: boolean;

    constructor (scene: Scene, options: CommandTerminalControllerOptions)
    {
        this.scene = scene;
        this.onCommandSubmit = options.onCommandSubmit;
        this.isInputLocked = options.isInputLocked;

        this.terminalLines = [...options.initialLines];
        this.terminalInput = '';
        this.maxTerminalLines = GAME_COMMAND_TERMINAL_LAYOUT.maxLines;
        this.terminalVisibleLineCount = GAME_COMMAND_TERMINAL_LAYOUT.minVisibleLineCount;
        this.terminalScrollOffset = 0;
        this.terminalInputVisibleCharCount = 12;
        this.terminalInputViewOffset = 0;
        this.terminalCursorVisible = true;

        this.terminalPanelBounds = new Phaser.Geom.Rectangle(0, 0, 1, 1);
        this.terminalOutputText = this.scene.add.text(0, 0, '').setFontSize(GAME_COMMAND_TERMINAL_LAYOUT.outputFontSize)
            .setVisible(false);
        this.terminalInputText = this.scene.add.text(0, 0, '').setFontSize(GAME_COMMAND_TERMINAL_LAYOUT.inputFontSize)
            .setVisible(false);

        this.createTerminalUi();
        this.refreshTerminalText();
        this.registerListeners();
    }

    appendLine (line: string): void
    {
        this.terminalLines.push(line);
        if (this.terminalScrollOffset > 0) {
            this.terminalScrollOffset += 1;
        }
        if (this.terminalLines.length > this.maxTerminalLines) {
            const removed = this.terminalLines.length - this.maxTerminalLines;
            this.terminalLines.splice(0, removed);
            this.terminalScrollOffset = Math.max(0, this.terminalScrollOffset - removed);
        }
        this.clampTerminalScrollOffset();
        this.refreshTerminalText();
    }

    scrollToLatest (): void
    {
        this.terminalScrollOffset = 0;
        this.refreshTerminalText();
    }

    private createTerminalUi (): void
    {
        const panelWidth = Math.round((GAME_COMMAND_TERMINAL_LAYOUT.panelWidthBase / BASE_WIDTH) * GAME_WIDTH);
        const panelHeight = Math.round((GAME_COMMAND_TERMINAL_LAYOUT.panelHeightBase / BASE_HEIGHT) * GAME_HEIGHT);
        const marginX = Math.round((GAME_COMMAND_TERMINAL_LAYOUT.marginBase / BASE_WIDTH) * GAME_WIDTH);
        const marginY = Math.round((GAME_COMMAND_TERMINAL_LAYOUT.marginBase / BASE_HEIGHT) * GAME_HEIGHT);
        const panelX = GAME_WIDTH - marginX - Math.round(panelWidth / 2);
        const panelY = marginY + Math.round(panelHeight / 2);
        const textScale = UI_SCALE * GAME_COMMAND_TERMINAL_LAYOUT.textScaleMultiplier;
        const titleSize = Math.max(GAME_COMMAND_TERMINAL_LAYOUT.titleFontSize, Math.round(GAME_COMMAND_TERMINAL_LAYOUT.titleFontSize * textScale));
        const outputSize = Math.max(GAME_COMMAND_TERMINAL_LAYOUT.outputFontSize - 1, Math.round(GAME_COMMAND_TERMINAL_LAYOUT.outputFontSize * textScale));
        const inputSize = Math.max(GAME_COMMAND_TERMINAL_LAYOUT.inputFontSize, Math.round(GAME_COMMAND_TERMINAL_LAYOUT.inputFontSize * textScale));
        const leftPadding = Math.round(panelWidth * GAME_COMMAND_TERMINAL_LAYOUT.leftPaddingRatio);
        const contentWidth = panelWidth - (leftPadding * 2);
        const topY = panelY - Math.round(panelHeight / 2);
        const bottomY = panelY + Math.round(panelHeight / 2);
        const outputTopY = topY + Math.round(panelHeight * GAME_COMMAND_TERMINAL_LAYOUT.outputTopRatio);
        const inputStripHeight = Math.max(GAME_COMMAND_TERMINAL_LAYOUT.inputStripMinHeight, Math.round(panelHeight * GAME_COMMAND_TERMINAL_LAYOUT.inputStripHeightRatio));
        const inputStripTopY = bottomY - inputStripHeight - Math.round(panelHeight * GAME_COMMAND_TERMINAL_LAYOUT.inputStripTopGapRatio);
        const outputBottomY = inputStripTopY - Math.round(panelHeight * GAME_COMMAND_TERMINAL_LAYOUT.outputBottomGapRatio);
        const outputContentHeight = Math.max(1, outputBottomY - outputTopY);
        const outputViewportPadding = Math.max(2, Math.round(outputSize * 0.25));
        const outputLineHeight = Math.max(outputSize + 1, Math.round(outputSize * 1.2));
        const inputY = bottomY - Math.round(panelHeight * GAME_COMMAND_TERMINAL_LAYOUT.inputYRatio);

        this.scene.add.rectangle(panelX, panelY, panelWidth, panelHeight, GAME_COMMAND_TERMINAL_LAYOUT.panelFillColor, GAME_COMMAND_TERMINAL_LAYOUT.panelFillAlpha)
            .setStrokeStyle(GAME_COMMAND_TERMINAL_LAYOUT.panelStrokeWidth, GAME_COMMAND_TERMINAL_LAYOUT.panelStrokeColor, GAME_COMMAND_TERMINAL_LAYOUT.panelStrokeAlpha)
            .setDepth(GAME_DEPTHS.terminalPanel);

        this.terminalPanelBounds = new Phaser.Geom.Rectangle(
            panelX - Math.round(panelWidth / 2),
            panelY - Math.round(panelHeight / 2),
            panelWidth,
            panelHeight
        );

        this.scene.add.text(panelX, topY + Math.round(panelHeight * 0.06), 'COMMAND TERMINAL').setFontSize(titleSize)
            .setOrigin(0.5)
            .setTint(GAME_COMMAND_TERMINAL_LAYOUT.inputTextTint)
            .setDepth(GAME_DEPTHS.terminalText);

        this.terminalVisibleLineCount = Math.max(
            GAME_COMMAND_TERMINAL_LAYOUT.minVisibleLineCount,
            Math.floor(Math.max(1, outputContentHeight - (outputViewportPadding * 2)) / outputLineHeight)
        );
        const estimatedInputCharWidth = Math.max(6, Math.round(inputSize * 0.6));
        this.terminalInputVisibleCharCount = Math.max(6, Math.floor((contentWidth - (estimatedInputCharWidth * 3)) / estimatedInputCharWidth));

        this.terminalOutputText.destroy();
        this.terminalOutputText = this.scene.add.text(panelX - Math.round(panelWidth / 2) + leftPadding, outputTopY, '').setFontSize(outputSize)
            .setOrigin(0, 0)
            .setTint(GAME_COMMAND_TERMINAL_LAYOUT.outputTint)
            .setWordWrapWidth(contentWidth)
            .setDepth(GAME_DEPTHS.terminalText);

        const terminalOutputMaskGraphics = this.scene.add.graphics();
        terminalOutputMaskGraphics.fillStyle(GAME_COMMAND_TERMINAL_LAYOUT.panelStrokeColor, 1);
        terminalOutputMaskGraphics.fillRect(
            panelX - Math.round(panelWidth / 2) + leftPadding,
            outputTopY - outputViewportPadding,
            contentWidth,
            outputContentHeight + (outputViewportPadding * 2)
        );
        this.terminalOutputText.setMask(terminalOutputMaskGraphics.createGeometryMask());

        this.scene.add.rectangle(panelX, inputStripTopY + Math.round(inputStripHeight / 2), panelWidth - Math.round(panelWidth * (1 - GAME_COMMAND_TERMINAL_LAYOUT.inputStripWidthRatio)), inputStripHeight, GAME_COMMAND_TERMINAL_LAYOUT.inputStripFillColor, GAME_COMMAND_TERMINAL_LAYOUT.inputStripFillAlpha)
            .setStrokeStyle(GAME_COMMAND_TERMINAL_LAYOUT.inputStripStrokeWidth, GAME_COMMAND_TERMINAL_LAYOUT.inputStripStrokeColor, GAME_COMMAND_TERMINAL_LAYOUT.inputStripStrokeAlpha)
            .setDepth(GAME_DEPTHS.terminalInputStrip);

        this.terminalInputText.destroy();
        this.terminalInputText = this.scene.add.text(panelX - Math.round(panelWidth / 2) + leftPadding, inputY, '').setFontSize(inputSize)
            .setOrigin(0, 0)
            .setTint(GAME_COMMAND_TERMINAL_LAYOUT.inputTextTint)
            .setDepth(GAME_DEPTHS.terminalInputText);

        const navButtonSize = Math.max(16, Math.round(panelWidth * 0.08));
        const navX = panelX + Math.round(panelWidth / 2) - navButtonSize;
        const navUpY = outputTopY + Math.round(navButtonSize * 0.5);
        const navDownY = outputBottomY - Math.round(navButtonSize * 0.5);

        const terminalUpButton = this.scene.add.rectangle(navX, navUpY, navButtonSize, navButtonSize, 0x0f172a, 0.95)
            .setStrokeStyle(1, 0xffffff, 0.7)
            .setDepth(GAME_DEPTHS.terminalInputText)
            .setInteractive({ useHandCursor: true });
        this.scene.add.text(navX, navUpY, '^').setFontSize(Math.max(10, Math.round(inputSize * 0.9)))
            .setOrigin(0.5)
            .setDepth(GAME_DEPTHS.terminalInputText + 1);
        terminalUpButton.on('pointerdown', () => {
            this.scrollTerminalBy(1);
        });

        const terminalDownButton = this.scene.add.rectangle(navX, navDownY, navButtonSize, navButtonSize, 0x0f172a, 0.95)
            .setStrokeStyle(1, 0xffffff, 0.7)
            .setDepth(GAME_DEPTHS.terminalInputText)
            .setInteractive({ useHandCursor: true });
        this.scene.add.text(navX, navDownY, 'v').setFontSize(Math.max(10, Math.round(inputSize * 0.9)))
            .setOrigin(0.5)
            .setDepth(GAME_DEPTHS.terminalInputText + 1);
        terminalDownButton.on('pointerdown', () => {
            this.scrollTerminalBy(-1);
        });

        const inputButtonY = inputStripTopY + Math.round(inputStripHeight / 2);
        const inputLeftX = panelX - Math.round(panelWidth / 2) + Math.round(navButtonSize * 0.8);
        const inputRightX = panelX + Math.round(panelWidth / 2) - Math.round(navButtonSize * 0.8);

        const terminalInputLeftButton = this.scene.add.rectangle(inputLeftX, inputButtonY, navButtonSize, navButtonSize, 0x0f172a, 0.95)
            .setStrokeStyle(1, 0xffffff, 0.7)
            .setDepth(GAME_DEPTHS.terminalInputText)
            .setInteractive({ useHandCursor: true });
        this.scene.add.text(inputLeftX, inputButtonY, '<').setFontSize(Math.max(10, Math.round(inputSize * 0.9)))
            .setOrigin(0.5)
            .setDepth(GAME_DEPTHS.terminalInputText + 1);
        terminalInputLeftButton.on('pointerdown', () => {
            this.panTerminalInputBy(-3);
        });

        const terminalInputRightButton = this.scene.add.rectangle(inputRightX, inputButtonY, navButtonSize, navButtonSize, 0x0f172a, 0.95)
            .setStrokeStyle(1, 0xffffff, 0.7)
            .setDepth(GAME_DEPTHS.terminalInputText)
            .setInteractive({ useHandCursor: true });
        this.scene.add.text(inputRightX, inputButtonY, '>').setFontSize(Math.max(10, Math.round(inputSize * 0.9)))
            .setOrigin(0.5)
            .setDepth(GAME_DEPTHS.terminalInputText + 1);
        terminalInputRightButton.on('pointerdown', () => {
            this.panTerminalInputBy(3);
        });
    }

    private registerListeners (): void
    {
        this.scene.time.addEvent({
            delay: GAME_INTERACTION.terminalCursorBlinkDelayMs,
            loop: true,
            callback: () => {
                this.terminalCursorVisible = !this.terminalCursorVisible;
                this.refreshTerminalText();
            }
        });

        this.scene.input.keyboard?.on('keydown', (event: KeyboardEvent) => {
            if (this.isInputLocked()) {
                return;
            }

            if (event.key === 'ArrowUp') {
                this.scrollTerminalBy(1);
                return;
            }

            if (event.key === 'ArrowDown') {
                this.scrollTerminalBy(-1);
                return;
            }

            if (event.key === 'PageUp') {
                this.scrollTerminalBy(this.terminalVisibleLineCount);
                return;
            }

            if (event.key === 'PageDown') {
                this.scrollTerminalBy(-this.terminalVisibleLineCount);
                return;
            }

            if (event.key === 'End') {
                this.scrollToLatest();
                return;
            }

            if (event.key === 'Backspace') {
                this.terminalInput = this.terminalInput.slice(0, -1);
                this.syncTerminalInputToTail();
                this.refreshTerminalText();
                return;
            }

            if (event.key === 'Enter') {
                this.onCommandSubmit(this.terminalInput.trim());
                this.terminalInput = '';
                this.terminalInputViewOffset = 0;
                this.refreshTerminalText();
                return;
            }

            if (event.key === 'Escape') {
                this.terminalInput = '';
                this.terminalInputViewOffset = 0;
                this.refreshTerminalText();
                return;
            }

            if (event.key.length === 1 && this.terminalInput.length < GAME_INTERACTION.terminalInputMaxLength) {
                this.terminalInput += event.key;
                this.syncTerminalInputToTail();
                this.refreshTerminalText();
            }
        });

        this.scene.input.on('wheel', (pointer: Phaser.Input.Pointer, _gameObjects: Phaser.GameObjects.GameObject[], _deltaX: number, deltaY: number) => {
            if (!this.terminalPanelBounds.contains(pointer.worldX, pointer.worldY)) {
                return;
            }

            const step = deltaY > 0 ? GAME_INTERACTION.terminalWheelStep : -GAME_INTERACTION.terminalWheelStep;
            this.scrollTerminalBy(step);
        });
    }

    private refreshTerminalText (): void
    {
        const totalLines = this.terminalLines.length;
        const visibleCount = this.terminalVisibleLineCount;
        const maxOffset = Math.max(0, totalLines - visibleCount);
        const offset = Phaser.Math.Clamp(this.terminalScrollOffset, 0, maxOffset);

        const endIndex = totalLines - offset;
        const startIndex = Math.max(0, endIndex - visibleCount);
        this.terminalOutputText.setText(this.terminalLines.slice(startIndex, endIndex).join('\n'));

        this.clampTerminalInputViewOffset();
        const visibleInput = this.terminalInput.slice(this.terminalInputViewOffset, this.terminalInputViewOffset + this.terminalInputVisibleCharCount);
        const cursor = this.terminalCursorVisible ? '.' : ' ';
        this.terminalInputText.setText(`> ${visibleInput}${cursor}`);
    }

    private scrollTerminalBy (delta: number): void
    {
        this.terminalScrollOffset += delta;
        this.clampTerminalScrollOffset();
        this.refreshTerminalText();
    }

    private clampTerminalScrollOffset (): void
    {
        const maxOffset = Math.max(0, this.terminalLines.length - this.terminalVisibleLineCount);
        this.terminalScrollOffset = Phaser.Math.Clamp(this.terminalScrollOffset, 0, maxOffset);
    }

    private clampTerminalInputViewOffset (): void
    {
        const maxOffset = Math.max(0, this.terminalInput.length - this.terminalInputVisibleCharCount);
        this.terminalInputViewOffset = Phaser.Math.Clamp(this.terminalInputViewOffset, 0, maxOffset);
    }

    private syncTerminalInputToTail (): void
    {
        this.terminalInputViewOffset = Math.max(0, this.terminalInput.length - this.terminalInputVisibleCharCount);
        this.clampTerminalInputViewOffset();
    }

    private panTerminalInputBy (delta: number): void
    {
        this.terminalInputViewOffset += delta;
        this.clampTerminalInputViewOffset();
        this.refreshTerminalText();
    }
}
