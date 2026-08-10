import React, { useEffect, useState } from 'react';
import { useAdminData } from '../useAdminData';
import { saveContent } from '../contentApi';
import { useToast } from '../ToastContext';
import { EditorPage, Bilingual } from './EditorShell';
import { toMediaUrl } from '../../utils/sheetService';

// The About section: one paragraph per language plus an image, held as the
// `about` row of the content sheet. The heading and subtitle are not editable —
// they live in translations.js because they never change.
const About = () => {
  const { content, loading, error, merge, token } = useAdminData();
  const toast = useToast();

  const row = content.find((r) => String(r.section).trim().toLowerCase() === 'about');
  const [form, setForm] = useState({ content_en: '', content_te: '', image: '' });
  const [busy, setBusy] = useState(false);
  const [imgFailed, setImgFailed] = useState(false);

  useEffect(() => {
    if (!row) return;
    setForm({
      content_en: String(row.content_en || ''),
      content_te: String(row.content_te || ''),
      image: String(row.image || ''),
    });
  }, [row]);

  const dirty = row && ['content_en', 'content_te', 'image']
    .some((k) => form[k] !== String(row[k] || ''));

  const save = async (e) => {
    e.preventDefault();
    if (busy) return;
    if (!form.content_en.trim()) {
      toast.error('Nothing to save', 'The English text is what the site falls back to.');
      return;
    }
    setBusy(true);
    const res = await saveContent(token, 'about', form);
    setBusy(false);
    if (!res.ok) { toast.error('Could not save About', res.error); return; }
    merge({ content: res.content });
    toast.success('About saved', 'The public site updates on its next load.');
  };

  const preview = toMediaUrl(form.image, 600);

  return (
    <EditorPage
      title="About Management"
      subtitle="Edit the About text and image shown on the website"
      loading={loading}
      error={error}
    >
      <form className="admin-card" onSubmit={save}>
        <Bilingual
          label="About the committee"
          en={form.content_en}
          te={form.content_te}
          onEn={(v) => setForm({ ...form, content_en: v })}
          onTe={(v) => setForm({ ...form, content_te: v })}
          rows={9}
          placeholder="One paragraph…"
        />

        <div className="ed-field">
          <span className="admin-label">Section image</span>
          <div className="ed-image-row">
            <input
              className="admin-input"
              value={form.image}
              placeholder="Paste a Google Drive share link"
              onChange={(e) => { setImgFailed(false); setForm({ ...form, image: e.target.value }); }}
            />
            <span className="ed-image-preview">
              {preview && !imgFailed ? (
                /* Drive drops the request without this — ERR_BLOCKED_BY_ORB */
                <img src={preview} alt="" referrerPolicy="no-referrer" onError={() => setImgFailed(true)} />
              ) : (
                <span className="ed-image-empty">{form.image ? 'Cannot load' : '+'}</span>
              )}
            </span>
          </div>
          <p className="admin-readonly-note">
            Leave it empty and the site shows a <code>+</code> placeholder instead.
          </p>
        </div>

        <div className="admin-btn-row">
          <button className="admin-btn" type="submit" disabled={busy || !dirty}>
            {busy ? 'Updating…' : 'Update'}
          </button>
          {dirty && (
            <button
              className="admin-btn admin-btn-ghost"
              type="button"
              disabled={busy}
              onClick={() => setForm({
                content_en: String(row.content_en || ''),
                content_te: String(row.content_te || ''),
                image: String(row.image || ''),
              })}
            >
              Discard changes
            </button>
          )}
        </div>
      </form>
    </EditorPage>
  );
};

export default About;
