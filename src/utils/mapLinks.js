// Turning the one stored address into lines on screen and a pin on a map.
//
// Shared by the public location card and by the admin screen that edits it: the
// committee has to be able to trust that the map they check while editing is
// the map visitors get, and the only way to promise that is for both to derive
// it from the same text by the same rules.

// The sheet holds the address as one field, and the committee decides where it
// breaks: put each line on its own row inside the cell (Alt+Enter in Sheets) or
// separate them with a "|". Only when the cell has neither do we fall back to
// splitting on commas, which keeps a plain one-line address readable.
export const toLines = (address) => {
  const raw = String(address || '').trim();
  if (!raw) return [];
  const explicit = raw.split(/\s*(?:\r?\n|\|)\s*/).map((p) => p.trim()).filter(Boolean);
  if (explicit.length > 1) return explicit;
  return raw.split(',').map((p) => p.trim()).filter(Boolean);
};

// Maps wants one flat line whatever shape the cell is in — otherwise the line
// breaks end up as %0A inside the query and the pin drifts. Trailing commas and
// full stops are trimmed off each line first, so a cell punctuated for display
// doesn't reach Maps as "Pedda Veedhi,, Annapurnamma Peta,,".
export const toQuery = (address) =>
  toLines(address)
    .map((line) => line.replace(/[,.\s]+$/, ''))
    .join(', ')
    .replace(/\s+/g, ' ')
    .trim();

export const mapEmbedUrl = (address) =>
  `https://www.google.com/maps?q=${encodeURIComponent(toQuery(address))}&output=embed`;

export const mapDirectionsUrl = (address) =>
  `https://www.google.com/maps/dir/?api=1&destination=${encodeURIComponent(toQuery(address))}`;

// ---------------------------------------------------------------------------
// The map_url field
//
// A searched address lands on the building most of the time, but the mandapam
// is a lane off a named street and Google guesses at it. So the field takes a
// pin the committee placed themselves — pasted in whatever form Google handed
// them: the whole <iframe> from Share → Embed a map, the bare src out of it, or
// an ordinary link to the place. The three do different jobs, so sort out which
// one arrived rather than trusting the paste.

const srcOf = (value) => {
  const raw = String(value || '').trim();
  if (!raw) return '';
  const tag = raw.match(/<iframe[^>]*\ssrc\s*=\s*["']([^"']+)["']/i);
  return (tag ? tag[1] : raw).trim();
};

// A whitelist rather than a sanity check: this is the one field whose contents
// become a live third-party frame on the public page, and "it came from an
// admin" is not the same promise as "it came from Google Maps".
const isEmbeddable = (url) =>
  /^https:\/\/(www\.)?google\.com\/maps[/?]/i.test(url)
  && /(\/maps\/embed|[?&]output=embed)/i.test(url);

/** Sorts a pasted map field into the frame it can fill, or the plain link it
 *  turned out to be. Only `embed` reaches the site; `link` exists so the admin
 *  screen can say "that is a link, not an embed" rather than "that is wrong". */
export const parseMapField = (value) => {
  const url = srcOf(value);
  if (!url) return { embed: '', link: '' };
  if (isEmbeddable(url)) return { embed: url, link: '' };
  return { embed: '', link: /^https?:\/\//i.test(url) ? url : '' };
};

/** The map to show: the committee's own pin when they placed one, the address
 *  searched when they did not. */
export const mapEmbedFor = (address, mapField) =>
  parseMapField(mapField).embed || mapEmbedUrl(address);
