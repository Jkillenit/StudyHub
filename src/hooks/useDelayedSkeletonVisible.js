import { useEffect, useState } from "react";

/**
 * UI-010 / UI-012: show skeleton only after 80ms if still loading; force-hide by 800ms;
 * clear immediately when loading ends or when sync content is already available.
 *
 * @param {boolean} loading
 * @param {unknown} activeKey — resets timers when navigation changes
 * @param {boolean} [hasImmediateContent=false] — when true, skip skeleton entirely (sync-ready body)
 */
export function useDelayedSkeletonVisible(loading, activeKey, hasImmediateContent = false) {
  const [visible, setVisible] = useState(false);

  useEffect(() => {
    if (hasImmediateContent) {
      setVisible(false);
      return undefined;
    }
    if (!loading) {
      setVisible(false);
      return undefined;
    }
    const showTimer = window.setTimeout(() => setVisible(true), 80);
    const hideTimer = window.setTimeout(() => setVisible(false), 800);
    return () => {
      window.clearTimeout(showTimer);
      window.clearTimeout(hideTimer);
    };
  }, [loading, activeKey, hasImmediateContent]);

  return loading && visible;
}
