import {
  BUBBLE_SIZE_FRACTION,
  type BubblePosition,
  type BubbleSize,
} from "../types";

export interface CompositorOptions {
  screenStream: MediaStream;
  webcamStream: MediaStream | null;
  position: BubblePosition;
  size: BubbleSize;
  /** Output frame rate for the composited canvas stream. */
  fps?: number;
}

/**
 * Composites the screen video full-frame with a circular webcam "bubble" drawn
 * on top, using a hidden canvas driven by requestAnimationFrame. The resulting
 * canvas can be exposed as a MediaStream for recording, or used to paint a live
 * preview into a visible canvas.
 */
export class Compositor {
  private canvas: HTMLCanvasElement;
  private ctx: CanvasRenderingContext2D;
  private screenVideo: HTMLVideoElement;
  private webcamVideo: HTMLVideoElement | null = null;
  private rafId: number | null = null;
  private fps: number;

  position: BubblePosition;
  size: BubbleSize;

  constructor(opts: CompositorOptions) {
    this.position = opts.position;
    this.size = opts.size;
    this.fps = opts.fps ?? 30;

    this.canvas = document.createElement("canvas");
    const ctx = this.canvas.getContext("2d", { alpha: false });
    if (!ctx) throw new Error("Could not get 2D canvas context.");
    this.ctx = ctx;

    this.screenVideo = createHiddenVideo(opts.screenStream);
    if (opts.webcamStream) {
      this.webcamVideo = createHiddenVideo(opts.webcamStream);
    }
  }

  /** Wait until the hidden videos report dimensions, then size the canvas. */
  async start(): Promise<void> {
    await waitForVideo(this.screenVideo);
    if (this.webcamVideo) await waitForVideo(this.webcamVideo);

    this.resizeCanvasToScreen();
    this.loop();
  }

  private resizeCanvasToScreen(): void {
    const w = this.screenVideo.videoWidth || 1280;
    const h = this.screenVideo.videoHeight || 720;
    if (this.canvas.width !== w || this.canvas.height !== h) {
      this.canvas.width = w;
      this.canvas.height = h;
    }
  }

  private loop = (): void => {
    this.drawFrame();
    this.rafId = requestAnimationFrame(this.loop);
  };

  /** Draw one composited frame. Public so a paused preview can repaint on demand. */
  drawFrame(): void {
    // The shared screen can change resolution (e.g. switching windows).
    this.resizeCanvasToScreen();
    const { ctx, canvas } = this;
    const cw = canvas.width;
    const ch = canvas.height;

    ctx.fillStyle = "#000";
    ctx.fillRect(0, 0, cw, ch);

    if (this.screenVideo.readyState >= 2) {
      ctx.drawImage(this.screenVideo, 0, 0, cw, ch);
    }

    if (this.webcamVideo && this.webcamVideo.readyState >= 2) {
      this.drawBubble();
    }
  }

  private drawBubble(): void {
    const { ctx, canvas } = this;
    const webcam = this.webcamVideo!;
    const radius = (BUBBLE_SIZE_FRACTION[this.size] * canvas.height) / 2;
    const margin = radius * 0.35;
    const { cx, cy } = this.bubbleCenter(radius, margin);

    // Cover-fit crop so a non-square webcam fills the circle without distortion.
    const vw = webcam.videoWidth;
    const vh = webcam.videoHeight;
    const side = Math.min(vw, vh);
    const sx = (vw - side) / 2;
    const sy = (vh - side) / 2;
    const diameter = radius * 2;

    ctx.save();
    ctx.beginPath();
    ctx.arc(cx, cy, radius, 0, Math.PI * 2);
    ctx.closePath();
    ctx.clip();
    ctx.drawImage(
      webcam,
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

  private bubbleCenter(
    radius: number,
    margin: number
  ): { cx: number; cy: number } {
    const { width: w, height: h } = this.canvas;
    const left = margin + radius;
    const right = w - margin - radius;
    const top = margin + radius;
    const bottom = h - margin - radius;
    switch (this.position) {
      case "top-left":
        return { cx: left, cy: top };
      case "top-right":
        return { cx: right, cy: top };
      case "bottom-left":
        return { cx: left, cy: bottom };
      case "bottom-right":
      default:
        return { cx: right, cy: bottom };
    }
  }

  /** A MediaStream of the composited canvas, suitable for MediaRecorder. */
  getStream(): MediaStream {
    return this.canvas.captureStream(this.fps);
  }

  /** Copy the latest composited frame into a visible preview canvas. */
  paintPreview(target: HTMLCanvasElement): void {
    if (target.width !== this.canvas.width) target.width = this.canvas.width;
    if (target.height !== this.canvas.height) target.height = this.canvas.height;
    const tctx = target.getContext("2d");
    if (tctx) tctx.drawImage(this.canvas, 0, 0);
  }

  get outputSize(): { width: number; height: number } {
    return { width: this.canvas.width, height: this.canvas.height };
  }

  /** Stop the render loop and detach hidden videos. Does NOT stop the source tracks. */
  stop(): void {
    if (this.rafId !== null) {
      cancelAnimationFrame(this.rafId);
      this.rafId = null;
    }
    detachVideo(this.screenVideo);
    if (this.webcamVideo) detachVideo(this.webcamVideo);
  }
}

function createHiddenVideo(stream: MediaStream): HTMLVideoElement {
  const video = document.createElement("video");
  video.muted = true;
  video.playsInline = true;
  video.srcObject = stream;
  // Kick off playback; ignore the autoplay promise rejection if any.
  void video.play().catch(() => {});
  return video;
}

function detachVideo(video: HTMLVideoElement): void {
  try {
    video.pause();
  } catch {
    /* ignore */
  }
  video.srcObject = null;
}

function waitForVideo(video: HTMLVideoElement): Promise<void> {
  if (video.readyState >= 2 && video.videoWidth > 0) return Promise.resolve();
  return new Promise((resolve) => {
    const onReady = () => {
      if (video.videoWidth > 0) {
        video.removeEventListener("loadedmetadata", onReady);
        video.removeEventListener("loadeddata", onReady);
        resolve();
      }
    };
    video.addEventListener("loadedmetadata", onReady);
    video.addEventListener("loadeddata", onReady);
  });
}
