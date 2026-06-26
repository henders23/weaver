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
import { AudioMixer } from "../lib/audioMixer";
import { Recorder, type RecordingResult } from "../lib/recorder";
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
  const [result, setResult] = useState<RecordingResult | null>(null);
  const [webcamStream, setWebcamStream] = useState<MediaStream | null>(null);
  const [compositor, setCompositor] = useState<Compositor | null>(null);
  const [previewStream, setPreviewStream] = useState<MediaStream | null>(null);

  const supported = useRef(isCaptureSupported()).current;

  // Long-lived refs for resources we must tear down precisely.
  const screenStreamRef = useRef<MediaStream | null>(null);
  const webcamStreamRef = useRef<MediaStream | null>(null);
  const compositorRef = useRef<Compositor | null>(null);
  const mixerRef = useRef<AudioMixer | null>(null);
  const recorderRef = useRef<Recorder | null>(null);
  const captureStreamRef = useRef<MediaStream | null>(null);
  const timerRef = useRef<number | null>(null);
  const startTsRef = useRef(0);

  const loadDevices = useCallback(async () => {
    try {
      const { cameras, mics } = await listDevices();
      setCameras(cameras);
      setMics(mics);
    } catch {
      // Non-fatal: the user can still record with defaults.
    }
  }, []);

  const teardownLive = useCallback(() => {
    if (timerRef.current !== null) {
      window.clearInterval(timerRef.current);
      timerRef.current = null;
    }
    compositorRef.current?.stop();
    compositorRef.current = null;
    setCompositor(null);
    setPreviewStream(null);
    stopStream(
      screenStreamRef.current,
      webcamStreamRef.current,
      captureStreamRef.current
    );
    screenStreamRef.current = null;
    webcamStreamRef.current = null;
    captureStreamRef.current = null;
    setWebcamStream(null);
    void mixerRef.current?.close();
    mixerRef.current = null;
  }, []);

  // Acquire screen + webcam, build the compositor, and move to "configuring".
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
          recorderRef.current &&
          (stateRef.current === "recording" || stateRef.current === "paused")
        ) {
          void stop();
        } else {
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

      const output = comp.getStream();
      captureStreamRef.current = output;
      setPreviewStream(output);

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

  // Keep the compositor's bubble in sync with config changes while configuring.
  useEffect(() => {
    compositorRef.current?.setBubble(config.bubblePosition, config.bubbleSize);
  }, [config.bubblePosition, config.bubbleSize]);

  const startCountdown = useCallback(() => {
    setError(null);
    setState("countdown");
  }, []);

  const startRecording = useCallback(async () => {
    const comp = compositorRef.current;
    if (!comp) {
      setError("Capture is not ready.");
      setState("idle");
      return;
    }
    // Mix mic + system audio into one track.
    const mixer = new AudioMixer();
    const audioTrack = mixer.mix(
      config.micEnabled ? webcamStreamRef.current : null,
      config.systemAudio ? screenStreamRef.current : null
    );
    mixerRef.current = mixer;

    const canvasStream = comp.getStream();
    captureStreamRef.current = canvasStream;
    const tracks: MediaStreamTrack[] = [...canvasStream.getVideoTracks()];
    if (audioTrack) tracks.push(audioTrack);
    const combined = new MediaStream(tracks);

    const recorder = new Recorder(combined);
    recorderRef.current = recorder;
    recorder.start();

    startTsRef.current = Date.now();
    setElapsedMs(0);
    timerRef.current = window.setInterval(() => {
      setElapsedMs(Date.now() - startTsRef.current);
    }, 200);

    setState("recording");
  }, [config.micEnabled, config.systemAudio]);

  const pause = useCallback(() => {
    recorderRef.current?.pause();
    if (timerRef.current !== null) {
      window.clearInterval(timerRef.current);
      timerRef.current = null;
    }
    setState("paused");
  }, []);

  const resume = useCallback(() => {
    recorderRef.current?.resume();
    const resumeBase = Date.now() - elapsedMs;
    timerRef.current = window.setInterval(() => {
      setElapsedMs(Date.now() - resumeBase);
    }, 200);
    setState("recording");
  }, [elapsedMs]);

  const stop = useCallback(async () => {
    const recorder = recorderRef.current;
    if (!recorder) return;
    if (timerRef.current !== null) {
      window.clearInterval(timerRef.current);
      timerRef.current = null;
    }
    const res = await recorder.stop();
    recorderRef.current = null;
    setResult(res);
    teardownLive();
    setState("preview");
  }, [teardownLive]);

  const reset = useCallback(() => {
    teardownLive();
    recorderRef.current = null;
    setResult(null);
    setElapsedMs(0);
    setError(null);
    setState("idle");
  }, [teardownLive]);

  // Mirror state into a ref so the screen-track "ended" handler sees fresh value.
  const stateRef = useRef(state);
  useEffect(() => {
    stateRef.current = state;
  }, [state]);

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
