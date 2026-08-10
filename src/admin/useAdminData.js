import { useCallback, useEffect, useRef, useState } from 'react';
import { useAuth } from '../contexts/AuthContext';
import { fetchAll, isContentConfigured } from './contentApi';
import { readCache, writeCache, patchCache, share } from './adminDataCache';

// One fetch shared by every editor screen. The Content Web App returns all
// three sheets in a single call, so a screen that needs the schedule also gets
// the members list for free — and a save can hand back the fresh rows without
// a second round trip.
//
// Those rows are then kept for the rest of the visit (see adminDataCache).
//
// Deliberately NOT revalidated in the background on later mounts. Each screen
// seeds its form from the fetched row, so a reply landing while somebody is
// typing would wipe what they had typed. Instead the cache expires on its own,
// and a save folds its fresh rows back in — so what is on screen is either what
// was just loaded or what was just written.
const EMPTY = { content: [], schedule: [], members: [] };

export const useAdminData = () => {
  const { token } = useAuth();
  const configured = isContentConfigured();
  const cached = readCache(token);

  const [data, setData] = useState(cached || EMPTY);
  const [loading, setLoading] = useState(configured && !cached);
  const [error, setError] = useState('');
  const alive = useRef(true);

  const load = useCallback(async (force) => {
    if (!configured || !token) { setLoading(false); return; }

    if (!force) {
      const hit = readCache(token);
      if (hit) { setData(hit); setError(''); setLoading(false); return; }
    }

    setLoading(true);
    const res = await share(() => fetchAll(token));
    if (!alive.current) return;
    setLoading(false);
    if (!res.ok) { setError(res.error || 'Could not load the sheets.'); return; }
    setError('');
    const next = {
      content: res.content || [], schedule: res.schedule || [], members: res.members || [],
    };
    writeCache(token, next);
    setData(next);
  }, [token, configured]);

  useEffect(() => {
    // StrictMode mounts twice; without this the second mount starts life dead
    // and the screen sits in skeletons forever.
    alive.current = true;
    load();
    return () => { alive.current = false; };
  }, [load]);

  /** Fold the rows a save handed back into place, without refetching. */
  const merge = useCallback((patch) => {
    setData((d) => {
      const next = { ...d, ...patch };
      patchCache(token, next);
      return next;
    });
  }, [token]);

  return {
    ...data, loading, error, configured, merge, token,
    reload: () => load(true),
  };
};
