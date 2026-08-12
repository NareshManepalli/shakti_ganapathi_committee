import { test, expect } from '@playwright/test';
import fs from 'node:fs';
import { SHEETS_CONFIG } from '../src/config/sheetsConfig.js';

const MEMBERS_API = SHEETS_CONFIG.api.members;
const AUTH_API = SHEETS_CONFIG.auth.url;

// The profile screen against the LIVE auth endpoint and the real members sheet.
//
// The save tests WRITE to that sheet, so each changes a field, checks it stuck,
// and puts the original back — including when an assertion fails partway, which
// is what the finally block is for. They never touch the mobile: that is what
// the member signs in with, and a half-finished test must not be able to lock
// anyone out of the portal.
//
// Because the row is real and shared, editing the same member in a browser while
// this runs makes the read-back assertions fail on a value that is neither the
// marker nor the original. That is two writers on one row, not a broken app —
// re-run with nobody else on the profile screen before going looking for a bug.
const session = () => fs.readFileSync('tests/.session-value.json', 'utf8');

// By label, not by position. Counting inputs broke the moment anything else on
// the card gained one, and the failure was silent: the wrong field was filled
// and the assertion simply disagreed with a value nobody had typed.
//
// Exact, because "Name" is a prefix of "Name (Telugu)" and a loose match claims
// both. By role rather than getByLabel: the required '*' is aria-hidden, so a
// screen reader says "Name" — but getByLabel reads the <label> tag's raw text
// and still sees "Name *". Only the role locator uses the name the browser
// actually computes, which is the one worth asserting against.
const field = (page, label) => page.getByRole('textbox', { name: label, exact: true });

async function open(page, path = '/admin/profile') {
  await page.addInitScript((v) => sessionStorage.setItem('ssgc.session', v), session());
  await page.goto(path);
  await expect(page.locator('.prof-fact').first()).toBeVisible({ timeout: 45000 });
}

const factRows = (page) => page.locator('.prof-fact').evaluateAll((els) =>
  Object.fromEntries(els.map((e) => [
    e.querySelector('dt').textContent.trim(),
    e.querySelector('dd').textContent.trim(),
  ])));

/**
 * Waits for the read-only block to show `value`, rather than reading it once.
 *
 * The toast fires when the Web App answers; the block above the form repaints
 * from the refetched profile a moment later. Reading straight after the toast
 * catches the old name often enough to make the suite flaky.
 */
const expectName = (page, value) =>
  expect.poll(async () => (await factRows(page)).Name, { timeout: 20000 }).toBe(value);

/**
 * Enters edit mode, unless the screen is already in it.
 *
 * The restore blocks below run whether or not the body succeeded, and a failed
 * save leaves the form open — where Edit Profile is disabled. Clicking it
 * regardless spent 30 seconds timing out and then threw from the `finally`,
 * which replaced the real failure with a click error and hid what went wrong.
 */
const startEdit = async (page) => {
  const btn = page.locator('.admin-btn', { hasText: 'Edit Profile' });
  if (await btn.isEnabled()) await btn.click();
};

/**
 * Every active member's mobile, from the live sheet, grouped by number.
 *
 * Read here rather than assumed, because two of the tests below cannot pass
 * while a number is shared — and the refusal they get back ("MOBILE_TAKEN")
 * describes the sheet, not the code.
 */
const mobilesByNumber = async (page) => {
  const rows = await page.evaluate(async (url) => {
    const res = await fetch(`${url}${url.includes('?') ? '&' : '?'}action=members`);
    return (await res.json()).members || [];
  }, MEMBERS_API);

  const by = {};
  for (const r of rows) {
    const m = String(r.mobile || '').replace(/\D/g, '').slice(-10);
    if (m) (by[m] = by[m] || []).push(`${r.id}:${r.name_en}`);
  }
  return by;
};

// The mobile IS the identity: there is no password, so a number shared by two
// active rows leaves the sign-in unable to say who is at the door. The Web App
// refuses rather than guessing, which means a member in such a group cannot get
// in at all — so this is a sheet fault that reads as a broken portal.
test('no two active members share a mobile number', async ({ page }) => {
  await open(page);
  const by = await mobilesByNumber(page);
  const shared = Object.entries(by)
    .filter(([, who]) => who.length > 1)
    .map(([m, who]) => `${m} → ${who.join(', ')}`);

  expect(shared, `these numbers name more than one member:\n  ${shared.join('\n  ')}`).toEqual([]);
});

test('the profile loads the real record, email included', async ({ page }) => {
  await open(page);
  await expect(page.locator('.admin-page-title')).toHaveText('My Profile');

  const rows = await factRows(page);
  expect(rows.Name).toBeTruthy();
  expect(rows.Mobile).toMatch(/^\d{10}$/);
  // The email is only here because the AUTH endpoint returns it — the public
  // members API withholds it, since it is where the sign-in code is sent.
  expect(rows.Email).toMatch(/@/);
  expect(rows.Position).toBeTruthy();

  await expect(page.locator('.admin-msg.is-error')).toHaveCount(0);
});

test('fields are read-only until Edit Profile is pressed', async ({ page }) => {
  await open(page);
  const editable = ['Name', 'Name (Telugu)', 'Mobile', 'Email'];

  for (const label of editable) await expect(field(page, label)).toBeDisabled();
  await expect(page.locator('.admin-btn', { hasText: 'Update' })).toBeDisabled();

  await startEdit(page);

  for (const label of editable) await expect(field(page, label)).toBeEnabled();
  await expect(page.locator('.admin-btn', { hasText: 'Update' })).toBeEnabled();

  // Position is not a form field at all. The committee sets it, and a member who
  // could edit their own access could hand themselves the portal — a permanently
  // greyed box only invited the question of how to change it. It stays in the
  // read-only record above.
  await expect(page.locator('.admin-input')).toHaveCount(4);
  await expect(page.locator('.prof-grid .admin-label', { hasText: 'Position' })).toHaveCount(0);
  expect((await factRows(page)).Position).toBeTruthy();
});

test('a malformed email never leaves the browser', async ({ page }) => {
  await open(page);
  await startEdit(page);

  const email = field(page, 'Email');
  await email.fill('not-an-email');
  await page.locator('.admin-btn', { hasText: 'Update' }).click();

  // type="email" stops the submit outright, so nothing is sent and no toast
  // appears. The server checks it too — that half is covered by the Apps Script
  // simulation, which asserts BAD_EMAIL, BAD_NAME and MOBILE_TAKEN.
  expect(await email.evaluate((el) => el.checkValidity())).toBe(false);
  await expect(page.locator('.toast')).toHaveCount(0);
  await expect(page.locator('.admin-btn', { hasText: 'Update' })).toBeEnabled();  // still in edit mode
});

// These two write to the live row, so they run one after another — two of them
// mid-flight at once would each restore what the other had just changed. The
// read-only tests above have no such need and are left to run normally, so a
// sheet fault in one of them no longer takes the whole file down with it.
/**
 * The member's own record, from the endpoint the profile screen itself reads.
 *
 * Not the members API: that one deliberately withholds `email`, since it is
 * where the sign-in code is sent — so a restore checked against it can never
 * confirm the email, and a restore built from it would blank the field it could
 * not see.
 */
const profileFromServer = async (page) => {
  const token = JSON.parse(session()).token;
  return page.evaluate(async ([url, tok]) => {
    const res = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'text/plain' },
      body: JSON.stringify({ action: 'getProfile', token: tok }),
    });
    const data = await res.json();
    const p = data.profile || {};
    return { name: p.name || '', nameTe: p.nameTe || '', mobile: String(p.mobile || ''), email: p.email || '' };
  }, [AUTH_API, token]);
};

/**
 * Puts the row back, and does not finish until the server agrees.
 *
 * The restore used to be four UI steps in a `finally` with nothing checking the
 * outcome — and when one of them silently did nothing, a run ended with
 * "Venkat Naresh QA" as the President's name on the live public site. A test
 * that writes to production has to guarantee the undo, not attempt it.
 *
 * So the server is the judge, not the screen: poll it, and if the UI path did
 * not land, write the original values through the same endpoint the screen uses
 * and poll again. Either way the test still fails — repairing the data is not
 * the same as passing — but the committee's own record is never left holding a
 * marker string.
 */
const restoreProfile = async (page, want) => {
  const matches = async () => {
    const now = await profileFromServer(page);
    return Object.keys(want).every((k) => String(now[k] ?? '') === String(want[k] ?? ''));
  };

  // Generous, because this begins the instant Update is clicked and Apps Script
  // takes seconds to answer on a good day. Too short a wait would report the
  // screen as broken every time the service was merely slow.
  for (let i = 0; i < 20; i++) {
    if (await matches()) return true;
    await page.waitForTimeout(1500);
  }

  const token = JSON.parse(session()).token;
  await page.evaluate(async ([url, body]) => {
    await fetch(url, { method: 'POST', headers: { 'Content-Type': 'text/plain' }, body: JSON.stringify(body) });
  }, [AUTH_API, { action: 'updateProfile', token, ...want }]);

  for (let i = 0; i < 10; i++) {
    if (await matches()) return false;
    await page.waitForTimeout(1500);
  }
  return false;
};

test.describe('writes to the live row', () => {
  // Serial, and given room. Each of these is a dozen live round trips to a
  // service that takes seconds to answer on a good day — write, poll until the
  // server agrees, reload, restore, poll again — and reads now retry rather
  // than fail on a lost answer, which is slower when the service is unwell and
  // is the point. The default three minutes was already tight and stopped
  // being enough; a timeout here would report a healthy save as a broken one.
  test.describe.configure({ mode: 'serial', timeout: 6 * 60 * 1000 });

  test('saving a new name reaches the sheet and survives a reload', async ({ page }) => {
    await open(page);
    // A save is refused outright while this member's number names another row
    // too, and the refusal is about the sheet rather than anything here.
    const mine = (await factRows(page)).Mobile;
    const sharing = (await mobilesByNumber(page))[mine] || [];
    test.skip(sharing.length > 1, `mobile ${mine} is shared with ${sharing.join(', ')}`);

    const before = await factRows(page);
    const original = before.Name;
    const changed = `${original} QA`;
    // Everything the row holds, captured before anything is touched — the undo
    // needs all of it, not just the field under test.
    const was = await profileFromServer(page);

    let cleanly = true;
    try {
      await startEdit(page);
      await field(page, 'Name').fill(changed);
      await page.locator('.admin-btn', { hasText: 'Update' }).click();

      await expect(page.locator('.toast-success')).toContainText(/Profile saved/, { timeout: 45000 });
      await expectName(page, changed);

      // it really reached the sheet, not just the screen
      await page.reload();
      await expect(page.locator('.prof-fact').first()).toBeVisible({ timeout: 45000 });
      await expectName(page, changed);
    } finally {
      await startEdit(page);
      await field(page, 'Name').fill(original);
      await page.locator('.admin-btn', { hasText: 'Update' }).click();
      cleanly = await restoreProfile(page, { ...was, name: original });
    }
    expect(cleanly, 'the screen did not put the name back — the sheet was repaired directly').toBe(true);
  });

  // The Telugu name is not in the read-only block above, so this reads it back
  // out of the input. Same write-check-restore shape as the name test, and the
  // same reason for the finally: a half-finished run must not leave the public
  // site showing a test string as somebody's name in Telugu.
  test('a Telugu name reaches the name_te column and survives a reload', async ({ page }) => {
    await open(page);
    // A save is refused outright while this member's number names another row
    // too, and the refusal is about the sheet rather than anything here.
    const mine = (await factRows(page)).Mobile;
    const sharing = (await mobilesByNumber(page))[mine] || [];
    test.skip(sharing.length > 1, `mobile ${mine} is shared with ${sharing.join(', ')}`);

    const box = () => field(page, 'Name (Telugu)');
    const original = await box().inputValue();
    const changed = 'పరీక్ష పేరు';
    const was = await profileFromServer(page);

    let cleanly = true;
    try {
      await startEdit(page);
      await box().fill(changed);
      await page.locator('.admin-btn', { hasText: 'Update' }).click();
      await expect(page.locator('.toast-success')).toContainText(/Profile saved/, { timeout: 45000 });

      // Reloaded, so this is the sheet answering rather than the form still
      // holding what was typed into it.
      await page.reload();
      // The read-only block above appears as soon as the profile lands, but the
      // form below is seeded from it a tick later — so this needs the same
      // patience as everything else here, not the 5s default.
      await expect(page.locator('.prof-fact').first()).toBeVisible({ timeout: 45000 });
      await expect(box()).toHaveValue(changed, { timeout: 45000 });
    } finally {
      await startEdit(page);
      await box().fill(original);
      await page.locator('.admin-btn', { hasText: 'Update' }).click();
      cleanly = await restoreProfile(page, { ...was, nameTe: original });
    }
    expect(cleanly, 'the screen did not put the Telugu name back — the sheet was repaired directly').toBe(true);
  });
});

test('the profile is reachable from the topbar menu', async ({ page }) => {
  await page.addInitScript((v) => sessionStorage.setItem('ssgc.session', v), session());
  await page.goto('/admin/gallery');

  await page.locator('.admin-profile-btn').click();
  await page.locator('.admin-profile-menu button', { hasText: /Profile/ }).click();

  await expect(page).toHaveURL(/\/admin\/profile$/);
  await expect(page.locator('.admin-page-title')).toHaveText('My Profile');
});
