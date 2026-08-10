import React, { useEffect, useState } from 'react';
import { useAdminData } from '../useAdminData';
import { saveContent } from '../contentApi';
import { useToast } from '../ToastContext';
import { EditorPage, Bilingual } from './EditorShell';

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

  const lines = form.content_en.split(/\r?\n/).filter((l) => l.trim());

  return (
    <EditorPage
      title="Mandapam Management"
      subtitle="Edit the address and map shown on the website"
      loading={loading}
      error={error}
    >
      <form className="admin-card" onSubmit={save}>
        <Bilingual
          label="Address"
          en={form.content_en}
          te={form.content_te}
          onEn={(v) => setForm({ ...form, content_en: v })}
          onTe={(v) => setForm({ ...form, content_te: v })}
          rows={6}
          placeholder="Sri Shakthi Nilayam&#10;D.No: 44-13-101, Pedda Veedhi,"
        />
        <p className="admin-readonly-note">
          Each line here is a line on the site. Press Enter where you want a break.
        </p>

        {lines.length > 0 && (
          <div className="ed-field">
            <span className="admin-label">How it will read</span>
            <div className="ed-preview-card">
              {lines.map((l, i) => <span key={i}>{l}</span>)}
            </div>
          </div>
        )}

        <div className="ed-field">
          <span className="admin-label">Map link (optional)</span>
          <input
            className="admin-input"
            value={form.map_url}
            placeholder="https://www.google.com/maps/…"
            onChange={(e) => setForm({ ...form, map_url: e.target.value })}
          />
          <p className="admin-readonly-note">
            Leave it empty and the map is built from the address above.
          </p>
        </div>

        <div className="admin-btn-row">
          <button className="admin-btn" type="submit" disabled={busy || !dirty}>
            {busy ? 'Updating…' : 'Update'}
          </button>
        </div>
      </form>
    </EditorPage>
  );
};

export default Mandapam;
