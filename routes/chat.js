const express = require('express');
const router  = express.Router();
const Anthropic = require('@anthropic-ai/sdk');
const db = require('../db');

const client = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });

// ─── Tool definitions ─────────────────────────────────────────────────────────

const TOOLS = [
  {
    name: 'get_schedule',
    description: 'Look up which staff are assigned to a specific shift on a specific date. Use this when someone asks who is working on a particular day or shift.',
    input_schema: {
      type: 'object',
      properties: {
        date:  { type: 'string', description: 'Date in YYYY-MM-DD format (e.g. 2026-09-01)' },
        shift: { type: 'string', enum: ['morning', 'afternoon', 'closing'] }
      },
      required: ['date', 'shift']
    }
  },
  {
    name: 'get_week_schedule',
    description: 'Get the full weekly schedule. Use when someone asks about a whole week or multiple days.',
    input_schema: {
      type: 'object',
      properties: {
        start_date: { type: 'string', description: 'Monday date of the week in YYYY-MM-DD format' },
        end_date:   { type: 'string', description: 'Sunday date of the week in YYYY-MM-DD format' }
      },
      required: ['start_date', 'end_date']
    }
  },
  {
    name: 'get_recent_comms',
    description: 'Get recent staff communications, notes, and handover messages from the communications log.',
    input_schema: {
      type: 'object',
      properties: {
        limit: { type: 'number', description: 'How many recent messages to fetch (max 10, default 5)' }
      }
    }
  },
  {
    name: 'get_checklist_progress',
    description: 'Check how much of the shift checklist has been completed for a specific shift and date.',
    input_schema: {
      type: 'object',
      properties: {
        shift: { type: 'string', enum: ['morning', 'afternoon', 'closing'] },
        date:  { type: 'string', description: 'Date in YYYY-MM-DD format' }
      },
      required: ['shift', 'date']
    }
  },
  {
    name: 'read_pro_schedule',
    description: 'List the pro teaching schedule for a day of the week (classes + private lessons, with courts, times, coaches, and each slot id). Always call this before proposing any schedule edit so you know what already exists.',
    input_schema: {
      type: 'object',
      properties: { day: { type: 'string', enum: ['Mon','Tue','Wed','Thu','Fri','Sat','Sun'] } },
      required: ['day']
    }
  },
  {
    name: 'list_coaches',
    description: 'List the staff pros plus coach names already used in the schedule (to check spelling). You may still name any other coach as free text.',
    input_schema: { type: 'object', properties: {} }
  }
];

// Management-only write tools. A change is STAGED by propose_schedule_edit (no save),
// then COMMITTED by apply_schedule_edit only after the user confirms in their own words.
const WRITE_TOOLS = [
  {
    name: 'propose_schedule_edit',
    description: 'Stage one change to the pro schedule for the manager to confirm. This does NOT save anything — it returns a plain-English summary and a change_id. Show the summary and wait for the user to clearly say yes, THEN call apply_schedule_edit with the change_id. Never apply without an explicit confirmation. One change per call.',
    input_schema: {
      type: 'object',
      properties: {
        action: { type: 'string', enum: ['add','assign_coaches','remove'], description: 'add = create a class or private lesson; assign_coaches = set the coaches on an existing slot; remove = delete a slot' },
        day: { type: 'string', enum: ['Mon','Tue','Wed','Thu','Fri','Sat','Sun'] },
        type: { type: 'string', enum: ['class','private'], description: "private = a private lesson (one court, one coach, no program name)" },
        program: { type: 'string', description: 'Class/program name (e.g. "Cardio Tennis", "U9", "National Transition"). Not needed for a private lesson.' },
        courts: { type: 'array', items: { type: 'string' }, description: 'Court numbers, e.g. ["1","2"]' },
        start: { type: 'string', description: '24-hour HH:MM, e.g. "16:30"' },
        end: { type: 'string', description: '24-hour HH:MM, e.g. "18:00"' },
        time_label: { type: 'string', description: 'Human label, e.g. "4:30–6:00 PM"' },
        coaches: { type: 'string', description: 'Coach name(s) as free text, comma-separated, e.g. "Megan, Daniel G". "Donski" = Mike.' },
        capacity: { type: 'string', description: 'Optional, e.g. "12/12"' },
        category: { type: 'string', enum: ['junior','adult','private'] },
        slot_id: { type: 'number', description: 'Required for assign_coaches and remove — the slot id from read_pro_schedule' }
      },
      required: ['action']
    }
  },
  {
    name: 'propose_add_coach',
    description: "Stage adding a new coach as a pro so they appear in the schedule drag rail, the board, and the public view. No login is required (they can be given one later). Use this when a coach isn't in the system yet. Stage it, confirm with the user, then apply with apply_schedule_edit.",
    input_schema: {
      type: 'object',
      properties: { name: { type: 'string', description: 'Coach name, e.g. "Katya" or "Katya Smith"' } },
      required: ['name']
    }
  },
  {
    name: 'apply_schedule_edit',
    description: 'Commit a change that was previously staged (a schedule edit or an add-coach). Only call this after the user has clearly confirmed the specific change_id.',
    input_schema: {
      type: 'object',
      properties: { change_id: { type: 'string' } },
      required: ['change_id']
    }
  }
];

// In-memory staging area for proposed edits (survives across requests in the same
// server process; a redeploy clears it, which is fine — the user just re-proposes).
const _pendingEdits = new Map();
let _pendingSeq = 0;

function _stash(change, summary, staffId) {
  _pendingSeq += 1;
  const id = 'chg_' + _pendingSeq;
  _pendingEdits.set(id, { change, summary, staffId });
  return { change_id: id, summary, next: 'Show this summary to the user and wait for a clear yes before calling apply_schedule_edit.' };
}

function proposeScheduleEdit(input) {
  const DAYS = ['Mon','Tue','Wed','Thu','Fri','Sat','Sun'];
  if (input.action === 'add') {
    if (!DAYS.includes(input.day)) return { error: 'A valid day (Mon–Sun) is required.' };
    const isPrivate = input.type === 'private';
    const program = isPrivate ? 'Private Lesson' : String(input.program || '').trim();
    if (!isPrivate && !program) return { error: 'A program name is required for a class.' };
    const courts = Array.isArray(input.courts) ? input.courts.map(String) : (input.courts ? [String(input.courts)] : []);
    const payload = {
      day: input.day, type: isPrivate ? 'private' : 'class', program, courts,
      start: input.start || '', end: input.end || '', time_label: input.time_label || '',
      coaches: input.coaches || '', capacity: input.capacity || null,
      category: input.category || (isPrivate ? 'private' : 'junior'),
    };
    const when = input.time_label || (input.start ? `${input.start}–${input.end}` : '');
    const summary = `ADD ${isPrivate ? 'private lesson' : program} · ${input.day}` +
      (courts.length ? ` · court${courts.length > 1 ? 's' : ''} ${courts.join(', ')}` : '') +
      (when ? ` · ${when}` : '') + (input.coaches ? ` · ${input.coaches}` : '');
    return _stash({ kind: 'add', payload }, summary, null);
  }
  if (input.action === 'assign_coaches') {
    if (!input.slot_id) return { error: 'slot_id is required — read_pro_schedule first.' };
    const slot = db.getProScheduleSlotRaw(input.slot_id);
    if (!slot) return { error: 'Slot not found.' };
    const summary = `SET COACHES on "${slot.program}" (${slot.day} ${slot.time_label || slot.start}) → ${input.coaches || '(none)'}`;
    return _stash({ kind: 'update', slot_id: input.slot_id, payload: { coaches: input.coaches || '' } }, summary, null);
  }
  if (input.action === 'remove') {
    if (!input.slot_id) return { error: 'slot_id is required.' };
    const slot = db.getProScheduleSlotRaw(input.slot_id);
    if (!slot) return { error: 'Slot not found.' };
    const summary = `REMOVE "${slot.program}" · ${slot.day} ${slot.time_label || slot.start}${slot.coaches ? ` · ${slot.coaches}` : ''}`;
    return _stash({ kind: 'remove', slot_id: input.slot_id }, summary, null);
  }
  return { error: 'Unknown action.' };
}

function applyScheduleEdit(change_id, me) {
  const p = _pendingEdits.get(change_id);
  if (!p) return { error: 'No staged change with that id (it may have cleared). Please re-propose.' };
  const { change, summary } = p;
  let result = { ok: false };
  if (change.kind === 'add') { const s = db.addProScheduleSlot(change.payload); result = { ok: true, created_slot_id: s.id }; }
  else if (change.kind === 'update') { result = db.updateProScheduleSlot(change.slot_id, change.payload) ? { ok: true } : { error: 'Slot no longer exists.' }; }
  else if (change.kind === 'remove') { result = db.deleteProScheduleSlot(change.slot_id) ? { ok: true } : { error: 'Slot no longer exists.' }; }
  else if (change.kind === 'add_coach') { const c = db.addCoachAccount(change.payload.name); result = { ok: true, coach_id: c.id }; }
  _pendingEdits.delete(change_id);
  if (result.ok) {
    db.addScheduleAiLog({ by: me.name, by_id: me.id, kind: change.kind, summary });
    try { require('../sse').broadcast('update'); } catch (e) {}
  }
  return { ...result, applied: result.ok ? summary : undefined };
}

// ─── Tool execution ───────────────────────────────────────────────────────────

function executeTool(name, input, ctx) {
  const staffId = ctx.staffId;
  try {
    if (name === 'get_schedule') {
      const assigned = db.getAssignmentsForShift(input.date, input.shift);
      if (!assigned.length) return { date: input.date, shift: input.shift, staff: [], message: 'No one assigned.' };
      return { date: input.date, shift: input.shift, staff: assigned.map(a => ({ name: a.staff_name, role: a.staff_role })) };
    }
    if (name === 'get_week_schedule') {
      const rows = db.getAssignmentsForRange(input.start_date, input.end_date);
      const grouped = {};
      for (const r of rows) {
        const key = `${r.date}|${r.shift}`;
        if (!grouped[key]) grouped[key] = { date: r.date, shift: r.shift, staff: [] };
        grouped[key].staff.push(r.staff_name);
      }
      return Object.values(grouped).sort((a, b) => a.date.localeCompare(b.date) || a.shift.localeCompare(b.shift));
    }
    if (name === 'get_recent_comms') {
      const limit = Math.min(input.limit || 5, 10);
      const msgs = db.getMessages({ limit, offset: 0, staffId });
      return msgs.map(m => ({ author: m.author_name, content: m.content, category: m.category, time: m.created_at }));
    }
    if (name === 'get_checklist_progress') {
      return { ...db.getChecklistProgress(input.shift, input.date), shift: input.shift, date: input.date };
    }
    if (name === 'read_pro_schedule') {
      const proName = id => (db.getStaffById(id) || {}).name || ('#' + id);
      return (db.getProScheduleSlots(input.day) || []).map(s => {
        let coaches = s.coaches || '';
        if (!coaches && s.court_pros) { const ids = [...new Set(Object.values(s.court_pros).flat())]; if (ids.length) coaches = ids.map(proName).join(', '); }
        return { id: s.id, type: s.type, program: s.program, courts: s.courts, time: s.time_label || `${s.start}-${s.end}`, coaches, capacity: s.capacity };
      });
    }
    if (name === 'list_coaches') {
      const staffPros = db.getAllStaff().filter(s => ['pro', 'manager'].includes(s.role)).map(s => s.name);
      const known = new Set();
      (db.getProScheduleSlots() || []).forEach(s => (s.coaches || '').split(',').map(x => x.trim()).filter(Boolean).forEach(n => known.add(n)));
      return { staff_pros: staffPros, coaches_in_schedule: [...known], note: 'You may also name any other coach as free text.' };
    }
    if (name === 'propose_schedule_edit' || name === 'propose_add_coach' || name === 'apply_schedule_edit') {
      if (!ctx.isMgmt) return { error: 'Only management can edit the pro schedule.' };
      if (name === 'propose_schedule_edit') return proposeScheduleEdit(input);
      if (name === 'propose_add_coach') {
        const nm = String(input.name || '').trim();
        if (!nm) return { error: 'Coach name is required.' };
        return _stash({ kind: 'add_coach', payload: { name: nm } }, `ADD COACH · ${nm} (role: pro — shows in the rail + public view, no login needed)`, null);
      }
      return applyScheduleEdit(input.change_id, ctx.me);
    }
    return { error: `Unknown tool: ${name}` };
  } catch (err) {
    return { error: err.message };
  }
}

// ─── System prompt ────────────────────────────────────────────────────────────

// Stable instructions + the club knowledge base. Kept first and cache-controlled so
// it's reused across turns and staff (only changes when the knowledge base is edited).
function buildInstructions() {
  const knowledge = db.getKnowledgeForPrompt();
  return `You are the Staff Assistant for Joshua Creek Tennis Club's internal Staff Hub. You help staff with schedules, checklists, communications, and club policy questions.

Active modules in the hub:
1. **Dashboard** — live overview: who's on, latest notes, weather, bubble status.
2. **Shift Checklist** — daily tasks by shift (morning/afternoon/closing) in phases.
3. **Schedule** — weekly shift schedule. Three shifts/day (morning/afternoon/closing); recurring rules can carry custom hours (e.g. Thursday and Friday).
4. **Waitlist** — open spots from class cancellations; staff track filling them (Open/Working/Filled).
5. **Timesheets** — staff log hours; management sees all.
6. **Communications Log** — notes and handovers. Categories: Urgent (management-only), Membership, Pro Shop, Maintenance, Academy, General; any note can also be flagged Time-Sensitive.
7. **Bubble Monitoring** — dome temperature/pressure log tied to wind conditions.
8. **Maintenance** — the contractor/maintenance hub (work log, expenses, projects).

Behavior:
- Be brief and direct — this is an internal tool, not a help centre.
- Use tools to look up live schedule, checklist, and comms data. Never invent schedule data — always call the tool.
- For club-policy questions (booking rules, membership, pricing, leagues, house-league rules, etc.) use the CLUB KNOWLEDGE BASE below.
- **If the answer isn't in the Knowledge Base or available via a tool, say you don't have that information and suggest checking with management. Never guess or invent policy, pricing, hours, or rules.**
- For posting notes or other changes (besides the pro schedule below), say you can look things up but those changes are made directly in the hub for now.
- Format lists cleanly. No unnecessary preamble.

Editing the Pro Schedule (management only — these tools only exist for admins/managers):
- You CAN edit the pro teaching schedule. Always call read_pro_schedule for the day first so you work from what's already there.
- To change anything, call propose_schedule_edit — this only STAGES the change and returns a summary + change_id. Show the user exactly what will change and WAIT for them to clearly confirm ("yes"). Only then call apply_schedule_edit with that change_id. NEVER apply without an explicit confirmation. One change at a time.
- A **private lesson** = type "private": one court, one coach, a start/end time, no program name. A **class** = type "class" with a program name (e.g. Cardio Tennis, U9, National Transition, Bronze), one or more courts, coaches, and times.
- Coaches are free text — they do NOT need to be staff members. "Donski" means Mike.
- If a coach isn't in the system yet and the user wants them draggable / properly on the roster, use propose_add_coach to add them as a pro (then apply after confirmation). They don't need a login — they still appear in the drag rail and public view.
- Times are 24-hour (e.g. 16:30); also give a friendly time_label like "4:30–6:00 PM".
- Do NOT add non-pro events (e.g. Men's House League, or outside groups like "RMarshall Group").

${knowledge
  ? `=== CLUB KNOWLEDGE BASE ===\n${knowledge}\n=== END KNOWLEDGE BASE ===`
  : `(The Club Knowledge Base is empty. Management can add booking rules, membership, pricing, and league rules in the Knowledge Base area.)`}`;
}

// Volatile per-request context — kept AFTER the cached block so it never breaks the cache.
function buildContext(me) {
  const d = new Date();
  const dateStr = d.toLocaleDateString('en-CA', { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' });
  const timeStr = d.toLocaleTimeString('en-CA', { hour: '2-digit', minute: '2-digit', hour12: true });
  const h = d.getHours();
  const currentShift = h < 13 ? 'morning' : h < 19 ? 'afternoon' : 'closing';
  return `Current context:\n- Date: ${dateStr}\n- Time: ${timeStr}\n- Current shift: ${currentShift}\n- Logged in as: ${me.name} (${me.role})`;
}

// ─── Route ────────────────────────────────────────────────────────────────────

router.post('/', async (req, res) => {
  try {
    const staffId = req.session.staffId;
    const me = db.getStaffById(staffId);
    if (!me) return res.status(401).json({ error: 'Not authenticated' });

    const { messages } = req.body;
    if (!Array.isArray(messages) || !messages.length) {
      return res.status(400).json({ error: 'messages array required' });
    }

    // System prompt as two blocks: stable instructions + knowledge (cached), then
    // volatile per-request context. Caching cuts cost/latency as the KB grows.
    const systemBlocks = [
      { type: 'text', text: buildInstructions(), cache_control: { type: 'ephemeral' } },
      { type: 'text', text: buildContext(me) },
    ];
    let apiMessages = messages.map(m => ({ role: m.role, content: m.content }));

    // Schedule-edit tools are exposed to management only.
    const isMgmt = me.role === 'admin' || me.role === 'manager';
    const tools = isMgmt ? [...TOOLS, ...WRITE_TOOLS] : TOOLS;

    // Agentic loop — max 6 rounds to avoid runaway tool chains
    for (let i = 0; i < 6; i++) {
      const response = await client.messages.create({
        model: 'claude-haiku-4-5-20251001',
        max_tokens: 1024,
        system: systemBlocks,
        tools,
        messages: apiMessages,
      });

      if (response.stop_reason === 'end_turn') {
        const text = response.content.find(b => b.type === 'text')?.text || '';
        return res.json({ reply: text });
      }

      if (response.stop_reason === 'tool_use') {
        apiMessages.push({ role: 'assistant', content: response.content });
        const toolResults = [];
        for (const block of response.content) {
          if (block.type !== 'tool_use') continue;
          const result = executeTool(block.name, block.input, { staffId, me, isMgmt });
          toolResults.push({ type: 'tool_result', tool_use_id: block.id, content: JSON.stringify(result) });
        }
        apiMessages.push({ role: 'user', content: toolResults });
        continue;
      }

      break; // unexpected stop reason
    }

    res.status(500).json({ error: 'Assistant did not produce a response.' });
  } catch (err) {
    console.error('[chat] error:', err.message);
    if (err.status === 401 || (err.message && err.message.includes('API key'))) {
      return res.status(503).json({ error: 'Assistant API key not configured.' });
    }
    res.status(500).json({ error: 'Assistant unavailable. Please try again.' });
  }
});

module.exports = router;
