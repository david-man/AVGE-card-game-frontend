import { Scene } from 'phaser';

export const UI_CLICK_SOUND_KEY = 'ui-click';
const MASTER_VOLUME_MUTE_EPSILON = 0.001;

const SUPPRESS_UNTIL_MARKER = '__avgeUiClickSfxSuppressUntil';

type SceneWithClickMarkers = Scene & {
    [key: string]: unknown;
};

const getNowMs = (scene: Scene): number => {
    const sceneTimeNow = (scene as Scene & { time?: { now?: number } }).time?.now;
    if (typeof sceneTimeNow === 'number' && Number.isFinite(sceneTimeNow)) {
        return sceneTimeNow;
    }

    return Date.now();
};

const canPlayClickSfx = (scene: Scene): boolean => {
    if (!scene.cache.audio.exists(UI_CLICK_SOUND_KEY)) {
        return false;
    }

    if (scene.sound.locked) {
        return false;
    }

    const soundManager = scene.sound as Phaser.Sound.BaseSoundManager & {
        mute?: boolean;
        volume?: number;
    };
    if (soundManager.mute === true) {
        return false;
    }

    const masterVolume = typeof soundManager.volume === 'number' ? soundManager.volume : 1;
    if (!Number.isFinite(masterVolume) || masterVolume <= MASTER_VOLUME_MUTE_EPSILON) {
        return false;
    }

    return true;
};

export const playUiClickSoundForScene = (scene: Scene, suppressAutoMs = 0): void => {
    const sceneWithMarker = scene as SceneWithClickMarkers;
    if (suppressAutoMs > 0) {
        sceneWithMarker[SUPPRESS_UNTIL_MARKER] = getNowMs(scene) + suppressAutoMs;
    }

    if (!canPlayClickSfx(scene)) {
        return;
    }

    scene.sound.play(UI_CLICK_SOUND_KEY, { volume: 0.45 });
};

export const registerUiClickSoundForScene = (scene: Scene): void => {
    const marker = '__avgeUiClickSfxRegistered';
    const sceneWithMarker = scene as SceneWithClickMarkers;
    if (sceneWithMarker[marker] === true) {
        return;
    }

    const shouldPlayForGameObject = (gameObject: Phaser.GameObjects.GameObject | undefined): boolean => {
        if (!gameObject) {
            return false;
        }

        const inputState = (gameObject as Phaser.GameObjects.GameObject & {
            input?: {
                enabled?: boolean;
                draggable?: boolean;
                cursor?: string;
            };
        }).input;

        if (!inputState || inputState.enabled === false) {
            return false;
        }

        const clickSfxDisabled = (gameObject as Phaser.GameObjects.GameObject & {
            __avgeDisableClickSfx?: boolean;
        }).__avgeDisableClickSfx;
        if (clickSfxDisabled === true) {
            return false;
        }

        // Card drags and other drag-start interactions should stay silent.
        if (inputState.draggable === true) {
            return false;
        }

        return inputState.cursor === 'pointer';
    };

    const handleGameObjectDown = (
        _pointer: Phaser.Input.Pointer,
        gameObject: Phaser.GameObjects.GameObject
    ): void => {
        const suppressUntil = Number(sceneWithMarker[SUPPRESS_UNTIL_MARKER] ?? 0);
        if (Number.isFinite(suppressUntil) && suppressUntil > getNowMs(scene)) {
            return;
        }

        if (!shouldPlayForGameObject(gameObject)) {
            return;
        }

        if (!canPlayClickSfx(scene)) {
            return;
        }

        scene.sound.play(UI_CLICK_SOUND_KEY, { volume: 0.45 });
    };

    scene.input.on('gameobjectdown', handleGameObjectDown);
    scene.events.once('shutdown', () => {
        scene.input.off('gameobjectdown', handleGameObjectDown);
        sceneWithMarker[marker] = false;
        sceneWithMarker[SUPPRESS_UNTIL_MARKER] = 0;
    });

    sceneWithMarker[marker] = true;
};
