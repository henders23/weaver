import { useEffect, useMemo, useState } from "react";
import type { RecordingResult } from "../lib/recorder";
import { downloadBlob, recordingFilename } from "../lib/download";

interface Props {
  result: RecordingResult;
  onReRecord: () => void;
}

function formatSize(bytes: number): string {
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(0)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

export function PreviewPanel({ result, onReRecord }: Props) {
  const url = useMemo(() => URL.createObjectURL(result.blob), [result.blob]);
  const [downloaded, setDownloaded] = useState(false);

  useEffect(() => {
    return () => URL.revokeObjectURL(url);
  }, [url]);

  const handleDownload = () => {
    downloadBlob(result.blob, recordingFilename(result.extension));
    setDownloaded(true);
  };

  return (
    <div className="mx-auto max-w-3xl space-y-4">
      <div className="flex items-center justify-between">
        <h2 className="text-lg font-semibold text-white">Your recording</h2>
        <span className="text-sm text-white/50">
          {result.extension.toUpperCase()} · {formatSize(result.blob.size)}
        </span>
      </div>

      <video
        src={url}
        controls
        autoPlay
        className="w-full rounded-xl bg-black ring-1 ring-white/10"
      />

      <div className="flex flex-wrap gap-3">
        <button
          onClick={handleDownload}
          className="rounded-lg bg-brand px-5 py-2.5 font-medium text-white transition hover:bg-brand-dark"
        >
          {downloaded ? "Download again" : "Download"}
        </button>
        <button
          onClick={onReRecord}
          className="rounded-lg bg-white/10 px-5 py-2.5 font-medium text-white transition hover:bg-white/20"
        >
          Record another
        </button>
      </div>

      {downloaded && (
        <p className="text-sm text-white/50">
          Saved to your downloads folder. Everything stayed on your device —
          nothing was uploaded.
        </p>
      )}
    </div>
  );
}
