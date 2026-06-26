/** Where the circular webcam bubble sits over the screen recording. */
export type BubblePosition =
  | "top-left"
  | "top-right"
  | "bottom-left"
  | "bottom-right";

/** Relative diameter of the bubble, as a fraction of the screen video height. */
export type BubbleSize = "small" | "medium" | "large";

export const BUBBLE_SIZE_FRACTION: Record<BubbleSize, number> = {
  small: 0.18,
  medium: 0.26,
  large: 0.34,
};

/** High-level state of the recorder, drives which screen the UI shows. */
export type RecorderState =
  | "idle" // nothing captured yet — show setup
  | "configuring" // streams acquired, arranging the bubble
  | "countdown" // 3-2-1 before recording starts
  | "recording"
  | "paused"
  | "preview"; // recording finished, blob ready to review/download

/** User-chosen devices and capture options. */
export interface CaptureConfig {
  cameraDeviceId: string | null;
  micDeviceId: string | null;
  /** Capture system/tab audio from the screen share. */
  systemAudio: boolean;
  /** Capture the microphone. */
  micEnabled: boolean;
  bubblePosition: BubblePosition;
  bubbleSize: BubbleSize;
}

export interface MediaDeviceOption {
  deviceId: string;
  label: string;
}

export const DEFAULT_CAPTURE_CONFIG: CaptureConfig = {
  cameraDeviceId: null,
  micDeviceId: null,
  systemAudio: true,
  micEnabled: true,
  bubblePosition: "bottom-right",
  bubbleSize: "medium",
};
