/**
 * reconcile.js — cross-check a GameTime "Booking Participants" export against
 * the hub's own check-ins for the same day, so the desk (and management after
 * them) can see gaps in one pass instead of writing a number beside every name
 * on two printed sheets.
 *
 * Nothing here writes check-ins itself — /api/reconcile/parse is a pure,
 * repeatable compute step (paste the same CSV twice, get the same answer).
 * Only the status/note endpoints persist anything, and only reconciliation
 * bookkeeping (who reconciled, who verified, per-booking notes) — never
 * check-in data. Mounted behind requireAuth at /api/reconcile.
 */
const express = require('express');
const db = require('../db');
const Anthropic = require('@anthropic-ai/sdk');
const router = express.Router();

const client = new Anthropic(); // reads ANTHROPIC_API_KEY from env, same as routes/ai.js

router.use((req, res, next) => {
  req.actingStaffId = db.getEffectiveStaffId(req.session.staffId, req.session.viewAsStaffId);
  next();
});

function isMgmt(id) { const s = db.getStaffById(id); return s && ['admin', 'manager'].includes(s.role); }
function guardView(req, res, next) {
  const s = db.getStaffById(req.actingStaffId);
  if (!s || !['admin', 'manager', 'staff'].includes(s.role)) return res.status(403).json({ error: 'Admin staff only' });
  next();
}
function guardMgmt(req, res, next) {
  if (!isMgmt(req.actingStaffId)) return res.status(403).json({ error: 'Management only' });
  next();
}

// Same minimal RFC4180-ish parser as the GameTime Member import (routes/members.js)
// — quotes, doubled-quote escaping, CRLF/LF, and (unlike a naive split-by-line)
// newlines *inside* a quoted field, which GameTime uses for multi-player bookings.
function parseCsv(text) {
  const rows = [];
  let row = [], field = '', inQuotes = false;
  for (let i = 0; i < text.length; i++) {
    const c = text[i];
    if (inQuotes) {
      if (c === '"') { if (text[i + 1] === '"') { field += '"'; i++; } else inQuotes = false; }
      else field += c;
    } else if (c === '"') inQuotes = true;
    else if (c === ',') { row.push(field); field = ''; }
    else if (c === '\r') { /* skip */ }
    else if (c === '\n') { row.push(field); rows.push(row); row = []; field = ''; }
    else field += c;
  }
  if (field.length || row.length) { row.push(field); rows.push(row); }
  return rows;
}

function parseDurationMin(s) {
  s = String(s || '').trim();
  const h = /(\d+)h/.exec(s);
  const m = /(\d+)m/.exec(s);
  return (h ? parseInt(h[1]) * 60 : 0) + (m ? parseInt(m[1]) : 0);
}

const MONTHS = { Jan: 1, Feb: 2, Mar: 3, Apr: 4, May: 5, Jun: 6, Jul: 7, Aug: 8, Sep: 9, Oct: 10, Nov: 11, Dec: 12 };
// "Sep 27, 2026 08:00 PM" -> { date: '2026-09-27', time: '20:00' }
function parseCourtDate(s) {
  const m = /^(\w+)\s+(\d+),\s+(\d+)\s+(\d+):(\d+)\s*(AM|PM)$/.exec(String(s || '').trim());
  if (!m || !MONTHS[m[1]]) return null;
  const [, mon, day, year, hh, mm, ap] = m;
  let h = parseInt(hh) % 12;
  if (ap === 'PM') h += 12;
  return {
    date: `${year}-${String(MONTHS[mon]).padStart(2, '0')}-${String(day).padStart(2, '0')}`,
    time: `${String(h).padStart(2, '0')}:${mm}`,
  };
}

// "[1] Elena, Rusic (M2148)\n[2] ..." -> [{ slot, name, memberNo }]
function parsePlayers(field) {
  if (!field) return [];
  return field.split('\n').map(l => l.trim()).filter(Boolean).map(line => {
    const m = /^\[(\d+)\]\s*([^,]+),\s*([^(]+)\(([^)]+)\)$/.exec(line);
    if (!m) return { slot: null, name: line, memberNo: null };
    const [, slot, first, last, memberNo] = m;
    return { slot: parseInt(slot), name: `${first.trim()} ${last.trim()}`, memberNo: memberNo.trim() };
  });
}

// "iva (P1)" or "Ivy Li (P1)\n Max Li (P1)" -> [{ name, ofSlot }]
function parseGuests(field) {
  if (!field) return [];
  return field.split('\n').map(l => l.trim()).filter(Boolean).map(line => {
    const m = /^(.+?)\s*\(P(\d+)\)$/.exec(line);
    if (!m) return { name: line, ofSlot: null };
    return { name: m[1].trim(), ofSlot: parseInt(m[2]) };
  });
}

function parseBookingParticipants(csvText) {
  const rows = parseCsv(csvText).filter(r => r.some(f => String(f || '').trim()));
  if (!rows.length) return [];
  const header = rows[0].map(h => h.trim());
  const idx = (name) => header.indexOf(name);
  const iConf = idx('Conf No'), iCourt = idx('Court'), iDate = idx('Court Date'),
        iDur = idx('Duration'), iType = idx('Res Type'), iPlayers = idx('Players'), iGuests = idx('Guest(Guest Of)');
  if (iConf < 0 || iCourt < 0 || iDate < 0) return null; // not a Booking Participants export we recognize

  return rows.slice(1).map(r => {
    const cd = parseCourtDate(r[iDate]);
    return {
      confNo: r[iConf],
      court: parseInt(String(r[iCourt] || '').replace(/\D/g, '')),
      date: cd ? cd.date : null,
      time: cd ? cd.time : null,
      durationMin: parseDurationMin(r[iDur]),
      resType: String(r[iType] || '').trim(),
      players: parsePlayers(r[iPlayers]),
      guests: parseGuests(r[iGuests]),
    };
  }).filter(r => r.date);
}

function toMinutes(hhmm) {
  const [h, m] = String(hhmm || '0:0').split(':').map(Number);
  return h * 60 + m;
}
function normName(s) { return String(s || '').toLowerCase().replace(/[^a-z]/g, ''); }

// Cross-check parsed GameTime rows against the hub's check-ins for the same
// date. `nowMin` gates which bookings are even eligible to be flagged — a
// booking later today than the current time isn't a gap, it just hasn't
// happened yet (see 2026-09-27 conversation: don't flag the future).
// Screenshot-sourced bookings have no member number — fall back to matching
// on name. Exact normalized full name first; then GameTime's own display
// abbreviation ("Y. Liang" = first-initial + full last name, seen live on the
// court board); then full-first-name + last-name-prefix as a last resort.
function findMemberByName(members, name) {
  const raw = String(name || '').trim();
  const norm = normName(raw);
  if (!norm) return null;
  let hit = members.find(m => normName(m.first_name + m.last_name) === norm);
  if (hit) return hit;
  const abbrev = /^([A-Za-z])\.?\s+(.+)$/.exec(raw);
  if (abbrev) {
    const initial = normName(abbrev[1]), last = normName(abbrev[2]);
    hit = members.find(m => normName(m.first_name)[0] === initial && normName(m.last_name) === last);
    if (hit) return hit;
  }
  const parts = raw.split(/\s+/);
  if (parts.length >= 2) {
    const first = normName(parts[0]), last = normName(parts[parts.length - 1]);
    hit = members.find(m => normName(m.first_name) === first && normName(m.last_name).startsWith(last.slice(0, 3)));
    if (hit) return hit;
  }
  return null;
}

function reconcile(bookingRows, checkins, date, nowMin) {
  const isToday = nowMin != null;
  const clinics = bookingRows.filter(r => r.resType === 'Clinic');
  const bookings = bookingRows.filter(r => r.resType !== 'Clinic')
    .filter(r => !isToday || toMinutes(r.time) <= nowMin);
  const members = db.getAllMembers();

  const usedCheckinIds = new Set();
  const matched = [];
  const bookedNotCheckedIn = [];
  const unnamed = [];

  bookings.forEach(b => {
    const named = [
      ...b.players.map(p => ({ kind: 'member', name: p.name, memberNo: p.memberNo })),
      ...b.guests.map(g => ({ kind: 'guest', name: g.name })),
    ];
    if (!named.length) {
      unnamed.push({ confNo: b.confNo, court: b.court, time: b.time, durationMin: b.durationMin, resType: b.resType });
      return;
    }
    named.forEach(person => {
      let member = null;
      if (person.kind === 'member') {
        member = person.memberNo ? db.getMemberByClubNumber(person.memberNo) : null;
        if (!member) member = findMemberByName(members, person.name); // no ID (screenshot), or an ID that didn't resolve
      }
      const bookMin = toMinutes(b.time);
      const candidates = checkins.filter(c => {
        if (usedCheckinIds.has(c.id)) return false;
        if (member) return c.member_id === member.id;
        // Guest: loose name match — GameTime guest names are often first-name-only or informally typed.
        return c.guest && normName(c.member_name).includes(normName(person.name).slice(0, 4));
      });
      // Closest by arrival time within a 90-minute window either side of the booking start —
      // arrival rarely lines up to the minute with a booking that was made in 30-min blocks.
      let best = null, bestDelta = Infinity;
      candidates.forEach(c => {
        const delta = Math.abs(toMinutes(c.time) - bookMin);
        if (delta <= 90 && delta < bestDelta) { best = c; bestDelta = delta; }
      });
      if (best) {
        usedCheckinIds.add(best.id);
        matched.push({ confNo: b.confNo, court: b.court, time: b.time, resType: b.resType, name: person.name, checkinId: best.id, checkinTime: best.time });
      } else {
        bookedNotCheckedIn.push({ confNo: b.confNo, court: b.court, time: b.time, resType: b.resType, name: person.name, guest: person.kind === 'guest' });
      }
    });
  });

  const relevantCheckins = checkins.filter(c => !isToday || toMinutes(c.time) <= nowMin);
  const checkedInNotBooked = relevantCheckins
    .filter(c => !usedCheckinIds.has(c.id) && !c.duplicate)
    .map(c => ({ checkinId: c.id, name: c.member_name, time: c.time, court: c.court || null, guest: !!c.guest }));

  return { date, clinics, matched, bookedNotCheckedIn, unnamed, checkedInNotBooked };
}

function buildResult(rows, date) {
  const checkins = db.getCheckinLogsByDate(date);
  const today = db.todayLocal();
  const nowMin = date === today ? toMinutes(db.nowLocal().slice(11, 16)) : null;

  const result = reconcile(rows, checkins, date, nowMin);
  const rec = db.getReconciliation(date);
  result.status = rec.status;
  result.notes = rec.notes || [];
  result.summary = {
    totalBookings: rows.filter(r => r.resType !== 'Clinic').length,
    clinics: result.clinics.length,
    matched: result.matched.length,
    bookedNotCheckedIn: result.bookedNotCheckedIn.length,
    unnamed: result.unnamed.length,
    checkedInNotBooked: result.checkedInNotBooked.length,
  };
  return result;
}

// POST /parse — pure compute, no persistence. Body: { date: 'YYYY-MM-DD', csv }
router.post('/parse', guardView, (req, res) => {
  const { date, csv } = req.body || {};
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date || '')) return res.status(400).json({ error: 'Need a date (YYYY-MM-DD)' });
  if (!csv || !String(csv).trim()) return res.status(400).json({ error: 'Paste the Booking Participants CSV text' });

  const rows = parseBookingParticipants(String(csv));
  if (rows === null) return res.status(400).json({ error: 'That doesn’t look like a Booking Participants export — check the columns (Conf No, Court, Court Date, Duration, Res Type, Players, Guest(Guest Of))' });
  if (!rows.length) return res.status(400).json({ error: 'No rows found in that CSV' });

  res.json(buildResult(rows, date));
});

// Ask Claude to read a GameTime calendar screenshot into the same row shape
// parseBookingParticipants produces. Screenshots carry no Conf No or member
// number — confNo is synthesized (stable within one image) and matching
// falls back to name (see findMemberByName). One call per image; multiple
// images (e.g. a day that spans two screenshots) are merged before matching.
async function extractRowsFromImage(base64, mediaType, idxOffset) {
  const prompt = `This is a screenshot of a GameTime tennis court booking calendar for one day. Extract every booking block you can see across all courts into JSON.

Colors: green blocks are lessons/lessons-with-pro, blue blocks are member bookings (singles/doubles), pink/magenta blocks are programmed clinics (e.g. "Adult/Junior Clinic").

Return ONLY a JSON array, no prose, no markdown fence. Each element:
{ "court": <court number as integer>, "time": "<24-hour HH:MM start time>", "resType": "Lesson" | "Clinic" | "Booking", "players": [{"name": "First Last"}], "guests": [{"name": "First"}] }

Rules:
- One element per distinct time-slot block, not per player row already merged into one block.
- "players" = named members shown directly (no "[G]" marker). "guests" = anyone marked "[G]" or labeled guest.
- If a block shows no name at all (an empty programmed slot), still include it with empty players and guests arrays.
- Clinic blocks (pink) always get empty players/guests — do not invent names for them.
- Skip instructor/"C: ..." names — those are staff, not the booking participant.
- Court numbers only (e.g. 3, not "Court 3"). Times in 24-hour HH:MM.`;

  const response = await client.messages.create({
    model: 'claude-haiku-4-5-20251001',
    max_tokens: 4096,
    messages: [{
      role: 'user',
      content: [
        { type: 'image', source: { type: 'base64', media_type: mediaType, data: base64 } },
        { type: 'text', text: prompt },
      ],
    }],
  });
  const raw = response.content[0]?.text || '[]';
  const match = raw.match(/\[[\s\S]*\]/);
  const parsed = match ? JSON.parse(match[0]) : [];
  return parsed.map((r, i) => ({
    confNo: `img-${idxOffset + i}-c${r.court}-${r.time}`,
    court: parseInt(r.court),
    date: null, // filled in by the caller
    time: r.time,
    durationMin: 30,
    resType: r.resType === 'Clinic' ? 'Clinic' : (r.resType || 'Lesson'),
    players: (r.players || []).map(p => ({ slot: null, name: p.name, memberNo: null })),
    guests: (r.guests || []).map(g => ({ name: g.name, ofSlot: null })),
  })).filter(r => Number.isInteger(r.court) && /^\d{2}:\d{2}$/.test(r.time || ''));
}

// POST /parse-image — { date, images: [{ base64, mediaType }] }
router.post('/parse-image', guardView, async (req, res) => {
  const { date, images } = req.body || {};
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date || '')) return res.status(400).json({ error: 'Need a date (YYYY-MM-DD)' });
  if (!Array.isArray(images) || !images.length) return res.status(400).json({ error: 'No image(s) received' });
  if (images.length > 4) return res.status(400).json({ error: 'Up to 4 images per compare' });

  try {
    const chunks = await Promise.all(images.map((img, i) => extractRowsFromImage(img.base64, img.mediaType || 'image/png', i * 1000)));
    const rows = chunks.flat().map(r => ({ ...r, date }));
    if (!rows.length) return res.status(400).json({ error: 'Could not find any booking blocks in that image — try a clearer screenshot or use the CSV instead' });
    res.json(buildResult(rows, date));
  } catch (err) {
    console.error('[reconcile/parse-image error]', err);
    res.status(500).json({ error: 'Could not read that screenshot — try again or use the CSV instead' });
  }
});

// GET /:date — current reconciliation status + notes (no CSV needed)
router.get('/:date', guardView, (req, res) => {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(req.params.date || '')) return res.status(400).json({ error: 'Bad date' });
  res.json(db.getReconciliation(req.params.date));
});

// POST /:date/status — { status: 'staff-reconciled' | 'verified' | 'unreconciled' }
// staff-reconciled is any check-in-capable staff; verified/revert is management only.
router.post('/:date/status', guardView, (req, res) => {
  const { status } = req.body || {};
  if (!/^\d{4}-\d{2}-\d{2}$/.test(req.params.date || '')) return res.status(400).json({ error: 'Bad date' });
  if (!['unreconciled', 'staff-reconciled', 'verified'].includes(status)) return res.status(400).json({ error: 'Bad status' });
  if (status !== 'staff-reconciled' && !isMgmt(req.actingStaffId)) return res.status(403).json({ error: 'Management only' });
  const r = db.setReconciliationStatus(req.params.date, status, req.actingStaffId);
  res.json(r);
});

// POST /:date/note — { confNo, note }
router.post('/:date/note', guardView, (req, res) => {
  const { confNo, note } = req.body || {};
  if (!/^\d{4}-\d{2}-\d{2}$/.test(req.params.date || '')) return res.status(400).json({ error: 'Bad date' });
  if (!note || !String(note).trim()) return res.status(400).json({ error: 'Note text required' });
  const r = db.addReconciliationNote(req.params.date, confNo, note, req.actingStaffId);
  res.json(r);
});

module.exports = router;
