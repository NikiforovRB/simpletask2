import { useEffect } from 'react';

/**
 * On narrow viewports, keeps the task title field in view when the soft keyboard opens
 * (visualViewport resize) to reduce layout jumps.
 */
export function useMobileTaskEditViewportScroll(active, inputRef, anchorRef) {
  useEffect(() => {
    if (!active) return;
    const input = inputRef.current;
    if (!input) return;

    const padding = 14;

    const sync = () => {
      const el = inputRef.current;
      if (!el) return;
      const vv = window.visualViewport;
      const anchor = anchorRef?.current;
      if (!vv) {
        (anchor || el).scrollIntoView({ block: 'nearest', behavior: 'instant' });
        return;
      }
      const rect = el.getBoundingClientRect();
      const viewTop = vv.offsetTop;
      const viewBottom = vv.offsetTop + vv.height;
      let dy = 0;
      if (rect.bottom > viewBottom - padding) {
        dy = rect.bottom - (viewBottom - padding);
      } else if (rect.top < viewTop + padding) {
        dy = rect.top - (viewTop + padding);
      }
      if (Math.abs(dy) > 0.5) {
        window.scrollBy({ top: dy, left: 0, behavior: 'instant' });
      }
    };

    const runDelayed = () => {
      sync();
      requestAnimationFrame(sync);
    };

    runDelayed();
    const t0 = window.setTimeout(runDelayed, 50);
    const t1 = window.setTimeout(runDelayed, 200);
    const t2 = window.setTimeout(runDelayed, 450);

    const vv = window.visualViewport;
    vv?.addEventListener('resize', sync);
    vv?.addEventListener('scroll', sync);
    input.addEventListener('focus', sync);

    return () => {
      clearTimeout(t0);
      clearTimeout(t1);
      clearTimeout(t2);
      vv?.removeEventListener('resize', sync);
      vv?.removeEventListener('scroll', sync);
      input.removeEventListener('focus', sync);
    };
  }, [active, inputRef, anchorRef]);
}
