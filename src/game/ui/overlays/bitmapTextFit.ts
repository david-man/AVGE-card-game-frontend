import { Scene } from 'phaser';
import { UI_MIN_FONT_SIZE } from '../../config';

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

const BITMAP_FONT_SIZE_STEP = 0.25;
const BITMAP_FONT_EPSILON = 0.0001;
const BITMAP_FONT_SMALL_SIZE_THRESHOLD = Math.max(UI_MIN_FONT_SIZE, 12);
const BITMAP_FONT_SMALL_SIZE_STEP = 1;

const getBitmapFontSizeStep = (value: number): number => {
    return value <= BITMAP_FONT_SMALL_SIZE_THRESHOLD
        ? BITMAP_FONT_SMALL_SIZE_STEP
        : BITMAP_FONT_SIZE_STEP;
};

const quantizeBitmapFontSize = (value: number): number => {
    if (!Number.isFinite(value)) {
        return UI_MIN_FONT_SIZE;
    }

    // Bitmap fonts lose thin strokes quickly when rendered at tiny fractional
    // scales, so snap small sizes to whole numbers for crisper glyphs.
    const step = getBitmapFontSizeStep(value);
    const snapped = Math.round(value / step) * step;
    return Math.max(UI_MIN_FONT_SIZE, snapped);
};

const normalizePreferredBitmapFontSize = (value: number): number => {
    return quantizeBitmapFontSize(Math.max(UI_MIN_FONT_SIZE, value));
};

const normalizeMinBitmapFontSize = (value: number, preferredSize: number): number => {
    return Math.max(UI_MIN_FONT_SIZE, Math.min(preferredSize, quantizeBitmapFontSize(Math.max(UI_MIN_FONT_SIZE, value))));
};

const getBitmapFontSizeCandidatesDescending = (preferredSize: number, minSize: number): number[] => {
    const candidates: number[] = [];
    let current = quantizeBitmapFontSize(preferredSize);
    const floor = quantizeBitmapFontSize(minSize);

    candidates.push(current);

    while (current > floor + BITMAP_FONT_EPSILON) {
        const step = getBitmapFontSizeStep(current);
        const next = Math.max(floor, quantizeBitmapFontSize(current - step));
        if (next >= current - BITMAP_FONT_EPSILON) {
            break;
        }

        candidates.push(next);
        current = next;
    }

    if (candidates[candidates.length - 1] > floor + BITMAP_FONT_EPSILON) {
        candidates.push(floor);
    }

    return candidates;
};

type FitBitmapTextMultiLineOptions = FitBitmapTextOptions & {
    maxLines: number;
};

export type FitBitmapTextMultiLineResult = {
    text: string;
    fontSize: number;
    lineCount: number;
};

const measureBitmapTextWidth = (probe: Phaser.GameObjects.BitmapText, value: string): number => {
    probe.setText(value);
    return probe.width;
};

const splitBitmapWordToWidth = (
    probe: Phaser.GameObjects.BitmapText,
    word: string,
    maxWidth: number
): string[] => {
    if (!word) {
        return [];
    }

    if (measureBitmapTextWidth(probe, word) <= maxWidth) {
        return [word];
    }

    const chunks: string[] = [];
    let current = '';

    for (const char of word) {
        const candidate = `${current}${char}`;
        if (!current || measureBitmapTextWidth(probe, candidate) <= maxWidth) {
            current = candidate;
            continue;
        }

        chunks.push(current);
        current = char;
    }

    if (current) {
        chunks.push(current);
    }

    return chunks;
};

const wrapBitmapTextToWidth = (
    probe: Phaser.GameObjects.BitmapText,
    normalizedText: string,
    maxWidth: number
): string[] => {
    if (!normalizedText) {
        return [''];
    }

    const words = normalizedText.split(' ').filter((word) => word.length > 0);
    if (words.length === 0) {
        return [''];
    }

    const lines: string[] = [];
    let currentLine = '';

    const flushCurrentLine = (): void => {
        if (!currentLine) {
            return;
        }

        lines.push(currentLine);
        currentLine = '';
    };

    for (const word of words) {
        const chunks = splitBitmapWordToWidth(probe, word, maxWidth);

        for (let i = 0; i < chunks.length; i += 1) {
            const chunk = chunks[i];
            const separator = currentLine
                ? (i === 0 ? ' ' : '')
                : '';
            const candidate = currentLine
                ? `${currentLine}${separator}${chunk}`
                : chunk;

            if (!currentLine || measureBitmapTextWidth(probe, candidate) <= maxWidth) {
                currentLine = candidate;
                continue;
            }

            flushCurrentLine();
            currentLine = chunk;
        }
    }

    flushCurrentLine();
    return lines.length > 0 ? lines : [''];
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
    const safePreferredSize = normalizePreferredBitmapFontSize(preferredSize);
    const safeMinSize = normalizeMinBitmapFontSize(minSize, safePreferredSize);
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

    let nextSize = quantizeBitmapFontSize(Math.max(safeMinSize, (safePreferredSize * safeMaxWidth) / measuredWidth));
    probe.setFontSize(nextSize);
    measuredWidth = probe.width;

    while (measuredWidth > safeMaxWidth && nextSize > safeMinSize + BITMAP_FONT_EPSILON) {
        const candidateSize = Math.max(safeMinSize, quantizeBitmapFontSize(nextSize - getBitmapFontSizeStep(nextSize)));
        if (candidateSize >= nextSize - BITMAP_FONT_EPSILON) {
            break;
        }

        nextSize = candidateSize;
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
    const safePreferredSize = normalizePreferredBitmapFontSize(preferredSize);
    const safeMinSize = normalizeMinBitmapFontSize(minSize, safePreferredSize);
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
            fittedSize = quantizeBitmapFontSize(Math.max(safeMinSize, (safePreferredSize * safeMaxWidth) / preferredWidth));
        }

        probe.setText(candidate);
        probe.setFontSize(fittedSize);
        while (probe.getTextBounds().local.width > safeMaxWidth && fittedSize > safeMinSize + BITMAP_FONT_EPSILON) {
            const candidateSize = Math.max(safeMinSize, quantizeBitmapFontSize(fittedSize - getBitmapFontSizeStep(fittedSize)));
            if (candidateSize >= fittedSize - BITMAP_FONT_EPSILON) {
                break;
            }

            fittedSize = candidateSize;
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

export const fitBitmapTextToMultiLine = ({
    scene,
    font,
    text,
    preferredSize,
    minSize,
    maxWidth,
    maxLines
}: FitBitmapTextMultiLineOptions): FitBitmapTextMultiLineResult => {
    const normalizedText = text.trim().replace(/\s+/g, ' ');
    const safePreferredSize = normalizePreferredBitmapFontSize(preferredSize);
    const safeMinSize = normalizeMinBitmapFontSize(minSize, safePreferredSize);
    const safeMaxWidth = Math.max(1, Math.round(maxWidth));
    const safeMaxLines = Math.max(1, Math.round(maxLines));

    if (!normalizedText) {
        return { text: '', fontSize: safePreferredSize, lineCount: 0 };
    }

    if (!scene.cache.bitmapFont.exists(font)) {
        return { text: normalizedText, fontSize: safePreferredSize, lineCount: 1 };
    }

    let probe: Phaser.GameObjects.BitmapText | null = null;
    try {
        probe = scene.add.bitmapText(-10000, -10000, font, normalizedText, safePreferredSize)
            .setVisible(false)
            .setAlpha(0);
    }
    catch {
        return { text: normalizedText, fontSize: safePreferredSize, lineCount: 1 };
    }

    probe.setFontSize(safePreferredSize);
    if (measureBitmapTextWidth(probe, normalizedText) <= safeMaxWidth) {
        probe.destroy();
        return { text: normalizedText, fontSize: safePreferredSize, lineCount: 1 };
    }

    let bestLines: string[] | null = null;
    let bestSize = safeMinSize;
    const sizeCandidates = getBitmapFontSizeCandidatesDescending(safePreferredSize, safeMinSize);

    for (const size of sizeCandidates) {
        probe.setFontSize(size);
        const wrappedLines = wrapBitmapTextToWidth(probe, normalizedText, safeMaxWidth);
        if (wrappedLines.length <= safeMaxLines) {
            bestLines = wrappedLines;
            bestSize = size;
            break;
        }
    }

    if (!bestLines) {
        probe.setFontSize(safeMinSize);
        bestLines = wrapBitmapTextToWidth(probe, normalizedText, safeMaxWidth);
        bestSize = safeMinSize;
    }

    probe.destroy();

    if (bestLines.length <= 1) {
        const singleLineSize = fitBitmapTextToSingleLine({
            scene,
            font,
            text: normalizedText,
            preferredSize: bestSize,
            minSize: safeMinSize,
            maxWidth: safeMaxWidth
        });
        return {
            text: normalizedText,
            fontSize: singleLineSize,
            lineCount: 1
        };
    }

    return {
        text: bestLines.join('\n'),
        fontSize: bestSize,
        lineCount: bestLines.length
    };
};