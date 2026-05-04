import { Scene } from 'phaser';

import {
    BASE_HEIGHT,
    BASE_WIDTH,
    BOARD_SCALE,
    CARD_BASE_HEIGHT,
    CARD_BASE_WIDTH,
    GAME_HEIGHT,
    GAME_WIDTH,
} from '../config';
import { CardPreviewController } from './CardPreviewController';

export type CardPreviewPanelVariant = 'standard' | 'deck-builder';

export type CardPreviewPanelFactoryOptions = {
    variant: CardPreviewPanelVariant;
    previewController?: CardPreviewController;
    previewObjectWidth?: number;
    previewObjectHeight?: number;
};

export type CardPreviewPanelFactoryResult = {
    previewController: CardPreviewController;
    previewObjectWidth: number;
    previewObjectHeight: number;
};

const isValidDimension = (value: number | undefined): value is number => {
    return typeof value === 'number' && Number.isFinite(value) && value > 0;
};

const resolvePreviewDimensions = (
    variant: CardPreviewPanelVariant,
    previewObjectWidth: number | undefined,
    previewObjectHeight: number | undefined
): { width: number; height: number; side: 'left' | 'right' } => {
    if (variant === 'deck-builder') {
        const xRatio = GAME_WIDTH / BASE_WIDTH;
        const yRatio = GAME_HEIGHT / BASE_HEIGHT;
        return {
            width: Math.round(CARD_BASE_WIDTH * xRatio * BOARD_SCALE),
            height: Math.round(CARD_BASE_HEIGHT * yRatio * BOARD_SCALE),
            side: 'left',
        };
    }

    const xRatio = GAME_WIDTH / BASE_WIDTH;
    const yRatio = GAME_HEIGHT / BASE_HEIGHT;
    return {
        width: isValidDimension(previewObjectWidth)
            ? Math.round(previewObjectWidth)
            : Math.round(CARD_BASE_WIDTH * xRatio),
        height: isValidDimension(previewObjectHeight)
            ? Math.round(previewObjectHeight)
            : Math.round(CARD_BASE_HEIGHT * yRatio),
        side: 'right',
    };
};

export const createCardPreviewPanel = (
    scene: Scene,
    options: CardPreviewPanelFactoryOptions
): CardPreviewPanelFactoryResult => {
    const previewController = options.previewController ?? new CardPreviewController(scene);
    const dimensions = resolvePreviewDimensions(
        options.variant,
        options.previewObjectWidth,
        options.previewObjectHeight
    );

    previewController.create(dimensions.width, dimensions.height, { side: dimensions.side });

    return {
        previewController,
        previewObjectWidth: dimensions.width,
        previewObjectHeight: dimensions.height,
    };
};
