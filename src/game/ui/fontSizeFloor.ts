import { GameObjects } from 'phaser';
import { UI_MIN_FONT_SIZE, UI_TEXT_RESOLUTION_MAX } from '../config';

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

const resolveDefaultTextResolution = (): number => {
    const pixelRatio = globalThis.window?.devicePixelRatio;
    if (typeof pixelRatio !== 'number' || !Number.isFinite(pixelRatio)) {
        return 1;
    }

    return Math.min(UI_TEXT_RESOLUTION_MAX, Math.max(1, pixelRatio));
};

const parseResolution = (value: number | string | undefined): number | null => {
    if (typeof value === 'number' && Number.isFinite(value)) {
        return value;
    }

    if (typeof value === 'string') {
        const parsed = Number.parseFloat(value);
        if (Number.isFinite(parsed)) {
            return parsed;
        }
    }

    return null;
};

const clampResolution = (value: number): number => {
    if (!Number.isFinite(value)) {
        return 1;
    }

    return Math.min(UI_TEXT_RESOLUTION_MAX, Math.max(1, value));
};

export const installFontSizeFloor = (): void => {
    if (fontSizeFloorInstalled) {
        return;
    }

    fontSizeFloorInstalled = true;

    const originalTextSetFontSize = GameObjects.Text.prototype.setFontSize;
    GameObjects.Text.prototype.setFontSize = function (size: number | string): GameObjects.Text {
        const normalized = clampFontSize(parseFontSize(size, UI_MIN_FONT_SIZE));
        return originalTextSetFontSize.call(this, `${normalized}px`);
    };

    Object.defineProperty(GameObjects.Text.prototype, 'fontSize', {
        configurable: true,
        enumerable: true,
        get(this: GameObjects.Text): number {
            return parseFontSize(this.style.fontSize, UI_MIN_FONT_SIZE);
        },
        set(this: GameObjects.Text, value: number) {
            this.setFontSize(clampFontSize(parseFontSize(value, UI_MIN_FONT_SIZE)));
        }
    });

    const factoryProto = GameObjects.GameObjectFactory.prototype as unknown as {
        text: (
            this: GameObjects.GameObjectFactory,
            x: number,
            y: number,
            text?: string | string[],
            style?: Phaser.Types.GameObjects.Text.TextStyle
        ) => GameObjects.Text;
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
        const normalizedResolution = clampResolution(parseResolution(style?.resolution) ?? resolveDefaultTextResolution());
        const normalizedStyle: Phaser.Types.GameObjects.Text.TextStyle = {
            ...(style ?? {}),
            fontSize: `${normalizedSize}px`,
            resolution: normalizedResolution
        };

        const textObject = originalFactoryText.call(this, x, y, text, normalizedStyle);
        textObject.setResolution(normalizedResolution);
        return textObject;
    };
};
