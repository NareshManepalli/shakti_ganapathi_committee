import { FESTIVAL_DAYS } from '../config/festival';
import { dateKey, toDmy } from './fundsApi';

// The committee counts in celebrations, not calendars.
//
// A year runs from the day after one Vinayaka Chavithi finishes to the day the
// next one finishes: money is collected across that whole span and spent on the
// celebration that closes it. The ledger's Oct 2025 – Jul 2026 rows are one such
// year, which a calendar filter split into a "2025" of three rows and a "2026"
// of eight — neither of them a period anybody at a meeting would recognise.
//
// Nothing here needs its own list of dates. Day 1 of each year in the schedule
// sheet IS that year's celebration date, and the committee already maintains it
// on the Schedule screen. Enter a year there and the fund year appears here.

const ORDINALS = ['th', 'st', 'nd', 'rd'];

const ordinal = (n) => {
  const v = n % 100;
  return `${n}${ORDINALS[(v - 20) % 10] || ORDINALS[v] || ORDINALS[0]}`;
};

/** `2025-08-27` + n days, as `dd-mm-yyyy`. Built from parts: a bare ISO string
 *  parses as UTC, which lands a day early anywhere east of Greenwich. */
const shift = (iso, days) => {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(String(iso || '').trim());
  if (!m) return '';
  const at = new Date(Number(m[1]), Number(m[2]) - 1, Number(m[3]) + days);
  return `${String(at.getDate()).padStart(2, '0')}-${String(at.getMonth() + 1).padStart(2, '0')}-${at.getFullYear()}`;
};

const dayAfter = (dmy) => {
  const m = /^(\d{1,2})-(\d{1,2})-(\d{4})$/.exec(String(dmy || '').trim());
  if (!m) return '';
  const at = new Date(Number(m[3]), Number(m[2]) - 1, Number(m[1]) + 1);
  return `${String(at.getDate()).padStart(2, '0')}-${String(at.getMonth() + 1).padStart(2, '0')}-${at.getFullYear()}`;
};

const yearOfDmy = (dmy) => String(dmy || '').slice(6);

/**
 * The fund years, oldest first, from the schedule sheet's day-1 rows.
 *
 * Each ends when its own celebrations end — a pandal bill dated during the
 * festival is paid out of the fund that was collected for it, so it belongs to
 * that year and not the one starting the day after.
 *
 * A final open-ended year is always appended: once a celebration has passed,
 * what is collected next has somewhere to go before the following year's
 * schedule has been entered.
 */
export const buildCycles = (scheduleRows) => {
  const starts = [];
  for (const r of scheduleRows || []) {
    if (Number(r.day_no) !== 1) continue;
    const iso = String(r.date || '').trim();
    if (!/^\d{4}-\d{2}-\d{2}$/.test(iso)) continue;
    // annual_year is what the committee calls the span this celebration closes.
    // Taken as written when it is there, worked out from the dates when it is
    // not, so a sheet that predates the column still reads correctly.
    starts.push({ iso, annual: String(r.annual_year || '').trim() });
  }
  if (!starts.length) return [];

  starts.sort((a, b) => (a.iso < b.iso ? -1 : 1));
  const cycles = [];
  let previousEnd = '';

  starts.forEach(({ iso, annual }, i) => {
    const end = shift(iso, FESTIVAL_DAYS - 1);
    cycles.push({
      no: i + 1,
      annual,
      // The first year has no start: whatever was collected before the very
      // first celebration belongs to it, however far back that goes.
      from: previousEnd ? dayAfter(previousEnd) : '',
      to: end,
      festival: toDmy(iso),
    });
    previousEnd = end;
  });

  cycles.push({
    no: cycles.length + 1,
    from: dayAfter(previousEnd),
    to: '',
    festival: '',
    open: true,
  });

  return cycles;
};

/** `2nd year (2025 - 2026)` — the committee's own way of naming a year. */
export const cycleLabel = (cycle) => {
  if (!cycle) return '';
  if (cycle.annual) return `${ordinal(cycle.no)} year (${cycle.annual})`;
  const from = yearOfDmy(cycle.from) || yearOfDmy(cycle.to);
  const to = yearOfDmy(cycle.to);
  const span = !to ? `${from} onwards` : (from === to ? from : `${from} - ${to}`);
  return `${ordinal(cycle.no)} year (${span})`;
};

/** The rows falling in one fund year. */
export const rowsIn = (rows, cycle) => {
  if (!cycle) return [];
  const from = cycle.from ? dateKey(cycle.from) : -Infinity;
  const to = cycle.to ? dateKey(cycle.to) : Infinity;
  return (rows || []).filter((r) => {
    const k = dateKey(r.date);
    return k >= from && k <= to;
  });
};

/** The year a date falls in, or null when the schedule does not reach it. */
export const cycleFor = (cycles, dmy) => {
  const k = dateKey(dmy);
  return (cycles || []).find((c) => {
    const from = c.from ? dateKey(c.from) : -Infinity;
    const to = c.to ? dateKey(c.to) : Infinity;
    return k >= from && k <= to;
  }) || null;
};

/**
 * The years worth offering: any that hold entries, plus the one today falls in.
 *
 * An empty year between two full ones would still be offered — it is a real
 * period that simply had no movement — but the trailing open year is not, until
 * either something lands in it or it becomes the current one.
 */
export const usefulCycles = (cycles, rows, today) => {
  const used = new Set();
  for (const r of rows || []) {
    const c = cycleFor(cycles, r.date);
    if (c) used.add(c.no);
  }
  const current = cycleFor(cycles, today);
  if (current) used.add(current.no);
  return (cycles || []).filter((c) => used.has(c.no));
};
