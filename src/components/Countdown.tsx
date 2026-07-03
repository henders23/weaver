import { useEffect, useState } from "react";

interface Props {
  from?: number;
  onComplete: () => void;
}

/** Full-screen 3-2-1 overlay; calls onComplete when it reaches zero. */
export function Countdown({ from = 3, onComplete }: Props) {
  const [count, setCount] = useState(from);

  useEffect(() => {
    if (count <= 0) {
      onComplete();
      return;
    }
    const t = window.setTimeout(() => setCount((c) => c - 1), 1000);
    return () => window.clearTimeout(t);
  }, [count, onComplete]);

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 backdrop-blur-sm">
      <div
        key={count}
        className="animate-pulse text-[8rem] font-bold tabular-nums text-white"
      >
        {count > 0 ? count : "Go"}
      </div>
    </div>
  );
}
