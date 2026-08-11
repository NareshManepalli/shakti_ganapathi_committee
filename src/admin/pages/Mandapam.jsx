import React, { useEffect, useState } from 'react';
import { useAdminData } from '../useAdminData';
import { saveContent } from '../contentApi';
import { useToast } from '../ToastContext';
import { EditorPage, Bilingual, SplitCard, SplitSkeleton } from './EditorShell';
import { toQuery, mapEmbedFor, parseMapField } from '../../utils/mapLinks';

// The Mandapam address, held as the `mandapam` row of the content sheet.
//
// Line breaks in the box are the line breaks on the site: the public card
// honours them and only falls back to splitting on commas when there are none.
// The embed, Get Directions and Open in Maps all resolve from this same text
// flattened to one line, so they cannot point at different places.
const Mandapam = () => {
  const { content, loading, error, merge, token } = useAdminData();
  const toast = useToast();

  const row = content.find((r) => String(r.section).trim().toLowerCase() === 'mandapam');
  const [form, setForm] = useState({ content_en: '', content_te: '', map_url: '' });
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (!row) return;
    setForm({
      content_en: String(row.content_en || ''),
      content_te: String(row.content_te || ''),
      map_url: String(row.map_url || ''),
    });
  }, [row]);

  const dirty = row && ['content_en', 'content_te', 'map_url']
    .some((k) => form[k] !== String(row[k] || ''));

  const save = async (e) => {
    e.preventDefault();
    if (busy) return;
    if (!form.content_en.trim()) { toast.error('Nothing to save', 'Enter the address.'); return; }
    setBusy(true);
    const res = await saveContent(token, 'mandapam', form);
    setBusy(false);
    if (!res.ok) { toast.error('Could not save the address', res.error); return; }
    merge({ content: res.content });
    toast.success('Mandapam saved', 'The public site updates on its next load.');
  };

  return (
    <EditorPage
      title="Mandapam Management"
      subtitle="Edit the address and map shown on the website"
      loading={loading}
      error={error}
      skeleton={<SplitSkeleton />}
    >
      <SplitCard
        title="Mandapam Location"
        onSubmit={save}
        /* The address, in both languages, exactly as the sheet holds it. No
           helper note under the columns: one there would add its height to this
           column, and the map grows to match it — which is what left the map
           hanging below the boxes it sits beside. */
        left={(
          <Bilingual
            label="Address"
            en={form.content_en}
            te={form.content_te}
            onEn={(v) => setForm({ ...form, content_en: v })}
            onTe={(v) => setForm({ ...form, content_te: v })}
            rows={5}
            placeholder="Sri Shakthi Nilayam&#10;D.No: 44-13-101, Pedda Veedhi,"
          />
        )}
        /* The pin, and the map it produces. */
        right={(
          <>
            <label className="ed-field ed-split-field">
              <span className="admin-label">Map location / embed (optional)</span>
              <input
                className="admin-input ed-split-input"
                value={form.map_url}
                placeholder="Paste the Google Maps embed <iframe …> or a link"
                onChange={(e) => setForm({ ...form, map_url: e.target.value })}
              />
              <span className="ed-split-hint">{hintFor(form.map_url)}</span>
            </label>

            <MapPreview address={form.content_en} mapField={form.map_url} />
          </>
        )}
        actions={(
          <button className="admin-btn" type="submit" disabled={busy || !dirty}>
            {busy ? 'Updating…' : 'Update'}
          </button>
        )}
      />
    </EditorPage>
  );
};

// Only an embed does anything here, and a link to the place looks near enough
// to one that pasting the wrong thing is the likely mistake — so name what is
// in the box rather than leave it to be inferred from a map that didn't move.
const hintFor = (value) => {
  if (!String(value || '').trim()) {
    return 'Empty — the map searches for the address beside it.';
  }
  const { embed, link } = parseMapField(value);
  if (embed) return 'Embed found — the map below is exactly what the site will show.';
  if (link) return 'That is a link, not an embed. In Maps use Share → Embed a map, and paste the <iframe> it gives you.';
  return 'Not a Google Maps embed — the map falls back to searching the address.';
};

// The same embed the public card renders, so this is a preview and not an
// approximation. Held a beat behind the textarea: keyed straight to it, every
// character typed would be a fresh request to Google and a fresh reflow.
const MapPreview = ({ address, mapField }) => {
  const [settled, setSettled] = useState({ address, mapField });

  useEffect(() => {
    const id = setTimeout(() => setSettled({ address, mapField }), 700);
    return () => clearTimeout(id);
  }, [address, mapField]);

  // Nothing to show only when there is neither a pin nor an address to search:
  // a pasted embed stands on its own, which is the point of pasting one.
  const pinned = Boolean(parseMapField(settled.mapField).embed);
  const ready = pinned || Boolean(toQuery(settled.address));

  return (
    <div className="ed-split-view">
      {ready ? (
        <iframe
          src={mapEmbedFor(settled.address, settled.mapField)}
          title="Mandapam location"
          loading="lazy"
          referrerPolicy="no-referrer-when-downgrade"
        />
      ) : (
        <p className="ed-split-empty">Type the address, or paste an embed, and the map appears here.</p>
      )}
    </div>
  );
};

export default Mandapam;
