interface Props {
  progress: number; // 0..1
}

/** Shown while the bubble is composited into the final file after recording. */
export function ProcessingPanel({ progress }: Props) {
  const pct = Math.round(progress * 100);
  return (
    <div className="mx-auto max-w-md space-y-5 py-10 text-center">
      <div className="mx-auto h-12 w-12 animate-spin rounded-full border-4 border-white/15 border-t-brand" />
      <div className="space-y-1">
        <h2 className="text-lg font-semibold text-white">
          Processing your recording…
        </h2>
        <p className="text-sm text-white/60">
          Compositing the webcam bubble into a single file. This runs on your
          device and takes about as long as the recording.
        </p>
      </div>
      <div className="space-y-1.5">
        <div className="h-2 w-full overflow-hidden rounded-full bg-white/10">
          <div
            className="h-full rounded-full bg-brand transition-[width] duration-200"
            style={{ width: `${pct}%` }}
          />
        </div>
        <p className="text-xs tabular-nums text-white/40">{pct}%</p>
      </div>
    </div>
  );
}
