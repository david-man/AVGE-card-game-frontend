import { Scene } from 'phaser';
import { VOLUME_CONTROL_LAYOUT } from '../config';

export const VOLUME_CONTROL_ICON_KEY = 'ui-volume-icon';
export const VOLUME_CONTROL_MUTE_ICON_KEY = 'ui-volume-mute-icon';

const VOLUME_STORAGE_KEY = 'avge-master-volume';
const VOLUME_DEFAULT = 1;
const VOLUME_MIN = 0;
const VOLUME_MAX = 1;
const MUTE_EPSILON = 0.001;

type VolumeControlPlacement = 'top-left' | 'bottom-left';

type VolumeControlOptions = {
    placement?: VolumeControlPlacement;
};

const clampVolume = (value: number): number => {
    return Phaser.Math.Clamp(value, VOLUME_MIN, VOLUME_MAX);
};

const readStoredVolume = (): number => {
    if (typeof window === 'undefined') {
        return VOLUME_DEFAULT;
    }

    const raw = window.localStorage.getItem(VOLUME_STORAGE_KEY);
    if (typeof raw !== 'string') {
        return VOLUME_DEFAULT;
    }

    const parsed = Number(raw);
    if (!Number.isFinite(parsed)) {
        return VOLUME_DEFAULT;
    }

    return clampVolume(parsed);
};

const persistVolume = (value: number): void => {
    if (typeof window === 'undefined') {
        return;
    }

    window.localStorage.setItem(VOLUME_STORAGE_KEY, String(clampVolume(value)));
};

export const preloadVolumeControlAssets = (scene: Scene, iconPath = 'icons/volume.png'): void => {
    if (!scene.textures.exists(VOLUME_CONTROL_ICON_KEY)) {
        scene.load.image(VOLUME_CONTROL_ICON_KEY, iconPath);
    }

    if (!scene.textures.exists(VOLUME_CONTROL_MUTE_ICON_KEY)) {
        scene.load.image(VOLUME_CONTROL_MUTE_ICON_KEY, 'icons/mute.png');
    }
};

export const createVolumeControlForScene = (scene: Scene, options?: VolumeControlOptions): void => {
    const initialVolume = readStoredVolume();
    scene.sound.setVolume(initialVolume);

    if (!scene.textures.exists(VOLUME_CONTROL_ICON_KEY)) {
        return;
    }

    const margin = VOLUME_CONTROL_LAYOUT.margin;
    const iconSize = VOLUME_CONTROL_LAYOUT.iconSize;
    const trackGap = VOLUME_CONTROL_LAYOUT.trackGap;
    const trackWidth = VOLUME_CONTROL_LAYOUT.trackWidth;
    const trackHeight = VOLUME_CONTROL_LAYOUT.trackHeight;
    const knobRadius = VOLUME_CONTROL_LAYOUT.knobRadius;
    const depth = VOLUME_CONTROL_LAYOUT.depth;
    const placement = options?.placement ?? 'top-left';

    const iconX = margin + (iconSize / 2);
    const sliderY = placement === 'bottom-left'
        ? scene.scale.height - margin - (iconSize / 2)
        : margin + (iconSize / 2);
    const trackLeft = iconX + (iconSize / 2) + trackGap;

    const icon = scene.add.image(iconX, sliderY, VOLUME_CONTROL_ICON_KEY)
        .setDisplaySize(iconSize, iconSize)
        .setDepth(depth + 1)
        .setInteractive({ useHandCursor: true });

    const iconRing = scene.add.circle(
        iconX,
        sliderY,
        Math.round(iconSize * VOLUME_CONTROL_LAYOUT.iconRingRadiusMultiplier),
        0xffffff,
        1
    )
        .setStrokeStyle(
            VOLUME_CONTROL_LAYOUT.iconRingStrokeWidth,
            0xffffff,
            VOLUME_CONTROL_LAYOUT.iconRingStrokeAlpha
        )
        .setDepth(depth);

    const trackBg = scene.add.rectangle(trackLeft + (trackWidth / 2), sliderY, trackWidth, trackHeight, 0x0f172a, 0.92)
        .setStrokeStyle(1, 0xffffff, 0.7)
        .setDepth(depth)
        .setInteractive({ useHandCursor: true });

    const trackFill = scene.add.rectangle(trackLeft, sliderY, Math.max(0, trackWidth * initialVolume), trackHeight, 0x38bdf8, 0.95)
        .setOrigin(0, 0.5)
        .setDepth(depth + 1);

    const knob = scene.add.circle(trackLeft + (trackWidth * initialVolume), sliderY, knobRadius, 0xffffff, 0.98)
        .setStrokeStyle(1, 0x0f172a, 0.9)
        .setDepth(depth + 2)
        .setInteractive({ useHandCursor: true });

    let currentVolume = initialVolume;
    let lastNonZeroVolume = currentVolume > MUTE_EPSILON ? currentVolume : VOLUME_DEFAULT;
    let dragging = false;

    const sliderBounds = new Phaser.Geom.Rectangle(
        trackLeft - VOLUME_CONTROL_LAYOUT.sliderHitAreaPadX,
        sliderY - (VOLUME_CONTROL_LAYOUT.sliderHitAreaHeight / 2),
        trackWidth + (VOLUME_CONTROL_LAYOUT.sliderHitAreaPadX * 2),
        VOLUME_CONTROL_LAYOUT.sliderHitAreaHeight
    );
    const iconBounds = new Phaser.Geom.Circle(
        iconX,
        sliderY,
        Math.round(iconSize * VOLUME_CONTROL_LAYOUT.iconHitRadiusMultiplier)
    );

    const setSliderVisible = (visible: boolean): void => {
        trackBg.setVisible(visible);
        trackFill.setVisible(visible);
        knob.setVisible(visible);
    };

    const syncIconTexture = (): void => {
        const muted = currentVolume <= MUTE_EPSILON;
        if (muted && scene.textures.exists(VOLUME_CONTROL_MUTE_ICON_KEY)) {
            icon.setTexture(VOLUME_CONTROL_MUTE_ICON_KEY);
            return;
        }

        icon.setTexture(VOLUME_CONTROL_ICON_KEY);
    };

    const isWithinIcon = (x: number, y: number): boolean => {
        return Phaser.Geom.Circle.Contains(iconBounds, x, y);
    };

    const isWithinSlider = (x: number, y: number): boolean => {
        return Phaser.Geom.Rectangle.Contains(sliderBounds, x, y);
    };

    const refreshSliderVisibility = (pointer?: Phaser.Input.Pointer): void => {
        if (dragging) {
            setSliderVisible(true);
            return;
        }

        if (!pointer) {
            setSliderVisible(false);
            return;
        }

        setSliderVisible(isWithinIcon(pointer.x, pointer.y) || isWithinSlider(pointer.x, pointer.y));
    };

    const setVolume = (nextVolume: number): void => {
        currentVolume = clampVolume(nextVolume);
        if (currentVolume > MUTE_EPSILON) {
            lastNonZeroVolume = currentVolume;
        }

        scene.sound.setVolume(currentVolume);
        persistVolume(currentVolume);

        trackFill.width = Math.max(0, trackWidth * currentVolume);
        knob.x = trackLeft + (trackWidth * currentVolume);
        icon.setAlpha(currentVolume <= MUTE_EPSILON ? 0.8 : 0.95);
        syncIconTexture();
    };

    const setVolumeFromPointer = (pointerX: number): void => {
        const normalized = (pointerX - trackLeft) / trackWidth;
        setVolume(normalized);
    };

    trackBg.on('pointerdown', (pointer: Phaser.Input.Pointer) => {
        setSliderVisible(true);
        dragging = true;
        setVolumeFromPointer(pointer.x);
    });

    knob.on('pointerdown', (pointer: Phaser.Input.Pointer) => {
        setSliderVisible(true);
        dragging = true;
        setVolumeFromPointer(pointer.x);
    });

    icon.on('pointerover', () => {
        setSliderVisible(true);
    });

    icon.on('pointerdown', () => {
        setSliderVisible(true);
        if (currentVolume <= MUTE_EPSILON) {
            setVolume(lastNonZeroVolume);
            return;
        }

        setVolume(0);
    });

    const handlePointerMove = (pointer: Phaser.Input.Pointer): void => {
        refreshSliderVisibility(pointer);

        if (!dragging) {
            return;
        }

        setVolumeFromPointer(pointer.x);
    };

    const endDrag = (pointer: Phaser.Input.Pointer): void => {
        dragging = false;
        refreshSliderVisibility(pointer);
    };

    const handlePointerDown = (pointer: Phaser.Input.Pointer): void => {
        if (!isWithinSlider(pointer.x, pointer.y)) {
            return;
        }

        setSliderVisible(true);
        dragging = true;
        setVolumeFromPointer(pointer.x);
    };

    setSliderVisible(false);
    scene.input.on('pointermove', handlePointerMove);
    scene.input.on('pointerdown', handlePointerDown);
    scene.input.on('pointerup', endDrag);
    scene.input.on('pointerupoutside', endDrag);

    scene.events.once('shutdown', () => {
        iconRing.destroy();
        scene.input.off('pointermove', handlePointerMove);
        scene.input.off('pointerdown', handlePointerDown);
        scene.input.off('pointerup', endDrag);
        scene.input.off('pointerupoutside', endDrag);
    });

    setVolume(currentVolume);
};