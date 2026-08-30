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
  }
];

// ─── Tool execution ───────────────────────────────────────────────────────────

function executeTool(name, input, staffId) {
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
    return { error: `Unknown tool: ${name}` };
  } catch (err) {
    return { error: err.message };
  }
}

// ─── System prompt ────────────────────────────────────────────────────────────

function buildSystemPrompt(me) {
  const d = new Date();
  const dateStr = d.toLocaleDateString('en-CA', { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' });
  const timeStr = d.toLocaleTimeString('en-CA', { hour: '2-digit', minute: '2-digit', hour12: true });
  const h = d.getHours();
  const currentShift = h < 13 ? 'morning' : h < 19 ? 'afternoon' : 'closing';

  return `You are the Staff Assistant for Joshua Creek Tennis Club's internal Staff Hub. You help staff with questions about their schedules, checklists, and communications.

Current context:
- Date: ${dateStr}
- Time: ${timeStr}
- Current shift: ${currentShift}
- Logged in as: ${me.name} (${me.role})

Active modules in the hub:
1. **Shift Checklist** — Daily tasks by shift (morning/afternoon/closing) in phases: start of shift, during shift, bookings, end of shift.
2. **Schedule** — Weekly shift schedule. Three shifts per day: morning, afternoon, closing. Uses recurring rules plus one-off overrides.
3. **Timesheets** — Staff log actual hours worked per shift. Admins/managers can view all staff.
4. **Communications Log** — Staff notes, shift handovers, team announcements. Categories: General, Membership, Pro Shop, Reminders, Academy.

Behavior:
- Be brief and direct — this is an internal tool, not a help centre.
- Use tools to look up real data when asked about schedules, checklists, or recent comms.
- If asked to make changes (add staff, post a note, etc.) say you can look things up but changes must be made directly in the hub for now.
- Never invent schedule data — always call get_schedule to check.
- Format lists cleanly. No unnecessary preamble.`;
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

    const systemPrompt = buildSystemPrompt(me);
    let apiMessages = messages.map(m => ({ role: m.role, content: m.content }));

    // Agentic loop — max 6 rounds to avoid runaway tool chains
    for (let i = 0; i < 6; i++) {
      const response = await client.messages.create({
        model: 'claude-haiku-4-5-20251001',
        max_tokens: 1024,
        system: systemPrompt,
        tools: TOOLS,
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
          const result = executeTool(block.name, block.input, staffId);
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
