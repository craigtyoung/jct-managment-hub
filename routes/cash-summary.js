const express = require('express');
const db      = require('../db');
const sse     = require('../sse');
const router  = express.Router();

const SHIFT_LABELS = ['Morning', 'Afternoon', 'Closing', 'Extended'];
const DENOM = [
  { key:'100', val:100, label:'$100' },
  { key:'50',  val:50,  label:'$50'  },
  { key:'20',  val:20,  label:'$20'  },
  { key:'10',  val:10,  label:'$10'  },
  { key:'5',   val:5,   label:'$5'   },
  { key:'2',   val:2,   label:'$2'   },
  { key:'1',   val:1,   label:'$1'   },
  { key:'025', val:0.25,label:'$0.25'},
  { key:'010', val:0.10,label:'$0.10'},
  { key:'005', val:0.05,label:'$0.05'},
];

function blankShift(index) {
  return {
    index,
    label: SHIFT_LABELS[index] || `Shift ${index + 1}`,
    staff_name: '',
    pro_shop: {
      tennis_balls:  [null,null,null,null,null],
      stringing:     Array.from({length:5}, () => ({ amount: null, member: '' })),
      accessories:   [null,null,null,null,null],
      racquet_sales: Array.from({length:5}, () => ({ amount: null, member: '' })),
      grips:         [null,null,null,null,null],
    },
    court_fees: { entries: [] },
    drinks_snacks: {
      drinks: [null,null,null,null,null],
      snacks: [null,null,null,null,null],
    },
    till: {
      cash:  Object.fromEntries(DENOM.map(d => [d.key, 0])),
      slips: Array(10).fill(null),
    },
  };
}

// GET ?date=YYYY-MM-DD
router.get('/', (req, res) => {
  const { date } = req.query;
  if (!date || !/^\d{4}-\d{2}-\d{2}$/.test(date)) {
    return res.status(400).json({ error: 'date required (YYYY-MM-DD)' });
  }
  const summary = db.getCashSummary(date) || {
    date,
    opening_float: 100,
    closing_float: null,
    shifts: SHIFT_LABELS.map((_, i) => blankShift(i)),
  };
  res.json(summary);
});

// POST — upsert
router.post('/', (req, res) => {
  const { date, opening_float, closing_float, shifts } = req.body;
  if (!date || !/^\d{4}-\d{2}-\d{2}$/.test(date)) {
    return res.status(400).json({ error: 'date required (YYYY-MM-DD)' });
  }
  const result = db.upsertCashSummary({
    date,
    openingFloat: opening_float,
    closingFloat: closing_float,
    shifts,
    updatedBy: req.session.staffId,
  });
  try { sse.broadcast('cash-update'); } catch (e) {}   // push so other open cash sheets refresh
  res.json(result);
});

// Cash totals (monthly / custom-range rollups) are restricted to the same trio as
// Pay Review (Craig, Jaime, Victor) — office staff balance day-to-day cash but never
// see aggregate totals; David (manager) is deliberately excluded too.
function requireCashTotalsAccess(req, res, next) {
  if (!db.canManageStaff(req.session.staffId)) return res.status(403).json({ error: 'Not authorized to view cash totals' });
  next();
}

// GET /range?start=YYYY-MM-DD&end=YYYY-MM-DD — raw per-day data (trio only)
router.get('/range', requireCashTotalsAccess, (req, res) => {
  const { start, end } = req.query;
  if (!start || !end) return res.status(400).json({ error: 'start and end required' });
  res.json(db.getCashSummaryRange(start, end));
});

// GET /export?date=YYYY-MM-DD — CSV download
router.get('/export', (req, res) => {
  const { date } = req.query;
  if (!date) return res.status(400).json({ error: 'date required' });

  const summary = db.getCashSummary(date);
  if (!summary) return res.status(404).json({ error: 'No data for that date' });

  const fmt  = v  => (v != null ? Number(v) : 0).toFixed(2);
  const sumArr = arr => (arr || []).reduce((a, v) => a + (v != null ? Number(v) : 0), 0);
  const sumObj = (arr, key) => (arr || []).reduce((a, o) => a + (o?.[key] != null ? Number(o[key]) : 0), 0);

  const shifts = summary.shifts || [];
  const labels = shifts.map(s => s.label || `Shift ${s.index + 1}`);

  const rows = [];
  const q    = cell => `"${String(cell ?? '').replace(/"/g, '""')}"`;
  const row  = cells => rows.push(cells.map(q).join(','));

  row(['JCT Cash Summary', date, '', '', '', '']);
  row([]);
  row(['Category', ...labels, 'Daily Total']);
  row(['Staff', ...shifts.map(s => s.staff_name || ''), '']);
  row([]);

  // Pro Shop
  row(['PRO SHOP']);
  const tb   = shifts.map(s => sumArr(s.pro_shop?.tennis_balls));
  const str  = shifts.map(s => sumObj(s.pro_shop?.stringing, 'amount'));
  const acc  = shifts.map(s => sumArr(s.pro_shop?.accessories));
  const rs   = shifts.map(s => sumObj(s.pro_shop?.racquet_sales, 'amount'));
  const grp  = shifts.map(s => sumArr(s.pro_shop?.grips));
  const ps   = shifts.map((_, i) => tb[i] + str[i] + acc[i] + rs[i] + grp[i]);

  row(['Tennis Balls',  ...tb.map(fmt),  fmt(tb.reduce((a,b)=>a+b,0))]);
  row(['Stringing',     ...str.map(fmt), fmt(str.reduce((a,b)=>a+b,0))]);
  row(['Accessories',   ...acc.map(fmt), fmt(acc.reduce((a,b)=>a+b,0))]);
  row(['Racquet Sales', ...rs.map(fmt),  fmt(rs.reduce((a,b)=>a+b,0))]);
  row(['Grips',         ...grp.map(fmt), fmt(grp.reduce((a,b)=>a+b,0))]);
  row(['Pro Shop Total',...ps.map(fmt),  fmt(ps.reduce((a,b)=>a+b,0))]);
  row([]);

  // Court Fees
  row(['COURT FEES']);
  const cfEntries = si => {
    const e = shifts[si]?.court_fees?.entries;
    if (e) return e;
    // backward-compat: old named structure
    const cf = shifts[si]?.court_fees || {};
    return [
      ...(cf.private_lessons||[]).map(o=>({type:'lesson',...o})),
      ...(cf.guests||[]).map(o=>({type:'guest',...o})),
      ...(cf.payg||[]).map(o=>({type:'payg',...o})),
    ];
  };
  const sumByType = (si, t) => cfEntries(si).filter(e=>e.type===t).reduce((a,e)=>a+Number(e.amount||0),0);
  const plArr = shifts.map((_, i) => sumByType(i,'lesson'));
  const gArr  = shifts.map((_, i) => sumByType(i,'guest'));
  const pyArr = shifts.map((_, i) => sumByType(i,'payg'));
  const cf    = shifts.map((_, i) => plArr[i] + gArr[i] + pyArr[i]);

  row(['Private Lessons', ...plArr.map(fmt), fmt(plArr.reduce((a,b)=>a+b,0))]);
  row(['Guests',          ...gArr.map(fmt),  fmt(gArr.reduce((a,b)=>a+b,0))]);
  row(['PAYG',            ...pyArr.map(fmt), fmt(pyArr.reduce((a,b)=>a+b,0))]);
  row(['Court Fees Total',...cf.map(fmt),    fmt(cf.reduce((a,b)=>a+b,0))]);
  row([]);
  row(['— Court Fee Detail —']);
  row(['Shift','Type','Court','Time','Name','Amount']);
  shifts.forEach(s => {
    const entries = s.court_fees?.entries || [];
    entries.filter(e => e.amount).forEach(e => {
      row([s.label || '', e.type || '', e.court || '', e.time || '', e.name || e.detail || '', fmt(Number(e.amount||0))]);
    });
  });
  row([]);

  // Drinks & Snacks
  row(['DRINKS & SNACKS']);
  const dr = shifts.map(s => sumArr(s.drinks_snacks?.drinks));
  const sn = shifts.map(s => sumArr(s.drinks_snacks?.snacks));
  const ds = shifts.map((_, i) => dr[i] + sn[i]);

  row(['Drinks',          ...dr.map(fmt), fmt(dr.reduce((a,b)=>a+b,0))]);
  row(['Snacks',          ...sn.map(fmt), fmt(sn.reduce((a,b)=>a+b,0))]);
  row(['D&S Total',       ...ds.map(fmt), fmt(ds.reduce((a,b)=>a+b,0))]);
  row([]);

  // Shift Totals
  const st = shifts.map((_, i) => ps[i] + cf[i] + ds[i]);
  row(['SHIFT TOTAL', ...st.map(fmt), fmt(st.reduce((a,b)=>a+b,0))]);
  row([]);

  row(['Opening Float', fmt(summary.opening_float || 100)]);
  row(['Closing Float', summary.closing_float != null ? fmt(summary.closing_float) : '']);
  row([]);

  // Till Count
  row(['TILL COUNT']);
  row(['Denomination', ...labels, '']);
  for (const d of DENOM) {
    const amts = shifts.map(s => (s.till?.cash?.[d.key] || 0) * d.val);
    row([`${d.label} × units`, ...amts.map(fmt), '']);
  }
  const cash = shifts.map(s => DENOM.reduce((a, d) => a + (s.till?.cash?.[d.key] || 0) * d.val, 0));
  const slips = shifts.map(s => sumArr(s.till?.slips));
  row(['Cash Sub-Total',   ...cash.map(fmt),  '']);
  row(['Card Slips Total', ...slips.map(fmt), '']);
  row(['Till Total', ...shifts.map((_, i) => fmt(cash[i] + slips[i])), '']);

  const csv = rows.join('\n');
  res.setHeader('Content-Type', 'text/csv');
  res.setHeader('Content-Disposition', `attachment; filename="cash-summary-${date}.csv"`);
  res.send(csv);
});

// ── Legacy-format export ────────────────────────────────────────────────────
// Jaime's old pre-hub spreadsheet laid shifts out side by side (one column
// block per shift: 5 numbered line-slots + a Total column), stacked under a
// per-day header, with a Daily Totals + Opening Float footer. She still
// hand-copies each day into a master spreadsheet in that shape, so this
// reproduces it directly instead of the category-rollup /export format above.
// Two real, deliberate deviations from the original sheet (flagged so they can
// be changed if Jaime wants the originals back):
//   1. The original reused "Shift Total-Court Fees" as the label for the
//      Drinks & Snacks subtotal too, and labeled the daily Court Fees total
//      "Guest Income" — both look like copy-paste drift, not intent. Each
//      total gets its own clear label here instead.
//   2. The original hard-coded 2 stacked rows each for Guests and PAYG (amount
//      + "time and court" note). The real data allows any number of entries
//      per shift, so instead of silently dropping a 3rd booking to fit a
//      2-row slot, each category shows its shift total in the block and the
//      full itemized list (shift, type, court, time, name, amount) follows
//      underneath the grid — same detail Jaime had, just not force-fit into
//      a fixed row count.
function legacyBlankSummary(date) {
  return { date, opening_float: 100, closing_float: null, shifts: SHIFT_LABELS.slice(0, 3).map((_, i) => blankShift(i)) };
}

function buildLegacyDayRows(summary) {
  const fmt = v => (v != null ? Number(v) : 0).toFixed(2);
  const sumArr = arr => (arr || []).reduce((a, v) => a + (v != null ? Number(v) : 0), 0);
  const sumObj = (arr, key) => (arr || []).reduce((a, o) => a + (o?.[key] != null ? Number(o[key]) : 0), 0);
  const cfEntries = sh => {
    const e = sh.court_fees && sh.court_fees.entries;
    if (e) return e;
    const cf = sh.court_fees || {};
    return [
      ...(cf.private_lessons || []).map(o => ({ type: 'lesson', ...o })),
      ...(cf.guests || []).map(o => ({ type: 'guest', ...o })),
      ...(cf.payg || []).map(o => ({ type: 'payg', ...o })),
    ];
  };
  const sumByType = (sh, t) => cfEntries(sh).filter(e => e && e.type === t).reduce((a, e) => a + (Number(e.amount) || 0), 0);

  const shifts = (summary.shifts || []).slice(0, 3); // Morning / Afternoon / Closing blocks, matching the live hub
  const rows = [];
  const push = cells => rows.push(cells);

  // Lay out N shift blocks side by side: each block is [slot1..slot5, Total],
  // with one blank spacer column between blocks. Column A (the first cell of
  // the row) is the shared row label, outside every block.
  const blockRow = (label, cellsFn) => {
    const out = [label];
    shifts.forEach((s, i) => {
      if (i > 0) out.push('');
      out.push(...cellsFn(s));
    });
    push(out);
  };
  const slotRow = (label, getArr) => blockRow(label, s => {
    const arr = getArr(s) || [];
    const vals = Array.from({ length: 5 }, (_, i) => arr[i] != null ? fmt(Number(arr[i])) : '');
    return [...vals, fmt(sumArr(arr))];
  });
  const slotObjAmountRow = (label, getArr) => blockRow(label, s => {
    const arr = getArr(s) || [];
    const vals = Array.from({ length: 5 }, (_, i) => arr[i]?.amount != null ? fmt(Number(arr[i].amount)) : '');
    return [...vals, fmt(sumObj(arr, 'amount'))];
  });
  const slotObjMemberRow = (label, getArr) => blockRow(label, s => {
    const arr = getArr(s) || [];
    const vals = Array.from({ length: 5 }, (_, i) => arr[i]?.member || '');
    return [...vals, ''];
  });
  const slotObjNameRow = (label, getArr) => blockRow(label, s => {
    const arr = getArr(s) || [];
    const vals = Array.from({ length: 5 }, (_, i) => arr[i]?.name || '');
    return [...vals, ''];
  });
  const totalOnlyRow = (label, getTotal) => blockRow(label, s => ['', '', '', '', '', fmt(getTotal(s))]);

  const d = new Date(summary.date + 'T12:00:00');
  const dayName = d.toLocaleDateString('en-CA', { weekday: 'long' });
  const dateLabel = d.toLocaleDateString('en-CA', { month: 'long', day: 'numeric', year: 'numeric' });
  // Matches the old sheet's 2-row day header exactly: day name + staff name
  // share one row, date + the 1-5/Total slot numbers share the next.
  blockRow(dayName, s => [s.staff_name || '', '', '', '', '', '']);
  blockRow(dateLabel, () => ['1', '2', '3', '4', '5', 'Total']);

  push(['PRO SHOP']);
  slotRow('Tennis Balls', s => s.pro_shop?.tennis_balls);
  slotObjAmountRow('Stringing', s => s.pro_shop?.stringing);
  slotObjMemberRow('', s => s.pro_shop?.stringing);
  slotRow('Accessories', s => s.pro_shop?.accessories);
  slotObjAmountRow('Racquet Sales', s => s.pro_shop?.racquet_sales);
  slotObjMemberRow('', s => s.pro_shop?.racquet_sales);
  slotRow('Grips', s => s.pro_shop?.grips);
  const psTotal = s => sumArr(s.pro_shop?.tennis_balls) + sumObj(s.pro_shop?.stringing, 'amount') + sumArr(s.pro_shop?.accessories) + sumObj(s.pro_shop?.racquet_sales, 'amount') + sumArr(s.pro_shop?.grips);
  totalOnlyRow('Shift Total — Pro Shop', psTotal);
  push([]);

  push(['COURT FEES']);
  const typeEntries = (s, t) => cfEntries(s).filter(e => e && e.type === t);
  slotObjAmountRow('Private Lesson Fees', s => typeEntries(s, 'lesson'));
  slotObjNameRow('', s => typeEntries(s, 'lesson'));
  slotObjAmountRow('Guests', s => typeEntries(s, 'guest'));
  slotObjNameRow('', s => typeEntries(s, 'guest'));
  slotObjAmountRow('PAYG', s => typeEntries(s, 'payg'));
  slotObjNameRow('', s => typeEntries(s, 'payg'));
  const cfTotal = s => sumByType(s, 'lesson') + sumByType(s, 'guest') + sumByType(s, 'payg');
  totalOnlyRow('Shift Total — Court Fees', cfTotal);
  push([]);

  push(['DRINKS & SNACKS']);
  slotRow('Drinks', s => s.drinks_snacks?.drinks);
  slotRow('Snacks', s => s.drinks_snacks?.snacks);
  const dsTotal = s => sumArr(s.drinks_snacks?.drinks) + sumArr(s.drinks_snacks?.snacks);
  totalOnlyRow('Shift Total — Drinks & Snacks', dsTotal);
  push([]);

  totalOnlyRow('SHIFT TOTAL', s => psTotal(s) + cfTotal(s) + dsTotal(s));
  push([]);

  push(['DAILY TOTALS']);
  push(['Pro Shop',        fmt(shifts.reduce((a, s) => a + psTotal(s), 0))]);
  push(['Court Fees',      fmt(shifts.reduce((a, s) => a + cfTotal(s), 0))]);
  push(['Drinks & Snacks', fmt(shifts.reduce((a, s) => a + dsTotal(s), 0))]);
  push(['Opening Float',   fmt(summary.opening_float != null ? summary.opening_float : 100)]);
  push(['Closing Float',   summary.closing_float != null ? fmt(summary.closing_float) : '']);
  push([]);

  // Itemized court-fee detail (any number of entries per shift — see deviation
  // #2 above) instead of forcing bookings into a fixed 2-row slot.
  const anyEntries = shifts.some(s => (cfEntries(s) || []).some(e => e.amount));
  if (anyEntries) {
    push(['— Court Fee Detail —']);
    push(['Shift', 'Type', 'Court', 'Time', 'Name', 'Amount']);
    shifts.forEach(s => {
      cfEntries(s).filter(e => e.amount).forEach(e => {
        push([s.label || '', e.type || '', e.court || '', e.time || '', e.name || e.detail || '', fmt(Number(e.amount || 0))]);
      });
    });
    push([]);
  }

  return rows;
}

function legacyRowsToCsv(rows) {
  const q = cell => `"${String(cell ?? '').replace(/"/g, '""')}"`;
  return rows.map(cells => cells.map(q).join(',')).join('\n');
}

// GET /export-legacy?date=YYYY-MM-DD — one day, old-sheet layout
router.get('/export-legacy', (req, res) => {
  const { date } = req.query;
  if (!date || !/^\d{4}-\d{2}-\d{2}$/.test(date)) return res.status(400).json({ error: 'date required (YYYY-MM-DD)' });
  const summary = db.getCashSummary(date) || legacyBlankSummary(date);
  const csv = legacyRowsToCsv(buildLegacyDayRows(summary));
  res.setHeader('Content-Type', 'text/csv');
  res.setHeader('Content-Disposition', `attachment; filename="cash-summary-legacy-${date}.csv"`);
  res.send(csv);
});

// GET /export-legacy-month?month=YYYY-MM — every day that month, same layout,
// stacked one after another (what Jaime currently builds by hand). Trio-only,
// same tier as the Monthly/Range totals views.
router.get('/export-legacy-month', requireCashTotalsAccess, (req, res) => {
  const { month } = req.query;
  if (!month || !/^\d{4}-\d{2}$/.test(month)) return res.status(400).json({ error: 'month required (YYYY-MM)' });
  const [yr, mo] = month.split('-').map(Number);
  const lastDay = new Date(yr, mo, 0).getDate();
  const monthLabel = new Date(`${month}-01T12:00:00`).toLocaleDateString('en-CA', { month: 'long', year: 'numeric' });

  const allRows = [[monthLabel], []];
  for (let day = 1; day <= lastDay; day++) {
    const date = `${month}-${String(day).padStart(2, '0')}`;
    const summary = db.getCashSummary(date) || legacyBlankSummary(date);
    allRows.push(...buildLegacyDayRows(summary));
    allRows.push([]);
  }
  const csv = legacyRowsToCsv(allRows);
  res.setHeader('Content-Type', 'text/csv');
  res.setHeader('Content-Disposition', `attachment; filename="cash-summary-legacy-${month}.csv"`);
  res.send(csv);
});

// Shared aggregator — used by both the month-to-date rollup and the arbitrary
// custom-range totals (season / year-in-review / anything in between).
function aggregateCashRange(start, end) {
  const rows  = db.getCashSummaryRange(start, end);

  const sumArr = a => (a || []).reduce((x, v) => x + (v != null ? Number(v) || 0 : 0), 0);
  const sumObj = (a, k) => (a || []).reduce((x, o) => x + (o && o[k] != null ? Number(o[k]) || 0 : 0), 0);
  const cfEntries = sh => {
    const e = sh.court_fees && sh.court_fees.entries;
    if (e) return e;
    const cf = sh.court_fees || {};   // backward-compat with the old named structure
    return [
      ...(cf.private_lessons || []).map(o => ({ type: 'lesson', ...o })),
      ...(cf.guests || []).map(o => ({ type: 'guest', ...o })),
      ...(cf.payg || []).map(o => ({ type: 'payg', ...o })),
    ];
  };

  const agg = {
    start, end, days: 0,
    pro_shop:      { tennis_balls: 0, stringing: 0, accessories: 0, racquet_sales: 0, grips: 0, total: 0 },
    court_fees:    { lessons: 0, guests: 0, payg: 0, total: 0 },
    drinks_snacks: { drinks: 0, snacks: 0, total: 0 },
    card_slips: 0, cash_sales: 0, grand_total: 0,
  };

  for (const s of rows) {
    let dayHadData = false;
    for (const sh of (s.shifts || [])) {
      const ps = sh.pro_shop || {};
      const tb = sumArr(ps.tennis_balls), str = sumObj(ps.stringing, 'amount'),
            acc = sumArr(ps.accessories), rs = sumObj(ps.racquet_sales, 'amount'), grp = sumArr(ps.grips);
      const psT = tb + str + acc + rs + grp;
      agg.pro_shop.tennis_balls += tb; agg.pro_shop.stringing += str; agg.pro_shop.accessories += acc;
      agg.pro_shop.racquet_sales += rs; agg.pro_shop.grips += grp; agg.pro_shop.total += psT;

      const ent = cfEntries(sh);
      const byType = t => ent.filter(e => e && e.type === t).reduce((x, e) => x + (Number(e.amount) || 0), 0);
      const les = byType('lesson'), gue = byType('guest'), pay = byType('payg');
      const cfT = les + gue + pay;
      agg.court_fees.lessons += les; agg.court_fees.guests += gue; agg.court_fees.payg += pay; agg.court_fees.total += cfT;

      const ds = sh.drinks_snacks || {};
      const dr = sumArr(ds.drinks), sn = sumArr(ds.snacks);
      const dsT = dr + sn;
      agg.drinks_snacks.drinks += dr; agg.drinks_snacks.snacks += sn; agg.drinks_snacks.total += dsT;

      const slips = sumArr(sh.till && sh.till.slips);
      agg.card_slips += slips;
      agg.grand_total += psT + cfT + dsT;
      if (psT + cfT + dsT + slips > 0) dayHadData = true;
    }
    if (dayHadData) agg.days += 1;
  }
  agg.cash_sales = agg.grand_total - agg.card_slips;
  return agg;
}

// GET /monthly?date=YYYY-MM-DD — month-to-date rollup (1st of that date's month → that
// date). Trio only (Craig, Jaime, Victor) — same tier as Pay Review.
router.get('/monthly', requireCashTotalsAccess, (req, res) => {
  const { date } = req.query;
  if (!date || !/^\d{4}-\d{2}-\d{2}$/.test(date)) {
    return res.status(400).json({ error: 'date required (YYYY-MM-DD)' });
  }
  const month = date.slice(0, 7);
  const agg = aggregateCashRange(`${month}-01`, date);
  agg.month = month;
  res.json(agg);
});

// GET /totals?start=YYYY-MM-DD&end=YYYY-MM-DD — arbitrary custom-range rollup (a
// season, a quarter, a full year-in-review, anything in between). Trio only.
router.get('/totals', requireCashTotalsAccess, (req, res) => {
  const { start, end } = req.query;
  if (!start || !end || !/^\d{4}-\d{2}-\d{2}$/.test(start) || !/^\d{4}-\d{2}-\d{2}$/.test(end)) {
    return res.status(400).json({ error: 'start and end required (YYYY-MM-DD)' });
  }
  if (start > end) return res.status(400).json({ error: 'start must be on or before end' });
  res.json(aggregateCashRange(start, end));
});

// GET /settings — unit prices (all staff read these to compute line amounts)
router.get('/settings', (req, res) => {
  res.json(db.getCashSettings());
});

// POST /settings — update unit prices (management only)
router.post('/settings', (req, res) => {
  const staff = db.getStaffById(req.session.staffId);
  const isMgmt = staff && ['admin', 'manager'].includes(staff.role);
  if (!isMgmt) return res.status(403).json({ error: 'Management only' });
  const result = db.setCashUnitPrices(req.body?.unit_prices || {});
  try { sse.broadcast('cash-update'); } catch (e) {}
  res.json(result);
});

module.exports = router;
