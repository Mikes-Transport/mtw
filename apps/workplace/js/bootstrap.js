if (!window.MTW) {
  window.MTW = {
    db: null,
    $: function (selector) { return document.querySelector(selector); },
    $$: function (selector) { return Array.from(document.querySelectorAll(selector)); },
    collection: function () { throw new Error('Firebase not configured'); },
    getDocs: async function () { return { empty: true, docs: [], forEach: function () {} }; },
    doc: function () { throw new Error('Firebase not configured'); },
    setDoc: async function () { return false; }
  };
}
