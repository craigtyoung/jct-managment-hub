/**
 * help-icon.js — a subtle "?" icon that opens a right-side "Guidance" slide-out
 * panel, matching the pattern from VoiceCraft/SessionCraft's Studio guidance
 * panel. Stays open while you work rather than blocking the page like a modal.
 *
 * Fetches its own /api/me (for a personalized greeting + management check) and
 * /api/help/:page (content, editable in-app by management via routes/help.js)
 * so pages don't need to change how they already load their own data.
 *
 * Usage: <script src="/help-icon.js"></script>
 *        <script>initHelpIcon('checkins', { anchor: '.page-head h1' });</script>
 * `anchor` — a selector for the element the "?" icon should sit next to (inline).
 * If omitted, the icon falls back to a small fixed circle near the top-right.
 *
 * Content format (plain text, written by management in the panel's editor):
 *   ## Section Header      → bold section heading with a left accent bar
 *   - bullet text          → bullet list item
 *   Note: some text        → highlighted callout box
 *   anything else          → a plain paragraph
 */
(function () {
  function esc(s) { return String(s == null ? '' : s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;'); }
  function greeting() {
    const h = new Date().getHours();
    return h < 12 ? 'Good morning' : h < 17 ? 'Good afternoon' : 'Good evening';
  }

  const DEFAULTS = {
    checkins:
      '## Checking Members In\n' +
      "Please have members check in on the keypad and continue to sign their names for now when they arrive.\n" +
      "- If they don't sign in, use the \"+ Check in\" button to sign them in yourself.\n" +
      '- Once checked in, please assign a court.\n\n' +
      '## Verifying Courts\n' +
      '- In Court View, verify the entries match GameTime.\n\n' +
      "Note: This page reflects who's signed in — GameTime stays the source of truth for actual bookings and billing.",
  };

  function renderContent(text) {
    const lines = String(text || '').split(/\r?\n/);
    let html = '', inList = false, first = true;
    function closeList() { if (inList) { html += '</div>'; inList = false; } }
    lines.forEach(function (line) {
      const t = line.trim();
      if (!t) { closeList(); return; }
      if (t.indexOf('## ') === 0) {
        closeList();
        html += '<div class="help-sec' + (first ? ' first' : '') + '">' + esc(t.slice(3)) + '</div>';
        first = false;
      } else if (t.indexOf('- ') === 0) {
        if (!inList) { html += '<div class="help-list">'; inList = true; }
        html += '<div class="help-li">' + esc(t.slice(2)) + '</div>';
      } else if (/^Note:/i.test(t)) {
        closeList();
        html += '<div class="help-note"><b>Note:</b> ' + esc(t.replace(/^Note:\s*/i, '')) + '</div>';
      } else {
        closeList();
        html += '<p class="help-p">' + esc(t) + '</p>';
      }
    });
    closeList();
    return html || '<p class="help-p">No help written for this page yet.</p>';
  }

  function injectCss() {
    if (document.getElementById('help-icon-css')) return;
    const s = document.createElement('style');
    s.id = 'help-icon-css';
    s.textContent =
      '.help-q{display:inline-flex;align-items:center;justify-content:center;width:26px;height:26px;' +
        'border-radius:7px;border:none;background:transparent;color:#94a3b8;cursor:pointer;' +
        'vertical-align:middle;margin-left:10px;padding:0;flex-shrink:0;}' +
      '.help-q svg{width:17px;height:17px;}' +
      '.help-q:hover{color:#2c5c9c;background:rgba(44,92,156,0.08);}' +
      '.help-q.help-q-fixed{position:fixed;top:70px;right:22px;z-index:400;margin-left:0;' +
        'background:#fff;border:1px solid #e5e9f0;box-shadow:0 2px 8px rgba(12,23,56,0.08);}' +
      '.help-panel{position:fixed;top:0;right:0;height:100vh;width:400px;max-width:92vw;background:#fff;' +
        'box-shadow:-10px 0 34px rgba(12,23,56,0.14);border-left:1px solid #e5e9f0;z-index:450;' +
        'display:flex;flex-direction:column;transform:translateX(100%);transition:transform .22s ease;}' +
      '.help-panel.open{transform:translateX(0);}' +
      '.help-panel-head{display:flex;align-items:center;justify-content:space-between;gap:10px;' +
        'padding:16px 18px;border-bottom:1px solid #eef1f6;flex-shrink:0;}' +
      '.help-panel-title{display:flex;align-items:center;gap:8px;font-size:15px;font-weight:800;color:#0c1738;font-family:inherit;}' +
      '.help-panel-close{border:none;background:none;font-size:17px;color:#94a3b8;cursor:pointer;line-height:1;padding:2px 4px;}' +
      '.help-panel-close:hover{color:#0c1738;}' +
      '.help-panel-greet{font-size:12px;color:#8fa0b8;font-style:italic;padding:14px 20px 0;flex-shrink:0;}' +
      '.help-panel-body{flex:1;overflow-y:auto;padding:12px 20px 20px;font-family:inherit;font-size:13.5px;line-height:1.6;color:#334155;}' +
      '.help-sec{font-size:13.5px;font-weight:800;color:#0c1738;margin:18px 0 8px;padding-left:10px;border-left:3px solid #2c5c9c;}' +
      '.help-sec.first{margin-top:2px;}' +
      '.help-p{margin:6px 0;}' +
      '.help-list{margin:4px 0 10px;}' +
      '.help-li{position:relative;padding-left:14px;margin:5px 0;font-size:13px;}' +
      '.help-li:before{content:"•";position:absolute;left:0;color:#2c5c9c;}' +
      '.help-note{margin-top:14px;padding:10px 12px;background:#f8fafc;border:1px solid #e5e9f0;border-radius:8px;font-size:12.5px;color:#4a6080;}' +
      '.help-editlink{font-size:11.5px;font-weight:700;color:#2c5c9c;background:none;border:none;cursor:pointer;padding:0;margin-top:16px;font-family:inherit;}' +
      '.help-editwrap{margin-top:10px;display:none;}' +
      '.help-editwrap textarea{width:100%;min-height:220px;font-family:ui-monospace,Consolas,monospace;font-size:12px;' +
        'padding:9px 10px;border:1px solid #d4dae6;border-radius:9px;color:#0c1738;}' +
      '.help-edithint{font-size:10.5px;color:#94a3b8;margin-top:4px;}' +
      '.help-panel-foot{display:flex;justify-content:flex-end;gap:8px;padding:12px 20px;border-top:1px solid #eef1f6;flex-shrink:0;}' +
      '.help-btn{padding:7px 14px;border-radius:9px;border:1px solid #d4dae6;background:#fff;font-family:inherit;' +
        'font-size:12.5px;font-weight:700;cursor:pointer;color:#4a6080;}' +
      '.help-btn.pri{background:#0c1738;border-color:#0c1738;color:#fff;display:none;}';
    document.head.appendChild(s);
  }

  window.initHelpIcon = async function (page, opts) {
    opts = opts || {};
    injectCss();
    let me = null, help = null;
    try { const r = await fetch('/api/me'); if (r.ok) me = await r.json(); } catch (e) {}
    try { const r = await fetch('/api/help/' + page); if (r.ok) help = await r.json(); } catch (e) {}
    let content = (help && help.content) || DEFAULTS[page] || '';
    const isMgmt = !!(me && me.is_management);

    // Matches the sidenav's icon language (fill="none", stroke="currentColor",
    // stroke-width 1.8) rather than a standalone badge, so it reads as part of
    // the hub's existing icon system instead of a bolted-on widget.
    const HELP_SVG = '<svg fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="1.8">' +
      '<circle cx="12" cy="12" r="10"/><path d="M9.09 9a3 3 0 0 1 5.83 1c0 2-3 3-3 3"/><line x1="12" y1="17" x2="12.01" y2="17"/></svg>';
    const trigger = document.createElement('button');
    trigger.className = 'help-q'; trigger.type = 'button'; trigger.innerHTML = HELP_SVG; trigger.title = 'Help';
    const anchor = opts.anchor ? document.querySelector(opts.anchor) : null;
    if (anchor) anchor.insertAdjacentElement('afterend', trigger);
    else { trigger.classList.add('help-q-fixed'); document.body.appendChild(trigger); }

    const panel = document.createElement('div');
    panel.className = 'help-panel';
    panel.innerHTML =
      '<div class="help-panel-head">' +
        '<div class="help-panel-title">💡 Guidance</div>' +
        '<button class="help-panel-close" type="button">✕</button>' +
      '</div>' +
      '<div class="help-panel-greet"></div>' +
      '<div class="help-panel-body">' +
        '<div class="help-content"></div>' +
        (isMgmt ? '<button class="help-editlink" type="button">Edit this help text</button>' +
          '<div class="help-editwrap"><textarea></textarea>' +
          '<div class="help-edithint">Use "## " for a section header, "- " for a bullet, and "Note:" to start a callout.</div></div>' : '') +
      '</div>' +
      (isMgmt ? '<div class="help-panel-foot"><button class="help-btn pri">Save</button></div>' : '');
    document.body.appendChild(panel);

    const greetEl = panel.querySelector('.help-panel-greet');
    const contentEl = panel.querySelector('.help-content');
    function paint() {
      const name = (me && me.name) ? me.name.split(' ')[0] : '';
      greetEl.textContent = (name ? greeting() + ', ' + name + ' — ' : greeting() + ' — ') + "this stays here while you work. Open or close it anytime.";
      contentEl.innerHTML = renderContent(content);
    }
    paint();

    function open() { panel.classList.add('open'); }
    function close() { panel.classList.remove('open'); }
    trigger.addEventListener('click', function () { panel.classList.contains('open') ? close() : open(); });
    panel.querySelector('.help-panel-close').addEventListener('click', close);
    document.addEventListener('keydown', function (e) { if (e.key === 'Escape') close(); });

    if (isMgmt) {
      const editLink = panel.querySelector('.help-editlink');
      const editWrap = panel.querySelector('.help-editwrap');
      const textarea = panel.querySelector('textarea');
      const saveBtn = panel.querySelector('.help-btn.pri');
      editLink.addEventListener('click', function () {
        textarea.value = content;
        editWrap.style.display = 'block';
        saveBtn.style.display = 'inline-block';
        editLink.style.display = 'none';
      });
      saveBtn.addEventListener('click', async function () {
        const val = textarea.value.trim();
        if (!val) return;
        const r = await fetch('/api/help/' + page, { method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ content: val }) });
        if (r.ok) {
          content = val; paint();
          editWrap.style.display = 'none'; saveBtn.style.display = 'none'; editLink.style.display = '';
        }
      });
    }
  };
})();
