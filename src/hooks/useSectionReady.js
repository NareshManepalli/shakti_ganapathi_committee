import { useEffect, useState } from 'react';

// Stand-in for the Phase 1/2 data fetch. Sections render their skeleton while
// this returns true; once the Apps Script clients exist, swap the timer for the
// request's own loading state and the skeleton markup stays exactly as it is.
//
// Set this to 0 to stop the skeletons showing until real fetching exists —
// until then the delay is what makes them visible.
export const SKELETON_PLACEHOLDER_MS = 550;

export const useSectionReady = (delay = SKELETON_PLACEHOLDER_MS) => {
  const [loading, setLoading] = useState(delay > 0);

  useEffect(() => {
    if (delay <= 0) return undefined;
    const id = setTimeout(() => setLoading(false), delay);
    return () => clearTimeout(id);
  }, [delay]);

  return loading;
};
