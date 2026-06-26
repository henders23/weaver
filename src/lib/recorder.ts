/** A finished recording: the encoded blob plus its container type. */
export interface RecordingResult {
  blob: Blob;
  mimeType: string;
  /** File extension matching the container, e.g. "webm" or "mp4". */
  extension: string;
}

// Preference order: MP4/H.264 plays everywhere, but most Chromium builds only
// reliably record WebM. We try MP4 first and fall back gracefully.
const MIME_CANDIDATES: string[] = [
  "video/mp4;codecs=h264,aac",
  "video/mp4",
  "video/webm;codecs=vp9,opus",
  "video/webm;codecs=vp8,opus",
  "video/webm",
];

/** Pick the best container/codec this browser can actually record. */
export function pickMimeType(): string {
  for (const type of MIME_CANDIDATES) {
    if (MediaRecorder.isTypeSupported(type)) return type;
  }
  return ""; // let the browser choose its default
}

function extensionFor(mimeType: string): string {
  return mimeType.includes("mp4") ? "mp4" : "webm";
}

/**
 * Thin wrapper around MediaRecorder that accumulates chunks and resolves a Blob
 * when stopped. Supports pause/resume.
 */
export class Recorder {
  private recorder: MediaRecorder;
  private chunks: Blob[] = [];
  private mimeType: string;
  private stopPromise: Promise<RecordingResult> | null = null;

  constructor(stream: MediaStream) {
    this.mimeType = pickMimeType();
    this.recorder = new MediaRecorder(
      stream,
      this.mimeType ? { mimeType: this.mimeType } : undefined
    );
    this.recorder.ondataavailable = (e) => {
      if (e.data && e.data.size > 0) this.chunks.push(e.data);
    };
  }

  start(): void {
    // Emit a chunk every second so a crash/early-stop still yields data.
    this.recorder.start(1000);
  }

  pause(): void {
    if (this.recorder.state === "recording") this.recorder.pause();
  }

  resume(): void {
    if (this.recorder.state === "paused") this.recorder.resume();
  }

  get state(): RecordingState {
    return this.recorder.state;
  }

  /** Stop recording and resolve the assembled blob. Idempotent. */
  stop(): Promise<RecordingResult> {
    if (this.stopPromise) return this.stopPromise;
    this.stopPromise = new Promise<RecordingResult>((resolve) => {
      this.recorder.onstop = () => {
        const type = this.recorder.mimeType || this.mimeType || "video/webm";
        const blob = new Blob(this.chunks, { type });
        resolve({
          blob,
          mimeType: type,
          extension: extensionFor(type),
        });
      };
      if (this.recorder.state !== "inactive") {
        this.recorder.stop();
      } else {
        this.recorder.onstop?.(new Event("stop"));
      }
    });
    return this.stopPromise;
  }
}
