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

// ─── Academy Class Seed (Indoor 2026/27) ────────────────────────────────────
// Seeded from the "Indoor Academy Pricing and Availability" sheet. Availability
// normalized: sheet "Yes" → "Open". Junior classes only for now; adult classes
// can be added in-app or appended here later. Classes stay editable in the hub.
const ACADEMY_CLASS_SEED = [
  // Future Stars (5–7, young beginner)
  { program:'Future Stars', day_time:'Mondays 5:30–6:30 PM',  age:'5–7', cost:659, availability:'Full',    duration:'60 min', num_classes:26, start_date:'Sept 14' },
  { program:'Future Stars', day_time:'Tuesdays 4:30–5:30 PM', age:'5–7', cost:736, availability:'Open',    duration:'60 min', num_classes:29, start_date:'Sept 8'  },
  { program:'Future Stars', day_time:'Saturdays 9–10 AM',     age:'5–7', cost:736, availability:'Limited', duration:'60 min', num_classes:29, start_date:'Sept 12' },
  { program:'Future Stars', day_time:'Sundays 9–10 AM',       age:'5–7', cost:711, availability:'Open',    duration:'60 min', num_classes:28, start_date:'Sept 13' },
  // Future Stars Plus (5–7, both days required)
  { program:'Future Stars Plus', day_time:'Mon + Wed 6:30–7:30 PM', age:'5–7', cost:1510, availability:'Open', duration:'60 min', num_classes:55, start_date:'Sept 9' },
  // Bronze / Rising Stars (beginner → intermediate)
  { program:'Bronze (Rising Stars)', day_time:'Mondays 4:30–5:30 PM',   age:'7–9',   cost:707, availability:'Limited', duration:'60 min', num_classes:26, start_date:'Sept 14' },
  { program:'Bronze (Rising Stars)', day_time:'Wednesdays 4:30–5:30 PM', age:'7–9',   cost:788, availability:'Full',    duration:'60 min', num_classes:29, start_date:'Sept 9'  },
  { program:'Bronze (Rising Stars)', day_time:'Wednesdays 5:30–6:30 PM', age:'7–9',   cost:788, availability:'Full',    duration:'60 min', num_classes:29, start_date:'Sept 9'  },
  { program:'Bronze (Rising Stars)', day_time:'Fridays 5:30–6:30 PM',    age:'7–9',   cost:760, availability:'Full',    duration:'60 min', num_classes:28, start_date:'Sept 11' },
  { program:'Bronze (Rising Stars)', day_time:'Saturdays 9–10 AM',       age:'7–9',   cost:788, availability:'Full',    duration:'60 min', num_classes:29, start_date:'Sept 12' },
  { program:'Bronze (Rising Stars)', day_time:'Saturdays 10–11 AM',      age:'10–12', cost:822, availability:'Full',    duration:'60 min', num_classes:29, start_date:'Sept 12' },
  { program:'Bronze (Rising Stars)', day_time:'Saturdays 12–1 PM',       age:'13+',   cost:822, availability:'Limited', duration:'60 min', num_classes:29, start_date:'Sept 12' },
  { program:'Bronze (Rising Stars)', day_time:'Sundays 10–11 AM',        age:'7–9',   cost:760, availability:'Full',    duration:'60 min', num_classes:28, start_date:'Sept 13' },
  { program:'Bronze (Rising Stars)', day_time:'Sundays 11 AM–12 PM',     age:'10–12', cost:796, availability:'Full',    duration:'60 min', num_classes:28, start_date:'Sept 13' },
  // Silver / Shooting Stars (intermediate)
  { program:'Silver (Shooting Stars)', day_time:'Fridays 4:30–5:30 PM', age:'7–9',   cost:820, availability:'Full',    duration:'60 min', num_classes:28, start_date:'Sept 11' },
  { program:'Silver (Shooting Stars)', day_time:'Fridays 4:30–5:30 PM', age:'10–12', cost:820, availability:'Full',    duration:'60 min', num_classes:28, start_date:'Sept 11' },
  { program:'Silver (Shooting Stars)', day_time:'Fridays 6:30–7:30 PM', age:'13+',   cost:820, availability:'Full',    duration:'60 min', num_classes:28, start_date:'Sept 11' },
  { program:'Silver (Shooting Stars)', day_time:'Saturdays 11 AM–12 PM', age:'7–9',   cost:849, availability:'Full',    duration:'60 min', num_classes:29, start_date:'Sept 12' },
  { program:'Silver (Shooting Stars)', day_time:'Saturdays 11 AM–12 PM', age:'10–12', cost:849, availability:'Full',    duration:'60 min', num_classes:29, start_date:'Sept 12' },
  { program:'Silver (Shooting Stars)', day_time:'Saturdays 11 AM–12 PM', age:'13+',   cost:849, availability:'Limited', duration:'60 min', num_classes:29, start_date:'Sept 12' },
  { program:'Silver (Shooting Stars)', day_time:'Saturdays 12–1 PM',     age:'7–9',   cost:849, availability:'Full',    duration:'60 min', num_classes:29, start_date:'Sept 12' },
  { program:'Silver (Shooting Stars)', day_time:'Saturdays 12–1 PM',     age:'10–12', cost:849, availability:'Full',    duration:'60 min', num_classes:29, start_date:'Sept 12' },
  { program:'Silver (Shooting Stars)', day_time:'Sundays 9–10 AM',       age:'7–9',   cost:820, availability:'Full',    duration:'60 min', num_classes:28, start_date:'Sept 13' },
  { program:'Silver (Shooting Stars)', day_time:'Sundays 12–1 PM',       age:'10–12', cost:820, availability:'Full',    duration:'60 min', num_classes:28, start_date:'Sept 13' },
  { program:'Silver (Shooting Stars)', day_time:'Sundays 1–2 PM',        age:'13+',   cost:820, availability:'Full',    duration:'60 min', num_classes:28, start_date:'Sept 13' },
  // Gold (advanced)
  { program:'Gold', day_time:'Tuesdays 4:30–6 PM',   age:'12–16', cost:1365, availability:'Full', duration:'90 min', num_classes:29, start_date:'Sept 8'  },
  { program:'Gold', day_time:'Wednesdays 6–7:30 PM', age:'12–16', cost:1365, availability:'Full', duration:'90 min', num_classes:29, start_date:'Sept 9'  },
  { program:'Gold', day_time:'Saturdays 1–2:30 PM',  age:'12–16', cost:1365, availability:'Full', duration:'90 min', num_classes:29, start_date:'Sept 12' },
];

// Adult classes (Indoor 2026/27, Session #1 / fall). category:'adult'. Winter
// Session #2 is tracked separately at the club; this seeds the current season.
const ACADEMY_ADULT_SEED = [
  // Adult Introductory
  { program:'Adult Introductory', day_time:'Mondays 11 AM–12:30 PM',   cost:538, availability:'Full',    duration:'90 min', num_classes:13, start_date:'Sept 14', category:'adult' },
  { program:'Adult Introductory', day_time:'Wednesdays 10:30 AM–12 PM', cost:620, availability:'Full',    duration:'90 min', num_classes:15, start_date:'Sept 9',  category:'adult' },
  { program:'Adult Introductory', day_time:'Thursdays 8:30–9:30 PM',    cost:449, availability:'Full',    duration:'60 min', num_classes:15, start_date:'Sept 10', category:'adult' },
  { program:'Adult Introductory', day_time:'Fridays 9–10:30 AM',        cost:620, availability:'Open',    duration:'90 min', num_classes:15, start_date:'Sept 11', category:'adult' },
  { program:'Adult Introductory', day_time:'Saturdays 9–10 AM',         cost:449, availability:'Full',    duration:'60 min', num_classes:15, start_date:'Sept 12', category:'adult' },
  { program:'Adult Introductory', day_time:'Sundays 10–11 AM',          cost:449, availability:'Full',    duration:'60 min', num_classes:15, start_date:'Sept 13', category:'adult' },
  // Adult Intermediate
  { program:'Adult Intermediate', day_time:'Mondays 11 AM–12:30 PM',    cost:538, availability:'Full', duration:'90 min', num_classes:13, start_date:'Sept 14', category:'adult' },
  { program:'Adult Intermediate', day_time:'Mondays 6–7:30 PM',         cost:538, availability:'Full', duration:'90 min', num_classes:13, start_date:'Sept 14', category:'adult' },
  { program:'Adult Intermediate', day_time:'Tuesdays 9:30–11 AM',       cost:620, availability:'Full', duration:'90 min', num_classes:15, start_date:'Sept 8',  category:'adult' },
  { program:'Adult Intermediate', day_time:'Wednesdays 9–10:30 AM',     cost:620, availability:'Full', duration:'90 min', num_classes:15, start_date:'Sept 9',  category:'adult' },
  { program:'Adult Intermediate', day_time:'Wednesdays 10:30 AM–12 PM', cost:620, availability:'Full', duration:'90 min', num_classes:15, start_date:'Sept 9',  category:'adult' },
  { program:'Adult Intermediate', day_time:'Thursdays 7:30–8:30 PM',    cost:449, availability:'Full', duration:'60 min', num_classes:15, start_date:'Sept 10', category:'adult' },
  { program:'Adult Intermediate', day_time:'Fridays 10:30 AM–12 PM',    cost:620, availability:'Full', duration:'90 min', num_classes:15, start_date:'Sept 11', category:'adult' },
  { program:'Adult Intermediate', day_time:'Saturdays 10–11 AM',        cost:449, availability:'Full', duration:'60 min', num_classes:15, start_date:'Sept 12', category:'adult' },
  { program:'Adult Intermediate', day_time:'Saturdays 12–1 PM',         cost:449, availability:'Full', duration:'60 min', num_classes:15, start_date:'Sept 12', category:'adult' },
  { program:'Adult Intermediate', day_time:'Sundays 11 AM–12 PM',       cost:449, availability:'Full', duration:'60 min', num_classes:15, start_date:'Sept 13', category:'adult' },
  { program:'Adult Intermediate', day_time:'Sundays 1–2 PM',            cost:449, availability:'Full', duration:'60 min', num_classes:15, start_date:'Sept 13', category:'adult' },
  // Adult Intermediate Plus (* = invite-only, max 4)
  { program:'Adult Intermediate Plus', day_time:'Tuesdays 11 AM–12:30 PM (invite, low ratio)', cost:736, availability:'Full', duration:'90 min', num_classes:15, start_date:'Sept 8',  category:'adult' },
  { program:'Adult Intermediate Plus', day_time:'Tuesdays 7:30–9 PM',                          cost:620, availability:'Full', duration:'90 min', num_classes:15, start_date:'Sept 8',  category:'adult' },
  { program:'Adult Intermediate Plus', day_time:'Thursdays 9:30–11 AM (invite, low ratio)',    cost:736, availability:'Full', duration:'90 min', num_classes:15, start_date:'Sept 10', category:'adult' },
  { program:'Adult Intermediate Plus', day_time:'Fridays 12–1:30 PM (invite, low ratio)',      cost:736, availability:'Full', duration:'90 min', num_classes:15, start_date:'Sept 11', category:'adult' },
  { program:'Adult Intermediate Plus', day_time:'Fridays 6–7:30 PM',                           cost:620, availability:'Full', duration:'90 min', num_classes:15, start_date:'Sept 11', category:'adult' },
  { program:'Adult Intermediate Plus', day_time:'Saturdays 2:30–4 PM',                         cost:620, availability:'Full', duration:'90 min', num_classes:15, start_date:'Sept 12', category:'adult' },
  // Advanced (invitation only)
  { program:'Advanced (Invitation Only)', day_time:'Tuesdays 7:30–9 PM', cost:620, availability:'Full', duration:'90 min', num_classes:15, start_date:'Sept 8', category:'adult' },
  // Cardio Tennis
  { program:'Cardio Tennis', day_time:'Mondays 9:30–11 AM',       cost:538, availability:'Limited', duration:'90 min', num_classes:13, start_date:'Sept 14', category:'adult' },
  { program:'Cardio Tennis', day_time:'Thursdays 11 AM–12:30 PM', cost:620, availability:'Limited', duration:'90 min', num_classes:15, start_date:'Sept 10', category:'adult' },
  { program:'Cardio Tennis', day_time:'Thursdays 8:30–9:30 PM',   cost:449, availability:'Full',    duration:'60 min', num_classes:15, start_date:'Sept 10', category:'adult' },
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
  const pw = bcrypt.hashSync('jct2026', 10);
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
  console.log('Data store created. Default password for all: jct2026');
}

// One-time migration flags so seed migrations never re-add deleted staff on reboot.
_data._migrations = _data._migrations || {};

// Migration: add season 2026 staff — runs ONCE. If any of these already exist,
// the migration is treated as already-run and only its flag is set (so a staffer
// deleted via the directory is not resurrected on the next deploy).
if (!_data._migrations.season2026) {
  const SEASON_STAFF = [
    { name: 'Cassandra', color: '#e11d48' },
    { name: 'Vicky',     color: '#7c3aed' },
    { name: 'Skyler',    color: '#0ea5e9' },
    { name: 'Angelina',  color: '#d946ef' },
    { name: 'Dawson',    color: '#65a30d' },
    { name: 'Emilia',    color: '#b45309' },
  ];
  const pw2026 = bcrypt.hashSync('jct2026', 10);
  const anyPresent = SEASON_STAFF.some(s => _data.staff.some(x => x.name.toLowerCase() === s.name.toLowerCase()));
  let added = false;
  if (!anyPresent) {
    for (const s of SEASON_STAFF) {
      _data._seq.staff = (_data._seq.staff || 0) + 1;
      _data.staff.push({ id: _data._seq.staff, name: s.name, color: s.color, role: 'staff', password: pw2026 });
      added = true;
    }
  }
  _data._migrations.season2026 = true;
  save();
  if (added) console.log('Season 2026 staff added (password: jct2026).');
}

// Migration: add teaching pros (role 'pro') — Aug 2026 — runs ONCE (same guard).
if (!_data._migrations.pros2026) {
  const PRO_STAFF = [
    { name: 'Megan',   color: '#0ea5e9' },
    { name: 'Mike',    color: '#16a34a' },
    { name: 'Martin',  color: '#ca8a04' },
    { name: 'Katya',   color: '#db2777' },
    { name: 'Matthew', color: '#7c3aed' },
    { name: 'Daniel',  color: '#dc2626' },
  ];
  const pwPro = bcrypt.hashSync('jct2026', 10);
  const anyPresent = PRO_STAFF.some(s => _data.staff.some(x => x.name.toLowerCase() === s.name.toLowerCase()));
  let addedPro = false;
  if (!anyPresent) {
    for (const s of PRO_STAFF) {
      _data._seq.staff = (_data._seq.staff || 0) + 1;
      _data.staff.push({ id: _data._seq.staff, name: s.name, color: s.color, role: 'pro', password: pwPro });
      addedPro = true;
    }
  }
  _data._migrations.pros2026 = true;
  save();
  if (addedPro) console.log('Teaching pros added (role: pro, password: jct2026).');
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

// Migration: add shift_skips table if missing.
// A skip removes ONE occurrence of a recurring rule for a given date+shift+staff,
// without deleting the rule itself (the "she didn't work this morning" case).
if (!Array.isArray(_data.shift_skips)) {
  _data._seq.shift_skips = 0;
  _data.shift_skips = [];
  save();
  console.log('Shift skips table initialized.');
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

// Migration: waitlist / open-spots board (the digital replacement for the printed
// cancellation sheet). spots = the open seats; updates = the shared chain of comms.
if (!Array.isArray(_data.waitlist_spots)) {
  _data._seq.waitlist_spots = 0;
  _data.waitlist_spots = [];
  save();
}
if (!Array.isArray(_data.waitlist_updates)) {
  _data._seq.waitlist_updates = 0;
  _data.waitlist_updates = [];
  save();
}
if (!Array.isArray(_data.string_logs)) {
  _data._seq.string_logs = 0;
  _data.string_logs = [];
  save();
}

// Migration: knowledge base — club docs (rules, pricing, membership, FAQs) the AI
// assistant reads so it can answer staff questions accurately.
if (!Array.isArray(_data.knowledge_docs)) {
  _data._seq.knowledge_docs = 0;
  _data.knowledge_docs = [];
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

// Migration: maintenance contractor (Muzz) — Sep 2026
{
  const pwC = bcrypt.hashSync('jct2026', 10);
  if (!_data.staff.some(x => x.name.toLowerCase() === 'muzz')) {
    _data._seq.staff = (_data._seq.staff || 0) + 1;
    _data.staff.push({ id: _data._seq.staff, name: 'Muzz', color: '#0d9488', role: 'contractor', badge: 'M', password: pwC });
    save();
    console.log('Contractor Muzz added (role: contractor, password: jct2026).');
  }
}

// Migration: contractor tables (independent-contractor work log, expenses, project pitches)
if (!Array.isArray(_data.contractor_work)) {
  _data._seq.contractor_work = 0;
  _data.contractor_work = [];
  save();
}
if (!Array.isArray(_data.contractor_expenses)) {
  _data._seq.contractor_expenses = 0;
  _data.contractor_expenses = [];
  save();
}
if (!Array.isArray(_data.contractor_projects)) {
  _data._seq.contractor_projects = 0;
  _data.contractor_projects = [];
  save();
}
// Hours the contractor logs for their OWN subcontractors (JCT pays them directly)
if (!Array.isArray(_data.contractor_sub_work)) {
  _data._seq.contractor_sub_work = 0;
  _data.contractor_sub_work = [];
  save();
}

// Migration: receipt photos attached to staff period-expenses
if (!_data.period_receipts) {
  _data.period_receipts = {};
  save();
}

// Migration: rename the 'reminders' comms category to 'maintenance' (Sep 2026)
{
  let changed = false;
  for (const m of (_data.messages || [])) {
    if (m.category === 'reminders') { m.category = 'maintenance'; changed = true; }
  }
  if (changed) { save(); console.log('Comms category reminders → maintenance migrated.'); }
}

// Migration: Idea Board (ideas + threaded comments)
if (!Array.isArray(_data.ideas)) {
  _data._seq.ideas = 0;
  _data.ideas = [];
  save();
}
if (!Array.isArray(_data.idea_comments)) {
  _data._seq.idea_comments = 0;
  _data.idea_comments = [];
  save();
}

// Migration: Academy management (class catalog + waitlists + class changes + notes)
if (!Array.isArray(_data.academy_classes)) {
  _data.academy_classes = ACADEMY_CLASS_SEED.map((c, i) => ({ id: i + 1, active: true, category: c.category || 'junior', ...c }));
  _data._seq.academy_classes = _data.academy_classes.length;
  save();
  console.log('Seeded academy classes:', _data.academy_classes.length);
}
// One-time: append adult classes if the catalog has none yet (juniors may already be seeded).
if (Array.isArray(_data.academy_classes) && !_data.academy_classes.some(c => c.category === 'adult')) {
  ACADEMY_ADULT_SEED.forEach(c => { _data.academy_classes.push({ id: nextId('academy_classes'), active: true, age: '', ...c }); });
  save();
  console.log('Appended adult academy classes:', ACADEMY_ADULT_SEED.length);
}
['academy_waitlist', 'academy_changes', 'academy_notes', 'staff_pay', 'push_subscriptions', 'members', 'checkin_logs'].forEach(t => {
  if (!Array.isArray(_data[t])) { _data._seq[t] = 0; _data[t] = []; save(); }
});

// Migration: pro schedule slots — the season class grid the teaching pros are
// assigned to. Seeded ONCE from the academy class catalog (parse day_time into a
// structured day + start/end); court + pros are assigned in-app via dropdowns.
// Gated by a flag so edits/deletions survive reboots.
if (!Array.isArray(_data.pro_schedule_slots)) { _data.pro_schedule_slots = []; _data._seq.pro_schedule_slots = 0; }
if (!_data._migrations) _data._migrations = {};

// Migration: initial member import (Sep 2026) — runs once, never again.
if (!_data._migrations.memberImport2026Sep) {
  const SEED_MEMBERS = [
    { first_name: 'Ardi', last_name: 'Afghahi', phone: '4166760050', pin: '0050' },
    { first_name: 'Neil', last_name: 'Ahmed', phone: '9058426454', pin: '7454' },
    { first_name: 'Shahmeer', last_name: 'Ahmed', phone: '', pin: '' },
    { first_name: 'Alaya', last_name: 'Ahmed', phone: '', pin: '' },
    { first_name: 'Alina', last_name: 'Ahmed', phone: '', pin: '' },
    { first_name: 'Ashraf', last_name: 'Al Daoud', phone: '6478635555', pin: '5555' },
    { first_name: 'Abdul-Munem', last_name: 'Al-Khudairi', phone: '', pin: '' },
    { first_name: 'Qasim', last_name: 'Ali', phone: '9058120382', pin: '3398' },
    { first_name: 'Theresa', last_name: 'Allum', phone: '9058281586', pin: '8358' },
    { first_name: 'Marino', last_name: 'Aloysius', phone: '6475011752', pin: '1752' },
    { first_name: 'Christina', last_name: 'Anto', phone: '', pin: '' },
    { first_name: 'Catherine', last_name: 'Anto', phone: '', pin: '' },
    { first_name: 'Patrick', last_name: 'Arendse', phone: '', pin: '' },
    { first_name: 'Nancy', last_name: 'Arnold', phone: '9054650446', pin: '8568' },
    { first_name: 'Anto', last_name: 'Arulappan', phone: '', pin: '' },
    { first_name: 'Lucas', last_name: 'Assuncao', phone: '6477730674', pin: '0674' },
    { first_name: 'Harjeet', last_name: 'Aulakh', phone: '4168241313', pin: '1313' },
    { first_name: 'Erika', last_name: 'Babayan', phone: '', pin: '' },
    { first_name: 'Michelle', last_name: 'Baczynski', phone: '', pin: '' },
    { first_name: 'Seung Seon', last_name: 'Baek', phone: '6472813607', pin: '3607' },
    { first_name: 'Lucas', last_name: 'Baicoianu', phone: '4163892432', pin: '2432' },
    { first_name: 'Michelle', last_name: 'Bammeke', phone: '6477836981', pin: '6981' },
    { first_name: 'Jake', last_name: 'Bao', phone: '', pin: '' },
    { first_name: 'Kaiya', last_name: 'Bao', phone: '', pin: '' },
    { first_name: 'Kevin', last_name: 'Beatson', phone: '', pin: '' },
    { first_name: 'Greg', last_name: 'Bedard', phone: '4167235144', pin: '5144' },
    { first_name: 'Pawan', last_name: 'Bhatla', phone: '6479713937', pin: '3937' },
    { first_name: 'Sarosh', last_name: 'Bhumgara', phone: '9055802135', pin: '2135' },
    { first_name: 'Sushil', last_name: 'Birla', phone: '14164142724', pin: '2724' },
    { first_name: 'Stefan', last_name: 'Bololoi', phone: '6472970587', pin: '0587' },
    { first_name: 'Donald', last_name: 'Braley', phone: '9055427819', pin: '7819' },
    { first_name: 'Jason', last_name: 'Bramwell', phone: '4163577373', pin: '7373' },
    { first_name: 'Heather', last_name: 'Britton', phone: '9053027776', pin: '7776' },
    { first_name: 'Mike', last_name: 'Bronson', phone: '4168435038', pin: '5038' },
    { first_name: 'Liv', last_name: 'Bulfon', phone: '', pin: '' },
    { first_name: 'Beth', last_name: 'Butcher', phone: '9052713575', pin: '9294' },
    { first_name: 'Cheryl', last_name: 'Campbell', phone: '6475543982', pin: '3982' },
    { first_name: 'German', last_name: 'Cardenas', phone: '6476689199', pin: '9199' },
    { first_name: 'Michael', last_name: 'Cassidy', phone: '4163586240', pin: '8099' },
    { first_name: 'Melissa', last_name: 'Cescon', phone: '', pin: '' },
    { first_name: 'Vassil', last_name: 'Chalashkanov', phone: '6479632770', pin: '2770' },
    { first_name: 'Emma', last_name: 'Chan', phone: '6478222027', pin: '2027' },
    { first_name: 'Amy', last_name: 'Chen', phone: '6472156518', pin: '6518' },
    { first_name: 'Connie', last_name: 'Chen', phone: '4168790378', pin: '0378' },
    { first_name: 'Ling', last_name: 'Chen', phone: '', pin: '' },
    { first_name: 'Haoyang', last_name: 'Chen', phone: '', pin: '' },
    { first_name: 'Junran', last_name: 'Chen', phone: '2898859169', pin: '9169' },
    { first_name: 'Xiaoyi', last_name: 'Chen', phone: '6476192856', pin: '2856' },
    { first_name: 'Huanzhi', last_name: 'Cheng', phone: '', pin: '' },
    { first_name: 'Haihong', last_name: 'Cheng', phone: '', pin: '' },
    { first_name: 'Kenneth', last_name: 'Chin', phone: '4167214580', pin: '4580' },
    { first_name: 'Barbara', last_name: 'Choi', phone: '6472942230', pin: '2230' },
    { first_name: 'YC', last_name: 'Choi', phone: '', pin: '' },
    { first_name: 'Maria', last_name: 'Chung Kong', phone: '', pin: '' },
    { first_name: 'Jeanne', last_name: 'Ciok', phone: '9058910849', pin: '5033' },
    { first_name: 'Andrew', last_name: 'Conrad', phone: '', pin: '' },
    { first_name: 'Julita', last_name: 'Conrad', phone: '', pin: '' },
    { first_name: 'Sorin', last_name: 'Cret', phone: '6479902952', pin: '2952' },
    { first_name: 'Justin', last_name: 'Cui', phone: '4169308580', pin: '8580' },
    { first_name: 'Jon', last_name: 'Dahl', phone: '2046797303', pin: '7303' },
    { first_name: 'Heather', last_name: 'Davies', phone: '9058429706', pin: '0782' },
    { first_name: 'Sean', last_name: 'de Belchior', phone: '4167201461', pin: '1461' },
    { first_name: 'Gabriella', last_name: 'De Belchior', phone: '', pin: '' },
    { first_name: 'Robert J', last_name: 'Delaat', phone: '', pin: '' },
    { first_name: 'Pete', last_name: 'Donato', phone: '6475348418', pin: '8418' },
    { first_name: 'Dave', last_name: 'Donato', phone: '', pin: '' },
    { first_name: 'Willus', last_name: 'Dong', phone: '4168935598', pin: '5598' },
    { first_name: 'Maggie', last_name: 'Duan', phone: '4168393021', pin: '3021' },
    { first_name: 'Michael', last_name: 'Duan', phone: '', pin: '' },
    { first_name: 'Dorota Laudon', last_name: 'Duarte', phone: '', pin: '' },
    { first_name: 'Jason', last_name: 'Ebarvia', phone: '', pin: '' },
    { first_name: 'Usman', last_name: 'Ejaz', phone: '6476088401', pin: '8401' },
    { first_name: 'Brian', last_name: 'Enns', phone: '', pin: '' },
    { first_name: 'Ben', last_name: 'Erskine', phone: '', pin: '' },
    { first_name: 'Ye', last_name: 'Fan', phone: '9057065989', pin: '5989' },
    { first_name: 'Freda', last_name: 'Fang', phone: '', pin: '' },
    { first_name: 'Wayne', last_name: 'Fang', phone: '', pin: '' },
    { first_name: 'Sharjeel', last_name: 'Farooqui', phone: '4168220210', pin: '0210' },
    { first_name: 'Ebun', last_name: 'Fasanya', phone: '4166775983', pin: '5983' },
    { first_name: 'David', last_name: 'Ferguson', phone: '9055995871', pin: '5871' },
    { first_name: 'Bob', last_name: 'Floros', phone: '9058445094', pin: '5815' },
    { first_name: 'Huai', last_name: 'Fu', phone: '', pin: '' },
    { first_name: 'Iris', last_name: 'Fu', phone: '', pin: '' },
    { first_name: 'Erica', last_name: 'Fu', phone: '6473931183', pin: '1183' },
    { first_name: 'Yiping', last_name: 'Fu', phone: '', pin: '' },
    { first_name: 'Kenji', last_name: 'Fujita', phone: '', pin: '' },
    { first_name: 'Stephen', last_name: 'Fung', phone: '6478943864', pin: '3864' },
    { first_name: 'Marinela', last_name: 'Gagu', phone: '6479184226', pin: '4226' },
    { first_name: 'Susanne', last_name: 'Galange', phone: '9056356436', pin: '9442' },
    { first_name: 'Amelia', last_name: 'Galasso', phone: '', pin: '' },
    { first_name: 'Valentina', last_name: 'Galasso', phone: '', pin: '' },
    { first_name: 'Chloe', last_name: 'Gao', phone: '2898882626', pin: '2626' },
    { first_name: 'Andrew', last_name: 'Gao', phone: '2898882626', pin: '2626' },
    { first_name: 'Frank', last_name: 'Gao', phone: '', pin: '' },
    { first_name: 'Casey', last_name: 'Ge', phone: '', pin: '' },
    { first_name: 'Terry', last_name: 'Glofcheskie', phone: '4166697585', pin: '7585' },
    { first_name: 'Thia', last_name: 'Gnanakumaran', phone: '9053994239', pin: '4239' },
    { first_name: 'Vishi', last_name: 'Gnanakumaran', phone: '9054834392', pin: '4392' },
    { first_name: 'Aditya', last_name: 'Goel', phone: '', pin: '' },
    { first_name: 'Tao', last_name: 'Gong', phone: '6473853584', pin: '3584' },
    { first_name: 'Carlos Duarte', last_name: 'Gonzalez', phone: '4164783245', pin: '3245' },
    { first_name: 'Maureen', last_name: 'Griffith', phone: '', pin: '' },
    { first_name: 'Andrea', last_name: 'Gruscyk', phone: '', pin: '' },
    { first_name: 'Yan', last_name: 'Gu', phone: '', pin: '' },
    { first_name: 'Kunal', last_name: 'Gulati', phone: '', pin: '' },
    { first_name: 'Gavin', last_name: 'Guo', phone: '', pin: '' },
    { first_name: 'Oral', last_name: 'Gurel', phone: '6472892325', pin: '2325' },
    { first_name: 'James', last_name: 'Hall', phone: '4167350517', pin: '0517' },
    { first_name: 'Hanson', last_name: 'Han', phone: '', pin: '' },
    { first_name: 'Nathan', last_name: 'Han', phone: '', pin: '' },
    { first_name: 'Bo', last_name: 'Han', phone: '', pin: '' },
    { first_name: 'Fiona', last_name: 'Hang', phone: '', pin: '' },
    { first_name: 'Stephanie', last_name: 'Hansuld', phone: '', pin: '' },
    { first_name: 'Faissal', last_name: 'Hariri', phone: '', pin: '' },
    { first_name: 'Elizabeth', last_name: 'Hartyoon', phone: '', pin: '' },
    { first_name: 'Justin', last_name: 'Hasan', phone: '4167377414', pin: '7414' },
    { first_name: 'Dan', last_name: 'Haslett', phone: '', pin: '' },
    { first_name: 'Amanda', last_name: 'Hassoun', phone: '6478936751', pin: '6751' },
    { first_name: 'Jian', last_name: 'He', phone: '4163181208', pin: '1208' },
    { first_name: 'Raymond', last_name: 'He', phone: '', pin: '' },
    { first_name: 'Suzanne', last_name: 'Hickey', phone: '4165533469', pin: '3469' },
    { first_name: 'Ronglin', last_name: 'Hu', phone: '', pin: '' },
    { first_name: 'Glen', last_name: 'Huang', phone: '6476578573', pin: '8573' },
    { first_name: 'Bryan', last_name: 'Huang', phone: '', pin: '' },
    { first_name: 'Nancy', last_name: 'Hubbs', phone: '4168880584', pin: '0584' },
    { first_name: 'Jonson', last_name: 'Huo', phone: '', pin: '' },
    { first_name: 'Naomi', last_name: 'Iamandi', phone: '', pin: '' },
    { first_name: 'Janette', last_name: 'Ilieva', phone: '', pin: '' },
    { first_name: 'Nadia', last_name: 'Iskander', phone: '9052575326', pin: '0722' },
    { first_name: 'Paul', last_name: 'Iskander', phone: '', pin: '' },
    { first_name: 'Nav', last_name: 'Jadon', phone: '6472611791', pin: '1791' },
    { first_name: 'Amish', last_name: 'Jain', phone: '', pin: '' },
    { first_name: 'Neeraj', last_name: 'Jain', phone: '6475057474', pin: '7474' },
    { first_name: 'Ankit', last_name: 'Jain', phone: '6477198877', pin: '8877' },
    { first_name: 'HF', last_name: 'Jan', phone: '4165618862', pin: '8862' },
    { first_name: 'David', last_name: 'Jarvis', phone: '9058083242', pin: '3242' },
    { first_name: 'Bonnie', last_name: 'Jeffery', phone: '8076293699', pin: '3699' },
    { first_name: 'Nancy', last_name: 'Jenner-Rolke', phone: '4162006245', pin: '6245' },
    { first_name: 'Xin', last_name: 'Jin', phone: '', pin: '' },
    { first_name: 'Zurina', last_name: 'Jones', phone: '4377788522', pin: '8522' },
    { first_name: 'Andrea', last_name: 'Jones', phone: '', pin: '' },
    { first_name: 'Deepak', last_name: 'Kapoor', phone: '', pin: '' },
    { first_name: 'Rishan', last_name: 'Kapoor', phone: '', pin: '' },
    { first_name: 'Maria', last_name: 'Katerli', phone: '4165508816', pin: '8816' },
    { first_name: 'Muhammad Usama', last_name: 'Khalid', phone: '6477675677', pin: '5677' },
    { first_name: 'Matthew', last_name: 'Khoory', phone: '6476138602', pin: '8602' },
    { first_name: 'Jan', last_name: 'Kim', phone: '', pin: '' },
    { first_name: 'Dave', last_name: 'Kirkconnell', phone: '9053023449', pin: '3449' },
    { first_name: 'Brenda', last_name: 'Kirkconnell', phone: '9058279451', pin: '9451' },
    { first_name: 'Clare', last_name: 'Kisiel', phone: '', pin: '' },
    { first_name: 'Ram', last_name: 'Kodungallur', phone: '4165258410', pin: '8410' },
    { first_name: 'Robert', last_name: 'Kokar', phone: '9053996014', pin: '6014' },
    { first_name: 'Wayne', last_name: 'Kole', phone: '9058268871', pin: '4633' },
    { first_name: 'Olivia', last_name: 'Kole', phone: '9058268871', pin: '7476' },
    { first_name: 'Linda', last_name: 'Kolyn', phone: '9054842509', pin: '2509' },
    { first_name: 'Michael', last_name: 'Kousaie', phone: '4163227046', pin: '4428' },
    { first_name: 'Loren', last_name: 'Kousaie', phone: '9058129550', pin: '8133' },
    { first_name: 'Maged', last_name: 'Kozman', phone: '4164532478', pin: '2478' },
    { first_name: 'Elisa', last_name: 'Krumov', phone: '6479077109', pin: '7109' },
    { first_name: 'Rahul', last_name: 'Kumar', phone: '6477721642', pin: '1642' },
    { first_name: 'Jonathan', last_name: 'Lajoie', phone: '', pin: '' },
    { first_name: 'John', last_name: 'Lam', phone: '', pin: '' },
    { first_name: 'Robin', last_name: 'Lampman', phone: '4168063515', pin: '3515' },
    { first_name: 'Susanne', last_name: 'Lange', phone: '4169661441', pin: '8547' },
    { first_name: 'Keith', last_name: 'Larson', phone: '', pin: '' },
    { first_name: 'Jennifer', last_name: 'Le-Varma', phone: '4165206828', pin: '6828' },
    { first_name: 'Karen', last_name: 'Lepine', phone: '9054835532', pin: '5532' },
    { first_name: 'Michael', last_name: 'Lepine', phone: '3652923110', pin: '3110' },
    { first_name: 'Pamela', last_name: 'Leung', phone: '4166667916', pin: '7916' },
    { first_name: 'Ethan', last_name: 'Li', phone: '', pin: '' },
    { first_name: 'Raymond', last_name: 'Li', phone: '4165438260', pin: '8260' },
    { first_name: 'Ray', last_name: 'Li', phone: '9052572188', pin: '2698' },
    { first_name: 'Jiahong', last_name: 'Li', phone: '4168168280', pin: '8280' },
    { first_name: 'Sen', last_name: 'Li', phone: '4389286800', pin: '6800' },
    { first_name: 'Zhe', last_name: 'Li', phone: '', pin: '' },
    { first_name: 'Matthew', last_name: 'Li', phone: '', pin: '' },
    { first_name: 'Wilson', last_name: 'Li', phone: '', pin: '' },
    { first_name: 'Yaowen', last_name: 'Liang', phone: '6479280635', pin: '0635' },
    { first_name: 'Yan', last_name: 'Liang', phone: '', pin: '' },
    { first_name: 'Yiyi', last_name: 'Liang', phone: '', pin: '' },
    { first_name: 'David', last_name: 'Lim', phone: '9059019182', pin: '9182' },
    { first_name: 'Tony', last_name: 'Lin', phone: '4163005831', pin: '5831' },
    { first_name: 'Raquel', last_name: 'Lindsell-Ocio', phone: '9053011624', pin: '1624' },
    { first_name: 'Emilia', last_name: 'Liu', phone: '', pin: '' },
    { first_name: 'Ivy', last_name: 'Liu', phone: '4166663258', pin: '3258' },
    { first_name: 'Ziqi', last_name: 'Liu', phone: '4168795327', pin: '5327' },
    { first_name: 'Richard', last_name: 'Liu', phone: '4387785298', pin: '5298' },
    { first_name: 'Jackie', last_name: 'Liu', phone: '', pin: '' },
    { first_name: 'Yu', last_name: 'Liu', phone: '', pin: '' },
    { first_name: 'Eluna', last_name: 'Liu', phone: '', pin: '' },
    { first_name: 'Griz', last_name: 'Liu', phone: '', pin: '' },
    { first_name: 'Yan', last_name: 'Liu', phone: '', pin: '' },
    { first_name: 'Emmanuel', last_name: 'Llamas', phone: '9059974841', pin: '6732' },
    { first_name: 'Vincent', last_name: 'Lu', phone: '', pin: '' },
    { first_name: 'Kathy', last_name: 'Lui', phone: '', pin: '' },
    { first_name: 'Lisa', last_name: 'Lussier', phone: '6137917469', pin: '7469' },
    { first_name: 'Ethan', last_name: 'Ma', phone: '', pin: '' },
    { first_name: 'John', last_name: 'MacDonald', phone: '4165705025', pin: '5025' },
    { first_name: 'Lisa', last_name: 'MacIntyre', phone: '4165228718', pin: '8718' },
    { first_name: 'Hannah', last_name: 'Mahr', phone: '', pin: '' },
    { first_name: 'Neena', last_name: 'Malhotra', phone: '6472055057', pin: '5057' },
    { first_name: 'Asad', last_name: 'Mangla', phone: '9058120382', pin: '1291' },
    { first_name: 'Salim', last_name: 'Manji', phone: '', pin: '' },
    { first_name: 'Lori', last_name: 'Mann', phone: '4162000040', pin: '0040' },
    { first_name: 'Mary', last_name: 'Manno', phone: '4169685288', pin: '4880' },
    { first_name: 'Yuxin', last_name: 'Mansour', phone: '6473909453', pin: '9453' },
    { first_name: 'Isaac', last_name: 'Mao', phone: '5197027585', pin: '7715' },
    { first_name: 'Shaohua', last_name: 'Mao', phone: '5196977715', pin: '7715' },
    { first_name: 'Andrew', last_name: 'Marinsky', phone: '', pin: '' },
    { first_name: 'Roseline', last_name: 'Marshall', phone: '9052713321', pin: '3321' },
    { first_name: 'Guillermo', last_name: 'Martinez', phone: '8077085168', pin: '5168' },
    { first_name: 'Joanne', last_name: 'McCarthy', phone: '', pin: '' },
    { first_name: 'Mark', last_name: 'McLaughlin', phone: '9054832054', pin: '2054' },
    { first_name: 'Mike', last_name: 'McMaster', phone: '', pin: '' },
    { first_name: 'Eleanor', last_name: 'Meli', phone: '6476862253', pin: '2253' },
    { first_name: 'Iris', last_name: 'Mi', phone: '', pin: '' },
    { first_name: 'Jolanta', last_name: 'Miszkiel', phone: '4166291054', pin: '1054' },
    { first_name: 'Suvadeep', last_name: 'Mitra', phone: '19059655951', pin: '5951' },
    { first_name: 'Mithun', last_name: 'Mohan', phone: '2263323372', pin: '3372' },
    { first_name: 'Steven', last_name: 'Molyneaux', phone: '6479876083', pin: '6083' },
    { first_name: 'Tony', last_name: 'Moraes', phone: '6472253600', pin: '3600' },
    { first_name: 'Vina', last_name: 'Moraes', phone: '4168062646', pin: '2646' },
    { first_name: 'Debra', last_name: 'Moy', phone: '', pin: '' },
    { first_name: 'Frank', last_name: 'Mucci', phone: '9058472043', pin: '5286' },
    { first_name: 'Oscar', last_name: 'Munoz', phone: '2898382430', pin: '2430' },
    { first_name: 'Carolyn', last_name: 'Murphy', phone: '6472422475', pin: '2475' },
    { first_name: 'Monica', last_name: 'Musil', phone: '4162582100', pin: '2100' },
    { first_name: 'Bijoy', last_name: 'Naick', phone: '', pin: '' },
    { first_name: 'Glen', last_name: 'Newell', phone: '4166167212', pin: '7212' },
    { first_name: 'William', last_name: 'Nguyen', phone: '4166714954', pin: '4954' },
    { first_name: 'Ayyan', last_name: 'Niaz', phone: '9056089814', pin: '1635' },
    { first_name: 'Gloria', last_name: 'Niblock', phone: '9058420773', pin: '0773' },
    { first_name: 'Lynne', last_name: 'Niepage', phone: '', pin: '' },
    { first_name: 'Jennifer', last_name: 'Noddle', phone: '6475155053', pin: '5053' },
    { first_name: 'Soran', last_name: 'Nouri', phone: '', pin: '' },
    { first_name: 'John', last_name: "O'Connor", phone: '6478046267', pin: '6267' },
    { first_name: 'Sarah', last_name: "O'Neil", phone: '', pin: '' },
    { first_name: 'Monica', last_name: "O'Reilly", phone: '', pin: '' },
    { first_name: 'Sergey', last_name: 'Odobetskiy', phone: '', pin: '' },
    { first_name: 'Sara', last_name: 'Oikawa', phone: '9054677022', pin: '7022' },
    { first_name: 'Chris', last_name: 'Page', phone: '', pin: '' },
    { first_name: 'Sameer', last_name: 'Parpia', phone: '9055997677', pin: '7677' },
    { first_name: 'Dianna', last_name: 'Pasic', phone: '9058252192', pin: '5966' },
    { first_name: 'David', last_name: 'Patel', phone: '', pin: '' },
    { first_name: 'Susan', last_name: 'Patterson', phone: '', pin: '' },
    { first_name: 'Xiaofeng', last_name: 'Peng', phone: '4166628379', pin: '8379' },
    { first_name: 'Terri', last_name: 'Perruzza', phone: '9054848136', pin: '8136' },
    { first_name: 'Tan Loc', last_name: 'Pham', phone: '', pin: '' },
    { first_name: 'Robert', last_name: 'Piwowar', phone: '2897958555', pin: '8555' },
    { first_name: 'Catalina', last_name: 'Ponce De Leon', phone: '', pin: '' },
    { first_name: 'David', last_name: 'Posen', phone: '9058252412', pin: '2412' },
    { first_name: 'Cathy', last_name: 'Prosser', phone: '6472824067', pin: '4067' },
    { first_name: 'Suzanne', last_name: 'Purser', phone: '9059190185', pin: '7940' },
    { first_name: 'Luke', last_name: 'Qian', phone: '', pin: '' },
    { first_name: 'Neo', last_name: 'Qian', phone: '', pin: '' },
    { first_name: 'Honor', last_name: 'Rae', phone: '9058787965', pin: '2205' },
    { first_name: 'Dhiren', last_name: 'Raikuvar', phone: '', pin: '' },
    { first_name: 'Mila', last_name: 'Rajicic', phone: '', pin: '' },
    { first_name: 'Michael', last_name: 'Rakic', phone: '4165258264', pin: '8264' },
    { first_name: 'Imaad', last_name: 'Ramzi', phone: '2269291593', pin: '1593' },
    { first_name: 'Imran', last_name: 'Rasul', phone: '', pin: '' },
    { first_name: 'Doug', last_name: 'Raven', phone: '9053349161', pin: '9161' },
    { first_name: 'Alison', last_name: 'Raven', phone: '', pin: '' },
    { first_name: 'Peter', last_name: 'Refaat', phone: '2898854661', pin: '4661' },
    { first_name: 'Billy', last_name: 'Ren', phone: '4168205510', pin: '5510' },
    { first_name: 'Roy', last_name: 'Ren', phone: '6478700423', pin: '0423' },
    { first_name: 'Steve', last_name: 'Reshetnyk', phone: '4164287562', pin: '7562' },
    { first_name: 'Luis', last_name: 'Reyes', phone: '', pin: '' },
    { first_name: 'Randal', last_name: 'Rocchio', phone: '', pin: '' },
    { first_name: 'Olena', last_name: 'Romanchenko', phone: '', pin: '' },
    { first_name: 'Alex', last_name: 'Romanchenko', phone: '4165050564', pin: '0564' },
    { first_name: 'Christoph', last_name: 'Ross', phone: '4169661441', pin: '8547' },
    { first_name: 'Sven', last_name: 'Rowaert', phone: '5145747836', pin: '7836' },
    { first_name: 'Sonia', last_name: 'Ruban', phone: '', pin: '' },
    { first_name: 'Elena', last_name: 'Rusic', phone: '', pin: '' },
    { first_name: 'Nicole', last_name: 'Ruso', phone: '', pin: '' },
    { first_name: 'Frank', last_name: 'Santosuosso', phone: '4165435926', pin: '5926' },
    { first_name: 'Sriyan', last_name: 'Sareesh', phone: '6478882597', pin: '2597' },
    { first_name: 'Beenu', last_name: 'Sareesh', phone: '', pin: '' },
    { first_name: 'Ashit', last_name: 'Savani', phone: '9053393028', pin: '3028' },
    { first_name: 'Jeff', last_name: 'Scarborough', phone: '9058240098', pin: '0098' },
    { first_name: 'Judy', last_name: 'Seagrove', phone: '9054668368', pin: '8368' },
    { first_name: 'Takammitsu', last_name: 'Serizawa', phone: '9056079244', pin: '9244' },
    { first_name: 'Hiroko', last_name: 'Serizawa', phone: '', pin: '' },
    { first_name: 'Kenneth', last_name: 'Seto', phone: '9052775087', pin: '5757' },
    { first_name: 'Jing', last_name: 'Shao', phone: '', pin: '' },
    { first_name: 'Abheer', last_name: 'Sharma', phone: '', pin: '' },
    { first_name: 'Zoya', last_name: 'Shashkova', phone: '4168455820', pin: '5820' },
    { first_name: 'Donald', last_name: 'Shen', phone: '', pin: '' },
    { first_name: 'Christine', last_name: 'Shi', phone: '6473765365', pin: '5365' },
    { first_name: 'Harsh', last_name: 'Singh', phone: '4165663220', pin: '3220' },
    { first_name: 'Sandeep', last_name: 'Singh', phone: '', pin: '' },
    { first_name: 'Sanjay', last_name: 'Singhal', phone: '', pin: '' },
    { first_name: 'Sareesh', last_name: 'Sivarajan', phone: '6478882597', pin: '2597' },
    { first_name: 'Kripashankar', last_name: 'Somasundaram', phone: '4162760133', pin: '0133' },
    { first_name: 'Andy', last_name: 'Song', phone: '', pin: '' },
    { first_name: 'Winnie', last_name: 'Song', phone: '6479928466', pin: '8466' },
    { first_name: 'Stanislav', last_name: 'Sopelnyk', phone: '', pin: '' },
    { first_name: 'Phyllis', last_name: 'Spagnuolo', phone: '6472969847', pin: '9847' },
    { first_name: 'Gary', last_name: 'Sprules', phone: '', pin: '' },
    { first_name: 'Marty', last_name: 'Stajan', phone: '4166779221', pin: '9221' },
    { first_name: 'Graham', last_name: 'Stewart', phone: '', pin: '' },
    { first_name: 'Carol', last_name: 'Stobie', phone: '9058963302', pin: '3302' },
    { first_name: 'Daniel', last_name: 'Su', phone: '', pin: '' },
    { first_name: 'Ron', last_name: 'Sun', phone: '', pin: '' },
    { first_name: 'Jessica', last_name: 'Sun', phone: '', pin: '' },
    { first_name: 'Yuqian', last_name: 'Sun', phone: '', pin: '' },
    { first_name: 'Akshath', last_name: 'Suresh', phone: '4168751601', pin: '1601' },
    { first_name: 'Adam', last_name: 'Szczepanowski', phone: '4167129791', pin: '9791' },
    { first_name: 'Jules', last_name: 'Tabanji', phone: '6477845313', pin: '5313' },
    { first_name: 'Steve', last_name: 'Tam', phone: '4169316490', pin: '6490' },
    { first_name: 'Aneeq', last_name: 'Tanveen', phone: '', pin: '' },
    { first_name: 'Tao', last_name: 'Tao', phone: '6478839585', pin: '9585' },
    { first_name: 'Licheng (Tom)', last_name: 'Tao', phone: '', pin: '' },
    { first_name: 'Arina', last_name: 'Tao', phone: '', pin: '' },
    { first_name: 'Bilal', last_name: 'Tariq', phone: '6476751815', pin: '1815' },
    { first_name: 'Tatiana', last_name: 'Tarnovskaya', phone: '', pin: '' },
    { first_name: 'Vitali', last_name: 'Tarnovski', phone: '', pin: '' },
    { first_name: 'Walter', last_name: 'Thalmeiner', phone: '4165242396', pin: '2396' },
    { first_name: 'Mia', last_name: 'Thambirajah', phone: '', pin: '' },
    { first_name: 'Nola', last_name: 'Thambirajah', phone: '', pin: '' },
    { first_name: 'Kevin', last_name: 'Tian', phone: '', pin: '' },
    { first_name: 'Feng', last_name: 'Tian', phone: '', pin: '' },
    { first_name: 'Gayle', last_name: 'Tipold', phone: '', pin: '' },
    { first_name: 'Gerry', last_name: 'Tipold', phone: '4167091761', pin: '1761' },
    { first_name: 'Xiaoling', last_name: 'Tong', phone: '5197027585', pin: '7585' },
    { first_name: 'Stella', last_name: 'Topic', phone: '', pin: '' },
    { first_name: 'David', last_name: 'Tran', phone: '6472063930', pin: '3930' },
    { first_name: 'Alvin', last_name: 'Tung', phone: '4167236535', pin: '6535' },
    { first_name: 'David', last_name: 'Turner', phone: '2894008658', pin: '8658' },
    { first_name: 'Saahil', last_name: 'Tuteja', phone: '', pin: '' },
    { first_name: 'Aditi', last_name: 'Varma', phone: '', pin: '' },
    { first_name: 'Advaith', last_name: 'Varma', phone: '', pin: '' },
    { first_name: 'Andreja', last_name: 'Vehauc', phone: '4168957932', pin: '7932' },
    { first_name: 'Felipe', last_name: 'Velasquez', phone: '', pin: '' },
    { first_name: 'Marco', last_name: 'Velastegui', phone: '2897959884', pin: '9884' },
    { first_name: 'Diana', last_name: 'Vienneau', phone: '9056080309', pin: '0309' },
    { first_name: 'Helen', last_name: 'Volzhanin', phone: '6474071584', pin: '1584' },
    { first_name: 'Gloria', last_name: 'Vopni', phone: '4165645207', pin: '5207' },
    { first_name: 'Ryan', last_name: 'Vopni', phone: '', pin: '' },
    { first_name: 'Vincent', last_name: 'Vopni', phone: '', pin: '' },
    { first_name: 'Destan', last_name: 'Waese', phone: '4164321976', pin: '0045' },
    { first_name: 'Callen', last_name: 'Waese', phone: '', pin: '' },
    { first_name: 'Steven', last_name: 'Wald', phone: '2898340274', pin: '0274' },
    { first_name: 'Michael', last_name: 'Wan', phone: '9058198957', pin: '2688' },
    { first_name: 'Rose', last_name: 'Wang', phone: '', pin: '' },
    { first_name: 'Kevin', last_name: 'Wang', phone: '6479551027', pin: '8868' },
    { first_name: 'Grace', last_name: 'Wei', phone: '4164179610', pin: '9610' },
    { first_name: 'Cindy', last_name: 'Wei', phone: '', pin: '' },
    { first_name: 'Brian', last_name: 'Weston', phone: '9055105328', pin: '5328' },
    { first_name: 'Cathy', last_name: 'Whittaker', phone: '', pin: '' },
    { first_name: 'Murray', last_name: 'Whittaker', phone: '', pin: '' },
    { first_name: 'Jennifer', last_name: 'Willson', phone: '', pin: '' },
    { first_name: 'Pawel', last_name: 'Wojcik', phone: '', pin: '' },
    { first_name: 'Sally', last_name: 'Wong', phone: '4164000388', pin: '0388' },
    { first_name: 'Julie', last_name: 'Wong', phone: '', pin: '' },
    { first_name: 'Gary', last_name: 'Woods', phone: '9053345165', pin: '5165' },
    { first_name: 'Florence', last_name: 'Wu', phone: '', pin: '' },
    { first_name: 'Mark', last_name: 'Wu', phone: '', pin: '' },
    { first_name: 'Chun', last_name: 'Wu', phone: '', pin: '' },
    { first_name: 'Vivian', last_name: 'Xiao', phone: '15148857588', pin: '7588' },
    { first_name: 'Olivia', last_name: 'Xiao', phone: '', pin: '' },
    { first_name: 'Evan', last_name: 'Xie', phone: '2892420354', pin: '0354' },
    { first_name: 'Eric', last_name: 'Xie', phone: '', pin: '' },
    { first_name: 'Steven', last_name: 'Xie', phone: '', pin: '' },
    { first_name: 'Xiaofeng', last_name: 'Xu', phone: '', pin: '' },
    { first_name: 'Audrey', last_name: 'Xu', phone: '', pin: '' },
    { first_name: 'Lydia', last_name: 'Xu', phone: '', pin: '' },
    { first_name: 'Guanjun', last_name: 'Xu', phone: '', pin: '' },
    { first_name: 'Chen', last_name: 'Xu', phone: '', pin: '' },
    { first_name: 'Jiahua', last_name: 'Yan', phone: '', pin: '' },
    { first_name: 'Jun', last_name: 'Yang', phone: '', pin: '' },
    { first_name: 'Shan', last_name: 'Yang', phone: '', pin: '' },
    { first_name: 'Cyndy', last_name: 'Yang', phone: '', pin: '' },
    { first_name: 'Xu', last_name: 'Yang', phone: '', pin: '' },
    { first_name: 'Feifei', last_name: 'Yang', phone: '', pin: '' },
    { first_name: 'Neggie', last_name: 'Yashar', phone: '9054640314', pin: '0314' },
    { first_name: 'Samantha', last_name: 'Yau', phone: '6474624917', pin: '4917' },
    { first_name: 'Frank', last_name: 'Yee', phone: '', pin: '' },
    { first_name: 'Amy', last_name: 'Yee', phone: '', pin: '' },
    { first_name: 'Hongbin', last_name: 'You', phone: '', pin: '' },
    { first_name: 'Lawrence', last_name: 'Yu', phone: '', pin: '' },
    { first_name: 'Langrui', last_name: 'Yue', phone: '', pin: '' },
    { first_name: 'Darren', last_name: 'Yue', phone: '', pin: '' },
    { first_name: 'Weimin', last_name: 'Yue', phone: '', pin: '' },
    { first_name: 'Luke', last_name: 'Zhang', phone: '', pin: '' },
    { first_name: 'Oscar', last_name: 'Zhang', phone: '', pin: '' },
    { first_name: 'Jason', last_name: 'Zhang', phone: '', pin: '' },
    { first_name: 'Michael', last_name: 'Zhang', phone: '4168382322', pin: '2322' },
    { first_name: 'Taloz', last_name: 'Zhang', phone: '6476489711', pin: '9711' },
    { first_name: 'Wei', last_name: 'Zhang', phone: '2899937899', pin: '7899' },
    { first_name: 'Isabell', last_name: 'Zhang', phone: '', pin: '' },
    { first_name: 'Sophia', last_name: 'Zhang', phone: '', pin: '' },
    { first_name: 'Jingbin', last_name: 'Zhang', phone: '7807086514', pin: '6514' },
    { first_name: 'Jesse', last_name: 'Zhang', phone: '', pin: '' },
    { first_name: 'Kevin', last_name: 'Zhang', phone: '', pin: '' },
    { first_name: 'Max', last_name: 'Zhang', phone: '', pin: '' },
    { first_name: 'Maisie', last_name: 'Zhang', phone: '', pin: '' },
    { first_name: 'Eric', last_name: 'Zhang', phone: '', pin: '' },
    { first_name: 'Junpeng', last_name: 'Zhang', phone: '', pin: '' },
    { first_name: 'Linjing', last_name: 'Zhang', phone: '', pin: '' },
    { first_name: 'Ethan', last_name: 'Zhang', phone: '', pin: '' },
    { first_name: 'Felix', last_name: 'Zhang', phone: '', pin: '' },
    { first_name: 'Cynthia', last_name: 'Zhang', phone: '', pin: '' },
    { first_name: 'Frank', last_name: 'Zhao', phone: '4162728967', pin: '8967' },
    { first_name: 'Shuze', last_name: 'Zhao', phone: '', pin: '' },
    { first_name: 'Danil', last_name: 'Zharkov', phone: '4169945263', pin: '5263' },
    { first_name: 'Sergey', last_name: 'Zharkov', phone: '', pin: '' },
    { first_name: 'Qing', last_name: 'Zheng', phone: '4165770689', pin: '0689' },
    { first_name: 'Lucas', last_name: 'Zheng', phone: '4165770689', pin: '0689' },
    { first_name: 'Liang', last_name: 'Zheng', phone: '', pin: '' },
    { first_name: 'Linus', last_name: 'Zhou', phone: '', pin: '' },
    { first_name: 'Jonathan', last_name: 'Zhou', phone: '', pin: '' },
    { first_name: 'Abigail', last_name: 'Zhou', phone: '', pin: '' },
    { first_name: 'Louis', last_name: 'Zhou', phone: '6132233309', pin: '3309' },
    { first_name: 'Jaromir', last_name: 'Zubicek', phone: '6479664964', pin: '4964' },
  ];
  if (!Array.isArray(_data.members)) { _data.members = []; _data._seq.members = 0; }
  if (!_data.members.length) {
    const ts = new Date().toISOString();
    SEED_MEMBERS.forEach(m => {
      _data._seq.members = (_data._seq.members || 0) + 1;
      _data.members.push({ id: _data._seq.members, first_name: m.first_name, last_name: m.last_name, phone: m.phone, email: '', pin: m.pin, member_type: 'full', active: true, created_at: ts });
    });
    _data._migrations.memberImport2026Sep = true;
    save();
    console.log('Member import complete:', _data.members.length, 'members seeded.');
  } else {
    _data._migrations.memberImport2026Sep = true;
    save();
  }
}

// Migration V2: replace phone-based PINs with member-number-based PINs (Sep 2026).
// Wipes and re-seeds the members array. Adds club_number field to every record.
if (!_data._migrations.memberImport2026SepV2) {
  // [club_number, pin, last_name, first_name, phone]
  // pin = numeric digits of club_number, padStart(4,'0'). Empty string where no digits or collision.
  const S2 = [
    ['M2518','2518',"A'mula",'Gigi',''],
    ['M1986','1986','Afghahi','Ardi','4166760050'],
    ['M0005','0005','Ahmed','Neil','9058426454'],
    ['M2190','2190','Ahmed','Shahmeer',''],
    ['M2464','2464','Ahmed','Alaya',''],
    ['M2465','2465','Ahmed','Alina',''],
    ['M1880','1880','Al Daoud','Ashraf','6478635555'],
    ['M2480','2480','Al-Khudairi','Abdul-Munem',''],
    ['M1440','1440','Ali','Qasim','9058120382'],
    ['M0668','0668','Allum','Theresa','9058281586'],
    ['M1548','1548','Aloysius','Marino','6475011752'],
    ['M2382','2382','Anto','Christina',''],
    ['M2383','2383','Anto','Catherine',''],
    ['M2384','2384','Arulappan','Anto',''],
    ['M0828','0828','Arendse','Patrick',''],
    ['M0806','0806','Arnold','Nancy','9054650446'],
    ['M1907','1907','Assuncao','Lucas','6477730674'],
    ['M2397','2397','Aulakh','Harjeet','4168241313'],
    ['M0353','0353','Babayan','Erika',''],
    ['M1834','1834','Baczynski','Michelle',''],
    ['M1098','1098','Baek','Seung Seon','6472813607'],
    ['M2238','2238','Baicoianu','Lucas','4163892432'],
    ['M2352','2352','Bammeke','Michelle','6477836981'],
    ['M2064','2064','Bao','Jake',''],
    ['M2169','2169','Bao','Kaiya',''],
    ['M0020','0020','Beatson','Kevin',''],
    ['M1909','1909','Bedard','Greg','4167235144'],
    ['M2402','2402','Bhatla','Pawan','6479713937'],
    ['M1702','1702','Bhumgara','Sarosh','9055802135'],
    ['M2014','2014','Birla','Sushil','14164142724'],
    ['M2399','2399','Bololoi','Stefan','6472970587'],
    ['M0423','0423','Braley','Donald','9055427819'],
    ['M2072','2072','Bramwell','Jason','4163577373'],
    ['M0027','0027','Britton','Heather','9053027776'],
    ['M1739','1739','Bronson','Mike','4168435038'],
    ['M2507','2507','Bulfon','Liv',''],
    ['M1836','1836','Butcher','Beth','9052713575'],
    ['M1987','1987','Calic','Nikola',''],
    ['M1041','1041','Campbell','Cheryl','6475543982'],
    ['M1187','1187','Cardenas','German','6476689199'],
    ['M2289','2289','Cassidy','Michael','4163586240'],
    ['M2353','2353','Cescon','Melissa',''],
    ['M1298','1298','Chalashkanov','Vassil','6479632770'],
    ['M2241','2241','Chan','Emma','6478222027'],
    ['M1325','1325','Chen','Amy','6472156518'],
    ['M2058','2058','Chen','Connie','4168790378'],
    ['M2449','2449','Chen','Ling',''],
    ['M2456','2456','Chen','Haoyang',''],
    ['M2498','2498','Chen','Junran','2898859169'],
    ['M2500','2500','Chen','Xiaoyi','6476192856'],
    ['M1949','1949','Cheng','Huanzhi',''],
    ['M2502','2502','Cheng','Haihong',''],
    ['M0036','0036','Chin','Kenneth','4167214580'],
    ['M1177','1177','Choe','Robert','4168172327'],
    ['M1895','1895','Choe','Lucas',''],
    ['M1896','1896','Choe','Alexandra',''],
    ['M2128','2128','Choi','Barbara','6472942230'],
    ['M2298','2298','Choi','YC',''],
    ['M2496','2496','Chung Kong','Maria',''],
    ['M0793','0793','Ciok','Jeanne','9058910849'],
    ['M2494','2494','Conrad','Andrew',''],
    ['M2495','2495','Conrad','Julita',''],
    ['M2220','2220','Cret','Sorin','6479902952'],
    ['M2406','2406','Cui','Justin','4169308580'],
    ['M2097','2097','Dahl','Jon','2046797303'],
    ['M0447','0447','Davies','Heather','9058429706'],
    ['M1263','1263','de Belchior','Sean','4167201461'],
    ['M2261','2261','De Belchior','Gabriella',''],
    ['M0051','0051','Delaat','Robert J',''],
    ['JD123','0123','Doe','John','1234567888'],
    ['M2219','2219','Donato','Pete','6475348418'],
    ['M2474','2474','Donato','Dave',''],
    ['M2361','2361','Dong','Willus','4168935598'],
    ['M2470','2470','Duan','Maggie','4168393021'],
    ['M2511','2511','Duan','Michael',''],
    ['M0280','0280','Duarte','Dorota Laudon',''],
    ['M1997','1997','Ebarvia','Jason',''],
    ['M1721','1721','Ejaz','Usman','6476088401'],
    ['M2435','2435','Enns','Brian',''],
    ['M2317','2317','Erskine','Ben',''],
    ['M2251','2251','Fan','Ye','9057065989'],
    ['M2444','2444','Fang','Freda',''],
    ['M2462','2462','Fang','Wayne',''],
    ['M1607','1607','Farooqui','Sharjeel','4168220210'],
    ['M2229','2229','Fasanya','Ebun','4166775983'],
    ['RF001','0001','Federer','Roger',''],
    ['M0716','0716','Ferguson','David','9055995871'],
    ['M0079','0079','Floros','Bob','9058445094'],
    ['M1587','1587','Fu','Huai',''],
    ['M1910','1910','Fu','Iris',''],
    ['M2047','2047','Fu','Erica','6473931183'],
    ['M2252','2252','Fu','Yiping',''],
    ['M1872','1872','Fujita','Kenji',''],
    ['M2388','2388','Fung','Stephen','6478943864'],
    ['M1644','1644','Gagu','Marinela','6479184226'],
    ['M1313','1313','Galange','Susanne','9056356436'],
    ['M2505','2505','Galasso','Amelia',''],
    ['M2506','2506','Galasso','Valentina',''],
    ['M2330','2330','Gao','Chloe','2898882626'],
    ['M2331','2331','Gao','Andrew','2898882626'],
    ['M2457','2457','Gao','Frank',''],
    ['M2471','2471','Ge','Casey',''],
    ['M2105','2105','Glofcheskie','Terry','4166697585'],
    ['M1688','1688','Gnanakumaran','Thia','9053994239'],
    ['M1689','1689','Gnanakumaran','Vishi','9054834392'],
    ['M2369','2369','Goel','Aditya',''],
    ['M2236','2236','Gong','Tao','6473853584'],
    ['M0279','0279','Gonzalez','Carlos Duarte','4164783245'],
    ['M2519','2519','Gordon','Lisa',''],
    ['M0863','0863','Griffith','Maureen',''],
    ['M2483','2483','Gruscyk','Andrea',''],
    ['M1128','1128','Gu','Yan',''],
    ['M2400','2400','Gulati','Kunal',''],
    ['M2409','2409','Guo','Gavin',''],
    ['M2274','2274','Gurel','Oral','6472892325'],
    ['M0982','0982','Hall','James','4167350517'],
    ['M2191','2191','Han','Hanson',''],
    ['M2358','2358','Han','Nathan',''],
    ['M2443','2443','Han','Bo',''],
    ['M2332','2332','Hang','Fiona',''],
    ['M1597','1597','Hansuld','Stephanie',''],
    ['M2291','2291','Hariri','Faissal',''],
    ['M1693','1693','Hartyoon','Elizabeth',''],
    ['M2513','2513','Hasan','Justin','4167377414'],
    ['M0097','0097','Haslett','Dan',''],
    ['M2063','2063','Hassoun','Amanda','6478936751'],
    ['M1384','1384','He','Jian','4163181208'],
    ['M2268','2268','He','Raymond',''],
    ['M1983','1983','Hickey','Suzanne','4165533469'],
    ['M1798','1798','Hu','Ronglin',''],
    ['M2254','2254','Huang','Glen','6476578573'],
    ['M2508','2508','Huang','Bryan',''],
    ['M0106','0106','Hubbs','Nancy','4168880584'],
    ['M2297','2297','Huo','Jonson',''],
    ['M2049','2049','Iamandi','Naomi',''],
    ['M2184','2184','Ilieva','Janette',''],
    ['M1267','1267','Iskander','Nadia','9052575326'],
    ['M2386','2386','Iskander','Paul',''],
    ['M2002','2002','Jadon','Nav','6472611791'],
    ['M1564','1564','Jain','Amish',''],
    ['M2008','2008','Jain','Neeraj','6475057474'],
    ['M2073','2073','Jain','Ankit','6477198877'],
    ['M2299','2299','Jan','HF','4165618862'],
    ['M0987','0987','Jarvis','David','9058083242'],
    ['M1170','1170','Jeffery','Bonnie','8076293699'],
    ['M1945','1945','Jenner-Rolke','Nancy','4162006245'],
    ['M2161','2161','Jin','Xin',''],
    ['M1711','1711','Jones','Zurina','4377788522'],
    ['M2473','2473','Jones','Andrea',''],
    ['M2074','2074','Kapoor','Deepak',''],
    ['M2223','2223','Kapoor','Rishan',''],
    ['M2396','2396','Katerli','Maria','4165508816'],
    ['M0843','0843','Khalid','Muhammad Usama','6477675677'],
    ['M2075','2075','Khoory','Matthew','6476138602'],
    ['M2481','2481','Kim','Jan',''],
    ['M1233','1233','Kirkconnell','Dave','9053023449'],
    ['M1234','1234','Kirkconnell','Brenda','9058279451'],
    ['M2479','2479','Kisiel','Clare',''],
    ['M0752','0752','Kodungallur','Ram','4165258410'],
    ['M0357','0357','Kokar','Robert','9053996014'],
    ['M0115','0115','Kole','Wayne','9058268871'],
    ['M0917','0917','Kole','Olivia','9058268871'],
    ['M2084','2084','Kolyn','Linda','9054842509'],
    ['M0119','0119','Kousaie','Michael','4163227046'],
    ['M0120','0120','Kousaie','Loren','9058129550'],
    ['M1570','1570','Kozman','Maged','4164532478'],
    ['M2391','2391','Krumov','Elisa','6479077109'],
    ['M2183','2183','Kumar','Rahul','6477721642'],
    ['M2459','2459','Lajoie','Jonathan',''],
    ['M2492','2492','Lam','John',''],
    ['M1171','1171','Lampman','Robin','4168063515'],
    ['M2323','2323','Lange','Susanne','4169661441'],
    ['M1555','1555','Larson','Keith',''],
    ['M2424','2424','Le-Varma','Jennifer','4165206828'],
    ['M2089','2089','Lepine','Karen','9054835532'],
    ['M2090','2090','Lepine','Michael','3652923110'],
    ['M1291','1291','Leung','Pamela','4166667916'],
    ['M0795','0795','Li','Ethan',''],
    ['M0933','0933','Li','Raymond','4165438260'],
    ['M1247','1247','Li','Ray','9052572188'],
    ['M1965','1965','Li','Jiahong','4168168280'],
    ['M2227','2227','Li','Andrew','6476798230'],
    ['M2255','2255','Li','Sen','4389286800'],
    ['M2277','2277','Li','Zhe',''],
    ['M2319','2319','Li','Matthew',''],
    ['M2445','2445','Li','Wilson',''],
    ['M1950','1950','Liang','Yaowen','6479280635'],
    ['M2454','2454','Liang','Yan',''],
    ['M2455','2455','Liang','Yiyi',''],
    ['M1534','1534','Lim','David','9059019182'],
    ['M0482','0482','Lin','Tony','4163005831'],
    ['M1863','1863','Lindsell-Ocio','Raquel','9053011624'],
    ['M2091','2091','Liu','Emilia',''],
    ['M2098','2098','Liu','Ivy','4166663258'],
    ['M2193','2193','Liu','Ziqi','4168795327'],
    ['M2269','2269','Liu','Richard','4387785298'],
    ['M2286','2286','Liu','Jackie',''],
    ['M2486','2486','Liu','Yu',''],
    ['M2487','2487','Liu','Eluna',''],
    ['M2488','2488','Liu','Griz',''],
    ['M2491','2491','Liu','Yan',''],
    ['M1220','1220','Llamas','Emmanuel','9059974841'],
    ['M2287','2287','Lu','Vincent',''],
    ['M2493','2493','Lui','Kathy',''],
    ['M1811','1811','Lussier','Lisa','6137917469'],
    ['M2433','2433','Ma','Ethan',''],
    ['M2152','2152','MacDonald','John','4165705025'],
    ['M2389','2389','MacIntyre','Lisa','4165228718'],
    ['M2437','2437','Mahr','Hannah',''],
    ['M2296','2296','Malhotra','Neena','6472055057'],
    ['M1441','1441','Mangla','Asad','9058120382'],
    ['M2401','2401','Manji','Salim',''],
    ['M2132','2132','Mann','Lori','4162000040'],
    ['M0869','0869','Manno','Mary','4169685288'],
    ['M2108','2108','Mansour','Yuxin','6473909453'],
    ['M2375','2375','Mao','Isaac','5197027585'],
    ['M2392','2392','Mao','Shaohua','5196977715'],
    ['M2497','2497','Marinsky','Andrew',''],
    ['M0141','0141','Marshall','Roseline','9052713321'],
    ['M2237','2237','Martinez','Guillermo','8077085168'],
    ['M2469','2469','McCarthy','Joanne',''],
    ['M1558','1558','McLaughlin','Mark','9054832054'],
    ['M1709','1709','McMaster','Mike',''],
    ['M2415','2415','Meli','Eleanor','6476862253'],
    ['M2499','2499','Mi','Iris',''],
    ['M0753','0753','Miszkiel','Jolanta','4166291054'],
    ['M2205','2205','Mitra','Suvadeep','19059655951'],
    ['M2412','2412','Mohan','Mithun','2263323372'],
    ['M1692','1692','Molyneaux','Steven','6479876083'],
    ['M1235','1235','Moraes','Tony','6472253600'],
    ['M1583','1583','Moraes','Vina','4168062646'],
    ['M2484','2484','Moy','Debra',''],
    ['M0162','0162','Mucci','Frank','9058472043'],
    ['M1980','1980','Munoz','Oscar','2898382430'],
    ['M1915','1915','Murphy','Carolyn','6472422475'],
    ['M2403','2403','Musil','Monica','4162582100'],
    ['M1050','1050','Naick','Bijoy',''],
    ['M1812','1812','Newell','Glen','4166167212'],
    ['M2040','2040','Nguyen','William','4166714954'],
    ['M0705','0705','Niaz','Ayyan','9056089814'],
    ['M0362','0362','Niblock','Gloria','9058420773'],
    ['M2103','2103','Niepage','Lynne',''],
    ['M2472','2472','Noddle','Jennifer','6475155053'],
    ['M2482','2482','Nouri','Soran',''],
    ["M1684",'1684',"O'Connor",'John','6478046267'],
    ["M0170",'0170',"O'Neil",'Sarah',''],
    ["M1699",'1699',"O'Reilly",'Monica',''],
    ['M0370','0370','Odobetskiy','Sergey',''],
    ['M2408','2408','Oikawa','Sara','9054677022'],
    ['M1042','1042','Page','Chris',''],
    ['M2275','2275','Parpia','Sameer','9055997677'],
    ['M0178','0178','Pasic','Dianna','9058252192'],
    ['M2516','2516','Patel','David',''],
    ['M0915','0915','Patterson','Susan',''],
    ['M1765','1765','Peng','Xiaofeng','4166628379'],
    ['M1300','1300','Perruzza','Terri','9054848136'],
    ['M0283','0283','Pham','Tan Loc',''],
    ['M0361','0361','Piwowar','Robert','2897958555'],
    ['M2453','2453','Ponce De Leon','Catalina',''],
    ['M0189','0189','Posen','David','9058252412'],
    ['M1559','1559','Prosser','Cathy','6472824067'],
    ['M1465','1465','Purser','Suzanne','9059190185'],
    ['M2335','2335','Qian','Luke',''],
    ['M2336','2336','Qian','Neo',''],
    ['M1297','1297','Rae','Honor','9058787965'],
    ['M2451','2451','Raikuvar','Dhiren',''],
    ['M2155','2155','Rajicic','Mila',''],
    ['M2015','2015','Rakic','Michael','4165258264'],
    ['M2208','2208','Ramzi','Imaad','2269291593'],
    ['M0197','0197','Rasul','Imran',''],
    ['M0449','0449','Raven','Doug','9053349161'],
    ['M0450','0450','Raven','Alison',''],
    ['M2081','2081','Refaat','Peter','2898854661'],
    ['M0826','0826','Ren','Billy','4168205510'],
    ['M2264','2264','Ren','Roy','6478700423'],
    ['M1626','1626','Reshetnyk','Steve','4164287562'],
    ['M2475','2475','Reyes','Luis',''],
    ['M1831','1831','Rocchio','Randal',''],
    ['M1392','1392','Romanchenko','Olena',''],
    ['M1521','1521','Romanchenko','Alex','4165050564'],
    ['M2322','2322','Ross','Christoph',''],
    ['M1776','1776','Rowaert','Sven','5145747836'],
    ['M2385','2385','Ruban','Sonia',''],
    ['M2148','2148','Rusic','Elena',''],
    ['M2321','2321','Ruso','Nicole',''],
    ['M1905','1905','Santosuosso','Frank','4165435926'],
    ['M1654','1654','Sareesh','Sriyan','6478882597'],
    ['M2265','2265','Sareesh','Beenu',''],
    ['M0373','0373','Savani','Ashit','9053393028'],
    ['M1595','1595','Scarborough','Jeff','9058240098'],
    ['M1951','1951','Seagrove','Judy','9054668368'],
    ['J0003','0003','Serizawa','Mizuki',''],
    ['J0004','0004','Serizawa','Yuki',''],
    ['J0005','','Serizawa','Lisa',''],
    ['M0210','0210','Serizawa','Takammitsu','9056079244'],
    ['M0211','0211','Serizawa','Hiroko',''],
    ['M1593','1593','Seto','Kenneth','9052775087'],
    ['M2476','2476','Shao','Jing',''],
    ['M2450','2450','Sharma','Abheer',''],
    ['M1697','1697','Shashkova','Zoya','4168455820'],
    ['M2004','2004','Shen','Donald',''],
    ['M2463','2463','Shi','Christine','6473765365'],
    ['M2069','2069','Singh','Harsh','4165663220'],
    ['M2070','2070','Singh','Sandeep',''],
    ['M2013','2013','Singhal','Sanjay',''],
    ['M1653','1653','Sivarajan','Sareesh','6478882597'],
    ['M1526','1526','Somasundaram','Kripashankar','4162760133'],
    ['M1328','1328','Song','Andy',''],
    ['M1329','1329','Song','Winnie','6479928466'],
    ['M1775','1775','Sopelnyk','Stanislav',''],
    ['M1742','1742','Spagnuolo','Phyllis','6472969847'],
    ['M0767','0767','Sprules','Gary',''],
    ['M1710','1710','Stajan','Marty','4166779221'],
    ['M2200','2200','Stewart','Graham',''],
    ['M0229','0229','Stobie','Carol','9058963302'],
    ['M2458','2458','Su','Daniel',''],
    ['M2057','2057','Sun','Ron',''],
    ['M2060','2060','Sun','Jessica',''],
    ['M2279','2279','Sun','Yuqian',''],
    ['M1592','1592','Suresh','Akshath','4168751601'],
    ['M0985','0985','Szczepanowski','Adam','4167129791'],
    ['M1883','1883','Tabanji','Jules','6477845313'],
    ['M2290','2290','Tam','Steve','4169316490'],
    ['M2416','2416','Tanveen','Aneeq',''],
    ['M1500','1500','Tao','Tao','6478839585'],
    ['M1552','1552','Tao','Licheng (Tom)',''],
    ['M2446','2446','Tao','Arina',''],
    ['M1713','1713','Tariq','Bilal','6476751815'],
    ['M0236','0236','Tarnovskaya','Tatiana',''],
    ['M0235','0235','Tarnovski','Vitali',''],
    ['GAMETIME','','TEST','GT TEST',''],
    ['M0555','0555','Thalmeiner','Walter','4165242396'],
    ['M2228','2228','Thambirajah','Mia',''],
    ['M2515','2515','Thambirajah','Nola',''],
    ['M1820','1820','Tian','Kevin',''],
    ['M2320','2320','Tian','Feng',''],
    ['M2301','2301','Tipold','Gayle',''],
    ['M2302','2302','Tipold','Gerry','4167091761'],
    ['M2393','2393','Tong','Xiaoling','5197027585'],
    ['M2390','2390','Topic','Stella',''],
    ['M1813','1813','Tran','David','6472063930'],
    ['M1520','1520','Tung','Alvin','4167236535'],
    ['M1631','1631','Turner','David','2894008658'],
    ['M2514','2514','Tuteja','Saahil',''],
    ['M0542','0542','Varma','Sanjeev','6478187679'],
    ['M1652','1652','Varma','Aditi',''],
    ['M2509','2509','Varma','Advaith',''],
    ['M0554','0554','Vehauc','Andreja','4168957932'],
    ['M2438','2438','Velasquez','Felipe',''],
    ['M2281','2281','Velastegui','Marco','2897959884'],
    ['M1758','1758','Vienneau','Diana','9056080309'],
    ['M1411','1411','Volzhanin','Helen','6474071584'],
    ['M2466','2466','Vopni','Gloria','4165645207'],
    ['M2467','2467','Vopni','Ryan',''],
    ['M2468','2468','Vopni','Vincent',''],
    ['M2510','2510','Waese','Destan','4164321976'],
    ['M2517','2517','Waese','Callen',''],
    ['M0662','0662','Wald','Steven','2898340274'],
    ['M1157','1157','Wan','Michael','9058198957'],
    ['M1931','1931','Wang','Rose',''],
    ['M2270','2270','Wang','Kevin','6479551027'],
    ['M1185','1185','Wei','Grace','4164179610'],
    ['M2337','2337','Wei','Cindy',''],
    ['M1060','1060','Weston','Brian','9055105328'],
    ['M2460','2460','Whittaker','Cathy',''],
    ['M2461','2461','Whittaker','Murray',''],
    ['M0256','0256','Willson','Jennifer',''],
    ['M2452','2452','Wojcik','Pawel',''],
    ['M0258','0258','Wong','Sally','4164000388'],
    ['M2512','2512','Wong','Julie',''],
    ['M0358','0358','Woods','Gary','9053345165'],
    ['M2434','2434','Wu','Florence',''],
    ['M2442','2442','Wu','Mark',''],
    ['M2489','2489','Wu','Chun',''],
    ['M1283','1283','Xiao','Vivian','15148857588'],
    ['M2300','2300','Xiao','Olivia',''],
    ['M1762','1762','Xie','Evan','2892420354'],
    ['M2123','2123','Xie','Eric',''],
    ['M2425','2425','Xie','Steven',''],
    ['M1957','1957','Xu','Xiaofeng',''],
    ['M1959','1959','Xu','Audrey',''],
    ['M1960','1960','Xu','Lydia',''],
    ['M2278','2278','Xu','Guanjun',''],
    ['M2441','2441','Xu','Chen',''],
    ['M0791','0791','Yan','Jiahua',''],
    ['M2253','2253','Yang','Jun',''],
    ['M2259','2259','Yang','Shan',''],
    ['M2387','2387','Yang','Cyndy',''],
    ['M2485','2485','Yang','Xu',''],
    ['M2490','2490','Yang','Feifei',''],
    ['M0760','0760','Yashar','Neggie','9054640314'],
    ['M2311','2311','Yau','Samantha','6474624917'],
    ['M0262','0262','Yee','Frank',''],
    ['M0263','0263','Yee','Amy',''],
    ['M2372','2372','You','Hongbin',''],
    ['M2477','2477','Yu','Lawrence',''],
    ['M2284','2284','Yue','Langrui',''],
    ['M2285','2285','Yue','Darren',''],
    ['M2355','2355','Yue','Weimin',''],
    ['M1930','1930','Zhang','Luke',''],
    ['M2138','2138','Zhang','Oscar',''],
    ['M2260','2260','Zhang','Jason',''],
    ['M2266','2266','Zhang','Michael','4168382322'],
    ['M2280','2280','Zhang','Taloz','6476489711'],
    ['M2303','2303','Zhang','Wei','2899937899'],
    ['M2304','2304','Zhang','Isabell',''],
    ['M2305','2305','Zhang','Sophia',''],
    ['M2315','2315','Zhang','Jingbin','7807086514'],
    ['M2377','2377','Zhang','Jesse',''],
    ['M2378','2378','Zhang','Kevin',''],
    ['M2379','2379','Zhang','Max',''],
    ['M2380','2380','Zhang','Maisie',''],
    ['M2407','2407','Zhang','Eric',''],
    ['M2410','2410','Zhang','Junpeng',''],
    ['M2411','2411','Zhang','Linjing',''],
    ['M2501','2501','Zhang','Ethan',''],
    ['M2503','2503','Zhang','Felix',''],
    ['M2504','2504','Zhang','Cynthia',''],
    ['M1585','1585','Zhao','Frank','4162728967'],
    ['M2478','2478','Zhao','Shuze',''],
    ['M2159','2159','Zharkov','Danil','4169945263'],
    ['M2374','2374','Zharkov','Sergey',''],
    ['M1022','1022','Zheng','Qing','4165770689'],
    ['M2224','2224','Zheng','Lucas','4165770689'],
    ['M2448','2448','Zheng','Liang',''],
    ['M1724','1724','Zhou','Linus',''],
    ['M1725','1725','Zhou','Jonathan',''],
    ['M2158','2158','Zhou','Abigail',''],
    ['M2367','2367','Zhou','Louis','6132233309'],
    ['M1499','1499','Zubicek','Jaromir','6479664964'],
  ];
  _data.members = [];
  _data._seq.members = 0;
  const tsV2 = new Date().toISOString();
  S2.forEach(([club_number, pin, last_name, first_name, phone]) => {
    _data._seq.members = (_data._seq.members || 0) + 1;
    const member_type = String(club_number).startsWith('J') ? 'junior' : 'full';
    _data.members.push({ id: _data._seq.members, club_number, first_name, last_name, phone: phone||'', email:'', pin, member_type, active:true, created_at:tsV2 });
  });
  _data._migrations.memberImport2026SepV2 = true;
  save();
  console.log('Member V2 import:', _data.members.length, 'seeded with club-number PINs.');
}

// Declared here (not with the staff helpers below) so load-time migrations can add pros.
const STAFF_ROLES = ['admin', 'manager', 'staff', 'pro', 'contractor'];
const STAFF_PALETTE = ['#2c5c9c', '#0d9488', '#8b5cf6', '#f59e0b', '#dc2626', '#059669', '#d97706', '#7c3aed', '#0891b2', '#db2777'];
if (!_data._migrations.proSchedule2026) {
  const DAYMAP = { mon: 'Mon', tue: 'Tue', wed: 'Wed', thu: 'Thu', fri: 'Fri', sat: 'Sat', sun: 'Sun' };
  function parseDayTime(dt) {
    let s = String(dt || '').trim();
    let note = '';
    const paren = s.match(/\(([^)]*)\)\s*$/);
    if (paren) { note = paren[1]; s = s.slice(0, paren.index).trim(); }
    const firstDigit = s.search(/\d/);
    if (firstDigit === -1) return null;
    const dayPart = s.slice(0, firstDigit);
    const timePart = s.slice(firstDigit).trim();
    const found = (dayPart.toLowerCase().match(/mon|tue|wed|thu|fri|sat|sun/g) || []);
    const days = found.map(d => DAYMAP[d]);
    if (!days.length) return null;
    const [a, b] = timePart.split(/[–—-]/).map(x => (x || '').trim());
    function parse(t) {
      const m = String(t).match(/(\d{1,2})(?::(\d{2}))?\s*(AM|PM)?/i);
      if (!m) return null;
      return { h: parseInt(m[1]), min: m[2] ? parseInt(m[2]) : 0, mer: m[3] ? m[3].toUpperCase() : null };
    }
    const A = parse(a), B = parse(b);
    if (!A || !B) return null;
    if (!B.mer && A.mer) B.mer = A.mer;
    if (!A.mer && B.mer) A.mer = B.mer;
    const to24 = (p) => { let h = p.h % 12; if (p.mer === 'PM') h += 12; return String(h).padStart(2, '0') + ':' + String(p.min).padStart(2, '0'); };
    return { days, start: to24(A), end: to24(B), timeLabel: timePart, note };
  }
  for (const c of (_data.academy_classes || [])) {
    if (c.active === false) continue;
    const p = parseDayTime(c.day_time);
    if (!p) continue;
    for (const day of p.days) {
      _data._seq.pro_schedule_slots = (_data._seq.pro_schedule_slots || 0) + 1;
      _data.pro_schedule_slots.push({
        id: _data._seq.pro_schedule_slots,
        class_id: c.id,
        day, start: p.start, end: p.end, time_label: p.timeLabel,
        program: c.program, category: c.category || 'junior',
        court: null, capacity: null, pro_ids: [], note: p.note || '', active: true,
      });
    }
  }
  _data._migrations.proSchedule2026 = true;
  save();
  console.log('Seeded pro schedule slots:', _data.pro_schedule_slots.length);
}

// One-time: pre-assign pros + courts to the clearest entries read from the court
// schedule PDF (a starter for cross-checking). Names resolve against the LIVE staff
// directory at runtime, so ids match whatever roster exists. Ambiguous/private cells
// are intentionally left blank. Runs once (flag), so hand-edits are never overwritten.
if (!_data._migrations.proScheduleAssign2026v1 && Array.isArray(_data.pro_schedule_slots) && _data.pro_schedule_slots.length) {
  const ALIAS = { katia: 'katya', donski: 'mike donski' };
  function resolvePro(name) {
    const n = String(name).trim().toLowerCase();
    const target = ALIAS[n] || n;
    const st = _data.staff;
    let m = st.find(s => s.name.toLowerCase() === target)
         || st.find(s => s.name.toLowerCase().startsWith(target))
         || st.find(s => s.name.toLowerCase().includes(target));
    if (!m && target === 'mike donski') m = st.find(s => s.name.toLowerCase() === 'mike');
    return m ? m.id : null;
  }
  // {day, t:start24, prog:substring, not?:excludeSubstring, pros:[], courts:[]}
  const ASSIGN = [
    { day: 'Mon', t: '17:30', prog: 'future stars', not: 'plus', pros: ['Katya', 'Sylvia', 'Angie'], courts: ['6'] },
    { day: 'Mon', t: '18:30', prog: 'future stars plus', pros: ['Megan', 'Katya', 'Sylvia', 'Angie'], courts: ['6'] },
    { day: 'Mon', t: '18:00', prog: 'adult intermediate', pros: ['Martin'], courts: ['5'] },
    { day: 'Tue', t: '09:30', prog: 'adult intermediate', pros: ['Megan'], courts: ['1'] },
    { day: 'Wed', t: '18:30', prog: 'future stars plus', pros: ['Katya', 'Matthew', 'Nino', 'Sylvia'], courts: ['6'] },
    { day: 'Wed', t: '16:30', prog: 'bronze', pros: ['Katya', 'Nino', 'Sylvia'], courts: ['6'] },
    { day: 'Wed', t: '17:30', prog: 'bronze', pros: ['Katya', 'Nino', 'Sylvia'], courts: ['6'] },
    { day: 'Sat', t: '09:00', prog: 'future stars', not: 'plus', pros: ['Katya', 'Angie'], courts: ['6'] },
  ];
  let assigned = 0;
  for (const e of ASSIGN) {
    const slot = _data.pro_schedule_slots.find(s =>
      s.day === e.day && s.start === e.t &&
      s.program.toLowerCase().includes(e.prog) &&
      (!e.not || !s.program.toLowerCase().includes(e.not))
    );
    if (!slot) continue;
    const ids = e.pros.map(resolvePro).filter(Boolean);
    if (ids.length) { slot.pro_ids = ids; assigned++; }
    if (Array.isArray(e.courts)) slot.courts = e.courts.slice();
  }
  _data._migrations.proScheduleAssign2026v1 = true;
  save();
  console.log('Pro schedule starter assignments applied to', assigned, 'slots.');
}

// One-time: add Monday's non-catalog performance/house-league blocks (from the court
// sheet) that don't exist as sellable classes. Names resolve against the live roster.
if (!_data._migrations.proScheduleMondayPerf2026v1 && Array.isArray(_data.pro_schedule_slots)) {
  const ALIAS = { katia: 'katya', donski: 'mike donski' };
  const resolve = (name) => {
    const target = ALIAS[String(name).trim().toLowerCase()] || String(name).trim().toLowerCase();
    const st = _data.staff;
    let m = st.find(s => s.name.toLowerCase() === target)
         || st.find(s => s.name.toLowerCase().startsWith(target))
         || st.find(s => s.name.toLowerCase().includes(target));
    if (!m && target === 'mike donski') m = st.find(s => s.name.toLowerCase() === 'mike');
    return m ? m.id : null;
  };
  const MON_EXTRA = [
    { start: '14:30', end: '16:30', time_label: '2:30–4:30 PM', program: 'Performance Program (Afternoon)', category: 'performance', courts: ['1','2','3','4','5'], pros: ['David','Daniel H','Roman','Mike Donski','Martin'] },
    { start: '13:30', end: '14:30', time_label: '1:30–2:30 PM', program: 'U18 Performance Fitness', category: 'performance', courts: ['6'], pros: ['Martin'] },
    { start: '19:30', end: '21:00', time_label: '7:30–9:00 PM', program: "Men's House League", category: 'other', courts: ['3','4','5'], pros: ['Mike Donski','Roman','Daniel G'] },
  ];
  for (const e of MON_EXTRA) {
    // skip if a Monday slot with this program already exists (idempotent-ish)
    if (_data.pro_schedule_slots.some(s => s.day === 'Mon' && s.program === e.program)) continue;
    _data._seq.pro_schedule_slots = (_data._seq.pro_schedule_slots || 0) + 1;
    _data.pro_schedule_slots.push({
      id: _data._seq.pro_schedule_slots, class_id: null, day: 'Mon',
      start: e.start, end: e.end, time_label: e.time_label,
      program: e.program, category: e.category,
      court: null, courts: e.courts.slice(),
      capacity: null, pro_ids: e.pros.map(resolve).filter(Boolean),
      note: 'Starter from court sheet — verify', active: true,
    });
  }
  _data._migrations.proScheduleMondayPerf2026v1 = true;
  save();
  console.log('Added Monday performance/house-league slots.');
}

// One-time: migrate flat (courts + pro_ids) starter data into the per-court map so the
// drag-and-drop board shows existing assignments. One pro per court when counts match;
// otherwise all pros land on the first court for the user to re-drag.
if (!_data._migrations.proScheduleCourtPros2026v1 && Array.isArray(_data.pro_schedule_slots)) {
  for (const s of _data.pro_schedule_slots) {
    if (s.court_pros && Object.keys(s.court_pros).length) continue;
    const courts = Array.isArray(s.courts) ? s.courts : [];
    const pros = Array.isArray(s.pro_ids) ? s.pro_ids : [];
    if (!pros.length || !courts.length) { s.court_pros = s.court_pros || {}; continue; }
    const cp = {};
    if (courts.length === pros.length) courts.forEach((c, i) => { cp[c] = [pros[i]]; });
    else cp[courts[0]] = pros.slice();
    s.court_pros = cp;
  }
  _data._migrations.proScheduleCourtPros2026v1 = true;
  save();
  console.log('Backfilled per-court pro assignments.');
}

// One-time cleanup: purge deprecated pro records (Katya — incl. any duplicate) that
// lingered on the scheduler board because earlier deletes never scrubbed slot
// assignments. Removes every matching staff record AND clears their ids from all
// pro-schedule slots. Flag-gated → runs once on the live volume, then never again.
if (!_data._migrations.purgeDeprecatedPros2026v1) {
  const PURGE = ['katya', 'katia'];
  const gone = (_data.staff || []).filter(s => PURGE.includes(String(s.name).trim().toLowerCase()));
  for (const s of gone) {
    _data.staff = _data.staff.filter(x => x.id !== s.id);
    scrubStaffFromSlots(s.id);
  }
  _data._migrations.purgeDeprecatedPros2026v1 = true;
  save();
  if (gone.length) console.log('Purged deprecated pros:', gone.map(s => s.name + '#' + s.id).join(', '));
}

// One-time: correct role drift for the founders. Craig(1) and Jaime(2) run the desk
// (role 'admin'), not the courts — admins are excluded from the pro-schedule drag rail.
// If either drifted to 'manager'/'pro' on the live volume they wrongly appear as an
// assignable pro. Force them back to admin. Flag-gated → runs once.
if (!_data._migrations.fixFounderRoles2026v1) {
  let fixed = 0;
  for (const s of (_data.staff || [])) {
    if ((s.id === 1 || s.id === 2) && s.role !== 'admin') { s.role = 'admin'; fixed++; }
  }
  _data._migrations.fixFounderRoles2026v1 = true;
  save();
  if (fixed) console.log('Corrected founder roles to admin:', fixed);
}

// Migration: replace the recurring weekly rota with Victor's Sept 2026 schedule.
// Runs ONCE (flag-gated). Resolves staff by NAME at runtime so it stays correct
// even if the live volume's staff IDs differ from any local copy. Standard days use
// the global shift blocks (8-1 / 1-6 / 6-11); Thursday and Friday carry per-rule
// custom hours (Thu = 8-4 / 4-11; Fri = 8-12 / 12-4 / 4-11). Existing one-off
// assignments are left untouched (they layer on top and age out by date).
if (!_data._migrations.scheduleRotaSep2026v1) {
  // day_of_week: Sun=0, Mon=1 ... Sat=6.  start/end omitted → use the global shift default.
  const ROTA = [
    // Monday
    { name: 'Vicky',     shift: 'morning',   dow: 1 },
    { name: 'Lily',      shift: 'afternoon', dow: 1 },
    { name: 'Emilia',    shift: 'closing',   dow: 1 },
    // Tuesday
    { name: 'Lily',      shift: 'morning',   dow: 2 },
    { name: 'Angelina',  shift: 'afternoon', dow: 2 },
    { name: 'Dawson',    shift: 'closing',   dow: 2 },
    // Wednesday
    { name: 'Lily',      shift: 'morning',   dow: 3 },
    { name: 'Vicky',     shift: 'afternoon', dow: 3 },
    { name: 'Cassandra', shift: 'closing',   dow: 3 },
    // Thursday — two shifts covering 8-11
    { name: 'Lily',      shift: 'morning',   dow: 4, start: '08:00', end: '16:00' },
    { name: 'Angelina',  shift: 'closing',   dow: 4, start: '16:00', end: '23:00' },
    // Friday — shifted blocks
    { name: 'Vicky',     shift: 'morning',   dow: 5, start: '08:00', end: '12:00' },
    { name: 'Lily',      shift: 'afternoon', dow: 5, start: '12:00', end: '16:00' },
    { name: 'Dawson',    shift: 'closing',   dow: 5, start: '16:00', end: '23:00' },
    // Saturday
    { name: 'Skyler',    shift: 'morning',   dow: 6 },
    { name: 'Ali',       shift: 'afternoon', dow: 6 },
    { name: 'Emilia',    shift: 'closing',   dow: 6 },
    // Sunday
    { name: 'Dawson',    shift: 'morning',   dow: 0 },
    { name: 'Emilia',    shift: 'afternoon', dow: 0 },
    { name: 'Skyler',    shift: 'closing',   dow: 0 },
  ];
  const byName = (n) => (_data.staff || []).find(s => String(s.name).trim().toLowerCase() === n.toLowerCase());
  const START_DATE = '2026-09-08', END_DATE = '2026-12-31';
  const missing = [];
  _data.shift_rules = [];               // replace the recurring rota
  for (const r of ROTA) {
    const s = byName(r.name);
    if (!s) { missing.push(r.name + ' (' + r.shift + '/day' + r.dow + ')'); continue; }
    _data._seq.shift_rules = (_data._seq.shift_rules || 0) + 1;
    _data.shift_rules.push({
      id: _data._seq.shift_rules,
      staff_id: s.id,
      shift: r.shift,
      day_of_week: r.dow,
      start_date: START_DATE,
      end_date: END_DATE,
      start: r.start || null,
      end: r.end || null,
      created_by: 1,
      created_at: now(),
    });
  }
  _data._migrations.scheduleRotaSep2026v1 = true;
  save();
  console.log('Applied Sept 2026 rota: ' + _data.shift_rules.length + ' recurring rules.' +
    (missing.length ? ' MISSING staff (skipped): ' + missing.join(', ') : ''));
}

// Migration: force a first-login password change. Everyone currently shares the
// default password, which defeats role-based access — flag all existing accounts
// so each person sets their own private password on next sign-in.
{
  let changed = false;
  for (const s of (_data.staff || [])) {
    if (s.must_set_password === undefined) { s.must_set_password = true; changed = true; }
  }
  if (changed) { save(); console.log('Flagged all staff for first-login password change.'); }
}

// Migration: normalize the default password to jct2026. Earlier accounts were seeded
// with jct2025 and later ones with jct2026, so a not-yet-logged-in staffer's default
// depended on when they were added. Reset EVERY account still on the shared default
// (must_set_password === true) to jct2026 so the login-screen hint is always correct.
// Accounts where someone already set their own password (flag false) are never touched.
if (!_data._migrations.defaultPwNormalize2026v1) {
  const DEFAULT_PW_HASH = bcrypt.hashSync('jct2026', 10);
  let reset = 0;
  for (const s of (_data.staff || [])) {
    if (s.must_set_password === true) { s.password = DEFAULT_PW_HASH; reset++; }
  }
  _data._migrations.defaultPwNormalize2026v1 = true;
  save();
  console.log('Normalized default password to jct2026 for ' + reset + ' not-yet-logged-in account(s).');
}

// Migration: import the 2026/27 indoor pro schedule from the season court sheet.
// (1) Ensure every teaching pro named on the sheet exists as a role 'pro' account.
// (2) Soft-deactivate the old (last-year) pro-schedule slots — recoverable, never deleted.
// (3) Seed the real group classes for all 7 days with court + pro assignments read from
//     the sheet. Private lessons and one-off fitness micro-blocks are intentionally left
//     out (Victor adds those live). Every slot is flagged for verification.
if (!_data._migrations.proScheduleImport2627v1 && Array.isArray(_data.pro_schedule_slots)) {
  // Rename a bare "Daniel" to "Daniel G" (the sheet distinguishes Daniel G from Daniel B).
  const bareDaniel = (_data.staff || []).find(s => String(s.name).trim().toLowerCase() === 'daniel');
  if (bareDaniel) bareDaniel.name = 'Daniel G';
  // Ensure these pros exist (by exact name, case-insensitive). Mike = "Donski" on the sheet.
  // Create directly (not addCoachAccount, which splits "Daniel B" into first/last and would
  // store the display name as just "Daniel"). Here name holds the full label so it renders
  // in the rail and resolves in the assignment map below.
  const NEED_PROS = ['Martin','Nemanja','Roman','Daniel G','Daniel B','David','Mike','Katia','Angie','Sylvia','Nino','Jay','Kevin','Matthew'];
  for (const nm of NEED_PROS) {
    const exists = (_data.staff || []).some(s => String(s.name).trim().toLowerCase() === nm.toLowerCase());
    if (!exists) {
      const id = nextId('staff');
      _data.staff.push({
        id, name: nm, last_name: '', role: 'pro', is_pro: true,
        color: STAFF_PALETTE[(id - 1) % STAFF_PALETTE.length],
        password: bcrypt.hashSync('jct2026', 10), must_set_password: true,
      });
    }
  }
  const ALIAS = { donski: 'mike' };
  const resolve = (name) => {
    const t = ALIAS[String(name).trim().toLowerCase()] || String(name).trim().toLowerCase();
    const m = (_data.staff || []).find(s => String(s.name).trim().toLowerCase() === t);
    return m ? m.id : null;
  };
  const CAT = { a: 'adult', j: 'junior', p: 'performance' };
  // [day, start24, end24, timeLabel, program, catCode, "courts space-sep", "pros comma-sep"]
  const SLOTS = [
    // MONDAY
    ['Mon','09:30','11:00','9:30–11:00 AM','Cardio Tennis','a','1','Martin'],
    ['Mon','11:00','12:30','11:00–12:30 PM','Adult Introductory','a','1','Daniel G'],
    ['Mon','11:00','12:30','11:00–12:30 PM','Adult Intermediate','a','2','Martin'],
    ['Mon','14:30','16:30','2:30–4:30 PM','Performance Program (Afternoon)','p','1 2 3 4 5','David,Roman,Nemanja,Mike,Martin'],
    ['Mon','16:30','18:00','4:30–6:00 PM','U9','j','1','David'],
    ['Mon','16:30','18:00','4:30–6:00 PM','National Transition','j','3','Nemanja'],
    ['Mon','16:30','17:30','4:30–5:30 PM','Bronze (Rising Stars)','j','6','Katia,Angie,Sylvia'],
    ['Mon','17:30','18:30','5:30–6:30 PM','Future Stars','j','6','Katia,Angie,Sylvia'],
    ['Mon','18:00','19:30','6:00–7:30 PM','U13','j','1','Daniel G'],
    ['Mon','18:00','19:30','6:00–7:30 PM','Adult Intermediate','a','5','Martin'],
    ['Mon','18:30','19:30','6:30–7:30 PM','Future Stars Plus','j','6','Katia,Angie,Sylvia'],
    ['Mon','19:30','21:00','7:30–9:00 PM',"Men's House League",'p','1 2 3 4','Martin,Nemanja,Roman,Daniel B'],
    // TUESDAY
    ['Tue','09:30','11:00','9:30–11:00 AM','Adult Intermediate','a','1 2','Daniel B,Jay'],
    ['Tue','11:00','12:30','11:00–12:30 PM','Adult Intermediate Plus','a','1 2','Daniel B,Jay'],
    ['Tue','14:30','16:30','2:30–4:30 PM','Performance Program (Afternoon)','p','1 2','Martin,David'],
    ['Tue','16:30','18:00','4:30–6:00 PM','U10','j','1','Nemanja'],
    ['Tue','16:30','18:00','4:30–6:00 PM','Gold','j','5','Kevin'],
    ['Tue','16:30','17:30','4:30–5:30 PM','Future Stars','j','6','Nino,Matthew,Sylvia'],
    ['Tue','18:00','19:30','6:00–7:30 PM','U13','j','1','Roman'],
    ['Tue','18:00','19:30','6:00–7:30 PM','National Transition B','j','5','Daniel G'],
    ['Tue','19:30','21:00','7:30–9:00 PM','Advanced (Invitation Only)','a','4','Matthew'],
    ['Tue','19:30','21:00','7:30–9:00 PM','Adult Intermediate Plus','a','6','Roman'],
    // WEDNESDAY
    ['Wed','09:00','10:30','9:00–10:30 AM','Adult Intermediate','a','1 2','Martin,Jay'],
    ['Wed','10:30','12:00','10:30–12:00 PM','Adult Intermediate','a','1','Martin'],
    ['Wed','10:30','12:00','10:30–12:00 PM','Adult Introductory','a','2','Jay'],
    ['Wed','16:30','18:00','4:30–6:00 PM','U9','j','1','Mike'],
    ['Wed','16:30','18:00','4:30–6:00 PM','National Transition','j','3','Nemanja'],
    ['Wed','16:30','17:30','4:30–5:30 PM','Bronze (Rising Stars)','j','6','Katia,Angie,Nino,Sylvia'],
    ['Wed','17:30','18:30','5:30–6:30 PM','Bronze (Rising Stars)','j','6','Katia,Angie,Nino,Sylvia'],
    ['Wed','18:00','19:30','6:00–7:30 PM','Gold','j','1','Daniel G'],
    ['Wed','18:00','19:30','6:00–7:30 PM','U13','j','2','Roman'],
    ['Wed','18:30','19:30','6:30–7:30 PM','Future Stars Plus','j','6','Katia,Angie,Nino,Sylvia'],
    ['Wed','19:30','21:00','7:30–9:00 PM','Ladies House League','p','4','Kevin'],
    // THURSDAY
    ['Thu','09:30','11:00','9:30–11:00 AM','Adult Intermediate Plus','a','1','Roman'],
    ['Thu','09:30','11:00','9:30–11:00 AM',"Parkinson's Program",'p','5','Jay'],
    ['Thu','11:00','12:30','11:00–12:30 PM','Cardio Tennis','a','1','Roman'],
    ['Thu','16:30','18:00','4:30–6:00 PM','U10','j','1','Martin'],
    ['Thu','16:30','18:00','4:30–6:00 PM','National Transition','j','4','Nemanja'],
    ['Thu','18:00','19:30','6:00–7:30 PM','U13','j','1','Roman'],
    ['Thu','18:00','19:30','6:00–7:30 PM','National Transition B','j','5','Nemanja'],
    ['Thu','19:30','20:30','7:30–8:30 PM','Adult Intermediate','a','1','Mike'],
    ['Thu','20:30','21:30','8:30–9:30 PM','Adult Introductory','a','1','Jay'],
    ['Thu','20:30','21:30','8:30–9:30 PM','Cardio Tennis','a','2','Matthew'],
    // FRIDAY
    ['Fri','09:00','10:30','9:00–10:30 AM','Adult Introductory','a','1','Daniel G'],
    ['Fri','09:00','10:30','9:00–10:30 AM','Adult Intermediate','a','2','Daniel B'],
    ['Fri','10:30','12:00','10:30–12:00 PM','Adult Intermediate','a','1 2','Daniel G,Daniel B'],
    ['Fri','12:00','13:30','12:00–1:30 PM','Adult Intermediate Plus','a','1','Daniel G'],
    ['Fri','16:30','18:00','4:30–6:00 PM','U10','j','1','Nemanja'],
    ['Fri','16:30','17:30','4:30–5:30 PM','Silver (Shooting Stars)','j','5','Matthew'],
    ['Fri','16:30','17:30','4:30–5:30 PM','Silver (Shooting Stars)','j','6','Katia'],
    ['Fri','17:30','18:30','5:30–6:30 PM','Bronze (Rising Stars)','j','6','Matthew,Katia'],
    ['Fri','18:00','19:30','6:00–7:30 PM','U9 Performance','j','1','Daniel G'],
    ['Fri','18:00','19:30','6:00–7:30 PM','National Transition B','j','3','Kevin'],
    ['Fri','18:00','19:30','6:00–7:30 PM','Adult Intermediate Plus','a','5','Roman'],
    ['Fri','18:30','19:30','6:30–7:30 PM','Silver (Shooting Stars)','j','6','Katia'],
    ['Fri','19:30','21:00','7:30–9:00 PM','Round Robin','p','2','Daniel G'],
    // SATURDAY
    ['Sat','07:00','09:00','7:00–9:00 AM','National Program','p','1 2 3 4','Mike,Kevin,Daniel B,Nemanja'],
    ['Sat','09:00','10:00','9:00–10:00 AM','Adult Introductory','a','1','Daniel G'],
    ['Sat','09:00','10:00','9:00–10:00 AM','Future Stars','j','6','Katia,Angie'],
    ['Sat','09:00','10:00','9:00–10:00 AM','Bronze (Rising Stars)','j','6','Nino,Sylvia'],
    ['Sat','10:00','11:00','10:00–11:00 AM','Bronze (Rising Stars)','j','5','Katia,Angie'],
    ['Sat','10:00','11:00','10:00–11:00 AM','Adult Intermediate','a','3','Daniel G'],
    ['Sat','11:00','12:00','11:00–12:00 PM','Silver (Shooting Stars)','j','3','Jay'],
    ['Sat','11:00','12:00','11:00–12:00 PM','Silver (Shooting Stars)','j','4','Katia'],
    ['Sat','11:00','12:00','11:00–12:00 PM','Silver (Shooting Stars)','j','5','Angie'],
    ['Sat','12:00','13:00','12:00–1:00 PM','Bronze (Rising Stars)','j','3','Jay'],
    ['Sat','12:00','13:00','12:00–1:00 PM','Adult Intermediate','a','4','Daniel G'],
    ['Sat','12:00','13:00','12:00–1:00 PM','Silver (Shooting Stars)','j','5','Jay'],
    ['Sat','12:00','13:00','12:00–1:00 PM','Silver (Shooting Stars)','j','6','Katia'],
    ['Sat','13:00','14:30','1:00–2:30 PM','Gold','j','3','Angie'],
    ['Sat','14:30','16:00','2:30–4:00 PM','Adult Intermediate Plus','a','5','Jay'],
    // SUNDAY
    ['Sun','09:00','10:00','9:00–10:00 AM','Silver (Shooting Stars)','j','5','Jay'],
    ['Sun','09:00','10:00','9:00–10:00 AM','Future Stars','j','6','Nino'],
    ['Sun','10:00','11:00','10:00–11:00 AM','Adult Introductory','a','5','Jay'],
    ['Sun','10:00','11:00','10:00–11:00 AM','Bronze (Rising Stars)','j','6','Nino,Katia'],
    ['Sun','11:00','12:00','11:00–12:00 PM','Bronze (Rising Stars)','j','5','Jay'],
    ['Sun','11:00','12:00','11:00–12:00 PM','Adult Intermediate','a','6','Jay'],
    ['Sun','12:00','13:00','12:00–1:00 PM','Silver (Shooting Stars)','j','5','Katia'],
    ['Sun','13:00','14:00','1:00–2:00 PM','Silver (Shooting Stars)','j','5','Matthew'],
    ['Sun','13:00','14:00','1:00–2:00 PM','Adult Intermediate','a','6','Jay'],
    ['Sun','14:00','16:00','2:00–4:00 PM','National Transition B','j','1','Matthew,Kevin'],
    ['Sun','16:00','17:30','4:00–5:30 PM','U10 Performance','j','3','Matthew,Kevin'],
  ];
  // Soft-deactivate the old board (recoverable).
  let deactivated = 0;
  for (const s of _data.pro_schedule_slots) { if (s.active !== false) { s.active = false; deactivated++; } }
  // Insert the new slots.
  for (const row of SLOTS) {
    const [day, start, end, label, program, catCode, courtsStr, prosStr] = row;
    const courts = String(courtsStr).split(/\s+/).filter(Boolean);
    const proIds = String(prosStr).split(',').map(x => resolve(x.trim())).filter(Boolean);
    // Build the per-court map: one pro per court when counts line up, else all on court 1.
    const court_pros = {};
    if (courts.length > 1 && proIds.length === courts.length) {
      courts.forEach((c, i) => { court_pros[c] = [proIds[i]]; });
    } else if (courts.length) {
      court_pros[courts[0]] = proIds.slice();
    }
    _data._seq.pro_schedule_slots = (_data._seq.pro_schedule_slots || 0) + 1;
    _data.pro_schedule_slots.push({
      id: _data._seq.pro_schedule_slots,
      class_id: null, type: 'class',
      day, start, end, time_label: label,
      program, category: CAT[catCode] || 'junior',
      court: null, courts: courts.slice(), court_pros,
      capacity: null, coaches: '',
      pro_ids: [...new Set(proIds)],
      note: 'Imported from 26/27 sheet — verify court & pro', active: true,
    });
  }
  _data._migrations.proScheduleImport2627v1 = true;
  save();
  console.log('Imported 26/27 pro schedule: ' + SLOTS.length + ' slots added, ' + deactivated + ' old slots deactivated.');
}

// Migration: expense line items (replaces single period_expenses amount)
if (!Array.isArray(_data.expense_items)) {
  if (!_data._seq) _data._seq = {};
  _data._seq.expense_items = 0;
  _data.expense_items = [];
  save();
}

// ─── Helpers ─────────────────────────────────────────────────────────────────

function nextId(table) {
  _data._seq[table] = (_data._seq[table] || 0) + 1;
  return _data._seq[table];
}

function now() { return new Date().toISOString(); }

// ─── Staff ───────────────────────────────────────────────────────────────────

function getAllStaff() {
  return _data.staff.map(s => ({ id: s.id, name: s.name, color: s.color, role: s.role, badge: s.badge || null }))
    .sort((a, b) => a.name.localeCompare(b.name));
}

function getStaffById(id) {
  return _data.staff.find(s => s.id === parseInt(id));
}

// TEMPORARY dev-view allowlist. These staff ids may use "View as" to see the hub
// through another member's eyes during testing. Deliberately id-based (not role)
// so Victor (manager) is included but David (also manager) is not. Craig=1, Jaime=2,
// Victor=3. Remove this feature / trim the list when testing wraps.
const VIEW_AS_TESTER_IDS = [1, 2, 3];
function canViewAs(realId) {
  return VIEW_AS_TESTER_IDS.includes(parseInt(realId));
}

// Resolve the "acting" staff id. Allow-listed testers may temporarily view the hub
// through another staff member's eyes (dev / testing). Everyone else always acts as
// themselves. Returns the effective staff id to use for reads, unread counts,
// receipts, posting and replying.
function getEffectiveStaffId(realId, viewAsId) {
  if (canViewAs(realId) && viewAsId) {
    const viewed = getStaffById(viewAsId);
    if (viewed) return viewed.id;
  }
  return parseInt(realId);
}

function updatePassword(staffId, hash) {
  const s = _data.staff.find(s => s.id === parseInt(staffId));
  if (s) { s.password = hash; s.must_set_password = false; save(); }
}

function addStaff({ name, color, role, passwordHash }) {
  const id = nextId('staff');
  _data.staff.push({ id, name, color, role, password: passwordHash, must_set_password: true });
  save();
  return { id, name, color, role };
}
function setInitialPassword(staffId, hash) {
  const s = _data.staff.find(x => x.id === parseInt(staffId));
  if (!s) return false;
  s.password = hash; s.must_set_password = false; save(); return true;
}
// A manager reset: set a temporary password AND re-flag must_set_password so the
// staff member is forced to choose their own again on next login.
function managerResetPassword(staffId, hash) {
  const s = _data.staff.find(x => x.id === parseInt(staffId));
  if (!s) return false;
  s.password = hash; s.must_set_password = true; save(); return true;
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
  scrubStaffFromSlots(id);   // clear ghost court/board assignments so the person can't linger
  save();
  return true;
}

// Remove a staff id from every pro-schedule slot (pro_ids + court_pros). Called on
// delete so a removed person never lingers as a ghost assignment on the board.
function scrubStaffFromSlots(id) {
  const sid = parseInt(id);
  let changed = false;
  for (const s of (_data.pro_schedule_slots || [])) {
    if (Array.isArray(s.pro_ids) && s.pro_ids.includes(sid)) {
      s.pro_ids = s.pro_ids.filter(x => x !== sid); changed = true;
    }
    if (s.court_pros) {
      for (const c of Object.keys(s.court_pros)) {
        const arr = s.court_pros[c];
        if (Array.isArray(arr) && arr.includes(sid)) {
          s.court_pros[c] = arr.filter(x => x !== sid); changed = true;
          if (!s.court_pros[c].length) delete s.court_pros[c];
        }
      }
    }
  }
  return changed;
}

// ─── Messages ─────────────────────────────────────────────────────────────────

function getMessages({ limit = 30, offset = 0, staffId, audience }) {
  const allStaff = _data.staff;
  const vid = parseInt(staffId);
  const viewer = allStaff.find(s => s.id === vid);
  const viewerIsMgmt = viewer && (viewer.role === 'admin' || viewer.role === 'manager');
  const viewerIsPro  = viewer && viewer.role === 'pro';

  // Two separate comms logs live in one table, split by `audience`:
  //   'office' (default) = office staff + management (+ contractor) — pros excluded
  //   'pro'              = the 6 teaching pros + management (David, Victor, Craig, Jaime)
  // A viewer only ever sees one audience: pros → pro, office/contractor → office,
  // management → whichever audience they're currently viewing (query param).
  // Pros are always resolved to the pro log (never stranded on an empty office log);
  // office/contractor → office; management → whichever audience they requested.
  const aud = viewerIsPro ? 'pro' : (audience === 'pro' ? 'pro' : 'office');
  if (aud === 'pro' && !(viewerIsMgmt || viewerIsPro)) return [];
  const inAudience = _data.messages.filter(m => (m.audience || 'office') === aud);

  // Privacy: management sees the whole log for the audience (oversight). Everyone else
  // only sees a note if they authored it, it targets them specifically, or it's an
  // everyone-note within their audience. Targeted notes never reach a non-recipient's
  // browser. (Admins in "view as" mode inherit the viewed person's id.)
  const visible = viewerIsMgmt ? inAudience : inAudience.filter(m =>
    m.staff_id === vid ||
    (Array.isArray(m.recipients) && m.recipients.includes(vid)) ||
    (!m.recipients)
  );

  const sorted = [...visible].sort((a, b) => new Date(b.created_at) - new Date(a.created_at));
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
    const recipients = msg.recipients || null; // null = everyone within this audience
    const audMembers = aud === 'pro'
      ? allStaff.filter(s => ['pro', 'admin', 'manager'].includes(s.role))
      : allStaff.filter(s => s.role !== 'pro');
    const receiptStaff = recipients
      ? allStaff.filter(s => recipients.includes(s.id))
      : audMembers;

    return {
      id: msg.id,
      content: msg.content,
      shift: msg.shift,
      category: msg.category || 'general',
      time_sensitive: !!msg.time_sensitive,
      audience: aud,
      recipients,
      receipt_staff: receiptStaff.map(s => ({ id: s.id, name: s.name, color: s.color })),
      created_at: msg.created_at,
      edited_at: msg.edited_at || null,
      show_on: msg.show_on || null,
      urgent_cleared_at: msg.urgent_cleared_at || null,
      urgent_cleared_by_name: msg.urgent_cleared_by ? ((allStaff.find(s => s.id === msg.urgent_cleared_by) || {}).name || null) : null,
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

function createMessage({ staffId, content, shift, category, recipients, show_on, audience, time_sensitive }) {
  const id = nextId('messages');
  const aud = audience === 'pro' ? 'pro' : 'office';
  const officeCategories = ['urgent', 'membership', 'pro-shop', 'maintenance', 'academy', 'general'];
  const proCategories = ['general', 'class-switch', 'player-assessment', 'sub-coverage', 'player-progress', 'program', 'equipment', 'incident'];
  const validCategories = aud === 'pro' ? proCategories : officeCategories;
  // show_on: 'YYYY-MM-DD' to surface the note on a future day, else null (shows on the day it was posted)
  const validShowOn = (typeof show_on === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(show_on)) ? show_on : null;
  // recipients: null = everyone (within audience), array of staff IDs = targeted
  const msg = {
    id,
    staff_id: parseInt(staffId),
    content,
    shift,
    category: validCategories.includes(category) ? category : 'general',
    time_sensitive: !!time_sensitive,
    audience: aud,
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

function getUnreadCount(staffId, audience) {
  const sid = parseInt(staffId);
  const viewer = _data.staff.find(s => s.id === sid);
  const viewerIsPro = viewer && viewer.role === 'pro';
  const viewerIsMgmt = viewer && (viewer.role === 'admin' || viewer.role === 'manager');
  const aud = viewerIsPro ? 'pro' : (audience === 'pro' ? 'pro' : 'office');
  if (aud === 'pro' && !(viewerIsPro || viewerIsMgmt)) return 0;
  const t = new Date();
  const todayStr = `${t.getFullYear()}-${String(t.getMonth()+1).padStart(2,'0')}-${String(t.getDate()).padStart(2,'0')}`;
  return _data.messages.filter(msg => {
    if ((msg.audience || 'office') !== aud) return false;    // other audience's log
    if (msg.staff_id === sid) return false;                 // own messages don't count
    if (msg.show_on && msg.show_on > todayStr) return false; // scheduled for a future day
    const isRecipient = msg.recipients
      ? (Array.isArray(msg.recipients) && msg.recipients.includes(sid))
      : true;                                                // everyone within this audience
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

// Edit a note's content. Authorisation (author-or-management) is enforced in the route.
function editMessage(messageId, content) {
  const m = _data.messages.find(x => x.id === parseInt(messageId));
  if (!m) return null;
  m.content = String(content).slice(0, 4000);
  m.edited_at = now();
  save();
  return m;
}

// Clear (or restore) an urgent note's dashboard pin. Clearing does NOT delete or hide
// the note from the comms log — it only drops it out of the dashboard's pinned-to-top
// position. Records who cleared it and when.
function setUrgentCleared(messageId, staffId, cleared = true) {
  const m = _data.messages.find(x => x.id === parseInt(messageId));
  if (!m) return null;
  if (cleared) { m.urgent_cleared_at = now(); m.urgent_cleared_by = parseInt(staffId); }
  else { m.urgent_cleared_at = null; m.urgent_cleared_by = null; }
  save();
  return m;
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
        slotMap[key].set(rule.staff_id, { staff_id: rule.staff_id, date: dateStr, shift: rule.shift, is_recurring: true, rule_id: rule.id, rule_start: rule.start || null, rule_end: rule.end || null });
      }
      cur.setDate(cur.getDate() + 1);
    }
  }
  return slotMap;
}

function getAssignmentsForRange(startDate, endDate) {
  const slotMap = _expandRules(startDate, endDate);
  // Apply per-day skips to the recurring occurrences first, so an explicit
  // one-off re-add below still shows the person for that day.
  for (const sk of (_data.shift_skips || [])) {
    if (sk.date < startDate || sk.date > endDate) continue;
    const key = `${sk.date}|${sk.shift}`;
    if (slotMap[key]) slotMap[key].delete(sk.staff_id);
  }
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
  for (const sk of (_data.shift_skips || [])) {
    if (sk.date === date && sk.shift === shift && slotMap[`${date}|${shift}`]) slotMap[`${date}|${shift}`].delete(sk.staff_id);
  }
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

function addShiftRule({ staffId, shift, dayOfWeek, startDate, endDate, createdBy, start, end }) {
  const id = nextId('shift_rules');
  _data.shift_rules.push({
    id,
    staff_id: parseInt(staffId),
    shift,
    day_of_week: parseInt(dayOfWeek),
    start_date: startDate,
    end_date: endDate || null,
    start: start || null,   // optional per-rule shift hours (override the global shift default for this recurring slot)
    end: end || null,
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

// Skip a single occurrence of a recurring rule (keeps the rule intact).
function addShiftSkip({ staffId, date, shift }) {
  staffId = parseInt(staffId);
  const exists = _data.shift_skips.find(s => s.staff_id === staffId && s.date === date && s.shift === shift);
  if (exists) return exists.id;
  const id = nextId('shift_skips');
  _data.shift_skips.push({ id, staff_id: staffId, date, shift, created_at: now() });
  save();
  return id;
}
function removeShiftSkip({ staffId, date, shift }) {
  staffId = parseInt(staffId);
  _data.shift_skips = _data.shift_skips.filter(
    s => !(s.staff_id === staffId && s.date === date && s.shift === shift)
  );
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

// ─── Expense Line Items ───────────────────────────────────────────────────────

function addExpenseItem({ staffId, periodStart, date, description, amount, submittedBy }) {
  const id = nextId('expense_items');
  const item = {
    id,
    staff_id: staffId,
    period_start: periodStart,
    date: date || new Date().toISOString().slice(0, 10),
    description: String(description || '').trim(),
    amount: parseFloat(amount) || 0,
    receipt_file: null,
    submitted_at: new Date().toISOString(),
    submitted_by: submittedBy,
  };
  if (!Array.isArray(_data.expense_items)) _data.expense_items = [];
  _data.expense_items.push(item);
  save();
  return item;
}

function getExpenseItemById(id) {
  return (_data.expense_items || []).find(i => i.id === parseInt(id)) || null;
}

function getExpenseItemsForPeriod(staffId, periodStart) {
  return (_data.expense_items || []).filter(i => i.staff_id === staffId && i.period_start === periodStart);
}

function getExpenseItemsForPeriodAllStaff(periodStart) {
  const result = {};
  for (const item of (_data.expense_items || [])) {
    if (item.period_start !== periodStart) continue;
    if (!result[item.staff_id]) result[item.staff_id] = [];
    result[item.staff_id].push(item);
  }
  return result;
}

function deleteExpenseItem(id) {
  const idx = (_data.expense_items || []).findIndex(i => i.id === parseInt(id));
  if (idx === -1) return false;
  _data.expense_items.splice(idx, 1);
  save();
  return true;
}

function setExpenseItemReceipt(id, filename) {
  const item = getExpenseItemById(id);
  if (!item) return false;
  item.receipt_file = filename;
  save();
  return true;
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

// ─── Waitlist / open-spots board ───────────────────────────────────────────────

// Returns every spot with its update thread. Open + working spots sort to the top
// (newest first); filled spots linger 14 days for the record, then drop off.
function getWaitlistSpots() {
  const nowMs = Date.now();
  const keepMs = 14 * 24 * 60 * 60 * 1000;
  const rank = { open: 0, working: 1, filled: 2 };
  return (_data.waitlist_spots || [])
    .filter(s => s.status !== 'filled' || (nowMs - new Date(s.filled_at || s.created_at).getTime()) < keepMs)
    .map(s => {
      const creator = getStaffById(s.created_by) || {};
      const filler  = s.filled_by ? (getStaffById(s.filled_by) || {}) : null;
      const updates = (_data.waitlist_updates || [])
        .filter(u => u.spot_id === s.id)
        .sort((a, b) => new Date(a.created_at) - new Date(b.created_at))
        .map(u => {
          const au = getStaffById(u.staff_id) || {};
          return { id: u.id, content: u.content, created_at: u.created_at, author_id: au.id, author_name: au.name, author_color: au.color };
        });
      return {
        ...s,
        created_by_name: creator.name || null,
        created_by_color: creator.color || null,
        filled_by_name: filler ? filler.name : null,
        updates,
      };
    })
    .sort((a, b) => {
      if (rank[a.status] !== rank[b.status]) return rank[a.status] - rank[b.status];
      // within a tier: newest activity first
      return new Date(b.updated_at || b.created_at) - new Date(a.updated_at || a.created_at);
    });
}

function createWaitlistSpot({ staffId, program, day_time, opened_date, spots, note }) {
  const id = nextId('waitlist_spots');
  _data.waitlist_spots.push({
    id,
    program: String(program || '').slice(0, 160),
    day_time: String(day_time || '').slice(0, 120),
    opened_date: (typeof opened_date === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(opened_date)) ? opened_date : null,
    spots: Math.max(1, parseInt(spots) || 1),
    note: note ? String(note).slice(0, 500) : '',
    status: 'open',
    created_by: parseInt(staffId),
    created_at: now(),
    updated_at: now(),
    filled_by: null,
    filled_at: null,
  });
  save();
  return id;
}

function setWaitlistStatus(id, status, staffId) {
  const s = _data.waitlist_spots.find(x => x.id === parseInt(id));
  if (!s) return null;
  if (!['open', 'working', 'filled'].includes(status)) return null;
  s.status = status;
  s.updated_at = now();
  if (status === 'filled') { s.filled_by = parseInt(staffId); s.filled_at = now(); }
  else { s.filled_by = null; s.filled_at = null; }
  save();
  return s;
}

function addWaitlistUpdate({ spotId, staffId, content }) {
  const s = _data.waitlist_spots.find(x => x.id === parseInt(spotId));
  if (!s) return null;
  const id = nextId('waitlist_updates');
  _data.waitlist_updates.push({ id, spot_id: parseInt(spotId), staff_id: parseInt(staffId), content: String(content).slice(0, 500), created_at: now() });
  s.updated_at = now();
  save();
  return id;
}

function deleteWaitlistSpot(id) {
  id = parseInt(id);
  _data.waitlist_spots = _data.waitlist_spots.filter(s => s.id !== id);
  _data.waitlist_updates = _data.waitlist_updates.filter(u => u.spot_id !== id);
  save();
  return true;
}

// ─── Pro Shop: String Log (rackets strung — counts only, no pay/rates) ─────────
function getStringLogs() {
  const nameById = {}; (_data.staff || []).forEach(s => nameById[s.id] = s.name);
  return (_data.string_logs || []).filter(l => l.active !== false)
    .slice().sort((a, b) => String(b.date).localeCompare(String(a.date)) || b.id - a.id)
    .map(l => ({ ...l, strung_by_name: nameById[l.strung_by] || '—', taken_in_by_name: nameById[l.taken_in_by] || '' }));
}
function addStringLog({ date, member, string, tension, strung_by, taken_in_by, string_source }) {
  if (!Array.isArray(_data.string_logs)) { _data.string_logs = []; _data._seq.string_logs = 0; }
  const id = nextId('string_logs');
  _data.string_logs.push({
    id,
    date: (typeof date === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(date)) ? date : now().slice(0, 10),
    member: String(member || '').slice(0, 120),
    string: String(string || '').slice(0, 80),
    tension: String(tension || '').slice(0, 40),
    strung_by: parseInt(strung_by) || null,
    taken_in_by: parseInt(taken_in_by) || null,
    string_source: string_source === 'member' ? 'member' : 'club',   // club-provided vs member's own (labour only)
    paid: false,
    active: true,
    created_at: now(),
  });
  save();
  return id;
}
function updateStringLog(id, f) {
  const l = (_data.string_logs || []).find(x => x.id === parseInt(id));
  if (!l) return null;
  if (f.paid !== undefined) l.paid = !!f.paid;
  if (f.date !== undefined && /^\d{4}-\d{2}-\d{2}$/.test(f.date)) l.date = f.date;
  if (f.member !== undefined) l.member = String(f.member).slice(0, 120);
  if (f.string !== undefined) l.string = String(f.string).slice(0, 80);
  if (f.tension !== undefined) l.tension = String(f.tension).slice(0, 40);
  if (f.strung_by !== undefined) l.strung_by = parseInt(f.strung_by) || null;
  if (f.taken_in_by !== undefined) l.taken_in_by = parseInt(f.taken_in_by) || null;
  if (f.string_source !== undefined) l.string_source = f.string_source === 'member' ? 'member' : 'club';
  save();
  return l;
}
function deleteStringLog(id) {
  const l = (_data.string_logs || []).find(x => x.id === parseInt(id));
  if (!l) return false;
  l.active = false; save(); return true;   // soft-delete, recoverable
}
function getStringCounts(start, end) {
  const nameById = {}, colorById = {}; (_data.staff || []).forEach(s => { nameById[s.id] = s.name; colorById[s.id] = s.color; });
  const map = {};
  (_data.string_logs || []).filter(l => l.active !== false)
    .filter(l => (!start || String(l.date) >= start) && (!end || String(l.date) <= end))
    .forEach(l => {
    if (l.strung_by == null) return;
    const k = l.strung_by;
    map[k] = map[k] || { staff_id: k, name: nameById[k] || '—', color: colorById[k] || '#2c5c9c', total: 0, unpaid: 0 };
    map[k].total++; if (!l.paid) map[k].unpaid++;
  });
  return Object.values(map).sort((a, b) => b.total - a.total);
}

// ─── Knowledge base (feeds the AI assistant) ───────────────────────────────────

function getKnowledgeDocs() {
  return (_data.knowledge_docs || [])
    .slice()
    .sort((a, b) => (a.category || '').localeCompare(b.category || '') || (a.title || '').localeCompare(b.title || ''))
    .map(d => {
      const u = d.updated_by ? (getStaffById(d.updated_by) || {}) : null;
      return { ...d, updated_by_name: u ? u.name : null };
    });
}

// Assembles every doc into one block for the assistant's system prompt.
function getKnowledgeForPrompt() {
  const docs = (_data.knowledge_docs || []);
  if (!docs.length) return '';
  return docs
    .slice()
    .sort((a, b) => (a.category || '').localeCompare(b.category || '') || (a.title || '').localeCompare(b.title || ''))
    .map(d => {
      const head = `## ${d.title}${d.category ? ` [${d.category}]` : ''}`;
      const src = d.source_type === 'url' && d.url ? `\n(Source: ${d.url})` : '';
      return `${head}${src}\n${d.body || ''}`;
    })
    .join('\n\n---\n\n');
}

function createKnowledgeDoc({ title, category, source_type, url, body, staffId }) {
  const id = nextId('knowledge_docs');
  _data.knowledge_docs.push({
    id,
    title: String(title || '').slice(0, 200),
    category: String(category || '').slice(0, 60),
    source_type: source_type === 'url' ? 'url' : 'text',
    url: url ? String(url).slice(0, 2000) : null,
    body: String(body || '').slice(0, 100000),
    created_by: parseInt(staffId),
    created_at: now(),
    updated_by: parseInt(staffId),
    updated_at: now(),
  });
  save();
  return id;
}

function updateKnowledgeDoc(id, { title, category, url, body, staffId }) {
  const d = _data.knowledge_docs.find(x => x.id === parseInt(id));
  if (!d) return null;
  if (title !== undefined) d.title = String(title).slice(0, 200);
  if (category !== undefined) d.category = String(category).slice(0, 60);
  if (url !== undefined) d.url = url ? String(url).slice(0, 2000) : null;
  if (body !== undefined) d.body = String(body).slice(0, 100000);
  d.updated_by = parseInt(staffId);
  d.updated_at = now();
  save();
  return d;
}

function deleteKnowledgeDoc(id) {
  _data.knowledge_docs = _data.knowledge_docs.filter(d => d.id !== parseInt(id));
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

function createBubbleReading({ staffId, temperature, pressure, note, wind, recTier, recMin }) {
  const id = nextId('bubble_readings');
  const num = v => (v !== '' && v != null && !isNaN(parseFloat(v))) ? parseFloat(v) : null;
  _data.bubble_readings.push({
    id,
    staff_id:    parseInt(staffId),
    temperature: num(temperature),
    pressure:    num(pressure),
    note:        note ? String(note).slice(0, 300) : '',
    wind:        num(wind),                                       // km/h at time of reading
    rec_tier:    recTier ? String(recTier).slice(0, 40) : null,  // condition tier
    rec_min:     num(recMin),                                     // recommended min pressure then
    created_at:  now(),
  });
  save();
  return id;
}

// ─── Contractor: work log, expenses, project pitches (+ management approvals) ───

const _num = v => (v !== '' && v != null && !isNaN(parseFloat(v))) ? parseFloat(v) : null;

function _withStaffMeta(e) {
  const s = getStaffById(e.staff_id) || {};
  const approver = e.approved_by ? getStaffById(e.approved_by) : (e.decided_by ? getStaffById(e.decided_by) : null);
  return {
    ...e,
    staff_name: s.name, staff_color: s.color, staff_badge: s.badge || null,
    decider_name: approver ? approver.name : null,
  };
}

// Work log ---------------------------------------------------------------------
function getContractorWork(staffId) {
  let rows = (_data.contractor_work || []).slice();
  if (staffId != null) rows = rows.filter(e => e.staff_id === parseInt(staffId));
  return rows.sort((a, b) => (b.date || '').localeCompare(a.date || '') || b.id - a.id).map(_withStaffMeta);
}
function addContractorWork({ staffId, date, description, hours, amount }) {
  const id = nextId('contractor_work');
  const row = {
    id, staff_id: parseInt(staffId), date,
    description: String(description || '').slice(0, 800),
    hours: _num(hours), amount: _num(amount),
    status: 'pending', approved_by: null, approved_at: null, created_at: now(),
  };
  _data.contractor_work.push(row); save();
  return _withStaffMeta(row);
}
function decideContractorWork(id, deciderId, decision) {
  const r = _data.contractor_work.find(x => x.id === parseInt(id));
  if (!r) return false;
  r.status = decision === 'approved' ? 'approved' : 'rejected';
  r.approved_by = parseInt(deciderId); r.approved_at = now();
  save(); return true;
}
function deleteContractorWork(id, staffId) {
  const r = _data.contractor_work.find(x => x.id === parseInt(id));
  if (!r || r.staff_id !== parseInt(staffId) || r.status === 'approved') return false;
  _data.contractor_work = _data.contractor_work.filter(x => x.id !== parseInt(id));
  save(); return true;
}

// Expenses ---------------------------------------------------------------------
function getContractorExpenses(staffId) {
  let rows = (_data.contractor_expenses || []).slice();
  if (staffId != null) rows = rows.filter(e => e.staff_id === parseInt(staffId));
  return rows.sort((a, b) => (b.date || '').localeCompare(a.date || '') || b.id - a.id).map(_withStaffMeta);
}
function addContractorExpense({ staffId, date, vendor, amount, category }) {
  const id = nextId('contractor_expenses');
  const row = {
    id, staff_id: parseInt(staffId), date,
    vendor: String(vendor || '').slice(0, 200),
    category: String(category || '').slice(0, 60),
    amount: _num(amount), receipt: null,
    status: 'pending', approved_by: null, approved_at: null, created_at: now(),
  };
  _data.contractor_expenses.push(row); save();
  return _withStaffMeta(row);
}
function setContractorExpenseReceipt(id, filename) {
  const r = _data.contractor_expenses.find(x => x.id === parseInt(id));
  if (!r) return false;
  r.receipt = filename; save(); return true;
}
function getContractorExpense(id) {
  return (_data.contractor_expenses || []).find(x => x.id === parseInt(id)) || null;
}
function decideContractorExpense(id, deciderId, decision) {
  const r = _data.contractor_expenses.find(x => x.id === parseInt(id));
  if (!r) return false;
  r.status = decision === 'approved' ? 'approved' : 'rejected';
  r.approved_by = parseInt(deciderId); r.approved_at = now();
  save(); return true;
}
function deleteContractorExpense(id, staffId) {
  const r = _data.contractor_expenses.find(x => x.id === parseInt(id));
  if (!r || r.staff_id !== parseInt(staffId) || r.status === 'approved') return false;
  _data.contractor_expenses = _data.contractor_expenses.filter(x => x.id !== parseInt(id));
  save(); return true;
}

// Project pitches --------------------------------------------------------------
function getContractorProjects(staffId) {
  let rows = (_data.contractor_projects || []).slice();
  if (staffId != null) rows = rows.filter(e => e.staff_id === parseInt(staffId));
  return rows.sort((a, b) => b.id - a.id).map(_withStaffMeta);
}
function addContractorProject({ staffId, title, description, estimate }) {
  const id = nextId('contractor_projects');
  const row = {
    id, staff_id: parseInt(staffId),
    title: String(title || '').slice(0, 200),
    description: String(description || '').slice(0, 2000),
    estimate: _num(estimate),
    status: 'proposed', decided_by: null, decided_at: null, decision_note: null,
    created_at: now(),
  };
  _data.contractor_projects.push(row); save();
  return _withStaffMeta(row);
}
function decideContractorProject(id, deciderId, decision, note) {
  const r = _data.contractor_projects.find(x => x.id === parseInt(id));
  if (!r) return false;
  r.status = decision === 'approved' ? 'approved' : 'declined';
  r.decided_by = parseInt(deciderId); r.decided_at = now();
  r.decision_note = note ? String(note).slice(0, 500) : null;
  save(); return true;
}
function deleteContractorProject(id, staffId) {
  const r = _data.contractor_projects.find(x => x.id === parseInt(id));
  if (!r || r.staff_id !== parseInt(staffId) || r.status !== 'proposed') return false;
  _data.contractor_projects = _data.contractor_projects.filter(x => x.id !== parseInt(id));
  save(); return true;
}

// Subcontractor hours — the contractor logs work done by their own subcontractors,
// whom JCT pays directly. Same pending → management-approved flow.
function getContractorSubWork(staffId) {
  let rows = (_data.contractor_sub_work || []).slice();
  if (staffId != null) rows = rows.filter(e => e.staff_id === parseInt(staffId));
  return rows.sort((a, b) => (b.date || '').localeCompare(a.date || '') || b.id - a.id).map(_withStaffMeta);
}
function addContractorSubWork({ staffId, workerName, date, description, hours, amount }) {
  const id = nextId('contractor_sub_work');
  const row = {
    id, staff_id: parseInt(staffId),
    worker_name: String(workerName || '').slice(0, 120),
    date, description: String(description || '').slice(0, 800),
    hours: _num(hours), amount: _num(amount),
    status: 'pending', approved_by: null, approved_at: null, created_at: now(),
  };
  _data.contractor_sub_work.push(row); save();
  return _withStaffMeta(row);
}
function decideContractorSubWork(id, deciderId, decision) {
  const r = _data.contractor_sub_work.find(x => x.id === parseInt(id));
  if (!r) return false;
  r.status = decision === 'approved' ? 'approved' : 'rejected';
  r.approved_by = parseInt(deciderId); r.approved_at = now();
  save(); return true;
}
function deleteContractorSubWork(id, staffId) {
  const r = _data.contractor_sub_work.find(x => x.id === parseInt(id));
  if (!r || r.staff_id !== parseInt(staffId) || r.status === 'approved') return false;
  _data.contractor_sub_work = _data.contractor_sub_work.filter(x => x.id !== parseInt(id));
  save(); return true;
}

function getContractorSummary(staffId) {
  const sid = parseInt(staffId);
  const work = (_data.contractor_work || []).filter(e => e.staff_id === sid);
  const exp  = (_data.contractor_expenses || []).filter(e => e.staff_id === sid);
  const sub  = (_data.contractor_sub_work || []).filter(e => e.staff_id === sid);
  const sum = (arr, f) => arr.reduce((t, x) => t + (f(x) || 0), 0);
  return {
    work_pending:         work.filter(w => w.status === 'pending').length,
    work_approved_hours:  sum(work.filter(w => w.status === 'approved'), w => w.hours),
    work_approved_amount: sum(work.filter(w => w.status === 'approved'), w => w.amount),
    exp_pending:          exp.filter(e => e.status === 'pending').length,
    exp_approved_amount:  sum(exp.filter(e => e.status === 'approved'), e => e.amount),
    sub_pending:          sub.filter(w => w.status === 'pending').length,
    sub_approved_hours:   sum(sub.filter(w => w.status === 'approved'), w => w.hours),
    sub_approved_amount:  sum(sub.filter(w => w.status === 'approved'), w => w.amount),
  };
}

// Staff period-expense receipts -------------------------------------------------
function getPeriodReceipt(staffId, periodStart) {
  return _data.period_receipts[`${staffId}:${periodStart}`] || null;
}
function setPeriodReceipt(staffId, periodStart, filename) {
  _data.period_receipts[`${staffId}:${periodStart}`] = filename;
  save();
}
function getPeriodReceiptsForRange(periodStart) {
  const result = {};
  for (const [key, val] of Object.entries(_data.period_receipts || {})) {
    const [sid, ps] = key.split(':');
    if (ps === periodStart) result[parseInt(sid)] = val;
  }
  return result;
}

// ─── Idea Board (ideas, votes, status, threaded comments; member suggestions) ────

const IDEA_CATEGORIES = ['facility','courts','member-experience','programs','pro-shop','events','tech','other'];
const IDEA_STATUSES   = ['new','considering','planned','done','declined'];

function _ideaOut(idea, viewerId) {
  const author = getStaffById(idea.author_id) || {};
  const comment_count = (_data.idea_comments || []).filter(c => c.idea_id === idea.id).length;
  return {
    ...idea,
    author_name: author.name, author_color: author.color, author_badge: author.badge || null,
    votes_count: (idea.votes || []).length,
    voted_by_me: viewerId != null && (idea.votes || []).includes(parseInt(viewerId)),
    comment_count,
    has_image: !!idea.image,
  };
}

function getIdeas(viewerId) {
  return (_data.ideas || []).slice().sort((a, b) => b.id - a.id).map(i => _ideaOut(i, viewerId));
}
function getIdea(id) { return (_data.ideas || []).find(x => x.id === parseInt(id)) || null; }
function getIdeaOut(id, viewerId) { const i = getIdea(id); return i ? _ideaOut(i, viewerId) : null; }

function addIdea({ authorId, title, body, category, link, linkTitle, source, memberName }) {
  const id = nextId('ideas');
  const idea = {
    id, author_id: parseInt(authorId),
    title: String(title || '').slice(0, 200),
    body:  String(body  || '').slice(0, 3000),
    category: IDEA_CATEGORIES.includes(category) ? category : 'other',
    link:       link ? String(link).slice(0, 600) : null,
    link_title: linkTitle ? String(linkTitle).slice(0, 200) : null,
    image: null,
    status: 'new',
    source: source === 'member' ? 'member' : 'staff',
    member_name: (source === 'member' && memberName) ? String(memberName).slice(0, 120) : null,
    votes: [],
    created_at: now(),
  };
  _data.ideas.push(idea); save();
  return _ideaOut(idea, authorId);
}
function setIdeaImage(id, filename) { const i = getIdea(id); if (!i) return false; i.image = filename; save(); return true; }
function toggleIdeaVote(id, staffId) {
  const i = getIdea(id); if (!i) return null;
  i.votes = i.votes || [];
  const sid = parseInt(staffId), idx = i.votes.indexOf(sid);
  const voted = idx < 0;
  if (voted) i.votes.push(sid); else i.votes.splice(idx, 1);
  save();
  return { voted, count: i.votes.length };
}
function setIdeaStatus(id, status) {
  const i = getIdea(id); if (!i || !IDEA_STATUSES.includes(status)) return false;
  i.status = status; save(); return true;
}
function deleteIdea(id, staffId, isManagement) {
  const i = getIdea(id); if (!i) return false;
  if (i.author_id !== parseInt(staffId) && !isManagement) return false;
  _data.ideas = (_data.ideas || []).filter(x => x.id !== parseInt(id));
  _data.idea_comments = (_data.idea_comments || []).filter(c => c.idea_id !== parseInt(id));
  save(); return true;
}

function getIdeaComments(ideaId) {
  return (_data.idea_comments || [])
    .filter(c => c.idea_id === parseInt(ideaId))
    .sort((a, b) => new Date(a.created_at) - new Date(b.created_at))
    .map(c => { const s = getStaffById(c.author_id) || {}; return { ...c, author_name: s.name, author_color: s.color }; });
}
function addIdeaComment({ ideaId, authorId, content }) {
  const id = nextId('idea_comments');
  const c = { id, idea_id: parseInt(ideaId), author_id: parseInt(authorId), content: String(content || '').slice(0, 1200), created_at: now() };
  _data.idea_comments.push(c); save();
  const s = getStaffById(authorId) || {};
  return { ...c, author_name: s.name, author_color: s.color };
}
function deleteIdeaComment(id, staffId, isManagement) {
  const c = (_data.idea_comments || []).find(x => x.id === parseInt(id));
  if (!c) return false;
  if (c.author_id !== parseInt(staffId) && !isManagement) return false;
  _data.idea_comments = _data.idea_comments.filter(x => x.id !== parseInt(id));
  save(); return true;
}

// ─── Academy management ──────────────────────────────────────────────────────
const ACADEMY_AVAIL      = ['Open', 'Limited', 'Full', 'Cancelled'];
const WAITLIST_STATUSES  = ['Waiting', 'Offered', 'Enrolled', 'Withdrawn'];
const CHANGE_STATUSES    = ['Requested', 'Approved', 'Done', 'Cancelled'];
const ACADEMY_ACTIONS    = ['claimed', 'followup', 'resolved', 'reopened'];

function _classLabel(c) { if (!c) return 'Unknown class'; return [c.program, c.day_time, c.age ? 'Age ' + c.age : null].filter(Boolean).join(' · '); }
function _who(id) { const s = getStaffById(id) || {}; return { author_name: s.name || null, author_color: s.color || null }; }
function _activityOut(arr) { return (arr || []).map(a => { const s = getStaffById(a.staff_id) || {}; return { ...a, staff_name: s.name || null, staff_color: s.color || null }; }); }
function _pushActivity(entry, action, note, actingId) {
  if (!ACADEMY_ACTIONS.includes(action)) return false;
  entry.activity = entry.activity || [];
  entry.activity.push({ id: nextId('academy_activity'), action, staff_id: parseInt(actingId), note: note ? String(note).slice(0, 600) : null, at: now() });
  entry.updated_at = now();
  return true;
}

// Classes
function getAcademyClasses() { return (_data.academy_classes || []).slice().sort((a, b) => a.id - b.id).map(c => ({ ...c, label: _classLabel(c) })); }
function getAcademyClass(id) { return (_data.academy_classes || []).find(c => c.id === parseInt(id)) || null; }
function addAcademyClass(f) {
  const id = nextId('academy_classes');
  const c = {
    id,
    program: String(f.program || '').slice(0, 80),
    day_time: String(f.day_time || '').slice(0, 80),
    age: String(f.age || '').slice(0, 40),
    cost: f.cost ? parseInt(f.cost) : null,
    availability: ACADEMY_AVAIL.includes(f.availability) ? f.availability : 'Open',
    duration: String(f.duration || '').slice(0, 40),
    num_classes: f.num_classes ? parseInt(f.num_classes) : null,
    start_date: String(f.start_date || '').slice(0, 40),
    category: f.category === 'adult' ? 'adult' : 'junior',
    active: true,
  };
  _data.academy_classes.push(c); save();
  return { ...c, label: _classLabel(c) };
}
function updateAcademyClass(id, f) {
  const c = getAcademyClass(id); if (!c) return null;
  ['program', 'day_time', 'age', 'duration', 'start_date'].forEach(k => { if (f[k] !== undefined) c[k] = String(f[k]).slice(0, 80); });
  if (f.availability !== undefined && ACADEMY_AVAIL.includes(f.availability)) c.availability = f.availability;
  if (f.cost !== undefined) c.cost = (f.cost === null || f.cost === '') ? null : parseInt(f.cost);
  if (f.num_classes !== undefined) c.num_classes = (f.num_classes === null || f.num_classes === '') ? null : parseInt(f.num_classes);
  if (f.category !== undefined) c.category = f.category === 'adult' ? 'adult' : 'junior';
  if (f.active !== undefined) c.active = !!f.active;
  save();
  return { ...c, label: _classLabel(c) };
}

// Waitlist
function _waitOut(w) { const c = getAcademyClass(w.class_id); return { ...w, class_label: c ? _classLabel(c) : null, class_availability: c ? c.availability : null, class_category: c ? c.category : null, activity: _activityOut(w.activity), ..._who(w.created_by) }; }
function getWaitlist() { return (_data.academy_waitlist || []).slice().sort((a, b) => b.id - a.id).map(_waitOut); }
function addWaitlist(f) {
  const id = nextId('academy_waitlist');
  const w = {
    id,
    student_name: String(f.student_name || '').slice(0, 120),
    contact: String(f.contact || '').slice(0, 200),
    class_id: f.class_id ? parseInt(f.class_id) : null,
    status: WAITLIST_STATUSES.includes(f.status) ? f.status : 'Waiting',
    notes: String(f.notes || '').slice(0, 1000),
    created_by: parseInt(f.created_by),
    activity: [],
    created_at: now(), updated_at: now(),
  };
  _data.academy_waitlist.push(w); save();
  return _waitOut(w);
}
function addWaitlistActivity(id, { action, note, actingId }) {
  const w = (_data.academy_waitlist || []).find(x => x.id === parseInt(id)); if (!w) return null;
  if (!_pushActivity(w, action, note, actingId)) return null;
  save(); return _waitOut(w);
}
function updateWaitlist(id, f) {
  const w = (_data.academy_waitlist || []).find(x => x.id === parseInt(id)); if (!w) return null;
  if (f.student_name !== undefined) w.student_name = String(f.student_name).slice(0, 120);
  if (f.contact !== undefined) w.contact = String(f.contact).slice(0, 200);
  if (f.class_id !== undefined) w.class_id = f.class_id ? parseInt(f.class_id) : null;
  if (f.status !== undefined && WAITLIST_STATUSES.includes(f.status)) w.status = f.status;
  if (f.notes !== undefined) w.notes = String(f.notes).slice(0, 1000);
  w.updated_at = now(); save();
  return _waitOut(w);
}
function deleteWaitlist(id, staffId, isMgmt) {
  const w = (_data.academy_waitlist || []).find(x => x.id === parseInt(id)); if (!w) return false;
  if (w.created_by !== parseInt(staffId) && !isMgmt) return false;
  _data.academy_waitlist = _data.academy_waitlist.filter(x => x.id !== parseInt(id)); save(); return true;
}

// Class changes / switches
function _changeOut(ch) { const from = getAcademyClass(ch.from_class_id), to = getAcademyClass(ch.to_class_id); return { ...ch, from_label: from ? _classLabel(from) : null, to_label: to ? _classLabel(to) : null, from_category: from ? from.category : null, to_category: to ? to.category : null, activity: _activityOut(ch.activity), ..._who(ch.created_by) }; }
function getChanges() { return (_data.academy_changes || []).slice().sort((a, b) => b.id - a.id).map(_changeOut); }
function addChange(f) {
  const id = nextId('academy_changes');
  const ch = {
    id,
    student_name: String(f.student_name || '').slice(0, 120),
    contact: String(f.contact || '').slice(0, 200),
    from_class_id: f.from_class_id ? parseInt(f.from_class_id) : null,
    to_class_id: f.to_class_id ? parseInt(f.to_class_id) : null,
    reason: String(f.reason || '').slice(0, 1000),
    status: CHANGE_STATUSES.includes(f.status) ? f.status : 'Requested',
    created_by: parseInt(f.created_by),
    activity: [],
    created_at: now(), updated_at: now(),
  };
  _data.academy_changes.push(ch); save();
  return _changeOut(ch);
}
function addChangeActivity(id, { action, note, actingId }) {
  const ch = (_data.academy_changes || []).find(x => x.id === parseInt(id)); if (!ch) return null;
  if (!_pushActivity(ch, action, note, actingId)) return null;
  save(); return _changeOut(ch);
}
function updateChange(id, f) {
  const ch = (_data.academy_changes || []).find(x => x.id === parseInt(id)); if (!ch) return null;
  if (f.student_name !== undefined) ch.student_name = String(f.student_name).slice(0, 120);
  if (f.contact !== undefined) ch.contact = String(f.contact).slice(0, 200);
  if (f.from_class_id !== undefined) ch.from_class_id = f.from_class_id ? parseInt(f.from_class_id) : null;
  if (f.to_class_id !== undefined) ch.to_class_id = f.to_class_id ? parseInt(f.to_class_id) : null;
  if (f.reason !== undefined) ch.reason = String(f.reason).slice(0, 1000);
  if (f.status !== undefined && CHANGE_STATUSES.includes(f.status)) ch.status = f.status;
  ch.updated_at = now(); save();
  return _changeOut(ch);
}
function deleteChange(id, staffId, isMgmt) {
  const ch = (_data.academy_changes || []).find(x => x.id === parseInt(id)); if (!ch) return false;
  if (ch.created_by !== parseInt(staffId) && !isMgmt) return false;
  _data.academy_changes = _data.academy_changes.filter(x => x.id !== parseInt(id)); save(); return true;
}

// Academy notes (light feed)
function getAcademyNotes() { return (_data.academy_notes || []).slice().sort((a, b) => b.id - a.id).map(n => ({ ...n, ..._who(n.created_by) })); }
function addAcademyNote(f) {
  const id = nextId('academy_notes');
  const n = { id, body: String(f.body || '').slice(0, 2000), created_by: parseInt(f.created_by), created_at: now() };
  _data.academy_notes.push(n); save();
  return { ...n, ..._who(n.created_by) };
}
function deleteAcademyNote(id, staffId, isMgmt) {
  const n = (_data.academy_notes || []).find(x => x.id === parseInt(id)); if (!n) return false;
  if (n.created_by !== parseInt(staffId) && !isMgmt) return false;
  _data.academy_notes = _data.academy_notes.filter(x => x.id !== parseInt(id)); save(); return true;
}

// ─── Staff management / pay review ──────────────────────────────────────────
// Sensitive manager surface. Two tiers:
//  • Directory (view/add/edit/remove staff records) — open to all management
//    (admin + manager: Craig, Jaime, Victor, David).
//  • Pay Review (rates) — tight allowlist Craig(1), Jaime(2), Victor(3) only.
// David is a manager: he can organize the Directory but never sees pay rates.
const STAFF_MGMT_IDS = [1, 2, 3];
function canManageStaff(realId) { return STAFF_MGMT_IDS.includes(parseInt(realId)); } // pay tier (trio)
function canManageDirectory(realId) {
  const s = getStaffById(realId);
  return !!s && (s.role === 'admin' || s.role === 'manager');
}

// Which pay tracks a person carries. A front-desk staffer who also coaches (role
// 'staff' + is_pro) earns two DISTINCT rates — one for office shifts, one for
// on-court coaching — so they get two independent tracks. Everyone else has one.
function jobsFor(s) {
  if (!s) return ['office'];
  if (s.role === 'pro') return ['pro'];                          // coach only
  if (s.role === 'staff' && s.is_pro) return ['office', 'pro'];  // does both
  return ['office'];                                             // office staff / manager / admin
}

function _payRow(sid) { return (_data.staff_pay || []).find(p => p.staff_id === parseInt(sid)) || null; }
function _blankJob() { return { current_rate: null, new_rate: null, pay_type: 'hourly', effective_date: '2026-09-01', notes: '' }; }
function _ensureRow(sid) {
  let p = _payRow(sid);
  if (!p) { p = { id: nextId('staff_pay'), staff_id: parseInt(sid), jobs: {} }; _data.staff_pay.push(p); }
  if (!p.jobs) p.jobs = {};
  return p;
}

// Migration: convert flat pay rows ({current_rate,new_rate,pay_type,...}) into the
// per-job shape ({ jobs: { office|pro: {...} } }). Old flat values move into the
// person's primary track (pro for coaches, office for everyone else).
(function migratePayJobs() {
  if (!Array.isArray(_data.staff_pay)) return;
  let changed = false;
  for (const p of _data.staff_pay) {
    if (p.jobs) continue; // already migrated
    const s = (_data.staff || []).find(x => x.id === p.staff_id);
    const primary = (s && s.role === 'pro') ? 'pro' : 'office';
    const job = _blankJob();
    if (p.current_rate != null) job.current_rate = p.current_rate;
    if (p.new_rate != null) job.new_rate = p.new_rate;
    if (p.pay_type) job.pay_type = p.pay_type;
    if (p.effective_date) job.effective_date = p.effective_date;
    if (p.notes) job.notes = p.notes;
    p.jobs = { [primary]: job };
    delete p.current_rate; delete p.new_rate; delete p.pay_type; delete p.effective_date; delete p.notes;
    changed = true;
  }
  if (changed) { save(); console.log('Pay rows migrated to per-job rate tracks.'); }
})();

// Pre-mark known salaried staff once (David → office, Megan → pro). Only seeds a
// track that doesn't exist yet, so manual toggles always stick. Matched by name.
(function seedSalaried() {
  if (!Array.isArray(_data.staff_pay)) return;
  let changed = false;
  [['David', 'office'], ['Megan', 'pro']].forEach(function (pair) {
    const s = (_data.staff || []).find(x => x.name === pair[0]); if (!s) return;
    const p = _ensureRow(s.id);
    if (!p.jobs[pair[1]]) { p.jobs[pair[1]] = Object.assign(_blankJob(), { pay_type: 'salary' }); changed = true; }
  });
  if (changed) save();
})();

function getStaffPay() {
  // Owners / senior management (Craig, Jaime, Victor) aren't part of the hourly pay
  // review, and contractors (e.g. Muzz) aren't on payroll — exclude both. Returns
  // one line per (staff, job): dual-role people appear twice, once per rate track.
  const lines = [];
  (_data.staff || []).slice()
    .filter(s => !STAFF_MGMT_IDS.includes(s.id) && s.role !== 'contractor')
    .sort((a, b) => a.name.localeCompare(b.name))
    .forEach(s => {
      const p = _payRow(s.id);
      const jobs = jobsFor(s);
      const dual = jobs.length > 1;
      jobs.forEach(job => {
        const j = (p && p.jobs && p.jobs[job]) ? p.jobs[job] : _blankJob();
        const cur = (j.current_rate != null) ? j.current_rate : null;
        const nw = (j.new_rate != null) ? j.new_rate : null;
        let pct = null;
        if (cur != null && nw != null && cur > 0) pct = Math.round(((nw - cur) / cur) * 1000) / 10;
        lines.push({
          staff_id: s.id, job: job, dual: dual,
          name: s.name, role: s.role, is_pro: !!s.is_pro, color: s.color, badge: s.badge || null,
          pay_type: j.pay_type || 'hourly',
          current_rate: cur, new_rate: nw, effective_date: j.effective_date || '2026-09-01',
          notes: j.notes || '', pct_change: pct,
        });
      });
    });
  return lines;
}
function updateStaffPay(staffId, job, f, actingId) {
  const sid = parseInt(staffId);
  const s = getStaffById(sid); if (!s) return null;
  const jkey = (job === 'pro') ? 'pro' : 'office';
  const p = _ensureRow(sid);
  if (!p.jobs[jkey]) p.jobs[jkey] = _blankJob();
  const j = p.jobs[jkey];
  if (f.pay_type !== undefined) j.pay_type = (f.pay_type === 'salary') ? 'salary' : 'hourly';
  if (f.current_rate !== undefined) j.current_rate = (f.current_rate === '' || f.current_rate === null) ? null : Number(f.current_rate);
  if (f.new_rate !== undefined) j.new_rate = (f.new_rate === '' || f.new_rate === null) ? null : Number(f.new_rate);
  if (f.effective_date !== undefined) j.effective_date = String(f.effective_date).slice(0, 40);
  if (f.notes !== undefined) j.notes = String(f.notes).slice(0, 500);
  p.updated_by = parseInt(actingId); p.updated_at = now();
  save();
  return getStaffPay().find(x => x.staff_id === sid && x.job === jkey);
}

// ── Staff directory (manager-only: full profiles incl. last name + contact) ──
// STAFF_ROLES / STAFF_PALETTE are declared earlier (near the seed block) so the
// load-time migrations can call addCoachAccount before this point in the file.
function _dirOut(s) {
  return { id: s.id, first_name: s.name, last_name: s.last_name || '', role: s.role, is_pro: !!s.is_pro,
    badge: s.badge || null, color: s.color, phone: s.phone || '', email: s.email || '', address: s.address || '',
    certification: s.certification || '' };
}
function getStaffDirectory() {
  return (_data.staff || []).slice().sort((a, b) => a.name.localeCompare(b.name)).map(_dirOut);
}
function addStaffMember(f, passwordHash) {
  const id = nextId('staff');
  const s = {
    id,
    name: String(f.first_name || '').slice(0, 60),
    last_name: String(f.last_name || '').slice(0, 60),
    role: STAFF_ROLES.includes(f.role) ? f.role : 'staff',
    is_pro: !!f.is_pro,
    phone: String(f.phone || '').slice(0, 40),
    email: String(f.email || '').slice(0, 120),
    address: String(f.address || '').slice(0, 200),
    certification: String(f.certification || '').slice(0, 60),
    color: f.color || STAFF_PALETTE[(id - 1) % STAFF_PALETTE.length],
    password: passwordHash,
    must_set_password: true,
  };
  _data.staff.push(s); save();
  return _dirOut(s);
}

// Quick-add a coach as a role 'pro' with the default club password (no login required
// — they still appear in the pro rail, schedule, and public view). Used by the AI editor.
function addCoachAccount(name) {
  const raw = String(name || '').trim();
  const parts = raw.split(/\s+/);
  const first = parts.shift() || raw;
  const last = parts.join(' ');
  return addStaffMember({ first_name: first, last_name: last, role: 'pro' }, bcrypt.hashSync('jct2026', 10));
}
function updateStaffMember(staffId, f) {
  const s = _data.staff.find(x => x.id === parseInt(staffId)); if (!s) return null;
  if (f.first_name !== undefined) s.name = String(f.first_name).slice(0, 60);
  if (f.last_name !== undefined) s.last_name = String(f.last_name).slice(0, 60);
  if (f.role !== undefined && STAFF_ROLES.includes(f.role)) s.role = f.role;
  if (f.is_pro !== undefined) s.is_pro = !!f.is_pro;
  if (f.phone !== undefined) s.phone = String(f.phone).slice(0, 40);
  if (f.email !== undefined) s.email = String(f.email).slice(0, 120);
  if (f.address !== undefined) s.address = String(f.address).slice(0, 200);
  if (f.certification !== undefined) s.certification = String(f.certification).slice(0, 60);
  if (f.color !== undefined) s.color = String(f.color).slice(0, 20);
  save();
  return _dirOut(s);
}

// ── Push subscriptions (Web Push) ────────────────────────────────────────────
function addPushSubscription(staffId, subscription) {
  if (!subscription || !subscription.endpoint) return null;
  _data.push_subscriptions = _data.push_subscriptions || [];
  // De-dupe by endpoint (a device re-subscribing replaces its old row).
  _data.push_subscriptions = _data.push_subscriptions.filter(s => s.endpoint !== subscription.endpoint);
  const row = { id: nextId('push_subscriptions'), staff_id: parseInt(staffId), endpoint: subscription.endpoint, subscription, created_at: now() };
  _data.push_subscriptions.push(row); save();
  return row;
}
function removeSubscriptionByEndpoint(endpoint) {
  const before = (_data.push_subscriptions || []).length;
  _data.push_subscriptions = (_data.push_subscriptions || []).filter(s => s.endpoint !== endpoint);
  if (_data.push_subscriptions.length !== before) save();
  return true;
}
function getSubscriptionsForStaff(staffIds) {
  const ids = (staffIds || []).map(Number);
  return (_data.push_subscriptions || []).filter(s => ids.includes(s.staff_id));
}

// ─── Exports ──────────────────────────────────────────────────────────────────

// ─── Pro schedule slots ────────────────────────────────────────────────────────
const _SLOT_DAY_ORDER = { Mon: 1, Tue: 2, Wed: 3, Thu: 4, Fri: 5, Sat: 6, Sun: 7 };
const _SLOT_DAYS = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'];

// Booking kinds on the court schedule. 'class' carries a program/level; the rest are
// court uses that don't. Defaults keep older records (which only had type) valid.
const PRO_KINDS = ['class', 'private', 'general', 'reserved', 'roundrobin', 'houseleague'];
const PRO_SEASONS = ['indoor', 'outdoor'];

function getProScheduleSlots(day) {
  let list = (_data.pro_schedule_slots || []).filter(s => s.active !== false);
  if (day) list = list.filter(s => s.day === day);
  return list.slice().sort((a, b) =>
    (_SLOT_DAY_ORDER[a.day] - _SLOT_DAY_ORDER[b.day]) ||
    String(a.start).localeCompare(String(b.start)) ||
    String(a.program).localeCompare(String(b.program))
  ).map(s => ({
    ...s,
    type: s.type === 'private' ? 'private' : 'class',
    kind: PRO_KINDS.includes(s.kind) ? s.kind : (s.type === 'private' ? 'private' : 'class'),
    season: PRO_SEASONS.includes(s.season) ? s.season : 'indoor',
    coaches: s.coaches || '',
    courts: Array.isArray(s.courts) ? s.courts : (s.court ? [String(s.court)] : []),
    court_pros: (s.court_pros && typeof s.court_pros === 'object') ? s.court_pros : {},
  }));
}

function addProScheduleSlot(f) {
  if (!Array.isArray(_data.pro_schedule_slots)) { _data.pro_schedule_slots = []; _data._seq.pro_schedule_slots = 0; }
  _data._seq.pro_schedule_slots = (_data._seq.pro_schedule_slots || 0) + 1;
  // Optional per-court pro assignment on create: { "3": [proId,...] }
  let court_pros = {};
  if (f.court_pros && typeof f.court_pros === 'object') {
    for (const k of Object.keys(f.court_pros)) {
      court_pros[String(k).slice(0, 8)] = (Array.isArray(f.court_pros[k]) ? f.court_pros[k] : []).map(Number).filter(n => !isNaN(n));
    }
  }
  let courts = Array.isArray(f.courts) ? f.courts.map(c => String(c).slice(0, 8)).filter(Boolean) : [];
  Object.keys(court_pros).forEach(k => { if (!courts.includes(k)) courts.push(k); });
  const pro_ids = Array.isArray(f.pro_ids)
    ? f.pro_ids.map(Number).filter(n => !isNaN(n))
    : [...new Set(Object.values(court_pros).flat())];
  const kind = PRO_KINDS.includes(f.kind) ? f.kind : (f.type === 'private' ? 'private' : 'class');
  const s = {
    id: _data._seq.pro_schedule_slots,
    class_id: f.class_id || null,
    type: kind === 'private' ? 'private' : 'class',
    kind,
    season: PRO_SEASONS.includes(f.season) ? f.season : 'indoor',
    coaches: String(f.coaches || '').slice(0, 200),
    day: _SLOT_DAYS.includes(f.day) ? f.day : 'Mon',
    start: String(f.start || '09:00').slice(0, 5),
    end: String(f.end || '10:00').slice(0, 5),
    time_label: String(f.time_label || '').slice(0, 40),
    program: String(f.program || 'New slot').slice(0, 80),
    category: String(f.category || 'junior').slice(0, 20),
    court: f.court ? String(f.court).slice(0, 20) : null,
    courts,
    court_pros,
    capacity: f.capacity ? String(f.capacity).slice(0, 20) : null,
    pro_ids,
    note: String(f.note || '').slice(0, 120),
    active: true,
  };
  _data.pro_schedule_slots.push(s);
  save();
  return s;
}

function updateProScheduleSlot(id, f) {
  const s = (_data.pro_schedule_slots || []).find(x => x.id === parseInt(id));
  if (!s) return null;
  if (f.pro_ids !== undefined) s.pro_ids = Array.isArray(f.pro_ids) ? f.pro_ids.map(Number).filter(n => !isNaN(n)) : [];
  if (f.court !== undefined) s.court = (f.court === '' || f.court === null) ? null : String(f.court).slice(0, 20);
  if (f.courts !== undefined) s.courts = Array.isArray(f.courts) ? f.courts.map(c => String(c).slice(0, 8)).filter(Boolean) : [];
  // Per-court pro assignment: { "3": [proId, ...], ... }. Keeps courts + pro_ids in sync.
  if (f.court_pros !== undefined && f.court_pros && typeof f.court_pros === 'object') {
    const cp = {};
    for (const k of Object.keys(f.court_pros)) {
      const arr = Array.isArray(f.court_pros[k]) ? f.court_pros[k].map(Number).filter(n => !isNaN(n)) : [];
      cp[String(k).slice(0, 8)] = arr;
    }
    s.court_pros = cp;
    const courtSet = new Set(Array.isArray(s.courts) ? s.courts : []);
    Object.keys(cp).forEach(k => { if (cp[k].length) courtSet.add(k); });
    s.courts = [...courtSet].sort();
    s.pro_ids = [...new Set(Object.values(cp).flat())];
  }
  if (f.capacity !== undefined) s.capacity = (f.capacity === '' || f.capacity === null) ? null : String(f.capacity).slice(0, 20);
  if (f.program !== undefined) s.program = String(f.program).slice(0, 80);
  if (f.day !== undefined && _SLOT_DAYS.includes(f.day)) s.day = f.day;
  if (f.start !== undefined) s.start = String(f.start).slice(0, 5);
  if (f.end !== undefined) s.end = String(f.end).slice(0, 5);
  if (f.time_label !== undefined) s.time_label = String(f.time_label).slice(0, 40);
  if (f.category !== undefined) s.category = String(f.category).slice(0, 20);
  if (f.note !== undefined) s.note = String(f.note).slice(0, 120);
  if (f.type !== undefined) s.type = f.type === 'private' ? 'private' : 'class';
  if (f.kind !== undefined && PRO_KINDS.includes(f.kind)) { s.kind = f.kind; s.type = f.kind === 'private' ? 'private' : 'class'; }
  if (f.season !== undefined && PRO_SEASONS.includes(f.season)) s.season = f.season;
  if (f.coaches !== undefined) s.coaches = String(f.coaches).slice(0, 200);
  if (f.active !== undefined) s.active = !!f.active;
  save();
  return s;
}

// Full record fetch (incl. inactive) — used by the AI editor's undo to restore state.
function getProScheduleSlotRaw(id) {
  return (_data.pro_schedule_slots || []).find(x => x.id === parseInt(id)) || null;
}

// Append-only audit of AI-made schedule edits (who/when/what), newest first.
function addScheduleAiLog(entry) {
  if (!Array.isArray(_data.schedule_ai_log)) _data.schedule_ai_log = [];
  _data.schedule_ai_log.unshift({ ...entry, at: now() });
  _data.schedule_ai_log = _data.schedule_ai_log.slice(0, 200);
  save();
}
function getScheduleAiLog(limit = 20) {
  return (_data.schedule_ai_log || []).slice(0, limit);
}

function deleteProScheduleSlot(id) {
  const s = (_data.pro_schedule_slots || []).find(x => x.id === parseInt(id));
  if (!s) return false;
  s.active = false; // soft-delete: recoverable, hidden from the board
  save();
  return true;
}

// Public (no-login) read-only view of the pro schedule. Resolves pro ids to FIRST
// names only — no ids, contact info, passwords, or anything sensitive leaks. Feeds the
// shareable /pro-schedule-view.html page so pros can check times without signing in.
function getPublicProSchedule() {
  const nameById = {};
  for (const s of (_data.staff || [])) nameById[s.id] = String(s.name || '').split(' ')[0];
  return getProScheduleSlots().map(s => {
    const ids = (s.court_pros && Object.keys(s.court_pros).length)
      ? [...new Set(Object.values(s.court_pros).flat())]
      : (Array.isArray(s.pro_ids) ? s.pro_ids : []);
    const pros = ids.map(id => nameById[id]).filter(Boolean);
    return {
      day: s.day, start: s.start, end: s.end,
      time_label: s.time_label || '', program: s.program,
      category: s.category || '', courts: s.courts || [], pros,
    };
  });
}

// ─── Members (check-in system) ────────────────────────────────────────────────
function getAllMembers(includeInactive) {
  return (_data.members || [])
    .filter(m => includeInactive || m.active !== false)
    .sort((a, b) => String(a.last_name).localeCompare(String(b.last_name)) || String(a.first_name).localeCompare(String(b.first_name)));
}
function getMemberById(id) { return (_data.members || []).find(m => m.id === parseInt(id)); }
function getMemberByPin(pin) {
  if (!pin) return null;
  return (_data.members || []).find(m => m.active !== false && String(m.pin) === String(pin).trim());
}
function searchMembersByName(q) {
  if (!q) return [];
  const s = String(q).toLowerCase().trim();
  return (_data.members || [])
    .filter(m => m.active !== false && (
      String(m.last_name || '').toLowerCase().startsWith(s) ||
      String(m.club_number || '').toLowerCase().startsWith(s)
    ))
    .sort((a, b) => String(a.last_name).localeCompare(String(b.last_name)) || String(a.first_name).localeCompare(String(b.first_name)));
}
function addMember({ firstName, lastName, clubNumber, phone, email, pin, memberType }) {
  if (!Array.isArray(_data.members)) { _data.members = []; _data._seq.members = 0; }
  const id = nextId('members');
  _data.members.push({
    id,
    club_number: String(clubNumber || '').trim().toUpperCase().slice(0, 10),
    first_name: String(firstName || '').trim().slice(0, 60),
    last_name: String(lastName || '').trim().slice(0, 60),
    phone: String(phone || '').trim().slice(0, 20),
    email: String(email || '').trim().slice(0, 80),
    pin: String(pin || '').trim().slice(0, 10),
    member_type: ['full', 'junior', 'family', 'social', 'limited', 'seasonal', 'other'].includes(memberType) ? memberType : 'full',
    active: true,
    created_at: now(),
  });
  save(); return id;
}
function updateMember(id, fields) {
  const m = (_data.members || []).find(x => x.id === parseInt(id));
  if (!m) return null;
  if (fields.clubNumber !== undefined) m.club_number = String(fields.clubNumber).trim().toUpperCase().slice(0, 10);
  if (fields.firstName !== undefined) m.first_name = String(fields.firstName).trim().slice(0, 60);
  if (fields.lastName !== undefined) m.last_name = String(fields.lastName).trim().slice(0, 60);
  if (fields.phone !== undefined) m.phone = String(fields.phone).trim().slice(0, 20);
  if (fields.email !== undefined) m.email = String(fields.email).trim().slice(0, 80);
  if (fields.pin !== undefined) m.pin = String(fields.pin).trim().slice(0, 10);
  if (fields.memberType !== undefined) m.member_type = fields.memberType;
  if (fields.active !== undefined) m.active = !!fields.active;
  save(); return m;
}
function getMemberByClubNumber(clubNum) {
  if (!clubNum) return null;
  return (_data.members || []).find(m => m.active !== false && String(m.club_number || '').toUpperCase() === String(clubNum).trim().toUpperCase());
}
function deactivateMember(id) {
  const m = (_data.members || []).find(x => x.id === parseInt(id));
  if (!m) return false;
  m.active = false; save(); return true;
}
// ─── Check-in logs ────────────────────────────────────────────────────────────
function addCheckinLog({ memberId, method }) {
  if (!Array.isArray(_data.checkin_logs)) { _data.checkin_logs = []; _data._seq.checkin_logs = 0; }
  const ts = now();
  const today = ts.slice(0, 10);
  const duplicate = (_data.checkin_logs || []).some(l => l.date === today && l.member_id === parseInt(memberId));
  const id = nextId('checkin_logs');
  _data.checkin_logs.push({ id, member_id: parseInt(memberId), date: today, time: ts.slice(11, 19), method: method === 'name' ? 'name' : 'pin', duplicate: duplicate || undefined, created_at: ts });
  save(); return { id, duplicate };
}
function getCheckinLogsByDate(date) {
  const byId = {}; (_data.members || []).forEach(m => { byId[m.id] = m.first_name + ' ' + m.last_name; });
  return (_data.checkin_logs || [])
    .filter(l => l.date === date)
    .sort((a, b) => String(a.time).localeCompare(String(b.time)))
    .map(l => ({ ...l, member_name: byId[l.member_id] || '—' }));
}
function getMemberCheckinToday(memberId) {
  const today = now().slice(0, 10);
  return (_data.checkin_logs || []).find(l => l.date === today && l.member_id === parseInt(memberId)) || null;
}
function getUnsyncedCheckins() {
  const byId = {}; (_data.members || []).forEach(m => { byId[m.id] = m; });
  return (_data.checkin_logs || [])
    .filter(l => !l.gametime_synced_at && !l.duplicate)
    .sort((a, b) => String(a.created_at).localeCompare(String(b.created_at)))
    .map(l => {
      const m = byId[l.member_id] || {};
      return { ...l, first_name: m.first_name || '', last_name: m.last_name || '', club_number: m.club_number || '' };
    });
}
function markCheckinSynced(id) {
  const log = (_data.checkin_logs || []).find(l => l.id === parseInt(id));
  if (!log) return false;
  log.gametime_synced_at = now();
  save(); return true;
}
function markCheckinSyncFailed(id, reason) {
  const log = (_data.checkin_logs || []).find(l => l.id === parseInt(id));
  if (!log) return false;
  log.gametime_sync_error = reason || 'unknown';
  log.gametime_sync_attempted_at = now();
  save(); return true;
}

module.exports = {
  getIdeas,
  getIdea,
  getIdeaOut,
  addIdea,
  setIdeaImage,
  toggleIdeaVote,
  setIdeaStatus,
  deleteIdea,
  getIdeaComments,
  addIdeaComment,
  deleteIdeaComment,
  getContractorWork,
  addContractorWork,
  decideContractorWork,
  deleteContractorWork,
  getContractorExpenses,
  getContractorExpense,
  addContractorExpense,
  setContractorExpenseReceipt,
  decideContractorExpense,
  deleteContractorExpense,
  getContractorProjects,
  addContractorProject,
  decideContractorProject,
  deleteContractorProject,
  getContractorSubWork,
  addContractorSubWork,
  decideContractorSubWork,
  deleteContractorSubWork,
  getContractorSummary,
  getPeriodReceipt,
  setPeriodReceipt,
  getPeriodReceiptsForRange,
  getBubbleReadings,
  createBubbleReading,
  getCoverageRequests,
  createCoverageRequest,
  coverCoverageRequest,
  cancelCoverageRequest,
  getWaitlistSpots,
  createWaitlistSpot,
  setWaitlistStatus,
  addWaitlistUpdate,
  deleteWaitlistSpot,
  getStringLogs,
  addStringLog,
  updateStringLog,
  deleteStringLog,
  getStringCounts,
  getKnowledgeDocs,
  getKnowledgeForPrompt,
  createKnowledgeDoc,
  updateKnowledgeDoc,
  deleteKnowledgeDoc,
  getAllStaff,
  getStaffById,
  getEffectiveStaffId,
  setInitialPassword,
  managerResetPassword,
  canViewAs,
  canManageStaff,
  canManageDirectory,
  getStaffPay,
  updateStaffPay,
  getStaffDirectory,
  addStaffMember,
  addCoachAccount,
  updateStaffMember,
  addPushSubscription,
  removeSubscriptionByEndpoint,
  getSubscriptionsForStaff,
  getAcademyClasses,
  getAcademyClass,
  addAcademyClass,
  updateAcademyClass,
  getWaitlist,
  addWaitlist,
  addWaitlistActivity,
  updateWaitlist,
  deleteWaitlist,
  getChanges,
  addChange,
  addChangeActivity,
  updateChange,
  deleteChange,
  getAcademyNotes,
  addAcademyNote,
  deleteAcademyNote,
  getProScheduleSlots,
  getPublicProSchedule,
  addProScheduleSlot,
  updateProScheduleSlot,
  deleteProScheduleSlot,
  getProScheduleSlotRaw,
  addScheduleAiLog,
  getScheduleAiLog,
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
  editMessage,
  setUrgentCleared,
  clearDay,
  getAssignmentsForRange,
  getAssignmentsForShift,
  setShiftAssignments,
  addShiftRule,
  deleteShiftRule,
  addShiftSkip,
  removeShiftSkip,
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
  addExpenseItem,
  getExpenseItemById,
  getExpenseItemsForPeriod,
  getExpenseItemsForPeriodAllStaff,
  deleteExpenseItem,
  setExpenseItemReceipt,
  getCashSummary,
  upsertCashSummary,
  getCashSummaryRange,
  getAllMembers,
  getMemberById,
  getMemberByPin,
  getMemberByClubNumber,
  searchMembersByName,
  addMember,
  updateMember,
  deactivateMember,
  addCheckinLog,
  getCheckinLogsByDate,
  getMemberCheckinToday,
  getUnsyncedCheckins,
  markCheckinSynced,
  markCheckinSyncFailed,
};
