import type { MediaDeviceOption } from "../types";

/**
 * Error thrown when the browser denies (or can't provide) a media capture.
 * `kind` lets the UI tailor the message.
 */
export class CaptureError extends Error {
  kind: "screen" | "camera" | "permission" | "unsupported";
  constructor(kind: CaptureError["kind"], message: string) {
    super(message);
    this.name = "CaptureError";
    this.kind = kind;
  }
}

/** True when the APIs we rely on exist in this browser. */
export function isCaptureSupported(): boolean {
  return (
    typeof navigator !== "undefined" &&
    !!navigator.mediaDevices &&
    typeof navigator.mediaDevices.getDisplayMedia === "function" &&
    typeof navigator.mediaDevices.getUserMedia === "function" &&
    typeof window.MediaRecorder === "function"
  );
}

/**
 * Prompt the user to pick a screen / window / tab to share.
 * When `systemAudio` is true we also request audio so Chromium can offer the
 * "Share system audio" / "Share tab audio" checkbox.
 */
export async function getScreenStream(
  systemAudio: boolean
): Promise<MediaStream> {
  try {
    return await navigator.mediaDevices.getDisplayMedia({
      video: { frameRate: 30 },
      audio: systemAudio,
    });
  } catch (err) {
    throw toCaptureError(err, "screen");
  }
}

/**
 * Acquire the webcam (and optionally mic). Pass `micEnabled: false` to capture
 * video only — useful when the user wants the screen's system audio but no mic.
 */
export async function getCameraStream(opts: {
  cameraDeviceId: string | null;
  micDeviceId: string | null;
  micEnabled: boolean;
}): Promise<MediaStream> {
  const { cameraDeviceId, micDeviceId, micEnabled } = opts;
  const constraints: MediaStreamConstraints = {
    video: cameraDeviceId
      ? { deviceId: { exact: cameraDeviceId } }
      : { facingMode: "user" },
    audio: micEnabled
      ? micDeviceId
        ? { deviceId: { exact: micDeviceId } }
        : true
      : false,
  };
  try {
    return await navigator.mediaDevices.getUserMedia(constraints);
  } catch (err) {
    throw toCaptureError(err, "camera");
  }
}

/**
 * List available cameras and microphones. Labels are only populated after the
 * user has granted permission at least once, so call this after acquiring a
 * stream for the most useful results.
 */
export async function listDevices(): Promise<{
  cameras: MediaDeviceOption[];
  mics: MediaDeviceOption[];
}> {
  const devices = await navigator.mediaDevices.enumerateDevices();
  const cameras: MediaDeviceOption[] = [];
  const mics: MediaDeviceOption[] = [];
  for (const d of devices) {
    if (d.kind === "videoinput") {
      cameras.push({ deviceId: d.deviceId, label: d.label || "Camera" });
    } else if (d.kind === "audioinput") {
      mics.push({ deviceId: d.deviceId, label: d.label || "Microphone" });
    }
  }
  return { cameras, mics };
}

/** Stop every track on a stream (or a list of streams). Safe to call with null. */
export function stopStream(
  ...streams: (MediaStream | null | undefined)[]
): void {
  for (const stream of streams) {
    if (!stream) continue;
    for (const track of stream.getTracks()) {
      track.stop();
    }
  }
}

function toCaptureError(
  err: unknown,
  context: "screen" | "camera"
): CaptureError {
  if (err instanceof DOMException) {
    if (err.name === "NotAllowedError") {
      return new CaptureError(
        "permission",
        context === "screen"
          ? "Screen sharing was blocked or cancelled."
          : "Camera/microphone access was denied."
      );
    }
    if (err.name === "NotFoundError" || err.name === "DevicesNotFoundError") {
      return new CaptureError(
        context,
        context === "camera"
          ? "No camera or microphone was found."
          : "No screen source was available."
      );
    }
  }
  return new CaptureError(
    context,
    err instanceof Error ? err.message : `Failed to start ${context} capture.`
  );
}
