'use strict';

(function () {
  const TOOL_ID = 'custom-web-element';
  const COLLECTION = 'custom-web-elements';
  const WHEEL_TEMPLATE = 'checkout-spin-wheel';
  const AI_TEMPLATE = 'ai-generated-element';
  const AI_PREVIEW_BASE_CSS = `
    *,*::before,*::after{box-sizing:border-box}
    html{min-height:100%;font-family:Inter,ui-sans-serif,system-ui,-apple-system,BlinkMacSystemFont,"Segoe UI",sans-serif}
    body{display:grid;place-items:center;min-height:100vh;margin:0;padding:16px;color:#18181b;background:radial-gradient(ellipse at 50% 42%,#fff 0%,#f7f8fc 76%);font-family:inherit;font-size:14px;line-height:1.5;-webkit-font-smoothing:antialiased}
    button,input,select,textarea{font:inherit}
    button{cursor:pointer}
    svg{max-width:100%;height:auto}
    body>svg:first-child,body>:first-child>svg:only-child{display:block;width:min(100%,360px);height:auto;max-height:360px}
    :focus-visible{outline:3px solid #6366f1;outline-offset:2px}
    @media(max-width:420px){body{padding:10px}}
  `;
  const SPIN_WHEEL_URL = 'https://raw.githack.com/Mikes-Transport/mtw/main/apps/website/checkout/checkout-spinwheel.js';
  const ELEMENTS_PATH = 'apps/website/custom-elements';
  const MTW = window.MTW || {};
  const PUBLISHER_URL = String(
    MTW.customElementPublisherUrl ||
    window.MTW_CUSTOM_ELEMENT_PUBLISHER_URL ||
    'https://mtw.mtwaustin.workers.dev/'
  ).trim();

  const TEMPLATES = {
    [WHEEL_TEMPLATE]: {
      name: 'Checkout spin wheel',
      category: 'Checkout',
      description: 'A weighted prize wheel with configurable copy, colours, daily limits, and spin logging.',
      defaults: {
        eyebrow: '★ MTW · Checkout game ★',
        titleTop: 'MYSTERY',
        titleBottom: 'GIVEAWAY',
        subtitle: 'Spin the wheel · win prizes',
        centreLabel: 'SPIN',
        buttonTop: 'SPIN THE WHEEL',
        buttonBottom: 'WIN SOMETHING!',
        finePrint: 'Get what you get · no returns or substitutions',
        background: '#07110b',
        accent: '#22c55e',
        dailyLimit: true,
        logSpins: true,
        prizes: [
          { label: 'NO PRIZE', value: 'NO PRIZE', code: '', chance: 8, color: '#17171c', textColor: '#ffffff' },
          { label: 'X2 AIR FRESHENERS', value: 'X2 AIR FRESHENERS', code: 'SPIN-AIRFRESHENER', chance: 20, color: '#ffd21f', textColor: '#26262b' },
          { label: 'X1 MTW COFFEE MUG', value: 'X1 MTW COFFEE MUG', code: 'SPIN-TWMUG', chance: 12.5, color: '#2563eb', textColor: '#ffffff' },
          { label: 'X1 RANDOM EXTE MERCH', value: 'X1 RANDOM EXTE MERCH', code: 'SPIN-EXTE', chance: 2, color: '#9333ea', textColor: '#ffffff' },
          { label: 'X1 MYSTERY GIFT', value: 'X1 MYSTERY GIFT', code: 'SPIN-MYSTERY', chance: 2, color: '#22c55e', textColor: '#ffffff' },
          { label: 'X1 WICKED PACK', value: 'X1 WICKED PACK', code: 'SPIN-WICKED', chance: 22, color: '#ef2b2b', textColor: '#ffffff' },
          { label: 'X1 RANDOM SNACK', value: 'X1 RANDOM SNACK', code: 'SPIN-SNACK', chance: 22, color: '#ff8a00', textColor: '#ffffff' },
          { label: 'X1 WC COFFEE MUG', value: 'X1 WC COFFEE MUG', code: 'SPIN-WCMUG', chance: 11.5, color: '#f1f1f4', textColor: '#26262b' }
        ]
      }
    }
  };

  let panel;
  let settings;
  let savedElements = [];
  let activeId = '';
  let artifactName = '';
  let artifactUrl = '';
  let aiMessages = [];
  let aiDraft;
  let aiValues = {};
  let aiBusy = false;

  const esc = value => String(value == null ? '' : value)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');

  function safeColor(value, fallback) {
    return /^#[0-9a-f]{6}$/i.test(String(value || ''))
      ? value
      : fallback;
  }

  function contrastColor(value) {
    const color = safeColor(value, '#17171c');
    const channels = color.slice(1).match(/.{2}/g).map(channel => parseInt(channel, 16) / 255);
    const luminance = channels.map(channel =>
      channel <= 0.03928 ? channel / 12.92 : Math.pow((channel + 0.055) / 1.055, 2.4)
    );
    return 0.2126 * luminance[0] + 0.7152 * luminance[1] + 0.0722 * luminance[2] > 0.45
      ? '#26262b'
      : '#ffffff';
  }

  function cloneDefaults(templateId) {
    const template = TEMPLATES[templateId];
    if (!template) throw new Error('Unknown custom element template.');
    return JSON.parse(JSON.stringify(template.defaults));
  }

  function normalizeAiDraft(value) {
    if (!value || typeof value !== 'object' || Array.isArray(value)) return null;
    const title = typeof value.title === 'string' && value.title.trim()
      ? value.title.slice(0, 100)
      : 'Custom web element';
    const assistantMessage = typeof value.assistantMessage === 'string' && value.assistantMessage.trim()
      ? value.assistantMessage.slice(0, 1200)
      : 'Here is your generated design.';
    const html = value.html;
    const css = value.css == null ? '' : value.css;
    const js = value.js == null ? '' : value.js;
    if (typeof html !== 'string' || !html.trim() || html.length > 16000 ||
        typeof css !== 'string' || css.length > 16000 ||
        typeof js !== 'string' || js.length > 16000 ||
        html.length + css.length + js.length > 36000) return null;
    const keys = new Set();
    const editableFields = [];
    const fields = Array.isArray(value.editableFields) ? value.editableFields.slice(0, 12) : [];
    for (const item of fields) {
      if (!item || typeof item.key !== 'string' || !/^[a-z][a-zA-Z0-9_]{0,39}$/.test(item.key) ||
          keys.has(item.key) || !['text', 'color', 'number', 'boolean'].includes(item.type)) continue;
      if (item.type === 'text' && (typeof item.defaultValue !== 'string' || item.defaultValue.length > 300)) continue;
      if (item.type === 'color' && (typeof item.defaultValue !== 'string' || !/^#[0-9a-f]{6}$/i.test(item.defaultValue))) continue;
      if (item.type === 'number' && (!Number.isFinite(item.defaultValue) || Math.abs(item.defaultValue) > 100000)) continue;
      if (item.type === 'boolean' && typeof item.defaultValue !== 'boolean') continue;
      const source = `${html}\n${css}\n${js}`;
      if (!source.includes(`{{field:${item.key}}}`) &&
          !source.includes(`MTW_SETTINGS["${item.key}"]`) &&
          !source.includes(`MTW_SETTINGS['${item.key}']`)) continue;
      const label = typeof item.label === 'string' && item.label.trim()
        ? item.label.trim().slice(0, 80)
        : item.key.replace(/_/g, ' ');
      if (!label) continue;
      keys.add(item.key);
      editableFields.push({
        key: item.key,
        label,
        type: item.type,
        defaultValue: item.defaultValue
      });
    }
    return {
      title,
      assistantMessage,
      html,
      css,
      js,
      editableFields
    };
  }

  function style() {
    if (document.getElementById('cwe-editor-styles')) return;
    const node = document.createElement('style');
    node.id = 'cwe-editor-styles';
    node.textContent = `
      .custom-web-element-panel{max-width:1320px;margin:0 auto;padding:8px 0 32px;color:#171717}
      .cwe-shell{display:grid;grid-template-columns:minmax(0,1fr);gap:16px;align-items:start}
      .cwe-card{background:#fff;border:1px solid #e5e7eb;border-radius:12px;padding:20px;box-shadow:0 2px 10px rgba(0,0,0,.04)}
      .cwe-editor-card{height:680px;max-height:calc(100vh - 210px);min-height:420px;box-sizing:border-box;display:flex;flex-direction:column}
      .cwe-editor-sections{min-height:0;padding:2px 6px 8px 0;display:flex;flex-direction:column;gap:9px}
      .cwe-section{flex:0 0 auto;border:1px solid #e5e7eb;border-radius:10px;margin:0;background:#fff;overflow:hidden}
      .cwe-template-section[hidden],.cwe-wheel-only[hidden]{display:none!important}
      .cwe-section summary{display:flex;align-items:center;justify-content:space-between;gap:12px;padding:14px 16px;cursor:pointer;background:#fbfbfc;font-size:13px;font-weight:800;list-style:none}
      .cwe-section summary::-webkit-details-marker{display:none}
      .cwe-section summary::after{content:'+';flex:none;color:#737780;font-size:18px;font-weight:500;line-height:1}
      .cwe-section[open] summary{border-bottom:1px solid #eee;background:#fff}
      .cwe-section[open] summary::after{content:'−'}
      .cwe-section-scroll{padding:16px}
      .cwe-section-scroll .cwe-row:last-child .cwe-field,.cwe-section-scroll>.cwe-field:last-child{margin-bottom:0}
      .cwe-editor-sections,.cwe-prizes{scrollbar-width:thin;scrollbar-color:#c7cbd1 transparent}
      .cwe-editor-sections::-webkit-scrollbar,.cwe-prizes::-webkit-scrollbar{width:6px}
      .cwe-editor-sections::-webkit-scrollbar-track,.cwe-prizes::-webkit-scrollbar-track{background:transparent}
      .cwe-editor-sections::-webkit-scrollbar-thumb,.cwe-prizes::-webkit-scrollbar-thumb{border:1px solid transparent;border-radius:8px;background:#c7cbd1;background-clip:padding-box}
      .cwe-editor-sections::-webkit-scrollbar-thumb:hover,.cwe-prizes::-webkit-scrollbar-thumb:hover{background:#9ca3af;background-clip:padding-box}
      .cwe-preview-card{width:100%;box-sizing:border-box}
      .cwe-ai-chat{display:flex;flex-direction:column;gap:12px;min-height:0}
      .cwe-ai-messages{display:flex;flex-direction:column;gap:8px;max-height:200px;overflow-y:auto;padding:10px;background:#f8f9fb;border:1px solid #e5e7eb;border-radius:9px}
      .cwe-ai-message{max-width:92%;padding:9px 11px;border-radius:9px;font-size:12px;line-height:1.5;white-space:pre-wrap;overflow-wrap:anywhere}
      .cwe-ai-message-user{align-self:flex-end;background:#171717;color:#fff}
      .cwe-ai-message-assistant{align-self:flex-start;background:#fff;border:1px solid #e5e7eb}
      .cwe-ai-input{min-height:72px;resize:vertical}
      .cwe-ai-frame{display:block;width:100%;height:440px;border:0;border-radius:8px;background:#fff}
      .cwe-ai-field{display:grid;grid-template-columns:minmax(110px,1fr) minmax(120px,2fr);align-items:center;gap:10px;margin:0 0 10px;font-size:12px}
      .cwe-ai-field label{font-weight:700}
      .cwe-title{margin:0 0 6px;font-size:20px;font-weight:800}
      .cwe-copy{margin:0 0 16px;color:#666;font-size:13px;line-height:1.5}
      .cwe-field{display:flex;flex-direction:column;gap:5px;margin:0 0 13px}
      .cwe-field label,.cwe-label{font-size:11px;font-weight:800;letter-spacing:.06em;text-transform:uppercase;color:#555}
      .cwe-input,.cwe-select{width:100%;box-sizing:border-box;border:1px solid #d1d5db;border-radius:7px;padding:9px 10px;background:#fff;color:#171717;font:inherit;font-size:13px}
      .cwe-input:focus,.cwe-select:focus{outline:2px solid #111;outline-offset:1px}
      .cwe-row{display:grid;grid-template-columns:1fr 1fr;gap:10px}
      .cwe-prizes{display:flex;flex-direction:column;gap:9px;margin:10px 0 14px}
      .cwe-prize{display:grid;grid-template-columns:minmax(100px,1.5fr) minmax(80px,1fr) 70px 52px 34px;gap:7px;align-items:center;padding:9px;background:#f8f8f8;border:1px solid #eee;border-radius:8px}
      .cwe-prize input{min-width:0}
      .cwe-prize-color{width:38px;height:34px;padding:2px;border:1px solid #ccc;border-radius:6px;background:#fff}
      .cwe-remove{width:32px;height:32px;border:1px solid #ddd;border-radius:6px;background:#fff;color:#a00;font-size:18px;cursor:pointer}
      .cwe-actions{display:flex;flex-wrap:wrap;gap:8px;margin-top:14px}
      .cwe-btn{min-height:36px;padding:8px 13px;border:1px solid #ccc;border-radius:7px;background:#fff;color:#171717;font:inherit;font-size:12px;font-weight:800;cursor:pointer}
      .cwe-btn:hover{background:#f5f5f5}
      .cwe-btn-primary{background:#111;color:#fff;border-color:#111}
      .cwe-btn-primary:hover{background:#333}
      .cwe-btn:disabled{opacity:.55;cursor:wait}
      .cwe-status{min-height:18px;margin-top:10px;font-size:12px;color:#555}
      .cwe-status[data-error="true"]{color:#b42318}
      .cwe-preview{overflow:hidden;border-radius:11px;padding:20px;background:#07110b;color:white;font-family:Arial,sans-serif;text-align:center;transition:background .15s}
      .cwe-preview-eyebrow{font-size:10px;letter-spacing:.14em;text-transform:uppercase;opacity:.7}
      .cwe-preview h3{margin:10px 0 4px;font-size:22px;font-weight:900;letter-spacing:.04em}
      .cwe-preview-subtitle{margin:0;font-size:11px;opacity:.7}
      .cwe-wheel{position:relative;width:min(280px,75vw);aspect-ratio:1;margin:22px auto;border:10px solid #f4f4f5;border-radius:50%;box-shadow:0 8px 24px #0007}
      .cwe-wheel-inner{position:absolute;inset:0;border-radius:50%}
      .cwe-wheel-label{position:absolute;left:50%;top:50%;width:40%;overflow:hidden;white-space:nowrap;text-overflow:ellipsis;font-size:9px;font-weight:800;text-align:right;transform-origin:left center}
      .cwe-wheel-centre{position:absolute;left:50%;top:50%;display:grid;place-items:center;width:54px;height:54px;transform:translate(-50%,-50%);border:4px solid #fff;border-radius:50%;background:#171717;color:#fff;font-size:10px;font-weight:900}
      .cwe-preview-button{display:inline-block;margin-top:4px;padding:10px 18px;border:0;border-radius:7px;background:#22c55e;color:#07110b;font-size:11px;font-weight:900}
      .cwe-preview-fine{margin:11px 0 0;font-size:9px;opacity:.6}
      .cwe-toggle{display:flex;align-items:flex-start;gap:9px;margin:12px 0;font-size:12px;line-height:1.45}
      .cwe-toggle input{margin-top:2px}
      .cwe-role-options{display:flex;flex-wrap:wrap;gap:7px}
      .cwe-role-options label{display:flex;align-items:center;gap:6px;padding:7px 9px;border:1px solid #e5e7eb;border-radius:7px;background:#f8f8f8;font-size:12px}
      .cwe-small{font-size:11px;color:#666}
      .cwe-saved{display:flex;gap:8px;align-items:center}
      .cwe-saved .cwe-select{flex:1}
      .cwe-snippet{width:100%;min-height:112px;box-sizing:border-box;margin-top:10px;padding:10px;border:1px solid #ddd;border-radius:7px;font:11px/1.45 Consolas,monospace}
      @media(min-width:600px){.cwe-shell{grid-template-columns:minmax(0,1fr) minmax(0,1.1fr);gap:20px}.cwe-preview-card{position:sticky;top:16px;overflow-y:auto;scrollbar-width:thin;scrollbar-color:#c7cbd1 transparent;max-height:calc(100vh - 32px)}.cwe-editor-card{height:auto;max-height:none;min-height:0;align-self:start}.cwe-editor-card.cwe-editor-card-collapsed{display:flex;flex-direction:column}.cwe-editor-card-collapsed .cwe-editor-sections{flex:1;overflow-y:auto}}
      @media(max-width:599px){.cwe-shell{grid-template-columns:minmax(0,1fr)}.cwe-preview-card{position:sticky;top:8px;z-index:2;max-height:42vh;overflow-y:auto;scrollbar-width:thin;scrollbar-color:#c7cbd1 transparent}}
      @media(max-width:520px){.cwe-card{padding:14px}.cwe-editor-card{height:680px;max-height:calc(100vh - 150px);min-height:400px}.cwe-prize{grid-template-columns:minmax(100px,1fr) 64px 44px 30px}.cwe-prize-code{display:none}.cwe-row{grid-template-columns:1fr}}
    `;
    document.head.appendChild(node);
  }

  function shell() {
    return `
      <div class="cwe-shell">
        <section class="cwe-card cwe-preview-card">
          <div class="cwe-label" id="cwe-preview-label" style="margin-bottom:10px">Preview</div>
          <div class="cwe-preview" id="cwe-preview"></div>
          <p class="cwe-small" id="cwe-preview-help" style="margin:10px 0 0">Select a template to see its preview.</p>
        </section>
        <section class="cwe-card cwe-editor-card">
          <h2 class="cwe-title">Custom web element</h2>
          <p class="cwe-copy">Configure a checkout spin wheel or prototype a new element with AI. Wheel templates can be published to checkout; AI drafts are saved in the dashboard only.</p>
          <div class="cwe-editor-sections">
            <details class="cwe-section" open>
              <summary>Element setup</summary>
              <div class="cwe-section-scroll">
                <div class="cwe-row">
                  <div class="cwe-field"><label for="cwe-template">Template</label><select class="cwe-select" id="cwe-template"><option value="" selected>Choose a template</option><option value="${AI_TEMPLATE}">Create with AI (experimental)</option><option value="${WHEEL_TEMPLATE}">Checkout spin wheel</option></select></div>
                  <div class="cwe-field cwe-wheel-only"><label for="cwe-name">Element name</label><input class="cwe-input" id="cwe-name" maxlength="60" value="My checkout wheel"></div>
                </div>
              </div>
            </details>
            <details class="cwe-section cwe-template-section" data-template="${AI_TEMPLATE}" open>
              <summary>Create with AI</summary>
              <div class="cwe-section-scroll">
                <p class="cwe-small" style="margin:0 0 10px;line-height:1.5">Describe the design or request a change. The preview is isolated and cannot access the dashboard or checkout. This creates a prototype, not a live checkout integration.</p>
                <div class="cwe-ai-chat">
                  <div class="cwe-ai-messages" id="cwe-ai-messages" aria-live="polite"></div>
                  <label class="cwe-field" for="cwe-ai-input">What should the element do or look like?
                    <textarea class="cwe-input cwe-ai-input" id="cwe-ai-input" maxlength="2000" placeholder="Example: Make a rewards progress card in purple, grey, and blue. Use sample points only."></textarea>
                  </label>
                  <div class="cwe-actions" style="margin-top:0">
                    <button class="cwe-btn cwe-btn-primary" type="button" id="cwe-ai-send">Generate / refine</button>
                    <button class="cwe-btn" type="button" id="cwe-ai-save" disabled>Save as reusable template</button>
                  </div>
                  <div class="cwe-status" id="cwe-ai-status" role="status"></div>
                  <div id="cwe-ai-fields" hidden>
                    <div class="cwe-field"><label for="cwe-ai-name">Template name</label><input class="cwe-input" id="cwe-ai-name" maxlength="80"></div>
                    <h3 class="cwe-label">Editable template settings</h3>
                    <div id="cwe-ai-field-controls"></div>
                    <div class="cwe-small" style="line-height:1.5">The saved template keeps its generated source and these editable values in the dashboard. It is not published to checkout.</div>
                  </div>
                </div>
              </div>
            </details>
            <details class="cwe-section cwe-template-section" data-template="${WHEEL_TEMPLATE}" open>
              <summary>Title, headings and button text</summary>
              <div class="cwe-section-scroll">
                <div class="cwe-row">
                  <div class="cwe-field"><label for="cwe-eyebrow">Small heading</label><input class="cwe-input" id="cwe-eyebrow" maxlength="80"></div>
                  <div class="cwe-field"><label for="cwe-subtitle">Subtitle</label><input class="cwe-input" id="cwe-subtitle" maxlength="100"></div>
                </div>
                <div class="cwe-row">
                  <div class="cwe-field"><label for="cwe-title-top">Main title</label><input class="cwe-input" id="cwe-title-top" maxlength="35"></div>
                  <div class="cwe-field"><label for="cwe-title-bottom">Second title line</label><input class="cwe-input" id="cwe-title-bottom" maxlength="35"></div>
                </div>
                <div class="cwe-row">
                  <div class="cwe-field"><label for="cwe-centre">Wheel centre</label><input class="cwe-input" id="cwe-centre" maxlength="12"></div>
                  <div class="cwe-field"><label for="cwe-button-top">Button text</label><input class="cwe-input" id="cwe-button-top" maxlength="32"></div>
                </div>
                <div class="cwe-row">
                  <div class="cwe-field"><label for="cwe-button-bottom">Button subtext</label><input class="cwe-input" id="cwe-button-bottom" maxlength="32"></div>
                  <div class="cwe-field"><label for="cwe-fine">Small print</label><input class="cwe-input" id="cwe-fine" maxlength="120"></div>
                </div>
              </div>
            </details>
            <details class="cwe-section cwe-template-section" data-template="${WHEEL_TEMPLATE}">
              <summary>Colours and appearance</summary>
              <div class="cwe-section-scroll">
                <div class="cwe-row">
                  <div class="cwe-field"><label for="cwe-background">Background</label><input class="cwe-input" id="cwe-background" type="color"></div>
                  <div class="cwe-field"><label for="cwe-accent">Accent</label><input class="cwe-input" id="cwe-accent" type="color"></div>
                </div>
              </div>
            </details>
            <details class="cwe-section cwe-template-section" data-template="${WHEEL_TEMPLATE}">
              <summary>Spin limits and logging</summary>
              <div class="cwe-section-scroll">
                <label class="cwe-toggle"><input id="cwe-daily" type="checkbox"><span><strong>Limit to one spin per customer per day</strong><br><span class="cwe-small">A hashed customer identifier and spin date are stored to enforce this. If Firestore cannot reserve the spin, the wheel stays locked.</span></span></label>
                <label class="cwe-toggle"><input id="cwe-logging" type="checkbox"><span><strong>Log spin results</strong><br><span class="cwe-small">Stores customer and prize details in Firestore. Without this, only the minimum limit record is kept when the daily limit is on.</span></span></label>
              </div>
            </details>
            <details class="cwe-section cwe-template-section" data-template="${WHEEL_TEMPLATE}">
              <summary>Prize items <span class="cwe-small" id="cwe-total"></span></summary>
              <div class="cwe-section-scroll">
                <div class="cwe-prizes" id="cwe-prizes"></div>
                <button class="cwe-btn" type="button" id="cwe-add-prize">Add prize</button>
              </div>
            </details>
            <details class="cwe-section">
              <summary>Save and publish</summary>
              <div class="cwe-section-scroll">
                <div class="cwe-actions cwe-wheel-only">
                  <button class="cwe-btn cwe-btn-primary" type="button" id="cwe-save">Save changes</button>
                  <button class="cwe-btn" type="button" id="cwe-new">New from template</button>
                </div>
                <div class="cwe-status" id="cwe-status" role="status"></div>
                <div class="cwe-field" style="margin-top:20px">
                  <label for="cwe-saved">Saved elements</label>
                  <div class="cwe-saved"><select class="cwe-select" id="cwe-saved"><option value="">Choose a saved element</option></select><button class="cwe-btn" id="cwe-load" type="button">Load</button></div>
                </div>
                <div class="cwe-wheel-only">
                  <label class="cwe-label" for="cwe-embed">Embed code</label>
                  <textarea class="cwe-snippet" id="cwe-embed" readonly placeholder="Save an element to generate its embed code."></textarea>
                  <div class="cwe-actions"><button class="cwe-btn cwe-btn-primary" type="button" id="cwe-download" disabled>Download JS file</button><button class="cwe-btn" type="button" id="cwe-copy" disabled>Copy embed code</button></div>
                </div>
                <div class="cwe-small" id="cwe-deploy-help" style="margin-top:12px;line-height:1.55">After the Cloudflare Worker is configured, saving will publish this file automatically. Until then, download it and upload it to GitHub manually. Then add the generated embed code to the checkout page.</div>
              </div>
            </details>
          </div>
        </section>
      </div>
    `;
  }

  function field(id) {
    return panel.querySelector('#' + id);
  }

  function setStatus(message, isError) {
    const node = field('cwe-status');
    if (!node) return;
    node.textContent = message || '';
    node.dataset.error = isError ? 'true' : 'false';
  }

  function setAiStatus(message, isError) {
    const node = field('cwe-ai-status');
    if (!node) return;
    node.textContent = message || '';
    node.dataset.error = isError ? 'true' : 'false';
  }

  function normalizedAiValue(item, value) {
    if (item.type === 'color') return safeColor(value, item.defaultValue);
    if (item.type === 'number') {
      const number = Number(value);
      return Number.isFinite(number) && Math.abs(number) <= 100000 ? number : item.defaultValue;
    }
    if (item.type === 'boolean') return typeof value === 'boolean' ? value : item.defaultValue;
    return typeof value === 'string' ? value.slice(0, 300) : item.defaultValue;
  }

  function renderAiFields() {
    const section = field('cwe-ai-fields');
    const host = field('cwe-ai-field-controls');
    const saveButton = field('cwe-ai-save');
    if (!section || !host) return;
    section.hidden = !aiDraft;
    saveButton.disabled = !aiDraft || aiBusy;
    if (!aiDraft) {
      host.replaceChildren();
      return;
    }
    host.replaceChildren();
    aiDraft.editableFields.forEach(item => {
      const row = document.createElement('div');
      row.className = 'cwe-ai-field';
      const label = document.createElement('label');
      const input = document.createElement('input');
      const id = `cwe-ai-value-${item.key}`;
      label.htmlFor = id;
      label.textContent = item.label;
      input.id = id;
      input.className = 'cwe-input';
      input.type = item.type === 'boolean' ? 'checkbox' : item.type;
      if (item.type === 'boolean') input.checked = !!aiValues[item.key];
      else input.value = String(aiValues[item.key] == null ? item.defaultValue : aiValues[item.key]);
      input.addEventListener('input', () => {
        aiValues[item.key] = item.type === 'boolean'
          ? input.checked
          : normalizedAiValue(item, item.type === 'number' ? input.valueAsNumber : input.value);
        renderAiPreview();
        if (activeId) setAiStatus('Unsaved template changes.', false);
      });
      row.append(label, input);
      host.appendChild(row);
    });
  }

  function renderAiMessages() {
    const host = field('cwe-ai-messages');
    if (!host) return;
    host.replaceChildren();
    aiMessages.forEach(message => {
      const bubble = document.createElement('div');
      bubble.className = `cwe-ai-message cwe-ai-message-${message.role}`;
      bubble.textContent = message.content;
      host.appendChild(bubble);
    });
    host.scrollTop = host.scrollHeight;
  }

  function cssValue(value) {
    return String(value)
      .replace(/\\/g, '\\\\')
      .replace(/</g, '\\3c ')
      .replace(/>/g, '\\3e ')
      .replace(/["']/g, '\\$&')
      .replace(/[\r\n]/g, ' ');
  }

  function normalizeAiCss(value) {
    let css = value.trim();
    css = css.replace(/^```(?:css)?\s*/i, '').replace(/\s*```$/, '').trim();
    const styleMatch = css.match(/^<style(?:\s[^>]*)?>([\s\S]*)<\/style>$/i);
    return styleMatch ? styleMatch[1].trim() : css;
  }

  function fallbackAiCss(html) {
    const root = html.match(/<([a-z][a-z0-9-]*)\b([^>]*)>/i);
    if (!root) return '';
    const classAttribute = root[2].match(/\bclass\s*=\s*(["'])(.*?)\1/i);
    const rootClass = classAttribute && classAttribute[2]
      .split(/\s+/)
      .find(token => /^[a-zA-Z_-][a-zA-Z0-9_-]*$/.test(token));
    const selector = rootClass ? `.${rootClass}` : `body>${root[1].toLowerCase()}:first-child`;
    return `${selector}{box-sizing:border-box;display:grid;place-items:center;width:min(100%,680px);min-height:320px;margin:auto;padding:clamp(24px,6vw,56px);border:1px solid rgba(30,41,59,.1);border-radius:24px;background:linear-gradient(145deg,#fff 0%,#f5f7fb 100%);box-shadow:0 20px 55px rgba(15,23,42,.12)}${selector}>svg:only-child{display:block;width:min(100%,360px);height:auto;max-height:360px}`;
  }

  function renderAiPreview() {
    const preview = field('cwe-preview');
    if (!aiDraft) {
      preview.style.background = '#f3f4f6';
      preview.innerHTML = '<div class="cwe-small">Describe an element and generate a draft to preview it.</div>';
      field('cwe-preview-label').textContent = 'AI Draft Preview';
      field('cwe-preview-help').textContent = 'The AI draft will run in an isolated preview and will not be published.';
      return;
    }
    const values = {};
    aiDraft.editableFields.forEach(item => {
      values[item.key] = normalizedAiValue(item, aiValues[item.key]);
    });
    const interpolate = (source, escape) => source.replace(/\{\{field:([a-z][a-zA-Z0-9_]*)\}\}/g, (match, key) => {
      const item = aiDraft.editableFields.find(candidate => candidate.key === key);
      return item ? escape(values[key]) : '';
    });
    const html = interpolate(aiDraft.html, esc);
    const draftCss = normalizeAiCss(aiDraft.css);
    const css = interpolate(draftCss || fallbackAiCss(aiDraft.html), cssValue);
    const settingsJson = JSON.stringify(values).replace(/</g, '\\u003c').replace(/>/g, '\\u003e').replace(/&/g, '\\u0026');
    const styleText = `${AI_PREVIEW_BASE_CSS}\n${css}`.replace(/<\/style/gi, '<\\/style');
    const source = `<!doctype html><html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><meta http-equiv="Content-Security-Policy" content="default-src 'none'; style-src 'unsafe-inline'; script-src 'unsafe-inline'; img-src data: blob:; font-src data:; connect-src 'none'; frame-src 'none'; object-src 'none'; base-uri 'none'; form-action 'none'"><style>${styleText}</style></head><body>${html}<script>window.MTW_SETTINGS=${settingsJson};</script><script>${aiDraft.js.replace(/<\/script/gi, '<\\/script')}</script></body></html>`;
    const iframe = document.createElement('iframe');
    iframe.className = 'cwe-ai-frame';
    iframe.title = 'Sandboxed generated element preview';
    iframe.setAttribute('sandbox', 'allow-scripts');
    iframe.referrerPolicy = 'no-referrer';
    iframe.srcdoc = source;
    preview.style.background = '#fff';
    preview.replaceChildren(iframe);
    field('cwe-preview-label').textContent = 'AI Draft Preview · sandboxed';
    field('cwe-preview-help').textContent = 'Sandboxed visual prototype. Scripts cannot access the dashboard or make network requests; changes are not published.';
  }

  async function sendAiMessage() {
    const input = field('cwe-ai-input');
    const content = input.value.trim();
    if (!content) {
      setAiStatus('Describe the element or the change you want.', true);
      return;
    }
    aiMessages.push({ role: 'user', content });
    renderAiMessages();
    input.value = '';
    aiBusy = true;
    const sendButton = field('cwe-ai-send');
    sendButton.disabled = true;
    renderAiFields();
    setAiStatus('Generating a draft…', false);
    try {
      const endpoint = new URL('/ai/draft', PUBLISHER_URL);
      if (endpoint.protocol !== 'https:') throw new Error('The AI endpoint must use HTTPS.');
      const response = await fetch(endpoint.href, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          messages: aiMessages.slice(-8),
          draft: aiDraft || undefined
        })
      });
      let result;
      try {
        result = await response.json();
      } catch {
        throw new Error(`AI endpoint returned an invalid response (${response.status}).`);
      }
      if (!response.ok) throw new Error(result.error || `AI request failed (${response.status}).`);
      const nextDraft = normalizeAiDraft(result.draft);
      if (!result.ok || !nextDraft) throw new Error('AI returned an invalid template draft. Please try again.');
      const previousValues = aiValues;
      aiDraft = nextDraft;
      aiValues = {};
      aiDraft.editableFields.forEach(item => {
        aiValues[item.key] = previousValues[item.key] == null
          ? item.defaultValue
          : normalizedAiValue(item, previousValues[item.key]);
      });
      aiMessages.push({ role: 'assistant', content: nextDraft.assistantMessage });
      renderAiMessages();
      field('cwe-ai-name').value = field('cwe-ai-name').value.trim() || nextDraft.title;
      renderAiFields();
      renderPreview();
      setAiStatus('Draft ready. Refine it in chat or save it as a reusable dashboard template.', false);
    } catch (error) {
      console.error('[custom-web-element] AI draft generation failed:', error);
      setAiStatus(error.message || 'Could not generate a draft. Try again.', true);
    } finally {
      aiBusy = false;
      sendButton.disabled = false;
      renderAiFields();
    }
  }

  async function saveAiTemplate() {
    if (!aiDraft) {
      setAiStatus('Generate a draft before saving it.', true);
      return;
    }
    if (!MTW.db || typeof MTW.setDoc !== 'function' || typeof MTW.doc !== 'function') {
      setAiStatus('Saving is unavailable: dashboard Firestore is not configured.', true);
      return;
    }
    const name = field('cwe-ai-name').value.trim();
    if (!name) {
      setAiStatus('Give this template a name before saving.', true);
      return;
    }
    const button = field('cwe-ai-save');
    const id = activeId || (window.crypto && typeof window.crypto.randomUUID === 'function'
      ? window.crypto.randomUUID()
      : `ai-${Date.now()}-${Math.random().toString(36).slice(2, 9)}`);
    button.disabled = true;
    setAiStatus('Saving reusable template…', false);
    try {
      await MTW.setDoc(MTW.doc(MTW.db, COLLECTION, id), {
        name: name.slice(0, 80),
        templateId: AI_TEMPLATE,
        source: aiDraft,
        settings: aiValues,
        createdBy: sessionStorage.getItem('mtw_admin_name') || 'Admin',
        updatedAt: Date.now()
      }, { merge: true });
      activeId = id;
      try {
        await loadSaved();
      } catch (error) {
        console.error('[custom-web-element] saved template list refresh failed:', error);
      }
      field('cwe-saved').value = id;
      setAiStatus('Saved in the dashboard template library. This prototype has not been published to checkout.', false);
    } catch (error) {
      console.error('[custom-web-element] AI template save failed:', error);
      setAiStatus('Could not save the template. Check your connection and access, then try again.', true);
    } finally {
      button.disabled = false;
    }
  }

  function normalizePrize(prize, index) {
    const fallback = TEMPLATES[WHEEL_TEMPLATE].defaults.prizes[index % 8];
    prize = prize && typeof prize === 'object' ? prize : {};
    return {
      label: String(prize.label || '').slice(0, 32),
      value: String(prize.value || prize.label || '').slice(0, 60),
      code: String(prize.code || '').slice(0, 50),
      chance: Number(prize.chance),
      color: safeColor(prize.color, fallback.color),
      textColor: safeColor(prize.textColor, fallback.textColor)
    };
  }

  function readSettings() {
    const prizes = Array.from(panel.querySelectorAll('.cwe-prize')).map(row => ({
      label: row.querySelector('[data-key="label"]').value.trim(),
      value: row.querySelector('[data-key="label"]').value.trim(),
      code: row.querySelector('[data-key="code"]').value.trim(),
      chance: Number(row.querySelector('[data-key="chance"]').value),
      color: safeColor(row.querySelector('[data-key="color"]').value, '#17171c'),
      textColor: contrastColor(row.querySelector('[data-key="color"]').value)
    }));
    return {
      eyebrow: field('cwe-eyebrow').value.trim(),
      titleTop: field('cwe-title-top').value.trim(),
      titleBottom: field('cwe-title-bottom').value.trim(),
      subtitle: field('cwe-subtitle').value.trim(),
      centreLabel: field('cwe-centre').value.trim(),
      buttonTop: field('cwe-button-top').value.trim(),
      buttonBottom: field('cwe-button-bottom').value.trim(),
      finePrint: field('cwe-fine').value.trim(),
      background: safeColor(field('cwe-background').value, '#07110b'),
      accent: safeColor(field('cwe-accent').value, '#22c55e'),
      dailyLimit: field('cwe-daily').checked,
      logSpins: field('cwe-logging').checked,
      prizes
    };
  }

  function renderPrizeRows() {
    const host = field('cwe-prizes');
    host.innerHTML = settings.prizes.map((prize, index) => `
      <div class="cwe-prize" data-index="${index}">
        <input class="cwe-input" data-key="label" maxlength="32" aria-label="Prize label" value="${esc(prize.label)}">
        <input class="cwe-input cwe-prize-code" data-key="code" maxlength="50" aria-label="Prize code" placeholder="Prize code" value="${esc(prize.code)}">
        <input class="cwe-input" data-key="chance" type="number" min="0" max="100" step="0.1" aria-label="Chance percent" value="${esc(prize.chance)}">
        <input class="cwe-prize-color" data-key="color" type="color" aria-label="Slice colour" value="${safeColor(prize.color, '#17171c')}">
        <button class="cwe-remove" type="button" aria-label="Remove prize" data-remove="${index}">&times;</button>
      </div>
    `).join('');
    host.querySelectorAll('[data-remove]').forEach(button => {
      button.addEventListener('click', () => {
        syncFromInputs();
        settings.prizes.splice(Number(button.dataset.remove), 1);
        renderPrizeRows();
        renderPreview();
        invalidateArtifact();
      });
    });
    host.querySelectorAll('input').forEach(input => {
      input.addEventListener('input', () => {
        syncFromInputs();
        renderPreview();
        invalidateArtifact();
      });
    });
  }

  function syncFromInputs() {
    settings = readSettings();
    const total = settings.prizes.reduce((sum, prize) => sum + (Number.isFinite(prize.chance) ? prize.chance : 0), 0);
    field('cwe-total').textContent = ` — ${total.toFixed(1)}% total`;
    field('cwe-total').style.color = Math.abs(total - 100) < 0.01 ? '#16803c' : '#b42318';
  }

  function renderPreview() {
    const templateId = field('cwe-template').value;
    if (templateId === AI_TEMPLATE) {
      renderAiPreview();
      return;
    }
    if (!templateId) {
      field('cwe-preview').style.background = '#f3f4f6';
      field('cwe-preview-label').textContent = 'Preview';
      field('cwe-preview-help').textContent = 'Select a template to see its preview.';
      field('cwe-preview').innerHTML = '<div class="cwe-small">Choose a template to preview it.</div>';
      return;
    }
    field('cwe-preview-label').textContent = 'Checkout Preview';
    field('cwe-preview-help').textContent = 'Preview is illustrative. The published wheel uses the same settings and the live checkout styles.';
    settings = readSettings();
    const prizes = settings.prizes.length ? settings.prizes : cloneDefaults(WHEEL_TEMPLATE).prizes.slice(0, 1);
    const slice = 360 / prizes.length;
    const stops = prizes.map((prize, index) => {
      const start = index * slice;
      return `${safeColor(prize.color, '#17171c')} ${start}deg ${(index + 1) * slice}deg`;
    }).join(', ');
    const labels = prizes.map((prize, index) => {
      const angle = index * slice + slice / 2;
      return `<span class="cwe-wheel-label" style="color:${safeColor(prize.textColor, '#fff')};transform:rotate(${angle}deg) translateY(-${Math.min(95, 105 - Math.min(40, prizes.length * 2))}px) rotate(-${angle}deg)">${esc(prize.label || 'Prize')}</span>`;
    }).join('');
    field('cwe-preview').style.background = safeColor(settings.background, '#07110b');
    field('cwe-preview').innerHTML = `
      <div class="cwe-preview-eyebrow">${esc(settings.eyebrow || 'Your campaign')}</div>
      <h3>${esc(settings.titleTop || 'YOUR')}<br>${esc(settings.titleBottom || 'WHEEL')}</h3>
      <p class="cwe-preview-subtitle">${esc(settings.subtitle || 'Spin to win')}</p>
      <div class="cwe-wheel"><div class="cwe-wheel-inner" style="background:conic-gradient(${stops})">${labels}</div><div class="cwe-wheel-centre">${esc(settings.centreLabel || 'SPIN')}</div></div>
      <button class="cwe-preview-button" type="button" style="background:${safeColor(settings.accent, '#22c55e')}">${esc(settings.buttonTop || 'SPIN')}<br>${esc(settings.buttonBottom || '')}</button>
      <p class="cwe-preview-fine">${esc(settings.finePrint || '')}</p>
    `;
    syncFromInputs();
  }

  function syncCardHeights() {
    const editor = panel && panel.querySelector('.cwe-editor-card');
    const preview = panel && panel.querySelector('.cwe-preview-card');
    if (!editor || !preview) return;
    if (!window.matchMedia('(min-width: 600px)').matches) {
      editor.classList.remove('cwe-editor-card-collapsed');
      editor.style.height = '';
      return;
    }
    const visibleSections = Array.from(editor.querySelectorAll('.cwe-section'))
      .filter(section => !section.hidden);
    const allCollapsed = visibleSections.length > 0 &&
      visibleSections.every(section => !section.open);
    editor.classList.toggle('cwe-editor-card-collapsed', allCollapsed);
    if (!allCollapsed) {
      editor.style.height = '';
      return;
    }
    const height = preview.getBoundingClientRect().height;
    if (height > 0) editor.style.height = `${Math.round(height)}px`;
  }

  function observeCardHeights() {
    if (panel.dataset.cweCardHeightObserver === 'true') return;
    const preview = panel.querySelector('.cwe-preview-card');
    if (!preview) return;
    const sync = () => window.requestAnimationFrame(syncCardHeights);
    if (typeof ResizeObserver === 'function') {
      const observer = new ResizeObserver(sync);
      observer.observe(preview);
    }
    panel.querySelectorAll('.cwe-section').forEach(section => {
      section.addEventListener('toggle', sync);
    });
    window.addEventListener('resize', sync);
    document.addEventListener('db-tool-open', event => {
      if (event.detail && event.detail.id === TOOL_ID) sync();
    });
    panel.dataset.cweCardHeightObserver = 'true';
    sync();
  }

  function writeSettings(next) {
    settings = Object.assign(cloneDefaults(WHEEL_TEMPLATE), next || {});
    settings.prizes = (Array.isArray(settings.prizes) && settings.prizes.length
      ? settings.prizes
      : cloneDefaults(WHEEL_TEMPLATE).prizes
    ).map(normalizePrize);
    [
      ['cwe-eyebrow', 'eyebrow'],
      ['cwe-title-top', 'titleTop'],
      ['cwe-title-bottom', 'titleBottom'],
      ['cwe-subtitle', 'subtitle'],
      ['cwe-centre', 'centreLabel'],
      ['cwe-button-top', 'buttonTop'],
      ['cwe-button-bottom', 'buttonBottom'],
      ['cwe-fine', 'finePrint'],
      ['cwe-background', 'background'],
      ['cwe-accent', 'accent']
    ].forEach(([id, key]) => { field(id).value = settings[key]; });
    field('cwe-daily').checked = !!settings.dailyLimit;
    field('cwe-logging').checked = !!settings.logSpins;
    renderPrizeRows();
    renderPreview();
  }

  function setTemplateEnabled(templateId) {
    panel.querySelectorAll('.cwe-template-section').forEach(section => {
      const enabled = section.dataset.template === templateId;
      section.hidden = !enabled;
      section.querySelectorAll('input,select,button,textarea').forEach(control => {
        control.disabled = !enabled;
      });
    });
    panel.querySelectorAll('.cwe-wheel-only').forEach(node => {
      node.hidden = templateId !== WHEEL_TEMPLATE;
      node.querySelectorAll('input,select,button').forEach(control => {
        control.disabled = templateId !== WHEEL_TEMPLATE;
      });
    });
    field('cwe-save').disabled = templateId !== WHEEL_TEMPLATE;
    field('cwe-new').disabled = templateId !== WHEEL_TEMPLATE;
    field('cwe-deploy-help').textContent = templateId === AI_TEMPLATE
      ? 'AI-created templates are saved in the dashboard only; generated code is not published or connected to checkout.'
      : 'After the Cloudflare Worker is configured, saving will publish this file automatically. Until then, download it and upload it to GitHub manually. Then add the generated embed code to the checkout page.';
    renderAiFields();
  }

  function validate() {
    const total = settings.prizes.reduce((sum, prize) => sum + prize.chance, 0);
    if (!field('cwe-name').value.trim()) return 'Give this element a name.';
    if (settings.prizes.length < 2) return 'Add at least two prize slices.';
    if (settings.prizes.length > 16) return 'A wheel can have at most 16 slices.';
    if (settings.prizes.some(prize => !prize.label)) return 'Every prize needs a label.';
    if (settings.prizes.some(prize => !Number.isFinite(prize.chance) || prize.chance < 0 || prize.chance > 100)) return 'Chance values must be from 0 to 100.';
    if (Math.abs(total - 100) > 0.01) return `Prize chances must add up to 100% (currently ${total.toFixed(1)}%).`;
    return '';
  }

  function configForEmbed() {
    return {
      id: activeId,
      version: 1,
      ...settings
    };
  }

  function makeSnippet(config) {
    return `<script src="${artifactUrl}"></script>`;
  }

  function prepareArtifact(config) {
    const stableId = String(config.id || '').replace(/[^a-z0-9-]/gi, '').toLowerCase();
    artifactName = `custom-element-${stableId || 'element'}.js`;
    artifactUrl = `https://raw.githack.com/Mikes-Transport/mtw/main/${ELEMENTS_PATH}/${artifactName}`;
    field('cwe-embed').value = makeSnippet(config);
    field('cwe-copy').disabled = false;
    field('cwe-download').disabled = false;
    const publishingHelp = PUBLISHER_URL
      ? 'Saving this element publishes the file through the Cloudflare Worker. Later saves replace the same file, so the embed URL stays the same.'
      : 'After the Cloudflare Worker is configured, saving will publish this file automatically. Until then, download it and upload it manually.';
    field('cwe-deploy-help').innerHTML =
      `${esc(publishingHelp)} File: <code>${ELEMENTS_PATH}/${esc(artifactName)}</code>.<br>` +
      `<a href="${esc(artifactUrl)}" target="_blank" rel="noopener">${esc(artifactUrl)}</a><br>` +
      'Add the embed code above to the checkout page. The RawGit URL serves the committed file.';
  }

  function generatedFile(config) {
    const payload = JSON.stringify(config, null, 2);
    return `/* Generated by MTW Custom Web Element Builder. */\n` +
      `(function () {\n  'use strict';\n` +
      `  var config = ${payload};\n` +
      `  var currentScript = document.currentScript;\n` +
      `  var mount = document.createElement('div');\n` +
      `  mount.id = 'mtw-spin-wheel';\n` +
      `  if (currentScript && currentScript.parentNode) {\n` +
      `    currentScript.parentNode.insertBefore(mount, currentScript.nextSibling);\n` +
      `  } else {\n` +
      `    document.body.appendChild(mount);\n` +
      `  }\n` +
      `  var runtime = document.createElement('script');\n` +
      `  runtime.src = ${JSON.stringify(SPIN_WHEEL_URL)};\n` +
      `  runtime.dataset.mtwConfig = encodeURIComponent(JSON.stringify(config));\n` +
      `  (document.head || document.body).appendChild(runtime);\n` +
      `})();\n`;
  }

  async function publishArtifact(config) {
    let publisherEndpoint;
    try {
      publisherEndpoint = new URL(PUBLISHER_URL);
    } catch {
      throw new Error('The Cloudflare Worker URL is not configured correctly.');
    }
    if (publisherEndpoint.protocol !== 'https:') {
      throw new Error('The Cloudflare Worker must use HTTPS.');
    }
    const response = await fetch(publisherEndpoint.href, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({ id: config.id, config })
    });
    let result;
    try {
      result = await response.json();
    } catch (error) {
      throw new Error(`Publisher returned an invalid response (${response.status}).`);
    }
    if (!response.ok) {
      throw new Error(result.error || `Publisher request failed (${response.status}).`);
    }
    if (!result.ok || result.url !== artifactUrl) {
      throw new Error('Publisher response did not match the generated artifact URL.');
    }
    return result;
  }

  function downloadArtifact() {
    const config = configForEmbed();
    const blob = new Blob([generatedFile(config)], { type: 'text/javascript;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = artifactName;
    document.body.appendChild(link);
    link.click();
    link.remove();
    window.setTimeout(() => URL.revokeObjectURL(url), 1000);
  }

  function invalidateArtifact() {
    if (!activeId) return;
    field('cwe-download').disabled = true;
    field('cwe-copy').disabled = true;
    field('cwe-embed').value = '';
    artifactUrl = '';
    setStatus('You have unsaved changes. Save again to regenerate the deployable file.');
  }

  async function loadSaved() {
    const select = field('cwe-saved');
    select.innerHTML = '<option value="">Choose a saved element</option>';
    if (!MTW.db || typeof MTW.getDocs !== 'function' || typeof MTW.collection !== 'function') {
      throw new Error('Dashboard Firestore is unavailable.');
    }
    const snapshot = await MTW.getDocs(MTW.collection(MTW.db, COLLECTION));
    savedElements = [];
    snapshot.forEach(document => {
      const data = document.data() || {};
      if ((data.templateId === WHEEL_TEMPLATE && data.settings) ||
          (data.templateId === AI_TEMPLATE && data.source)) {
        savedElements.push({ id: document.id, ...data });
      }
    });
    savedElements.sort((a, b) => String(a.name).localeCompare(String(b.name)));
    savedElements.forEach(item => {
      const option = document.createElement('option');
      option.value = item.id;
      option.textContent = item.name || (item.templateId === AI_TEMPLATE ? 'Untitled AI template' : 'Untitled wheel');
      select.appendChild(option);
    });
  }

  async function save() {
    syncFromInputs();
    const error = validate();
    if (error) {
      setStatus(error, true);
      return;
    }

    if (!MTW.db || typeof MTW.setDoc !== 'function' || typeof MTW.doc !== 'function') {
      setStatus('Saving is unavailable: dashboard Firestore is not configured.', true);
      return;
    }
    const button = field('cwe-save');
    const name = field('cwe-name').value.trim();
    const id = activeId || (window.crypto && typeof window.crypto.randomUUID === 'function'
      ? window.crypto.randomUUID()
      : `wheel-${Date.now()}-${Math.random().toString(36).slice(2, 9)}`);
    button.disabled = true;
    setStatus('Saving…');
    try {
      await MTW.setDoc(MTW.doc(MTW.db, COLLECTION, id), {
        name,
        templateId: WHEEL_TEMPLATE,
        settings,
        createdBy: sessionStorage.getItem('mtw_admin_name') || 'Admin',
        updatedAt: Date.now()
      }, { merge: true });
      activeId = id;
      const config = configForEmbed();
      prepareArtifact(config);
      try {
        await loadSaved();
      } catch (error) {
        console.error('[custom-web-element] saved element list refresh failed:', error);
      }
      field('cwe-saved').value = id;
      if (!PUBLISHER_URL) {
        setStatus('Saved in the dashboard. The GitHub publisher is not configured yet; download the JS file to publish it manually.');
      } else {
        try {
          await publishArtifact(config);
          setStatus('Saved and published to GitHub. The embed URL is ready to use.');
        } catch (error) {
          console.error('[custom-web-element] GitHub publish failed:', error);
          setStatus(`Saved in the dashboard, but GitHub publishing failed: ${error.message} You can download the JS file or try saving again.`, true);
        }
      }
    } catch (error) {
      console.error('[custom-web-element] save failed:', error);
      setStatus('Could not save this element. Check your connection and access, then try again.', true);
    } finally {
      button.disabled = false;
    }
  }

  async function loadSelected() {
    const id = field('cwe-saved').value;
    const item = savedElements.find(saved => saved.id === id);
    if (!item) {
      setStatus('Choose a saved element first.', true);
      return;
    }
    activeId = item.id;
    field('cwe-template').value = item.templateId;
    setTemplateEnabled(item.templateId);
    if (item.templateId === AI_TEMPLATE) {
      const draft = normalizeAiDraft(item.source);
      if (!draft) {
        setAiStatus('This saved AI template is invalid and could not be loaded.', true);
        return;
      }
      aiDraft = draft;
      aiValues = {};
      aiDraft.editableFields.forEach(setting => {
        const stored = item.settings && Object.prototype.hasOwnProperty.call(item.settings, setting.key)
          ? item.settings[setting.key]
          : setting.defaultValue;
        aiValues[setting.key] = normalizedAiValue(setting, stored);
      });
      field('cwe-ai-name').value = item.name || draft.title;
      aiMessages = [{ role: 'assistant', content: `Loaded “${item.name || draft.title}”. Change the editable settings or describe a refinement.` }];
      renderAiMessages();
      renderAiFields();
      renderAiPreview();
      setAiStatus('Loaded saved template. Save after changes to update it.', false);
      return;
    }
    aiDraft = undefined;
    aiValues = {};
    aiMessages = [];
    field('cwe-name').value = item.name || 'Untitled wheel';
    try {
      writeSettings(item.settings);
    } catch (error) {
      console.error('[custom-web-element] selected element is invalid:', error);
      setStatus('This saved element has invalid settings and could not be loaded.', true);
      return;
    }
    prepareArtifact(configForEmbed());
    setStatus(`Loaded “${item.name}”. Save after editing to update it.`);
  }

  function wire() {
    panel.querySelectorAll('.cwe-field .cwe-input').forEach(input => {
      if (input.closest('.cwe-prize') || input.id === 'cwe-ai-name') return;
      input.addEventListener('input', () => {
        renderPreview();
        invalidateArtifact();
      });
    });
    field('cwe-name').addEventListener('input', invalidateArtifact);
    field('cwe-ai-name').addEventListener('input', () => {
      if (activeId && field('cwe-template').value === AI_TEMPLATE) {
        setAiStatus('Unsaved template changes.', false);
      }
    });
    field('cwe-template').addEventListener('change', () => {
      activeId = '';
      field('cwe-embed').value = '';
      artifactName = '';
      artifactUrl = '';
      field('cwe-download').disabled = true;
      field('cwe-copy').disabled = true;
      aiDraft = undefined;
      aiValues = {};
      aiMessages = [];
      field('cwe-ai-name').value = '';
      renderAiMessages();
      setTemplateEnabled(field('cwe-template').value);
      if (field('cwe-template').value === WHEEL_TEMPLATE) {
        writeSettings(cloneDefaults(WHEEL_TEMPLATE));
        setStatus('Checkout spin wheel template selected. Customize it, then save.');
      } else if (field('cwe-template').value === AI_TEMPLATE) {
        aiMessages.push({
          role: 'assistant',
          content: 'Describe the element you want to create. I can generate a visual prototype, then you can refine it and save editable settings.'
        });
        renderAiMessages();
        renderPreview();
        setAiStatus('Ready. Stay on Cloudflare Workers Free to keep usage within the no-charge daily limit.', false);
      } else {
        settings = undefined;
        renderPreview();
        setStatus('Choose a template to start.');
      }
    });
    ['cwe-daily', 'cwe-logging'].forEach(id => field(id).addEventListener('change', () => {
      renderPreview();
      invalidateArtifact();
    }));
    field('cwe-add-prize').addEventListener('click', () => {
      syncFromInputs();
      const fallback = TEMPLATES[WHEEL_TEMPLATE].defaults.prizes[settings.prizes.length % 8];
      settings.prizes.push({
        label: 'NEW PRIZE',
        value: 'NEW PRIZE',
        code: '',
        chance: 0,
        color: fallback.color,
        textColor: fallback.textColor
      });
      renderPrizeRows();
      renderPreview();
      invalidateArtifact();
    });
    field('cwe-save').addEventListener('click', save);
    field('cwe-ai-send').addEventListener('click', sendAiMessage);
    field('cwe-ai-input').addEventListener('keydown', event => {
      if (event.key === 'Enter' && !event.shiftKey) {
        event.preventDefault();
        sendAiMessage();
      }
    });
    field('cwe-ai-save').addEventListener('click', saveAiTemplate);
    field('cwe-load').addEventListener('click', () => {
      loadSelected().catch(error => {
        console.error('[custom-web-element] load selected element failed:', error);
        setStatus('Could not load this element.', true);
      });
    });
    field('cwe-new').addEventListener('click', () => {
      activeId = '';
      field('cwe-name').value = 'My checkout wheel';
      field('cwe-template').value = '';
      field('cwe-embed').value = '';
      artifactName = '';
      artifactUrl = '';
      field('cwe-download').disabled = true;
      field('cwe-copy').disabled = true;
      aiDraft = undefined;
      aiValues = {};
      aiMessages = [];
      renderAiMessages();
      renderAiFields();
      setTemplateEnabled('');
      settings = undefined;
      renderPreview();
      setStatus('Choose a template to start a new element.');
    });
    field('cwe-copy').addEventListener('click', async () => {
      try {
        await navigator.clipboard.writeText(field('cwe-embed').value);
        setStatus('Embed code copied.');
      } catch (error) {
        console.error('[custom-web-element] clipboard copy failed:', error);
        setStatus('Could not copy automatically. Select the embed code and copy it manually.', true);
      }
    });
    field('cwe-download').addEventListener('click', downloadArtifact);
    document.addEventListener('db-tool-open', event => {
      if (event.detail && event.detail.id === TOOL_ID) {
        loadSaved().catch(error => {
          console.error('[custom-web-element] load failed:', error);
          setStatus('Could not load saved elements. Check your connection and access.', true);
        });
      }
    });
  }

  function register() {
    const wrapper = document.querySelector('.db-tool-wrapper');
    const firstCard = document.querySelector('.db-list-toolcard');
    if (!wrapper || !firstCard || !firstCard.parentElement) return false;

    panel = document.querySelector('.custom-web-element-panel');
    if (!panel) {
      panel = document.createElement('section');
      panel.className = 'custom-web-element-panel';
      panel.style.display = 'none';
      wrapper.appendChild(panel);
    }

    if (panel.dataset.cweInitialized !== 'true') {
      panel.innerHTML = shell();
      panel.dataset.cweInitialized = 'true';
      style();
      wire();
      settings = undefined;
      setTemplateEnabled('');
      renderPreview();
      observeCardHeights();
    }

    if (!document.querySelector(`.db-list-toolcard[data-select="${TOOL_ID}"]`)) {
      const card = firstCard.cloneNode(true);
      card.removeAttribute('id');
      card.dataset.select = TOOL_ID;
      card.style.display = '';
      card.style.cursor = 'pointer';
      card.setAttribute('role', 'button');
      card.setAttribute('tabindex', '0');
      card.setAttribute('aria-label', 'Custom Web Element Builder');
      card.textContent = 'Custom Web Element Builder';
      const open = () => {
        if (typeof window.openDBTool === 'function') {
          window.openDBTool(TOOL_ID);
        } else {
          wrapper.style.display = 'block';
          panel.style.display = 'block';
        }
      };
      card.addEventListener('click', open);
      card.addEventListener('keydown', event => {
        if (event.key === 'Enter' || event.key === ' ') {
          event.preventDefault();
          open();
        }
      });
      firstCard.parentElement.appendChild(card);
    }
    return true;
  }

  function init() {
    if (register()) return;
    const observer = new MutationObserver(() => {
      if (register()) observer.disconnect();
    });
    observer.observe(document.body, { childList: true, subtree: true });
    window.setTimeout(() => {
      observer.disconnect();
      if (!document.querySelector('.custom-web-element-panel')) {
        console.error('[custom-web-element] dashboard tool shell was not found; expected .db-tool-wrapper and .db-list-toolcard.');
      }
    }, 10000);
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init, { once: true });
  } else {
    init();
  }
})();
