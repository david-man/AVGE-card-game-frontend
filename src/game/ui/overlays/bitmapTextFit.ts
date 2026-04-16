import { Scene } from 'phaser';

type FitBitmapTextOptions = {
    scene: Scene;
    font: string;
    text: string;
    preferredSize: number;
    minSize: number;
    maxWidth: number;
};

type FitBitmapTextTwoLineResult = {
    text: string;
    fontSize: number;
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

    // Guard against runtime font cache races/misses. If the bitmap font is
    // unavailable, return a safe fallback size instead of probing text width.
    if (!scene.cache.bitmapFont.exists(font)) {
        return safePreferredSize;
    }

    let probe: Phaser.GameObjects.BitmapText | null = null;
    try {
        probe = scene.add.bitmapText(-10000, -10000, font, normalizedText, safePreferredSize)
            .setVisible(false)
            .setAlpha(0);
    }
    catch {
        return safePreferredSize;
    }

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

export const fitBitmapTextToTwoLines = ({
    scene,
    font,
    text,
    preferredSize,
    minSize,
    maxWidth
}: FitBitmapTextOptions): FitBitmapTextTwoLineResult => {
    const normalizedText = text.trim().replace(/\s+/g, ' ');
    const safePreferredSize = Math.max(1, Math.round(preferredSize));
    const safeMinSize = Math.max(1, Math.min(safePreferredSize, Math.round(minSize)));
    const safeMaxWidth = Math.max(1, Math.round(maxWidth));

    if (!normalizedText) {
        return { text: '', fontSize: safePreferredSize };
    }

    if (!scene.cache.bitmapFont.exists(font)) {
        return { text: normalizedText, fontSize: safePreferredSize };
    }

    const singleLineSize = fitBitmapTextToSingleLine({
        scene,
        font,
        text: normalizedText,
        preferredSize: safePreferredSize,
        minSize: safeMinSize,
        maxWidth: safeMaxWidth
    });

    let singleLineProbe: Phaser.GameObjects.BitmapText | null = null;
    try {
        singleLineProbe = scene.add.bitmapText(-10000, -10000, font, normalizedText, singleLineSize)
            .setVisible(false)
            .setAlpha(0);
    }
    catch {
        return { text: normalizedText, fontSize: singleLineSize };
    }
    const singleLineFits = singleLineProbe.width <= safeMaxWidth;
    singleLineProbe.destroy();

    const words = normalizedText.split(' ').filter((word) => word.length > 0);
    const candidates: string[] = [];

    if (words.length >= 2) {
        for (let i = 1; i < words.length; i += 1) {
            candidates.push(`${words.slice(0, i).join(' ')}\n${words.slice(i).join(' ')}`);
        }
    }
    else {
        const compact = words[0] ?? normalizedText;
        const hyphenMatches = [...compact.matchAll(/-/g)];
        if (hyphenMatches.length > 0) {
            for (const match of hyphenMatches) {
                const splitIndex = match.index ?? -1;
                if (splitIndex <= 0 || splitIndex >= compact.length - 1) {
                    continue;
                }

                const left = compact.slice(0, splitIndex).trim();
                const right = compact.slice(splitIndex + 1).trim();
                if (left && right) {
                    candidates.push(`${left}\n${right}`);
                }
            }
        }

        if (candidates.length === 0) {
            const midpoint = Math.max(1, Math.floor(compact.length / 2));
            candidates.push(`${compact.slice(0, midpoint)}\n${compact.slice(midpoint)}`);
        }
    }

    let probe: Phaser.GameObjects.BitmapText | null = null;
    try {
        probe = scene.add.bitmapText(-10000, -10000, font, '', safePreferredSize)
            .setVisible(false)
            .setAlpha(0);
    }
    catch {
        return { text: normalizedText, fontSize: singleLineSize };
    }

    let bestText = normalizedText;
    let bestSize = safeMinSize;
    let foundTwoLineFit = false;

    for (const candidate of candidates) {
        const lines = candidate.split('\n');
        if (lines.length !== 2) {
            continue;
        }

        probe.setText(candidate);
        probe.setFontSize(safePreferredSize);

        const preferredWidth = Math.max(
            probe.getTextBounds().local.width,
            ...lines.map((line) => {
                probe.setText(line);
                return probe.width;
            })
        );

        let fittedSize = safePreferredSize;
        if (preferredWidth > safeMaxWidth) {
            fittedSize = Math.max(safeMinSize, Math.floor((safePreferredSize * safeMaxWidth) / preferredWidth));
        }

        probe.setText(candidate);
        probe.setFontSize(fittedSize);
        while (probe.getTextBounds().local.width > safeMaxWidth && fittedSize > safeMinSize) {
            fittedSize -= 1;
            probe.setFontSize(fittedSize);
        }

        if (probe.getTextBounds().local.width <= safeMaxWidth && fittedSize >= bestSize) {
            bestText = candidate;
            bestSize = fittedSize;
            foundTwoLineFit = true;
        }
    }

    probe.destroy();

    const prefersTwoLine = words.length >= 2;
    if (foundTwoLineFit) {
        // Prefer two-line layout for multi-word labels when readability is at
        // least comparable to single-line sizing.
        if (prefersTwoLine && bestSize >= singleLineSize - 1) {
            return { text: bestText, fontSize: bestSize };
        }

        if (!singleLineFits || bestSize > singleLineSize) {
            return { text: bestText, fontSize: bestSize };
        }
    }

    return { text: normalizedText, fontSize: singleLineSize };
};