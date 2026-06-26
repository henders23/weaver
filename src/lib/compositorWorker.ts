// Runs the screen + webcam compositing off the main thread so it keeps going
// even when the Weaver tab is hidden (the main thread's requestAnimationFrame is
// throttled/paused when the tab isn't visible, which would otherwise freeze the
// recording on its last frame).
//
// It reads VideoFrames from the screen (and optional webcam) tracks via
// MediaStreamTrackProcessor readables, composites them onto an OffscreenCanvas,
// and writes the result to a MediaStreamTrackGenerator's writable.

import { bubbleGeometry, drawBubble } from "./bubble";
import type { BubblePosition, BubbleSize } from "../types";

// `self` typed minimally so this file compiles under the DOM lib without pulling
// in the WebWorker lib (which conflicts with DOM globals we also rely on).
const worker = self as unknown as {
  onmessage: ((e: MessageEvent) => void) | null;
  postMessage(message: unknown): void;
};

interface InitMessage {
  type: "init";
  screenReadable: ReadableStream<VideoFrame>;
  webcamReadable: ReadableStream<VideoFrame> | null;
  writable: WritableStream<VideoFrame>;
  position: BubblePosition;
  size: BubbleSize;
}

interface ConfigMessage {
  type: "config";
  position: BubblePosition;
  size: BubbleSize;
}

interface StopMessage {
  type: "stop";
}

type IncomingMessage = InitMessage | ConfigMessage | StopMessage;

let canvas: OffscreenCanvas | null = null;
let ctx: OffscreenCanvasRenderingContext2D | null = null;
let position: BubblePosition = "bottom-right";
let size: BubbleSize = "medium";
let latestWebcam: VideoFrame | null = null;
let running = false;

worker.onmessage = (e: MessageEvent) => {
  const msg = e.data as IncomingMessage;
  switch (msg.type) {
    case "init":
      position = msg.position;
      size = msg.size;
      running = true;
      if (msg.webcamReadable) void pumpWebcam(msg.webcamReadable);
      void pumpScreen(msg.screenReadable, msg.writable);
      break;
    case "config":
      position = msg.position;
      size = msg.size;
      break;
    case "stop":
      running = false;
      break;
  }
};

/** Continuously keep only the most recent webcam frame, closing stale ones. */
async function pumpWebcam(readable: ReadableStream<VideoFrame>): Promise<void> {
  const reader = readable.getReader();
  try {
    while (running) {
      const { value, done } = await reader.read();
      if (done) break;
      latestWebcam?.close();
      latestWebcam = value ?? null;
    }
  } catch {
    /* stream interrupted (track ended) */
  } finally {
    reader.releaseLock();
    latestWebcam?.close();
    latestWebcam = null;
  }
}

/** Drive output at the screen's frame rate: one composited frame per screen frame. */
async function pumpScreen(
  readable: ReadableStream<VideoFrame>,
  writable: WritableStream<VideoFrame>
): Promise<void> {
  const reader = readable.getReader();
  const writer = writable.getWriter();
  try {
    while (running) {
      const { value: frame, done } = await reader.read();
      if (done) break;
      if (!frame) continue;

      const composed = composite(frame);
      frame.close();
      if (!composed) continue;

      try {
        // Awaiting respects the generator's backpressure, pacing the loop.
        await writer.write(composed);
      } catch {
        composed.close();
        break; // output stream closed
      }
    }
  } catch {
    /* stream interrupted */
  } finally {
    reader.releaseLock();
    try {
      await writer.close();
    } catch {
      /* already closed */
    }
  }
}

/** Composite one screen frame (+ latest webcam) and return a new VideoFrame. */
function composite(screenFrame: VideoFrame): VideoFrame | null {
  const w = screenFrame.displayWidth;
  const h = screenFrame.displayHeight;
  if (!w || !h) return null;

  if (!canvas || canvas.width !== w || canvas.height !== h) {
    canvas = new OffscreenCanvas(w, h);
    ctx = canvas.getContext("2d", { alpha: false });
  }
  if (!ctx) return null;

  ctx.drawImage(screenFrame, 0, 0, w, h);

  if (latestWebcam) {
    const geom = bubbleGeometry(w, h, position, size);
    drawBubble(
      ctx,
      latestWebcam,
      latestWebcam.displayWidth,
      latestWebcam.displayHeight,
      geom
    );
  }

  return new VideoFrame(canvas, { timestamp: screenFrame.timestamp ?? 0 });
}
