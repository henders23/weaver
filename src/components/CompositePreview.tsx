import { useEffect, useRef } from "react";

interface Props {
  stream: MediaStream;
  className?: string;
}

/**
 * Live preview of exactly what will be recorded: the composited output stream
 * (screen + circular webcam bubble) played in a muted <video>. Using the output
 * stream directly means the preview reflects the off-main-thread compositor.
 */
export function CompositePreview({ stream, className }: Props) {
  const videoRef = useRef<HTMLVideoElement>(null);

  useEffect(() => {
    const video = videoRef.current;
    if (!video) return;
    video.srcObject = stream;
    void video.play().catch(() => {});
    return () => {
      video.srcObject = null;
    };
  }, [stream]);

  return (
    <video
      ref={videoRef}
      autoPlay
      muted
      playsInline
      className={
        "w-full rounded-xl bg-black ring-1 ring-white/10 " + (className ?? "")
      }
    />
  );
}
