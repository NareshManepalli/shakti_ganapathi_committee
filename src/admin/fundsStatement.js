import logoImg from '../assets/logo.png';
import { rupees, summarise, rangeLabel, todayDmy } from './fundsApi';

// The chosen span of the ledger as a PDF the committee can hand out or file.
//
// Drawn rather than screenshotted: the text stays selectable and searchable,
// the money columns keep the same three fills the screen uses, and the page
// prints crisply at any size. jsPDF is imported only when someone actually
// asks for a statement — it is ~350 kB, and no other screen needs it.

const NAVY = [14, 27, 51];
const GOLD = [175, 122, 26];
const INK = [31, 39, 51];
const MUTED = [100, 116, 139];
const LINE = [205, 214, 228];

const CREDIT_FILL = [231, 244, 236];
const DEBIT_FILL = [253, 236, 239];
const BALANCE_FILL = [232, 240, 251];

const CREDIT_INK = [28, 110, 64];
const DEBIT_INK = [156, 39, 64];
const BALANCE_INK = [28, 74, 134];

const PAGE = { w: 210, h: 297 };          // A4 portrait, millimetres
const M = { left: 14, right: 14, bottom: 16 };

const BAND_H = 30;                        // the navy header band
const HEAD_H = 8;                         // the table's own heading row

const COLS = [
  { key: 'sno', label: 'S.NO', w: 13, align: 'center' },
  { key: 'date', label: 'DATE', w: 24 },
  { key: 'month', label: 'MONTH', w: 24 },
  { key: 'reason', label: 'REMARKS', w: 45 },
  { key: 'credit', label: 'CREDIT', w: 23, align: 'right', fill: CREDIT_FILL, ink: CREDIT_INK },
  { key: 'debit', label: 'DEBIT', w: 22, align: 'right', fill: DEBIT_FILL, ink: DEBIT_INK },
  { key: 'balance', label: 'BALANCE', w: 24, align: 'right', fill: BALANCE_FILL, ink: BALANCE_INK },
];

const TABLE_W = COLS.reduce((t, c) => t + c.w, 0);

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
 */
const drawTitle = (doc, { title, count }) => {
  const y = BAND_H + 10;

  doc.setFont('helvetica', 'bold');
  doc.setFontSize(11.5);
  doc.setTextColor(...NAVY);
  doc.text(`FUNDS STATEMENT — ${title}`, M.left, y);

  doc.setFont('helvetica', 'normal');
  doc.setFontSize(8);
  doc.setTextColor(...MUTED);
  doc.text(
    `Generated ${todayDmy()} · ${count} entr${count === 1 ? 'y' : 'ies'}`,
    PAGE.w - M.right, y, { align: 'right' },
  );

  return y + 7;
};

/**
 * Collected, spent, and what is left — three cards, before the rows that make
 * them up. Separate cards rather than one box with rules through it: these are
 * three independent figures, and a shared outline invites them to be read as
 * parts of one sum.
 */
const drawSummary = (doc, y, totals) => {
  const gap = 5;
  const w = (TABLE_W - gap * 2) / 3;
  const h = 23;

  const cards = [
    ['TOTAL FUND AMOUNT', totals.credit, CREDIT_INK, CREDIT_FILL],
    ['TOTAL SPEND AMOUNT', totals.debit, DEBIT_INK, DEBIT_FILL],
    ['CURRENT BALANCE', totals.balance, BALANCE_INK, BALANCE_FILL],
  ];

  cards.forEach(([label, value, ink, fill], i) => {
    const x = M.left + i * (w + gap);

    doc.setFillColor(255, 255, 255);
    doc.setDrawColor(...LINE);
    doc.setLineWidth(0.3);
    doc.roundedRect(x, y, w, h, 2.5, 2.5, 'FD');

    // A chip in the column's own colour, so a figure can be matched to the
    // column it came from without reading either label.
    doc.setFillColor(...fill);
    doc.roundedRect(x + 5, y + 5.5, 5.5, 5.5, 1.4, 1.4, 'F');

    doc.setFont('helvetica', 'normal');
    doc.setFontSize(7);
    doc.setTextColor(...MUTED);
    doc.text(label, x + 13, y + 9.4);

    doc.setFont('helvetica', 'bold');
    doc.setFontSize(13);
    doc.setTextColor(...ink);
    doc.text(rupees(value), x + 5, y + 18.5);
  });

  return y + h + 7;
};

const drawTableHead = (doc, y) => {
  doc.setFillColor(...NAVY);
  doc.rect(M.left, y, TABLE_W, HEAD_H, 'F');

  doc.setFont('helvetica', 'bold');
  doc.setFontSize(7.5);
  doc.setTextColor(219, 227, 245);

  let x = M.left;
  for (const c of COLS) {
    const tx = c.align === 'right' ? x + c.w - 2 : c.align === 'center' ? x + c.w / 2 : x + 2;
    doc.text(c.label, tx, y + 5.2, { align: c.align === 'center' ? 'center' : c.align || 'left' });
    x += c.w;
  }
  return y + HEAD_H;
};

const drawFooter = (doc, page, pages) => {
  doc.setDrawColor(...LINE);
  doc.setLineWidth(0.2);
  doc.line(M.left, PAGE.h - M.bottom + 2, PAGE.w - M.right, PAGE.h - M.bottom + 2);

  doc.setFont('helvetica', 'normal');
  doc.setFontSize(7.5);
  doc.setTextColor(...MUTED);
  doc.text('Sri Shakthi Ganapathi Committee — funds statement', M.left, PAGE.h - M.bottom + 7);
  doc.text(`Page ${page} of ${pages}`, PAGE.w - M.right, PAGE.h - M.bottom + 7, { align: 'right' });
};

export const buildStatement = async ({ rows, range, title, filename }) => {
  const { default: JsPDF } = await import('jspdf');
  const doc = new JsPDF({ unit: 'mm', format: 'a4' });
  const logo = await logoData();

  const totals = summarise(rows);

  doc.setFont('helvetica', 'normal');
  doc.setFontSize(8);

  // Numbered from 1 for this statement, not from the ledger's own line number:
  // a statement covering March onwards that opened at "S.No 7" would read as
  // though six rows had gone missing off the top of it.
  const measured = rows.map((r, i) => {
    // Who paid in is on the screen, not here: seven names under every
    // collection row doubled the statement's length and buried the figures it
    // exists to present.
    const reason = clampLines(doc, r.reason || '—', COLS[3].w - 4, 2);
    return {
      sno: i + 1,
      date: r.date || '—',
      month: r.month || '—',
      reason,
      credit: r.credit,
      debit: r.debit,
      balance: r.balance,
      h: Math.max(9, reason.length * 4 + 5),
    };
  });

  // Laid out before anything is drawn, so the page count in the footer is right
  // on page one rather than only on the last.
  const bottom = PAGE.h - M.bottom - 4;
  const firstTop = () => (BAND_H + 10 + 7) + (23 + 7) + HEAD_H;
  const laterTop = BAND_H + 10 + HEAD_H;

  const pages = [[]];
  let used = firstTop();
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
        title: title ? `${title} · ${rangeLabel(range, rows)}` : rangeLabel(range, rows),
        count: rows.length,
      });
      y = drawSummary(doc, y, totals);
    } else {
      y = BAND_H + 10;
    }

    const tableTop = y;
    y = drawTableHead(doc, y);
    const bodyTop = y;

    for (const m of pageRows) {
      // The money columns keep their fill for the whole row height, so a
      // two-line reason does not leave a band of white beside its amount.
      let x = M.left;
      for (const c of COLS) {
        if (c.fill) {
          doc.setFillColor(...c.fill);
          doc.rect(x, y, c.w, m.h, 'F');
        }
        x += c.w;
      }

      x = M.left;
      doc.setFontSize(8);
      for (const c of COLS) {
        const tx = c.align === 'right' ? x + c.w - 2 : c.align === 'center' ? x + c.w / 2 : x + 2;
        const align = c.align === 'center' ? 'center' : c.align || 'left';

        if (c.key === 'reason') {
          doc.setFont('helvetica', 'normal');
          doc.setTextColor(...INK);
          doc.text(m.reason, tx, y + 5.6);
        } else if (c.ink) {
          doc.setFont('helvetica', c.key === 'balance' ? 'bold' : 'normal');
          doc.setTextColor(...c.ink);
          doc.text(money(m[c.key]), tx, y + 5.6, { align });
        } else {
          doc.setFont('helvetica', 'normal');
          doc.setTextColor(...(c.key === 'sno' ? MUTED : INK));
          doc.text(String(m[c.key]), tx, y + 5.6, { align });
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
    for (const c of COLS) {
      doc.line(gx, bodyTop, gx, y);
      gx += c.w;
    }
    doc.line(gx, bodyTop, gx, y);
    doc.setLineWidth(0.4);
    doc.rect(M.left, tableTop, TABLE_W, y - tableTop);

    if (p === pageCount - 1) {
      doc.setFont('helvetica', 'normal');
      doc.setFontSize(7);
      doc.setTextColor(...GOLD);
      doc.text(
        'The balance carries forward any amount held before the first entry shown.',
        M.left, y + 6,
      );
    }

    drawFooter(doc, p + 1, pageCount);
    drawWatermark(doc, logo);
  });

  doc.save(filename || 'SSGC-funds-statement.pdf');
};
