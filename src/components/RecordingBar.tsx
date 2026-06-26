interface Props {
  elapsedMs: number;
  paused: boolean;
  onPause: () => void;
  onResume: () => void;
  onStop: () => void;
}

function formatDuration(ms: number): string {
  const total = Math.floor(ms / 1000);
  const m = Math.floor(total / 60);
  const s = total % 60;
  return `${String(m).padStart(2, "0")}:${String(s).padStart(2, "0")}`;
}

export function RecordingBar({
  elapsedMs,
  paused,
  onPause,
  onResume,
  onStop,
}: Props) {
  return (
    <div className="flex items-center justify-center gap-4 rounded-xl border border-white/10 bg-white/5 px-5 py-3">
      <span className="flex items-center gap-2 text-sm font-medium text-white">
        <span
          className={
            "inline-block h-3 w-3 rounded-full " +
            (paused ? "bg-yellow-400" : "animate-pulse bg-red-500")
          }
        />
        {paused ? "Paused" : "Recording"}
      </span>

      <span className="font-mono text-lg tabular-nums text-white">
        {formatDuration(elapsedMs)}
      </span>

      {paused ? (
        <button
          onClick={onResume}
          className="rounded-lg bg-white/10 px-4 py-2 text-sm font-medium text-white transition hover:bg-white/20"
        >
          Resume
        </button>
      ) : (
        <button
          onClick={onPause}
          className="rounded-lg bg-white/10 px-4 py-2 text-sm font-medium text-white transition hover:bg-white/20"
        >
          Pause
        </button>
      )}

      <button
        onClick={onStop}
        className="rounded-lg bg-red-500 px-4 py-2 text-sm font-medium text-white transition hover:bg-red-600"
      >
        Stop
      </button>
    </div>
  );
}
