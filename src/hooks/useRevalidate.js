import { useEffect, useRef } from 'react';

// ---------------------------------------------------------------------------
// Re-runs `callback` when the visitor comes back to the page, so a photo or a
// sheet edit made a moment ago is simply there without anyone pressing reload.
//
// Fires on the tab becoming visible again and on window focus — the two things
// that actually mean "someone is looking at this now". Deliberately NOT a
// timer: polling a Google endpoint every N seconds on an idle tab costs the
// committee's visitors bandwidth for nothing.
//
// The `minGapMs` guard stops a flurry of focus/visibility events (alt-tabbing,
// or both firing for one switch) turning into a burst of requests.
// ---------------------------------------------------------------------------

export const DEFAULT_MIN_GAP_MS = 30000; // 30s

export const useRevalidate = (callback, minGapMs = DEFAULT_MIN_GAP_MS) => {
  // Held in a ref so changing the callback doesn't tear down the listeners.
  const cbRef = useRef(callback);
  cbRef.current = callback;

  // Seeded with the mount time: the initial load has just run, so a focus
  // event a second later should not immediately re-fetch everything.
  const lastRun = useRef(Date.now());

  useEffect(() => {
    const run = () => {
      if (document.visibilityState === 'hidden') return;
      const now = Date.now();
      if (now - lastRun.current < minGapMs) return;
      lastRun.current = now;
      cbRef.current();
    };

    document.addEventListener('visibilitychange', run);
    window.addEventListener('focus', run);
    return () => {
      document.removeEventListener('visibilitychange', run);
      window.removeEventListener('focus', run);
    };
  }, [minGapMs]);
};
