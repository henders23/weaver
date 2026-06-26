# Weaver

An open-source [Loom](https://loom.com) alternative that runs entirely in your
browser. Record your screen with a circular webcam **bubble** composited on top,
preview it, and download a single video file. No accounts, no uploads — every
frame stays on your device.

![status](https://img.shields.io/badge/status-MVP-blue)

## Features

- 🖥️ **Screen + webcam in one video** — the webcam is drawn as a Loom-style
  circular bubble over your screen recording.
- 🎙️ **Microphone + system/tab audio** mixed into a single track.
- 🎛️ **Arrange before you record** — choose the bubble's corner and size with a
  live preview of exactly what will be captured.
- ⏱️ **Countdown, pause/resume, live timer.**
- 💾 **Local save** — download as MP4 (where supported) or WebM. Nothing leaves
  your machine.

## Browser & OS support

Weaver relies on the [Screen Capture](https://developer.mozilla.org/docs/Web/API/Screen_Capture_API)
and [MediaRecorder](https://developer.mozilla.org/docs/Web/API/MediaRecorder)
APIs.

- ✅ **Chrome / Edge on Windows** — recommended. This is the one combination
  where capturing **system audio** works reliably (tick *“Share system audio”*
  in the screen-share dialog).
- ⚠️ Chrome/Edge on macOS/Linux work for screen + mic, but system-audio capture
  is limited or unavailable.
- ❌ Firefox and Safari don't support system-audio capture via `getDisplayMedia`.

A [secure context](https://developer.mozilla.org/docs/Web/Security/Secure_Contexts)
is required. `localhost` counts as secure, so local development works without
HTTPS; for deployment, serve over HTTPS.

## Getting started

```bash
npm install
npm run dev
```

Open the printed `http://localhost:5173` URL in **Chrome or Edge**.

### Usage

1. Pick your camera and microphone, toggle system audio, and choose the bubble
   position/size.
2. Click **Choose screen & set up** and select a screen, window, or tab to
   share (tick *“Share system audio”* if you want app/tab sound).
3. Fine-tune the bubble in the live preview, then **Start recording** — a 3-2-1
   countdown begins.
4. Use **Pause/Resume** as needed, then **Stop**.
5. Review the result and click **Download**.

## How it works

```
Screen stream (getDisplayMedia) ─┐
                                 ├─► Compositor (canvas RAF loop) ─► canvas.captureStream(30) ─┐
Webcam stream (getUserMedia) ────┘     • screen drawn full-frame                               ├─► MediaRecorder ─► Blob ─► download
                                       • webcam drawn as a circular clip                        │
Mic audio ─┐                                                                                    │
           ├─► AudioMixer (Web Audio → one track) ──────────────────────────────────────────────┘
System audio ─┘
```

| Module | Responsibility |
| --- | --- |
| `src/lib/capture.ts` | `getDisplayMedia` / `getUserMedia` wrappers, device enumeration, error mapping |
| `src/lib/compositor.ts` | Canvas render loop; draws the screen full-frame + circular webcam bubble |
| `src/lib/audioMixer.ts` | Merges mic + system audio into one track via the Web Audio API |
| `src/lib/recorder.ts` | `MediaRecorder` wrapper; codec selection, chunking, pause/resume → `Blob` |
| `src/lib/download.ts` | Timestamped blob download |
| `src/hooks/useRecorder.ts` | State machine wiring capture → compositor → mixer → recorder |

## Roadmap

These are intentionally **out of scope** for the MVP:

- Trim / basic editing and repositioning the bubble after recording
- Cloud upload + shareable links
- Accounts and a recording library
- Packaging as a desktop app (Electron / Tauri)

## License

MIT
