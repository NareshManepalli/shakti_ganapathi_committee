import { useEffect } from 'react';

/**
 * Refuses copy and cut on the public pages.
 *
 * The CSS in index.css switches selection off, which is what stops the ordinary
 * drag-and-copy. This is the backstop for the ways round it: Ctrl+A then Ctrl+C
 * still lifts the text in some browsers even when nothing appears selected, and
 * the right-click menu keeps its Copy entry for links and images.
 *
 * Two things it deliberately does not do:
 *
 *   - It never fires inside a field. A member correcting a mistyped mobile, or
 *     pasting a code out of their email, is not copying the committee's
 *     content — and breaking that would break the sign-in gate.
 *   - It is never mounted by the admin portal. Editing means moving a Drive
 *     link from one box to another, and a portal that refuses to copy is a
 *     portal nobody can work in.
 *
 * Worth being honest about the limit: this raises the effort, it does not make
 * the page uncopyable. Anything rendered in a browser can be read out of the
 * page source or screenshotted, and a determined visitor will. It stops casual
 * copying, which is what was asked for.
 */
const EDITABLE = 'input, textarea, select, [contenteditable="true"]';

export const useCopyGuard = (active = true) => {
  useEffect(() => {
    if (!active) return undefined;

    const fromAField = (e) => {
      const el = e.target;
      return el && typeof el.closest === 'function' && el.closest(EDITABLE);
    };

    const block = (e) => {
      if (fromAField(e)) return;
      e.preventDefault();
    };

    // Ctrl/Cmd+C and Ctrl/Cmd+X are caught by the copy/cut events themselves;
    // this only has to stop the select-all that sets them up.
    const onKey = (e) => {
      if (!(e.ctrlKey || e.metaKey)) return;
      if (e.key !== 'a' && e.key !== 'A') return;
      if (fromAField(e)) return;
      e.preventDefault();
    };

    document.addEventListener('copy', block);
    document.addEventListener('cut', block);
    document.addEventListener('keydown', onKey);
    return () => {
      document.removeEventListener('copy', block);
      document.removeEventListener('cut', block);
      document.removeEventListener('keydown', onKey);
    };
  }, [active]);
};

export default useCopyGuard;
