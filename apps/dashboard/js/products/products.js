console.log('PRODUCTS.JS LOADED');

const {
  db,
  $,
  $$,
  collection,
  getDocs,
  doc,
  addDoc,
  updateDoc,
  deleteDoc
} = window.MTW;

(() => {
  const q = $;

  const grid = q('.product-results-grid');
  const addBtn = q('.product-add-button');
  const search = q('.product-search-input');
  const overlay = q('.product-add-product-panel');
  const exit = q('.exit-icon');
  const form = q('.add-product-form');

  let all = [];
  let filtered = [];
  let editing = null;
  let term = '';

  async function load() {
    if (!db || !grid) return;

    grid.innerHTML = '';

    try {
      const s = await getDocs(
        collection(
          db,
          'product-information'
        )
      );

      all = s.docs.map(d => ({
        id: d.id,
        ...d.data()
      }));

      filter();

    } catch (e) {
      console.error(
        'Failed to load products:',
        e
      );
    }
  }

  window.loadProductItems = load;

  document.addEventListener(
    'db-tool-open',
    async e => {
      if (e.detail?.id !== 'product-info') {
        return;
      }

      await load();
    }
  );

  function filter() {
    filtered = [...all];

    if (term.trim()) {
      const s = term.toLowerCase();

      filtered = filtered.filter(x =>
        String(x.title || '')
          .toLowerCase()
          .includes(s) ||
        String(x.description || '')
          .toLowerCase()
          .includes(s)
      );
    }

    render();
  }

  function render() {
    if (!grid) return;

    grid.innerHTML = '';

    filtered.forEach(x => {
      const c =
        document.createElement('div');

      c.className =
        'product-result-card';

      c.innerHTML = `
        <img
          src="${x.image || 'https://cdn.prod.website-files.com/plugins/Basic/assets/placeholder.60f9b1840c.svg'}"
          loading="lazy"
          alt=""
          class="product-image"
        >

        <div class="product-card-text">
          ${x.title || 'Unnamed Product'}
        </div>

        <div class="product-card-button-wrapper">
          <div class="w-layout-grid product-card-button-grid">

            <div
              class="product-card-edit"
              data-id="${x.id}"
            >
              <div class="edit-icon w-embed">
                <svg
                  viewBox="0 0 24 24"
                  fill="none"
                  xmlns="http://www.w3.org/2000/svg"
                >
                  <path
                    d="M21.121 2.707a2 2 0 0 0-2.828 0L7 14v4h4L21.121 5.535a2 2 0 0 0-2.828-2.828z"
                    fill="currentColor"
                  />
                </svg>
              </div>

              <div class="product-text">
                Edit
              </div>
            </div>

            <div
              class="product-card-copy"
              data-id="${x.id}"
            >
              <div class="copy-icon w-embed">
                <svg
                  viewBox="0 0 24 24"
                  fill="none"
                  xmlns="http://www.w3.org/2000/svg"
                >
                  <path
                    d="M16 1H4a2 2 0 0 0-2 2v12h2V3h12V1zM20 5H8a2 2 0 0 0-2 2v14a2 2 0 0 1-2 2V7h12v14H8V7h12z"
                    fill="currentColor"
                  />
                </svg>
              </div>

              <div class="product-text">
                Copy
              </div>
            </div>

          </div>
        </div>

        <div class="product-card-delete-wrapper">
          <div
            class="product-card-delete"
            data-id="${x.id}"
          >
            <div class="delete-icon w-embed">
              <svg
                viewBox="0 0 24 24"
                fill="none"
                xmlns="http://www.w3.org/2000/svg"
              >
                <path
                  d="M6 7h12l-1 14H7L6 7zm3-3h6l1 2H8l1-2z"
                  fill="currentColor"
                />
              </svg>
            </div>

            <div class="product-text-delete">
              Delete
            </div>
          </div>
        </div>
      `;

      grid.appendChild(c);
    });

    bind();
  }

  function bind() {
    grid
      ?.querySelectorAll(
        '.product-card-delete'
      )
      .forEach(b => {
        b.onclick = async () => {
          if (
            !confirm(
              'Delete this product?'
            )
          ) {
            return;
          }

          try {
            await deleteDoc(
              doc(
                db,
                'product-information',
                b.dataset.id
              )
            );

            await load();

          } catch (e) {
            console.error(
              'Delete failed:',
              e
            );
          }
        };
      });

    grid
      ?.querySelectorAll(
        '.product-card-edit'
      )
      .forEach(b => {
        b.onclick = () => {
          const x = all.find(
            i =>
              i.id === b.dataset.id
          );

          if (!x) return;

          editing = x.id;

          openModal();
          populate(x);
        };
      });

    grid
      ?.querySelectorAll(
        '.product-card-copy'
      )
      .forEach(b => {
        b.onclick = () => {
          const x = all.find(
            i =>
              i.id === b.dataset.id
          );

          if (!x) return;

          editing = null;

          openModal();
          populate(x);
        };
      });
  }

  function spec(v = '') {
    const w =
      document.createElement('div');

    w.innerHTML = `
      <div class="specifications-flex">

        <input
          class="specifications-input w-input"
          maxlength="256"
          name="specifications"
          placeholder="e.g. Weight: 250lbs"
          type="text"
          value="${String(v).replace(/"/g, '&quot;')}"
        >

        <div
          class="remove-icon w-embed"
          style="cursor:pointer"
        >
          <svg
            viewBox="0 0 24 24"
            fill="none"
            xmlns="http://www.w3.org/2000/svg"
          >
            <path
              d="M7 17L16.8995 7.10051"
              stroke="currentColor"
              stroke-linecap="round"
            />
            <path
              d="M7 7.00001L16.8995 16.8995"
              stroke="currentColor"
              stroke-linecap="round"
            />
          </svg>
        </div>

      </div>
    `;

    const r =
      w.firstElementChild;

    r.querySelector(
      '.remove-icon'
    ).onclick = () => r.remove();

    return r;
  }

  function part(
    l = '',
    v = '',
    url = ''
  ) {
    const has = !!url;

    const w =
      document.createElement('div');

    w.innerHTML = `
      <div class="add-product-label-wrapper">

        <div class="w-layout-grid add-product-label-grid">

          <div class="add-product-label-card">
            <div class="small-text">
              Label (Field 1)
            </div>

            <input
              class="product-form-label-field w-input"
              maxlength="256"
              name="label"
              placeholder="e.g. Part Name"
              type="text"
              value="${String(l).replace(/"/g, '&quot;')}"
            >
          </div>

          <div class="add-product-label-card">
            <div class="small-text">
              Value (Field 2)
            </div>

            <input
              class="product-form-label-field w-input"
              maxlength="256"
              name="value"
              placeholder="e.g. 550045"
              type="text"
              value="${String(v).replace(/"/g, '&quot;')}"
            >
          </div>

        </div>

        <div class="add-product-label-link-wrapper">

          <label class="w-checkbox">
            <input
              type="checkbox"
              class="w-checkbox-input label-link-checkbox"
              ${has ? 'checked' : ''}
            >

            <span class="small-text w-form-label">
              Add link to value (optional)
            </span>
          </label>

          <div
            class="remove-icon-part w-embed"
            style="cursor:pointer"
          >
            <svg
              viewBox="0 0 24 24"
              fill="none"
              xmlns="http://www.w3.org/2000/svg"
            >
              <path
                d="M7 17L16.8995 7.10051"
                stroke="currentColor"
                stroke-linecap="round"
              />

              <path
                d="M7 7.00001L16.8995 16.8995"
                stroke="currentColor"
                stroke-linecap="round"
              />
            </svg>
          </div>

        </div>

        <input
          class="add-url-input w-input"
          maxlength="256"
          name="url"
          placeholder="https://..."
          type="text"
          value="${String(url).replace(/"/g, '&quot;')}"
          style="display:${has ? 'block' : 'none'}"
        >

      </div>
    `;

    const r =
      w.firstElementChild;

    const ch =
      r.querySelector(
        '.label-link-checkbox'
      );

    const u =
      r.querySelector(
        '[name="url"]'
      );

    ch.onchange = () => {
      u.style.display =
        ch.checked
          ? 'block'
          : 'none';
    };

    r.querySelector(
      '.remove-icon-part'
    ).onclick = () => r.remove();

    return r;
  }

  q('.add-product-new-specifications')
    ?.addEventListener(
      'click',
      () => {
        const b =
          q(
            '.add-product-new-specifications'
          );

        b.parentElement.insertBefore(
          spec(),
          b
        );
      }
    );

  q('.add-product-new-part')
    ?.addEventListener(
      'click',
      () => {
        const b =
          q(
            '.add-product-new-part'
          );

        b.parentElement.insertBefore(
          part(),
          b
        );
      }
    );

  function collect() {
    const specifications = [];

    form
      ?.querySelectorAll(
        '[name="specifications"]'
      )
      .forEach(i => {
        const v =
          i.value.trim();

        if (v) {
          specifications.push(v);
        }
      });

    const parts = [];

    form
      ?.querySelectorAll(
        '.add-product-label-wrapper'
      )
      .forEach(r => {
        const l =
          r.querySelector(
            '[name="label"]'
          )?.value.trim();

        const v =
          r.querySelector(
            '[name="value"]'
          )?.value.trim();

        const has =
          r.querySelector(
            '.label-link-checkbox'
          )?.checked;

        const u = has
          ? r.querySelector(
              '[name="url"]'
            )?.value.trim()
          : '';

        if (l || v) {
          parts.push({
            label: l || '',
            value: v || '',
            url: u || ''
          });
        }
      });

    return {
      title:
        form
          ?.querySelector(
            '[name="title"]'
          )
          ?.value.trim() || '',

      category:
        form
          ?.querySelector(
            '[name="category"]'
          )
          ?.value.trim() || '',

      image:
        form
          ?.querySelector(
            '[name="imageurl"]'
          )
          ?.value.trim() || '',

      description:
        form
          ?.querySelector(
            '[name="description"]'
          )
          ?.value.trim() || '',

      specifications,
      parts
    };
  }

  q('.add-product-form-save-btn')
    ?.addEventListener(
      'click',
      async () => {
        const d = collect();

        if (!d.title) {
          alert(
            'Product name is required.'
          );

          return;
        }

        try {
          if (editing) {
            await updateDoc(
              doc(
                db,
                'product-information',
                editing
              ),
              d
            );
          } else {
            await addDoc(
              collection(
                db,
                'product-information'
              ),
              d
            );
          }

          closeModal();
          await load();

        } catch (e) {
          console.error(e);

          alert(
            'Failed to save product.'
          );
        }
      }
    );

  function populate(x) {
    if (!form) return;

    form.querySelector(
      '[name="title"]'
    ).value =
      x.title || '';

    form.querySelector(
      '[name="category"]'
    ).value =
      x.category || '';

    form.querySelector(
      '[name="imageurl"]'
    ).value =
      x.image || '';

    form.querySelector(
      '[name="description"]'
    ).value =
      x.description || '';

    const s =
      form.querySelector(
        '.add-product-new-specifications'
      );

    form
      .querySelectorAll(
        '.specifications-flex'
      )
      .forEach(x => x.remove());

    if (x.specifications?.length) {
      x.specifications.forEach(v => {
        s.parentElement.insertBefore(
          spec(v),
          s
        );
      });
    } else {
      s.parentElement.insertBefore(
        spec(),
        s
      );
    }

    const p =
      form.querySelector(
        '.add-product-new-part'
      );

    form
      .querySelectorAll(
        '.add-product-label-wrapper'
      )
      .forEach(x => x.remove());

    if (x.parts?.length) {
      x.parts.forEach(v => {
        p.parentElement.insertBefore(
          part(
            v.label || '',
            v.value || '',
            v.url || ''
          ),
          p
        );
      });
    } else {
      p.parentElement.insertBefore(
        part(),
        p
      );
    }
  }

  function reset() {
    if (!form) return;

    [
      'title',
      'category',
      'imageurl',
      'description'
    ].forEach(n => {
      const input =
        form.querySelector(
          `[name="${n}"]`
        );

      if (input) {
        input.value = '';
      }
    });

    form
      .querySelectorAll(
        '.specifications-flex,.add-product-label-wrapper'
      )
      .forEach(x => x.remove());

    const s =
      form.querySelector(
        '.add-product-new-specifications'
      );

    const p =
      form.querySelector(
        '.add-product-new-part'
      );

    s.parentElement.insertBefore(
      spec(),
      s
    );

    p.parentElement.insertBefore(
      part(),
      p
    );
  }

  function openModal() {
    if (overlay) {
      overlay.style.display = 'flex';
    }
  }

  function closeModal() {
    if (overlay) {
      overlay.style.display = 'none';
    }

    editing = null;

    reset();
  }

  addBtn?.addEventListener(
    'click',
    () => {
      editing = null;
      reset();
      openModal();
    }
  );

  exit?.addEventListener(
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
})();
