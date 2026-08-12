import React, {
  createContext, useCallback, useContext, useEffect, useRef, useState,
} from 'react';
import { useRevalidate } from '../hooks/useRevalidate';
import { SHEETS_CONFIG } from '../config/sheetsConfig';
import { fetchSheetRows, fetchMembersApi, toMediaUrl } from '../utils/sheetService';
import { readCache, writeCache } from '../utils/contentCache';

// ---------------------------------------------------------------------------
// Loads every section sheet once on mount and hands the shaped result to the
// components through useSectionContent(name). Each sheet is fetched in
// parallel and stored under its own key, so one slow or missing sheet never
// holds up the rest of the page.
// ---------------------------------------------------------------------------

const ContentContext = createContext({ sections: {}, failed: {}, loading: true, reload: () => {} });

/* ---------------------------------------------------------- transformers */

// content sheet -> { about: {...}, mandapam: {...} }
// Headings and subtitles stay in translations.js; only the editable body,
// image and map come from the sheet.
const transformContent = (rows) => {
  const out = {};
  rows.forEach((r) => {
    const section = String(r.section || '').trim().toLowerCase();
    if (!section) return;
    out[section] = {
      // Carried so the admin portal can edit a row by id later; the public
      // site keys on `section`.
      id: Number(r.id) || 0,
      en: r.content_en || '',
      te: r.content_te || '',
      image: toMediaUrl(r.image),
      mapUrl: r.map_url || '',
    };
  });
  return out;
};

// members sheet -> the public committee list, in display order.
// email / access_in / adm_in are deliberately not carried through — nothing on
// the public site needs them. `mobile` is the exception: the identity card
// shows it, so it does reach the browser and is public to anyone who opens a
// card.
const transformMembers = (rows) => rows
  .map((r) => ({
    id: Number(r.id) || 0,
    name: r.name_en || '',
    nameTe: r.name_te || '',
    position: r.position_en || '',
    positionTe: r.position_te || '',
    mobile: String(r.mobile || '').trim(),
    // photo -> grid thumbnail, prfle_photo -> the identity card
    photo: toMediaUrl(r.photo, 600),
    profilePhoto: toMediaUrl(r.prfle_photo, 1000),
    order: Number(r.display_order) || 0,
    // The two sources type this differently: the CSV export gives the string
    // "1", the Members Web App gives a real boolean. Accept both, or switching
    // source silently drops every executive into the grid.
    isExecutive: r.is_executive === true || String(r.is_executive).trim() === '1',
  }))
  .sort((a, b) => a.order - b.order);

// schedule sheet -> { years, year, days } for the latest year present.
const transformSchedule = (rows) => {
  const years = [...new Set(rows.map((r) => String(r.year).trim()).filter(Boolean))]
    .sort((a, b) => Number(b) - Number(a));
  const year = years[0] || '';

  const days = rows
    .filter((r) => String(r.year).trim() === year)
    .map((r) => ({
      // Row identity for editing; `day` is the 1-9 label shown on the card.
      id: Number(r.id) || 0,
      year: Number(r.year),
      day: Number(r.day_no) || 0,
      date: r.date || '',
      // Optional overrides — blank means "derive from the date", which stops a
      // typed weekday contradicting the date beside it.
      dayEn: r.day_en || '',
      dayTe: r.day_te || '',
      time: r.time || '',
      titleEn: r.title_en || '',
      titleTe: r.title_te || '',
      image: toMediaUrl(r.image, 600),
    }))
    .sort((a, b) => a.day - b.day);

  return { years, year, days };
};

const TRANSFORMERS = {
  content: transformContent,
  members: transformMembers,
  schedule: transformSchedule,
};

/* ------------------------------------------------------------- provider */

// Sections with a public, read-only Web App in front of them. Everything else
// is read from the sheet's CSV export.
const PUBLIC_READ_API = new Set(['members']);

export const ContentProvider = ({ children }) => {
  // The last good copy, read synchronously so the first paint already has it.
  // Read in an initialiser rather than an effect: an effect runs after the
  // first render, which is one frame of skeleton over content the browser
  // already had — small, but it is the frame the whole cache exists to avoid.
  const [sections, setSections] = useState(() => readCache() || {});
  // Which sections could not be read. Distinct from a section that answered
  // and had no rows: only a failure is worth offering a retry for, and only an
  // empty sheet is the committee's to fix.
  const [failed, setFailed] = useState({});
  // Only true when there is nothing to show. With a copy in hand the fetch is
  // a background refresh, and a skeleton over content already on screen would
  // be a step backwards from showing it.
  const [loading, setLoading] = useState(() => !readCache());
  // Guards against a slow first load resolving after a refresh and overwriting
  // the newer data with older rows.
  const alive = useRef(true);
  // What is on screen now, readable from `load` without making it depend on
  // state — a dependency there would rebuild the callback on every refresh and
  // set useRevalidate listening all over again.
  const sectionsRef = useRef(sections);
  useEffect(() => { sectionsRef.current = sections; }, [sections]);
  useEffect(() => {
    // Reset on every mount, not just the first: StrictMode mounts, unmounts
    // and remounts in development, and a flag left false by that first cleanup
    // would discard every result from then on.
    alive.current = true;
    return () => { alive.current = false; };
  }, []);

  const load = useCallback(async () => {
    const names = Object.keys(SHEETS_CONFIG.sections);

    const entries = await Promise.all(names.map(async (name) => {
      const url = SHEETS_CONFIG.sections[name];
      // Only sections named in PUBLIC_READ_API have one. Looking up api[name]
      // blindly meant the section called `content` picked up api.content — the
      // admin portal's WRITE endpoint, which needs a token and answers every
      // visitor with UNAUTHORIZED before this fell back to the CSV. The site
      // still rendered, so the only trace was a wasted request per visit.
      const apiUrl = PUBLIC_READ_API.has(name) ? (SHEETS_CONFIG.api || {})[name] : null;
      if (!url && !apiUrl) return [name, null];
      try {
        // Prefer a Web App where one is configured: it serves only the public
        // columns, so the sheet behind it can stay Restricted. The CSV export
        // is the fallback, and it requires the sheet to be public.
        let rows = apiUrl ? await fetchMembersApi(apiUrl) : null;
        if (!rows) {
          if (apiUrl) console.warn(`"${name}" Web App unavailable — falling back to the CSV export.`);
          rows = await fetchSheetRows(url);
        }
        const shape = TRANSFORMERS[name] || ((x) => x);
        return [name, shape(rows), false];
      } catch (err) {
        // A failed sheet never stops the others from rendering; the section
        // says so itself and offers a retry.
        console.error(`Could not load the "${name}" sheet:`, err);
        return [name, null, true];
      }
    }));
    if (!alive.current) return;

    const next = Object.fromEntries(entries.map(([name, rows]) => [name, rows]));
    const broke = Object.fromEntries(entries.map(([name, , bad]) => [name, Boolean(bad)]));

    // Kept before the state is set, so a copy exists even if this render is the
    // one the visitor navigates away from.
    writeCache(next);

    // A section that failed keeps whatever was already on screen. Blanking it
    // would take content away from a visitor who could see it a moment ago, on
    // the strength of one unlucky request — and the fetch runs again on their
    // next visit anyway.
    const kept = Object.fromEntries(Object.entries(next).map(([name, rows]) => [
      name, rows === null && sectionsRef.current[name] ? sectionsRef.current[name] : rows,
    ]));
    // Keep the existing object when nothing actually changed, so a refresh
    // that finds no edits causes no re-render at all.
    setSections((cur) => (JSON.stringify(cur) === JSON.stringify(kept) ? cur : kept));
    setFailed((cur) => (JSON.stringify(cur) === JSON.stringify(broke) ? cur : broke));
    setLoading(false);
  }, []);

  useEffect(() => { load(); }, [load]);

  // Pick up sheet edits when the visitor returns to the page. `loading` is
  // never set back to true, so the refresh is silent — no skeleton flash over
  // content that is already on screen.
  useRevalidate(load);

  return (
    <ContentContext.Provider value={{ sections, failed, loading, reload: load }}>
      {children}
    </ContentContext.Provider>
  );
};

/* ----------------------------------------------------------------- hooks */

export const useSectionContent = (name) => {
  const { sections, failed, loading, reload } = useContext(ContentContext);
  return {
    data: sections[name] || null,
    // `error` means the sheet could not be read, not that it was empty.
    error: Boolean(failed[name]),
    loading,
    reload,
  };
};

export const useAllSections = () => {
  const { sections, failed, loading, reload } = useContext(ContentContext);
  return { sections: sections || {}, failed: failed || {}, loading, reload };
};
