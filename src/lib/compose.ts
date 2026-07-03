import { bubbleGeometry, drawBubble } from "./bubble";
import { pickMimeType, type RecordingResult } from "./recorder";
import type { BubblePosition, BubbleSize } from "../types";

export interface ComposeOptions {
  /** Raw screen recording (video + optional system audio). */
  screenBlob: Blob;
  /** Raw webcam recording (video + optional mic audio), or null for screen-only. */
  webcamBlob: Blob | null;
  position: BubblePosition;
  size: BubbleSize;
  /** Recording length in seconds (from the timer) — used for progress + a safety timeout. */
  expectedDurationSec: number;
  /** 0..1 progress callback. */
  onProgress?: (fraction: number) => void;
}

/**
 * Composites a raw screen recording and a raw webcam recording into a single
 * file with a circular webcam bubble, plus mixed audio.
 *
 * This runs AFTER recording has stopped, while the Weaver tab is in the
 * foreground — so the canvas draw loop isn't subject to the background-tab
 * throttling that freezes live canvas compositing. The raw recordings, captured
 * directly from the media tracks, never froze in the first place.
 *
 * It plays both recordings back in real time, draws each screen frame full-frame
 * with the webcam bubble on top, mixes both audio tracks via the Web Audio API,
 * and records the composited canvas to the final blob.
 */
export async function composeRecording(
  opts: ComposeOptions
): Promise<RecordingResult> {
  const { screenBlob, webcamBlob, position, size, expectedDurationSec } = opts;

  const screenVideo = await loadVideo(screenBlob);
  const webcamVideo = webcamBlob ? await loadVideo(webcamBlob) : null;

  const width = screenVideo.videoWidth || 1280;
  const height = screenVideo.videoHeight || 720;

  const canvas = document.createElement("canvas");
  canvas.width = width;
  canvas.height = height;
  const ctx = canvas.getContext("2d", { alpha: false });
  if (!ctx) throw new Error("Could not get a 2D canvas context for compositing.");

  // Mix audio from both recordings via Web Audio. The element sources are routed
  // only into the recording destination (not the speakers), so processing is silent.
  const audioCtx = new AudioContext();
  const dest = audioCtx.createMediaStreamDestination();
  connectElementAudio(audioCtx, dest, screenVideo);
  if (webcamVideo) connectElementAudio(audioCtx, dest, webcamVideo);

  const canvasStream = canvas.captureStream(30);
  const outputTracks: MediaStreamTrack[] = [
    ...canvasStream.getVideoTracks(),
    ...dest.stream.getAudioTracks(),
  ];
  const outputStream = new MediaStream(outputTracks);

  const mimeType = pickMimeType();
  const recorder = new MediaRecorder(
    outputStream,
    mimeType ? { mimeType } : undefined
  );
  const chunks: Blob[] = [];
  recorder.ondataavailable = (e) => {
    if (e.data && e.data.size > 0) chunks.push(e.data);
  };

  const finished = new Promise<RecordingResult>((resolve) => {
    recorder.onstop = () => {
      const type = recorder.mimeType || mimeType || "video/webm";
      resolve({
        blob: new Blob(chunks, { type }),
        mimeType: type,
        extension: type.includes("mp4") ? "mp4" : "webm",
      });
    };
  });

  let rafId = 0;
  const draw = () => {
    ctx.fillStyle = "#000";
    ctx.fillRect(0, 0, width, height);
    if (screenVideo.readyState >= 2) {
      ctx.drawImage(screenVideo, 0, 0, width, height);
    }
    if (webcamVideo && webcamVideo.readyState >= 2) {
      const geom = bubbleGeometry(width, height, position, size);
      drawBubble(
        ctx,
        webcamVideo,
        webcamVideo.videoWidth,
        webcamVideo.videoHeight,
        geom
      );
    }
    if (opts.onProgress && expectedDurationSec > 0) {
      opts.onProgress(
        Math.min(0.999, screenVideo.currentTime / expectedDurationSec)
      );
    }
    rafId = requestAnimationFrame(draw);
  };

  // Kick everything off. Stop's user gesture keeps autoplay/AudioContext happy.
  await audioCtx.resume().catch(() => {});
  recorder.start(1000);
  rafId = requestAnimationFrame(draw);
  await Promise.all([
    screenVideo.play().catch(() => {}),
    webcamVideo?.play().catch(() => {}) ?? Promise.resolve(),
  ]);

  // The screen recording is the master timeline. Stop when it ends, with a
  // safety timeout in case 'ended' never fires (some WebM blobs misreport).
  await new Promise<void>((resolve) => {
    let settled = false;
    const finish = () => {
      if (settled) return;
      settled = true;
      resolve();
    };
    screenVideo.addEventListener("ended", finish, { once: true });
    window.setTimeout(finish, (expectedDurationSec + 5) * 1000);
  });

  cancelAnimationFrame(rafId);
  opts.onProgress?.(1);

  // Give the recorder a beat to capture the final frame, then stop.
  await new Promise((r) => window.setTimeout(r, 150));
  if (recorder.state !== "inactive") recorder.stop();
  const result = await finished;

  // Cleanup.
  canvasStream.getTracks().forEach((t) => t.stop());
  revokeVideo(screenVideo);
  if (webcamVideo) revokeVideo(webcamVideo);
  await audioCtx.close().catch(() => {});

  return result;
}

function loadVideo(blob: Blob): Promise<HTMLVideoElement> {
  return new Promise((resolve, reject) => {
    const video = document.createElement("video");
    video.src = URL.createObjectURL(blob);
    video.preload = "auto";
    video.playsInline = true;
    // Do NOT mute: muting also silences the MediaElementAudioSourceNode. Audio is
    // routed into Web Audio (not the speakers), so nothing plays aloud regardless.
    video.onloadeddata = () => resolve(video);
    video.onerror = () =>
      reject(new Error("Failed to load a recording for processing."));
  });
}

function revokeVideo(video: HTMLVideoElement): void {
  const url = video.src;
  video.pause();
  video.removeAttribute("src");
  video.load();
  if (url.startsWith("blob:")) URL.revokeObjectURL(url);
}

function connectElementAudio(
  ctx: AudioContext,
  dest: MediaStreamAudioDestinationNode,
  el: HTMLMediaElement
): void {
  try {
    const source = ctx.createMediaElementSource(el);
    source.connect(dest);
  } catch {
    // Element has no audio track (or is already wired) — nothing to mix.
  }
}
