import { useLayoutEffect, useRef } from 'react';

/** A textarea that keeps its height at the height of its text. */
export function useAutoGrow(value) {
  const ref = useRef(null);
  useLayoutEffect(() => {
    const el = ref.current;
    if (!el) return;
    el.style.height = 'auto';
    el.style.height = `${el.scrollHeight}px`;
  }, [value]);
  return ref;
}
