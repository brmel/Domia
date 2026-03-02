/**
 * Bidirectional coordinate scaling between LLM reference space and real viewport space.
 *
 * The LLM always sees screenshots resized to the reference resolution (e.g. 1024×768).
 * When it outputs pixel coordinates, we scale them back to the real viewport.
 *
 * Approach borrowed from Anthropic's computer-use tool:
 *   realX = llmX × (realWidth / refWidth)
 */

export interface ReferenceResolution {
    readonly width: number;
    readonly height: number;
}

/** Default reference resolution matching Anthropic/OpenAI convention. */
export const DEFAULT_REFERENCE: ReferenceResolution = { width: 1024, height: 768 };

/** Scale coordinates from LLM reference space → real viewport pixels. */
export function scaleToViewport(
    llmX: number,
    llmY: number,
    realWidth: number,
    realHeight: number,
    ref: ReferenceResolution = DEFAULT_REFERENCE,
): { x: number; y: number } {
    return {
        x: Math.round(llmX * (realWidth / ref.width)),
        y: Math.round(llmY * (realHeight / ref.height)),
    };
}

/** Scale coordinates from real viewport pixels → LLM reference space. */
export function scaleToReference(
    realX: number,
    realY: number,
    realWidth: number,
    realHeight: number,
    ref: ReferenceResolution = DEFAULT_REFERENCE,
): { x: number; y: number } {
    return {
        x: Math.round(realX * (ref.width / realWidth)),
        y: Math.round(realY * (ref.height / realHeight)),
    };
}

/** Resize a screenshot buffer to the reference resolution using sharp-compatible dimensions. */
export function getReferenceSize(
    actualWidth: number,
    actualHeight: number,
    ref: ReferenceResolution = DEFAULT_REFERENCE,
): { width: number; height: number } {
    // Maintain aspect ratio: fit within reference box, scaling down only.
    if (actualWidth <= ref.width && actualHeight <= ref.height) {
        return { width: actualWidth, height: actualHeight };
    }
    const scale = Math.min(ref.width / actualWidth, ref.height / actualHeight);
    return {
        width: Math.round(actualWidth * scale),
        height: Math.round(actualHeight * scale),
    };
}
