const { db, $, $$, collection, getDocs } = window.MTW;

(() => {
  const body = $('.activity-table-body');
  const tx = $('.logs-text');
  const ref = $('.activity-refresh-button');
  const ico = $('.refresh-icon');
  const tool = $('.activity-filter-tool');
  const user = $('.activity-filter-user');
  const act = $('.activity-filter-action');

  let all = [];
  let filtered = [];
  let st = 'all';
  let su = '';
  let sa = 'all';
  let page = 1;
  let total = 1;

  const per = 100;

  const pag = document.createElement('div');

  pag.className = 'activity-pagination';

  pag.innerHTML = `
    <div class="activity-page-button activity-prev-button">Previous</div>
    <div class="activity-page-text">Page 1 / 1</div>
    <div class="activity-page-button activity-next-button">Next</div>
  `;

  if (body?.parentElement) {
    body.parentElement.appendChild(pag);
  }

  const prev = $('.activity-prev-button');
  const next = $('.activity-next-button');
  const pt = $('.activity-page-text');

  document.addEventListener('db-tool-open', async e => {
    if (e.detail.id !== 'activity-logs') return;

    await new Promise(r => setTimeout(r, 2000));
    await load();
  });

  ref?.addEventListener('click', async () => {
    try {
      ico?.classList.add('spinning');
      await load();
    } finally {
      ico?.classList.remove('spinning');
    }
  });

  async function load() {
    if (!db || !body) return;

    body.innerHTML = '';

    try {
      const [searchSnap, loginSnap] = await Promise.all([
        getDocs(collection(db, 'search-logs')),
        getDocs(collection(db, 'login-logs'))
      ]);

      all = [
        ...searchSnap.docs,
        ...loginSnap.docs
      ].map(d => {
        const x = d.data();

        return {
          action: x.action || '-',
          email: x.email || '-',
          name: x.name || '-',
          query: x.query || '-',
          results: x.results || '-',
          tool: x.tool || x.tools || '-',
          time: x.time || null
        };
      });

      all.sort((a, b) => {
        const aTime = a.time?.toMillis
          ? a.time.toMillis()
          : new Date(a.time || 0).getTime();

        const bTime = b.time?.toMillis
          ? b.time.toMillis()
          : new Date(b.time || 0).getTime();

        return bTime - aTime;
      });

      filtered = [...all];
      page = 1;

      total = Math.max(1, Math.ceil(filtered.length / per));

      render();

    } catch (e) {
      console.error('Failed to load activity logs:', e);
    }
  }

  function filter() {
    filtered = [...all];

    if (st !== 'all') {
      filtered = filtered.filter(x =>
        String(x.tool)
          .toLowerCase()
          .includes(st.toLowerCase())
      );
    }

    if (su.trim()) {
      filtered = filtered.filter(x =>
        String(x.name)
          .toLowerCase()
          .includes(su.toLowerCase())
      );
    }

    if (sa !== 'all') {
      filtered = filtered.filter(x =>
        String(x.action)
          .toLowerCase()
          .includes(sa.toLowerCase())
      );
    }

    total = Math.max(
      1,
      Math.ceil(filtered.length / per)
    );

    if (page > total) {
      page = total;
    }

    render();
  }

  function render() {
    if (!body) return;

    body.innerHTML = '';

    const items = filtered.slice(
      (page - 1) * per,
      page * per
    );

    if (tx) {
      tx.textContent = `Showing ${items.length} of ${filtered.length}`;
    }

    items.forEach(x => {
      const r = document.createElement('div');

      r.className = 'activity-row';

      let time = '-';

      if (x.time?.toDate) {
        time = x.time.toDate().toLocaleString();
      } else if (x.time) {
        time = new Date(x.time).toLocaleString();
      }

      r.innerHTML = `
        <div class="row-text">${time}</div>
        <div class="row-text">${x.name}</div>
        <div class="row-text">${x.email}</div>
        <div class="row-text">${x.tool}</div>
        <div class="row-text">${x.query}</div>
        <div class="row-text">${x.results}</div>
        <div class="activity-action-box">${x.action}</div>
      `;

      body.appendChild(r);
    });

    if (pt) {
      pt.textContent = `Page ${page} / ${total}`;
    }
  }

  prev?.addEventListener('click', () => {
    if (page > 1) {
      page--;
      render();
    }
  });

  next?.addEventListener('click', () => {
    if (page < total) {
      page++;
      render();
    }
  });

  tool?.addEventListener('change', e => {
    st = e.target.value || 'all';
    page = 1;
    filter();
  });

  user?.addEventListener('input', e => {
    su = e.target.value;
    page = 1;
    filter();
  });

  act?.addEventListener('change', e => {
    sa = e.target.value || 'all';
    page = 1;
    filter();
  });

})();
