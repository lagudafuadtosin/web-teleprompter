/**
 * iOS Camera Dimension Fix (Pixel Inspection)
 * 
 * Original implementation by @lagudafuadtosin
 * Source: https://github.com/lagudafuadtosin/web-teleprompter/blob/master/src/lib/camera.ts
 * 
 * On iOS Safari, the browser may initially report incorrect landscape dimensions 
 * (e.g., 1920x1080) for a portrait front-facing camera. This function bypasses 
 * the browser's incorrect metadata by drawing the first video frame to a tiny 
 * canvas and inspecting the actual pixel data to determine the true orientation.
 * 
 * @param video - The HTMLVideoElement with the attached media stream.
 * @param reportedW - The width reported by the browser/track metadata.
 * @param reportedH - The height reported by the browser/track metadata.
 * @returns The corrected dimensions { width, height }, or null if measurement fails.
 */
export function measureDrawnFrame(
  video: HTMLVideoElement,
  reportedW: number,
  reportedH: number
): { width: number; height: number } | null {
  try {
    // 1. Safety Check: Ensure video has enough data to be drawn
    if (video.readyState < 2) {
      console.warn("Video not ready for frame extraction (readyState < 2).");
      return null;
    }

    const maxDim = Math.max(reportedW, reportedH);
    const minDim = Math.min(reportedW, reportedH);
    const S = 16; // Tiny canvas size is sufficient for aspect ratio detection

    const canvas = document.createElement('canvas');
    canvas.width = S;
    canvas.height = S;
    
    // willReadFrequently optimizes performance for getImageData
    const ctx = canvas.getContext('2d', { willReadFrequently: true });
    if (!ctx) return null;

    // 2. Draw the video frame scaled to the tiny canvas
    ctx.clearRect(0, 0, S, S);
    ctx.save();
    ctx.scale(S / maxDim, S / maxDim);
    ctx.drawImage(video, 0, 0);
    ctx.restore();

    const imageData = ctx.getImageData(0, 0, S, S).data;
    
    // 3. Helper to check if a specific pixel has been painted (alpha > 0)
    const isPainted = (x: number, y: number): boolean => {
      return imageData[(y * S + x) * 4 + 3] > 0;
    };
    
    // 4. Check multiple points to be resilient against letterboxing or 1px canvas rounding artifacts
    // We check near the edges (offset by 2) rather than the absolute corners (S-1, 1)
    const checkWide = isPainted(S - 2, 2) && !isPainted(2, S - 2);
    const checkTall = isPainted(2, S - 2) && !isPainted(S - 2, 2);

    if (checkWide) {
      return { width: maxDim, height: minDim };
    }
    if (checkTall) {
      return { width: minDim, height: maxDim };
    }
    
    // Fallback: if both or neither are painted, we can't confidently determine orientation
    return null;
  } catch (error) {
    console.warn("iOS Camera dimension measurement failed:", error);
    return null;
  }
}