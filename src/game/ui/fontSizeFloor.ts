import { GameObjects } from 'phaser';
import { UI_MIN_FONT_SIZE } from '../config';

let fontSizeFloorInstalled = false;

const parseFontSize = (value: number | string | undefined, fallback: number): number => {
    if (typeof value === 'number' && Number.isFinite(value)) {
        return value;
    }

    if (typeof value === 'string') {
        const parsed = Number.parseFloat(value);
        if (Number.isFinite(parsed)) {
            return parsed;
        }
    }

    return fallback;
};

const clampFontSize = (value: number): number => {
    if (!Number.isFinite(value)) {
        return UI_MIN_FONT_SIZE;
    }

    return Math.max(UI_MIN_FONT_SIZE, value);
};

export const installFontSizeFloor = (): void => {
    if (fontSizeFloorInstalled) {
        return;
    }

    fontSizeFloorInstalled = true;

    const originalBitmapSetFontSize = GameObjects.BitmapText.prototype.setFontSize;
    GameObjects.BitmapText.prototype.setFontSize = function (size: number): GameObjects.BitmapText {
        return originalBitmapSetFontSize.call(this, clampFontSize(size));
    };

    const originalTextSetFontSize = GameObjects.Text.prototype.setFontSize;
    GameObjects.Text.prototype.setFontSize = function (size: number | string): GameObjects.Text {
        const normalized = clampFontSize(parseFontSize(size, UI_MIN_FONT_SIZE));
        return originalTextSetFontSize.call(this, `${normalized}px`);
    };

    const factoryProto = GameObjects.GameObjectFactory.prototype as unknown as {
        bitmapText: (
            this: GameObjects.GameObjectFactory,
            x: number,
            y: number,
            font: string,
            text: string | string[],
            size?: number,
            align?: number
        ) => GameObjects.BitmapText;
        text: (
            this: GameObjects.GameObjectFactory,
            x: number,
            y: number,
            text?: string | string[],
            style?: Phaser.Types.GameObjects.Text.TextStyle
        ) => GameObjects.Text;
    };

    const originalFactoryBitmapText = factoryProto.bitmapText;
    factoryProto.bitmapText = function (
        this: GameObjects.GameObjectFactory,
        x: number,
        y: number,
        font: string,
        text: string | string[],
        size?: number,
        align?: number
    ): GameObjects.BitmapText {
        const normalizedSize = clampFontSize(parseFontSize(size, UI_MIN_FONT_SIZE));
        return originalFactoryBitmapText.call(this, x, y, font, text, normalizedSize, align);
    };

    const originalFactoryText = factoryProto.text;
    factoryProto.text = function (
        this: GameObjects.GameObjectFactory,
        x: number,
        y: number,
        text?: string | string[],
        style?: Phaser.Types.GameObjects.Text.TextStyle
    ): GameObjects.Text {
        const normalizedSize = clampFontSize(parseFontSize(style?.fontSize, UI_MIN_FONT_SIZE));
        const normalizedStyle: Phaser.Types.GameObjects.Text.TextStyle = {
            ...(style ?? {}),
            fontSize: `${normalizedSize}px`
        };

        return originalFactoryText.call(this, x, y, text, normalizedStyle);
    };
};
