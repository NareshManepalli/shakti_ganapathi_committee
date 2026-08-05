// Festival configuration — shared by the hero countdown and the gallery.
//
// Phase 3 replaces FESTIVAL_START with day 1 read from the `schedule` sheet,
// at which point this file becomes the fallback rather than the source.

// Day 1 of the festival, in the visitor's local time.
// Month is zero-based in JS Dates, so 8 = September.
export const FESTIVAL_START = new Date(2026, 8, 14, 0, 0, 0); // 14 Sep 2026

// Earliest year the gallery offers. The dropdown runs from here to the
// current year, so it grows by itself each January.
export const GALLERY_START_YEAR = 2025;

export const festivalHasBegun = () => Date.now() >= FESTIVAL_START.getTime();
