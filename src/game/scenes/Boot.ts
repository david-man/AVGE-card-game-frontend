import { Scene } from 'phaser';
import { preloadVolumeControlAssets } from '../ui/volumeControl';

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
        preloadVolumeControlAssets(this, 'assets/icons/volume.png', 'assets/icons/mute.png');
    }

    create ()
    {
        this.scene.start('Preloader');
    }
}
