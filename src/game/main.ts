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

type InstalledFontConfig = {
    stylesheetLinkId: string;
    hasStylesheet: boolean;
};

const normalizeFontFamilyToken = (token: string): string => token.trim().replace(/^['"]+|['"]+$/g, '');

const waitForFontFamilyLoad = async (familyName: string, timeoutMs: number): Promise<boolean> => {
    if (typeof document === 'undefined' || typeof window === 'undefined') {
        return true;
    }

    const normalizedFamilyName = normalizeFontFamilyToken(familyName);
    if (!normalizedFamilyName) {
        return false;
    }

    const fontsApi = (document as Document & {
        fonts?: {
            check?: (font: string, text?: string) => boolean;
            load?: (font: string, text?: string) => Promise<unknown[]>;
        };
    }).fonts;

    if (!fontsApi || typeof fontsApi.load !== 'function') {
        return true;
    }

    const safeFamilyName = normalizedFamilyName.replace(/"/g, '\\"');
    const fontDescriptor = `16px "${safeFamilyName}"`;
    if (typeof fontsApi.check === 'function' && fontsApi.check(fontDescriptor)) {
        return true;
    }

    return await new Promise<boolean>((resolve) => {
        let settled = false;
        const timeoutId = window.setTimeout(() => {
            if (settled) {
                return;
            }
            settled = true;
            resolve(false);
        }, timeoutMs);

        void fontsApi.load?.(fontDescriptor).then((loadedFaces) => {
            if (settled) {
                return;
            }

            const loadedCount = Array.isArray(loadedFaces) ? loadedFaces.length : 0;
            const didLoad = loadedCount > 0 || (typeof fontsApi.check === 'function' && fontsApi.check(fontDescriptor));

            settled = true;
            window.clearTimeout(timeoutId);
            resolve(didLoad);
        }).catch(() => {
            if (settled) {
                return;
            }
            settled = true;
            window.clearTimeout(timeoutId);
            resolve(false);
        });
    });
};

const installConfiguredFont = (): InstalledFontConfig => {
    if (typeof document === 'undefined') {
        return {
            stylesheetLinkId: 'avge-configured-font-link',
            hasStylesheet: false,
        };
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
    const normalizedFile = fontFileSource.trim();

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
    }
    else {
        const existingStylesheetLink = document.getElementById(stylesheetLinkId);
        if (existingStylesheetLink) {
            existingStylesheetLink.remove();
        }
    }

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
    else {
        const fontStyle = document.getElementById(fontStyleId);
        if (fontStyle) {
            fontStyle.remove();
        }
    }

    document.documentElement.style.setProperty('--avge-font-family', UI_FONT_FAMILY);
    document.body.style.fontFamily = UI_FONT_FAMILY;

    return {
        stylesheetLinkId,
        hasStylesheet: normalizedStylesheetHref.length > 0,
    };
};

const waitForConfiguredFontReady = async (installedFontConfig: InstalledFontConfig): Promise<void> => {
    if (typeof document === 'undefined' || typeof window === 'undefined') {
        return;
    }

    const awaitCurrentFontSetReady = async (timeoutMs: number): Promise<boolean> => {
        const fontsApi = (document as Document & {
            fonts?: {
                ready?: Promise<unknown>;
            };
        }).fonts;
        const readyPromise = fontsApi?.ready;
        if (!readyPromise || typeof readyPromise.then !== 'function') {
            return true;
        }

        return await new Promise<boolean>((resolve) => {
            let settled = false;
            const timeoutId = window.setTimeout(() => {
                if (settled) {
                    return;
                }
                settled = true;
                resolve(false);
            }, timeoutMs);

            void readyPromise.then(() => {
                if (settled) {
                    return;
                }
                settled = true;
                window.clearTimeout(timeoutId);
                resolve(true);
            }).catch(() => {
                if (settled) {
                    return;
                }
                settled = true;
                window.clearTimeout(timeoutId);
                resolve(false);
            });
        });
    };

    const preferredFamily = normalizeFontFamilyToken(UI_FONT_FAMILY.split(',')[0] ?? '');
    if (installedFontConfig.hasStylesheet && preferredFamily) {
        const externalReady = await waitForFontFamilyLoad(preferredFamily, 2200);
        if (externalReady) {
            await awaitCurrentFontSetReady(600);
            return;
        }

        // In guest / no-cookie contexts external font CDNs can stall; remove stylesheet and rely on local face.
        const stylesheetLink = document.getElementById(installedFontConfig.stylesheetLinkId);
        if (stylesheetLink) {
            stylesheetLink.remove();
        }
    }

    await waitForFontFamilyLoad(UI_FONT_FAMILY_NAME, 2200);

    await awaitCurrentFontSetReady(600);
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
        game.scale.updateBounds();
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

const StartGame = async (parent: string): Promise<Game> => {
    const installedFontConfig = installConfiguredFont();
    await waitForConfiguredFontReady(installedFontConfig);
    installGlobalPhaserTextFontDefaults();
    installGlobalPhaserRectangleRounding();

    const game = new Game({ ...config, parent });
    installViewportResizeSync(game);
    return game;

};

export default StartGame;
