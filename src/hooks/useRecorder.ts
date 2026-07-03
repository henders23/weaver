import { useCallback, useEffect, useRef, useState } from "react";
import {
  CaptureError,
  getCameraStream,
  getScreenStream,
  isCaptureSupported,
  listDevices,
  stopStream,
} from "../lib/capture";
import { createCompositor, type Compositor } from "../lib/compositor";
import { Recorder, type RecordingResult } from "../lib/recorder";
import { composeRecording } from "../lib/compose";
import {
  DEFAULT_CAPTURE_CONFIG,
  type CaptureConfig,
  type MediaDeviceOption,
  type RecorderState,
} from "../types";

interface RecorderHook {
  state: RecorderState;
  config: CaptureConfig;
  setConfig: React.Dispatch<React.SetStateAction<CaptureConfig>>;
  cameras: MediaDeviceOption[];
  mics: MediaDeviceOption[];
  error: string | null;
  supported: boolean;
  elapsedMs: number;
  /** 0..1 progress while compositing the final file. */
  processingProgress: number;
  result: RecordingResult | null;
  /** The live webcam stream, for the setup preview. */
  webcamStream: MediaStream | null;
  /** The live compositor, so the preview can paint composited frames. */
  compositor: Compositor | null;
  /** The composited output stream, bound to a <video> for the live preview. */
  previewStream: MediaStream | null;
  loadDevices: () => Promise<void>;
  beginConfiguring: () => Promise<void>;
  startCountdown: () => void;
  startRecording: () => Promise<void>;
  pause: () => void;
  resume: () => void;
  stop: () => Promise<void>;
  reset: () => void;
}

export function useRecorder(): RecorderHook {
  const [state, setState] = useState<RecorderState>("idle");
  const [config, setConfig] = useState<CaptureConfig>(DEFAULT_CAPTURE_CONFIG);
  const [cameras, setCameras] = useState<MediaDeviceOption[]>([]);
  const [mics, setMics] = useState<MediaDeviceOption[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [elapsedMs, setElapsedMs] = useState(0);
  const [processingProgress, setProcessingProgress] = useState(0);
  const [result, setResult] = useState<RecordingResult | null>(null);
  const [webcamStream, setWebcamStream] = useState<MediaStream | null>(null);
  const [compositor, setCompositor] = useState<Compositor | null>(null);
  const [previewStream, setPreviewStream] = useState<MediaStream | null>(null);

  const supported = useRef(isCaptureSupported()).current;

  // Long-lived refs for resources we must tear down precisely.
  const screenStreamRef = useRef<MediaStream | null>(null);
  const webcamStreamRef = useRef<MediaStream | null>(null);
  const compositorRef = useRef<Compositor | null>(null);
  const screenRecorderRef = useRef<Recorder | null>(null);
  const webcamRecorderRef = useRef<Recorder | null>(null);
  const timerRef = useRef<number | null>(null);
  const startTsRef = useRef(0);

  // Mirror latest state/config into refs for callbacks captured in event handlers.
  const stateRef = useRef(state);
  const configRef = useRef(config);
  useEffect(() => {
    stateRef.current = state;
  }, [state]);
  useEffect(() => {
    configRef.current = config;
  }, [config]);

  const loadDevices = useCallback(async () => {
    try {
      const { cameras, mics } = await listDevices();
      setCameras(cameras);
      setMics(mics);
    } catch {
      // Non-fatal: the user can still record with defaults.
    }
  }, []);

  const clearTimer = useCallback(() => {
    if (timerRef.current !== null) {
      window.clearInterval(timerRef.current);
      timerRef.current = null;
    }
  }, []);

  const teardownLive = useCallback(() => {
    clearTimer();
    compositorRef.current?.stop();
    compositorRef.current = null;
    setCompositor(null);
    setPreviewStream(null);
    stopStream(screenStreamRef.current, webcamStreamRef.current);
    screenStreamRef.current = null;
    webcamStreamRef.current = null;
    setWebcamStream(null);
  }, [clearTimer]);

  // Acquire screen + webcam, build the preview compositor, move to "configuring".
  const beginConfiguring = useCallback(async () => {
    setError(null);
    try {
      const screen = await getScreenStream(config.systemAudio);
      screenStreamRef.current = screen;

      let webcam: MediaStream | null = null;
      try {
        webcam = await getCameraStream({
          cameraDeviceId: config.cameraDeviceId,
          micDeviceId: config.micDeviceId,
          micEnabled: config.micEnabled,
        });
      } catch (err) {
        // Camera is optional — fall back to screen-only with a note.
        webcam = null;
        if (err instanceof CaptureError && err.kind === "permission") {
          setError(
            "Camera/mic was blocked — recording screen only. Reset to try again."
          );
        }
      }
      webcamStreamRef.current = webcam;
      setWebcamStream(webcam);

      // End the session cleanly if the user clicks the browser's "Stop sharing".
      screen.getVideoTracks()[0]?.addEventListener("ended", () => {
        if (
          screenRecorderRef.current &&
          (stateRef.current === "recording" || stateRef.current === "paused")
        ) {
          void stop();
        } else if (stateRef.current !== "processing") {
          teardownLive();
          setState("idle");
        }
      });

      const comp = createCompositor({
        screenStream: screen,
        webcamStream: webcam,
        position: config.bubblePosition,
        size: config.bubbleSize,
      });
      await comp.start();
      compositorRef.current = comp;
      setCompositor(comp);
      setPreviewStream(comp.getStream());

      await loadDevices();
      setState("configuring");
    } catch (err) {
      teardownLive();
      setError(
        err instanceof CaptureError
          ? err.message
          : "Could not start capture. Please try again."
      );
      setState("idle");
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [config, loadDevices, teardownLive]);

  // Keep the preview compositor's bubble in sync with config changes.
  useEffect(() => {
    compositorRef.current?.setBubble(config.bubblePosition, config.bubbleSize);
  }, [config.bubblePosition, config.bubbleSize]);

  const startCountdown = useCallback(() => {
    setError(null);
    setState("countdown");
  }, []);

  const startTimer = useCallback((base: number) => {
    startTsRef.current = base;
    timerRef.current = window.setInterval(() => {
      setElapsedMs(Date.now() - startTsRef.current);
    }, 200);
  }, []);

  // Record the raw screen and webcam tracks directly. Recording the tracks
  // (rather than a live canvas composite) is what survives tab backgrounding —
  // the bubble is composited afterward in compose.ts. See the "processing" step.
  const startRecording = useCallback(async () => {
    const screen = screenStreamRef.current;
    if (!screen) {
      setError("Capture is not ready.");
      setState("idle");
      return;
    }

    const screenRec = new Recorder(screen);
    screenRecorderRef.current = screenRec;
    screenRec.start();

    const webcam = webcamStreamRef.current;
    if (webcam) {
      const webcamRec = new Recorder(webcam);
      webcamRecorderRef.current = webcamRec;
      webcamRec.start();
    } else {
      webcamRecorderRef.current = null;
    }

    setElapsedMs(0);
    startTimer(Date.now());
    setState("recording");
  }, [startTimer]);

  const pause = useCallback(() => {
    screenRecorderRef.current?.pause();
    webcamRecorderRef.current?.pause();
    clearTimer();
    setState("paused");
  }, [clearTimer]);

  const resume = useCallback(() => {
    screenRecorderRef.current?.resume();
    webcamRecorderRef.current?.resume();
    startTimer(Date.now() - elapsedMs);
    setState("recording");
  }, [elapsedMs, startTimer]);

  const stop = useCallback(async () => {
    const screenRec = screenRecorderRef.current;
    if (!screenRec) return;
    clearTimer();
    const durationSec = (Date.now() - startTsRef.current) / 1000;

    // Flush both recordings to blobs before releasing the tracks.
    const [screenRes, webcamRes] = await Promise.all([
      screenRec.stop(),
      webcamRecorderRef.current
        ? webcamRecorderRef.current.stop()
        : Promise.resolve(null),
    ]);
    screenRecorderRef.current = null;
    webcamRecorderRef.current = null;
    teardownLive();

    setProcessingProgress(0);
    setState("processing");
    try {
      const composed = await composeRecording({
        screenBlob: screenRes.blob,
        webcamBlob: webcamRes?.blob ?? null,
        position: configRef.current.bubblePosition,
        size: configRef.current.bubbleSize,
        expectedDurationSec: durationSec,
        onProgress: setProcessingProgress,
      });
      setResult(composed);
      setState("preview");
    } catch {
      setError("Could not process the recording. Please try again.");
      setState("idle");
    }
  }, [clearTimer, teardownLive]);

  const reset = useCallback(() => {
    teardownLive();
    screenRecorderRef.current = null;
    webcamRecorderRef.current = null;
    setResult(null);
    setElapsedMs(0);
    setProcessingProgress(0);
    setError(null);
    setState("idle");
  }, [teardownLive]);

  // Clean up everything on unmount.
  useEffect(() => {
    return () => teardownLive();
  }, [teardownLive]);

  return {
    state,
    config,
    setConfig,
    cameras,
    mics,
    error,
    supported,
    elapsedMs,
    processingProgress,
    result,
    webcamStream,
    compositor,
    previewStream,
    loadDevices,
    beginConfiguring,
    startCountdown,
    startRecording,
    pause,
    resume,
    stop,
    reset,
  };
}
