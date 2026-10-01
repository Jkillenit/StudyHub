import { useEffect, useState } from "react";

/** Highlights and pinned notes on page elements, kept on their elements through resizes and scrolling. */
export function useNovaMarks() {
  /** `{ key, el, style, note }` */
  const [marks, setMarks] = useState([]);
  const [, setMarkTick] = useState(0);

  const hasMarks = marks.length > 0;
  useEffect(() => {
    if (!hasMarks) return undefined;
    let raf = 0;
    const onChange = () => {
      if (!raf) raf = requestAnimationFrame(() => {
        raf = 0;
        setMarkTick((n) => n + 1);
      });
    };
    window.addEventListener("resize", onChange);
    window.addEventListener("scroll", onChange, true);
    return () => {
      cancelAnimationFrame(raf);
      window.removeEventListener("resize", onChange);
      window.removeEventListener("scroll", onChange, true);
    };
  }, [hasMarks]);

  return { marks, setMarks };
}
