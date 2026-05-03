import { GameObjects, Scene } from 'phaser';
import { GAME_HEIGHT, GAME_WIDTH } from '../config';

const COVER_BLEED_PX = 24;

export const setImageToCover = (
    image: GameObjects.Image,
    targetWidth: number,
    targetHeight: number
): void => {
    const safeTargetWidth = Math.max(1, targetWidth) + COVER_BLEED_PX;
    const safeTargetHeight = Math.max(1, targetHeight) + COVER_BLEED_PX;
    const sourceWidth = Math.max(1, image.width);
    const sourceHeight = Math.max(1, image.height);
    const coverScale = Math.max(safeTargetWidth / sourceWidth, safeTargetHeight / sourceHeight);

    image.setDisplaySize(sourceWidth * coverScale, sourceHeight * coverScale);
};

const sceneViewportSize = (scene: Scene): { width: number; height: number } => {
    const gameSize = scene.scale.gameSize;
    return {
        width: Math.max(1, gameSize.width),
        height: Math.max(1, gameSize.height),
    };
};

export const setImageToSceneCover = (
    scene: Scene,
    image: GameObjects.Image
): void => {
    image.setScrollFactor(0);

    const apply = (): void => {
        const viewport = sceneViewportSize(scene);
        const offsetX = (viewport.width - GAME_WIDTH) * 0.5;
        const offsetY = (viewport.height - GAME_HEIGHT) * 0.5;
        scene.cameras.main.setScroll(-offsetX, -offsetY);
        image.setPosition(viewport.width * 0.5, viewport.height * 0.5);
        setImageToCover(image, viewport.width, viewport.height);
    };

    apply();

    const onResize = (): void => {
        apply();
    };

    scene.scale.on('resize', onResize);
    scene.events.once('shutdown', () => {
        scene.scale.off('resize', onResize);
    });
};