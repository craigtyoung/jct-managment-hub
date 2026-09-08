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
- If asked to make a change (add staff, post a note), say you can look things up but changes are made directly in the hub for now.
- Format lists cleanly. No unnecessary preamble.

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

    // Agentic loop — max 6 rounds to avoid runaway tool chains
    for (let i = 0; i < 6; i++) {
      const response = await client.messages.create({
        model: 'claude-haiku-4-5-20251001',
        max_tokens: 1024,
        system: systemBlocks,
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
