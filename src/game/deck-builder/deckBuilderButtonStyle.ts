import { GameObjects } from 'phaser';

type DeckBuilderButtonStyle = {
    fillColor: number;
    fillAlpha: number;
    labelTint?: number;
    labelAlpha?: number;
};

export const applyButtonStyle = (
    button: GameObjects.Rectangle,
    label: GameObjects.Text | null | undefined,
    style: DeckBuilderButtonStyle
): void => {
    button.setFillStyle(style.fillColor, style.fillAlpha);
    if (!label) {
        return;
    }

    if (typeof style.labelTint === 'number') {
        label.setTint(style.labelTint);
    }

    if (typeof style.labelAlpha === 'number') {
        label.setAlpha(style.labelAlpha);
    }
};

export const bindHoverHighlight = (
    button: GameObjects.Rectangle,
    label: GameObjects.Text | null | undefined,
    getBaseStyle: () => DeckBuilderButtonStyle,
    getHoverStyle: () => DeckBuilderButtonStyle,
    isEnabled?: () => boolean
): void => {
    const applyBaseStyle = (): void => {
        applyButtonStyle(button, label, getBaseStyle());
    };

    button.on('pointerover', () => {
        if (isEnabled && !isEnabled()) {
            applyBaseStyle();
            return;
        }

        applyButtonStyle(button, label, getHoverStyle());
    });

    button.on('pointerout', () => {
        applyBaseStyle();
    });

    applyBaseStyle();
};
