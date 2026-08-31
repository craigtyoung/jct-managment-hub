const express = require('express');
const db      = require('../db');
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
  res.json(result);
});

// GET /range?start=YYYY-MM-DD&end=YYYY-MM-DD
router.get('/range', (req, res) => {
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

module.exports = router;
