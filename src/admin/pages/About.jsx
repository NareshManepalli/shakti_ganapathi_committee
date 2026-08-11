import React, { useEffect, useState } from 'react';
import { useAdminData } from '../useAdminData';
import { saveContent } from '../contentApi';
import { useToast } from '../ToastContext';
import { EditorPage, Bilingual, SplitCard, SplitSkeleton } from './EditorShell';
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

  const hint = () => {
    if (!form.image.trim()) return 'Empty — the site shows a + placeholder instead.';
    if (imgFailed) return 'That link will not load. Share the file as “Anyone with the link”.';
    return 'The preview below is the image the site will show.';
  };

  return (
    <EditorPage
      title="About Management"
      subtitle="Edit the About text and image shown on the website"
      loading={loading}
      error={error}
      skeleton={<SplitSkeleton />}
    >
      <SplitCard
        title="About the Committee"
        onSubmit={save}
        left={(
          <Bilingual
            label="About the committee"
            en={form.content_en}
            te={form.content_te}
            onEn={(v) => setForm({ ...form, content_en: v })}
            onTe={(v) => setForm({ ...form, content_te: v })}
            rows={5}
            placeholder="One paragraph…"
          />
        )}
        /* The link, and the picture it resolves to — the same crop the section
           uses, so a portrait pasted in for a landscape frame shows here as the
           beheaded thing it will be on the site. */
        right={(
          <>
            <label className="ed-field ed-split-field">
              <span className="admin-label">Section image</span>
              <input
                className="admin-input ed-split-input"
                value={form.image}
                placeholder="Paste a Google Drive share link"
                onChange={(e) => { setImgFailed(false); setForm({ ...form, image: e.target.value }); }}
              />
              <span className="ed-split-hint">{hint()}</span>
            </label>

            <div className="ed-split-view">
              {preview && !imgFailed ? (
                /* Drive drops the request without this — ERR_BLOCKED_BY_ORB */
                <img src={preview} alt="" referrerPolicy="no-referrer" onError={() => setImgFailed(true)} />
              ) : (
                <p className="ed-split-empty">
                  {form.image ? 'That image cannot be loaded.' : 'Paste a link and the image appears here.'}
                </p>
              )}
            </div>
          </>
        )}
        actions={(
          <>
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
            <button className="admin-btn" type="submit" disabled={busy || !dirty}>
              {busy ? 'Updating…' : 'Update'}
            </button>
          </>
        )}
      />
    </EditorPage>
  );
};

export default About;
