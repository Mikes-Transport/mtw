console.log("MTW SPIN WHEEL CHANCE VERSION 33");

'use strict';

(function () {

  const currentScript = document.currentScript;
  const root = document.getElementById("mtw-spin-wheel");

  if (!root) return;

  let customConfig = null;
  const encodedConfig = currentScript && currentScript.dataset
    ? currentScript.dataset.mtwConfig
    : "";

  if (encodedConfig) {
    try {
      customConfig = JSON.parse(decodeURIComponent(encodedConfig));
      if (
        !customConfig ||
        customConfig.version !== 1 ||
        !/^[a-z0-9-]{1,80}$/i.test(String(customConfig.id || "")) ||
        !Array.isArray(customConfig.prizes) ||
        customConfig.prizes.length < 2 ||
        customConfig.prizes.length > 16
      ) {
        throw new Error("Unsupported or invalid wheel configuration.");
      }
      const totalChance = customConfig.prizes.reduce(function (total, prize) {
        const chance = Number(prize && prize.chance);
        if (!prize || !String(prize.label || "").trim() || !Number.isFinite(chance) || chance < 0 || chance > 100) {
          throw new Error("A prize label or chance value is invalid.");
        }
        return total + chance;
      }, 0);
      if (Math.abs(totalChance - 100) > 0.01) {
        throw new Error("Prize chances must add up to 100%.");
      }
    } catch (error) {
      console.error("[mtw-spin-wheel] custom configuration is invalid:", error);
      root.textContent = "This checkout wheel could not be loaded. Please contact the site administrator.";
      return;
    }
  }

  function safeColor(value, fallback) {
    return /^#[0-9a-f]{6}$/i.test(String(value || ""))
      ? value
      : fallback;
  }

  function escapeHTML(value) {
    return String(value == null ? "" : value)
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;")
      .replace(/'/g, "&#39;");
  }

  const defaultRewards = [
    { label: "NO PRIZE", value: "NO PRIZE", code: null, chance: "8.0%" },
    { label: "x2 AIR FRESHENERS", value: "X2 AIR FRESHENERS", code: "SPIN-AIRFRESHENER", chance: "20.0%" },
    { label: "X1 MTW COFFEE MUG", value: "X1 MTW COFFEE MUG", code: "SPIN-TWMUG", chance: "12.5%" },
    { label: "X1 RANDOM EXTE MERCH", value: "X1 EXTE MERCH", code: "SPIN-EXTE", chance: "2.0%" },
    { label: "X1 MYSTERY GIFT", value: "X1 MYSTERY GIFT", code: "SPIN-MYSTERY", chance: "2.0%" },
    { label: "X1 WICKED PACK", value: "X1 WICKED PACK", code: "SPIN-WICKED", chance: "22.0%" },
    { label: "X1 RANDOM SNACK", value: "X1 RANDOM SNACK", code: "SPIN-SNACK", chance: "22.0%" },
    { label: "X1 WC COFFEE MUG", value: "X1 WC COFFEE MUG", code: "SPIN-WCMUG", chance: "11.5%" }
  ];

  const defaultColours = [
    "#17171c",
    "#ffd21f",
    "#2563eb",
    "#9333ea",
    "#22c55e",
    "#ef2b2b",
    "#ff8a00",
    "#f1f1f4"
  ];

  const defaultTextColours = [
    "#ffffff",
    "#26262b",
    "#ffffff",
    "#ffffff",
    "#ffffff",
    "#ffffff",
    "#ffffff",
    "#26262b"
  ];

  const rewards = customConfig
    ? customConfig.prizes.map(function (prize) {
      const chance = Number(prize.chance);
      return {
        label: String(prize.label || "").slice(0, 32),
        value: String(prize.value || prize.label || "").slice(0, 60),
        code: String(prize.code || "").slice(0, 50) || null,
        chance: Number.isFinite(chance) && chance > 0 ? String(chance) : "0"
      };
    })
    : defaultRewards;

  if (customConfig && rewards.some(reward => !reward.label || Number(reward.chance) < 0)) {
    console.error("[mtw-spin-wheel] custom configuration contains an invalid prize.");
    root.textContent = "This checkout wheel has invalid prize settings. Please contact the site administrator.";
    return;
  }

  const colours = customConfig
    ? customConfig.prizes.map((prize, index) => safeColor(prize.color, defaultColours[index % defaultColours.length]))
    : defaultColours;

  const TEXT_COLOURS = customConfig
    ? customConfig.prizes.map((prize, index) => safeColor(prize.textColor, defaultTextColours[index % defaultTextColours.length]))
    : defaultTextColours;

  const appearance = customConfig || {};
  const elementId = customConfig && /^[a-z0-9-]{1,80}$/i.test(String(customConfig.id || ""))
    ? String(customConfig.id)
    : "";
  const dailyLimit = customConfig
    ? customConfig.dailyLimit !== false
    : true;
  const logSpins = customConfig
    ? customConfig.logSpins !== false
    : true;

  let currentRotation = 0;
  let spinning = false;

  /*
   * CHANCE SYSTEM
   *
   * Each reward can have a chance such as:
   *
   * chance: "20%"
   * chance: "50%"
   * chance: "5%"
   *
   * The total should equal 100%.
   */

  function getWeightedWinner() {

    const totalChance =
      rewards.reduce(
        (total, reward) => {

          const chance =
            parseFloat(
              String(reward.chance)
                .replace("%", "")
            ) || 0;

          return total + chance;

        },
        0
      );

    if (totalChance <= 0) {

      console.error(
        "MTW Spin Wheel: No valid reward chances found."
      );

      return 0;
    }

    const random =
      Math.random() * totalChance;

    let cumulativeChance = 0;

    for (
      let i = 0;
      i < rewards.length;
      i++
    ) {

      const chance =
        parseFloat(
          String(rewards[i].chance)
            .replace("%", "")
        ) || 0;

      cumulativeChance += chance;

      if (random < cumulativeChance) {
        return i;
      }

    }

    return rewards.length - 1;
  }

  const slice =
    360 / rewards.length;

  const gradientStops =
    rewards.map((_, i) => {

      const start =
        i * slice;

      const end =
        (i + 1) * slice;

      return `${colours[i % colours.length]} ${start}deg ${end}deg`;

    }).join(", ");

  /*
   * Build the outer bulbs.
   */

  const lights =
    Array.from(
      { length: 32 },
      (_, i) => {

        const angle =
          i * (360 / 32) - 90;

        const radius = 47;

        const x =
          50 +
          Math.cos(
            angle * Math.PI / 180
          ) * radius;

        const y =
          50 +
          Math.sin(
            angle * Math.PI / 180
          ) * radius;

        return `
          <span
            style="
              left:${x}%;
              top:${y}%;
              --mtw-spin-light:${i};
            "
          ></span>
        `;

      }
    ).join("");

  /*
   * Position each label from the
   * centre angle of its slice.
   */

  const labels =
    rewards.map(
      (reward, i) => {

        const centre =
          i * slice +
          slice / 2;

        return `
          <div
            class="mtw-label"
            style="--mtw-spin-angle:${centre}deg;"
          >
            <span${TEXT_COLOURS[i] === '#ffffff' ? '' : ' class="mtw-dk"'} style="color:${TEXT_COLOURS[i]};">${escapeHTML(reward.label)}</span>
          </div>
        `;

      }
    ).join("");

  /*
   * Thin gold dividers between slices,
   * drawn as a conic overlay.
   */

  const dividerStops =
    `rgba(255,255,255,.9) 0deg 1.5deg, ` +
    `rgba(255,255,255,0) 1.5deg ${slice}deg`;

  root.innerHTML = `
    <div class="mtw-spin-wrap">

      <div class="mtw-head">

        <div class="mtw-eyebrow">${escapeHTML(appearance.eyebrow || '★ MTW · Checkout game ★')}</div>

        <h2 class="mtw-title">
          <span class="mtw-title-top">${escapeHTML(appearance.titleTop || 'MYSTERY')}</span>
          <span class="mtw-title-grad">${escapeHTML(appearance.titleBottom || 'GIVEAWAY')}</span>
        </h2>

        <p class="mtw-sub">${escapeHTML(appearance.subtitle || 'Spin the wheel · win prizes')}</p>

      </div>

      <div class="mtw-wheel-col">

        <div class="mtw-floor"></div>

        <div class="mtw-wheel-stage">

        <div class="mtw-stage-glow"></div>

        <div class="mtw-wheel-shadow"></div>

        <div class="mtw-rim"></div>

        <div class="mtw-rim-sheen"></div>

        <div class="mtw-light-ring">
          ${lights}
        </div>

        <div class="mtw-pointer">
          <div class="mtw-pointer-glow"></div>
        </div>

        <div
          class="mtw-wheel"
          id="mtw-wheel"
          style="
            --mtw-wheel-gradient:
              conic-gradient(
                from 0deg,
                ${gradientStops}
              );
          "
        >

          <div
            class="mtw-slice-lines"
            style="
              background:
                repeating-conic-gradient(
                  from 0deg,
                  ${dividerStops}
                );
            "
          ></div>

          <div class="mtw-depth"></div>

          <div class="mtw-labels">
            ${labels}
          </div>

          <div class="mtw-sheen"></div>

          <div
            class="mtw-wheel-centre"
            role="button"
            tabindex="0"
            title="Spin the wheel"
          >

            <div class="mtw-centre-ring"></div>

            <span>${escapeHTML(appearance.centreLabel || 'SPIN')}</span>

          </div>

          <div class="mtw-hub-orbit"></div>

        </div>

        </div>

      </div>

      <div class="mtw-panel">

        <div
          class="mtw-spin-status"
          id="mtw-spin-status"
        ></div>

        <button
          type="button"
          class="mtw-spin-button"
          id="mtw-spin-button"
        >
          <span class="mtw-button-top">
            ${escapeHTML(appearance.buttonTop || 'SPIN THE WHEEL')}
          </span>

          <span class="mtw-button-bottom">
            ${escapeHTML(appearance.buttonBottom || 'WIN SOMETHING!')}
          </span>
        </button>

        <p class="mtw-fine">${escapeHTML(appearance.finePrint || 'Get what you get · no returns or substitutions')}</p>

      </div>

    </div>
  `;

  const style =
    document.createElement("style");

  style.textContent = `#mtw-spin-wheel{
    width: 100% !important;
    margin: 0 auto !important;
    font-family: inherit !important;
    box-sizing: border-box !important;
}
#mtw-spin-wheel *,
#mtw-spin-wheel *::before,
#mtw-spin-wheel *::after{
    box-sizing: border-box !important;
}
#mtw-spin-wheel .mtw-spin-wrap{
    width: 100% !important;
    max-width: 940px !important;
    margin: 0 auto !important;
    position: relative !important;
    overflow: hidden !important;
    display: grid !important;
    grid-template-columns: 300px minmax(0, 1fr) !important;
    grid-template-areas: "head wheel" "panel wheel" !important;
    gap: 18px 40px !important;
    align-items: center !important;
    padding: 34px 38px !important;
    background: radial-gradient(circle at 82% 16%, #123a22 0%, rgba(18,58,34,0) 55%), radial-gradient(circle at 8% 92%, #0d2318 0%, rgba(13,35,24,0) 60%), linear-gradient(160deg, #0a1510 0%, #05080a 100%) ;
    border: 1px solid rgba(255,255,255,.10) !important;
    border-radius: 22px !important;
    box-shadow: 0 24px 60px rgba(0,0,0,.5), inset 0 1px 0 rgba(255,255,255,.08) ;
}
#mtw-spin-wheel .mtw-spin-wrap::before{
    content: "" !important;
    position: absolute !important;
    inset: 0 !important;
    pointer-events: none !important;
    background-image: linear-gradient(rgba(110,231,160,.10) 1px, transparent 1px), linear-gradient(90deg, rgba(110,231,160,.10) 1px, transparent 1px) !important;
    background-size: 44px 44px !important;
    -webkit-mask-image: radial-gradient(circle at 70% 40%, rgba(0,0,0,.9) 0%, rgba(0,0,0,0) 75%) !important;
    mask-image: radial-gradient(circle at 70% 40%, rgba(0,0,0,.9) 0%, rgba(0,0,0,0) 75%) !important;
}
#mtw-spin-wheel .mtw-head{
    grid-area: head !important;
    position: relative !important;
    z-index: 2 !important;
    text-align: left !important;
}
#mtw-spin-wheel .mtw-panel{
    grid-area: panel !important;
    position: relative !important;
    z-index: 2 !important;
    text-align: left !important;
    min-width: 0 !important;
}
#mtw-spin-wheel .mtw-wheel-col{
    grid-area: wheel !important;
    position: relative !important;
    z-index: 1 !important;
    display: flex !important;
    justify-content: center !important;
    min-width: 0 !important;
}
#mtw-spin-wheel .mtw-eyebrow{
    font-size: 11px !important;
    font-weight: 800 !important;
    letter-spacing: 3px !important;
    text-transform: uppercase !important;
    color: #8fe3ae !important;
    margin: 0 0 12px !important;
}
#mtw-spin-wheel .mtw-title{
    margin: 0 0 10px !important;
    font-weight: 1000 !important;
    line-height: .95 !important;
    font-size: clamp(30px, 4vw, 44px) !important;
    letter-spacing: .5px !important;
}
#mtw-spin-wheel .mtw-title-top{
    display: block !important;
    color: #ffffff !important;
}
#mtw-spin-wheel .mtw-title-grad{
    display: block !important;
    background: linear-gradient(90deg, #f6d365 0%, #fff3c4 100%) ;
    -webkit-background-clip: text !important;
    background-clip: text !important;
    color: transparent !important;
}
#mtw-spin-wheel .mtw-sub{
    margin: 0 !important;
    font-size: 12px !important;
    font-weight: 700 !important;
    letter-spacing: 2.5px !important;
    text-transform: uppercase !important;
    color: rgba(255,255,255,.55) !important;
}
/* =========================================
   WHEEL STAGE
========================================= */
#mtw-spin-wheel .mtw-floor{
    position: absolute !important;
    left: 50% !important;
    bottom: 2% !important;
    width: 86% !important;
    height: 54px !important;
    transform: translateX(-50%) ;
    border: 2px solid rgba(101,183,70,.45) !important;
    border-top: 0 !important;
    border-left: 0 !important;
    border-right: 0 !important;
    border-radius: 50% !important;
    box-shadow: 0 0 34px rgba(101,183,70,.35), inset 0 -14px 26px rgba(101,183,70,.22) ;
    z-index: 0 !important;
    pointer-events: none !important;
}
#mtw-spin-wheel .mtw-wheel-stage{
    position: relative !important;
    width: min(80vw, 430px) !important;
    height: min(80vw, 430px) !important;
    display: flex !important;
    align-items: center !important;
    justify-content: center !important;
    z-index: 1 !important;
}
#mtw-spin-wheel .mtw-stage-glow{
    position: absolute !important;
    inset: -10% !important;
    border-radius: 50% !important;
    background: radial-gradient(circle, rgba(101,183,70,.28) 0%, rgba(101,183,70,.10) 45%, rgba(0,0,0,0) 70%) ;
    filter: blur(10px) !important;
    z-index: 0 !important;
    pointer-events: none !important;
}
#mtw-spin-wheel .mtw-wheel-shadow{
    position: absolute !important;
    width: 82% !important;
    height: 82% !important;
    border-radius: 50% !important;
    background: rgba(0,0,0,.55) ;
    filter: blur(18px) !important;
    transform: translateY(18px) ;
    z-index: 0 !important;
}
/* =========================================
   WHITE LED RIM
========================================= */
#mtw-spin-wheel .mtw-rim{
    position: absolute !important;
    width: 97% !important;
    height: 97% !important;
    border-radius: 50% !important;
    z-index: 2 !important;
    background: conic-gradient(from 200deg, #1c222c 0%, #4a5568 12%, #232a36 30%, #5a6579 45%, #1c222c 60%, #414b5c 75%, #232a36 90%, #1c222c 100%) ;
    box-shadow: 0 10px 30px rgba(0,0,0,.55), 0 0 44px rgba(96,165,250,.25), inset 0 2px 6px rgba(255,255,255,.35), inset 0 -6px 12px rgba(0,0,0,.7) ;
}
#mtw-spin-wheel .mtw-rim-sheen{
    position: absolute !important;
    width: 97% !important;
    height: 97% !important;
    left: 50% !important;
    top: 50% !important;
    transform: translate(-50%, -50%) ;
    border-radius: 50% !important;
    z-index: 2 !important;
    pointer-events: none !important;
    background: conic-gradient(from 0deg, rgba(255,255,255,0) 0deg, rgba(255,255,255,.45) 14deg, rgba(255,255,255,0) 34deg, rgba(255,255,255,0) 180deg, rgba(255,255,255,.28) 196deg, rgba(255,255,255,0) 218deg) ;
    animation: mtwRimSweep 7s linear infinite !important;
}
@keyframes mtwRimSweep{
    from{
        transform: translate(-50%, -50%) rotate(0deg) ;
    }
    to{
        transform: translate(-50%, -50%) rotate(360deg) ;
    }
}
/* =========================================
   OUTER LIGHTS
========================================= */
#mtw-spin-wheel .mtw-light-ring{
    position: absolute !important;
    inset: 0 !important;
    z-index: 10 !important;
    pointer-events: none !important;
    border-radius: 50% !important;
}
#mtw-spin-wheel .mtw-light-ring span{
    position: absolute !important;
    width: 12px !important;
    height: 12px !important;
    border-radius: 50% !important;
    background: #eaf6ff ;
    box-shadow: 0 0 5px #ffffff, 0 0 12px #7dd3fc, 0 0 24px rgba(56,189,248,.9) ;
    transform: translate(-50%, -50%) scale(.85) ;
    animation: mtwBulbIdle 1.1s infinite alternate !important;
    animation-delay: calc(var(--mtw-spin-light) * -.035s) !important;
}
@keyframes mtwBulbIdle{
    0%{
        opacity: .45 ;
        transform: translate(-50%, -50%) scale(.78) ;
    }
    100%{
        opacity: 1 ;
        transform: translate(-50%, -50%) scale(1) ;
    }
}
#mtw-spin-wheel .mtw-wheel-stage.mtw-spinning .mtw-light-ring span{
    animation: mtwBulbSpin .16s infinite alternate !important;
}
@keyframes mtwBulbSpin{
    0%{
        opacity: .3 ;
        background: #38bdf8 ;
        box-shadow: 0 0 4px #38bdf8, 0 0 10px #0369a1 ;
    }
    100%{
        opacity: 1 ;
        background: #ffffff ;
        box-shadow: 0 0 7px #ffffff, 0 0 18px #7dd3fc, 0 0 32px rgba(56,189,248,.95) ;
    }
}
/* =========================================
   WHEEL
========================================= */
#mtw-spin-wheel .mtw-wheel{
    position: relative !important;
    width: 88% !important;
    height: 88% !important;
    border-radius: 50% !important;
    overflow: hidden !important;
    z-index: 3 !important;
    border: 6px solid #eef1f6 !important;
    background: var(--mtw-wheel-gradient) ;
    box-shadow: 0 0 0 2px rgba(255,255,255,.8), 0 14px 30px rgba(0,0,0,.5), inset 0 0 40px rgba(0,0,0,.35) ;
    transform: rotate(0deg) ;
    transition: transform 4.1s cubic-bezier(.08,.78,.12,1) !important;
    will-change: transform !important;
}
#mtw-spin-wheel .mtw-slice-lines{
    position: absolute !important;
    inset: 0 !important;
    border-radius: 50% !important;
    z-index: 5 !important;
    pointer-events: none !important;
}
#mtw-spin-wheel .mtw-depth{
    position: absolute !important;
    inset: 0 !important;
    border-radius: 50% !important;
    z-index: 6 !important;
    pointer-events: none !important;
    background: radial-gradient(circle, rgba(0,0,0,0) 58%, rgba(0,0,0,.28) 100%) ;
}
#mtw-spin-wheel .mtw-wheel::after{
    content: "" !important;
    position: absolute !important;
    inset: 0 !important;
    border-radius: 50% !important;
    background: linear-gradient(125deg, rgba(255,255,255,.20) 0%, rgba(255,255,255,.07) 18%, rgba(255,255,255,0) 42%) ;
    pointer-events: none !important;
    z-index: 8 !important;
}
#mtw-spin-wheel .mtw-sheen{
    position: absolute !important;
    inset: 0 !important;
    border-radius: 50% !important;
    z-index: 7 !important;
    pointer-events: none !important;
    background: conic-gradient(from 0deg, rgba(255,255,255,0) 0deg, rgba(255,255,255,.10) 24deg, rgba(255,255,255,0) 70deg, rgba(255,255,255,0) 180deg, rgba(255,255,255,.07) 205deg, rgba(255,255,255,0) 250deg) ;
    animation: mtwSheenSpin 16s linear infinite !important;
}
@keyframes mtwSheenSpin{
    from{
        transform: rotate(0deg) ;
    }
    to{
        transform: rotate(360deg) ;
    }
}
/* =========================================
   LABELS
========================================= */
#mtw-spin-wheel .mtw-labels{
    position: absolute !important;
    inset: 0 !important;
    z-index: 6 !important;
    pointer-events: none !important;
}
#mtw-spin-wheel .mtw-label{
    position: absolute !important;
    left: 50% !important;
    top: 50% !important;
    width: 100% !important;
    height: 100% !important;
    transform: translate(-50%, -50%) rotate(var(--mtw-spin-angle)) ;
    transform-origin: center center !important;
    pointer-events: none !important;
}
#mtw-spin-wheel .mtw-label span{
    position: absolute !important;
    left: 50% !important;
    top: 12% !important;
    width: 28% !important;
    transform: translateX(-50%) rotate(90deg) ;
    text-align: center !important;
    font-size: clamp(13px, 2.6vw, 17px) !important;
    font-weight: 1000 !important;
    line-height: 1.05 !important;
    letter-spacing: .5px !important;
    color: #ffffff !important;
    text-shadow: 0 2px 3px rgba(0,0,0,.55), 0 0 2px rgba(0,0,0,.6) !important;
    white-space: normal !important;
}
#mtw-spin-wheel .mtw-label span.mtw-dk{
    color: #23232a !important;
    text-shadow: 0 1px 0 rgba(255,255,255,.55) !important;
}
/* =========================================
   CENTRE HUB
========================================= */
#mtw-spin-wheel .mtw-wheel-centre{
    position: absolute !important;
    z-index: 12 !important;
    top: 50% !important;
    left: 50% !important;
    width: 124px !important;
    height: 124px !important;
    transform: translate(-50%, -50%) ;
    border-radius: 50% !important;
    background: radial-gradient(circle at 35% 30%, #3d4453 0%, #1a1e26 55%, #0b0d12 100%) ;
    border: 5px solid #f6d365 !important;
    display: flex !important;
    align-items: center !important;
    justify-content: center !important;
    cursor: pointer !important;
    box-shadow: 0 4px 10px rgba(0,0,0,.5), 0 0 14px rgba(246,211,101,.35), inset 0 2px 5px rgba(255,255,255,.15) ;
    animation: mtwHubGlow 3s ease-in-out infinite !important;
}
@keyframes mtwHubGlow{
    0%{
        box-shadow: 0 4px 10px rgba(0,0,0,.5), 0 0 14px rgba(246,211,101,.35), inset 0 2px 5px rgba(255,255,255,.15) ;
    }
    50%{
        box-shadow: 0 4px 10px rgba(0,0,0,.5), 0 0 34px rgba(246,211,101,.65), inset 0 2px 5px rgba(255,255,255,.15) ;
    }
    100%{
        box-shadow: 0 4px 10px rgba(0,0,0,.5), 0 0 14px rgba(246,211,101,.35), inset 0 2px 5px rgba(255,255,255,.15) ;
    }
}
#mtw-spin-wheel .mtw-wheel-centre:hover{
    filter: brightness(1.08) !important;
}
#mtw-spin-wheel .mtw-wheel-centre.is-locked,
#mtw-spin-wheel .mtw-wheel-centre.is-locked:hover{
    cursor: not-allowed !important;
    filter: grayscale(.4) brightness(.85) !important;
}
#mtw-spin-wheel .mtw-wheel-centre:focus-visible{
    outline: 2px solid #ffffff !important;
    outline-offset: 3px !important;
}
#mtw-spin-wheel .mtw-wheel-stage.mtw-spinning .mtw-wheel-centre{
    animation: mtwCentrePulse .45s infinite alternate !important;
}
@keyframes mtwCentrePulse{
    from{
        transform: translate(-50%, -50%) scale(1) ;
    }
    to{
        transform: translate(-50%, -50%) scale(1.07) ;
    }
}
#mtw-spin-wheel .mtw-centre-ring{
    position: absolute !important;
    inset: 8px !important;
    border-radius: 50% !important;
    border: 2px solid rgba(246,211,101,.4) !important;
}
#mtw-spin-wheel .mtw-hub-orbit{
    position: absolute !important;
    width: 152px !important;
    height: 152px !important;
    left: 50% !important;
    top: 50% !important;
    transform: translate(-50%, -50%) ;
    border-radius: 50% !important;
    border: 2px dashed rgba(246,211,101,.65) !important;
    z-index: 11 !important;
    pointer-events: none !important;
    animation: mtwOrbitSpin 14s linear infinite !important;
}
@keyframes mtwOrbitSpin{
    from{
        transform: translate(-50%, -50%) rotate(0deg) ;
    }
    to{
        transform: translate(-50%, -50%) rotate(360deg) ;
    }
}
#mtw-spin-wheel .mtw-wheel-centre span{
    position: relative !important;
    z-index: 2 !important;
    font-size: 20px !important;
    font-weight: 1000 !important;
    letter-spacing: .8px !important;
    color: #f6d365 !important;
    text-shadow: 0 0 12px rgba(246,211,101,.7) !important;
}
/* =========================================
   POINTER
========================================= */
#mtw-spin-wheel .mtw-pointer{
    position: absolute !important;
    z-index: 20 !important;
    top: -3px !important;
    left: 50% !important;
    transform: translateX(-50%) ;
    transform-origin: 50% 0 !important;
    width: 0 !important;
    height: 0 !important;
    border-left: 26px solid transparent !important;
    border-right: 26px solid transparent !important;
    border-top: 54px solid #f6d365 !important;
    filter: drop-shadow(0 4px 3px rgba(0,0,0,.45)) drop-shadow(0 0 12px rgba(246,211,101,.65)) !important;
}
#mtw-spin-wheel .mtw-pointer::after{
    content: "" !important;
    position: absolute !important;
    left: -15px !important;
    top: -49px !important;
    width: 30px !important;
    height: 40px !important;
    clip-path: polygon(50% 100%, 0 0, 100% 0) !important;
    background: #fff3c4 ;
    filter: drop-shadow(0 0 7px rgba(255,243,196,.9)) !important;
}
#mtw-spin-wheel .mtw-pointer-glow{
    position: absolute !important;
    width: 70px !important;
    height: 70px !important;
    left: -35px !important;
    top: -24px !important;
    border-radius: 50% !important;
    background: rgba(246,211,101,.25) ;
    filter: blur(15px) !important;
}
/* =========================================
   RESULTS + BUTTON + FINE PRINT
========================================= */
#mtw-spin-wheel .mtw-spin-status{
    min-height: 78px !important;
    margin: 18px 0 !important;
    padding: 14px 16px !important;
    border: 1px dashed rgba(255,255,255,.28) !important;
    border-radius: 12px !important;
    background: rgba(255,255,255,.05) ;
    font-size: clamp(16px, 2.4vw, 22px) !important;
    font-weight: 1000 !important;
    letter-spacing: .3px !important;
    color: #e8eaed !important;
}
#mtw-spin-wheel .mtw-spin-status:empty::before{
    content: "Your prize will appear here..." !important;
    font-size: 13px !important;
    font-weight: 600 !important;
    color: rgba(255,255,255,.45) !important;
}
#mtw-spin-wheel .mtw-spin-status.mtw-win{
    color: #7cf29b !important;
    border-style: solid !important;
    border-color: rgba(124,242,155,.55) !important;
    background: rgba(124,242,155,.08) ;
    text-shadow: 0 0 18px rgba(101,183,70,.5) !important;
    animation: mtwWinReveal .6s ease both !important;
}
#mtw-spin-wheel .mtw-spin-status.mtw-try-again{
    color: #e8eaed !important;
    border-style: solid !important;
    border-color: rgba(255,255,255,.35) !important;
    animation: mtwResultReveal .5s ease both !important;
}
@keyframes mtwWinReveal{
    0%{
        opacity: 0 ;
        transform: scale(.5) ;
    }
    60%{
        opacity: 1 ;
        transform: scale(1.15) ;
    }
    100%{
        transform: scale(1) ;
    }
}
@keyframes mtwResultReveal{
    0%{
        opacity: 0 ;
        transform: translateY(10px) ;
    }
    100%{
        opacity: 1 ;
        transform: translateY(0) ;
    }
}
#mtw-spin-wheel .mtw-spin-button{
    appearance: none !important;
    border: 0 !important;
    position: relative !important;
    width: 100% !important;
    padding: 18px 20px !important;
    border-radius: 14px !important;
    background: linear-gradient(180deg, #78ca59 0%, #65b746 48%, #4b9b32 100%) ;
    color: #ffffff !important;
    font-family: inherit !important;
    cursor: pointer !important;
    overflow: hidden !important;
    touch-action: manipulation !important;
    -webkit-tap-highlight-color: transparent !important;
    box-shadow: 0 5px 0 #377c24, 0 8px 20px rgba(0,0,0,.35), 0 0 22px rgba(101,183,70,.35) ;
    transition: transform .15s ease, box-shadow .15s ease, filter .15s ease !important;
}
#mtw-spin-wheel .mtw-spin-button:hover:not(:disabled){
    transform: translateY(-2px) ;
    box-shadow: 0 7px 0 #377c24, 0 12px 25px rgba(0,0,0,.35), 0 0 30px rgba(101,183,70,.55) ;
    filter: brightness(1.08) !important;
}
#mtw-spin-wheel .mtw-spin-button:active:not(:disabled){
    transform: translateY(3px) ;
    box-shadow: 0 2px 0 #377c24, 0 5px 12px rgba(0,0,0,.25) ;
}
#mtw-spin-wheel .mtw-spin-button:disabled{
    opacity: .65 ;
    cursor: not-allowed !important;
    transform: none ;
}
#mtw-spin-wheel .mtw-spin-button::after{
    content: "" !important;
    position: absolute !important;
    top: 0 !important;
    bottom: 0 !important;
    left: -70% ;
    width: 45% !important;
    background: linear-gradient(105deg, rgba(255,255,255,0) 0%, rgba(255,255,255,.4) 50%, rgba(255,255,255,0) 100%) ;
    transform: skewX(-20deg) ;
    pointer-events: none !important;
    animation: mtwButtonSheen 3.6s ease-in-out infinite !important;
}
@keyframes mtwButtonSheen{
    0%{
        left: -70% ;
    }
    55%{
        left: 135% ;
    }
    100%{
        left: 135% ;
    }
}
#mtw-spin-wheel .mtw-spin-button:disabled::after{
    display: none !important;
}
#mtw-spin-wheel .mtw-button-top{
    display: block !important;
    font-size: 18px !important;
    font-weight: 1000 !important;
    letter-spacing: .4px !important;
}
#mtw-spin-wheel .mtw-button-bottom{
    display: block !important;
    margin-top: 2px !important;
    font-size: 11px !important;
    font-weight: 700 !important;
    opacity: .9 ;
    letter-spacing: 1px !important;
}
#mtw-spin-wheel .mtw-fine{
    margin: 14px 0 0 !important;
    font-size: 10.5px !important;
    font-weight: 700 !important;
    letter-spacing: 1.5px !important;
    text-transform: uppercase !important;
    color: rgba(255,255,255,.45) !important;
}
#mtw-spin-wheel .mtw-spin-wrap.mtw-is-locked{
    display: flex !important;
    flex-direction: column !important;
    align-items: center !important;
    justify-content: center !important;
    text-align: center !important;
    min-height: 340px !important;
    padding: 34px 24px !important;
}
#mtw-spin-wheel .mtw-locked-inner{
    width: 100% !important;
    max-width: 430px !important;
    margin: 0 auto !important;
    display: flex;
    flex-direction: column;
    align-items: center;
}

#mtw-spin-wheel .mtw-timer{
    font-size: clamp(34px, 5vw, 52px) !important;
    font-weight: 1000 !important;
    letter-spacing: 3px !important;
    color: #f6d365 !important;
    text-shadow: 0 0 22px rgba(246,211,101,.5) !important;
    margin: 40px 0 40px !important;
    font-variant-numeric: tabular-nums !important;
}
/* =========================================
   WINNER LIGHTS
========================================= */
#mtw-spin-wheel .mtw-wheel-stage.mtw-winner .mtw-light-ring span{
    animation: mtwWinnerLights .22s infinite alternate !important;
}
#mtw-spin-wheel .mtw-wheel-stage.mtw-winner .mtw-wheel{
    box-shadow: 0 0 0 2px rgba(255,255,255,.3), 0 0 20px rgba(101,183,70,.6), 0 0 55px rgba(101,183,70,.3), inset 0 0 30px rgba(0,0,0,.65) ;
}
@keyframes mtwWinnerLights{
    0%{
        opacity: 1 ;
        background: #ffffff ;
        transform: translate(-50%, -50%) scale(1.15) ;
        box-shadow: 0 0 10px #ffffff, 0 0 26px rgba(255,255,255,.9) ;
    }
    100%{
        opacity: 1 ;
        background: #ffffff ;
        transform: translate(-50%, -50%) scale(1.6) ;
        box-shadow: 0 0 14px #ffffff, 0 0 42px rgba(255,255,255,.95) ;
    }
}
/* =========================================
   CONFETTI
========================================= */
#mtw-spin-wheel .mtw-confetti-layer{
    position: absolute !important;
    inset: 0 !important;
    z-index: 40 !important;
    overflow: hidden !important;
    pointer-events: none !important;
    border-radius: 12px !important;
}
#mtw-spin-wheel .mtw-confetti-piece{
    position: absolute !important;
    top: -14px !important;
    border-radius: 2px ;
    opacity: 1 ;
    animation-name: mtwConfettiFall !important;
    animation-timing-function: linear !important;
    animation-fill-mode: forwards !important;
}
@keyframes mtwConfettiFall{
    0%{
        transform: translate3d(0, -5%, 0) rotate(0deg) ;
        opacity: 1 ;
    }
    100%{
        transform: translate3d(var(--mtw-drift, 0px), 560px, 0) rotate(720deg) ;
        opacity: 0 ;
    }
}
/* =========================================
   WEBFLOW BLOCK
========================================= */
#block_30{
    width: 100% !important;
    max-width: 75% !important;
    margin: 0 auto !important;
    height: auto !important;
    min-height: 0 !important;
    max-height: none !important;
    overflow: visible !important;
    box-sizing: border-box !important;
}
#block_30 #mtw-spin-wheel{
    width: 100% !important;
    margin: 0 auto !important;
}
#block_30 .mtw-spin-wrap{
    width: 100% !important;
    max-width: 100% !important;
}
#block_30 .mtw-wheel-stage{
    width: min(80vw, 560px) !important;
    max-width: 100% !important;
    height: auto !important;
    aspect-ratio: 1 / 1 !important;
    margin-left: auto !important;
    margin-right: auto !important;
}
/* =========================================
   TABLET / MOBILE
========================================= */
@media (max-width: 800px){
    #mtw-spin-wheel .mtw-spin-wrap{
        grid-template-columns: minmax(0, 1fr) !important;
        grid-template-areas: "head" "wheel" "panel" !important;
        gap: 20px !important;
        padding: 26px 18px !important;
    }
    #mtw-spin-wheel .mtw-head,
    #mtw-spin-wheel .mtw-panel{
        text-align: center !important;
    }
    #mtw-spin-wheel .mtw-spin-status{
        text-align: center !important;
    }
}
@media (max-width: 480px){
    #mtw-spin-wheel .mtw-spin-wrap{
        padding-left: 5px !important;
        padding-right: 5px !important;
    }
    #mtw-spin-wheel .mtw-wheel-stage{
        width: 94vw !important;
        height: 94vw !important;
    }
    #mtw-spin-wheel .mtw-wheel{
        border-width: 7px !important;
    }
    #mtw-spin-wheel .mtw-light-ring span{
        width: 9px !important;
        height: 9px !important;
    }
    #mtw-spin-wheel .mtw-wheel-centre{
        width: 82px !important;
        height: 82px !important;
        border-width: 5px !important;
    }
    #mtw-spin-wheel .mtw-wheel-centre span{
        font-size: 14px !important;
    }
    #mtw-spin-wheel .mtw-hub-orbit{
        width: 114px !important;
        height: 114px !important;
    }
    #mtw-spin-wheel .mtw-label span{
        top: 13% !important;
        width: 42% !important;
        font-size: clamp(13px, 2.9vw, 18px) !important;
    }
    #mtw-spin-wheel .mtw-pointer{
        border-left-width: 17px !important;
        border-right-width: 17px !important;
        border-top-width: 36px !important;
    }
    #mtw-spin-wheel .mtw-spin-button{
        width: 100% !important;
        max-width: 300px !important;
    }
}
@media (prefers-reduced-motion: reduce){
    #mtw-spin-wheel .mtw-light-ring span,
    #mtw-spin-wheel .mtw-sheen,
    #mtw-spin-wheel .mtw-rim-sheen,
    #mtw-spin-wheel .mtw-hub-orbit,
    #mtw-spin-wheel .mtw-wheel-centre,
    #mtw-spin-wheel .mtw-pointer,
    #mtw-spin-wheel .mtw-spin-button,
    #mtw-spin-wheel .mtw-spin-button::after,
    #mtw-spin-wheel .mtw-confetti-layer{
        animation: none !important;
        transition: none !important;
    }
}
  `;

  if (customConfig) {
    style.textContent += `
      #mtw-spin-wheel .mtw-spin-wrap{background:${safeColor(appearance.background, '#07110b')} !important}
      #mtw-spin-wheel .mtw-eyebrow{color:${safeColor(appearance.accent, '#8fe3ae')} !important}
      #mtw-spin-wheel .mtw-spin-button{background:${safeColor(appearance.accent, '#22c55e')} !important}
    `;
  }

  document.head.appendChild(style);

  /* =========================================
     CHECKOUT COMMENTS PRIZE HANDLING
  ========================================= */

  let prizePrefix = "";

  function getPrizeInput() {

    return document.querySelector(
      "textarea.input-block-level.form-control.mb-3"
    );

  }

  function protectPrizeInTextarea(reward) {

    const input =
      getPrizeInput();

    if (!input || !reward) return;

    prizePrefix =
      `MTW SPIN WHEEL PRIZE: ${reward.value}\n\n`;

    let existingComments =
      input.value || "";

    if (
      existingComments.startsWith(
        "MTW SPIN WHEEL PRIZE:"
      )
    ) {

      existingComments =
        existingComments.replace(
          /^MTW SPIN WHEEL PRIZE:[^\n]*(?:\n\n)?/,
          ""
        );

    }

    input.value =
      prizePrefix +
      existingComments;

    input.dispatchEvent(
      new Event("input", {
        bubbles: true
      })
    );

    input.dispatchEvent(
      new Event("change", {
        bubbles: true
      })
    );

    if (input.dataset.mtwPrizeGuard) return;

    input.dataset.mtwPrizeGuard =
      "true";

    input.addEventListener(
      "keydown",
      function (event) {

        const start =
          input.selectionStart;

        const end =
          input.selectionEnd;

        if (
          start < prizePrefix.length ||
          end < prizePrefix.length
        ) {

          if (
            event.key === "Backspace" ||
            event.key === "Delete"
          ) {

            event.preventDefault();

            input.setSelectionRange(
              prizePrefix.length,
              prizePrefix.length
            );

          }

        }

      }
    );

    input.addEventListener(
      "beforeinput",
      function (event) {

        const start =
          input.selectionStart;

        const end =
          input.selectionEnd;

        if (
          start < prizePrefix.length ||
          end < prizePrefix.length
        ) {

          event.preventDefault();

          input.setSelectionRange(
            prizePrefix.length,
            prizePrefix.length
          );

        }

      }
    );

    input.addEventListener(
      "input",
      function () {

        if (
          !input.value.startsWith(
            prizePrefix
          )
        ) {

          let value =
            input.value || "";

          value =
            value.replace(
              /^MTW SPIN WHEEL PRIZE:[^\n]*(?:\n\n)?/,
              ""
            );

          input.value =
            prizePrefix +
            value;
        }

      }
    );

    input.addEventListener(
      "paste",
      function () {

        setTimeout(
          function () {

            if (
              !input.value.startsWith(
                prizePrefix
              )
            ) {

              let value =
                input.value || "";

              value =
                value.replace(
                  /^MTW SPIN WHEEL PRIZE:[^\n]*(?:\n\n)?/,
                  ""
                );

              input.value =
                prizePrefix +
                value;

            }

          },
          0
        );

      }
    );

    input.addEventListener(
      "cut",
      function (event) {

        const start =
          input.selectionStart;

        const end =
          input.selectionEnd;

        if (
          start < prizePrefix.length ||
          end < prizePrefix.length
        ) {

          event.preventDefault();

          input.setSelectionRange(
            prizePrefix.length,
            prizePrefix.length
          );

        }

      }
    );

  }

  /* =========================================
     LOCAL STORAGE DISABLED FOR TESTING
  ========================================= */

  function alreadyUsed() {
    return false;
  }

  // function alreadyUsed() {

  //   return (
  //     localStorage.getItem(
  //       STORAGE_KEY
  // }

  function markUsed() {
    // Disabled during testing.
  }

  // function markUsed() {

  //   localStorage.setItem(
  //     STORAGE_KEY,
  //     "true"
  //   );
  // }

  

  // function restorePreviousSpin() {

  //   if (!alreadyUsed()) return;

  //   button.disabled = true;

  //   button.querySelector(
  //     ".mtw-button-top"
  //   ).textContent = "ALREADY SPUN";
  //   ).textContent =
  //     "ALREADY SPUN";

  //   button.querySelector(
  //     ".mtw-button-bottom"
  //   ).textContent = "ONE SPIN PER CUSTOMER";
  //   ).textContent =
  //     "ONE SPIN PER CUSTOMER";

  //   status.textContent =
  //     "You have already spun the wheel.";
  // }

  /* =========================================
     WIN CONFETTI
  ========================================= */

  const CONFETTI_COLOURS = [
    "#65b746",
    "#ffd84a",
    "#ffffff",
    "#ff8a00",
    "#4da3ff",
    "#ff5d8f"
  ];

  function fireConfetti() {

    const stage =
      root.querySelector(
        ".mtw-wheel-stage"
      );

    if (!stage) return;

    if (
      window.matchMedia &&
      window.matchMedia(
        "(prefers-reduced-motion: reduce)"
      ).matches
    ) {
      return;
    }

    const old =
      stage.querySelector(
        ".mtw-confetti-layer"
      );

    if (old) old.remove();

    const layer =
      document.createElement("div");

    layer.className =
      "mtw-confetti-layer";

    for (
      let i = 0;
      i < 90;
      i++
    ) {

      const piece =
        document.createElement("span");

      piece.className =
        "mtw-confetti-piece";

      const size =
        6 + Math.random() * 7;

      piece.style.left =
        Math.random() * 100 + "%";

      piece.style.width =
        size + "px";

      piece.style.height =
        size * (0.5 + Math.random()) + "px";

      piece.style.background =
        CONFETTI_COLOURS[
          Math.floor(
            Math.random() *
            CONFETTI_COLOURS.length
          )
        ];

      piece.style.borderRadius =
        Math.random() > 0.6 ? "50%" : "2px";

      piece.style.setProperty(
        "--mtw-drift",
        Math.round(
          (Math.random() - 0.5) * 220
        ) + "px"
      );

      piece.style.animationDuration =
        (2 + Math.random() * 1.4) +
        "s";

      piece.style.animationDelay =
        (Math.random() * 0.5) +
        "s";

      layer.appendChild(piece);

    }

    stage.appendChild(layer);

    setTimeout(
      function () {
        layer.remove();
      },
      4200
    );

  }

  /* =========================================
     PRIZE PERSISTENCE
  ========================================= */

  /* =========================================
     CUSTOMER IDENTITY + FIREBASE SPIN LOG
     The checkout page renders the customer as:
       .address > .company/.name/.street/
         .suburb/.city/.country
     Fingerprint that into a doc id. One doc per
     person in `wheel-spinners`: visit logged on
     arrival, spunAt stamped on spin. Next
     checkout with a spunAt doc gets locked out.
  ========================================= */

  function normPart(v) {
    return String(v == null ? "" : v)
      .toLowerCase()
      .replace(/\s+/g, " ")
      .trim();
  }

  function fpHash(str) {
    let h1 = 0x811c9dc5;
    let h2 = 0x01000193 ^ 0x5bd1e995;

    for (let i = 0; i < str.length; i++) {
      const c = str.charCodeAt(i);

      h1 = Math.imul(h1 ^ c, 16777619) >>> 0;
      h2 = Math.imul(h2 ^ c, 16777619) >>> 0;
    }

    return h1.toString(16).padStart(8, "0") +
      h2.toString(16).padStart(8, "0");
  }

  function nzDayString(when) {
    try {
      return new Intl.DateTimeFormat("en-CA", {
        timeZone: "Pacific/Auckland",
        year: "numeric",
        month: "2-digit",
        day: "2-digit"
      }).format(
        when instanceof Date
          ? when
          : new Date(when == null ? Date.now() : when)
      );
    } catch (e) {
      const d = new Date(when == null ? Date.now() : when);

      return d.getFullYear() + "-" +
        String(d.getMonth() + 1).padStart(2, "0") + "-" +
        String(d.getDate()).padStart(2, "0");
    }
  }

  function getIdentity() {
    const box = document.querySelector(".address");

    if (!box) return null;

    const pick = cls => {
      const el = box.querySelector("." + cls);

      return el ? el.textContent : "";
    };

    const company = normPart(pick("company"));
    const name = normPart(pick("name"));
    const street = normPart(pick("street"));
    const suburb = normPart(pick("suburb"));
    const city = normPart(pick("city"));
    const country = normPart(pick("country"));

    if (!company || !name) return null;

    const fp = [company, name].join("|");

    return {
      company, name, street, suburb, city, country,
      fp, fpId: "fp-" + fpHash(fp)
    };
  }

  const FIREBASE_CONFIG = {
    apiKey: "AIzaSyA6i9ZVdE1xmSzjebcx1zUJpA-Zuy_DgSs",
    authDomain: "mtw-lookup.firebaseapp.com",
    projectId: "mtw-lookup",
    storageBucket: "mtw-lookup.firebasestorage.app",
    messagingSenderId: "365628896617",
    appId: "1:365628896617:web:f3d718fad93b14501679f8"
  };

  const FIREBASE_APP_URL =
    "https://www.gstatic.com/firebasejs/12.9.0/firebase-app.js";

  const FIREBASE_STORE_URL =
    "https://www.gstatic.com/firebasejs/12.9.0/firebase-firestore.js";

  async function fb() {
    if (fb.cache) return fb.cache;

    try {
      const mods = await Promise.all([
        import(FIREBASE_APP_URL),
        import(FIREBASE_STORE_URL)
      ]);

      const appMod = mods[0];
      const fsMod = mods[1];

      let app = null;

      try {
        const existing =
          appMod.getApps ? appMod.getApps() : [];

        app = existing && existing.length
          ? existing[0]
          : appMod.initializeApp(FIREBASE_CONFIG);
      } catch (e) {
        try {
          app = appMod.getApp();
        } catch (e2) {
          return null;
        }
      }

      if (!app || !fsMod.getFirestore) {
        return null;
      }

      const database = fsMod.getFirestore(app);

      if (
        !database ||
        !fsMod.doc ||
        !fsMod.getDoc ||
        !fsMod.setDoc ||
        !fsMod.arrayUnion ||
        !fsMod.runTransaction
      ) {
        return null;
      }

      fb.cache = {
        db: database,
        doc: fsMod.doc,
        getDoc: fsMod.getDoc,
        setDoc: fsMod.setDoc,
        arrayUnion: fsMod.arrayUnion,
        runTransaction: fsMod.runTransaction
      };

      return fb.cache;
    } catch (e) {
      return null;
    }
  }

  let lastCheck = null;

  function spinsToday(data, today) {
    const spins =
      data && Array.isArray(data.spins)
        ? data.spins
        : [];

    const hit = spins.filter(function (s) {
      return s && s.spunDay === today;
    });

    if (hit.length) return hit;

    if (
      data &&
      data.spun === true &&
      data.spunDay === today
    ) {
      return [data];
    }

    return [];
  }

  function matchesSpinIdentity(record, identity) {
    return !record.fp ||
      record.fp === identity.fp ||
      (elementId && record.fp === identity.fpId);
  }

  function spinRecordRef(F, fpId) {
    const collection = elementId
      ? "custom-element-spins"
      : "checkout-wheel";
    const documentId = elementId
      ? elementId + "_" + fpId
      : fpId;
    return F.doc(F.db, collection, documentId);
  }

  async function checkPreviousSpin(tries) {
    if (!dailyLimit) return;
    tries = tries || 0;

    const id = getIdentity();

    if (!id) {
      if (tries >= 20) {
        lastCheck = { at: Date.now(), fp: null, found: false, error: "no-address" };
        if (elementId) showSpinError("We could not verify your checkout details, so this wheel is unavailable.");
        return;
      }

      setTimeout(function () {
        checkPreviousSpin(tries + 1);
      }, 500);

      return;
    }

    const F = await fb();

    if (!F) {
      lastCheck = { at: Date.now(), fp: id.fp, found: false, error: "no-firebase" };
      if (elementId) showSpinError("We could not verify your daily spin. Please contact the site administrator.");
      return;
    }

    const now = Date.now();

    const today = nzDayString(now);

    try {
      const ref = spinRecordRef(F, id.fpId);

      let prev = null;

      try {
        const snap = await F.getDoc(ref);

        if (snap && snap.exists()) {
          prev = snap.data() || {};
        }
      } catch (e) {
        console.error("[mtw-spin-wheel] spin check failed:", e);
        if (elementId) {
          lastCheck = { at: Date.now(), fp: id.fp, found: false, error: String((e && e.message) || e) };
          showSpinError("We could not verify your daily spin. Please try again later.");
          return;
        }
      }

      const todaysSpins = spinsToday(prev, today);

      if (
        prev &&
        todaysSpins.length &&
        matchesSpinIdentity(prev, id)
      ) {
        lastCheck = { at: Date.now(), fp: id.fp, found: true, error: null, spins: todaysSpins.length };
        hideWheel();
        clearStalePrize();
        return;
      }

      lastCheck = { at: Date.now(), fp: id.fp, found: false, error: null };

      if (!prev && !elementId) {
        try {
          await F.setDoc(
            ref,
            {
              company: id.company,
              name: id.name,
              street: id.street,
              suburb: id.suburb,
              city: id.city,
              country: id.country,
              fp: id.fp,
              firstSeenAt: now,
              spun: false,
              spins: []
            },
            { merge: true }
          );
        } catch (e) {
          console.error("[mtw-spin-wheel] visit log failed:", e);
        }
      }
      if (elementId) enableWheel();
    } catch (e) {
      lastCheck = { at: Date.now(), fp: id ? id.fp : null, found: false, error: String((e && e.message) || e) };
      console.error("[mtw-spin-wheel] spin check failed:", e);
      if (elementId) showSpinError("We could not verify your daily spin. Please try again later.");
    }
  }

  function stripPrizeFromComments() {
    const input = getPrizeInput();

    if (!input) return;

    const value = input.value || "";

    if (
      !value.startsWith(
        "MTW SPIN WHEEL PRIZE:"
      )
    ) {
      return;
    }

    const cleaned = value.replace(
      /^MTW SPIN WHEEL PRIZE:[^\n]*(?:\n\n)?/,
      ""
    );

    if (cleaned === value) {
      return;
    }

    input.value = cleaned;

    input.dispatchEvent(
      new Event("input", {
        bubbles: true
      })
    );

    input.dispatchEvent(
      new Event("change", {
        bubbles: true
      })
    );
  }

  function clearStalePrize(tries) {
    tries = tries || 0;

    stripPrizeFromComments();

    if (tries >= 20) {
      return;
    }

    setTimeout(function () {
      clearStalePrize(tries + 1);
    }, 500);
  }

  function pad2(n) {
    return String(n).padStart(2, "0");
  }

  function msUntilAucklandMidnight() {
    const now = Date.now();

    let parts = {};

    try {
      new Intl.DateTimeFormat("en-CA", {
        timeZone: "Pacific/Auckland",
        hour: "2-digit",
        minute: "2-digit",
        second: "2-digit",
        hour12: false
      }).formatToParts(new Date(now)).forEach(function (p) {
        parts[p.type] = p.value;
      });
    } catch (e) {
      return null;
    }

    let h = parseInt(parts.hour, 10) || 0;

    if (h >= 24) h = 0;

    const elapsed =
      h * 3600 +
      (parseInt(parts.minute, 10) || 0) * 60 +
      (parseInt(parts.second, 10) || 0);

    return 86400 * 1000 - elapsed * 1000;
  }

  function fmtCountdown(ms) {
    if (ms < 0) ms = 0;

    const s = Math.floor(ms / 1000);

    return pad2(Math.floor(s / 3600)) + ":" +
      pad2(Math.floor((s % 3600) / 60)) + ":" +
      pad2(s % 60);
  }

  function hideWheel() {
    root.innerHTML =
      '<div class="mtw-spin-wrap mtw-is-locked">' +
        '<div class="mtw-locked-inner">' +
          '<div class="mtw-eyebrow">★ Daily spin ★</div>' +
          '<h2 class="mtw-title">' +
            '<span class="mtw-title-top">DAILY SPIN</span>' +
            '<span class="mtw-title-grad">USED UP</span>' +
          '</h2>' +
          '<p class="mtw-sub">You have used your daily spin</p>' +
          '<div class="mtw-timer" id="mtwSpinTimer">--:--:--</div>' +
          '<p class="mtw-sub">Come back tomorrow for another spin</p>' +
          '<p class="mtw-fine">Get what you get · no returns or substitutions</p>' +
        '</div>' +
      '</div>';

    const tick = function () {
      const el = document.getElementById("mtwSpinTimer");

      if (!el) return;

      const left = msUntilAucklandMidnight();

      if (left == null) {
        el.textContent = "tomorrow";
        return;
      }

      if (left <= 0) {
        el.textContent = "00:00:00";
        location.reload();
        return;
      }

      el.textContent = fmtCountdown(left);
    };

    tick();
    setInterval(tick, 1000);
  }

  async function reserveCustomSpin() {
    const identity = getIdentity();
    if (!identity) throw new Error("Customer checkout details are unavailable.");

    const F = await fb();
    if (!F || !F.runTransaction) throw new Error("Daily spin storage is unavailable.");

    const today = nzDayString(Date.now());
    const ref = spinRecordRef(F, identity.fpId);

    return F.runTransaction(F.db, async function (transaction) {
      const snapshot = await transaction.get(ref);
      const previous = snapshot && snapshot.exists()
        ? snapshot.data() || {}
        : null;
      if (spinsToday(previous, today).length && matchesSpinIdentity(previous, identity)) {
        return false;
      }
      transaction.set(ref, {
        elementId,
        fp: identity.fpId,
        spun: true,
        spunDay: today,
        reservedAt: Date.now()
      }, { merge: true });
      return true;
    });
  }

  function showSpinError(message) {
    const button = root.querySelector(".mtw-spin-button");
    const hub = root.querySelector(".mtw-wheel-centre");
    const status = root.querySelector(".mtw-spin-status");
    if (button) button.disabled = true;
    if (hub) {
      hub.classList.add("is-locked");
      hub.setAttribute("aria-disabled", "true");
    }
    if (status) {
      status.textContent = message;
      status.setAttribute("role", "alert");
    }
  }

  function enableWheel() {
    const button = root.querySelector(".mtw-spin-button");
    const hub = root.querySelector(".mtw-wheel-centre");
    const status = root.querySelector(".mtw-spin-status");
    if (button) button.disabled = false;
    if (hub) {
      hub.classList.remove("is-locked");
      hub.removeAttribute("aria-disabled");
    }
    if (status) {
      status.textContent = "";
      status.removeAttribute("role");
    }
  }

  async function recordSpin(identity, reward) {
    if (!identity || (!dailyLimit && !logSpins)) return;

    const F = await fb();

    if (!F) {
      console.error("[mtw-spin-wheel] could not initialize Firebase to record this spin.");
      if (elementId && logSpins) {
        showSpinError("Your spin finished, but we could not record the result. Please contact the site administrator.");
      }
      return;
    }

    try {
      const stamp = Date.now();
      const day = nzDayString(stamp);

      const record = {
        fp: elementId && !logSpins ? identity.fpId : identity.fp,
        spun: true,
        spunDay: day,
        ts: stamp
      };

      if (!elementId || logSpins) {
        Object.assign(record, {
          company: identity.company,
          name: identity.name,
          street: identity.street,
          suburb: identity.suburb,
          city: identity.city,
          country: identity.country,
          label: reward.label,
          value: reward.value,
          code: reward.code || null,
          won: !!reward.code,
          url: location.href
        });
      }

      if (elementId) {
        record.elementId = elementId;
        record.spins = F.arrayUnion(logSpins
          ? {
            label: reward.label,
            value: reward.value,
            code: reward.code || null,
            won: !!reward.code,
            ts: stamp,
            spunDay: day
          }
          : { ts: stamp, spunDay: day });
      } else {
        record.spins = F.arrayUnion({
          label: reward.label,
          value: reward.value,
          code: reward.code || null,
          won: !!reward.code,
          ts: stamp,
          spunDay: day
        });
      }

      await F.setDoc(
        spinRecordRef(F, identity.fpId),
        record,
        { merge: true }
      );
    } catch (e) {
      console.error("[mtw-spin-wheel] spin log failed:", e);
      if (elementId && logSpins) {
        showSpinError("Your spin finished, but we could not record the result. Please contact the site administrator.");
      }
    }
  }

  /* =========================================
     SPIN
  ========================================= */

  async function spin() {

    if (spinning) return;

    if (button.disabled) return;

    spinning = true;

    if (elementId && dailyLimit) {
      button.disabled = true;
      try {
        const reserved = await reserveCustomSpin();
        if (!reserved) {
          spinning = false;
          hideWheel();
          clearStalePrize();
          return;
        }
      } catch (error) {
        console.error("[mtw-spin-wheel] daily spin reservation failed:", error);
        spinning = false;
        button.disabled = false;
        showSpinError("We could not secure your daily spin. Please try again later.");
        return;
      }
    }

    markUsed();

    const stage =
      root.querySelector(
        ".mtw-wheel-stage"
      );

    stage.classList.add(
      "mtw-spinning"
    );

    button.disabled = true;

    const hubEl =
      root.querySelector(
        ".mtw-wheel-centre"
      );

    if (hubEl) {

      hubEl.classList.add(
        "is-locked"
      );

      hubEl.setAttribute(
        "aria-disabled",
        "true"
      );

    }

    button.querySelector(
      ".mtw-button-top"
    ).textContent =
      "GOOD LUCK!";

    button.querySelector(
      ".mtw-button-bottom"
    ).textContent =
      "THE WHEEL IS SPINNING...";

    status.textContent = "";

    status.classList.remove(
      "mtw-win",
      "mtw-try-again"
    );

    stage.classList.remove(
      "mtw-winner"
    );

    /*
     * Select the winner using the
     * configured chance percentages.
     */

    const winnerIndex =
      getWeightedWinner();

    const reward =
      rewards[winnerIndex];

    /*
     * Work out where the selected
     * reward sits on the physical wheel.
     */

    const winnerCentre =
      winnerIndex * slice +
      slice / 2;

    const targetAngle =
      360 - winnerCentre;

    const normalized =
      (
        currentRotation % 360 +
        360
      ) % 360;

    const adjustment =
      (
        targetAngle -
        normalized +
        360
      ) % 360;

    const extraSpins =
      360 *
      (
        5 +
        Math.floor(
          Math.random() * 3
        )
      );

    const finalRotation =
      currentRotation +
      extraSpins +
      adjustment;

    currentRotation =
      finalRotation;

    wheel.style.transform =
      `rotate(${finalRotation}deg)`;

    setTimeout(
      function () {

        spinning = false;

        stage.classList.remove(
          "mtw-spinning"
        );

        if (reward.code) {

          stage.classList.add(
            "mtw-winner"
          );

          fireConfetti();

        }

        protectPrizeInTextarea(
          reward
        );

        recordSpin(getIdentity(), reward);

        if (reward.code) {

          status.textContent =
            `🎉 YOU WON: ${reward.label}`;

          status.classList.remove(
            "mtw-try-again"
          );

          status.classList.add(
            "mtw-win"
          );

          button.querySelector(
            ".mtw-button-top"
          ).textContent =
            "YOU WON!";

          button.querySelector(
            ".mtw-button-bottom"
          ).textContent =
            reward.label;

        } else {

          status.textContent =
            "NO PRIZE — Better luck next time!";

          status.classList.remove(
            "mtw-win"
          );

          status.classList.add(
            "mtw-try-again"
          );

          button.querySelector(
            ".mtw-button-top"
          ).textContent =
            "NO PRIZE";

          button.querySelector(
            ".mtw-button-bottom"
          ).textContent =
            "BETTER LUCK NEXT TIME";

        }

      },
      4150
    );

  }

  const wheel =
    document.getElementById(
      "mtw-wheel"
    );

  const button =
    document.getElementById(
      "mtw-spin-button"
    );

  const status =
    document.getElementById(
      "mtw-spin-status"
    );

  button.addEventListener(
    "click",
    spin
  );

  const hub =
    root.querySelector(
      ".mtw-wheel-centre"
    );

  if (hub) {

    hub.addEventListener(
      "click",
      spin
    );

    hub.addEventListener(
      "keydown",
      function (event) {

        if (
          event.key === "Enter" ||
          event.key === " "
        ) {

          event.preventDefault();

          spin();

        }

      }
    );

  }

  if (dailyLimit) {
    if (elementId) {
      button.disabled = true;
      status.textContent = "Checking your daily spin…";
    }
    checkPreviousSpin();
  }

  window.MTWSpinDebug = function () {
    return { identity: getIdentity(), lastCheck: lastCheck };
  };

})();
