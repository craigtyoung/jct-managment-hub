const express = require('express');
const router = express.Router();
const Anthropic = require('@anthropic-ai/sdk');
const db = require('../db');

const client = new Anthropic(); // reads ANTHROPIC_API_KEY from env automatically

// requireAuth is applied at the router level in server.js — no need to re-apply here.

router.post('/chat', async (req, res) => {
  try {
    const staffId = req.actingStaffId || req.session.staffId;
    const me = db.getStaffById(staffId);
    if (!me) return res.status(401).json({ reply: 'Not authenticated.', actions_executed: 0 });

    const { message, shift, date, history = [] } = req.body;
    if (!message || typeof message !== 'string') {
      return res.status(400).json({ reply: 'No message provided.', actions_executed: 0 });
    }

    const isAdmin = me.role === 'admin' || me.role === 'manager';

    // Build date context
    const dateStr = date || new Date().toISOString().slice(0, 10);
    const dayName = new Date(dateStr + 'T12:00:00').toLocaleDateString('en-CA', { weekday: 'long' });

    // Build checklist context (only if shift provided)
    let checklistContext = '';
    if (shift) {
      const items = db.getChecklistItems(shift, dateStr);
      const formatted = items.map(i => `  id:${i.id} [${i.phase}] "${i.text}" — ${i.status}`).join('\n');
      checklistContext = `\nChecklist items for ${shift} shift on ${dateStr}:\n${formatted}`;
    }

    const systemPrompt = `You are the JCT Staff Hub assistant for Joshua Creek Tennis Club indoor tennis facility.
Staff member: ${me.name} (role: ${me.role})
Date: ${dateStr} (${dayName})${checklistContext}
Admin/manager access: ${isAdmin}

Respond ONLY with valid JSON in this exact format: { "reply": "...", "actions": [] }

Keep replies short and direct. No markdown in the reply field.

Available actions for all staff:
- { "type": "complete_items", "item_ids": [1,2], "shift": "...", "date": "..." } — check off specific checklist items by id
- { "type": "complete_phase", "phase": "start|during|bookings|end", "shift": "...", "date": "..." } — check off all pending items in a phase
- { "type": "send_message", "text": "..." } — post a message to the comms log

Admin/manager only:
- { "type": "toggle_checklist_item", "item_id": 5 } — activate/deactivate an item
- { "type": "update_checklist_item", "item_id": 5, "updates": { "text": "...", "days": [1,3] } } — modify item

Before acting on irreversible things, ask for confirmation in the reply field and include no actions.
For complete_phase: confirm which phase before executing unless the user has already confirmed.`;

    // Trim history to last 10 messages
    const trimmedHistory = (Array.isArray(history) ? history : []).slice(-10);

    // Build messages array: history + new user message
    const messages = [
      ...trimmedHistory.map(h => ({ role: h.role, content: h.content })),
      { role: 'user', content: message }
    ];

    const response = await client.messages.create({
      model: 'claude-haiku-4-5-20251001',
      max_tokens: 1024,
      system: systemPrompt,
      messages
    });

    const rawText = response.content[0]?.text || '';

    // Parse JSON from response (model may wrap in markdown fences)
    let parsed = { reply: rawText, actions: [] };
    try {
      const match = rawText.match(/\{[\s\S]*\}/);
      if (match) {
        parsed = JSON.parse(match[0]);
        if (!parsed.reply) parsed.reply = '';
        if (!Array.isArray(parsed.actions)) parsed.actions = [];
      }
    } catch (_) {
      // fallback already set above
    }

    // Execute actions server-side
    let executedCount = 0;

    for (const action of parsed.actions) {
      try {
        if (action.type === 'complete_items') {
          const itemIds = Array.isArray(action.item_ids) ? action.item_ids : [];
          const actionShift = action.shift || shift || '';
          const actionDate = action.date || dateStr;
          for (const itemId of itemIds) {
            try {
              db.completeChecklistItem({
                itemId,
                staffId: me.id,
                shift: actionShift,
                date: actionDate,
                status: 'complete',
                note: null
              });
              executedCount++;
            } catch (_) { /* skip failures */ }
          }

        } else if (action.type === 'complete_phase') {
          const actionShift = action.shift || shift || '';
          const actionDate = action.date || dateStr;
          const items = db.getChecklistItems(actionShift, actionDate);
          const pending = items.filter(i => i.phase === action.phase && i.status === 'pending');
          for (const item of pending) {
            try {
              db.completeChecklistItem({
                itemId: item.id,
                staffId: me.id,
                shift: actionShift,
                date: actionDate,
                status: 'complete',
                note: null
              });
              executedCount++;
            } catch (_) { /* skip failures */ }
          }

        } else if (action.type === 'send_message') {
          db.createMessage({
            staffId: me.id,
            content: action.text,
            shift: shift || null,
            category: 'general',
            recipients: null,
            show_on: null
          });
          executedCount++;

        } else if (action.type === 'toggle_checklist_item' && isAdmin) {
          db.toggleChecklistItem(action.item_id);
          executedCount++;

        } else if (action.type === 'update_checklist_item' && isAdmin) {
          db.updateChecklistItem(action.item_id, action.updates || {});
          executedCount++;
        }
      } catch (_) { /* skip action failures */ }
    }

    res.json({ reply: parsed.reply || '', actions_executed: executedCount });

  } catch (err) {
    console.error('[ai/chat error]', err);
    res.status(500).json({ reply: "Sorry, I'm having trouble connecting right now.", actions_executed: 0 });
  }
});

// POST /api/ai/cleanup — tidy a raw dictated transcript
router.post('/cleanup', async (req, res) => {
  const { text } = req.body;
  if (!text || !text.trim()) return res.status(400).json({ error: 'No text provided' });
  try {
    const response = await client.messages.create({
      model: 'claude-haiku-4-5-20251001',
      max_tokens: 512,
      system: 'You clean up raw voice dictation for a tennis club staff communications log. Fix punctuation and capitalization, remove filler words (um, uh, like, you know, so), and make the sentence read naturally. Keep the original meaning and casual tone — do not rewrite or expand. Return ONLY the cleaned text, no explanation, no quotes.',
      messages: [{ role: 'user', content: text.trim() }]
    });
    res.json({ cleaned: response.content[0]?.text?.trim() || text.trim() });
  } catch (err) {
    console.error('[ai/cleanup error]', err);
    res.status(500).json({ error: 'Cleanup failed' });
  }
});

module.exports = router;
