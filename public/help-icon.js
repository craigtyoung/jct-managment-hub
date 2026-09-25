/**
 * help-icon.js — a yellow "?" help button any page can drop in. Fetches its
 * own /api/me (for a personalized greeting) and /api/help/:page (for the
 * content, editable in-app by management via routes/help.js) so pages don't
 * need to change how they already load their own data.
 *
 * Usage: <script src="/help-icon.js"></script><script>initHelpIcon('checkins');</script>
 */
(function () {
  function esc(s) { return String(s == null ? '' : s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;'); }
  function greeting() {
    const h = new Date().getHours();
    return h < 12 ? 'Good morning' : h < 17 ? 'Good afternoon' : 'Good evening';
  }

  // Fallback copy shown until a page's help text has been written into the DB
  // (Settings > Help, or the in-modal "Edit this help text" link for management).
  const DEFAULTS = {
    checkins: "Welcome to the Member Check-Ins area. Please have members check in on the keypad and continue to sign their names for now when they arrive. If they don't sign in, use the \"+ Check in\" button to sign them in yourself. Once members have checked in, please assign a court. Then in Court View, verify the entries match GameTime.",
  };

  function injectCss() {
    if (document.getElementById('help-icon-css')) return;
    const s = document.createElement('style');
    s.id = 'help-icon-css';
    s.textContent = `
      .help-fab{position:fixed;right:22px;bottom:22px;width:44px;height:44px;border-radius:50%;
        background:#f59e0b;color:#fff;border:none;font-size:19px;font-weight:800;cursor:pointer;
        box-shadow:0 4px 14px rgba(180,83,9,0.35);z-index:400;font-family:inherit;line-height:1;}
      .help-fab:hover{background:#d97706;}
      .help-overlay{position:fixed;inset:0;background:rgba(12,23,56,0.45);z-index:500;
        display:none;align-items:center;justify-content:center;padding:16px;}
      .help-overlay.open{display:flex;}
      .help-box{background:#fff;border-radius:16px;padding:22px 24px;width:100%;max-width:420px;
        box-shadow:0 20px 60px rgba(0,0,0,0.22);font-family:inherit;}
      .help-title{font-size:16px;font-weight:800;color:#0c1738;margin-bottom:10px;}
      .help-body{font-size:13.5px;line-height:1.55;color:#334155;white-space:pre-wrap;}
      .help-editwrap{margin-top:14px;display:none;}
      .help-editwrap textarea{width:100%;min-height:120px;font-family:inherit;font-size:13px;
        padding:9px 10px;border:1px solid #d4dae6;border-radius:9px;color:#0c1738;}
      .help-actions{display:flex;justify-content:flex-end;gap:8px;margin-top:14px;}
      .help-btn{padding:7px 14px;border-radius:9px;border:1px solid #d4dae6;background:#fff;
        font-family:inherit;font-size:12.5px;font-weight:700;cursor:pointer;color:#4a6080;}
      .help-btn.pri{background:#0c1738;border-color:#0c1738;color:#fff;display:none;}
      .help-editlink{font-size:11.5px;font-weight:700;color:#2c5c9c;background:none;border:none;
        cursor:pointer;padding:0;margin-top:12px;}
    `;
    document.head.appendChild(s);
  }

  window.initHelpIcon = async function (page) {
    injectCss();
    let me = null, help = null;
    try { const r = await fetch('/api/me'); if (r.ok) me = await r.json(); } catch (e) {}
    try { const r = await fetch('/api/help/' + page); if (r.ok) help = await r.json(); } catch (e) {}
    let content = (help && help.content) || DEFAULTS[page] || 'No help written for this page yet.';
    const isMgmt = !!(me && me.is_management);

    const fab = document.createElement('button');
    fab.className = 'help-fab'; fab.textContent = '?'; fab.title = 'Help';
    document.body.appendChild(fab);

    const overlay = document.createElement('div');
    overlay.className = 'help-overlay';
    overlay.innerHTML =
      '<div class="help-box">' +
        '<div class="help-title"></div>' +
        '<div class="help-body"></div>' +
        (isMgmt ? '<button class="help-editlink">Edit this help text</button>' +
          '<div class="help-editwrap"><textarea></textarea></div>' : '') +
        '<div class="help-actions">' +
          '<button class="help-btn help-close">Close</button>' +
          (isMgmt ? '<button class="help-btn pri help-save">Save</button>' : '') +
        '</div>' +
      '</div>';
    document.body.appendChild(overlay);

    const titleEl = overlay.querySelector('.help-title');
    const bodyEl = overlay.querySelector('.help-body');

    function paint() {
      const name = (me && me.name) ? me.name.split(' ')[0] : '';
      titleEl.textContent = name ? (greeting() + ', ' + name) : greeting();
      bodyEl.textContent = content;
    }
    paint();

    function open() { overlay.classList.add('open'); }
    function close() { overlay.classList.remove('open'); }
    fab.addEventListener('click', open);
    overlay.addEventListener('click', function (e) { if (e.target === overlay) close(); });
    overlay.querySelector('.help-close').addEventListener('click', close);
    document.addEventListener('keydown', function (e) { if (e.key === 'Escape') close(); });

    if (isMgmt) {
      const editLink = overlay.querySelector('.help-editlink');
      const editWrap = overlay.querySelector('.help-editwrap');
      const textarea = overlay.querySelector('textarea');
      const saveBtn = overlay.querySelector('.help-save');
      editLink.addEventListener('click', function () {
        textarea.value = content;
        editWrap.style.display = '';
        saveBtn.style.display = '';
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
