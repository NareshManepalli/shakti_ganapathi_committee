import logoImg from '../assets/logo.png';
import { rupees, summarise, rangeLabel, todayDmy } from './fundsApi';
import { summariseTxns } from './txnApi';

// The chosen span of the ledger as a PDF the committee can hand out or file.
//
// Drawn rather than screenshotted: the text stays selectable and searchable,
// the money columns keep the same three fills the screen uses, and the page
// prints crisply at any size. jsPDF is imported only when someone actually
// asks for a statement — it is ~350 kB, and no other screen needs it.

const NAVY = [14, 27, 51];
const GOLD = [175, 122, 26];
const AMBER = [201, 130, 20];
const INK = [31, 39, 51];
const MUTED = [100, 116, 139];
const LINE = [205, 214, 228];
const WHITE = [255, 255, 255];

// The column fills, and the same three colours again at card strength. A figure
// on a card and the column it was totalled from are the same colour on purpose:
// it is what lets the two be matched without reading either label.
const CREDIT_FILL = [231, 244, 236];
const DEBIT_FILL = [253, 236, 239];
const BALANCE_FILL = [232, 240, 251];

const CREDIT_INK = [28, 110, 64];
const DEBIT_INK = [156, 39, 64];
const BALANCE_INK = [28, 74, 134];

const CREDIT_EDGE = [163, 210, 182];
const DEBIT_EDGE = [240, 178, 192];
const BALANCE_EDGE = [172, 197, 232];

const PAGE = { w: 210, h: 297 };          // A4 portrait, millimetres
const M = { left: 14, right: 14, bottom: 16 };

const BAND_H = 30;                        // the navy header band
const HEAD_H = 9;                         // the table's own heading row
const TITLE_H = 22;                       // band bottom to the top of the cards
const CARD_H = 18;                        // the summary cards
const CARD_GAP = 7;                       // cards to table

// Widened to the full text column — 182 mm rather than 175 — so the table's
// right edge lines up with the emblem band above it and the cards beside it.
//
// "Rs" rather than the rupee sign. jsPDF's built-in Helvetica is WinAnsi, which
// has no glyph at U+20B9 — a ₹ in it prints as a blank box or nothing at all.
// Carrying a font that does have it would add a few hundred kilobytes to a
// document whose whole point is being small enough to email.
const COLS = [
  { key: 'sno', label: 'S.NO', w: 13, align: 'center' },
  { key: 'date', label: 'DATE', w: 26, icon: 'calendar' },
  { key: 'month', label: 'MONTH', w: 26 },
  { key: 'reason', label: 'REMARKS', w: 47 },
  { key: 'credit', label: 'CREDIT (Rs)', w: 24, align: 'right', fill: CREDIT_FILL, ink: CREDIT_INK },
  { key: 'debit', label: 'DEBIT (Rs)', w: 22, align: 'right', fill: DEBIT_FILL, ink: DEBIT_INK },
  { key: 'balance', label: 'BALANCE (Rs)', w: 24, align: 'right', fill: BALANCE_FILL, ink: BALANCE_INK },
];

// The working pot's statement. Month gives way to who was paid and how — a
// transaction is a dated event where a collection belongs to a month, and "paid
// to Balaji Sounds, by UPI" is the half of a spend a remark cannot carry.
const COLS_TXN = [
  { key: 'sno', label: 'S.NO', w: 13, align: 'center' },
  { key: 'date', label: 'DATE', w: 25, icon: 'calendar' },
  { key: 'reason', label: 'REMARKS', w: 40 },
  { key: 'paid_to', label: 'PAID TO / FROM', w: 34, clamp: true },
  { key: 'mode', label: 'MODE', w: 14 },
  { key: 'credit', label: 'IN (Rs)', w: 17, align: 'right', fill: CREDIT_FILL, ink: CREDIT_INK },
  { key: 'debit', label: 'OUT (Rs)', w: 17, align: 'right', fill: DEBIT_FILL, ink: DEBIT_INK },
  { key: 'balance', label: 'BALANCE (Rs)', w: 22, align: 'right', fill: BALANCE_FILL, ink: BALANCE_INK },
];

/**
 * The two statements this builds, and everything that differs between them.
 *
 * One builder rather than two files: the band, the title, the cards, the page
 * breaking and the watermark are the same document either way, and a second
 * copy of all that would be a second thing to keep in step.
 */
const VARIANTS = {
  funds: {
    cols: COLS,
    heading: 'FUNDS STATEMENT',
    footer: 'funds statement',
    file: 'SSGC-funds-statement.pdf',
    cards: (t) => [
      ['TOTAL FUND AMOUNT', t.credit, CREDIT_INK, CREDIT_FILL, CREDIT_EDGE, iconIn],
      ['TOTAL SPEND AMOUNT', t.debit, DEBIT_INK, DEBIT_FILL, DEBIT_EDGE, iconOut],
      ['CURRENT BALANCE', t.balance, BALANCE_INK, BALANCE_FILL, BALANCE_EDGE, iconBalance],
    ],
    note: 'The balance carries forward any amount held before the first entry shown.',
  },
  txn: {
    cols: COLS_TXN,
    heading: 'TRANSACTIONS STATEMENT',
    footer: 'transactions statement',
    file: 'SSGC-transactions-statement.pdf',
    // The bar's three figures, as figures. A printed page cannot be watched,
    // so what the screen says at a glance is said here in words.
    cards: (t) => [
      ['TOTAL IN THE POT', t.pot, CREDIT_INK, CREDIT_FILL, CREDIT_EDGE, iconIn],
      ['TOTAL SPENT', t.spent, DEBIT_INK, DEBIT_FILL, DEBIT_EDGE, iconOut],
      ['LEFT IN THE POT', t.left, BALANCE_INK, BALANCE_FILL, BALANCE_EDGE, iconBalance],
    ],
    note: 'The pot is the opening amount plus anything received after it. Balance is what remains.',
  },
};

const tableWidth = (cols) => cols.reduce((t, c) => t + c.w, 0);

/**
 * The logo, shrunk.
 *
 * logo.png is 3.2 MB, and embedded whole it would be most of the statement's
 * weight for something printed at 20 mm. Redrawn through a canvas at the size
 * it is actually used, it costs a few kilobytes — and it is drawn once and
 * reused on every page rather than embedded per page.
 */
const logoData = (px = 260) => new Promise((resolve) => {
  const img = new Image();
  img.crossOrigin = 'anonymous';
  img.onload = () => {
    const canvas = document.createElement('canvas');
    canvas.width = px;
    canvas.height = px;
    const ctx = canvas.getContext('2d');
    const scale = Math.min(px / img.width, px / img.height);
    const w = img.width * scale;
    const h = img.height * scale;
    ctx.drawImage(img, (px - w) / 2, (px - h) / 2, w, h);
    resolve(canvas.toDataURL('image/png'));
  };
  // A statement without the emblem is worth more than no statement at all.
  img.onerror = () => resolve('');
  img.src = logoImg;
});

const money = (n) => (n ? rupees(n) : '—');

/* ------------------------------------------------------------------ icons */
//
// Drawn from primitives rather than embedded as images. Each is a handful of
// lines at 3 mm, where a raster would either blur or cost more than the rest of
// the document — and these inherit the colour they are asked for, so the same
// calendar serves the amber date line, the provenance panel, and the date cells
// in the table.

const iconCalendar = (doc, x, y, s, colour) => {
  doc.setDrawColor(...colour);
  doc.setLineWidth(0.25);
  doc.roundedRect(x, y + s * 0.14, s, s * 0.86, s * 0.14, s * 0.14, 'S');
  doc.line(x, y + s * 0.42, x + s, y + s * 0.42);          // the header rule
  doc.line(x + s * 0.3, y, x + s * 0.3, y + s * 0.24);      // the two hangers
  doc.line(x + s * 0.7, y, x + s * 0.7, y + s * 0.24);
};

/** Money in: an arrow coming down into an open hand. */
const iconIn = (doc, cx, cy, colour) => {
  doc.setDrawColor(...colour);
  doc.setLineWidth(0.45);
  doc.line(cx, cy - 2.6, cx, cy + 0.2);
  doc.line(cx - 1.2, cy - 1, cx, cy + 0.2);
  doc.line(cx + 1.2, cy - 1, cx, cy + 0.2);
  doc.line(cx - 2.2, cy + 1.6, cx + 2.2, cy + 1.6);        // the palm
  doc.line(cx - 2.2, cy + 1.6, cx - 2.6, cy + 2.6);
  doc.line(cx + 2.2, cy + 1.6, cx + 2.6, cy + 2.6);
};

/** Money out: a wallet with its clasp. */
const iconOut = (doc, cx, cy, colour) => {
  doc.setDrawColor(...colour);
  doc.setLineWidth(0.45);
  doc.roundedRect(cx - 2.6, cy - 1.9, 5.2, 4, 0.7, 0.7, 'S');
  doc.line(cx - 2.6, cy - 0.4, cx + 2.6, cy - 0.4);
  doc.setFillColor(...colour);
  doc.circle(cx + 1.1, cy + 0.75, 0.42, 'F');
};

/** What is left: a balance beam. */
const iconBalance = (doc, cx, cy, colour) => {
  doc.setDrawColor(...colour);
  doc.setLineWidth(0.45);
  doc.line(cx, cy - 2.6, cx, cy + 2.4);                    // the post
  doc.line(cx - 2.7, cy - 1.7, cx + 2.7, cy - 1.7);        // the beam
  doc.line(cx - 1.5, cy + 2.4, cx + 1.5, cy + 2.4);        // the foot
  doc.line(cx - 2.7, cy - 1.7, cx - 3.5, cy + 0.5);        // the two pans
  doc.line(cx - 2.7, cy - 1.7, cx - 1.9, cy + 0.5);
  doc.line(cx - 3.5, cy + 0.5, cx - 1.9, cy + 0.5);
  doc.line(cx + 2.7, cy - 1.7, cx + 1.9, cy + 0.5);
  doc.line(cx + 2.7, cy - 1.7, cx + 3.5, cy + 0.5);
  doc.line(cx + 1.9, cy + 0.5, cx + 3.5, cy + 0.5);
};

/* ----------------------------------------------------------------- pieces */

/** Splits `text` to fit `width`, and never returns more than `maxLines`. */
const clampLines = (doc, text, width, maxLines) => {
  const lines = doc.splitTextToSize(String(text || ''), width);
  if (lines.length <= maxLines) return lines;
  const kept = lines.slice(0, maxLines);
  kept[maxLines - 1] = `${String(kept[maxLines - 1]).replace(/\s+\S*$/, '')}…`;
  return kept;
};

const withOpacity = (doc, value, draw) => {
  // GState is the only way to get real transparency out of jsPDF. Older builds
  // lack it, and there the emblem is simply left off rather than printed solid
  // across the middle of the table.
  if (typeof doc.setGState !== 'function' || typeof doc.GState !== 'function') return;
  doc.setGState(new doc.GState({ opacity: value }));
  draw();
  doc.setGState(new doc.GState({ opacity: 1 }));
};

/**
 * The emblem across the middle of every page, drawn LAST.
 *
 * Drawn first it disappeared: the money columns fill their cells with solid
 * colour, and every one of those fills painted straight over it. On top and
 * faint enough to read through, it shows on the coloured columns and the white
 * ones alike, which is the only way a watermark means anything.
 */
const drawWatermark = (doc, logo) => {
  if (!logo) return;
  const size = 115;
  // 3%: present without competing. It is drawn on top of the table rather than
  // behind it — which is the only way it survives the money columns' solid
  // fills — so it has to stay light enough to read a figure straight through.
  withOpacity(doc, 0.03, () => {
    doc.addImage(logo, 'PNG', (PAGE.w - size) / 2, (PAGE.h - size) / 2, size, size);
  });
};

/** Committee, address, emblem. Nothing about this particular statement. */
const drawBand = (doc, logo) => {
  doc.setFillColor(...NAVY);
  doc.rect(0, 0, PAGE.w, BAND_H, 'F');

  // Both centred on the same axis. The three text lines run from about 7.1 to
  // 24.7, so their middle is 15.9 — and a 20 mm emblem hung from 5 sat its own
  // middle at 15, a millimetre high and enough to read as a slip.
  const LOGO = 20;
  if (logo) doc.addImage(logo, 'PNG', M.left, 15.9 - LOGO / 2, LOGO, LOGO);

  const x = M.left + (logo ? LOGO + 5 : 0);
  doc.setTextColor(244, 214, 142);
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(14);
  doc.text('SRI SHAKTHI GANAPATHI COMMITTEE', x, 12);

  doc.setFont('helvetica', 'normal');
  doc.setFontSize(8.5);
  doc.setTextColor(200, 212, 234);
  doc.text('Sri Shakthi Nilayam, D.No: 44-13-101, Pedda Veedhi, Annapurnamma Peta,', x, 18);
  doc.text('Beside Nayi Brahmin Seva Sangam, Rajamahendravaram - 533101.', x, 23);
};

/**
 * What this statement covers, under the band rather than inside it.
 *
 * The band says who the committee is and never changes; this says which slice
 * of the ledger is on the page, and changes every time. Keeping them apart
 * means the second can be read without hunting through the first.
 *
 * Two facts, and they are not equals. The fund year is the heading; the span of
 * dates under it is the qualifier, in amber so it is plainly a second thing
 * rather than more heading. When the statement was made is provenance — true of
 * the document rather than of the money — so it sits quietly on the right.
 */
const drawTitle = (doc, { title, span, heading }) => {
  const y = BAND_H + 9;

  doc.setFont('helvetica', 'bold');
  doc.setFontSize(12);
  doc.setTextColor(...NAVY);
  doc.text(`${heading} — ${title}`, M.left, y);

  iconCalendar(doc, M.left, y + 3.2, 3.1, AMBER);
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(8);
  doc.setTextColor(...AMBER);
  doc.text(span, M.left + 4.4, y + 5.9);

  doc.setFont('helvetica', 'normal');
  doc.setFontSize(8);
  doc.setTextColor(...MUTED);
  doc.text(`Generated on ${todayDmy()}`, PAGE.w - M.right, y, { align: 'right' });

  return BAND_H + TITLE_H;
};

/**
 * Collected, spent, and what is left — three cards, before the rows that make
 * them up. Separate cards rather than one box with rules through it: these are
 * three independent figures, and a shared outline invites them to be read as
 * parts of one sum.
 */
const drawSummary = (doc, y, totals, variant) => {
  const gap = 6;
  const TABLE_W = tableWidth(variant.cols);
  const w = (TABLE_W - gap * 2) / 3;

  const cards = variant.cards(totals);

  cards.forEach(([label, value, ink, fill, edge, glyph], i) => {
    const x = M.left + i * (w + gap);

    doc.setFillColor(...fill);
    doc.setDrawColor(...edge);
    doc.setLineWidth(0.4);
    doc.roundedRect(x, y, w, CARD_H, 3, 3, 'FD');

    // A white disc under the glyph, so the mark reads at 5 mm against a tint
    // that is otherwise close to it in value.
    const cx = x + 8.5;
    const cy = y + CARD_H / 2;
    doc.setFillColor(...WHITE);
    doc.circle(cx, cy, 5.2, 'F');
    glyph(doc, cx, cy, ink);

    doc.setFont('helvetica', 'normal');
    doc.setFontSize(6.8);
    doc.setTextColor(...MUTED);
    doc.text(label, x + 16.5, cy - 1.6);

    doc.setFont('helvetica', 'bold');
    doc.setFontSize(12.5);
    doc.setTextColor(...ink);
    doc.text(`Rs ${rupees(value)}`, x + 16.5, cy + 4.4);
  });

  return y + CARD_H + CARD_GAP;
};

/** The navy heading row, with the table's top corners rounded into it. */
const drawTableHead = (doc, y, cols) => {
  const TABLE_W = tableWidth(cols);
  doc.setFillColor(...NAVY);
  doc.roundedRect(M.left, y, TABLE_W, HEAD_H, 2.5, 2.5, 'F');
  // The rounding belongs to the top of the table only — square the bottom edge
  // back off, or the first row sits on two visible notches.
  doc.rect(M.left, y + HEAD_H / 2, TABLE_W, HEAD_H / 2, 'F');

  doc.setFont('helvetica', 'bold');
  doc.setFontSize(7.5);
  doc.setTextColor(219, 227, 245);

  // Every label centred over its column, including the money ones. The figures
  // below stay right-aligned — a column of amounts is read down its last digit
  // — but a heading centred over the whole column reads as naming all of it.
  let x = M.left;
  for (const c of cols) {
    doc.text(c.label, x + c.w / 2, y + 5.8, { align: 'center' });
    x += c.w;
  }
  return y + HEAD_H;
};

const drawFooter = (doc, page, pages, kind) => {
  doc.setDrawColor(...LINE);
  doc.setLineWidth(0.2);
  doc.line(M.left, PAGE.h - M.bottom + 2, PAGE.w - M.right, PAGE.h - M.bottom + 2);

  doc.setFont('helvetica', 'normal');
  doc.setFontSize(7.5);
  doc.setTextColor(...MUTED);
  doc.text(`Sri Shakthi Ganapathi Committee — ${kind}`, M.left, PAGE.h - M.bottom + 7);
  doc.text(`Page ${page} of ${pages}`, PAGE.w - M.right, PAGE.h - M.bottom + 7, { align: 'right' });
};

export const buildStatement = async ({ rows, range, title, filename, variant: which }) => {
  const { default: JsPDF } = await import('jspdf');
  const doc = new JsPDF({ unit: 'mm', format: 'a4' });
  const logo = await logoData();

  const variant = VARIANTS[which] || VARIANTS.funds;
  const cols = variant.cols;
  const TABLE_W = tableWidth(cols);
  const reasonCol = cols.find((c) => c.key === 'reason');

  // Both shapes come off the same rows. The fund's three figures are its
  // credits, its debits and its closing balance; the pot's are what went into
  // it, what came out, and what is left — the same arithmetic named for what
  // the reader of each document is actually asking.
  const totals = which === 'txn' ? summariseTxns(rows) : summarise(rows);

  doc.setFont('helvetica', 'normal');
  doc.setFontSize(8);

  // Numbered from 1 for this statement, not from the ledger's own line number:
  // a statement covering March onwards that opened at "S.No 7" would read as
  // though six rows had gone missing off the top of it.
  const measured = rows.map((r, i) => {
    // Who paid in is on the screen, not here: seven names under every
    // collection row doubled the statement's length and buried the figures it
    // exists to present.
    const reason = clampLines(doc, r.reason || '—', reasonCol.w - 4, 2);
    // A vendor's name gets the same two lines a remark does. Cut to one it read
    // "Sri…", which names nobody — and the row is already as tall as its
    // remark, so the second line is usually free.
    const partyCol = cols.find((c) => c.clamp);
    const party = partyCol ? clampLines(doc, r.paid_to || '—', partyCol.w - 4, 2) : (r.paid_to || '—');
    return {
      sno: i + 1,
      date: r.date || '—',
      month: r.month || '—',
      reason,
      paid_to: party,
      mode: r.mode || '—',
      credit: r.credit,
      debit: r.debit,
      balance: r.balance,
      h: Math.max(10, Math.max(reason.length, Array.isArray(party) ? party.length : 1) * 4 + 6),
    };
  });

  // Laid out before anything is drawn, so the page count in the footer is right
  // on page one rather than only on the last.
  const bottom = PAGE.h - M.bottom - 4;
  const firstTop = BAND_H + TITLE_H + CARD_H + CARD_GAP + HEAD_H;
  const laterTop = BAND_H + 10 + HEAD_H;

  const pages = [[]];
  let used = firstTop;
  for (const m of measured) {
    if (used + m.h > bottom) { pages.push([]); used = laterTop; }
    pages[pages.length - 1].push(m);
    used += m.h;
  }
  const pageCount = pages.length;

  pages.forEach((pageRows, p) => {
    if (p > 0) doc.addPage();

    drawBand(doc, logo);

    let y;
    if (p === 0) {
      // The fund year's own name when there is one — "2nd year (2025 - 2026)"
      // says more to the committee than the two dates it resolves to.
      y = drawTitle(doc, {
        title: title || rangeLabel(range, rows),
        span: rangeLabel(range, rows),
        heading: variant.heading,
      });
      y = drawSummary(doc, y, totals, variant);
    } else {
      y = BAND_H + 10;
    }

    const tableTop = y;
    y = drawTableHead(doc, y, cols);
    const bodyTop = y;

    for (const m of pageRows) {
      // The money columns keep their fill for the whole row height, so a
      // two-line reason does not leave a band of white beside its amount.
      let x = M.left;
      for (const c of cols) {
        if (c.fill) {
          doc.setFillColor(...c.fill);
          doc.rect(x, y, c.w, m.h, 'F');
        }
        x += c.w;
      }

      x = M.left;
      doc.setFontSize(8);
      for (const c of cols) {
        const align = c.align === 'center' ? 'center' : c.align || 'left';
        // A column with a glyph starts its text after it; the rest start at the
        // padding. Kept as one expression so the two cannot drift apart.
        const pad = c.icon ? 7.5 : 2.5;
        const tx = align === 'right' ? x + c.w - 2.5
          : align === 'center' ? x + c.w / 2
            : x + pad;

        if (c.icon) {
          const s = 3.1;
          iconCalendar(doc, x + 2.6, y + m.h / 2 - s / 2 - 0.2, s, MUTED);
        }

        if (c.key === 'reason' || (c.clamp && Array.isArray(m[c.key]))) {
          doc.setFont('helvetica', 'normal');
          doc.setTextColor(...INK);
          doc.text(c.key === 'reason' ? m.reason : m[c.key], tx, y + 6.1);
        } else if (c.ink) {
          doc.setFont('helvetica', c.key === 'balance' ? 'bold' : 'normal');
          doc.setTextColor(...c.ink);
          doc.text(money(m[c.key]), tx, y + m.h / 2 + 1.2, { align });
        } else {
          doc.setFont('helvetica', 'normal');
          doc.setTextColor(...(c.key === 'sno' ? MUTED : INK));
          doc.text(String(m[c.key]), tx, y + m.h / 2 + 1.2, { align });
        }
        x += c.w;
      }

      y += m.h;

      // The line under each row, drawn after its fills so it is not painted over
      doc.setDrawColor(...LINE);
      doc.setLineWidth(0.2);
      doc.line(M.left, y, M.left + TABLE_W, y);
    }

    // The grid: every column boundary down the page, then the outer box. Drawn
    // last so no cell fill can cover a rule.
    doc.setDrawColor(...LINE);
    doc.setLineWidth(0.2);
    let gx = M.left;
    for (const c of cols) {
      doc.line(gx, bodyTop, gx, y);
      gx += c.w;
    }
    doc.line(gx, bodyTop, gx, y);
    doc.setLineWidth(0.4);
    doc.roundedRect(M.left, tableTop, TABLE_W, y - tableTop, 2.5, 2.5, 'S');

    if (p === pageCount - 1) {
      doc.setFont('helvetica', 'normal');
      doc.setFontSize(7);
      doc.setTextColor(...GOLD);
      doc.text(variant.note, M.left, y + 6);
    }

    drawFooter(doc, p + 1, pageCount, variant.footer);
    drawWatermark(doc, logo);
  });

  doc.save(filename || variant.file);
};
