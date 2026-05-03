import { Scene } from 'phaser';
import { PRELOADER_TEXT_LAYOUT, UI_FONT_FAMILY } from '../config';
import { UI_CLICK_SOUND_KEY } from '../ui/clickSfx';
import { createVolumeControlForScene, preloadVolumeControlAssets } from '../ui/volumeControl';

export class Preloader extends Scene
{
    constructor ()
    {
        super('Preloader');
    }

    init ()
    {
        createVolumeControlForScene(this);

        const viewportWidth = Math.max(1, this.scale.gameSize.width);
        const viewportHeight = Math.max(1, this.scale.gameSize.height);
        const viewportCenterX = viewportWidth * 0.5;
        const viewportCenterY = viewportHeight * 0.5;

        this.add.image(viewportCenterX, viewportCenterY, 'preloader-background')
            .setDisplaySize(viewportWidth, viewportHeight)
            .setAlpha(0.92);

        this.add.rectangle(viewportCenterX, viewportCenterY, viewportWidth, viewportHeight, 0x020617, 0.45);

        const title = this.add.text(viewportCenterX, viewportCenterY - 90, 'Loading', {
            fontFamily: UI_FONT_FAMILY,
            fontSize: `${PRELOADER_TEXT_LAYOUT.titleFontSizePx}px`,
            color: '#ffffff',
            stroke: '#000000',
            strokeThickness: 4,
        }).setOrigin(0.5);

        const progressLabel = this.add.text(viewportCenterX, viewportCenterY - 45, '0%', {
            fontFamily: UI_FONT_FAMILY,
            fontSize: `${PRELOADER_TEXT_LAYOUT.progressFontSizePx}px`,
            color: '#e2e8f0',
        }).setOrigin(0.5);

        const barWidth = 560;
        const barHeight = 28;
        const barX = viewportCenterX - Math.round(barWidth / 2);

        this.add.rectangle(viewportCenterX, viewportCenterY, barWidth + 6, barHeight + 6, 0x000000, 0.45)
            .setStrokeStyle(2, 0xffffff, 0.9);

        const bar = this.add.rectangle(barX, viewportCenterY, 2, barHeight, 0x38bdf8, 1).setOrigin(0, 0.5);

        const fileLabel = this.add.text(viewportCenterX, viewportCenterY + 44, '', {
            fontFamily: UI_FONT_FAMILY,
            fontSize: `${PRELOADER_TEXT_LAYOUT.fileFontSizePx}px`,
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

        this.load.audio(UI_CLICK_SOUND_KEY, 'sfx/click.mp3');
        preloadVolumeControlAssets(this);
    }

    create ()
    {
        // Transition occurs in the loader complete callback.
    }
}
