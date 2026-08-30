/**
 * ai-widget.js — JCT Assistant floating chat widget
 * Include this script on any page that should have AI assistant access.
 * Pages can expose window.currentShift and window.currentDate for context.
 * Exposes window.aiWidget = { setContext(shift, date) }
 */
(function () {
  'use strict';

  // ─── State ────────────────────────────────────────────────────────────────
  let _shift = window.currentShift || null;
  let _date = window.currentDate || new Date().toISOString().slice(0, 10);
  let _history = [];
  let _isOpen = false;
  let _isWaiting = false;

  // ─── Styles ───────────────────────────────────────────────────────────────
  const NAVY = '#0c1738';
  const POWDER = '#b1c9fb';
  const WHITE = '#ffffff';
  const FONT = "'DM Sans', system-ui, -apple-system, sans-serif";

  const css = `
    #jct-ai-btn {
      position: fixed;
      bottom: 90px;
      right: 20px;
      width: 52px;
      height: 52px;
      border-radius: 50%;
      background: ${NAVY};
      border: none;
      cursor: pointer;
      box-shadow: 0 4px 14px rgba(12,23,56,0.4);
      display: flex;
      align-items: center;
      justify-content: center;
      z-index: 9998;
      transition: transform 0.15s ease, box-shadow 0.15s ease;
    }
    #jct-ai-btn:hover {
      transform: scale(1.08);
      box-shadow: 0 6px 20px rgba(12,23,56,0.5);
    }
    #jct-ai-panel {
      position: fixed;
      bottom: 150px;
      right: 20px;
      width: 360px;
      height: 480px;
      background: ${WHITE};
      border-radius: 14px;
      box-shadow: 0 8px 32px rgba(12,23,56,0.22);
      display: flex;
      flex-direction: column;
      z-index: 9999;
      font-family: ${FONT};
      overflow: hidden;
      transform: translateY(16px);
      opacity: 0;
      pointer-events: none;
      transition: transform 0.22s ease, opacity 0.22s ease;
    }
    #jct-ai-panel.open {
      transform: translateY(0);
      opacity: 1;
      pointer-events: all;
    }
    #jct-ai-header {
      background: ${NAVY};
      color: ${WHITE};
      padding: 12px 16px;
      display: flex;
      align-items: center;
      justify-content: space-between;
      flex-shrink: 0;
    }
    #jct-ai-header-title {
      font-size: 15px;
      font-weight: 600;
      letter-spacing: 0.01em;
    }
    #jct-ai-close {
      background: none;
      border: none;
      color: ${POWDER};
      cursor: pointer;
      font-size: 20px;
      line-height: 1;
      padding: 2px 4px;
      border-radius: 4px;
      transition: color 0.1s;
    }
    #jct-ai-close:hover { color: ${WHITE}; }
    #jct-ai-messages {
      flex: 1;
      overflow-y: auto;
      padding: 14px 14px 6px;
      display: flex;
      flex-direction: column;
      gap: 8px;
      scroll-behavior: smooth;
    }
    #jct-ai-messages::-webkit-scrollbar { width: 4px; }
    #jct-ai-messages::-webkit-scrollbar-track { background: transparent; }
    #jct-ai-messages::-webkit-scrollbar-thumb { background: #dde4f0; border-radius: 2px; }
    .jct-msg {
      max-width: 82%;
      padding: 8px 11px;
      border-radius: 10px;
      font-size: 13.5px;
      line-height: 1.45;
      word-wrap: break-word;
    }
    .jct-msg.user {
      align-self: flex-end;
      background: ${NAVY};
      color: ${WHITE};
      border-bottom-right-radius: 3px;
    }
    .jct-msg.assistant {
      align-self: flex-start;
      background: #f0f3fb;
      color: #1a2340;
      border-bottom-left-radius: 3px;
    }
    .jct-msg.notice {
      align-self: center;
      background: #e8fce8;
      color: #1e6b1e;
      font-size: 12px;
      padding: 5px 10px;
      border-radius: 20px;
      max-width: 100%;
    }
    .jct-typing {
      align-self: flex-start;
      display: flex;
      align-items: center;
      gap: 4px;
      padding: 8px 12px;
      background: #f0f3fb;
      border-radius: 10px;
      border-bottom-left-radius: 3px;
    }
    .jct-typing span {
      width: 7px;
      height: 7px;
      background: #8a9ec5;
      border-radius: 50%;
      display: inline-block;
      animation: jct-bounce 1.1s infinite;
    }
    .jct-typing span:nth-child(2) { animation-delay: 0.18s; }
    .jct-typing span:nth-child(3) { animation-delay: 0.36s; }
    @keyframes jct-bounce {
      0%, 80%, 100% { transform: translateY(0); }
      40% { transform: translateY(-5px); }
    }
    #jct-ai-input-row {
      display: flex;
      align-items: center;
      gap: 6px;
      padding: 10px 12px;
      border-top: 1px solid #e8ecf5;
      flex-shrink: 0;
      background: ${WHITE};
    }
    #jct-ai-input {
      flex: 1;
      border: 1.5px solid #d0d8ee;
      border-radius: 8px;
      padding: 7px 10px;
      font-size: 13.5px;
      font-family: ${FONT};
      outline: none;
      color: #1a2340;
      transition: border-color 0.15s;
      resize: none;
    }
    #jct-ai-input:focus { border-color: ${NAVY}; }
    #jct-ai-mic, #jct-ai-send {
      width: 34px;
      height: 34px;
      border-radius: 8px;
      border: none;
      cursor: pointer;
      display: flex;
      align-items: center;
      justify-content: center;
      flex-shrink: 0;
      transition: background 0.15s, transform 0.1s;
    }
    #jct-ai-mic {
      background: #f0f3fb;
      position: relative;
    }
    #jct-ai-mic:hover { background: #dde4f5; }
    #jct-ai-mic.recording { background: #ffe0e0; }
    #jct-ai-mic .mic-dot {
      position: absolute;
      top: 5px;
      right: 5px;
      width: 7px;
      height: 7px;
      border-radius: 50%;
      background: #e53935;
      display: none;
    }
    #jct-ai-mic.recording .mic-dot {
      display: block;
      animation: jct-pulse 1s infinite;
    }
    @keyframes jct-pulse {
      0%, 100% { opacity: 1; transform: scale(1); }
      50% { opacity: 0.5; transform: scale(1.3); }
    }
    #jct-ai-send {
      background: ${NAVY};
      color: ${WHITE};
    }
    #jct-ai-send:hover { background: #1a3060; transform: scale(1.05); }
    #jct-ai-send:disabled { background: #a0aec0; cursor: not-allowed; transform: none; }
  `;

  // ─── DOM Construction ─────────────────────────────────────────────────────
  function buildWidget() {
    // Inject styles
    const style = document.createElement('style');
    style.textContent = css;
    document.head.appendChild(style);

    // Floating button
    const btn = document.createElement('button');
    btn.id = 'jct-ai-btn';
    btn.setAttribute('aria-label', 'Open JCT Assistant');
    btn.innerHTML = `
      <svg width="26" height="26" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
        <path d="M12 2L13.5 8.5L20 10L13.5 11.5L12 18L10.5 11.5L4 10L10.5 8.5L12 2Z" fill="${POWDER}"/>
        <path d="M19 16L19.8 19L23 20L19.8 21L19 24L18.2 21L15 20L18.2 19L19 16Z" fill="${POWDER}" opacity="0.7"/>
        <path d="M5 3L5.6 5.5L8 6L5.6 6.5L5 9L4.4 6.5L2 6L4.4 5.5L5 3Z" fill="${POWDER}" opacity="0.6"/>
      </svg>`;
    document.body.appendChild(btn);

    // Chat panel
    const panel = document.createElement('div');
    panel.id = 'jct-ai-panel';
    panel.setAttribute('role', 'dialog');
    panel.setAttribute('aria-label', 'JCT Assistant');
    panel.innerHTML = `
      <div id="jct-ai-header">
        <span id="jct-ai-header-title">JCT Assistant</span>
        <button id="jct-ai-close" aria-label="Close assistant">&times;</button>
      </div>
      <div id="jct-ai-messages"></div>
      <div id="jct-ai-input-row">
        <input id="jct-ai-input" type="text" placeholder="Ask anything…" autocomplete="off" />
        <button id="jct-ai-mic" aria-label="Voice input" title="Voice input">
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="#4a5a80" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
            <rect x="9" y="2" width="6" height="12" rx="3"/>
            <path d="M5 10a7 7 0 0 0 14 0"/>
            <line x1="12" y1="19" x2="12" y2="22"/>
            <line x1="8" y1="22" x2="16" y2="22"/>
          </svg>
          <span class="mic-dot"></span>
        </button>
        <button id="jct-ai-send" aria-label="Send message">
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round">
            <line x1="22" y1="2" x2="11" y2="13"/>
            <polygon points="22 2 15 22 11 13 2 9 22 2"/>
          </svg>
        </button>
      </div>`;
    document.body.appendChild(panel);

    return { btn, panel };
  }

  // ─── Message rendering ────────────────────────────────────────────────────
  function appendMessage(role, text) {
    const container = document.getElementById('jct-ai-messages');
    if (!container) return;
    const div = document.createElement('div');
    div.className = `jct-msg ${role}`;
    div.textContent = text;
    container.appendChild(div);
    container.scrollTop = container.scrollHeight;
  }

  function appendNotice(text) {
    const container = document.getElementById('jct-ai-messages');
    if (!container) return;
    const div = document.createElement('div');
    div.className = 'jct-msg notice';
    div.textContent = text;
    container.appendChild(div);
    container.scrollTop = container.scrollHeight;
    // Auto-remove after 4s
    setTimeout(() => { if (div.parentNode) div.parentNode.removeChild(div); }, 4000);
  }

  function showTyping() {
    const container = document.getElementById('jct-ai-messages');
    if (!container) return null;
    const div = document.createElement('div');
    div.className = 'jct-typing';
    div.innerHTML = '<span></span><span></span><span></span>';
    div.id = 'jct-typing-indicator';
    container.appendChild(div);
    container.scrollTop = container.scrollHeight;
    return div;
  }

  function removeTyping() {
    const el = document.getElementById('jct-typing-indicator');
    if (el && el.parentNode) el.parentNode.removeChild(el);
  }

  // ─── Send message ─────────────────────────────────────────────────────────
  async function sendMessage(text) {
    if (_isWaiting || !text.trim()) return;
    _isWaiting = true;

    const input = document.getElementById('jct-ai-input');
    const sendBtn = document.getElementById('jct-ai-send');
    if (input) input.value = '';
    if (sendBtn) sendBtn.disabled = true;

    appendMessage('user', text);
    const typingEl = showTyping();

    try {
      const response = await fetch('/api/ai/chat', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          message: text,
          shift: _shift,
          date: _date,
          history: _history
        })
      });

      removeTyping();

      if (!response.ok) {
        const err = await response.json().catch(() => ({}));
        appendMessage('assistant', err.reply || 'Something went wrong. Please try again.');
      } else {
        const data = await response.json();
        const replyText = data.reply || '';
        appendMessage('assistant', replyText);

        // Update history (keep last 10)
        _history.push({ role: 'user', content: text });
        _history.push({ role: 'assistant', content: replyText });
        if (_history.length > 20) _history = _history.slice(-20); // 10 pairs

        // Surface actions notice and trigger page reload
        if (data.actions_executed > 0) {
          const label = data.actions_executed === 1 ? '1 action applied' : `${data.actions_executed} actions applied`;
          appendNotice(`✓ ${label}`);
          // Trigger checklist reload if the page exposes a load function
          if (typeof window.load === 'function') {
            setTimeout(() => window.load(), 300);
          }
        }
      }
    } catch (err) {
      removeTyping();
      appendMessage('assistant', "Sorry, I'm having trouble connecting right now.");
    }

    _isWaiting = false;
    if (sendBtn) sendBtn.disabled = false;
    if (input) input.focus();
  }

  // ─── Speech recognition ───────────────────────────────────────────────────
  function setupMic(micBtn) {
    const SR = window.SpeechRecognition || window.webkitSpeechRecognition;
    if (!SR) {
      micBtn.style.display = 'none';
      return;
    }

    let recognizer = null;
    let isRecording = false;

    micBtn.addEventListener('click', () => {
      if (isRecording) {
        if (recognizer) recognizer.stop();
        return;
      }

      recognizer = new SR();
      recognizer.lang = 'en-CA';
      recognizer.interimResults = false;
      recognizer.maxAlternatives = 1;

      recognizer.onstart = () => {
        isRecording = true;
        micBtn.classList.add('recording');
      };

      recognizer.onresult = (event) => {
        const transcript = event.results[0][0].transcript;
        const input = document.getElementById('jct-ai-input');
        if (input) {
          input.value = transcript;
          input.focus();
        }
      };

      recognizer.onerror = () => {
        isRecording = false;
        micBtn.classList.remove('recording');
      };

      recognizer.onend = () => {
        isRecording = false;
        micBtn.classList.remove('recording');
      };

      recognizer.start();
    });
  }

  // ─── Toggle panel ─────────────────────────────────────────────────────────
  function togglePanel() {
    _isOpen = !_isOpen;
    const panel = document.getElementById('jct-ai-panel');
    if (!panel) return;
    if (_isOpen) {
      panel.classList.add('open');
      const input = document.getElementById('jct-ai-input');
      if (input) setTimeout(() => input.focus(), 220);
    } else {
      panel.classList.remove('open');
    }
  }

  // ─── Init ─────────────────────────────────────────────────────────────────
  function init() {
    const { btn, panel } = buildWidget();

    btn.addEventListener('click', togglePanel);

    const closeBtn = document.getElementById('jct-ai-close');
    if (closeBtn) closeBtn.addEventListener('click', togglePanel);

    const input = document.getElementById('jct-ai-input');
    if (input) {
      input.addEventListener('keydown', (e) => {
        if (e.key === 'Enter' && !e.shiftKey) {
          e.preventDefault();
          sendMessage(input.value.trim());
        }
      });
    }

    const sendBtn = document.getElementById('jct-ai-send');
    if (sendBtn) {
      sendBtn.addEventListener('click', () => {
        const inp = document.getElementById('jct-ai-input');
        if (inp) sendMessage(inp.value.trim());
      });
    }

    const micBtn = document.getElementById('jct-ai-mic');
    if (micBtn) setupMic(micBtn);

    // Close panel when clicking outside
    document.addEventListener('click', (e) => {
      if (!_isOpen) return;
      const panel = document.getElementById('jct-ai-panel');
      const btn = document.getElementById('jct-ai-btn');
      if (panel && !panel.contains(e.target) && btn && !btn.contains(e.target)) {
        togglePanel();
      }
    });
  }

  // ─── Public API ───────────────────────────────────────────────────────────
  window.aiWidget = {
    setContext(shift, date) {
      _shift = shift || null;
      _date = date || new Date().toISOString().slice(0, 10);
    }
  };

  // Init on DOM ready
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }
})();
