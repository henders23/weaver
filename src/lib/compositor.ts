import { bubbleGeometry, drawBubble } from "./bubble";
import type { BubblePosition, BubbleSize } from "../types";

export interface CompositorOptions {
  screenStream: MediaStream;
  webcamStream: MediaStream | null;
  position: BubblePosition;
  size: BubbleSize;
  /** Output frame rate for the preview canvas stream. */
  fps?: number;
}

/**
 * Live preview compositor: draws the screen full-frame with a circular webcam
 * bubble on top, on a canvas driven by requestAnimationFrame.
 *
 * This is used ONLY for the on-screen arrange/preview — never for the actual
 * recording. Recording captures the raw screen and webcam tracks directly (see
 * useRecorder + compose.ts), so the well-known background-tab RAF throttling
 * that would freeze this preview does not affect the recorded output.
 */
export interface Compositor {
  start(): Promise<void>;
  getStream(): MediaStream;
  setBubble(position: BubblePosition, size: BubbleSize): void;
  stop(): void;
}

export function createCompositor(opts: CompositorOptions): Compositor {
  return new PreviewCompositor(opts);
}

class PreviewCompositor implements Compositor {
  private canvas: HTMLCanvasElement;
  private ctx: CanvasRenderingContext2D;
  private screenVideo: HTMLVideoElement;
  private webcamVideo: HTMLVideoElement | null = null;
  private rafId: number | null = null;
  private fps: number;
  private outStream: MediaStream | null = null;
  private position: BubblePosition;
  private size: BubbleSize;

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

  private drawFrame(): void {
    this.resizeCanvasToScreen();
    const { ctx, canvas } = this;
    ctx.fillStyle = "#000";
    ctx.fillRect(0, 0, canvas.width, canvas.height);

    if (this.screenVideo.readyState >= 2) {
      ctx.drawImage(this.screenVideo, 0, 0, canvas.width, canvas.height);
    }
    if (this.webcamVideo && this.webcamVideo.readyState >= 2) {
      const geom = bubbleGeometry(
        canvas.width,
        canvas.height,
        this.position,
        this.size
      );
      drawBubble(
        ctx,
        this.webcamVideo,
        this.webcamVideo.videoWidth,
        this.webcamVideo.videoHeight,
        geom
      );
    }
  }

  getStream(): MediaStream {
    if (!this.outStream) {
      this.outStream = this.canvas.captureStream(this.fps);
    }
    return this.outStream;
  }

  setBubble(position: BubblePosition, size: BubbleSize): void {
    this.position = position;
    this.size = size;
  }

  stop(): void {
    if (this.rafId !== null) {
      cancelAnimationFrame(this.rafId);
      this.rafId = null;
    }
    this.outStream?.getTracks().forEach((t) => t.stop());
    this.outStream = null;
    detachVideo(this.screenVideo);
    if (this.webcamVideo) detachVideo(this.webcamVideo);
  }
}

function createHiddenVideo(stream: MediaStream): HTMLVideoElement {
  const video = document.createElement("video");
  video.muted = true;
  video.playsInline = true;
  video.srcObject = stream;
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
