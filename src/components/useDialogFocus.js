import { useEffect } from 'react';

// Everything focusable, minus what a browser skips anyway.
const FOCUSABLE = [
  'a[href]', 'button:not([disabled])', 'input:not([disabled])',
  'select:not([disabled])', 'textarea:not([disabled])', '[tabindex]:not([tabindex="-1"])',
].join(',');

/**
 * Keeps the keyboard inside an open dialog, and puts it back afterwards.
 *
 * A dialog that only closes on Escape still leaks: Tab walks out of it and
 * through the page underneath, which is still rendered and still clickable, so
 * a keyboard user can be typing into something they cannot see. And on close,
 * focus lands on <body>, so the next Tab restarts at the top of the page rather
 * than at the thing they opened.
 *
 * A hook rather than only living inside <Modal> because the public modals put
 * their dialog role on the backdrop itself and have their own markup —
 * restructuring them to fit a shared shell would risk more than it fixes, but
 * they need this part just the same.
 *
 * `ref` is the element to hold focus within, and `active` says whether the
 * dialog is open — the hook does nothing while it is not.
 */
export const useDialogFocus = (ref, active) => {
  useEffect(() => {
    if (!active || !ref.current) return undefined;

    const opener = document.activeElement;
    const box = ref.current;

    const first = box.querySelector(FOCUSABLE);
    if (first) first.focus({ preventScroll: true });
    else {
      // Nothing focusable inside — the gallery lightbox is a picture and its
      // controls. Make the box itself focusable so the trap has an anchor.
      if (!box.hasAttribute('tabindex')) box.setAttribute('tabindex', '-1');
      box.focus({ preventScroll: true });
    }

    const onKey = (e) => {
      if (e.key !== 'Tab') return;
      const items = [...box.querySelectorAll(FOCUSABLE)].filter((el) => el.offsetParent !== null);
      if (!items.length) { e.preventDefault(); return; }

      const top = items[0];
      const end = items[items.length - 1];
      // Only intervene at the ends; in between, let the browser tab normally.
      if (e.shiftKey && document.activeElement === top) {
        e.preventDefault(); end.focus();
      } else if (!e.shiftKey && document.activeElement === end) {
        e.preventDefault(); top.focus();
      } else if (!box.contains(document.activeElement)) {
        e.preventDefault(); top.focus();
      }
    };

    document.addEventListener('keydown', onKey, true);
    return () => {
      document.removeEventListener('keydown', onKey, true);
      if (opener && typeof opener.focus === 'function' && document.contains(opener)) {
        opener.focus({ preventScroll: true });
      }
    };
  }, [ref, active]);
};

export default useDialogFocus;
