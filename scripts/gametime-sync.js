/**
 * gametime-sync.js — Playwright worker that checks members into GameTime
 * automatically after they sign in on the JCT kiosk.
 *
 * Usage:
 *   node scripts/gametime-sync.js           # one-shot: sync all unsynced, exit
 *   node scripts/gametime-sync.js --watch   # loop: sync every 3 minutes
 *
 * Required env vars (set in Railway → Variables, never in code):
 *   GAMETIME_EMAIL     login email for jct.gametime.net
 *   GAMETIME_PASSWORD  login password
 *
 * First-run discovery (TODO):
 *   On first run, set GAMETIME_HEADLESS=false to see the browser.
 *   Navigate manually to confirm the selectors below are correct,
 *   then update SELECTOR_* constants and set GAMETIME_HEADLESS=true.
 *
 * Install: npm install playwright
 * Then:    npx playwright install chromium
 */

'use strict';

const { chromium } = require('playwright');
const path   = require('path');
const db     = require(path.join(__dirname, '..', 'db'));

// ─── Config ───────────────────────────────────────────────────────────────────
const GAMETIME_URL   = 'https://jct.gametime.net/auth';
const EMAIL          = process.env.GAMETIME_EMAIL;
const PASSWORD       = process.env.GAMETIME_PASSWORD;
const HEADLESS       = process.env.GAMETIME_HEADLESS !== 'false'; // default true
const WATCH_INTERVAL = 3 * 60 * 1000; // 3 minutes

// ─── Selectors (TODO: verify on first live run with GAMETIME_HEADLESS=false) ─
// These are educated guesses based on typical gametime.net UI patterns.
// Update them after inspecting the actual DOM.
const SEL = {
  emailInput:    'input[type="email"], input[name="email"]',
  passwordInput: 'input[type="password"]',
  submitBtn:     'button[type="submit"], input[type="submit"]',

  // After login — the Tennis navigation link
  tennisNav:     'a:has-text("Tennis"), nav a:has-text("Tennis"), [href*="tennis"]',

  // Within Tennis — the "today" court block / attendance view
  // GameTime often has a date header or a "Today" button
  todayBtn:      'button:has-text("Today"), a:has-text("Today")',

  // Each booked member row contains their name and an unchecked checkbox
  // The container for all member rows in the attendance list
  memberRows:    '.booking-row, .member-row, tr[data-member], .attendance-row',

  // Within a member row: the member name text and the check-in checkbox
  memberName:    '.member-name, .booking-name, td.name',
  checkinBox:    'input[type="checkbox"]:not(:checked), .checkin-checkbox:not(.checked)',
};

// ─── Helpers ─────────────────────────────────────────────────────────────────
function log(msg) { console.log(`[gametime-sync] ${new Date().toISOString().slice(11,19)} ${msg}`); }
function err(msg) { console.error(`[gametime-sync] ERROR ${msg}`); }

function normalizeName(s) {
  return String(s || '').toLowerCase().replace(/[^a-z\s]/g, '').trim().replace(/\s+/g, ' ');
}

// ─── Core sync ───────────────────────────────────────────────────────────────
async function syncCheckins() {
  const pending = db.getUnsyncedCheckins();
  if (!pending.length) { log('No unsynced check-ins. Done.'); return 0; }
  log(`${pending.length} unsynced check-in(s) to push…`);

  if (!EMAIL || !PASSWORD) {
    err('GAMETIME_EMAIL or GAMETIME_PASSWORD not set. Skipping.');
    return 0;
  }

  const browser = await chromium.launch({ headless: HEADLESS });
  const context = await browser.newContext();
  const page    = await context.newPage();
  let synced = 0;

  try {
    // ── 1. Log in ────────────────────────────────────────────────────────────
    log('Navigating to GameTime login…');
    await page.goto(GAMETIME_URL, { waitUntil: 'networkidle', timeout: 30000 });

    await page.fill(SEL.emailInput, EMAIL);
    await page.fill(SEL.passwordInput, PASSWORD);
    await Promise.all([
      page.waitForNavigation({ waitUntil: 'networkidle', timeout: 30000 }),
      page.click(SEL.submitBtn),
    ]);
    log('Logged in.');

    // ── 2. Navigate to Tennis ─────────────────────────────────────────────────
    // TODO: confirm Tennis nav selector on first run
    const tennisLink = page.locator(SEL.tennisNav).first();
    if (await tennisLink.isVisible({ timeout: 5000 }).catch(() => false)) {
      await tennisLink.click();
      await page.waitForLoadState('networkidle');
      log('Navigated to Tennis.');
    } else {
      err(`Tennis nav link not found. Check SEL.tennisNav selector.`);
      err(`Current URL: ${page.url()}`);
      err(`Page title: ${await page.title()}`);
      // Don't abort — try to continue from current page
    }

    // ── 3. Ensure we're on today's view ──────────────────────────────────────
    const todayBtn = page.locator(SEL.todayBtn).first();
    if (await todayBtn.isVisible({ timeout: 3000 }).catch(() => false)) {
      await todayBtn.click();
      await page.waitForLoadState('networkidle');
    }

    // ── 4. For each pending check-in, find and click their checkbox ───────────
    for (const checkin of pending) {
      const fullName   = `${checkin.first_name} ${checkin.last_name}`.trim();
      const normalized = normalizeName(fullName);
      log(`Looking for: ${fullName} (id=${checkin.id})`);

      try {
        // Find all member rows and look for name match
        const rows = await page.locator(SEL.memberRows).all();

        // TODO on first run: if rows.length === 0, inspect the page and update
        // SEL.memberRows to match the actual container elements.
        if (rows.length === 0) {
          err(`No member rows found. Current URL: ${page.url()} — update SEL.memberRows`);
          db.markCheckinSyncFailed(checkin.id, 'no member rows found');
          continue;
        }

        let found = false;
        for (const row of rows) {
          const nameEl = row.locator(SEL.memberName).first();
          if (!(await nameEl.isVisible().catch(() => false))) continue;

          const rowName = normalizeName(await nameEl.textContent());
          // Match: full name appears anywhere in the row's name field
          const firstLast = normalizeName(`${checkin.first_name} ${checkin.last_name}`);
          const lastFirst = normalizeName(`${checkin.last_name} ${checkin.first_name}`);
          if (!rowName.includes(firstLast) && !rowName.includes(lastFirst) && !firstLast.includes(rowName)) continue;

          // Found the row — look for unchecked checkbox within it
          const box = row.locator(SEL.checkinBox).first();
          if (!(await box.isVisible().catch(() => false))) {
            log(`  ${fullName} — checkbox not found or already checked. Marking synced.`);
            db.markCheckinSynced(checkin.id);
            found = true;
            synced++;
            break;
          }

          await box.click();
          await page.waitForTimeout(400); // brief pause for GameTime to register
          log(`  ✓ ${fullName} checked in on GameTime`);
          db.markCheckinSynced(checkin.id);
          found = true;
          synced++;
          break;
        }

        if (!found) {
          log(`  ${fullName} — not found in GameTime today (walk-in or no booking)`);
          db.markCheckinSyncFailed(checkin.id, 'member not found in GameTime');
        }

      } catch (e) {
        err(`  ${fullName} — ${e.message}`);
        db.markCheckinSyncFailed(checkin.id, e.message);
      }
    }

  } catch (e) {
    err(`Session error: ${e.message}`);
  } finally {
    await browser.close();
  }

  log(`Done. ${synced}/${pending.length} synced.`);
  return synced;
}

// ─── Entry point ─────────────────────────────────────────────────────────────
async function main() {
  const watch = process.argv.includes('--watch');

  if (watch) {
    log(`Watch mode — syncing every ${WATCH_INTERVAL / 60000} minutes`);
    await syncCheckins();
    setInterval(async () => {
      try { await syncCheckins(); } catch (e) { err(e.message); }
    }, WATCH_INTERVAL);
  } else {
    try {
      await syncCheckins();
      process.exit(0);
    } catch (e) {
      err(e.message);
      process.exit(1);
    }
  }
}

main();
