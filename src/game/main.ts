import { Game as MainGame } from './scenes/Game';
import { DeckBuilder } from './scenes/DeckBuilder';
import { Login } from './scenes/Login';
import { MainMenu } from './scenes/MainMenu';
import { Tutorial } from './scenes/Tutorial';
import { Boot } from './scenes/Boot';
import { Preloader } from './scenes/Preloader';
import { AUTO, Game } from 'phaser';
import {
    FONT_STYLESHEET,
    FONT_TTF,
    resolveResponsiveGameSize,
    UI_FONT_FAMILY,
    UI_FONT_FAMILY_NAME,
    UI_RECTANGLE_CORNER_RADIUS,
    UI_RECTANGLE_CORNER_RADIUS_MAX_WIDTH_RATIO
} from './config';

const initialResponsiveGameSize = resolveResponsiveGameSize();

// Modern Phaser resolution control: zoom scales the internal render resolution.

//  Find out more information about the Game Config at:
//  https://docs.phaser.io/api-documentation/typedef/types-core#gameconfig
const config: Phaser.Types.Core.GameConfig = {
    type: AUTO,
    parent: 'game-container',
    backgroundColor: '#000000',
    scale: {
        mode: Phaser.Scale.FIT,
        autoCenter: Phaser.Scale.CENTER_BOTH,
        width: initialResponsiveGameSize.width,
        height: initialResponsiveGameSize.height,
        zoom: 1
    },
    scene: [
        Boot,
        Preloader,
        Login,
        DeckBuilder,
        MainMenu,
        Tutorial,
        MainGame
    ],
};

const installGlobalPhaserTextFontDefaults = (): void => {
    const factoryProto = Phaser.GameObjects.GameObjectFactory.prototype as Phaser.GameObjects.GameObjectFactory & {
        __avgeTextFactoryPatched__?: boolean;
    };

    if (factoryProto.__avgeTextFactoryPatched__) {
        return;
    }

    const originalTextFactory = factoryProto.text as (
        this: Phaser.GameObjects.GameObjectFactory,
        x: number,
        y: number,
        text: string | string[],
        style?: Phaser.Types.GameObjects.Text.TextStyle
    ) => Phaser.GameObjects.Text;

    factoryProto.text = function (
        this: Phaser.GameObjects.GameObjectFactory,
        x: number,
        y: number,
        text: string | string[],
        style?: Phaser.Types.GameObjects.Text.TextStyle
    ): Phaser.GameObjects.Text {
        const nextStyle: Phaser.Types.GameObjects.Text.TextStyle = style
            ? { ...style }
            : {};

        if (typeof nextStyle.fontFamily !== 'string' || nextStyle.fontFamily.trim().length === 0) {
            nextStyle.fontFamily = UI_FONT_FAMILY;
        }

        return originalTextFactory.call(this, x, y, text, nextStyle);
    };

    factoryProto.__avgeTextFactoryPatched__ = true;
};

const installGlobalPhaserRectangleRounding = (): void => {
    const factoryProto = Phaser.GameObjects.GameObjectFactory.prototype as Phaser.GameObjects.GameObjectFactory & {
        __avgeRectangleFactoryPatched__?: boolean;
    };

    if (factoryProto.__avgeRectangleFactoryPatched__) {
        return;
    }

    const originalRectangleFactory = factoryProto.rectangle as (
        this: Phaser.GameObjects.GameObjectFactory,
        x: number,
        y: number,
        width: number,
        height: number,
        fillColor?: number,
        fillAlpha?: number
    ) => Phaser.GameObjects.Rectangle;

    factoryProto.rectangle = function (
        this: Phaser.GameObjects.GameObjectFactory,
        x: number,
        y: number,
        width: number,
        height: number,
        fillColor?: number,
        fillAlpha?: number
    ): Phaser.GameObjects.Rectangle {
        const rectangle = originalRectangleFactory.call(this, x, y, width, height, fillColor, fillAlpha);
        if (UI_RECTANGLE_CORNER_RADIUS > 0) {
            const widthCapRatio = Math.max(0, UI_RECTANGLE_CORNER_RADIUS_MAX_WIDTH_RATIO);
            const widthCap = widthCapRatio > 0
                ? Math.abs(width) * widthCapRatio
                : UI_RECTANGLE_CORNER_RADIUS;
            const roundedRadius = Math.min(UI_RECTANGLE_CORNER_RADIUS, widthCap);
            if (roundedRadius > 0) {
                rectangle.setRounded(roundedRadius);
            }
        }
        return rectangle;
    };

    factoryProto.__avgeRectangleFactoryPatched__ = true;
};

const installConfiguredFont = (): void => {
    if (typeof document === 'undefined') {
        return;
    }

    const runtimeConfig = window as Window & {
        AVGE_FONT_TTF?: string;
        AVGE_FONT_STYLESHEET?: string;
    };

    const parseStylesheetHref = (source: string): string => {
        const trimmed = source.trim();
        if (!trimmed) {
            return '';
        }

        const hrefMatch = trimmed.match(/href\s*=\s*["']([^"']+)["']/i);
        if (hrefMatch && typeof hrefMatch[1] === 'string') {
            return hrefMatch[1].trim();
        }

        return trimmed;
    };

    const stylesheetLinkId = 'avge-configured-font-link';
    const fontStyleId = 'avge-configured-font-face';

    const runtimeStylesheet = typeof runtimeConfig.AVGE_FONT_STYLESHEET === 'string'
        ? runtimeConfig.AVGE_FONT_STYLESHEET
        : '';
    const runtimeTtf = typeof runtimeConfig.AVGE_FONT_TTF === 'string'
        ? runtimeConfig.AVGE_FONT_TTF
        : '';

    const stylesheetSource = runtimeStylesheet.trim() || FONT_STYLESHEET;
    const fontFileSource = runtimeTtf.trim() || FONT_TTF;

    const normalizedStylesheetHref = parseStylesheetHref(stylesheetSource);
    if (normalizedStylesheetHref) {
        let stylesheetLink = document.getElementById(stylesheetLinkId) as HTMLLinkElement | null;
        if (!stylesheetLink) {
            stylesheetLink = document.createElement('link');
            stylesheetLink.id = stylesheetLinkId;
            stylesheetLink.rel = 'stylesheet';
            document.head.appendChild(stylesheetLink);
        }
        stylesheetLink.href = normalizedStylesheetHref;

        const fontStyle = document.getElementById(fontStyleId);
        if (fontStyle) {
            fontStyle.remove();
        }
    }
    else {
        const existingStylesheetLink = document.getElementById(stylesheetLinkId);
        if (existingStylesheetLink) {
            existingStylesheetLink.remove();
        }

        const normalizedFile = fontFileSource.trim();
        if (normalizedFile) {
            const lowered = normalizedFile.toLowerCase();
            const format = lowered.endsWith('.ttf')
                ? 'truetype'
                : (lowered.endsWith('.otf') ? 'opentype' : 'truetype');

            let fontStyle = document.getElementById(fontStyleId) as HTMLStyleElement | null;
            if (!fontStyle) {
                fontStyle = document.createElement('style');
                fontStyle.id = fontStyleId;
                document.head.appendChild(fontStyle);
            }

            fontStyle.textContent = [
                '@font-face {',
                `  font-family: '${UI_FONT_FAMILY_NAME}';`,
                `  src: url('assets/${normalizedFile}') format('${format}');`,
                '  font-display: swap;',
                '}',
            ].join('\n');
        }
    }

    document.documentElement.style.setProperty('--avge-font-family', UI_FONT_FAMILY);
    document.body.style.fontFamily = UI_FONT_FAMILY;
};

const installViewportResizeSync = (game: Game): void => {
    if (typeof window === 'undefined') {
        return;
    }

    let pendingFrame: number | null = null;
    let previousWidth = game.scale.gameSize.width;
    let previousHeight = game.scale.gameSize.height;

    const applyResize = (): void => {
        pendingFrame = null;

        const nextSize = resolveResponsiveGameSize();
        if (nextSize.width !== previousWidth || nextSize.height !== previousHeight) {
            previousWidth = nextSize.width;
            previousHeight = nextSize.height;
            game.scale.setGameSize(nextSize.width, nextSize.height);
        }

        game.scale.refresh();
    };

    const scheduleResize = (): void => {
        if (pendingFrame !== null) {
            return;
        }

        pendingFrame = window.requestAnimationFrame(() => {
            applyResize();
        });
    };

    const visualViewport = window.visualViewport;
    window.addEventListener('resize', scheduleResize);
    window.addEventListener('orientationchange', scheduleResize);
    visualViewport?.addEventListener('resize', scheduleResize);
    visualViewport?.addEventListener('scroll', scheduleResize);

    game.events.once('destroy', () => {
        window.removeEventListener('resize', scheduleResize);
        window.removeEventListener('orientationchange', scheduleResize);
        visualViewport?.removeEventListener('resize', scheduleResize);
        visualViewport?.removeEventListener('scroll', scheduleResize);

        if (pendingFrame !== null) {
            window.cancelAnimationFrame(pendingFrame);
            pendingFrame = null;
        }
    });

    scheduleResize();
};

const StartGame = (parent: string) => {
    installConfiguredFont();
    installGlobalPhaserTextFontDefaults();
    installGlobalPhaserRectangleRounding();

    const game = new Game({ ...config, parent });
    installViewportResizeSync(game);
    return game;

}

export default StartGame;
