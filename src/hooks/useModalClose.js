import { useEffect, useRef } from 'react';

// Open modals, the topmost last: Escape closes only that one.
const openModals = [];

/** Escape calls the latest `onClose`; the page under the modal doesn't scroll. */
export function useModalClose(onClose) {
  const onCloseRef = useRef(onClose);
  useEffect(() => {
    onCloseRef.current = onClose;
  });

  useEffect(() => {
    const entry = {};
    openModals.push(entry);
    const onKey = (e) => {
      if (e.key !== 'Escape' || e.defaultPrevented || openModals[openModals.length - 1] !== entry) return;
      e.preventDefault();
      onCloseRef.current();
    };
    window.addEventListener('keydown', onKey);
    const { overflow } = document.body.style;
    document.body.style.overflow = 'hidden';
    return () => {
      openModals.splice(openModals.indexOf(entry), 1);
      window.removeEventListener('keydown', onKey);
      document.body.style.overflow = overflow;
    };
  }, []);
}
