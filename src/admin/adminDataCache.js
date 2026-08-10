// The three sheets, held for the length of a visit.
//
// Its own module, with no imports, so that AuthContext can empty it on sign-out
// without importing the hook that reads it — and the hook can go on importing
// AuthContext. A cycle between those two works in ES modules but only by luck
// of evaluation order, which is not something to rely on for a store that holds
// every member's email and access flags.
//
// Apps Script takes 3–4 seconds to answer. Fetching per screen meant paying
// that on every click of the sidebar, watching skeletons redraw rows that had
// not changed; this pays it once.
const TTL_MS = 5 * 60 * 1000;

let entry = null;      // { token, at, data }
let inFlight = null;   // shared by screens mounting at the same moment

/** The rows, if they were fetched for this member and are still young. */
export const readCache = (token) =>
  entry && entry.token === token && Date.now() - entry.at < TTL_MS ? entry.data : null;

export const writeCache = (token, data) => { entry = { token, at: Date.now(), data }; };

/** Refreshes the timestamp only if these rows belong to the current member. */
export const patchCache = (token, data) => {
  if (entry && entry.token === token) writeCache(token, data);
};

/** One request when several screens mount together, rather than a race. */
export const share = (make) => {
  if (!inFlight) inFlight = Promise.resolve(make()).finally(() => { inFlight = null; });
  return inFlight;
};

/** Called on sign-out. Without it the next member to use this tab sees these rows. */
export const clearAdminData = () => { entry = null; inFlight = null; };
