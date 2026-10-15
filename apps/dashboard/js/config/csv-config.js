const { db, $, $$, collection, getDocs, doc, setDoc } = window.MTW;

(() => {
  const q = $;

  const save = q('.csv-tool-save-button');

  const inputs = [
    [
      'wheelsheetalloyData',
      q('[name="wheelsheetalloyData"]')
    ],
    [
      'wheelsheetsteelData',
      q('[name="wheelsheetsteelData"]')
    ],
    [
      'roadmaster_data',
      q('[name="roadmaster_data"]')
    ],
    [
      'chassis_master_mte_export',
      q('[name="chassis_master_mte_export"]')
    ]
  ];

  let existing = {};

  document.addEventListener(
    'db-tool-open',
    async e => {
      if (e.detail.id !== 'csv-config') {
        return;
      }

      await load();
    }
  );

  async function load() {
    try {
      const s = await getDocs(
        collection(db, 'csv-data')
      );

      const m = {};

      s.forEach(d => {
        const x = d.data();

        if (x.name && x.link) {
          m[x.name] = x.link;
        }
      });

      existing = { ...m };

      inputs.forEach(([n, i]) => {
        if (i) {
          i.value = m[n] || '';
        }
      });

    } catch (e) {
      console.error(e);

      alert(
        'Failed to load existing CSV links'
      );
    }
  }

  save?.addEventListener(
    'click',
    async e => {
      e.preventDefault();

      try {
        save.disabled = true;
        save.textContent = 'Saving...';

        await Promise.all(
          inputs.map(([n, i]) => {
            const v =
              i?.value?.trim();

            const l =
              v || existing[n];

            return l
              ? setDoc(
                  doc(
                    db,
                    'csv-data',
                    n
                  ),
                  {
                    name: n,
                    link: l
                  },
                  {
                    merge: true
                  }
                )
              : Promise.resolve();
          })
        );

        inputs.forEach(([n, i]) => {
          const v =
            i?.value?.trim();

          if (v) {
            existing[n] = v;
          }
        });

        save.textContent = 'Saved!';

        setTimeout(() => {
          save.textContent = 'Save';
          save.disabled = false;
        }, 2000);

      } catch (e) {
        console.error(e);

        save.textContent = 'Save';
        save.disabled = false;

        alert(
          'Failed to update CSV links'
        );
      }
    }
  );
})();
