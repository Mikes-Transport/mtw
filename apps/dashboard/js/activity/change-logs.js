const {
  db,
  $,
  $$,
  collection,
  getDocs,
  doc,
  getDoc,
  onSnapshot,
  addDoc,
  updateDoc,
  deleteDoc
} = window.MTW;

(function () {

  function toMillis(v) {
    if (v == null) return 0;
    if (typeof v === 'number') return v;
    if (typeof v.toDate === 'function') {
      try { return v.toDate().getTime(); } catch (e) { return 0; }
    }
    if (typeof v.seconds === 'number') return v.seconds * 1000;
    const t = new Date(v).getTime();
    return Number.isNaN(t) ? 0 : t;
  }

  function formatDate(v) {
    const ms = toMillis(v);
    if (!ms) return '';
    return new Date(ms).toLocaleString('en-NZ', {
      day: '2-digit',
      month: 'short',
      year: 'numeric',
      hour: 'numeric',
      minute: '2-digit'
    });
  }

  function normalize(entry) {
    if (!entry || typeof entry !== 'object') return null;
    return {
      title: entry.taskTitle || entry.title || entry.task || entry.name || 'Untitled',
      message: entry.message || entry.msg || entry.description || '',
      date: entry.date != null ? entry.date : (entry.createdAt != null ? entry.createdAt : (entry.timestamp != null ? entry.timestamp : 0))
    };
  }

  function collectCommits(data) {
    const out = [];
    if (Array.isArray(data.commits)) {
      data.commits.forEach(function(c) {
        const n = normalize(c);
        if (n) out.push(n);
      });
    }
    const projects = data.projects;
    if (Array.isArray(projects) && projects[5] != null) {
      const p5 = projects[5];
      if (Array.isArray(p5.commits)) {
        p5.commits.forEach(function(c) {
          const n = normalize(c);
          if (n) out.push(n);
        });
      } else if (Array.isArray(p5)) {
        p5.forEach(function(c) {
          const n = normalize(c);
          if (n) out.push(n);
        });
      } else {
        const n = normalize(p5);
        if (n && (n.title !== 'Untitled' || n.message)) out.push(n);
      }
    }
    out.sort(function(a, b) { return toMillis(b.date) - toMillis(a.date); });
    return out;
  }

  function esc(v) {
    return String(v == null ? '' : v)
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;');
  }

  function injectStyles() {
    if (document.getElementById('change-log-styles')) return;
    const style = document.createElement('style');
    style.id = 'change-log-styles';
    style.textContent = [
      '.change-logs{max-width:760px;margin-left:auto;margin-right:auto}',
      '.change-log-head{font-size:30px;font-weight:900;margin:0 0 4px;text-transform:uppercase;text-align:center}',
      '.change-log-sub{font-size:12px;opacity:.6;margin:0 0 16px;text-align:center}',
      '.change-log-scroll{max-height:700px;overflow-y:auto;overscroll-behavior:contain;-webkit-overflow-scrolling:touch;scrollbar-width:none;-ms-overflow-style:none;display:flex;flex-direction:column;gap:14px;padding:2px}',
      '.change-log-scroll::-webkit-scrollbar{display:none;width:0;height:0; background-color: transparent;}',
      '.change-log-card{background:#e9e9e9;color:#f5f6f8;border:1px solid rgba(255,255,255,.08);border-left:5px solid #202327;border-radius:14px;padding:16px 18px;}',
      '.change-log-card-top{display:flex;align-items:baseline;justify-content:space-between;gap:10px;margin-bottom:6px}',
      '.change-log-title{font-size:15px;font-weight:500;letter-spacing:.02em; color: #000000;}',
      '.change-log-date{font-size:11px;color:#4d4d4d;white-space:nowrap}',
      '.change-log-message{font-size:13px;line-height:1.55;color:#4d4d4d;white-space:pre-line}',
      '.change-log-empty{padding:24px 12px;text-align:center;font-size:13px;opacity:.6}'
    ].join('\n');
    document.head.appendChild(style);
  }

  function render(entries) {
    const box = $('.change-logs');
    if (!box) return;
    box.innerHTML = '';
    const head = document.createElement('h2');
    head.className = 'change-log-head';
    head.textContent = 'CHANGE LOGS';
    const sub = document.createElement('p');
    sub.className = 'change-log-sub';
    sub.textContent = entries.length
      ? entries.length + (entries.length === 1 ? ' update' : ' updates') + ', newest first'
      : '';
    const list = document.createElement('div');
    list.className = 'change-log-scroll';
    if (!entries.length) {
      list.innerHTML = '<div class="change-log-empty">No change logs yet.</div>';
    } else {
      entries.forEach(function(e) {
        const card = document.createElement('div');
        card.className = 'change-log-card';
        const top = document.createElement('div');
        top.className = 'change-log-card-top';
        const title = document.createElement('div');
        title.className = 'change-log-title';
        title.textContent = e.title;
        const date = document.createElement('div');
        date.className = 'change-log-date';
        date.textContent = formatDate(e.date);
        top.appendChild(title);
        top.appendChild(date);
        const msg = document.createElement('div');
        msg.className = 'change-log-message';
        msg.textContent = e.message;
        card.appendChild(top);
        card.appendChild(msg);
        list.appendChild(card);
      });
    }
    box.appendChild(head);
    box.appendChild(sub);
    box.appendChild(list);
  }

  let unsub = null;
  let pollTimer = null;

  function paintFromSnap(snap) {
    if (!snap || !snap.exists()) {
      render([]);
      return;
    }
    render(collectCommits(snap.data() || {}));
  }

  async function fetchOnce() {
    if (!db) return;
    try {
      paintFromSnap(await getDoc(doc(db, 'workstation', 'main')));
    } catch (err) {
      console.error('[change-logs] load failed:', err);
      const box = $('.change-logs');
      if (box && !box.querySelector('.change-log-card')) {
        box.innerHTML = '<div class="change-log-empty">Could not load change logs.</div>';
      }
    }
  }

  function startPolling() {
    if (pollTimer) return;
    pollTimer = setInterval(function() {
      if (!document.hidden) fetchOnce();
    }, 15000);
    document.addEventListener('visibilitychange', function() {
      if (!document.hidden) fetchOnce();
    });
    window.addEventListener('focus', fetchOnce);
  }

  function subscribe() {
    if (unsub) {
      try { unsub(); } catch (e) {}
      unsub = null;
    }
    let live = false;
    if (db && typeof onSnapshot === 'function') {
      try {
        unsub = onSnapshot(
          doc(db, 'workstation', 'main'),
          function(snap) { paintFromSnap(snap); },
          function(err) {
            console.error('[change-logs] live failed, polling instead:', err);
            startPolling();
            fetchOnce();
          }
        );
        live = true;
      } catch (err) {
        console.error('[change-logs] live failed, polling instead:', err);
      }
    }
    if (!live) {
      startPolling();
      fetchOnce();
    }
  }

  function syncVisibility() {
    const tool = $('.db-tool-wrapper');
    const box = $('.change-logs');
    if (!box) return;
    const open = tool && getComputedStyle(tool).display === 'block';
    box.style.display = open ? 'none' : '';
  }

  function watchTool() {
    const tool = $('.db-tool-wrapper');
    if (tool && !tool.dataset.clWatch) {
      tool.dataset.clWatch = 'true';
      new MutationObserver(syncVisibility).observe(tool, {
        attributes: true,
        attributeFilter: ['style', 'class']
      });
    }
    document.addEventListener('db-tool-open', syncVisibility);
    document.addEventListener('db-tool-close', syncVisibility);
    syncVisibility();
  }

  function init() {
    if (!document.querySelector('.change-logs')) {
      setTimeout(init, 200);
      return;
    }
    injectStyles();
    watchTool();
    subscribe();
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init, { once: true });
  } else {
    init();
  }

})();
