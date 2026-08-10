import React, { useCallback, useEffect, useRef } from 'react';

/**
 * The dialog shell every modal on the site sits in — admin and public alike.
 *
 * The six of them were each hand-rolled as a div with a click-to-close
 * backdrop, and none did the rest of the job: no Escape, nothing telling a
 * screen reader this was a dialog, and no focus handling at all — so Tab
 * walked straight out of the dialog into the page behind it, where every field
 * is still reachable and every button still clickable. A keyboard user could
 * edit a member through a form they could not see.
 *
 * Doing it once means the next modal cannot forget:
 *
 *   - Escape closes, unless the dialog is mid-save (`busy`)
 *   - role="dialog" + aria-modal, labelled by its own heading
 *   - focus moves in on open and back to whatever opened it on close
 *   - Tab and Shift+Tab cycle inside the dialog instead of leaving it
 *   - the page behind cannot scroll
 *   - the click-outside-to-close each one already had
 *
 * It takes a single element as its child — the card — and puts the dialog
 * attributes on that element rather than wrapping it. Wrapping would insert a
 * div between the backdrop and the card, which the centring depends on, and
 * would stop the edit screens submitting on Enter, since their card *is* the
 * <form>.
 *
 * `busy` guards the close paths, not the render: a half-finished save must not
 * be dismissable by a stray Escape, but it should still read as a dialog while
 * it saves.
 *
 * `backdropClass` is how the public modals keep their own look — the gallery
 * lightbox is a black sheet, the admin dialogs a navy wash — while sharing the
 * behaviour underneath.
 */

// Everything focusable, minus what a browser skips anyway.
const FOCUSABLE = [
  'a[href]', 'button:not([disabled])', 'input:not([disabled])',
  'select:not([disabled])', 'textarea:not([disabled])', '[tabindex]:not([tabindex="-1"])',
].join(',');

let seq = 0;

const Modal = ({ onClose, busy = false, label, backdropClass = 'admin-modal', children }) => {
  const box = useRef(null);
  const opener = useRef(null);
  const headingId = useRef(`admin-dialog-${++seq}`);

  const close = useCallback(() => { if (!busy && onClose) onClose(); }, [busy, onClose]);

  // Remember what had focus so it can be handed back. Without this, closing
  // drops focus onto <body> and the next Tab restarts at the top of the page,
  // a long way from the row being worked on.
  useEffect(() => {
    opener.current = document.activeElement;
    const first = box.current && box.current.querySelector(FOCUSABLE);
    if (first) first.focus({ preventScroll: true });
    else if (box.current) box.current.focus({ preventScroll: true });

    return () => {
      const back = opener.current;
      if (back && typeof back.focus === 'function' && document.contains(back)) {
        back.focus({ preventScroll: true });
      }
    };
  }, []);

  useEffect(() => {
    const onKey = (e) => {
      if (e.key === 'Escape') { e.stopPropagation(); close(); return; }
      if (e.key !== 'Tab' || !box.current) return;

      const items = [...box.current.querySelectorAll(FOCUSABLE)]
        .filter((el) => el.offsetParent !== null);   // skip anything hidden
      if (!items.length) { e.preventDefault(); return; }

      const first = items[0];
      const last = items[items.length - 1];
      // Only intervene at the ends; in between, let the browser tab normally.
      if (e.shiftKey && document.activeElement === first) {
        e.preventDefault(); last.focus();
      } else if (!e.shiftKey && document.activeElement === last) {
        e.preventDefault(); first.focus();
      }
    };
    document.addEventListener('keydown', onKey, true);
    return () => document.removeEventListener('keydown', onKey, true);
  }, [close]);

  useEffect(() => {
    const previous = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => { document.body.style.overflow = previous; };
  }, []);

  const card = React.Children.only(
    typeof children === 'function' ? children(headingId.current) : children,
  );

  return (
    <div className={backdropClass} onClick={close}>
      {React.cloneElement(card, {
        ref: box,
        role: 'dialog',
        'aria-modal': 'true',
        ...(label ? { 'aria-label': label } : { 'aria-labelledby': headingId.current }),
        tabIndex: -1,
        // the backdrop closes on click; the card must not pass its own through
        onClick: (e) => {
          e.stopPropagation();
          if (card.props.onClick) card.props.onClick(e);
        },
      })}
    </div>
  );
};

export default Modal;
