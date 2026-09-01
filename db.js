/**
 * db.js — JSON-file-based data store (no native deps)
 * Stores all data in jct-data.json next to this file.
 * When we move to Railway, this swaps out for a pg client.
 */

const fs = require('fs');
const bcrypt = require('bcryptjs');
const path = require('path');

// In production (Railway) set DATA_FILE env var to the volume mount path,
// e.g. /data/jct-data.json. Falls back to the local file for development.
const DATA_FILE = process.env.DATA_FILE || path.join(__dirname, 'jct-data.json');
const SEED_FILE = path.join(__dirname, 'seed.json');

// ─── Checklist Seed Data ─────────────────────────────────────────────────────

const CHECKLIST_SEED = [
  // MORNING — Start of Shift
  { id:1,  shifts:['morning'], phase:'start',    bold:false, days:null, order:1,  active:true, text:'Pick up voicemails from email' },
  { id:2,  shifts:['morning'], phase:'start',    bold:false, days:null, order:2,  active:true, text:'Quickly walk around courts and complete a quick inspection of the bubble' },
  { id:3,  shifts:['morning'], phase:'start',    bold:false, days:null, order:3,  active:true, text:'Confirm $100 float from previous shift & enter name and date on cash summary' },
  { id:4,  shifts:['morning'], phase:'start',    bold:false, days:null, order:4,  active:true, text:'Open all office files for the day (checklist, cash summary, comm log, etc.)' },
  { id:5,  shifts:['morning'], phase:'start',    bold:false, days:null, order:5,  active:true, text:'Make sure Member Sign-In sheet has been replaced correctly in binder' },
  { id:6,  shifts:['morning'], phase:'start',    bold:false, days:null, order:6,  active:true, text:'Clear snow and salt pathways if required' },
  { id:7,  shifts:['morning'], phase:'start',    bold:false, days:null, order:7,  active:true, text:'Disinfect High Touch Surfaces (Door Handles/Revolving Door/Counter Tops etc.)' },
  { id:8,  shifts:['morning'], phase:'start',    bold:false, days:null, order:8,  active:true, text:'Throw out trash from previous shift, if required' },
  // MORNING — During Shift
  { id:9,  shifts:['morning'], phase:'during',   bold:false, days:null, order:1,  active:true, text:'Clean and organize as required' },
  { id:10, shifts:['morning'], phase:'during',   bold:false, days:null, order:2,  active:true, text:'Empty garbages and recycling bins on court if full' },
  { id:11, shifts:['morning'], phase:'during',   bold:false, days:null, order:3,  active:true, text:'Review the communications log at least back to your last shift' },
  { id:12, shifts:['morning'], phase:'during',   bold:false, days:null, order:4,  active:true, text:'Check if any racquets have been strung, and notify members for pick-up' },
  { id:13, shifts:['morning'], phase:'during',   bold:false, days:null, order:5,  active:true, text:'Check the washroom stock — toilet paper and paper towels' },
  { id:14, shifts:['morning'], phase:'during',   bold:false, days:null, order:6,  active:true, text:'Check and restock water and snacks as needed for member purchase' },
  { id:15, shifts:['morning'], phase:'during',   bold:false, days:null, order:7,  active:true, text:'Cash summary reconciliation' },
  { id:16, shifts:['morning'], phase:'during',   bold:true,  days:null, order:8,  active:true, text:'Check email inbox regularly and respond or forward as required' },
  { id:17, shifts:['morning'], phase:'during',   bold:true,  days:null, order:9,  active:true, text:'Check voicemail regularly and return calls or forward information as necessary' },
  { id:18, shifts:['morning'], phase:'during',   bold:false, days:null, order:10, active:true, text:'Replace watercooler jug and empty overflow tray, if necessary' },
  { id:19, shifts:['morning'], phase:'during',   bold:false, days:null, order:11, active:true, text:'Check Hand Sanitizer levels and replace as necessary' },
  // BOOKINGS — all shifts
  { id:20, shifts:['morning','afternoon','closing'], phase:'bookings', bold:false, days:null, order:1, active:true, text:'Initial all booking sign-in\'s and check off corresponding names on GameTime' },
  { id:21, shifts:['morning','afternoon','closing'], phase:'bookings', bold:false, days:null, order:2, active:true, text:'Correct or complete any missing or illegible entries on the member sign in' },
  { id:22, shifts:['morning','afternoon','closing'], phase:'bookings', bold:false, days:null, order:3, active:true, text:'Enter the numbers from the member sign in on Gametime print out' },
  { id:23, shifts:['morning','afternoon','closing'], phase:'bookings', bold:false, days:null, order:4, active:true, text:'Check waitlist (on GameTime) and contact players re cancelled courts' },
  { id:24, shifts:['morning','afternoon','closing'], phase:'bookings', bold:false, days:null, order:5, active:true, text:'Record any late cancellations (within 24 hours) on the cancellation list' },
  { id:25, shifts:['morning','afternoon','closing'], phase:'bookings', bold:false, days:null, order:6, active:true, text:'Ensure Guest names are recorded on bookings (Pay as You Go: names in Notes section)' },
  // MORNING — End of Shift
  { id:26, shifts:['morning'], phase:'end',      bold:false, days:null, order:1,  active:true, text:'Print the bookings from your shift and enter the numbers from the member sign in' },
  { id:27, shifts:['morning'], phase:'end',      bold:false, days:null, order:2,  active:true, text:'Make sure the cash is balanced for your shift and all guest fees are accounted for' },
  { id:28, shifts:['morning'], phase:'end',      bold:false, days:null, order:3,  active:true, text:'Pass along any important information to the person on the next shift' },
  { id:29, shifts:['morning'], phase:'end',      bold:false, days:null, order:4,  active:true, text:'Record the hours on your time sheet' },
  // AFTERNOON — Start of Shift
  { id:30, shifts:['afternoon'], phase:'start',  bold:false, days:null, order:1,  active:true, text:'Confirm $100 float & enter name on cash summary on corresponding shift space' },
  { id:31, shifts:['afternoon'], phase:'start',  bold:false, days:null, order:2,  active:true, text:'Review any important information with the person from the previous shift' },
  { id:32, shifts:['afternoon'], phase:'start',  bold:false, days:null, order:3,  active:true, text:'Empty garbages and recycling bins if full (Club House and office)' },
  // AFTERNOON — During Shift
  { id:33, shifts:['afternoon'], phase:'during', bold:false, days:null, order:1,  active:true, text:'Clear snow and salt pathways as required' },
  { id:34, shifts:['afternoon'], phase:'during', bold:false, days:null, order:2,  active:true, text:'Clean and organize as required' },
  { id:35, shifts:['afternoon'], phase:'during', bold:false, days:null, order:3,  active:true, text:'Check the washroom stock — toilet paper and paper towels' },
  { id:36, shifts:['afternoon'], phase:'during', bold:false, days:null, order:4,  active:true, text:'Check and restock water and snacks as needed for member purchase' },
  { id:37, shifts:['afternoon'], phase:'during', bold:false, days:null, order:5,  active:true, text:'Review the communications log at least back to your last shift' },
  { id:38, shifts:['afternoon'], phase:'during', bold:true,  days:null, order:6,  active:true, text:'Check email inbox regularly and respond or forward as required' },
  { id:39, shifts:['afternoon'], phase:'during', bold:true,  days:null, order:7,  active:true, text:'Check voicemail regularly and return calls or forward information as necessary' },
  { id:40, shifts:['afternoon'], phase:'during', bold:false, days:null, order:8,  active:true, text:'Replace watercooler jug and empty overflow tray, if necessary' },
  { id:41, shifts:['afternoon'], phase:'during', bold:false, days:null, order:9,  active:true, text:'Vacuum Mats (including the one in the tunnel)' },
  { id:42, shifts:['afternoon'], phase:'during', bold:false, days:null, order:10, active:true, text:'Disinfect High Touch Surfaces (Door Handles/Revolving Door/Counter Tops etc.)' },
  { id:43, shifts:['afternoon'], phase:'during', bold:false, days:null, order:11, active:true, text:'Be aware of children in the clubhouse during academy time' },
  { id:44, shifts:['afternoon'], phase:'during', bold:false, days:null, order:12, active:true, text:'Display video from court on main TV during academy time' },
  // AFTERNOON — End of Shift
  { id:45, shifts:['afternoon'], phase:'end',    bold:false, days:null, order:1,  active:true, text:'Print the bookings from your shift and enter the numbers from the member sign in' },
  { id:46, shifts:['afternoon'], phase:'end',    bold:false, days:null, order:2,  active:true, text:'Make sure the cash is balanced for your shift and all guest fees are accounted for' },
  { id:47, shifts:['afternoon'], phase:'end',    bold:false, days:null, order:3,  active:true, text:'Pass along any important information to the person on the next shift' },
  { id:48, shifts:['afternoon'], phase:'end',    bold:false, days:null, order:4,  active:true, text:'Record the hours on your time sheet' },
  // CLOSING — Start of Shift
  { id:49, shifts:['closing'], phase:'start',    bold:false, days:null, order:1,  active:true, text:'Confirm $100 float & enter name on cash summary on corresponding shift space' },
  { id:50, shifts:['closing'], phase:'start',    bold:false, days:null, order:2,  active:true, text:'Review any important information with the person from the previous shift' },
  // CLOSING — During Shift
  { id:51, shifts:['closing'], phase:'during',   bold:false, days:null, order:1,  active:true, text:'Clear snow and salt pathways as required' },
  { id:52, shifts:['closing'], phase:'during',   bold:false, days:null, order:2,  active:true, text:'Clean and organize as required' },
  { id:53, shifts:['closing'], phase:'during',   bold:false, days:null, order:3,  active:true, text:'Review the communications log at least back to your last shift' },
  { id:54, shifts:['closing'], phase:'during',   bold:true,  days:null, order:4,  active:true, text:'Check email inbox regularly and respond or forward as required' },
  { id:55, shifts:['closing'], phase:'during',   bold:true,  days:null, order:5,  active:true, text:'Check voicemail regularly and return calls or forward information as necessary' },
  { id:56, shifts:['closing'], phase:'during',   bold:false, days:null, order:6,  active:true, text:'Check the washroom stock — toilet paper and paper towels' },
  { id:57, shifts:['closing'], phase:'during',   bold:false, days:null, order:7,  active:true, text:'Check and restock water and snacks as needed for member purchase' },
  { id:58, shifts:['closing'], phase:'during',   bold:false, days:null, order:8,  active:true, text:'Replace watercooler jug and empty overflow tray, if necessary' },
  { id:59, shifts:['closing'], phase:'during',   bold:false, days:[1,2,3,4,5,6], order:9,  active:true, text:'Check Hand Sanitizer levels and replace as necessary' },
  // CLOSING — End of Shift
  { id:60, shifts:['closing'], phase:'end',      bold:false, days:null, order:1,  active:true, text:'Staple all booking sheets and Member Sign-In sheets in order (first to last shift); place in "booking sheets" tab in filing cabinet' },
  { id:61, shifts:['closing'], phase:'end',      bold:false, days:null, order:2,  active:true, text:'Make sure the cash summary is balanced for the day and all guest fees are accounted for' },
  { id:62, shifts:['closing'], phase:'end',      bold:false, days:null, order:3,  active:true, text:'Vacuum the clubhouse including all mats, and empty vacuum dustbag' },
  { id:63, shifts:['closing'], phase:'end',      bold:false, days:null, order:4,  active:true, text:'Disinfect High Touch Surfaces (Door Handles/Revolving Door/Counter Tops etc.)' },
  { id:64, shifts:['closing'], phase:'end',      bold:false, days:null, order:5,  active:true, text:'Empty all garbages (on court, in clubhouse)' },
  { id:65, shifts:['closing'], phase:'end',      bold:false, days:null, order:6,  active:true, text:'Walk around all 6 courts — ensure no balls, cones, or equipment are left; place loose balls into appropriate baskets' },
  { id:66, shifts:['closing'], phase:'end',      bold:false, days:null, order:7,  active:true, text:'Organize ball hoppers neatly' },
  { id:67, shifts:['closing'], phase:'end',      bold:false, days:null, order:8,  active:true, text:'Record your hours on your time sheet' },
  { id:68, shifts:['closing'], phase:'end',      bold:false, days:null, order:9,  active:true, text:'Turn off court lights and clubhouse lights' },
  { id:69, shifts:['closing'], phase:'end',      bold:false, days:[1,3], order:10, active:true, text:'Input house league scores in the "results" tab of the House League file' },
  { id:70, shifts:['closing'], phase:'end',      bold:false, days:null, order:11, active:true, text:'Ensure backdoor is locked before leaving' },
  { id:71, shifts:['closing'], phase:'end',      bold:true,  days:null, order:12, active:true, text:'Close the main gates as you leave the facility' },
  // INDOOR SEASON — Bubble monitoring (added Sep 2026)
  { id:72, shifts:['morning'],   phase:'start',  bold:false, days:null, order:9,  active:true, text:'Monitor pressure / temperature and input on this sheet' },
  { id:73, shifts:['morning'],   phase:'during', bold:false, days:null, order:12, active:true, text:'Monitor Bubble system and check Bubble alerts' },
  { id:74, shifts:['afternoon'], phase:'during', bold:false, days:null, order:13, active:true, text:'Monitor pressure / temperature and input on this sheet' },
  { id:75, shifts:['afternoon'], phase:'during', bold:false, days:null, order:14, active:true, text:'Monitor Bubble system and check Bubble alerts' },
  { id:76, shifts:['closing'],   phase:'during', bold:false, days:null, order:10, active:true, text:'Monitor pressure / temperature and input on this sheet' },
  { id:77, shifts:['closing'],   phase:'during', bold:false, days:null, order:11, active:true, text:'Monitor Bubble system and check Bubble alerts' },
  // THURSDAY ONLY — washroom checklist review
  { id:78, shifts:['closing'],   phase:'end',    bold:false, days:[4],  order:13, active:true, text:'Check the washroom checklists, initial appropriate boxes, and ensure all items on the list are addressed' },
];

// ─── Load / Save ─────────────────────────────────────────────────────────────

function load() {
  // Ensure the directory exists (Railway volume may not auto-create parent dirs)
  const dir = path.dirname(DATA_FILE);
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });

  if (!fs.existsSync(DATA_FILE)) {
    // First run on a fresh volume — copy seed if available
    if (fs.existsSync(SEED_FILE)) {
      fs.copyFileSync(SEED_FILE, DATA_FILE);
      console.log('Initialized data from seed.json');
      return JSON.parse(fs.readFileSync(DATA_FILE, 'utf8'));
    }
    return null;
  }
  return JSON.parse(fs.readFileSync(DATA_FILE, 'utf8'));
}

function save() {
  fs.writeFileSync(DATA_FILE, JSON.stringify(_data, null, 2));
}

// ─── Seed data ────────────────────────────────────────────────────────────────

let _data = load();

if (!_data) {
  const pw = bcrypt.hashSync('jct2025', 10);
  _data = {
    _seq: { staff: 10, messages: 0, reads: 0, replies: 0 },
    staff: [
      { id: 1,  name: 'Craig',  color: '#6366f1', role: 'admin',   password: pw },
      { id: 2,  name: 'Jaime',  color: '#10b981', role: 'admin',   password: pw },
      { id: 3,  name: 'Victor', color: '#8b5cf6', role: 'manager', password: pw },
      { id: 4,  name: 'David',  color: '#f59e0b', role: 'manager', password: pw },
      { id: 5,  name: 'Ali',    color: '#ec4899', role: 'staff',   password: pw },
      { id: 6,  name: 'Emma',   color: '#f97316', role: 'staff',   password: pw },
      { id: 7,  name: 'Gracie', color: '#14b8a6', role: 'staff',   password: pw },
      { id: 8,  name: 'Emily',  color: '#f43f5e', role: 'staff',   password: pw },
      { id: 9,  name: 'Lily',   color: '#06b6d4', role: 'staff',   password: pw },
      { id: 10, name: 'Mia',    color: '#a78bfa', role: 'staff',   password: pw },
    ],
    messages: [],
    reads: [],    // { id, message_id, staff_id, read_at }
    replies: [],  // { id, message_id, staff_id, content, created_at }
  };
  save();
  console.log('Data store created. Default password for all: jct2025');
}

// Migration: add season 2026 staff
{
  const SEASON_STAFF = [
    { name: 'Cassandra', color: '#e11d48' },
    { name: 'Vicky',     color: '#7c3aed' },
    { name: 'Skyler',    color: '#0ea5e9' },
    { name: 'Angelina',  color: '#d946ef' },
    { name: 'Dawson',    color: '#65a30d' },
    { name: 'Emilia',    color: '#b45309' },
  ];
  const pw2026 = bcrypt.hashSync('jct2026', 10);
  let added = false;
  for (const s of SEASON_STAFF) {
    if (!_data.staff.some(x => x.name.toLowerCase() === s.name.toLowerCase())) {
      _data._seq.staff = (_data._seq.staff || 0) + 1;
      _data.staff.push({ id: _data._seq.staff, name: s.name, color: s.color, role: 'staff', password: pw2026 });
      added = true;
    }
  }
  if (added) { save(); console.log('Season 2026 staff added (password: jct2026).'); }
}

// Migration: add teaching pros (role 'pro') — Aug 2026
{
  const PRO_STAFF = [
    { name: 'Megan',   color: '#0ea5e9' },
    { name: 'Mike',    color: '#16a34a' },
    { name: 'Martin',  color: '#ca8a04' },
    { name: 'Katya',   color: '#db2777' },
    { name: 'Matthew', color: '#7c3aed' },
    { name: 'Daniel',  color: '#dc2626' },
  ];
  const pwPro = bcrypt.hashSync('jct2026', 10);
  let addedPro = false;
  for (const s of PRO_STAFF) {
    if (!_data.staff.some(x => x.name.toLowerCase() === s.name.toLowerCase())) {
      _data._seq.staff = (_data._seq.staff || 0) + 1;
      _data.staff.push({ id: _data._seq.staff, name: s.name, color: s.color, role: 'pro', password: pwPro });
      addedPro = true;
    }
  }
  if (addedPro) { save(); console.log('Teaching pros added (role: pro, password: jct2026).'); }
}

// Migration: add shift_assignments table if missing
if (!Array.isArray(_data.shift_assignments)) {
  _data._seq.shift_assignments = 0;
  _data.shift_assignments = [];
  save();
  console.log('Shift assignments table initialized.');
}

// Migration: add shift_rules table if missing
if (!Array.isArray(_data.shift_rules)) {
  _data._seq.shift_rules = 0;
  _data.shift_rules = [];
  save();
  console.log('Shift rules table initialized.');
}

// Migration: slot time overrides
if (!_data.shift_time_overrides) {
  _data.shift_time_overrides = {};
  save();
}

// Migration: shift time defaults
if (!_data.shift_defaults) {
  _data.shift_defaults = {
    morning:   { start: '08:30', end: '13:00' },
    afternoon: { start: '12:30', end: '18:00' },
    closing:   { start: '17:00', end: '21:00' },
  };
  save();
}

// Migration: timesheet entries
if (!Array.isArray(_data.timesheet_entries)) {
  _data._seq.timesheet_entries = 0;
  _data.timesheet_entries = [];
  save();
}

// Migration: period expenses (per-person per-period, not per-shift)
if (!_data.period_expenses) {
  _data.period_expenses = {};
  save();
}

// Migration: cash summaries
if (!Array.isArray(_data.cash_summaries)) {
  _data._seq.cash_summaries = 0;
  _data.cash_summaries = [];
  save();
}

// Migration: shift coverage requests
if (!Array.isArray(_data.coverage_requests)) {
  _data._seq.coverage_requests = 0;
  _data.coverage_requests = [];
  save();
}

// Migration: bubble (temperature / pressure) readings
if (!Array.isArray(_data.bubble_readings)) {
  _data._seq.bubble_readings = 0;
  _data.bubble_readings = [];
  save();
}

// Migration: add checklist tables to existing data files
if (!Array.isArray(_data.checklist_items)) {
  _data._seq.checklist_items = CHECKLIST_SEED.length;
  _data._seq.checklist_completions = 0;
  _data.checklist_items = CHECKLIST_SEED;
  _data.checklist_completions = [];
  save();
  console.log('Checklist tables initialized.');
}

// Migration: indoor season checklist updates (Sep 2026)
{
  let dirty = false;
  // Apply day filters to existing items that were seeded without them
  const dayPatches = { 59: [1,2,3,4,5,6], 69: [1,3] };
  for (const [idStr, days] of Object.entries(dayPatches)) {
    const item = _data.checklist_items.find(i => i.id === parseInt(idStr));
    if (item && item.days === null) { item.days = days; dirty = true; }
  }
  // Add new bubble-monitoring and Thursday washroom items if missing
  const newItems = CHECKLIST_SEED.filter(s => s.id >= 72);
  for (const seed of newItems) {
    if (!_data.checklist_items.find(i => i.id === seed.id)) {
      _data.checklist_items.push({ ...seed });
      _data._seq.checklist_items = Math.max(_data._seq.checklist_items || 0, seed.id);
      dirty = true;
    }
  }
  if (dirty) { save(); console.log('Indoor checklist migration applied.'); }
}

// ─── Helpers ─────────────────────────────────────────────────────────────────

function nextId(table) {
  _data._seq[table] = (_data._seq[table] || 0) + 1;
  return _data._seq[table];
}

function now() { return new Date().toISOString(); }

// ─── Staff ───────────────────────────────────────────────────────────────────

function getAllStaff() {
  return _data.staff.map(s => ({ id: s.id, name: s.name, color: s.color, role: s.role }))
    .sort((a, b) => a.name.localeCompare(b.name));
}

function getStaffById(id) {
  return _data.staff.find(s => s.id === parseInt(id));
}

// Resolve the "acting" staff id. Admins may temporarily view the hub through
// another staff member's eyes (dev / testing). Everyone else always acts as
// themselves. Returns the effective staff id to use for reads, unread counts,
// receipts, posting and replying.
function getEffectiveStaffId(realId, viewAsId) {
  const real = getStaffById(realId);
  if (real && real.role === 'admin' && viewAsId) {
    const viewed = getStaffById(viewAsId);
    if (viewed) return viewed.id;
  }
  return parseInt(realId);
}

function updatePassword(staffId, hash) {
  const s = _data.staff.find(s => s.id === parseInt(staffId));
  if (s) { s.password = hash; save(); }
}

function addStaff({ name, color, role, passwordHash }) {
  const id = nextId('staff');
  _data.staff.push({ id, name, color, role, password: passwordHash });
  save();
  return { id, name, color, role };
}

function updateStaff(staffId, { name, color, role }) {
  const s = _data.staff.find(s => s.id === parseInt(staffId));
  if (!s) return false;
  if (name  !== undefined) s.name  = name;
  if (color !== undefined) s.color = color;
  if (role  !== undefined) s.role  = role;
  save();
  return true;
}

function removeStaff(staffId) {
  const id = parseInt(staffId);
  const idx = _data.staff.findIndex(s => s.id === id);
  if (idx === -1) return false;
  _data.staff.splice(idx, 1);
  save();
  return true;
}

// ─── Messages ─────────────────────────────────────────────────────────────────

function getMessages({ limit = 30, offset = 0, staffId }) {
  const allStaff = _data.staff;
  const sorted = [..._data.messages].sort((a, b) => new Date(b.created_at) - new Date(a.created_at));
  const paged = sorted.slice(offset, offset + limit);

  return paged.map(msg => {
    const author = allStaff.find(s => s.id === msg.staff_id) || {};
    const reads = _data.reads
      .filter(r => r.message_id === msg.id)
      .map(r => {
        const rs = allStaff.find(s => s.id === r.staff_id) || {};
        return { id: rs.id, name: rs.name, color: rs.color, read_at: r.read_at };
      })
      .sort((a, b) => new Date(a.read_at) - new Date(b.read_at));

    const replies = _data.replies
      .filter(r => r.message_id === msg.id)
      .sort((a, b) => new Date(a.created_at) - new Date(b.created_at))
      .map(r => {
        const rs = allStaff.find(s => s.id === r.staff_id) || {};
        return { id: r.id, content: r.content, created_at: r.created_at, author_id: rs.id, author_name: rs.name, author_color: rs.color };
      });

    const is_read_by_me = _data.reads.some(r => r.message_id === msg.id && r.staff_id === parseInt(staffId));

    // Determine which staff to show read receipts for
    const recipients = msg.recipients || null; // null = everyone (office + management, not pros)
    const receiptStaff = recipients
      ? allStaff.filter(s => recipients.includes(s.id))
      : allStaff.filter(s => s.role !== 'pro');

    return {
      id: msg.id,
      content: msg.content,
      shift: msg.shift,
      category: msg.category || 'general',
      recipients,
      receipt_staff: receiptStaff.map(s => ({ id: s.id, name: s.name, color: s.color })),
      created_at: msg.created_at,
      show_on: msg.show_on || null,
      author_id: author.id,
      author_name: author.name,
      author_color: author.color,
      author_role: author.role,
      is_read_by_me,
      reads,
      replies,
    };
  });
}

function createMessage({ staffId, content, shift, category, recipients, show_on }) {
  const id = nextId('messages');
  const validCategories = ['membership', 'pro-shop', 'reminders', 'academy', 'general'];
  // show_on: 'YYYY-MM-DD' to surface the note on a future day, else null (shows on the day it was posted)
  const validShowOn = (typeof show_on === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(show_on)) ? show_on : null;
  // recipients: null = everyone, array of staff IDs = targeted
  const msg = {
    id,
    staff_id: parseInt(staffId),
    content,
    shift,
    category: validCategories.includes(category) ? category : 'general',
    recipients: recipients && recipients.length > 0 ? recipients.map(Number) : null,
    show_on: validShowOn,
    created_at: now()
  };
  _data.messages.push(msg);
  // Auto-mark as read by author
  markRead(id, staffId);
  save();
  return id;
}

function getMessage(id) {
  return _data.messages.find(m => m.id === parseInt(id));
}

// ─── Reads ────────────────────────────────────────────────────────────────────

function markRead(messageId, staffId) {
  const mid = parseInt(messageId), sid = parseInt(staffId);
  const exists = _data.reads.some(r => r.message_id === mid && r.staff_id === sid);
  if (!exists) {
    _data.reads.push({ id: nextId('reads'), message_id: mid, staff_id: sid, read_at: now() });
    save();
  }
}

function getUnreadCount(staffId) {
  const sid = parseInt(staffId);
  const viewer = _data.staff.find(s => s.id === sid);
  const viewerIsPro = viewer && viewer.role === 'pro';
  const t = new Date();
  const todayStr = `${t.getFullYear()}-${String(t.getMonth()+1).padStart(2,'0')}-${String(t.getDate()).padStart(2,'0')}`;
  return _data.messages.filter(msg => {
    if (msg.staff_id === sid) return false;                 // own messages don't count
    if (msg.show_on && msg.show_on > todayStr) return false; // scheduled for a future day
    const isRecipient = msg.recipients
      ? (Array.isArray(msg.recipients) && msg.recipients.includes(sid))
      : !viewerIsPro;                                        // implicit "everyone" = office + management, not pros
    if (!isRecipient) return false;                          // not relevant to this person
    return !_data.reads.some(r => r.message_id === msg.id && r.staff_id === sid);
  }).length;
}

// ─── Replies ──────────────────────────────────────────────────────────────────

function createReply({ messageId, staffId, content }) {
  const id = nextId('replies');
  _data.replies.push({ id, message_id: parseInt(messageId), staff_id: parseInt(staffId), content, created_at: now() });
  markRead(messageId, staffId);
  save();
  return id;
}

// ─── Delete / Admin ───────────────────────────────────────────────────────────

function deleteMessage(messageId) {
  const mid = parseInt(messageId);
  _data.messages  = _data.messages.filter(m => m.id !== mid);
  _data.reads     = _data.reads.filter(r => r.message_id !== mid);
  _data.replies   = _data.replies.filter(r => r.message_id !== mid);
  save();
}

function clearDay(dateStr) {
  // dateStr: 'YYYY-MM-DD' in local time
  // Use start/end of that local day as timestamps to avoid UTC getDate() mismatch
  const start = new Date(dateStr + 'T00:00:00').getTime();   // local midnight → ms
  const end   = new Date(dateStr + 'T23:59:59.999').getTime();
  const toDelete = _data.messages
    .filter(m => {
      const ts = new Date(m.created_at).getTime();
      return ts >= start && ts <= end;
    })
    .map(m => m.id);

  _data.messages = _data.messages.filter(m => !toDelete.includes(m.id));
  _data.reads    = _data.reads.filter(r => !toDelete.includes(r.message_id));
  _data.replies  = _data.replies.filter(r => !toDelete.includes(r.message_id));
  save();
  return toDelete.length;
}

// ─── Schedule ────────────────────────────────────────────────────────────────

function _expandRules(startDate, endDate) {
  // Returns Map<'date|shift', Map<staff_id, {staff_id, date, shift, is_recurring, rule_id}>>
  const slotMap = {};
  for (const rule of (_data.shift_rules || [])) {
    if (rule.end_date && rule.end_date < startDate) continue;
    if (rule.start_date > endDate) continue;
    const rangeStart = rule.start_date > startDate ? rule.start_date : startDate;
    let cur = new Date(rangeStart + 'T12:00:00');
    const last = new Date(endDate + 'T12:00:00');
    while (cur <= last) {
      const dateStr = cur.toISOString().slice(0, 10);
      if (rule.end_date && dateStr > rule.end_date) break;
      if (cur.getDay() === rule.day_of_week) {
        const key = `${dateStr}|${rule.shift}`;
        if (!slotMap[key]) slotMap[key] = new Map();
        slotMap[key].set(rule.staff_id, { staff_id: rule.staff_id, date: dateStr, shift: rule.shift, is_recurring: true, rule_id: rule.id });
      }
      cur.setDate(cur.getDate() + 1);
    }
  }
  return slotMap;
}

function getAssignmentsForRange(startDate, endDate) {
  const slotMap = _expandRules(startDate, endDate);
  // Layer one-off assignments on top (supplement, not replace)
  for (const a of _data.shift_assignments) {
    if (a.date < startDate || a.date > endDate) continue;
    const key = `${a.date}|${a.shift}`;
    if (!slotMap[key]) slotMap[key] = new Map();
    slotMap[key].set(a.staff_id, { id: a.id, staff_id: a.staff_id, date: a.date, shift: a.shift, is_recurring: false });
  }
  const results = [];
  for (const [key, staffMap] of Object.entries(slotMap)) {
    const [date, shift] = key.split('|');
    for (const [, info] of staffMap) {
      const s = _data.staff.find(x => x.id === info.staff_id) || {};
      results.push({ ...info, date, shift, staff_name: s.name, staff_color: s.color, staff_role: s.role });
    }
  }
  return results;
}

function getAssignmentsForShift(date, shift) {
  const slotMap = _expandRules(date, date);
  for (const a of _data.shift_assignments.filter(a => a.date === date && a.shift === shift)) {
    const key = `${date}|${shift}`;
    if (!slotMap[key]) slotMap[key] = new Map();
    slotMap[key].set(a.staff_id, { id: a.id, staff_id: a.staff_id, date, shift, is_recurring: false });
  }
  const key = `${date}|${shift}`;
  if (!slotMap[key]) return [];
  return [...slotMap[key].values()].map(info => {
    const s = _data.staff.find(x => x.id === info.staff_id) || {};
    return { ...info, staff_name: s.name, staff_color: s.color };
  });
}

function setShiftAssignments({ date, shift, staffIds, createdBy }) {
  _data.shift_assignments = _data.shift_assignments.filter(
    a => !(a.date === date && a.shift === shift)
  );
  const unique = [...new Set((staffIds || []).map(Number))];
  for (const sid of unique) {
    _data.shift_assignments.push({
      id: nextId('shift_assignments'),
      staff_id: sid, date, shift,
      created_by: parseInt(createdBy),
      created_at: now(),
    });
  }
  save();
}

function addShiftRule({ staffId, shift, dayOfWeek, startDate, endDate, createdBy }) {
  const id = nextId('shift_rules');
  _data.shift_rules.push({
    id,
    staff_id: parseInt(staffId),
    shift,
    day_of_week: parseInt(dayOfWeek),
    start_date: startDate,
    end_date: endDate || null,
    created_by: parseInt(createdBy),
    created_at: now(),
  });
  save();
  return id;
}

function deleteShiftRule(id) {
  _data.shift_rules = _data.shift_rules.filter(r => r.id !== parseInt(id));
  save();
}

function getShiftRules() {
  return _data.shift_rules.map(r => {
    const s = _data.staff.find(x => x.id === r.staff_id) || {};
    return { ...r, staff_name: s.name, staff_color: s.color };
  });
}

// ─── Checklist ───────────────────────────────────────────────────────────────

const PHASE_ORDER = { start: 0, during: 1, bookings: 2, end: 3 };

function getChecklistItems(shift, date) {
  const dateStr = date || new Date().toISOString().slice(0, 10);
  const d = new Date(dateStr + 'T12:00:00');
  const dow = d.getDay();

  const items = _data.checklist_items
    .filter(i => i.active && i.shifts.includes(shift))
    .filter(i => !i.days || i.days.includes(dow))
    .sort((a, b) => {
      const pd = (PHASE_ORDER[a.phase] ?? 9) - (PHASE_ORDER[b.phase] ?? 9);
      return pd !== 0 ? pd : a.order - b.order;
    });

  return items.map(item => {
    const c = _data.checklist_completions.find(
      x => x.item_id === item.id && x.shift === shift && x.date === dateStr
    );
    const s = c ? _data.staff.find(x => x.id === c.staff_id) : null;
    return {
      ...item,
      status: c ? c.status : 'pending',
      note: c ? c.note : null,
      completed_at: c ? c.completed_at : null,
      completed_by_id: s ? s.id : null,
      completed_by_name: s ? s.name : null,
      completed_by_color: s ? s.color : null,
    };
  });
}

function getChecklistProgress(shift, date) {
  const items = getChecklistItems(shift, date);
  const complete     = items.filter(i => i.status === 'complete').length;
  const not_required = items.filter(i => i.status === 'not_required').length;
  return { total: items.length, complete, not_required, pending: items.length - complete - not_required };
}

function completeChecklistItem({ itemId, staffId, shift, date, status, note }) {
  const iid = parseInt(itemId);
  if (!_data.checklist_items.find(i => i.id === iid)) return false;
  const exists = _data.checklist_completions.find(
    c => c.item_id === iid && c.shift === shift && c.date === date
  );
  if (exists) return false; // one-way lock
  _data.checklist_completions.push({
    id: nextId('checklist_completions'),
    item_id: iid,
    staff_id: parseInt(staffId),
    shift,
    date,
    status: ['complete', 'not_required'].includes(status) ? status : 'complete',
    note: note ? String(note).slice(0, 500) : null,
    completed_at: now(),
  });
  save();
  return true;
}

function resetChecklistItem({ itemId, shift, date }) {
  const iid = parseInt(itemId);
  _data.checklist_completions = _data.checklist_completions.filter(
    c => !(c.item_id === iid && c.shift === shift && c.date === date)
  );
  save();
}

function addChecklistItem({ shifts, phase, text, bold, days, order }) {
  const id = nextId('checklist_items');
  const item = {
    id,
    shifts: Array.isArray(shifts) ? shifts : [shifts],
    phase: PHASE_ORDER[phase] !== undefined ? phase : 'during',
    text: String(text || '').trim(),
    bold: Boolean(bold),
    days: Array.isArray(days) && days.length ? days.map(Number) : null,
    order: parseInt(order) || 99,
    active: true,
  };
  _data.checklist_items.push(item);
  save();
  return item;
}

function updateChecklistItem(id, fields) {
  const item = _data.checklist_items.find(i => i.id === parseInt(id));
  if (!item) return false;
  if (fields.shifts !== undefined) item.shifts = Array.isArray(fields.shifts) ? fields.shifts : [fields.shifts];
  if (fields.phase  !== undefined) item.phase  = fields.phase;
  if (fields.text   !== undefined) item.text   = String(fields.text).trim();
  if (fields.bold   !== undefined) item.bold   = Boolean(fields.bold);
  if (fields.days   !== undefined) item.days   = Array.isArray(fields.days) && fields.days.length ? fields.days.map(Number) : null;
  if (fields.order  !== undefined) item.order  = parseInt(fields.order);
  save();
  return true;
}

function toggleChecklistItem(id) {
  const item = _data.checklist_items.find(i => i.id === parseInt(id));
  if (!item) return false;
  item.active = !item.active;
  save();
  return true;
}

// ─── Slot time overrides ──────────────────────────────────────────────────────

function getShiftTimeOverride(date, shift) {
  return _data.shift_time_overrides[`${date}:${shift}`] || null;
}

function setShiftTimeOverride(date, shift, start, end) {
  _data.shift_time_overrides[`${date}:${shift}`] = { start, end };
  save();
}

function clearShiftTimeOverride(date, shift) {
  delete _data.shift_time_overrides[`${date}:${shift}`];
  save();
}

function getTimeOverridesForRange(startDate, endDate) {
  const result = {};
  for (const [key, val] of Object.entries(_data.shift_time_overrides || {})) {
    const date = key.split(':')[0];
    if (date >= startDate && date <= endDate) result[key] = val;
  }
  return result;
}

// ─── Timesheet ────────────────────────────────────────────────────────────────

function getShiftDefaults() {
  return _data.shift_defaults;
}

function setShiftDefault(shift, startTime, endTime) {
  if (!_data.shift_defaults[shift]) return;
  _data.shift_defaults[shift] = { start: startTime, end: endTime };
  save();
}

function getTimesheetForRange(startDate, endDate) {
  return _data.timesheet_entries
    .filter(e => e.date >= startDate && e.date <= endDate)
    .map(e => {
      const s = getStaffById(e.staff_id);
      return { ...e, staff_name: s ? s.name : 'Unknown', staff_color: s ? s.color : '#999' };
    });
}

function upsertTimesheetEntry({ staffId, date, shift, actualStart, actualEnd, expenses, notes, updatedBy }) {
  const existing = _data.timesheet_entries.find(
    e => e.staff_id === staffId && e.date === date && e.shift === shift
  );
  const expVal = (expenses != null && expenses !== '') ? parseFloat(expenses) : null;
  if (existing) {
    existing.actual_start = actualStart || null;
    existing.actual_end   = actualEnd   || null;
    existing.expenses     = expVal;
    existing.notes        = notes || '';
    existing.updated_by   = updatedBy;
    existing.updated_at   = now();
  } else {
    _data.timesheet_entries.push({
      id: nextId('timesheet_entries'),
      staff_id:     staffId,
      date,
      shift,
      actual_start: actualStart || null,
      actual_end:   actualEnd   || null,
      expenses:     expVal,
      notes:        notes || '',
      created_by:   updatedBy,
      updated_by:   updatedBy,
      updated_at:   now(),
    });
  }
  save();
}

function deleteTimesheetEntry(id) {
  const idx = _data.timesheet_entries.findIndex(e => e.id === parseInt(id));
  if (idx !== -1) { _data.timesheet_entries.splice(idx, 1); save(); }
}

// ─── Period Expenses ──────────────────────────────────────────────────────────

function getPeriodExpenses(staffId, periodStart) {
  return _data.period_expenses[`${staffId}:${periodStart}`] ?? null;
}

function setPeriodExpenses(staffId, periodStart, amount) {
  const key = `${staffId}:${periodStart}`;
  const val = parseFloat(amount);
  if (amount === null || amount === '' || isNaN(val) || val === 0) {
    delete _data.period_expenses[key];
  } else {
    _data.period_expenses[key] = val;
  }
  save();
}

function getPeriodExpensesForRange(periodStart) {
  const result = {};
  for (const [key, val] of Object.entries(_data.period_expenses || {})) {
    const [sid, ps] = key.split(':');
    if (ps === periodStart) result[parseInt(sid)] = val;
  }
  return result;
}

// ─── Cash Summary ─────────────────────────────────────────────────────────────

const CASH_SHIFT_LABELS = ['Morning', 'Afternoon', 'Closing', 'Extended'];
const CASH_DENOM_KEYS   = ['100','50','20','10','5','2','1','025','010','005'];

function _blankCashShift(index) {
  return {
    index,
    label: CASH_SHIFT_LABELS[index] || `Shift ${index + 1}`,
    staff_name: '',
    pro_shop: {
      tennis_balls: [null,null,null,null,null],
      stringing:    Array.from({length:5}, () => ({ amount: null, member: '' })),
      accessories:  [null,null,null,null,null],
      racquet_sales:Array.from({length:5}, () => ({ amount: null, member: '' })),
      grips:        [null,null,null,null,null],
    },
    court_fees: { entries: [] },
    drinks_snacks: {
      drinks: [null,null,null,null,null],
      snacks: [null,null,null,null,null],
    },
    till: {
      cash:  Object.fromEntries(CASH_DENOM_KEYS.map(k => [k, 0])),
      slips: Array(10).fill(null),
    },
  };
}

function getCashSummary(date) {
  if (!Array.isArray(_data.cash_summaries)) return null;
  return _data.cash_summaries.find(s => s.date === date) || null;
}

function upsertCashSummary({ date, openingFloat, closingFloat, shifts, updatedBy }) {
  if (!Array.isArray(_data.cash_summaries)) {
    _data._seq.cash_summaries = 0;
    _data.cash_summaries = [];
  }
  const existing = _data.cash_summaries.find(s => s.date === date);
  if (existing) {
    if (openingFloat !== undefined && openingFloat !== null) existing.opening_float = parseFloat(openingFloat);
    if (closingFloat !== undefined) existing.closing_float = closingFloat !== null ? parseFloat(closingFloat) : null;
    if (shifts !== undefined) existing.shifts = shifts;
    existing.updated_by = updatedBy;
    existing.updated_at = now();
  } else {
    _data.cash_summaries.push({
      id: nextId('cash_summaries'),
      date,
      opening_float:  openingFloat !== undefined ? parseFloat(openingFloat) : 100,
      closing_float:  closingFloat !== undefined && closingFloat !== null ? parseFloat(closingFloat) : null,
      shifts:         shifts || CASH_SHIFT_LABELS.map((_, i) => _blankCashShift(i)),
      updated_by:     updatedBy,
      updated_at:     now(),
    });
  }
  save();
  return _data.cash_summaries.find(s => s.date === date);
}

function getCashSummaryRange(startDate, endDate) {
  if (!Array.isArray(_data.cash_summaries)) return [];
  return _data.cash_summaries
    .filter(s => s.date >= startDate && s.date <= endDate)
    .sort((a, b) => a.date.localeCompare(b.date));
}

// ─── Shift coverage ────────────────────────────────────────────────────────────

function getCoverageRequests() {
  const nowMs = Date.now();
  const keepMs = 3 * 24 * 60 * 60 * 1000; // resolved requests linger 3 days
  return (_data.coverage_requests || [])
    .filter(r => r.status === 'open' || (r.status === 'covered' && (nowMs - new Date(r.covered_at || r.created_at).getTime()) < keepMs))
    .map(r => {
      const req = getStaffById(r.staff_id) || {};
      const cov = r.covered_by ? getStaffById(r.covered_by) : null;
      return {
        ...r,
        requester_name:  req.name,
        requester_color: req.color,
        coverer_name:  cov ? cov.name  : null,
        coverer_color: cov ? cov.color : null,
      };
    })
    .sort((a, b) => {
      if (a.status !== b.status) return a.status === 'open' ? -1 : 1;
      return (a.date + a.shift).localeCompare(b.date + b.shift);
    });
}

function createCoverageRequest({ staffId, date, shift, reason }) {
  const id = nextId('coverage_requests');
  _data.coverage_requests.push({
    id,
    staff_id:   parseInt(staffId),
    date,
    shift,
    reason:     reason ? String(reason).slice(0, 300) : '',
    status:     'open',
    covered_by: null,
    covered_at: null,
    created_at: now(),
  });
  save();
  return id;
}

function coverCoverageRequest(id, staffId) {
  const r = _data.coverage_requests.find(x => x.id === parseInt(id));
  if (!r || r.status !== 'open') return false;
  r.status = 'covered';
  r.covered_by = parseInt(staffId);
  r.covered_at = now();
  save();
  return true;
}

function cancelCoverageRequest(id, staffId, isAdmin) {
  const r = _data.coverage_requests.find(x => x.id === parseInt(id));
  if (!r) return false;
  if (r.staff_id !== parseInt(staffId) && !isAdmin) return false;
  r.status = 'cancelled';
  save();
  return true;
}

// ─── Bubble (temperature / pressure) readings ──────────────────────────────────

function getBubbleReadings(limit = 50) {
  return (_data.bubble_readings || [])
    .slice()
    .sort((a, b) => new Date(b.created_at) - new Date(a.created_at))
    .slice(0, limit)
    .map(r => {
      const s = getStaffById(r.staff_id) || {};
      return { ...r, staff_name: s.name, staff_color: s.color };
    });
}

function createBubbleReading({ staffId, temperature, pressure, note }) {
  const id = nextId('bubble_readings');
  const num = v => (v !== '' && v != null && !isNaN(parseFloat(v))) ? parseFloat(v) : null;
  _data.bubble_readings.push({
    id,
    staff_id:    parseInt(staffId),
    temperature: num(temperature),
    pressure:    num(pressure),
    note:        note ? String(note).slice(0, 300) : '',
    created_at:  now(),
  });
  save();
  return id;
}

// ─── Exports ──────────────────────────────────────────────────────────────────

module.exports = {
  getBubbleReadings,
  createBubbleReading,
  getCoverageRequests,
  createCoverageRequest,
  coverCoverageRequest,
  cancelCoverageRequest,
  getAllStaff,
  getStaffById,
  getEffectiveStaffId,
  updatePassword,
  addStaff,
  updateStaff,
  removeStaff,
  getMessages,
  createMessage,
  getMessage,
  markRead,
  getUnreadCount,
  createReply,
  deleteMessage,
  clearDay,
  getAssignmentsForRange,
  getAssignmentsForShift,
  setShiftAssignments,
  addShiftRule,
  deleteShiftRule,
  getShiftRules,
  getChecklistItems,
  getChecklistProgress,
  completeChecklistItem,
  resetChecklistItem,
  addChecklistItem,
  updateChecklistItem,
  toggleChecklistItem,
  getShiftTimeOverride,
  setShiftTimeOverride,
  clearShiftTimeOverride,
  getTimeOverridesForRange,
  getShiftDefaults,
  setShiftDefault,
  getTimesheetForRange,
  upsertTimesheetEntry,
  deleteTimesheetEntry,
  getPeriodExpenses,
  setPeriodExpenses,
  getPeriodExpensesForRange,
  getCashSummary,
  upsertCashSummary,
  getCashSummaryRange,
};
