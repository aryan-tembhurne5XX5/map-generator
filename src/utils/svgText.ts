// src/utils/svgText.ts

export function wrapText(
    text: string,
    maxChars: number
): string[] {
    if (!text) return [];

    const words = text.split(/\s+/);
    const lines: string[] = [];
    let current = "";

    for (const word of words) {
        const candidate = current
            ? `${current} ${word}`
            : word;

        if (candidate.length > maxChars && current) {
            lines.push(current);
            current = word;
        } else {
            current = candidate;
        }
    }

    if (current) lines.push(current);

    return lines;
}

export function fitFontSize(
    text: string,
    maxWidth: number,
    baseSize: number,
    minSize = 10
): number {
    if (!text) return baseSize;

    // Only shrink when a single unwrapped line would exceed
    // the available width. Prefer wrapping in the caller.
    const estimatedWidth = text.length * baseSize * 0.58;

    if (estimatedWidth <= maxWidth) {
        return baseSize;
    }

    return Math.max(
        minSize,
        baseSize * (maxWidth / estimatedWidth)
    );
}