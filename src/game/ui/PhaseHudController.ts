import { Scene } from 'phaser';
import { PlayerId } from '../entities';
import {
    BASE_HEIGHT,
    BASE_WIDTH,
    UI_SCALE
} from '../config';
import { fitBitmapTextToSingleLine } from './overlays/bitmapTextFit';

type ViewMode = PlayerId | 'admin';
type GamePhase = 'no-input' | 'phase2' | 'atk';

type PhaseHudUi = {
    background: Phaser.GameObjects.Rectangle;
    title: Phaser.GameObjects.BitmapText;
    roundLabel: Phaser.GameObjects.BitmapText;
    roundValue: Phaser.GameObjects.BitmapText;
    phaseLabel: Phaser.GameObjects.BitmapText;
    phaseValue: Phaser.GameObjects.BitmapText;
    turnLabel: Phaser.GameObjects.BitmapText;
    turnValue: Phaser.GameObjects.BitmapText;
};

export class PhaseHudController
{
    private readonly scene: Scene;
    private ui: PhaseHudUi | null;
    private panelBounds: Phaser.Geom.Rectangle | null;
    private rightMargin: number;
    private topMargin: number;
    private panelPaddingX: number;
    private panelPaddingY: number;
    private rowHeight: number;
    private titleGap: number;
    private colGap: number;
    private minPanelWidth: number;
    private maxPanelWidth: number;

    constructor (scene: Scene)
    {
        this.scene = scene;
        this.ui = null;
        this.panelBounds = null;
        this.rightMargin = 0;
        this.topMargin = 0;
        this.panelPaddingX = 0;
        this.panelPaddingY = 0;
        this.rowHeight = 0;
        this.titleGap = 0;
        this.colGap = 0;
        this.minPanelWidth = 0;
        this.maxPanelWidth = 0;
    }

    create (): void
    {
        this.rightMargin = Math.round((16 / BASE_WIDTH) * this.scene.scale.width);
        this.topMargin = Math.round((36 / BASE_HEIGHT) * this.scene.scale.height);
        const fontSize = Math.max(10, Math.round(18 * UI_SCALE));

        const background = this.scene.add.rectangle(0, 0, 10, 10, 0x0b132b, 0.88)
            .setOrigin(1, 0)
            .setStrokeStyle(2, 0xffffff, 0.45)
            .setDepth(314);

        const title = this.scene.add.bitmapText(0, 0, 'minogram', 'GAME STATE', fontSize)
            .setOrigin(0, 0)
            .setTint(0xffffff)
            .setDepth(315);

        const phaseLabel = this.scene.add.bitmapText(0, 0, 'minogram', 'phase:', fontSize)
            .setOrigin(0, 0)
            .setTint(0xffffff)
            .setDepth(315);

        const roundLabel = this.scene.add.bitmapText(0, 0, 'minogram', 'round:', fontSize)
            .setOrigin(0, 0)
            .setTint(0xffffff)
            .setDepth(315);

        const roundValue = this.scene.add.bitmapText(0, 0, 'minogram', '0', fontSize)
            .setOrigin(1, 0)
            .setTint(0xffffff)
            .setDepth(315);

        const phaseValue = this.scene.add.bitmapText(0, 0, 'minogram', 'PHASE2', fontSize)
            .setOrigin(1, 0)
            .setTint(0xffffff)
            .setDepth(315);

        const turnLabel = this.scene.add.bitmapText(0, 0, 'minogram', 'turn:', fontSize)
            .setOrigin(0, 0)
            .setTint(0xffffff)
            .setDepth(315);

        const turnValue = this.scene.add.bitmapText(0, 0, 'minogram', 'ASH', fontSize)
            .setOrigin(1, 0)
            .setTint(0xffffff)
            .setDepth(315);

        this.ui = { background, title, roundLabel, roundValue, phaseLabel, phaseValue, turnLabel, turnValue };

        this.panelPaddingX = Math.max(12, Math.round(12 * UI_SCALE));
        this.panelPaddingY = Math.max(8, Math.round(8 * UI_SCALE));
        this.rowHeight = Math.max(14, Math.round(fontSize * 1.35));
        this.titleGap = Math.max(8, Math.round(8 * UI_SCALE));
        this.colGap = Math.max(20, Math.round(20 * UI_SCALE));
        this.minPanelWidth = Math.max(180, Math.round(180 * UI_SCALE));
        this.maxPanelWidth = Math.round(this.scene.scale.width * 0.32);

        this.layoutUi();
    }

    refresh (_activeViewMode: ViewMode, gamePhase: GamePhase, turnUsername: string, roundNumber: number): void
    {
        if (!this.ui) {
            return;
        }

        this.ui.roundValue.setText(String(roundNumber));
        this.ui.phaseValue.setText(gamePhase.toUpperCase());
        this.ui.turnValue.setText(turnUsername.toUpperCase());
        this.layoutUi();
    }

    getPanelBounds (): Phaser.Geom.Rectangle | null
    {
        if (!this.panelBounds) {
            return null;
        }

        return new Phaser.Geom.Rectangle(
            this.panelBounds.x,
            this.panelBounds.y,
            this.panelBounds.width,
            this.panelBounds.height
        );
    }

    private layoutUi (): void
    {
        if (!this.ui) {
            return;
        }

        const panelRight = this.scene.scale.width - this.rightMargin;
        const panelTop = this.topMargin;

        const contentWidth = Math.max(
            this.ui.title.width,
            this.ui.roundLabel.width + this.colGap + this.ui.roundValue.width,
            this.ui.phaseLabel.width + this.colGap + this.ui.phaseValue.width,
            this.ui.turnLabel.width + this.colGap + this.ui.turnValue.width
        );

        const panelWidth = Math.min(
            this.maxPanelWidth,
            Math.max(this.minPanelWidth, contentWidth + (this.panelPaddingX * 2))
        );

        const panelHeight = (this.titleGap + (this.rowHeight * 4)) + (this.panelPaddingY * 2);
        const panelLeft = panelRight - panelWidth;
        this.panelBounds = new Phaser.Geom.Rectangle(panelLeft, panelTop, panelWidth, panelHeight);

        const titleX = panelLeft + this.panelPaddingX;
        const titleY = panelTop + this.panelPaddingY;
        const rowRoundY = titleY + this.titleGap + this.rowHeight;
        const rowPhaseY = rowRoundY + this.rowHeight;
        const rowTurnY = rowPhaseY + this.rowHeight;
        const valueRightX = panelRight - this.panelPaddingX;

        this.ui.background
            .setPosition(panelRight, panelTop)
            .setSize(panelWidth, panelHeight);

        this.ui.title.setPosition(titleX, titleY);
        this.ui.roundLabel.setPosition(titleX, rowRoundY);
        this.ui.roundValue.setPosition(valueRightX, rowRoundY);
        this.ui.phaseLabel.setPosition(titleX, rowPhaseY);
        this.ui.phaseValue.setPosition(valueRightX, rowPhaseY);
        this.ui.turnLabel.setPosition(titleX, rowTurnY);
        this.ui.turnValue.setPosition(valueRightX, rowTurnY);

        const availableValueWidth = Math.max(12, Math.round(panelWidth - (this.panelPaddingX * 2) - this.colGap - Math.max(this.ui.roundLabel.width, this.ui.phaseLabel.width, this.ui.turnLabel.width)));
        this.ui.roundValue.setFontSize(fitBitmapTextToSingleLine({
            scene: this.scene,
            font: 'minogram',
            text: this.ui.roundValue.text,
            preferredSize: this.ui.roundValue.fontSize,
            minSize: Math.max(9, Math.round(this.ui.roundValue.fontSize * 0.72)),
            maxWidth: availableValueWidth
        }));
        this.ui.phaseValue.setFontSize(fitBitmapTextToSingleLine({
            scene: this.scene,
            font: 'minogram',
            text: this.ui.phaseValue.text,
            preferredSize: this.ui.phaseValue.fontSize,
            minSize: Math.max(9, Math.round(this.ui.phaseValue.fontSize * 0.72)),
            maxWidth: availableValueWidth
        }));
        this.ui.turnValue.setFontSize(fitBitmapTextToSingleLine({
            scene: this.scene,
            font: 'minogram',
            text: this.ui.turnValue.text,
            preferredSize: this.ui.turnValue.fontSize,
            minSize: Math.max(9, Math.round(this.ui.turnValue.fontSize * 0.72)),
            maxWidth: availableValueWidth
        }));
    }
}
