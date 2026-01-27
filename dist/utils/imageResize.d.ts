/**
 * Image Resize Utility
 *
 * Resizes base64 PNG images to fit within Claude API limits.
 * Claude's multi-image requests require each image to be ≤2000 pixels in any dimension.
 */
/**
 * Resize a base64 PNG image if it exceeds the maximum dimension.
 * Returns the original if already within limits or if resizing fails.
 *
 * @param base64Data - Base64 encoded PNG data (without data URL prefix)
 * @param maxDimension - Maximum allowed dimension (default: 2000)
 * @returns Resized base64 PNG data
 */
export declare function resizeImageIfNeeded(base64Data: string, maxDimension?: number): Promise<string>;
/**
 * Check image dimensions without resizing.
 * Returns null if dimensions can't be determined.
 */
export declare function getImageDimensions(base64Data: string): Promise<{
    width: number;
    height: number;
} | null>;
//# sourceMappingURL=imageResize.d.ts.map