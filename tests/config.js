import fs from 'node:fs';

// The mobile the live specs sign in with.
//
// It is a real committee member's number and this repository is public, so it
// is not written down here. Set SSGC_TEST_MOBILE, or copy local.example.json to
// .local.json — which is gitignored — and put it there.
const FILE = 'tests/.local.json';

const fromFile = () => {
  try {
    return JSON.parse(fs.readFileSync(FILE, 'utf8')).adminMobile;
  } catch {
    return null;
  }
};

export const adminMobile = () => {
  const mobile = process.env.SSGC_TEST_MOBILE || fromFile();
  if (!mobile) {
    throw new Error(
      `No test mobile configured. Set SSGC_TEST_MOBILE, or copy `
      + `tests/local.example.json to ${FILE} and fill it in. It must be a member `
      + `with access_in = 1, adm_in = 1 and bypass_in = 1 — without the bypass `
      + `the sign-in needs a code from a real inbox, which a test cannot read.`,
    );
  }
  return String(mobile).trim();
};
