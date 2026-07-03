import {
  BUBBLE_SIZE_FRACTION,
  type BubblePosition,
  type BubbleSize,
} from "../types";

/** A 2D context type that works for both on-screen and offscreen canvases. */
export type AnyCanvasContext =
  | CanvasRenderingContext2D
  | OffscreenCanvasRenderingContext2D;

export interface BubbleGeometry {
  cx: number;
  cy: number;
  radius: number;
}

/** Compute the bubble's center and radius for a given output canvas size. */
export function bubbleGeometry(
  canvasW: number,
  canvasH: number,
  position: BubblePosition,
  size: BubbleSize
): BubbleGeometry {
  const radius = (BUBBLE_SIZE_FRACTION[size] * canvasH) / 2;
  const margin = radius * 0.35;
  const left = margin + radius;
  const right = canvasW - margin - radius;
  const top = margin + radius;
  const bottom = canvasH - margin - radius;

  switch (position) {
    case "top-left":
      return { cx: left, cy: top, radius };
    case "top-right":
      return { cx: right, cy: top, radius };
    case "bottom-left":
      return { cx: left, cy: bottom, radius };
    case "bottom-right":
    default:
      return { cx: right, cy: bottom, radius };
  }
}

/**
 * Draw `source` (a video element or VideoFrame) as a circular bubble. The
 * source is cover-fit cropped to a centered square so non-square cameras aren't
 * distorted, then clipped to a circle with a subtle white ring.
 */
export function drawBubble(
  ctx: AnyCanvasContext,
  source: CanvasImageSource,
  sourceW: number,
  sourceH: number,
  geom: BubbleGeometry
): void {
  const { cx, cy, radius } = geom;
  const side = Math.min(sourceW, sourceH);
  const sx = (sourceW - side) / 2;
  const sy = (sourceH - side) / 2;
  const diameter = radius * 2;

  ctx.save();
  ctx.beginPath();
  ctx.arc(cx, cy, radius, 0, Math.PI * 2);
  ctx.closePath();
  ctx.clip();
  ctx.drawImage(
    source,
    sx,
    sy,
    side,
    side,
    cx - radius,
    cy - radius,
    diameter,
    diameter
  );
  ctx.restore();

  // Subtle ring so the bubble reads against busy backgrounds.
  ctx.save();
  ctx.beginPath();
  ctx.arc(cx, cy, radius, 0, Math.PI * 2);
  ctx.lineWidth = Math.max(2, radius * 0.04);
  ctx.strokeStyle = "rgba(255, 255, 255, 0.85)";
  ctx.stroke();
  ctx.restore();
}
