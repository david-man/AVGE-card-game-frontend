import { Scene } from 'phaser';
import { GAME_CENTER_X, GAME_CENTER_Y, UI_SCALE } from '../config';

export class GameOver extends Scene
{
    camera: Phaser.Cameras.Scene2D.Camera;
    background: Phaser.GameObjects.Image;
    gameover_text : Phaser.GameObjects.BitmapText;

    constructor ()
    {
        super('GameOver');
    }

    create ()
    {
        this.camera = this.cameras.main
        this.camera.setBackgroundColor(0xff0000);

        this.background = this.add.image(GAME_CENTER_X, GAME_CENTER_Y, 'background');
        this.background.setAlpha(0.5);

        this.gameover_text = this.add.bitmapText(GAME_CENTER_X, GAME_CENTER_Y, 'minogram', 'Game Over', Math.max(36, Math.round(64 * UI_SCALE)))
            .setOrigin(0.5)
            .setTint(0xffffff);

        this.input.once('pointerdown', () => {

            this.scene.start('MainMenu');

        });
    }
}
