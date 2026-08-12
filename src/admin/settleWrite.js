// Resolving a write whose answer was lost.
//
// Apps Script intermittently answers a POST with an HTML page rather than the
// JSON it meant to send — and the write itself has already happened. The
// browser sees "the service did not respond properly", the committee presses
// Save again, and the ledger ends up holding the entry twice. That is how the
// funds sheet came to carry five transaction ids twice over.
//
// A failed write cannot be retried safely because "it failed" and "the answer
// was lost" look identical from here. So they are told apart by looking rather
// than by guessing: read the ledger back and see whether the entry is in it.
//
// The discriminator is the code. Every refusal the script means — BAD_AMOUNT,
// OPENING_EXISTS, UNAUTHORIZED — carries one, and nothing was written. A
// failure with no code came from the transport: the request may have arrived,
// run, and had its reply thrown away.

/** True when the failure says nothing about whether the write happened. */
const isAmbiguous = (res) => Boolean(res) && res.ok === false && !res.code;

/**
 * Performs a write and, if its answer is lost, decides by reading.
 *
 * `landed(rows)` answers one question about the ledger as it now stands: is the
 * thing I asked for in there? It is given the rows rather than asked to fetch
 * them, so the same read serves both the check and the caller's new state.
 *
 * Returns the write's own answer when it arrives, the re-read when that proves
 * the write landed, and the original failure when it proves nothing — never a
 * silent success. A caller that gets `{ ok: true, recovered: true }` may say so
 * if it wants; the entry is saved either way.
 */
export const settleWrite = async ({ attempt, reread, rowsOf, landed }) => {
  const res = await attempt();
  if (res.ok || !isAmbiguous(res)) return res;

  const after = await reread();
  // The read failed too, so the question is still open. The original failure is
  // the honest thing to report: it is what the committee needs to act on, and
  // claiming success on a write nobody can see would be worse than a retry.
  if (!after || !after.ok) return res;

  const rows = rowsOf(after) || [];
  if (!landed(rows)) return res;

  return { ...after, recovered: true };
};

/**
 * Whether a ledger holds this entry — by its id when it has one, and by what it
 * says when it does not.
 *
 * A new entry has no id: the script hands one out on the way in, so the browser
 * cannot name what it just wrote. Its date, its remark and its amount together
 * are what identify it, which is the same triple a person would look for.
 */
export const holdsEntry = (rows, entry) => {
  const id = String(entry.trnsctn_id || '').trim();
  if (id) return rows.some((r) => String(r.trnsctn_id) === id);

  const credit = Number(entry.credit) || 0;
  const debit = Number(entry.debit) || 0;
  const reason = String(entry.reason || '').trim();
  const date = String(entry.date || '').trim();

  return rows.some((r) => String(r.date).trim() === date
    && String(r.reason || '').trim() === reason
    && (Number(r.credit) || 0) === credit
    && (Number(r.debit) || 0) === debit);
};

/** Whether a ledger no longer holds this id. */
export const lacksEntry = (rows, id) =>
  !rows.some((r) => String(r.trnsctn_id) === String(id));
