console.log("U MOM LOADED ASS CHECKESADAD");


const { db, $, $$, collection, getDocs, doc, addDoc, updateDoc, deleteDoc } = window.MTW;

(() => {
  const q = $;

  const body = q('.second-hand-table-body');
  const search = q('.second-hand-search-filter');
  const loc = q('.second-hand-location-filter select');
  const addBtn = q('.second-hand-add-button');
  const ref = q('.second-hand-refresh-button');
  const ico = q('.refresh-icon-sh');
  const imp = q('.second-hand-import-button');
  const txt = q('.items-text');

  const modal = q('.second-hand-overlay');
  const form = q('.second-hand-edit-form');
  const save = q('.second-hand-save-button');
  const close = q('.second-hand-close-button');
  const closeIcon = q('.close-icon');

  const csv = document.createElement('input');

  csv.type = 'file';
  csv.accept = '.csv';
  csv.style.display = 'none';

  document.body.appendChild(csv);

  let all = [];
  let filtered = [];
  let term = '';
  let lf = 'all';
  let editing = null;

  const norm = x =>
    String(x || '')
      .replace(/\s+/g, ' ')
      .trim();

  document.addEventListener('db-tool-open', async e => {
    if (e.detail.id !== 'secondhand-tool') return;

    await load();
  });

  async function load() {
    if (!db || !body) return;

    body.innerHTML = '';

    try {
      const s = await getDocs(
        collection(db, 'secondhand-stock')
      );

      all = s.docs.map(d => {
        const x = d.data();

        return {
          id: d.id,
          code: norm(x.CODE),
          description: norm(x.DESCRIPTION),
          qty: norm(x.QTY),
          condition: norm(x.CONDITION_REASON_FOR_SALE),
          location: norm(x.LOCATION),
          price: `$${Math.round(Number(x.PRICE_EACH || 0))}`
        };
      });

      locations();
      filter();

    } catch (e) {
      console.error('Failed to load secondhand stock:', e);
    }
  }

  async function create(x) {
    await addDoc(
      collection(db, 'secondhand-stock'),
      {
        CODE: norm(x.code),
        DESCRIPTION: norm(x.description),
        QTY: x.qty || 0,
        CONDITION_REASON_FOR_SALE: norm(x.condition),
        LOCATION: norm(x.location),
        PRICE_EACH: x.price || 0
      }
    );

    await load();
  }

  async function update(id, x) {
    await updateDoc(
      doc(db, 'secondhand-stock', id),
      {
        CODE: norm(x.code),
        DESCRIPTION: norm(x.description),
        QTY: x.qty || 0,
        CONDITION_REASON_FOR_SALE: norm(x.condition),
        LOCATION: norm(x.location),
        PRICE_EACH: x.price || 0
      }
    );

    await load();
  }

  async function remove(id) {
    await deleteDoc(
      doc(db, 'secondhand-stock', id)
    );

    await load();
  }

  async function importCSV(file) {
    const rows = (await file.text())
      .split(/\r?\n/)
      .map(x => x.trim())
      .filter(Boolean);

    if (rows.length <= 1) {
      alert('CSV is empty.');
      return;
    }

    const headers = rows[0]
      .split(',')
      .map(x => norm(x).toUpperCase());

    const existing = new Set(
      all.map(x => norm(x.code).toUpperCase())
    );

    let count = 0;

    for (let i = 1; i < rows.length; i++) {
      const cols = rows[i]
        .split(',')
        .map(x =>
          x
            .replace(/^"|"$/g, '')
            .trim()
        );

      const row = {};

      headers.forEach((h, j) => {
        row[h] = cols[j] || '';
      });

      const code = norm(row.CODE);

      if (
        !code ||
        existing.has(code.toUpperCase())
      ) {
        continue;
      }

      await addDoc(
        collection(db, 'secondhand-stock'),
        {
          CODE: code,
          DESCRIPTION: norm(row.DESCRIPTION),
          QTY: norm(row.QTY),
          CONDITION_REASON_FOR_SALE: norm(
            row.CONDITION_REASON_FOR_SALE
          ),
          LOCATION: norm(row.LOCATION),
          PRICE_EACH: norm(row.PRICE_EACH)
        }
      );

      count++;
    }

    alert(
      `${count} new items imported successfully.`
    );

    await load();
  }

  function openModal() {
    if (modal) {
      modal.style.display = 'flex';
    }

    document.body.style.overflow = 'hidden';
  }

  function closeModal() {
    if (modal) {
      modal.style.display = 'none';
    }

    document.body.style.overflow = '';

    editing = null;
  }

  function filter() {
    filtered = [...all];

    if (term.trim()) {
      const s = term.toLowerCase();

      filtered = filtered.filter(x =>
        x.code.toLowerCase().includes(s) ||
        x.description.toLowerCase().includes(s) ||
        x.location.toLowerCase().includes(s)
      );
    }

    if (lf !== 'all') {
      filtered = filtered.filter(
        x => x.location === lf
      );
    }

    render();
  }

  function render() {
    if (!body) return;

    body.innerHTML = '';

    filtered.forEach(x => {
      const r = document.createElement('div');

      r.className = 'second-hand-row';

      r.innerHTML = `
        <div class="row-text">${x.code}</div>
        <div class="row-text">${x.description}</div>
        <div class="row-text">${x.qty}</div>
        <div class="row-text">${x.condition}</div>
        <div class="row-text">${x.location}</div>
        <div class="row-text">${x.price}</div>

        <div style="display:flex;gap:8px">
          <div
            class="activity-action-box edit-btn"
            data-id="${x.id}"
            style="cursor:pointer"
          >
            Edit
          </div>

          <div
            class="activity-action-box delete-btn"
            data-id="${x.id}"
            style="cursor:pointer;background:rgba(255,0,0,.12)"
          >
            Delete
          </div>
        </div>
      `;

      body.appendChild(r);
    });

    bind();

    if (txt) {
      txt.textContent = `${filtered.length} items`;
    }
  }

  function locations() {
    if (!loc) return;

    loc.innerHTML =
      '<option value="all">All Locations</option>';

    [
      ...new Set(
        all
          .map(x => x.location)
          .filter(Boolean)
      )
    ]
      .sort()
      .forEach(x => {
        const o = document.createElement('option');

        o.value = x;
        o.textContent = x;

        loc.appendChild(o);
      });
  }

  function bind() {
    body?.querySelectorAll('.delete-btn')
      .forEach(b => {
        b.onclick = async () => {
          if (!confirm('Delete this item?')) {
            return;
          }

          try {
            await remove(b.dataset.id);
          } catch (e) {
            console.error(
              'Delete failed:',
              e
            );
          }
        };
      });

    body?.querySelectorAll('.edit-btn')
      .forEach(b => {
        b.onclick = () => {
          const x = all.find(
            i => i.id === b.dataset.id
          );

          if (!x) return;

          editing = x.id;

          [
            'code',
            'description',
            'qty',
            'condition',
            'location',
            'price'
          ].forEach(k => {
            const e = q(`[name="${k}"]`);

            if (e) {
              e.value = x[k] || '';
            }
          });

          openModal();
        };
      });
  }

  save?.addEventListener('click', async e => {
    e.preventDefault();

    const x = {};

    [
      'code',
      'description',
      'qty',
      'condition',
      'location',
      'price'
    ].forEach(k => {
      x[k] =
        q(`[name="${k}"]`)?.value || '';
    });

    try {
      if (editing) {
        await update(editing, x);
      } else {
        await create(x);
      }

      closeModal();

    } catch (e) {
      console.error(e);
    }
  });

  close?.addEventListener(
    'click',
    closeModal
  );

  closeIcon?.addEventListener(
    'click',
    closeModal
  );

  search?.addEventListener(
    'input',
    e => {
      term = e.target.value;
      filter();
    }
  );

  loc?.addEventListener(
    'change',
    e => {
      lf = e.target.value;
      filter();
    }
  );

  ref?.addEventListener(
    'click',
    async () => {
      try {
        ico?.classList.add('spinning');
        await load();
      } finally {
        ico?.classList.remove('spinning');
      }
    }
  );

  addBtn?.addEventListener(
    'click',
    () => {
      editing = null;
      form?.reset();
      openModal();
    }
  );

  imp?.addEventListener(
    'click',
    () => {
      if (
        confirm(
          'This will import new items from the CSV file and merge them with your existing data. Your current edits will be preserved. Continue?'
        )
      ) {
        csv.value = '';
        csv.click();
      }
    }
  );

  csv.addEventListener(
    'change',
    async e => {
      const f = e.target.files?.[0];

      if (!f) return;

      try {
        await importCSV(f);
      } catch (e) {
        console.error(e);
        alert('Failed to import CSV.');
      }
    }
  );
})();
