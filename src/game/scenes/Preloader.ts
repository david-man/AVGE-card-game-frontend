import { Scene } from 'phaser';
import { GAME_CENTER_X, GAME_CENTER_Y, GAME_HEIGHT, GAME_WIDTH, UI_FONT_FAMILY } from '../config';

export class Preloader extends Scene
{
    constructor ()
    {
        super('Preloader');
    }

    init ()
    {
        this.add.image(GAME_CENTER_X, GAME_CENTER_Y, 'preloader-background')
            .setDisplaySize(GAME_WIDTH, GAME_HEIGHT)
            .setAlpha(0.92);

        this.add.rectangle(GAME_CENTER_X, GAME_CENTER_Y, GAME_WIDTH, GAME_HEIGHT, 0x020617, 0.45);

        const title = this.add.text(GAME_CENTER_X, GAME_CENTER_Y - 90, 'Loading', {
            fontFamily: UI_FONT_FAMILY,
            fontSize: '40px',
            color: '#ffffff',
            stroke: '#000000',
            strokeThickness: 4,
        }).setOrigin(0.5);

        const progressLabel = this.add.text(GAME_CENTER_X, GAME_CENTER_Y - 45, '0%', {
            fontFamily: UI_FONT_FAMILY,
            fontSize: '20px',
            color: '#e2e8f0',
        }).setOrigin(0.5);

        const barWidth = 560;
        const barHeight = 28;
        const barX = GAME_CENTER_X - Math.round(barWidth / 2);

        this.add.rectangle(GAME_CENTER_X, GAME_CENTER_Y, barWidth + 6, barHeight + 6, 0x000000, 0.45)
            .setStrokeStyle(2, 0xffffff, 0.9);

        const bar = this.add.rectangle(barX, GAME_CENTER_Y, 2, barHeight, 0x38bdf8, 1).setOrigin(0, 0.5);

        const fileLabel = this.add.text(GAME_CENTER_X, GAME_CENTER_Y + 44, '', {
            fontFamily: UI_FONT_FAMILY,
            fontSize: '14px',
            color: '#cbd5e1',
        }).setOrigin(0.5);

        this.load.on('progress', (progress: number) => {
            bar.width = Math.max(2, Math.round(barWidth * progress));
            progressLabel.setText(`${Math.round(progress * 100)}%`);
        });

        this.load.on('fileprogress', (file: Phaser.Loader.File) => {
            const key = typeof file.key === 'string' ? file.key : '';
            if (!key) {
                return;
            }
            fileLabel.setText(`Loading ${key}`);
        });

        this.load.once('complete', () => {
            fileLabel.setText('Ready');
            this.tweens.add({
                targets: [title, progressLabel, fileLabel, bar],
                alpha: 0,
                duration: 180,
                onComplete: () => {
                    this.scene.start('Login');
                },
            });
        });
    }

    preload ()
    {
        this.load.setPath('assets');

        this.load.image('preloader-logo', 'logo.png');
        this.load.image('preloader-board-preview', 'background/base_board.png');
        this.load.image('logo', 'logo.png');
    }

    create ()
    {
        // Transition occurs in the loader complete callback.
    }
}
