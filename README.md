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

Weaver **records first, composites second**. During recording it captures the
raw screen and webcam tracks directly with two `MediaRecorder`s — a path that
runs inside the browser's media pipeline and keeps recording at full frame rate
even when you switch to another app. When you stop, it plays both recordings
back **in the foreground** (where there's no background-tab throttling), draws
each screen frame with the circular webcam bubble on a canvas, mixes the audio,
and records that into the final single file.

Why not composite live? A `requestAnimationFrame` canvas loop — even in a Web
Worker fed by `MediaStreamTrackProcessor` — stalls a few seconds after the tab
is backgrounded, because the frame bridge is still gated by the throttled main
thread. Recording the raw tracks sidesteps the canvas entirely during capture.

```
RECORD (capture)                          COMPOSITE (on stop, foreground)
Screen track ─► MediaRecorder ─► screen.webm ─┐
                                              ├─► play both → canvas (screen + circular bubble)
Webcam track ─► MediaRecorder ─► webcam.webm ─┘        + Web Audio mix (system + mic)
                                                             └─► MediaRecorder ─► final Blob ─► download
```

| Module | Responsibility |
| --- | --- |
| `src/lib/capture.ts` | `getDisplayMedia` / `getUserMedia` wrappers, device enumeration, error mapping |
| `src/lib/recorder.ts` | `MediaRecorder` wrapper; codec selection (MP4 where supported, else WebM), pause/resume → `Blob` |
| `src/lib/compose.ts` | Post-record compositor: plays raw recordings, draws the bubble on a foreground canvas, mixes audio, encodes the final file with progress |
| `src/lib/compositor.ts` | Live **preview-only** compositor for the arrange screen (RAF canvas) |
| `src/lib/bubble.ts` | Shared circular-bubble geometry + drawing |
| `src/lib/download.ts` | Timestamped blob download |
| `src/hooks/useRecorder.ts` | State machine: capture → record raw tracks → compose → preview |

> **Trade-off:** because compositing happens after you stop, there's a short
> "Processing…" step (roughly the length of the recording) before the file is
> ready. In exchange, the recording never freezes no matter which app you're in.

## Roadmap

These are intentionally **out of scope** for the MVP:

- Trim / basic editing and repositioning the bubble after recording
- Cloud upload + shareable links
- Accounts and a recording library
- Packaging as a desktop app (Electron / Tauri)

## License

MIT
