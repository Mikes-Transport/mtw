const {
  db,
  $,
  $$,
  doc,
  getDoc,
  setDoc
} = window.MTW;

(() => {
  const wrapper =
    $('.master-list-config-wrapper-select');

  const CONFIG =
    doc(
      db,
      'mte-config',
      'chassis-fields'
    );

  const CSV =
    doc(
      db,
      'csv-data',
      'chassis_master_mte_export'
    );

  let headers = [];
  let enabled = new Set();

  async function csvUrl() {
    try {
      const s =
        await getDoc(CSV);

      return s.exists()
        ? s.data().link || ''
        : '';

    } catch (e) {
      console.error(e);
      return '';
    }
  }

  async function getHeaders() {
    const url =
      await csvUrl();

    if (!url) {
      if (wrapper) {
        wrapper.innerHTML = `
          <div
            style="color:#ff8080;font-size:13px"
          >
            No CSV link found for
            chassis_master_mte_export.
          </div>
        `;
      }

      return [];
    }

    try {
      const res =
        await fetch(url);

      if (!res.ok) {
        throw new Error(
          `CSV request failed: ${res.status} ${res.statusText}`
        );
      }

      const line =
        (await res.text())
          .split(/\r?\n/)[0];

      const out = [];

      let cur = '';
      let quotes = false;

      for (
        let i = 0;
        i < line.length;
        i++
      ) {
        const c = line[i];

        if (c === '"') {
          if (
            quotes &&
            line[i + 1] === '"'
          ) {
            cur += '"';
            i++;
          } else {
            quotes = !quotes;
          }

        } else if (
          c === ',' &&
          !quotes
        ) {
          out.push(
            cur.trim()
          );

          cur = '';

        } else {
          cur += c;
        }
      }

      out.push(
        cur.trim()
      );

      return out.filter(Boolean);

    } catch (e) {
      console.error(e);

      if (wrapper) {
        wrapper.innerHTML = `
          <div
            style="color:#ff8080;font-size:13px"
          >
            Failed to load CSV columns.
          </div>
        `;
      }

      return [];
    }
  }

  async function load() {
    headers =
      await getHeaders();

    if (!headers.length) {
      return;
    }

    try {
      const s =
        await getDoc(CONFIG);

      enabled =
        s.exists() &&
        Array.isArray(
          s.data().enabledFields
        )
          ? new Set(
              s.data().enabledFields
            )
          : new Set(headers);

    } catch (e) {
      console.error(e);

      enabled =
        new Set(headers);
    }

    render();
  }

  function render() {
    if (!wrapper) return;

    wrapper.innerHTML = '';

    headers.forEach(h => {
      const r =
        document.createElement(
          'label'
        );

      r.className =
        'mte-config-checkbox-row';

      r.innerHTML = `
        <input
          type="checkbox"
          class="mte-config-checkbox"
          data-key="${h}"
          ${enabled.has(h) ? 'checked' : ''}
        >

        <span>${h}</span>
      `;

      wrapper.appendChild(r);
    });

    const a =
      document.createElement(
        'div'
      );

    a.className =
      'mte-config-save-area';

    a.style.marginTop =
      '20px';

    a.innerHTML = `
      <button
        type="button"
        class="mte-config-save-button"
        style="
          padding:10px 20px;
          border:0;
          border-radius:6px;
          cursor:pointer;
          font-weight:600;
        "
      >
        Save Configuration
      </button>

      <span
        class="mte-config-status-text"
        style="
          margin-left:12px;
          font-size:13px;
        "
      ></span>
    `;

    wrapper.appendChild(a);

    a.querySelector(
      '.mte-config-save-button'
    ).onclick = save;
  }

  async function save(e) {
    e.preventDefault();

    const btn =
      e.currentTarget;

    const status =
      btn.parentElement.querySelector(
        '.mte-config-status-text'
      );

    if (btn.disabled) {
      return;
    }

    const checked = [
      ...wrapper.querySelectorAll(
        '.mte-config-checkbox:checked'
      )
    ]
      .map(
        x => x.dataset.key
      )
      .filter(Boolean);

    if (!checked.length) {
      status.textContent =
        'Select at least one field.';

      status.style.color =
        '#535863';

      return;
    }

    try {
      btn.disabled = true;
      btn.textContent =
        'Saving...';

      status.textContent = '';

      await setDoc(
        CONFIG,
        {
          enabledFields: checked,
          updatedAt:
            new Date().toISOString()
        },
        {
          merge: true
        }
      );

      enabled =
        new Set(checked);

      btn.textContent =
        'Saved!';

      status.textContent =
        `Saved ${checked.length} field${
          checked.length === 1
            ? ''
            : 's'
        }.`;

      status.style.color =
        '';

      setTimeout(() => {
        btn.textContent =
          'Save Configuration';

        status.textContent =
          '';

        btn.disabled =
          false;
      }, 2000);

    } catch (e) {
      console.error(e);

      btn.disabled =
        false;

      btn.textContent =
        'Save Configuration';

      status.textContent =
        'Failed to save configuration.';

      status.style.color =
        '#ff8080';
    }
  }

  document.addEventListener(
    'db-tool-open',
    e => {
      if (
        e.detail.id ===
        'mte-config'
      ) {
        load();
      }
    }
  );
})();
