import { Scene } from 'phaser';
import { PlayerId } from '../entities';
import {
    BASE_HEIGHT,
    BASE_WIDTH,
    GAME_PLAYER_STATS_HUD_LAYOUT,
    UI_SCALE
} from '../config';

type ViewMode = PlayerId | 'admin';

type PlayerTurnAttributes = {
    ENERGY_ADD_REMAINING_IN_TURN: number;
    KO_COUNT: number;
    SUPPORTER_USES_REMAINING_IN_TURN: number;
    SWAP_REMAINING_IN_TURN: number;
    ATTACKS_LEFT: number;
};

type PlayerStatsHudUi = {
    background: Phaser.GameObjects.Rectangle;
    title: Phaser.GameObjects.BitmapText;
    keyTexts: Phaser.GameObjects.BitmapText[];
    valueTexts: Phaser.GameObjects.BitmapText[];
};

export class PlayerStatsHudController
{
    private readonly scene: Scene;
    private uiByPlayer: Record<PlayerId, PlayerStatsHudUi> | null;

    constructor (scene: Scene)
    {
        this.scene = scene;
        this.uiByPlayer = null;
    }

    create (): void
    {
        const leftMargin = Math.round((GAME_PLAYER_STATS_HUD_LAYOUT.leftMarginBase / BASE_WIDTH) * this.scene.scale.width);
        const topMargin = Math.round((GAME_PLAYER_STATS_HUD_LAYOUT.topMarginBase / BASE_HEIGHT) * this.scene.scale.height);
        const rowGap = Math.max(10, Math.round((GAME_PLAYER_STATS_HUD_LAYOUT.rowGapBase / BASE_HEIGHT) * this.scene.scale.height));

        this.uiByPlayer = {
            p1: this.createHud(leftMargin, topMargin),
            p2: this.createHud(leftMargin, topMargin + rowGap)
        };
    }

    refresh (activeViewMode: ViewMode, statsByPlayer: Record<PlayerId, PlayerTurnAttributes>): void
    {
        if (!this.uiByPlayer) {
            return;
        }

        const leftMargin = Math.round((GAME_PLAYER_STATS_HUD_LAYOUT.leftMarginBase / BASE_WIDTH) * this.scene.scale.width);
        const topMargin = Math.round((GAME_PLAYER_STATS_HUD_LAYOUT.topMarginBase / BASE_HEIGHT) * this.scene.scale.height);
        const rowGap = Math.max(10, Math.round((GAME_PLAYER_STATS_HUD_LAYOUT.rowGapBase / BASE_HEIGHT) * this.scene.scale.height));
        const adminColumnGap = Math.max(220, Math.round((GAME_PLAYER_STATS_HUD_LAYOUT.adminColumnGapBase / BASE_WIDTH) * this.scene.scale.width));
        const panelPaddingX = Math.max(12, Math.round(12 * UI_SCALE));
        const panelPaddingY = Math.max(8, Math.round(8 * UI_SCALE));

        const layoutHud = (playerId: PlayerId, x: number, y: number): void => {
            const ui = this.uiByPlayer?.[playerId];
            if (!ui) {
                return;
            }

            const rows: Array<[string, number]> = [
                ['ENERGY_ADD_REMAINING_IN_TURN', statsByPlayer[playerId].ENERGY_ADD_REMAINING_IN_TURN],
                ['KO_COUNT', statsByPlayer[playerId].KO_COUNT],
                ['SUPPORTER_USES_REMAINING_IN_TURN', statsByPlayer[playerId].SUPPORTER_USES_REMAINING_IN_TURN],
                ['SWAP_REMAINING_IN_TURN', statsByPlayer[playerId].SWAP_REMAINING_IN_TURN],
                ['ATTACKS_LEFT', statsByPlayer[playerId].ATTACKS_LEFT]
            ];

            const titleText = playerId === 'p1' ? 'PLAYER-1' : 'PLAYER-2';
            const rowHeight = Math.max(14, Math.round(GAME_PLAYER_STATS_HUD_LAYOUT.fontSize * UI_SCALE * 1.35));
            const titleGap = Math.max(8, Math.round(8 * UI_SCALE));
            const colGap = Math.max(20, Math.round(20 * UI_SCALE));

            ui.title.setText(titleText).setPosition(x, y);

            let maxKeyWidth = 0;
            let maxValueWidth = 0;
            rows.forEach(([key, value], index) => {
                const keyText = ui.keyTexts[index];
                const valueText = ui.valueTexts[index];

                keyText.setText(`${key.toLowerCase().replace(/_/g, '-')}:`);
                valueText.setText(String(value));
                maxKeyWidth = Math.max(maxKeyWidth, keyText.width);
                maxValueWidth = Math.max(maxValueWidth, valueText.width);
            });

            const valueRightX = x + maxKeyWidth + colGap + maxValueWidth;
            rows.forEach((_, index) => {
                const rowY = y + titleGap + ((index + 1) * rowHeight);
                ui.keyTexts[index].setPosition(x, rowY);
                ui.valueTexts[index].setPosition(valueRightX, rowY);
            });

            const panelWidth = (valueRightX - x) + (panelPaddingX * 2);
            const panelHeight = (titleGap + ((rows.length + 1) * rowHeight)) + (panelPaddingY * 2);

            ui.background
                .setPosition(x - panelPaddingX, y - panelPaddingY)
                .setSize(panelWidth, panelHeight);
        };

        layoutHud('p1', leftMargin, topMargin);
        layoutHud('p2', leftMargin, topMargin + rowGap);

        const setHudVisible = (playerId: PlayerId, visible: boolean) => {
            const ui = this.uiByPlayer?.[playerId];
            if (!ui) {
                return;
            }
            ui.background.setVisible(visible);
            ui.title.setVisible(visible);
            ui.keyTexts.forEach((text) => text.setVisible(visible));
            ui.valueTexts.forEach((text) => text.setVisible(visible));
        };

        if (activeViewMode === 'admin') {
            layoutHud('p2', leftMargin + adminColumnGap, topMargin);
            setHudVisible('p1', true);
            setHudVisible('p2', true);
            return;
        }

        if (activeViewMode === 'p1') {
            setHudVisible('p1', true);
            setHudVisible('p2', false);
            return;
        }

        layoutHud('p2', leftMargin, topMargin);
        setHudVisible('p1', false);
        setHudVisible('p2', true);
    }

    private createHud (startX: number, startY: number): PlayerStatsHudUi
    {
        const fontSize = Math.max(10, Math.round(GAME_PLAYER_STATS_HUD_LAYOUT.fontSize * UI_SCALE));

        const background = this.scene.add.rectangle(startX, startY, 10, 10, 0x0b132b, 0.88)
            .setOrigin(0, 0)
            .setStrokeStyle(2, 0xffffff, 0.45)
            .setDepth(GAME_PLAYER_STATS_HUD_LAYOUT.depth - 1);

        const title = this.scene.add.bitmapText(startX, startY, 'minogram', '', fontSize)
            .setOrigin(0, 0)
            .setTint(GAME_PLAYER_STATS_HUD_LAYOUT.tint)
            .setDepth(GAME_PLAYER_STATS_HUD_LAYOUT.depth);

        const keyTexts: Phaser.GameObjects.BitmapText[] = [];
        const valueTexts: Phaser.GameObjects.BitmapText[] = [];

        for (let i = 0; i < 5; i += 1) {
            keyTexts.push(
                this.scene.add.bitmapText(startX, startY, 'minogram', '', fontSize)
                    .setOrigin(0, 0)
                    .setTint(GAME_PLAYER_STATS_HUD_LAYOUT.tint)
                    .setDepth(GAME_PLAYER_STATS_HUD_LAYOUT.depth)
            );
            valueTexts.push(
                this.scene.add.bitmapText(startX, startY, 'minogram', '', fontSize)
                    .setOrigin(1, 0)
                    .setTint(GAME_PLAYER_STATS_HUD_LAYOUT.tint)
                    .setDepth(GAME_PLAYER_STATS_HUD_LAYOUT.depth)
            );
        }

        return { background, title, keyTexts, valueTexts };
    }
}
