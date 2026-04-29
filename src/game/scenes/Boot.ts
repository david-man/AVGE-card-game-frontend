import { Scene } from 'phaser';

export class Boot extends Scene
{
    constructor ()
    {
        super('Boot');
    }

    preload ()
    {
        // Keep Boot tiny: only load what the Preloader scene needs to render.
        this.load.image('preloader-background', 'assets/background/background_element.png');
    }

    create ()
    {
        this.scene.start('Preloader');
    }
}
