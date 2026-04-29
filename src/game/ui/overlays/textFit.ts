import { Scene } from 'phaser';
import { UI_FONT_FAMILY, UI_MIN_FONT_SIZE } from '../../config';

type FitTextOptions = {
    scene: Scene;
    text: string;
    preferredSize: number;
    minSize: number;
    maxWidth: number;
};

type FitTextTwoLineResult = {
    text: string;
    fontSize: number;
};

const TEXT_FONT_SIZE_STEP = 0.25;
const TEXT_FONT_EPSILON = 0.0001;
const TEXT_FONT_SMALL_SIZE_THRESHOLD = Math.max(UI_MIN_FONT_SIZE, 12);
const TEXT_FONT_SMALL_SIZE_STEP = 1;

const getTextFontSizeStep = (value: number): number => {
    return value <= TEXT_FONT_SMALL_SIZE_THRESHOLD
        ? TEXT_FONT_SMALL_SIZE_STEP
        : TEXT_FONT_SIZE_STEP;
};

const quantizeTextFontSize = (value: number): number => {
    if (!Number.isFinite(value)) {
        return UI_MIN_FONT_SIZE;
    }

    // Tiny fractional sizes can reduce legibility, so snap small sizes to whole numbers.
    const step = getTextFontSizeStep(value);
    const snapped = Math.round(value / step) * step;
    return Math.max(UI_MIN_FONT_SIZE, snapped);
};

const normalizePreferredTextFontSize = (value: number): number => {
    return quantizeTextFontSize(Math.max(UI_MIN_FONT_SIZE, value));
};

const normalizeMinTextFontSize = (value: number, preferredSize: number): number => {
    return Math.max(UI_MIN_FONT_SIZE, Math.min(preferredSize, quantizeTextFontSize(Math.max(UI_MIN_FONT_SIZE, value))));
};

const getTextFontSizeCandidatesDescending = (preferredSize: number, minSize: number): number[] => {
    const candidates: number[] = [];
    let current = quantizeTextFontSize(preferredSize);
    const floor = quantizeTextFontSize(minSize);

    candidates.push(current);

    while (current > floor + TEXT_FONT_EPSILON) {
        const step = getTextFontSizeStep(current);
        const next = Math.max(floor, quantizeTextFontSize(current - step));
        if (next >= current - TEXT_FONT_EPSILON) {
            break;
        }

        candidates.push(next);
        current = next;
    }

    if (candidates[candidates.length - 1] > floor + TEXT_FONT_EPSILON) {
        candidates.push(floor);
    }

    return candidates;
};

type FitTextMultiLineOptions = FitTextOptions & {
    maxLines: number;
};

export type FitTextMultiLineResult = {
    text: string;
    fontSize: number;
    lineCount: number;
};

const measureTextWidth = (probe: Phaser.GameObjects.Text, value: string): number => {
    probe.setText(value);
    return probe.width;
};

const createTextProbe = (scene: Scene, initialText: string, fontSize: number): Phaser.GameObjects.Text => {
    return scene.add.text(-10000, -10000, initialText, {
        fontFamily: UI_FONT_FAMILY,
        fontSize: `${Math.max(UI_MIN_FONT_SIZE, fontSize)}px`,
        color: '#ffffff'
    })
        .setVisible(false)
        .setAlpha(0);
};

const sceneTextProbeCache = new WeakMap<Scene, Phaser.GameObjects.Text>();

const isReusableProbe = (
    scene: Scene,
    probe: Phaser.GameObjects.Text | undefined
): probe is Phaser.GameObjects.Text => {
    return Boolean(probe && probe.active && probe.scene === scene);
};

const getReusableTextProbe = (
    scene: Scene,
    initialText: string,
    fontSize: number
): Phaser.GameObjects.Text => {
    const cachedProbe = sceneTextProbeCache.get(scene);
    if (isReusableProbe(scene, cachedProbe)) {
        cachedProbe.setText(initialText);
        cachedProbe.setFontSize(fontSize);
        return cachedProbe;
    }

    const probe = createTextProbe(scene, initialText, fontSize);
    sceneTextProbeCache.set(scene, probe);

    const cleanupProbe = (): void => {
        const currentProbe = sceneTextProbeCache.get(scene);
        if (currentProbe === probe) {
            sceneTextProbeCache.delete(scene);
        }

        if (probe.active) {
            probe.destroy();
        }
    };

    scene.events.once('shutdown', cleanupProbe);
    scene.events.once('destroy', cleanupProbe);
    return probe;
};

const splitWordToWidth = (
    probe: Phaser.GameObjects.Text,
    word: string,
    maxWidth: number
): string[] => {
    if (!word) {
        return [];
    }

    if (measureTextWidth(probe, word) <= maxWidth) {
        return [word];
    }

    const chunks: string[] = [];
    let current = '';

    for (const char of word) {
        const candidate = `${current}${char}`;
        if (!current || measureTextWidth(probe, candidate) <= maxWidth) {
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

const wrapTextToWidth = (
    probe: Phaser.GameObjects.Text,
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
        const chunks = splitWordToWidth(probe, word, maxWidth);

        for (let i = 0; i < chunks.length; i += 1) {
            const chunk = chunks[i];
            const separator = currentLine
                ? (i === 0 ? ' ' : '')
                : '';
            const candidate = currentLine
                ? `${currentLine}${separator}${chunk}`
                : chunk;

            if (!currentLine || measureTextWidth(probe, candidate) <= maxWidth) {
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

const resolveEllipsisForWidth = (
    probe: Phaser.GameObjects.Text,
    maxWidth: number
): string => {
    const ellipsisCandidates = ['...', '..', '.'];
    for (const candidate of ellipsisCandidates) {
        if (measureTextWidth(probe, candidate) <= maxWidth) {
            return candidate;
        }
    }

    return '';
};

const clampWrappedLinesToMax = (
    probe: Phaser.GameObjects.Text,
    wrappedLines: string[],
    maxLines: number,
    maxWidth: number
): string[] => {
    if (wrappedLines.length <= maxLines) {
        return wrappedLines;
    }

    const clamped = wrappedLines.slice(0, maxLines);
    const ellipsis = resolveEllipsisForWidth(probe, maxWidth);
    if (!ellipsis) {
        return clamped;
    }

    const lastIndex = clamped.length - 1;
    let base = clamped[lastIndex].trimEnd();

    if (!base) {
        clamped[lastIndex] = ellipsis;
        return clamped;
    }

    while (base.length > 0) {
        const candidate = `${base}${ellipsis}`;
        if (measureTextWidth(probe, candidate) <= maxWidth) {
            clamped[lastIndex] = candidate;
            return clamped;
        }

        base = base.slice(0, -1).trimEnd();
    }

    clamped[lastIndex] = ellipsis;
    return clamped;
};

export const fitTextToSingleLine = ({
    scene,
    text,
    preferredSize,
    minSize,
    maxWidth
}: FitTextOptions): number => {

    const normalizedText = text.trim();
    const safePreferredSize = normalizePreferredTextFontSize(preferredSize);
    const safeMinSize = normalizeMinTextFontSize(minSize, safePreferredSize);
    const safeMaxWidth = Math.max(1, Math.round(maxWidth));

    if (!normalizedText) {
        return safePreferredSize;
    }

    let probe: Phaser.GameObjects.Text;
    try {
        probe = getReusableTextProbe(scene, normalizedText, safePreferredSize);
    }
    catch {
        return safePreferredSize;
    }

    let measuredWidth = probe.width;
    if (measuredWidth <= 0 || measuredWidth <= safeMaxWidth) {
        return safePreferredSize;
    }

    let nextSize = quantizeTextFontSize(Math.max(safeMinSize, (safePreferredSize * safeMaxWidth) / measuredWidth));
    probe.setFontSize(nextSize);
    measuredWidth = probe.width;

    while (measuredWidth > safeMaxWidth && nextSize > safeMinSize + TEXT_FONT_EPSILON) {
        const candidateSize = Math.max(safeMinSize, quantizeTextFontSize(nextSize - getTextFontSizeStep(nextSize)));
        if (candidateSize >= nextSize - TEXT_FONT_EPSILON) {
            break;
        }

        nextSize = candidateSize;
        probe.setFontSize(nextSize);
        measuredWidth = probe.width;
    }

    return nextSize;
};

export const fitTextToTwoLines = ({
    scene,
    text,
    preferredSize,
    minSize,
    maxWidth
}: FitTextOptions): FitTextTwoLineResult => {
    const normalizedText = text.trim().replace(/\s+/g, ' ');
    const safePreferredSize = normalizePreferredTextFontSize(preferredSize);
    const safeMinSize = normalizeMinTextFontSize(minSize, safePreferredSize);
    const safeMaxWidth = Math.max(1, Math.round(maxWidth));

    if (!normalizedText) {
        return { text: '', fontSize: safePreferredSize };
    }

    const singleLineSize = fitTextToSingleLine({
        scene,
        text: normalizedText,
        preferredSize: safePreferredSize,
        minSize: safeMinSize,
        maxWidth: safeMaxWidth
    });

    let probe: Phaser.GameObjects.Text;
    try {
        probe = getReusableTextProbe(scene, normalizedText, singleLineSize);
    }
    catch {
        return { text: normalizedText, fontSize: singleLineSize };
    }
    const singleLineFits = probe.width <= safeMaxWidth;

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

    probe.setText('');
    probe.setFontSize(safePreferredSize);

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
            probe.width,
            ...lines.map((line) => {
                probe.setText(line);
                return probe.width;
            })
        );

        let fittedSize = safePreferredSize;
        if (preferredWidth > safeMaxWidth) {
            fittedSize = quantizeTextFontSize(Math.max(safeMinSize, (safePreferredSize * safeMaxWidth) / preferredWidth));
        }

        probe.setText(candidate);
        probe.setFontSize(fittedSize);
        while (probe.width > safeMaxWidth && fittedSize > safeMinSize + TEXT_FONT_EPSILON) {
            const candidateSize = Math.max(safeMinSize, quantizeTextFontSize(fittedSize - getTextFontSizeStep(fittedSize)));
            if (candidateSize >= fittedSize - TEXT_FONT_EPSILON) {
                break;
            }

            fittedSize = candidateSize;
            probe.setFontSize(fittedSize);
        }

        if (probe.width <= safeMaxWidth && fittedSize >= bestSize) {
            bestText = candidate;
            bestSize = fittedSize;
            foundTwoLineFit = true;
        }
    }

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

export const fitTextToMultiLine = ({
    scene,
    text,
    preferredSize,
    minSize,
    maxWidth,
    maxLines
}: FitTextMultiLineOptions): FitTextMultiLineResult => {
    const normalizedText = text.trim().replace(/\s+/g, ' ');
    const safePreferredSize = normalizePreferredTextFontSize(preferredSize);
    const safeMinSize = normalizeMinTextFontSize(minSize, safePreferredSize);
    const safeMaxWidth = Math.max(1, Math.round(maxWidth));
    const safeMaxLines = Math.max(1, Math.round(maxLines));

    if (!normalizedText) {
        return { text: '', fontSize: safePreferredSize, lineCount: 0 };
    }

    let probe: Phaser.GameObjects.Text;
    try {
        probe = getReusableTextProbe(scene, normalizedText, safePreferredSize);
    }
    catch {
        return { text: normalizedText, fontSize: safePreferredSize, lineCount: 1 };
    }

    probe.setFontSize(safePreferredSize);
    if (measureTextWidth(probe, normalizedText) <= safeMaxWidth) {
        return { text: normalizedText, fontSize: safePreferredSize, lineCount: 1 };
    }

    let bestLines: string[] | null = null;
    let bestSize = safeMinSize;
    const sizeCandidates = getTextFontSizeCandidatesDescending(safePreferredSize, safeMinSize);

    for (const size of sizeCandidates) {
        probe.setFontSize(size);
        const wrappedLines = wrapTextToWidth(probe, normalizedText, safeMaxWidth);
        if (wrappedLines.length <= safeMaxLines) {
            bestLines = wrappedLines;
            bestSize = size;
            break;
        }
    }

    if (!bestLines) {
        probe.setFontSize(safeMinSize);
        bestLines = wrapTextToWidth(probe, normalizedText, safeMaxWidth);
        bestSize = safeMinSize;
    }

    const finalLines = clampWrappedLinesToMax(probe, bestLines, safeMaxLines, safeMaxWidth);

    if (finalLines.length <= 1) {
        const singleLineText = finalLines[0] ?? normalizedText;
        const singleLineSize = fitTextToSingleLine({
            scene,
            text: singleLineText,
            preferredSize: bestSize,
            minSize: safeMinSize,
            maxWidth: safeMaxWidth
        });
        return {
            text: singleLineText,
            fontSize: singleLineSize,
            lineCount: singleLineText.length > 0 ? 1 : 0
        };
    }

    return {
        text: finalLines.join('\n'),
        fontSize: bestSize,
        lineCount: finalLines.length
    };
};