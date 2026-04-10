import { Scene, GameObjects } from 'phaser';
import { GAME_CENTER_X, GAME_CENTER_Y, GAME_HEIGHT, UI_SCALE } from '../config';

export class MainMenu extends Scene
{
    background: GameObjects.Image;
    logo: GameObjects.Image;
    title: GameObjects.BitmapText;

    constructor ()
    {
        super('MainMenu');
    }

    create ()
    {
        this.background = this.add.image(GAME_CENTER_X, GAME_CENTER_Y, 'background');

        this.logo = this.add.image(GAME_CENTER_X, Math.round(GAME_HEIGHT * 0.39), 'logo');

        this.title = this.add.bitmapText(GAME_CENTER_X, Math.round(GAME_HEIGHT * 0.6), 'minogram', 'Main Menu', Math.max(24, Math.round(38 * UI_SCALE)))
            .setOrigin(0.5)
            .setTint(0xffffff);

        this.input.once('pointerdown', () => {

            this.scene.start('Game');

        });
    }
}
