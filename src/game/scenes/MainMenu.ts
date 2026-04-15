import { Scene, GameObjects } from 'phaser';
import { GAME_CENTER_X, GAME_CENTER_Y, GAME_HEIGHT, GAME_WIDTH, UI_SCALE } from '../config';

export class MainMenu extends Scene
{
    background: GameObjects.Image;
    title: GameObjects.BitmapText;
    subtitle: GameObjects.BitmapText;
    startButton: GameObjects.Rectangle;
    startButtonLabel: GameObjects.BitmapText;
    private transitioning: boolean;

    constructor ()
    {
        super('MainMenu');
        this.transitioning = false;
    }

    preload ()
    {
        this.load.setPath('assets');
        this.load.image('background', 'bg.png');
        this.load.bitmapFont('minogram', 'minogram_6x10.png', 'minogram_6x10.xml');
    }

    create ()
    {
        this.transitioning = false;
        this.cameras.main.fadeIn(180, 0, 0, 0);

        this.background = this.add.image(GAME_CENTER_X, GAME_CENTER_Y, 'background');
        this.background.setDisplaySize(GAME_WIDTH, GAME_HEIGHT);
        this.background.setAlpha(0.9);

        this.title = this.add.bitmapText(
            GAME_CENTER_X,
            Math.round(GAME_HEIGHT * 0.34),
            'minogram',
            'AVGE CARD GAME',
            Math.max(32, Math.round(64 * UI_SCALE))
        )
            .setOrigin(0.5)
            .setTint(0xffffff);

        this.subtitle = this.add.bitmapText(
            GAME_CENTER_X,
            Math.round(GAME_HEIGHT * 0.47),
            'minogram',
            'Admin Visual Game Environment',
            Math.max(14, Math.round(24 * UI_SCALE))
        )
            .setOrigin(0.5)
            .setTint(0xcbd5e1);

        const buttonWidth = Math.round(280 * UI_SCALE);
        const buttonHeight = Math.round(84 * UI_SCALE);
        const buttonY = Math.round(GAME_HEIGHT * 0.68);

        this.startButton = this.add.rectangle(
            GAME_CENTER_X,
            buttonY,
            buttonWidth,
            buttonHeight,
            0x0f172a,
            0.9
        )
            .setStrokeStyle(3, 0xffffff, 0.85)
            .setInteractive({ useHandCursor: true });

        this.startButtonLabel = this.add.bitmapText(
            GAME_CENTER_X,
            buttonY,
            'minogram',
            'START',
            Math.max(20, Math.round(36 * UI_SCALE))
        )
            .setOrigin(0.5)
            .setTint(0xffffff);

        this.startButton.on('pointerover', () => {
            this.startButton.setFillStyle(0x1e293b, 0.95);
            this.startButtonLabel.setTint(0xfef08a);
        });

        this.startButton.on('pointerout', () => {
            this.startButton.setFillStyle(0x0f172a, 0.9);
            this.startButtonLabel.setTint(0xffffff);
        });

        const startGame = () => {
            if (this.transitioning) {
                return;
            }

            this.transitioning = true;
            this.cameras.main.fadeOut(280, 0, 0, 0);
            this.cameras.main.once(Phaser.Cameras.Scene2D.Events.FADE_OUT_COMPLETE, () => {
                this.scene.start('Game');
            });
        };

        this.startButton.on('pointerdown', startGame);
        this.input.keyboard?.once('keydown-ENTER', startGame);
    }
}
