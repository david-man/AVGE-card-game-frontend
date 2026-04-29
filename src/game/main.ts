import { Game as MainGame } from './scenes/Game';
import { DeckBuilder } from './scenes/DeckBuilder';
import { Login } from './scenes/Login';
import { MainMenu } from './scenes/MainMenu';
import { Boot } from './scenes/Boot';
import { Preloader } from './scenes/Preloader';
import { AUTO, Game } from 'phaser';
import { FONT_STYLESHEET, FONT_TTF, GAME_HEIGHT, GAME_WIDTH, UI_FONT_FAMILY, UI_FONT_FAMILY_NAME } from './config';

// Modern Phaser resolution control: zoom scales the internal render resolution.

//  Find out more information about the Game Config at:
//  https://docs.phaser.io/api-documentation/typedef/types-core#gameconfig
const config: Phaser.Types.Core.GameConfig = {
    type: AUTO,
    parent: 'game-container',
    backgroundColor: '#000000',
    scale: {
        mode: Phaser.Scale.ENVELOP,
        autoCenter: Phaser.Scale.CENTER_BOTH,
        width: GAME_WIDTH,
        height: GAME_HEIGHT,
        zoom: 1
    },
    scene: [
        Boot,
        Preloader,
        Login,
        DeckBuilder,
        MainMenu,
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

const StartGame = (parent: string) => {
    installConfiguredFont();
    installGlobalPhaserTextFontDefaults();

    return new Game({ ...config, parent });

}

export default StartGame;
