import { bubbleGeometry, drawBubble } from "./bubble";
import type { BubblePosition, BubbleSize } from "../types";

export interface CompositorOptions {
  screenStream: MediaStream;
  webcamStream: MediaStream | null;
  position: BubblePosition;
  size: BubbleSize;
  /** Output frame rate for the RAF fallback engine. */
  fps?: number;
}

/**
 * Produces a single composited video stream (screen + circular webcam bubble).
 * Two engines implement this:
 *  - WorkerCompositor: composites off the main thread via WebCodecs insertable
 *    streams, so it keeps running when the tab is hidden. Preferred.
 *  - RafCompositor: a requestAnimationFrame canvas fallback for browsers without
 *    the insertable-streams APIs. NOTE: freezes when the tab is backgrounded.
 */
export interface Compositor {
  /** Engine in use, for diagnostics / UI hints. */
  readonly mode: "worker" | "raf";
  /** Begin compositing. Resolves once output is flowing. */
  start(): Promise<void>;
  /** The composited output as a MediaStream (stable across calls). */
  getStream(): MediaStream;
  /** Update the bubble placement live. */
  setBubble(position: BubblePosition, size: BubbleSize): void;
  /** Stop compositing. Does NOT stop the source tracks. */
  stop(): void;
}

/** True when the off-main-thread pipeline is available (Chromium). */
export function supportsWorkerPipeline(): boolean {
  return (
    typeof MediaStreamTrackProcessor !== "undefined" &&
    typeof MediaStreamTrackGenerator !== "undefined" &&
    typeof OffscreenCanvas !== "undefined" &&
    typeof VideoFrame !== "undefined"
  );
}

/** Pick the best available compositing engine. */
export function createCompositor(opts: CompositorOptions): Compositor {
  if (supportsWorkerPipeline()) {
    try {
      return new WorkerCompositor(opts);
    } catch {
      // Fall back if worker construction fails for any reason.
    }
  }
  return new RafCompositor(opts);
}

// ---------------------------------------------------------------------------
// Worker engine (preferred)
// ---------------------------------------------------------------------------

class WorkerCompositor implements Compositor {
  readonly mode = "worker" as const;
  private worker: Worker;
  private opts: CompositorOptions;
  private generator: MediaStreamTrack | null = null;
  private outStream: MediaStream | null = null;
  private started = false;

  constructor(opts: CompositorOptions) {
    this.opts = opts;
    this.worker = new Worker(
      new URL("./compositorWorker.ts", import.meta.url),
      { type: "module" }
    );
  }

  async start(): Promise<void> {
    const { screenStream, webcamStream, position, size } = this.opts;

    const screenTrack = screenStream.getVideoTracks()[0];
    if (!screenTrack) throw new Error("No screen video track to composite.");
    const screenReadable = new MediaStreamTrackProcessor({
      track: screenTrack,
    }).readable;

    let webcamReadable: ReadableStream<VideoFrame> | null = null;
    const webcamTrack = webcamStream?.getVideoTracks()[0];
    if (webcamTrack) {
      webcamReadable = new MediaStreamTrackProcessor({
        track: webcamTrack,
      }).readable;
    }

    const generator = new MediaStreamTrackGenerator({ kind: "video" });
    this.generator = generator;
    const writable = generator.writable;

    const transfer: Transferable[] = [
      screenReadable as unknown as Transferable,
      writable as unknown as Transferable,
    ];
    if (webcamReadable) {
      transfer.push(webcamReadable as unknown as Transferable);
    }

    this.worker.postMessage(
      { type: "init", screenReadable, webcamReadable, writable, position, size },
      transfer
    );
    this.started = true;
  }

  getStream(): MediaStream {
    if (!this.generator) {
      throw new Error("Compositor not started.");
    }
    if (!this.outStream) {
      this.outStream = new MediaStream([this.generator]);
    }
    return this.outStream;
  }

  setBubble(position: BubblePosition, size: BubbleSize): void {
    this.opts.position = position;
    this.opts.size = size;
    if (this.started) {
      this.worker.postMessage({ type: "config", position, size });
    }
  }

  stop(): void {
    try {
      this.worker.postMessage({ type: "stop" });
    } catch {
      /* ignore */
    }
    this.worker.terminate();
    try {
      this.generator?.stop();
    } catch {
      /* ignore */
    }
  }
}

// ---------------------------------------------------------------------------
// RAF engine (fallback; freezes when the tab is hidden)
// ---------------------------------------------------------------------------

class RafCompositor implements Compositor {
  readonly mode = "raf" as const;
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
