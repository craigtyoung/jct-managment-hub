/**
 * JCT Staff Assistant — floating chat widget
 * Drop one <script src="/chat-widget.js"></script> into any page and it self-installs.
 */
(function () {
  'use strict';

  // ── Styles ───────────────────────────────────────────────────────────────────
  const CSS = `
    #jct-chat-btn {
      position: fixed; bottom: 24px; right: 24px; z-index: 9000;
      width: 52px; height: 52px; border-radius: 50%;
      background: #0c1738; border: none; cursor: pointer;
      display: flex; align-items: center; justify-content: center;
      box-shadow: 0 4px 20px rgba(12,23,56,0.35);
      transition: transform 0.2s, box-shadow 0.2s;
    }
    #jct-chat-btn:hover { transform: scale(1.07); box-shadow: 0 6px 28px rgba(12,23,56,0.45); }
    #jct-chat-btn svg { width: 22px; height: 22px; color: #fff; }
    #jct-chat-badge {
      position: absolute; top: -3px; right: -3px;
      width: 14px; height: 14px; border-radius: 50%;
      background: #b1c9fb; border: 2px solid #0c1738;
      display: none;
    }

    #jct-chat-panel {
      position: fixed; bottom: 88px; right: 24px; z-index: 9001;
      width: 360px; height: 500px;
      background: #fff; border: 1px solid rgba(12,23,56,0.10);
      border-radius: 20px;
      box-shadow: 0 16px 56px rgba(12,23,56,0.18);
      display: none; flex-direction: column;
      overflow: hidden; font-family: 'DM Sans', system-ui, sans-serif;
    }
    #jct-chat-panel.open { display: flex; }

    .jct-panel-head {
      background: #0c1738; padding: 14px 16px;
      display: flex; align-items: center; justify-content: space-between;
      flex-shrink: 0;
    }
    .jct-panel-title {
      display: flex; align-items: center; gap: 9px;
      font-size: 13.5px; font-weight: 600; color: #f0f4ff;
    }
    .jct-panel-title svg { width: 16px; height: 16px; color: #b1c9fb; }
    .jct-panel-dot {
      width: 6px; height: 6px; border-radius: 50%; background: #10b981;
      animation: jctBlink 2.5s ease infinite;
    }
    @keyframes jctBlink { 0%,100%{opacity:1} 50%{opacity:0.3} }
    .jct-close-btn {
      background: none; border: none; cursor: pointer;
      color: rgba(177,201,251,0.5); padding: 2px;
      display: flex; align-items: center; justify-content: center;
      border-radius: 6px; transition: color 0.15s;
    }
    .jct-close-btn:hover { color: #f0f4ff; }
    .jct-close-btn svg { width: 16px; height: 16px; }

    .jct-messages {
      flex: 1; overflow-y: auto; padding: 14px 14px 8px;
      display: flex; flex-direction: column; gap: 10px;
      scroll-behavior: smooth;
    }
    .jct-messages::-webkit-scrollbar { width: 3px; }
    .jct-messages::-webkit-scrollbar-thumb { background: rgba(12,23,56,0.12); border-radius: 3px; }

    .jct-msg {
      max-width: 86%; font-size: 13px; line-height: 1.5;
      padding: 9px 12px; border-radius: 14px;
      white-space: pre-wrap; word-break: break-word;
    }
    .jct-msg.user {
      align-self: flex-end;
      background: #0c1738; color: #e8eef8;
      border-bottom-right-radius: 4px;
    }
    .jct-msg.assistant {
      align-self: flex-start;
      background: #f0f4f9; color: #0c1738;
      border-bottom-left-radius: 4px;
    }
    .jct-msg.error {
      align-self: flex-start;
      background: rgba(248,113,113,0.10); color: #dc2626;
      border: 1px solid rgba(248,113,113,0.2);
      border-bottom-left-radius: 4px;
    }

    .jct-typing {
      align-self: flex-start;
      background: #f0f4f9; border-radius: 14px; border-bottom-left-radius: 4px;
      padding: 10px 14px; display: flex; gap: 4px; align-items: center;
    }
    .jct-typing span {
      width: 6px; height: 6px; border-radius: 50%; background: #8fa0b8;
      animation: jctTyping 1.2s ease infinite;
    }
    .jct-typing span:nth-child(2) { animation-delay: 0.2s; }
    .jct-typing span:nth-child(3) { animation-delay: 0.4s; }
    @keyframes jctTyping { 0%,60%,100%{transform:translateY(0)} 30%{transform:translateY(-5px)} }

    .jct-input-area {
      flex-shrink: 0; padding: 10px 12px 12px;
      border-top: 1px solid rgba(12,23,56,0.08);
      display: flex; gap: 8px; align-items: flex-end;
    }
    #jct-input {
      flex: 1; min-height: 36px; max-height: 100px;
      border: 1px solid rgba(12,23,56,0.14); border-radius: 10px;
      padding: 8px 11px; font-size: 13px; font-family: inherit;
      color: #0c1738; background: #f8fafc; resize: none;
      outline: none; transition: border-color 0.15s;
      overflow-y: auto; line-height: 1.45;
    }
    #jct-input:focus { border-color: rgba(44,92,156,0.40); background: #fff; }
    #jct-input::placeholder { color: #8fa0b8; }
    #jct-send {
      width: 36px; height: 36px; border-radius: 9px; flex-shrink: 0;
      background: #0c1738; border: none; cursor: pointer;
      display: flex; align-items: center; justify-content: center;
      transition: background 0.15s;
    }
    #jct-send:hover { background: #1a2d5a; }
    #jct-send:disabled { background: #c9d3e0; cursor: default; }
    #jct-send svg { width: 15px; height: 15px; color: #fff; }

    .jct-welcome {
      text-align: center; padding: 20px 16px;
      font-size: 12.5px; color: #8fa0b8; line-height: 1.55;
    }
    .jct-welcome strong { display: block; color: #0c1738; font-size: 13px; margin-bottom: 6px; }
    .jct-chip-row {
      display: flex; flex-wrap: wrap; gap: 6px; justify-content: center; margin-top: 10px;
    }
    .jct-chip {
      font-size: 11.5px; padding: 4px 10px; border-radius: 100px;
      border: 1px solid rgba(12,23,56,0.14); background: #f0f4f9;
      color: #4a6080; cursor: pointer; transition: background 0.15s;
    }
    .jct-chip:hover { background: #e2e8f5; }
  `;

  const WELCOME_CHIPS = [
    "Who's on shift today?",
    "What's on my checklist?",
    "Show me this week's schedule",
    "Any recent comms?",
  ];

  // ── DOM ───────────────────────────────────────────────────────────────────────
  const style = document.createElement('style');
  style.textContent = CSS;
  document.head.appendChild(style);

  // Floating button
  const btn = document.createElement('button');
  btn.id = 'jct-chat-btn';
  btn.title = 'Staff Assistant';
  btn.innerHTML = `
    <svg fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="1.8">
      <path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"/>
    </svg>
    <div id="jct-chat-badge"></div>
  `;
  document.body.appendChild(btn);

  // Panel
  const panel = document.createElement('div');
  panel.id = 'jct-chat-panel';
  panel.innerHTML = `
    <div class="jct-panel-head">
      <div class="jct-panel-title">
        <svg fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="1.8">
          <path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"/>
        </svg>
        Staff Assistant
        <div class="jct-panel-dot"></div>
      </div>
      <button class="jct-close-btn" id="jct-close">
        <svg fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2">
          <path d="M18 6L6 18M6 6l12 12"/>
        </svg>
      </button>
    </div>
    <div class="jct-messages" id="jct-messages">
      <div class="jct-welcome">
        <strong>Hey — how can I help?</strong>
        I can look up the schedule, check checklist progress, or pull recent comms.
        <div class="jct-chip-row" id="jct-chips"></div>
      </div>
    </div>
    <div class="jct-input-area">
      <textarea id="jct-input" placeholder="Ask anything about the hub…" rows="1"></textarea>
      <button id="jct-send">
        <svg fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2">
          <path d="M22 2L11 13M22 2L15 22l-4-9-9-4 20-7z"/>
        </svg>
      </button>
    </div>
  `;
  document.body.appendChild(panel);

  // ── State ─────────────────────────────────────────────────────────────────────
  let isOpen = false;
  let isWaiting = false;
  let history = []; // { role: 'user'|'assistant', content: string }

  const messagesEl = document.getElementById('jct-messages');
  const inputEl    = document.getElementById('jct-input');
  const sendEl     = document.getElementById('jct-send');
  const chipsEl    = document.getElementById('jct-chips');

  // ── Welcome chips ─────────────────────────────────────────────────────────────
  WELCOME_CHIPS.forEach(text => {
    const chip = document.createElement('button');
    chip.className = 'jct-chip';
    chip.textContent = text;
    chip.onclick = () => sendMessage(text);
    chipsEl.appendChild(chip);
  });

  // ── Toggle ────────────────────────────────────────────────────────────────────
  btn.addEventListener('click', () => {
    isOpen = !isOpen;
    panel.classList.toggle('open', isOpen);
    if (isOpen) { inputEl.focus(); scrollBottom(); }
  });
  document.getElementById('jct-close').addEventListener('click', () => {
    isOpen = false; panel.classList.remove('open');
  });

  // ── Input auto-resize ─────────────────────────────────────────────────────────
  inputEl.addEventListener('input', () => {
    inputEl.style.height = 'auto';
    inputEl.style.height = Math.min(inputEl.scrollHeight, 100) + 'px';
  });
  inputEl.addEventListener('keydown', e => {
    if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); sendMessage(); }
  });
  sendEl.addEventListener('click', () => sendMessage());

  // ── Scroll ────────────────────────────────────────────────────────────────────
  function scrollBottom() {
    setTimeout(() => { messagesEl.scrollTop = messagesEl.scrollHeight; }, 50);
  }

  // ── Render a message bubble ───────────────────────────────────────────────────
  function appendBubble(role, text) {
    // Remove welcome message on first real turn
    const welcome = messagesEl.querySelector('.jct-welcome');
    if (welcome) welcome.remove();

    const div = document.createElement('div');
    div.className = `jct-msg ${role}`;
    div.textContent = text;
    messagesEl.appendChild(div);
    scrollBottom();
    return div;
  }

  function showTyping() {
    const div = document.createElement('div');
    div.className = 'jct-typing';
    div.id = 'jct-typing';
    div.innerHTML = '<span></span><span></span><span></span>';
    messagesEl.appendChild(div);
    scrollBottom();
  }
  function hideTyping() {
    const t = document.getElementById('jct-typing');
    if (t) t.remove();
  }

  // ── Send ──────────────────────────────────────────────────────────────────────
  async function sendMessage(override) {
    const text = (override || inputEl.value).trim();
    if (!text || isWaiting) return;

    inputEl.value = '';
    inputEl.style.height = 'auto';

    history.push({ role: 'user', content: text });
    appendBubble('user', text);

    isWaiting = true;
    sendEl.disabled = true;
    showTyping();

    try {
      const res = await fetch('/api/chat', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ messages: history }),
        credentials: 'same-origin',
      });

      hideTyping();

      if (res.status === 401) {
        appendBubble('error', 'Session expired — please refresh and log in again.');
        return;
      }

      const data = await res.json();

      if (!res.ok) {
        appendBubble('error', data.error || 'Something went wrong. Try again.');
        history.pop(); // remove user message so they can retry
        return;
      }

      history.push({ role: 'assistant', content: data.reply });
      appendBubble('assistant', data.reply);
    } catch (err) {
      hideTyping();
      appendBubble('error', 'Could not reach the assistant. Check your connection.');
      history.pop();
    } finally {
      isWaiting = false;
      sendEl.disabled = false;
      inputEl.focus();
    }
  }

  // Public API — lets the dashboard ask-bar drive this single assistant.
  window.jctChat = {
    open() { isOpen = true; panel.classList.add('open'); inputEl.focus(); scrollBottom(); },
    ask(text) {
      isOpen = true;
      panel.classList.add('open');
      scrollBottom();
      if (text && String(text).trim()) sendMessage(String(text));
    }
  };
})();
