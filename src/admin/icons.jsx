import React from 'react';

// Inline strokes rather than an icon package: nine glyphs is not worth another
// dependency, and these inherit currentColor so the sidebar's gold and the
// active state's white both come free.
const svg = (paths) => (props) => (
  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7"
       strokeLinecap="round" strokeLinejoin="round" aria-hidden="true" {...props}>
    {paths}
  </svg>
);

export const IconAbout     = svg(<><circle cx="12" cy="12" r="9" /><path d="M12 11v5" /><path d="M12 8h.01" /></>);
export const IconMembers   = svg(<><circle cx="9" cy="8" r="3.2" /><path d="M3 20c0-3.3 2.7-5.4 6-5.4s6 2.1 6 5.4" /><path d="M16.5 11a2.7 2.7 0 1 0-1.6-4.9" /><path d="M17.4 20c0-2.3-.8-3.9-2.1-4.9" /></>);
export const IconGallery   = svg(<><rect x="3" y="4" width="18" height="16" rx="2.5" /><circle cx="8.5" cy="9.5" r="1.6" /><path d="m4 17 4.6-4.3a2 2 0 0 1 2.7 0L20 20" /></>);
export const IconSchedule  = svg(<><rect x="3" y="5" width="18" height="16" rx="2.5" /><path d="M3 10h18M8 3v4M16 3v4" /></>);
export const IconMandapam  = svg(<><path d="M12 3 5 8v12h14V8z" /><path d="M9 20v-5h6v5" /></>);
export const IconLedger    = svg(<><rect x="4" y="3" width="16" height="18" rx="2.5" /><path d="M8 8h8M8 12h8M8 16h5" /></>);
export const IconFunds     = svg(<><circle cx="12" cy="12" r="9" /><path d="M12 7v10M9.5 9.5h4a1.8 1.8 0 0 1 0 3.6h-3a1.8 1.8 0 0 0 0 3.6h4" /></>);
export const IconProfile   = svg(<><circle cx="12" cy="8.5" r="3.6" /><path d="M4.5 20c0-3.8 3.3-6.2 7.5-6.2s7.5 2.4 7.5 6.2" /></>);
export const IconLogout    = svg(<><path d="M15 4h3.5A1.5 1.5 0 0 1 20 5.5v13a1.5 1.5 0 0 1-1.5 1.5H15" /><path d="M10 16l-4-4 4-4" /><path d="M6 12h10" /></>);
export const IconUpload    = svg(<><path d="M12 16V4" /><path d="m7.5 8.5 4.5-4.5 4.5 4.5" /><path d="M4 15v3.5A1.5 1.5 0 0 0 5.5 20h13a1.5 1.5 0 0 0 1.5-1.5V15" /></>);
export const IconFolderAdd = svg(<><path d="M3 7.5A1.5 1.5 0 0 1 4.5 6h4l2 2.5h7A1.5 1.5 0 0 1 19 10v8.5a1.5 1.5 0 0 1-1.5 1.5h-13A1.5 1.5 0 0 1 3 18.5z" /><path d="M12 12.5v4M10 14.5h4" /></>);
export const IconFolder    = svg(<><path d="M3 7.5A1.5 1.5 0 0 1 4.5 6h4l2 2.5h7A1.5 1.5 0 0 1 19 10v8.5a1.5 1.5 0 0 1-1.5 1.5h-13A1.5 1.5 0 0 1 3 18.5z" /></>);
export const IconTrash     = svg(<><path d="M4 7h16" /><path d="M9 7V4.8A.8.8 0 0 1 9.8 4h4.4a.8.8 0 0 1 .8.8V7" /><path d="M6.5 7 7.4 20h9.2L17.5 7" /><path d="M10.5 11v5M13.5 11v5" /></>);
export const IconEdit      = svg(<><path d="M4 20h4l10-10a2.1 2.1 0 0 0-3-3L5 17z" /><path d="M14.5 6.5l3 3" /></>);
export const IconSettings  = svg(<><circle cx="12" cy="12" r="3.1" /><path d="M12 2.8v2.4M12 18.8v2.4M4.5 7.5l2.1 1.2M17.4 15.3l2.1 1.2M4.5 16.5l2.1-1.2M17.4 8.7l2.1-1.2" /></>);
export const IconSearch    = svg(<><circle cx="11" cy="11" r="6.2" /><path d="m15.6 15.6 4.4 4.4" /></>);
export const IconDownload  = svg(<><path d="M12 4v11" /><path d="m7.5 10.5 4.5 4.5 4.5-4.5" /><path d="M4 16v2.5A1.5 1.5 0 0 0 5.5 20h13a1.5 1.5 0 0 0 1.5-1.5V16" /></>);
/* A drawn chevron rather than the ▾ character: that glyph renders hairline-thin
   and differently in every font, and at the topbar's size it all but vanished. */
export const IconChevron   = svg(<path d="m6 9.5 6 6 6-6" />);

// The four summary cards on Annual Funds. Direction is the whole meaning here —
// money in, money out, what is left — so the arrows point the way the money went
// rather than decorating a card that already says it in words.
export const IconYear      = svg(<><rect x="3" y="5" width="18" height="16" rx="2.5" /><path d="M3 10h18M8 3v4M16 3v4" /><path d="M8 15h3" /></>);
export const IconIn        = svg(<><circle cx="12" cy="12" r="9" /><path d="M12 7.5v9" /><path d="m8.5 13 3.5 3.5 3.5-3.5" /></>);
export const IconOut       = svg(<><circle cx="12" cy="12" r="9" /><path d="M12 16.5v-9" /><path d="m8.5 11 3.5-3.5 3.5 3.5" /></>);
export const IconBalance   = svg(<><path d="M12 4v16" /><path d="M6 8h12" /><path d="m3 16 3-8 3 8a3.4 3.4 0 0 1-6 0Z" /><path d="m15 16 3-8 3 8a3.4 3.4 0 0 1-6 0Z" /></>);
