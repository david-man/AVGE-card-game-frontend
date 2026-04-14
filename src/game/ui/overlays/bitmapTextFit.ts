import { Scene } from 'phaser';

type FitBitmapTextOptions = {
    scene: Scene;
    font: string;
    text: string;
    preferredSize: number;
    minSize: number;
    maxWidth: number;
};

export const fitBitmapTextToSingleLine = ({
    scene,
    font,
    text,
    preferredSize,
    minSize,
    maxWidth
}: FitBitmapTextOptions): number => {
    const normalizedText = text.trim();
    const safePreferredSize = Math.max(1, Math.round(preferredSize));
    const safeMinSize = Math.max(1, Math.min(safePreferredSize, Math.round(minSize)));
    const safeMaxWidth = Math.max(1, Math.round(maxWidth));

    if (!normalizedText) {
        return safePreferredSize;
    }

    const probe = scene.add.bitmapText(-10000, -10000, font, normalizedText, safePreferredSize)
        .setVisible(false)
        .setAlpha(0);

    let measuredWidth = probe.width;
    if (measuredWidth <= 0 || measuredWidth <= safeMaxWidth) {
        probe.destroy();
        return safePreferredSize;
    }

    let nextSize = Math.max(safeMinSize, Math.floor((safePreferredSize * safeMaxWidth) / measuredWidth));
    probe.setFontSize(nextSize);
    measuredWidth = probe.width;

    while (measuredWidth > safeMaxWidth && nextSize > safeMinSize) {
        nextSize -= 1;
        probe.setFontSize(nextSize);
        measuredWidth = probe.width;
    }

    probe.destroy();
    return nextSize;
};