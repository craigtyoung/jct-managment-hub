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
['academy_waitlist', 'academy_changes', 'academy_notes', 'staff_pay', 'push_subscriptions'].forEach(t => {
  if (!Array.isArray(_data[t])) { _data._seq[t] = 0; _data[t] = []; save(); }
});

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
  save();
  return true;
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
  const aud = audience === 'pro' ? 'pro' : 'office';
  if (aud === 'pro' && !(viewerIsMgmt || viewerIsPro)) return [];
  if (aud === 'office' && viewerIsPro) return [];
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
      audience: aud,
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

function createMessage({ staffId, content, shift, category, recipients, show_on, audience }) {
  const id = nextId('messages');
  const aud = audience === 'pro' ? 'pro' : 'office';
  const officeCategories = ['membership', 'pro-shop', 'maintenance', 'academy', 'general'];
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
  const aud = audience === 'pro' ? 'pro' : (audience === 'office' ? 'office' : (viewerIsPro ? 'pro' : 'office'));
  if (aud === 'pro' && !(viewerIsPro || viewerIsMgmt)) return 0;
  if (aud === 'office' && viewerIsPro) return 0;
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
const STAFF_ROLES = ['admin', 'manager', 'staff', 'pro', 'contractor'];
const STAFF_PALETTE = ['#2c5c9c', '#0d9488', '#8b5cf6', '#f59e0b', '#dc2626', '#059669', '#d97706', '#7c3aed', '#0891b2', '#db2777'];
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
