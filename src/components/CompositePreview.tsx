import { useEffect, useRef } from "react";
import type { Compositor } from "../lib/compositor";

interface Props {
  compositor: Compositor;
  className?: string;
}

/**
 * Shows a live, mirror-accurate preview of exactly what will be recorded by
 * copying the compositor's composited frames into a visible canvas each RAF.
 */
export function CompositePreview({ compositor, className }: Props) {
  const canvasRef = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    let raf = 0;
    const tick = () => {
      const canvas = canvasRef.current;
      if (canvas) compositor.paintPreview(canvas);
      raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [compositor]);

  return (
    <canvas
      ref={canvasRef}
      className={
        "w-full rounded-xl bg-black ring-1 ring-white/10 " + (className ?? "")
      }
    />
  );
}
