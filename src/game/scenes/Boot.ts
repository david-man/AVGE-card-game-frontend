import { Scene } from 'phaser';
import { preloadVolumeControlAssets, VOLUME_CONTROL_MUTE_ICON_KEY } from '../ui/volumeControl';

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
        preloadVolumeControlAssets(this, 'assets/icons/volume.png');
        if (!this.textures.exists(VOLUME_CONTROL_MUTE_ICON_KEY)) {
            this.load.image(VOLUME_CONTROL_MUTE_ICON_KEY, 'assets/icons/mute.png');
        }
    }

    create ()
    {
        this.scene.start('Preloader');
    }
}
