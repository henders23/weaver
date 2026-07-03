import { useState } from "react";
import { useRecorder } from "./hooks/useRecorder";
import { SetupPanel } from "./components/SetupPanel";
import { CompositePreview } from "./components/CompositePreview";
import { Countdown } from "./components/Countdown";
import { RecordingBar } from "./components/RecordingBar";
import { ProcessingPanel } from "./components/ProcessingPanel";
import { PreviewPanel } from "./components/PreviewPanel";
import type { BubblePosition, BubbleSize } from "./types";

export default function App() {
  const r = useRecorder();
  const [busy, setBusy] = useState(false);

  const handleStart = async () => {
    setBusy(true);
    await r.beginConfiguring();
    setBusy(false);
  };

  return (
    <div className="min-h-full bg-gradient-to-b from-zinc-950 to-zinc-900 text-white">
      <div className="mx-auto max-w-5xl px-4 py-8">
        <Header />

        {!r.supported ? (
          <Unsupported />
        ) : (
          <main className="mt-8">
            {r.error && (
              <div className="mx-auto mb-6 max-w-md rounded-lg border border-red-500/30 bg-red-500/10 px-4 py-3 text-sm text-red-200">
                {r.error}
              </div>
            )}

            {r.state === "idle" && (
              <SetupPanel
                config={r.config}
                setConfig={r.setConfig}
                cameras={r.cameras}
                mics={r.mics}
                onStart={handleStart}
                busy={busy}
              />
            )}

            {(r.state === "configuring" ||
              r.state === "countdown" ||
              r.state === "recording" ||
              r.state === "paused") &&
              r.previewStream && (
                <div className="space-y-5">
                  <CompositePreview stream={r.previewStream} />

                  {r.state === "configuring" && (
                    <p className="text-center text-xs text-white/40">
                      Sharing your whole screen? The preview shows Weaver filming
                      itself — that's just the preview. Once you start, switch to
                      the app you want to record; the webcam bubble is added when
                      you stop.
                    </p>
                  )}

                  {r.state === "configuring" && (
                    <ArrangeControls
                      position={r.config.bubblePosition}
                      size={r.config.bubbleSize}
                      onPosition={(p) =>
                        r.setConfig((c) => ({ ...c, bubblePosition: p }))
                      }
                      onSize={(s) =>
                        r.setConfig((c) => ({ ...c, bubbleSize: s }))
                      }
                      onRecord={r.startCountdown}
                      onCancel={r.reset}
                    />
                  )}

                  {(r.state === "recording" || r.state === "paused") && (
                    <RecordingBar
                      elapsedMs={r.elapsedMs}
                      paused={r.state === "paused"}
                      onPause={r.pause}
                      onResume={r.resume}
                      onStop={r.stop}
                    />
                  )}
                </div>
              )}

            {r.state === "countdown" && (
              <Countdown onComplete={() => void r.startRecording()} />
            )}

            {r.state === "processing" && (
              <ProcessingPanel progress={r.processingProgress} />
            )}

            {r.state === "preview" && r.result && (
              <PreviewPanel result={r.result} onReRecord={r.reset} />
            )}
          </main>
        )}

        <Footer />
      </div>
    </div>
  );
}

function Header() {
  return (
    <header className="flex items-center gap-3">
      <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-brand text-lg font-bold">
        W
      </div>
      <div>
        <h1 className="text-xl font-bold leading-none">Weaver</h1>
        <p className="text-sm text-white/50">
          Record your screen with a webcam bubble — right in your browser.
        </p>
      </div>
    </header>
  );
}

const ARRANGE_POSITIONS: { value: BubblePosition; label: string }[] = [
  { value: "top-left", label: "↖" },
  { value: "top-right", label: "↗" },
  { value: "bottom-left", label: "↙" },
  { value: "bottom-right", label: "↘" },
];

const ARRANGE_SIZES: { value: BubbleSize; label: string }[] = [
  { value: "small", label: "S" },
  { value: "medium", label: "M" },
  { value: "large", label: "L" },
];

function ArrangeControls({
  position,
  size,
  onPosition,
  onSize,
  onRecord,
  onCancel,
}: {
  position: BubblePosition;
  size: BubbleSize;
  onPosition: (p: BubblePosition) => void;
  onSize: (s: BubbleSize) => void;
  onRecord: () => void;
  onCancel: () => void;
}) {
  return (
    <div className="flex flex-wrap items-center justify-center gap-4 rounded-xl border border-white/10 bg-white/5 px-5 py-3">
      <div className="flex items-center gap-2">
        <span className="text-sm text-white/60">Position</span>
        <div className="flex gap-1">
          {ARRANGE_POSITIONS.map((p) => (
            <MiniButton
              key={p.value}
              active={position === p.value}
              onClick={() => onPosition(p.value)}
            >
              {p.label}
            </MiniButton>
          ))}
        </div>
      </div>

      <div className="flex items-center gap-2">
        <span className="text-sm text-white/60">Size</span>
        <div className="flex gap-1">
          {ARRANGE_SIZES.map((s) => (
            <MiniButton
              key={s.value}
              active={size === s.value}
              onClick={() => onSize(s.value)}
            >
              {s.label}
            </MiniButton>
          ))}
        </div>
      </div>

      <div className="ml-auto flex gap-2">
        <button
          onClick={onCancel}
          className="rounded-lg bg-white/10 px-4 py-2 text-sm font-medium text-white transition hover:bg-white/20"
        >
          Cancel
        </button>
        <button
          onClick={onRecord}
          className="rounded-lg bg-red-500 px-5 py-2 text-sm font-medium text-white transition hover:bg-red-600"
        >
          Start recording
        </button>
      </div>
    </div>
  );
}

function MiniButton({
  active,
  onClick,
  children,
}: {
  active: boolean;
  onClick: () => void;
  children: React.ReactNode;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={
        "h-8 w-8 rounded-md border text-sm transition " +
        (active
          ? "border-brand bg-brand/20 text-white"
          : "border-white/10 bg-white/5 text-white/70 hover:border-white/30")
      }
    >
      {children}
    </button>
  );
}

function Unsupported() {
  return (
    <div className="mx-auto mt-12 max-w-md rounded-xl border border-yellow-500/30 bg-yellow-500/10 p-6 text-center">
      <h2 className="text-lg font-semibold text-white">Browser not supported</h2>
      <p className="mt-2 text-sm text-white/70">
        Weaver needs the Screen Capture and MediaRecorder APIs. Please use a
        recent version of <strong>Chrome</strong> or <strong>Edge</strong> on
        desktop. For capturing system audio, Chrome/Edge on Windows works best.
      </p>
    </div>
  );
}

function Footer() {
  return (
    <footer className="mt-16 border-t border-white/10 pt-6 text-center text-xs text-white/40">
      Open-source · runs entirely in your browser · no uploads, no accounts.
    </footer>
  );
}
