(function () {
  "use strict";

  if (window.__mtwChristmas) {
    return;
  }

  var style = document.createElement("style");
  style.id = "mtw-christmas-styles";
  style.textContent = `
    body.mtw-christmas-active {
      background: #0c1712 !important;
      color: #e7f1e9 !important;
    }

    body.mtw-christmas-active #header-outer,
    body.mtw-christmas-active #header,
    body.mtw-christmas-active #header-inner,
    body.mtw-christmas-active #content,
    body.mtw-christmas-active #content-inner,
    body.mtw-christmas-active #main,
    body.mtw-christmas-active #main-inner,
    body.mtw-christmas-active #body,
    body.mtw-christmas-active #footer-outer,
    body.mtw-christmas-active #footer,
    body.mtw-christmas-active #footer-inner {
      background-color: #101d17 !important;
      color: #e7f1e9 !important;
    }

    body.mtw-christmas-active #nav-outer {
      position: relative;
    }

    .mtw-holiday-lights {
      position: absolute;
      z-index: 8;
      right: 0;
      top: 100%;
      left: 0;
      width: 100%;
      height: 38px;
      overflow: visible;
      pointer-events: none;
    }

    .mtw-holiday-lights svg {
      display: block;
      width: 100%;
      height: 100%;
      overflow: visible;
    }

    .mtw-holiday-lights .wire {
      fill: none;
      stroke: #59604a;
      stroke-width: 1.8;
      stroke-linecap: round;
      opacity: 0.9;
      vector-effect: non-scaling-stroke;
    }

    .mtw-holiday-lights .socket {
      stroke: #48533e;
      stroke-width: 2;
      stroke-linecap: round;
      vector-effect: non-scaling-stroke;
    }

    .mtw-holiday-lights .bulb-shape {
      animation: mtw-holiday-light-glow 2.6s ease-in-out infinite alternate;
      stroke: rgb(255 255 255 / 70%);
      stroke-width: 0.65;
      vector-effect: non-scaling-stroke;
    }

    .mtw-holiday-lights .bulb-highlight {
      fill: rgb(255 255 255 / 78%);
      pointer-events: none;
    }

    @media (max-width: 600px) {
      .mtw-holiday-lights {
        height: 20px;
      }

      .mtw-holiday-lights .bulb-shape {
        transform: scaleX(1.45);
        transform-box: fill-box;
        transform-origin: center;
      }

      body.mtw-christmas-active #header-outer,
      body.mtw-christmas-active #header,
      body.mtw-christmas-active #header-inner,
      body.mtw-christmas-active #mobile-header,
      body.mtw-christmas-active #mobile-menu,
      body.mtw-christmas-active #mobile-menu li,
      body.mtw-christmas-active #mobile-menu a {
        border: 0 !important;
        background: #101d17 !important;
        background-color: #101d17 !important;
        background-image: none !important;
        box-shadow: none !important;
      }

      body.mtw-christmas-active #mobile-header {
        border: 0 !important;
        background: #101d17 !important;
        background-color: #101d17 !important;
        background-image: none !important;
        box-shadow: none !important;
      }

      body.mtw-christmas-active #clearance-left {
        display: none !important;
      }

      .mtw-christmas-hat {
        display: none !important;
      }
    }

    @keyframes mtw-holiday-light-glow {
      from {
        opacity: 0.78;
        filter: drop-shadow(0 0 2px var(--bulb-glow));
      }

      to {
        opacity: 1;
        filter: drop-shadow(0 0 6px var(--bulb-glow));
      }
    }

    body.mtw-christmas-active #body h1,
    body.mtw-christmas-active #body h2,
    body.mtw-christmas-active #body h3,
    body.mtw-christmas-active #body h4,
    body.mtw-christmas-active #title-container h1,
    body.mtw-christmas-active .category_view h1,
    body.mtw-christmas-active .breadcrumb,
    body.mtw-christmas-active .breadcrumb a,
    body.mtw-christmas-active .breadcrumb li,
    body.mtw-christmas-active #body label,
    body.mtw-christmas-active #body p,
    body.mtw-christmas-active #footer {
      color: #e7f1e9 !important;
    }

    body.mtw-christmas-active .breadcrumb a {
      color: #b8d2bf !important;
    }

    body.mtw-christmas-active #footer-subscribe {
      background: linear-gradient(145deg, #1a2a20, #101b16) !important;
      color: #e7f1e9 !important;
    }

    body.mtw-christmas-active #footer-subscribe h3,
    body.mtw-christmas-active #footer-subscribe .comments {
      color: #e7f1e9 !important;
    }

    body.mtw-christmas-active #body a:not(.btn):not(.button),
    body.mtw-christmas-active #footer a {
      color: #b8e4a0;
    }

    body.mtw-christmas-active #body input,
    body.mtw-christmas-active #body select,
    body.mtw-christmas-active #body textarea {
      border-color: #496052;
      background-color: #15241c;
      color: #f0f7f1;
    }

    body.mtw-christmas-active #nav-left h2 {
      padding: 8px 10px;
      border-left: 3px solid #69b64f;
      background: linear-gradient(145deg, #203326, #14231a) !important;
      color: #f4f7f5 !important;
    }

    body.mtw-christmas-active #nav-left ul.categories,
    body.mtw-christmas-active #nav-left ul.categories li.category,
    body.mtw-christmas-active #nav-left ul.categories li.category > a {
      background-color: transparent !important;
    }

    body.mtw-christmas-active #nav-left ul.categories ul.categories {
      background: #14231a !important;
    }

    body.mtw-christmas-active #nav-left ul.categories li.category > a {
      color: #d3e2d6 !important;
    }

    body.mtw-christmas-active #nav-left ul.categories li.category.active > a {
      color: #aee58e !important;
      font-weight: 700;
    }

    body.mtw-christmas-active #nav-left ul.categories li.category > a:hover,
    body.mtw-christmas-active #nav-left ul.categories li.category > a:focus-visible {
      background: #203326 !important;
      color: #fff !important;
    }

    body.mtw-christmas-active.product_view #body #single-product-details .price:not(.retail),
    body.mtw-christmas-active.product_view #body #single-product-details .price:not(.retail) * {
      color: #f4f7f5 !important;
    }

    body.mtw-christmas-active.product_view #body #single-product-details .price:not(.retail) .suffix {
      color: #8ed068 !important;
    }

    body.mtw-christmas-active.product_view #body #single-product-details .price.retail,
    body.mtw-christmas-active.product_view #body #single-product-details .price.retail *,
    body.mtw-christmas-active.product_view #body #single-product-details .retail-value,
    body.mtw-christmas-active.product_view #body #single-product-details .price-label {
      color: #bd5555 !important;
    }

    body.mtw-christmas-active.product_view #body #single-product-details .price.retail .suffix,
    body.mtw-christmas-active.product_view #body #single-product-details .retail-value .suffix {
      color: #bd5555 !important;
    }

    body.mtw-christmas-active.product_view #body .nav-tabs {
      border-bottom: 1px solid #496052 !important;
    }

    body.mtw-christmas-active.product_view #body .nav-tabs > li > a {
      border: 1px solid #496052 !important;
      border-bottom-color: #496052 !important;
      background: #15241c !important;
      color: #d3e2d6 !important;
      text-shadow: none !important;
    }

    body.mtw-christmas-active.product_view #body .nav-tabs > li > a:hover,
    body.mtw-christmas-active.product_view #body .nav-tabs > li > a:focus {
      border-color: #69b64f !important;
      background: #203326 !important;
      color: #fff !important;
    }

    body.mtw-christmas-active.product_view #body .nav-tabs > .active > a,
    body.mtw-christmas-active.product_view #body .nav-tabs > .active > a:hover,
    body.mtw-christmas-active.product_view #body .nav-tabs > .active > a:focus {
      border-color: #496052 #496052 #14231a !important;
      background: #14231a !important;
      color: #f4f7f5 !important;
      cursor: default;
    }

    body.mtw-christmas-active.product_view #body .tab-content {
      border: 1px solid #496052 !important;
      border-top: 0 !important;
      background: linear-gradient(145deg, #1a2a20, #14231a) !important;
      color: #e7f1e9 !important;
    }

    body.mtw-christmas-active.product_view #body .tab-content > .tab-pane,
    body.mtw-christmas-active.product_view #body .tab-content > .tab-pane p,
    body.mtw-christmas-active.product_view #body .tab-content > .tab-pane li,
    body.mtw-christmas-active.product_view #body .tab-content > .tab-pane label {
      background-color: transparent !important;
      color: #e7f1e9 !important;
    }

    body.mtw-christmas-active.product_view #body .tab-content > .tab-pane h1,
    body.mtw-christmas-active.product_view #body .tab-content > .tab-pane h2,
    body.mtw-christmas-active.product_view #body .tab-content > .tab-pane h3,
    body.mtw-christmas-active.product_view #body .tab-content > .tab-pane h4,
    body.mtw-christmas-active.product_view #body .tab-content > .tab-pane strong {
      color: #f4f7f5 !important;
    }

    body.mtw-christmas-active.product_view #body .tab-content > .tab-pane a:not(.btn):not(.button) {
      color: #b8e4a0 !important;
    }

    body.mtw-christmas-active #body table {
      border-color: #496052 !important;
      background: #15241c !important;
      color: #e7f1e9 !important;
    }

    body.mtw-christmas-active #body table th,
    body.mtw-christmas-active #body table thead td {
      border-color: #496052 !important;
      background: #203326 !important;
      color: #f4f7f5 !important;
    }

    body.mtw-christmas-active #body table th *,
    body.mtw-christmas-active #body table thead td * {
      color: #f4f7f5 !important;
    }

    body.mtw-christmas-active #body table td,
    body.mtw-christmas-active #body table tfoot th,
    body.mtw-christmas-active #body table tfoot td {
      border-color: #496052 !important;
      background: #15241c !important;
      color: #e7f1e9 !important;
    }

    body.mtw-christmas-active #body table td * {
      color: #e7f1e9 !important;
    }

    body.mtw-christmas-active #body table a {
      color: #b8e4a0 !important;
    }

    body.mtw-christmas-active .modal {
      border: 1px solid #496052 !important;
      border-radius: 8px;
      background: #14231a !important;
      color: #e7f1e9 !important;
      box-shadow: 0 12px 36px rgb(0 0 0 / 55%);
    }

    body.mtw-christmas-active .modal .modal-header,
    body.mtw-christmas-active .modal .modal-body,
    body.mtw-christmas-active .modal .modal-footer {
      border-color: #496052 !important;
      background: #14231a !important;
      color: #e7f1e9 !important;
    }

    body.mtw-christmas-active .modal h1,
    body.mtw-christmas-active .modal h2,
    body.mtw-christmas-active .modal h3,
    body.mtw-christmas-active .modal p,
    body.mtw-christmas-active .modal th,
    body.mtw-christmas-active .modal td,
    body.mtw-christmas-active .modal label {
      color: #e7f1e9 !important;
    }

    body.mtw-christmas-active .modal table,
    body.mtw-christmas-active .modal table th,
    body.mtw-christmas-active .modal table td {
      border-color: #496052 !important;
      background: #15241c !important;
    }

    body.mtw-christmas-active .modal table th *,
    body.mtw-christmas-active .modal table td * {
      color: #e7f1e9 !important;
    }

    body.mtw-christmas-active .modal a.btn,
    body.mtw-christmas-active .modal a.button {
      color: #fff !important;
      text-decoration: none !important;
    }

    body.mtw-christmas-active .modal .close {
      color: #b8e4a0 !important;
      opacity: 1;
      text-shadow: none;
    }

    body.mtw-christmas-active .pagination .results {
      color: #b8d2bf !important;
    }

    body.mtw-christmas-active .pagination ul.pages li a {
      display: inline-flex;
      min-width: 24px;
      height: 24px;
      align-items: center;
      justify-content: center;
      padding: 0 5px;
      border: 1px solid #496052 !important;
      border-radius: 4px;
      background: #15241c !important;
      color: #b8e4a0 !important;
      text-decoration: none !important;
    }

    body.mtw-christmas-active .pagination ul.pages li.active a {
      border-color: #69b64f !important;
      background: #438b3d !important;
      color: #fff !important;
      font-weight: 700;
    }

    body.mtw-christmas-active ul.products li.product,
    body.mtw-christmas-active ul.product-groups li.product-group,
    body.mtw-christmas-active #body ul.categories li.category {
      position: relative;
      isolation: isolate;
      overflow: visible;
      border: 1px solid #385440 !important;
      border-radius: 10px;
      background: linear-gradient(150deg, #1a2a20, #101b16) !important;
      box-shadow: 0 5px 16px rgb(0 0 0 / 24%);
      color: #e7f1e9;
      transition: transform 220ms ease, box-shadow 220ms ease, border-color 220ms ease;
    }

    body.mtw-christmas-active ul.products li.product::before,
    body.mtw-christmas-active ul.product-groups li.product-group::before {
      position: absolute;
      z-index: 0;
      inset: 0;
      border-radius: inherit;
      background:
        linear-gradient(to bottom, rgb(194 232 255 / 52%), transparent) top / 100% 18px no-repeat,
        linear-gradient(to top, rgb(154 207 238 / 38%), transparent) bottom / 100% 18px no-repeat,
        linear-gradient(to right, rgb(182 224 250 / 32%), transparent) left / 14px 100% no-repeat,
        linear-gradient(to left, rgb(182 224 250 / 32%), transparent) right / 14px 100% no-repeat;
      content: "";
      opacity: 0.3;
      pointer-events: none;
      animation: mtw-card-ice-build 30s ease-out forwards;
    }

    body.mtw-christmas-active ul.products li.product > .details,
    body.mtw-christmas-active ul.product-groups li.product-group > .details {
      position: relative;
      z-index: 1;
    }

    @keyframes mtw-card-ice-build {
      to {
        opacity: 0.68;
      }
    }

    body.mtw-christmas-active ul.products li.product:hover,
    body.mtw-christmas-active ul.product-groups li.product-group:hover,
    body.mtw-christmas-active #body ul.categories li.category:hover {
      z-index: 2;
      transform: translateY(-4px);
      border-color: #83c65c !important;
      box-shadow: 0 10px 24px rgb(0 0 0 / 34%);
    }

    body.mtw-christmas-active .clearance-products ul.products li.product.clearance {
      clear: none !important;
    }

    body.mtw-christmas-active #body .hot-products li.hot .flag,
    body.mtw-christmas-active #body li.hot .flag,
    body.mtw-christmas-active.product_hot #body li .flag,
    body.mtw-christmas-active.hot #single-product-wrapper .flag,
    body.mtw-christmas-active.hot #single-product-photo .flag {
      width: auto !important;
      height: auto !important;
      padding: 0 !important;
      background: none !important;
      background-image: none !important;
      box-shadow: none !important;
    }

    body.mtw-christmas-active #body li.clearance .flag,
    body.mtw-christmas-active.product_clearance #body li .flag,
    body.mtw-christmas-active.clearance #single-product-wrapper .flag,
    body.mtw-christmas-active.clearance #single-product-photo .flag {
      width: auto !important;
      height: auto !important;
      padding: 0 !important;
      background: none !important;
      background-image: none !important;
      box-shadow: none !important;
    }

    body.mtw-christmas-active #body .hot-products li.hot .flag::before,
    body.mtw-christmas-active #body li.hot .flag::before,
    body.mtw-christmas-active.product_hot #body li .flag::before,
    body.mtw-christmas-active.hot #single-product-wrapper .flag::before,
    body.mtw-christmas-active.hot #single-product-photo .flag::before {
      display: inline-block;
      padding: 6px 23px 6px 14px;
      border-radius: 0 0 7px 0;
      background: linear-gradient(135deg, #38a45a, #247342) !important;
      box-shadow: inset 0 0 0 1px rgb(255 255 255 / 18%), 0 2px 7px rgb(0 0 0 / 24%);
      color: #fff !important;
      font-size: 13px;
      font-weight: 700;
      line-height: 1.25;
      text-indent: 0 !important;
      text-shadow: 0 1px 1px rgb(0 0 0 / 25%);
      clip-path: polygon(0 0, 100% 0, 86% 100%, 0 100%);
      border-left: 3px solid #d94747;
      border-bottom: 1px solid #e7cc7a;
    }

    body.mtw-christmas-active #body li.clearance .flag::before,
    body.mtw-christmas-active.product_clearance #body li .flag::before,
    body.mtw-christmas-active.clearance #single-product-wrapper .flag::before,
    body.mtw-christmas-active.clearance #single-product-photo .flag::before {
      display: inline-block;
      padding: 5px 20px 5px 12px;
      border-radius: 0 0 7px 0;
      background: linear-gradient(135deg, #d94a4f, #a32132) !important;
      box-shadow: inset 0 0 0 1px rgb(255 255 255 / 18%), 0 2px 7px rgb(0 0 0 / 24%);
      color: #fff !important;
      font-size: 12px;
      font-weight: 700;
      line-height: 1.2;
      text-indent: 0 !important;
      text-shadow: 0 1px 1px rgb(0 0 0 / 25%);
      clip-path: polygon(0 0, 100% 0, 86% 100%, 0 100%);
      border-left: 3px solid #e7cc7a;
      border-top: 1px solid #4f9d45;
    }

    body.mtw-christmas-active #body .hot-products li.hot .flag::after,
    body.mtw-christmas-active #body li.hot .flag::after,
    body.mtw-christmas-active.product_hot #body li .flag::after,
    body.mtw-christmas-active.hot #single-product-wrapper .flag::after,
    body.mtw-christmas-active.hot #single-product-photo .flag::after,
    body.mtw-christmas-active #body li.clearance .flag::after,
    body.mtw-christmas-active.product_clearance #body li .flag::after,
    body.mtw-christmas-active.clearance #single-product-wrapper .flag::after,
    body.mtw-christmas-active.clearance #single-product-photo .flag::after {
      position: absolute;
      top: 3px;
      right: 11px;
      color: #ffe9a8;
      content: "❄";
      font-size: 12px;
      line-height: 1;
      text-shadow: 0 1px 2px rgb(0 0 0 / 45%);
      pointer-events: none;
    }

    @media (max-width: 600px) {
      body.mtw-christmas-active #clearance-right .hot-products li.hot .flag::before {
        padding: 8px 27px 8px 16px;
        font-size: 15px;
      }
    }

    body.mtw-christmas-active ul.products li.product .details,
    body.mtw-christmas-active ul.product-groups li.product-group .details,
    body.mtw-christmas-active #body ul.categories li.category .details {
      border-radius: inherit;
      background: transparent !important;
      color: inherit;
    }

    body.mtw-christmas-active ul.products li.product .details *,
    body.mtw-christmas-active ul.product-groups li.product-group .details *,
    body.mtw-christmas-active #body ul.categories li.category .details * {
      color: #e7f1e9 !important;
    }

    body.mtw-christmas-active ul.product-groups li.product-group .product-group-title,
    body.mtw-christmas-active ul.product-groups li.product-group .name,
    body.mtw-christmas-active #body ul.categories li.category .name a {
      color: #e7f1e9 !important;
    }

    body.mtw-christmas-active ul.products li.product .details .price,
    body.mtw-christmas-active ul.products li.product .details .price *,
    body.mtw-christmas-active ul.products li.product .details .retail-value,
    body.mtw-christmas-active ul.products li.product .details .retail-value *,
    body.mtw-christmas-active ul.product-groups li.product-group .details .price,
    body.mtw-christmas-active ul.product-groups li.product-group .details .price *,
    body.mtw-christmas-active ul.product-groups li.product-group .details .retail-value,
    body.mtw-christmas-active ul.product-groups li.product-group .details .retail-value * {
      color: #f4f7f5 !important;
    }

    body.mtw-christmas-active ul.products li.product .details .price .suffix,
    body.mtw-christmas-active ul.products li.product .details .retail-value .suffix,
    body.mtw-christmas-active ul.product-groups li.product-group .details .price .suffix,
    body.mtw-christmas-active ul.product-groups li.product-group .details .retail-value .suffix {
      color: #8ed068 !important;
      font-size: 0.72em;
      font-weight: 700;
      white-space: nowrap;
    }

    body.mtw-christmas-active ul.products li.product .details .price-label,
    body.mtw-christmas-active ul.product-groups li.product-group .details .price-label {
      color: #b8d2bf !important;
    }

    body.mtw-christmas-active ul.products li.product .details .price.retail .suffix,
    body.mtw-christmas-active ul.products li.product .details .retail-value .suffix,
    body.mtw-christmas-active ul.product-groups li.product-group .details .price.retail .suffix,
    body.mtw-christmas-active ul.product-groups li.product-group .details .retail-value .suffix {
      color: #bd5555 !important;
    }

    body.mtw-christmas-active ul.products li.product .details .price.retail,
    body.mtw-christmas-active ul.products li.product .details .retail-value,
    body.mtw-christmas-active ul.products li.product .details .price-label,
    body.mtw-christmas-active ul.product-groups li.product-group .details .price.retail,
    body.mtw-christmas-active ul.product-groups li.product-group .details .retail-value,
    body.mtw-christmas-active ul.product-groups li.product-group .details .price-label {
      color: #bd5555 !important;
    }

    body.mtw-christmas-active ul.products li.product .product-actions .button-outer.cart a,
    body.mtw-christmas-active ul.product-groups li.product-group .product-actions .button-outer.cart a,
    body.mtw-christmas-active ul.products li.product .product-actions .button-outer.notify a,
    body.mtw-christmas-active ul.product-groups li.product-group .product-actions .button-outer.notify a {
      position: relative;
      display: inline-flex;
      align-items: center;
      justify-content: center;
      width: auto !important;
      height: auto !important;
      min-height: 36px;
      padding: 8px 15px;
      border: 1px solid #f08e82 !important;
      border-radius: 6px !important;
      background: linear-gradient(180deg, #d84b4a, #a92c36) !important;
      box-shadow: 0 3px 0 #74202b, 0 5px 12px rgb(0 0 0 / 24%);
      color: #fff !important;
      font-weight: 700;
      letter-spacing: 0.025em;
      text-shadow: 0 1px 1px rgb(77 16 22 / 35%);
    }

    body.mtw-christmas-active #content #body table.results .notify,
    body.mtw-christmas-active #content #body table.products .notify,
    body.mtw-christmas-active #content #body .product-actions .button-outer.notify {
      width: auto !important;
      padding: 0 !important;
      text-align: left !important;
    }

    body.mtw-christmas-active #content #body table.results .notify a,
    body.mtw-christmas-active #content #body table.products .notify a,
    body.mtw-christmas-active #content #body .product-actions .button-outer.notify a,
    body.mtw-christmas-active #clearance-right .button-outer.notify a,
    body.mtw-christmas-active #single-product-actions .button-outer.notify a {
      display: inline-flex !important;
      align-items: center;
      justify-content: center;
      width: 36px !important;
      height: 36px !important;
      min-height: 36px;
      padding: 0 !important;
      border: 1px solid #f08e82 !important;
      border-radius: 6px !important;
      background: linear-gradient(180deg, #d84b4a, #a92c36) !important;
      box-shadow: 0 3px 0 #74202b, 0 5px 12px rgb(0 0 0 / 24%);
      color: #fff !important;
      font-size: 0 !important;
      font-weight: 700;
      letter-spacing: 0;
      line-height: 0;
      text-indent: 0 !important;
      text-shadow: 0 1px 1px rgb(77 16 22 / 35%);
    }

    body.mtw-christmas-active #content #body table.results .notify a::after,
    body.mtw-christmas-active #content #body table.products .notify a::after,
    body.mtw-christmas-active #content #body .product-actions .button-outer.notify a::after,
    body.mtw-christmas-active #clearance-right .button-outer.notify a::after,
    body.mtw-christmas-active #single-product-actions .button-outer.notify a::after {
      color: #fff;
      display: inline-block;
      font-size: 16px;
      line-height: 1;
      margin: 0;
    }

    body.mtw-christmas-active #content #body table.results .notify a::before,
    body.mtw-christmas-active #content #body table.products .notify a::before,
    body.mtw-christmas-active #content #body .product-actions .button-outer.notify a::before,
    body.mtw-christmas-active #clearance-right .button-outer.notify a::before,
    body.mtw-christmas-active #single-product-actions .button-outer.notify a::before {
      position: static;
      display: block;
      width: 16px;
      height: 16px;
      flex: 0 0 16px;
      margin: 0;
      padding: 0;
      color: #fff;
      content: "✉" !important;
      font-size: 16px;
      font-family: Arial, sans-serif;
      line-height: 16px;
      text-align: center;
      vertical-align: middle;
    }

    @media (max-width: 600px) {
      body.mtw-christmas-active #content #body #clearance-right .button-outer.notify a,
      body.mtw-christmas-active #clearance-right .button-outer.notify a {
        display: flex !important;
        width: 100% !important;
        height: auto !important;
        min-height: 36px;
        padding: 8px 12px !important;
        font-size: 13px !important;
        line-height: 1.2;
        white-space: nowrap;
      }

      body.mtw-christmas-active #content #body #clearance-right .button-outer.notify a::before,
      body.mtw-christmas-active #content #body #clearance-right .button-outer.notify a::after,
      body.mtw-christmas-active #clearance-right .button-outer.notify a::before,
      body.mtw-christmas-active #clearance-right .button-outer.notify a::after {
        display: none !important;
        content: none !important;
      }
    }

    body.mtw-christmas-active ul.products li.product .product-actions .button-outer.cart a:hover,
    body.mtw-christmas-active ul.product-groups li.product-group .product-actions .button-outer.cart a:hover,
    body.mtw-christmas-active ul.products li.product .product-actions .button-outer.cart a:focus-visible,
    body.mtw-christmas-active ul.product-groups li.product-group .product-actions .button-outer.cart a:focus-visible,
    body.mtw-christmas-active ul.products li.product .product-actions .button-outer.notify a:hover,
    body.mtw-christmas-active ul.product-groups li.product-group .product-actions .button-outer.notify a:hover,
    body.mtw-christmas-active ul.products li.product .product-actions .button-outer.notify a:focus-visible,
    body.mtw-christmas-active ul.product-groups li.product-group .product-actions .button-outer.notify a:focus-visible,
    body.mtw-christmas-active #content #body table.results .notify a:hover,
    body.mtw-christmas-active #content #body table.products .notify a:hover,
    body.mtw-christmas-active #content #body .product-actions .button-outer.notify a:hover,
    body.mtw-christmas-active #single-product-actions .button-outer.notify a:hover,
    body.mtw-christmas-active #content #body table.results .notify a:focus-visible,
    body.mtw-christmas-active #content #body table.products .notify a:focus-visible,
    body.mtw-christmas-active #content #body .product-actions .button-outer.notify a:focus-visible,
    body.mtw-christmas-active #single-product-actions .button-outer.notify a:focus-visible {
      border-color: #b7e09d !important;
      background: linear-gradient(180deg, #69b64f, #438b3d) !important;
      color: #fff !important;
      outline: 2px solid #d5efbd;
      outline-offset: 2px;
    }

    body.mtw-christmas-active.public_index #homepage-cta-hotproduct a.btn.see-all,
    body.mtw-christmas-active.public_index #home-categories ~ a.btn.see-all {
      border: 1px solid #78bb66 !important;
      border-radius: 6px !important;
      background: linear-gradient(180deg, #287c49, #185837) !important;
      box-shadow: 0 3px 0 #103f29, 0 5px 12px rgb(0 0 0 / 24%);
      color: #fff !important;
      font-weight: 700;
      text-shadow: 0 1px 1px rgb(0 0 0 / 30%);
    }

    body.mtw-christmas-active.public_index #homepage-cta-hotproduct a.btn.see-all:hover,
    body.mtw-christmas-active.public_index #home-categories ~ a.btn.see-all:hover,
    body.mtw-christmas-active.public_index #homepage-cta-hotproduct a.btn.see-all:focus-visible,
    body.mtw-christmas-active.public_index #home-categories ~ a.btn.see-all:focus-visible {
      border-color: #b7e09d !important;
      background: linear-gradient(180deg, #3e985c, #267345) !important;
      color: #fff !important;
    }

    body.mtw-christmas-active.public_index #home-about,
    body.mtw-christmas-active.public_index #home-brands {
      border: 1px solid #385440;
      background: linear-gradient(150deg, #1a2a20, #101b16) !important;
      color: #e7f1e9 !important;
    }

    body.mtw-christmas-active.public_index #home-brands #home-brands-inner > h3 {
      color: #e7f1e9 !important;
    }

    body.mtw-christmas-active #homepage-promotion > #clearance-left,
    body.mtw-christmas-active #body #block_28 {
      position: relative;
      border: 1px solid #426044;
      border-radius: 12px;
      background: linear-gradient(145deg, #203326, #111e17) !important;
      box-shadow: 0 7px 22px rgb(0 0 0 / 30%);
    }

    .mtw-christmas-hat {
      position: absolute;
      z-index: 5;
      top: -9px;
      left: 18%;
      width: 58px;
      height: 48px;
      overflow: visible;
      filter: drop-shadow(0 3px 3px rgb(0 0 0 / 35%));
      pointer-events: none;
      transform: rotate(-17deg);
      transform-origin: 50% 90%;
    }

    .mtw-christmas-hat svg {
      display: block;
      width: 100%;
      height: 100%;
    }

    .mtw-xmas-snow,
    .mtw-xmas-accumulation {
      position: fixed;
      inset: 0;
      width: 100%;
      height: 100%;
      pointer-events: none;
    }

    .mtw-xmas-accumulation {
      z-index: 2147483644;
    }

    .mtw-xmas-snow {
      z-index: 2147483645;
    }

    .mtw-xmas-toggle {
      position: fixed;
      z-index: 2147483647;
      right: 16px;
      bottom: 16px;
      padding: 9px 13px;
      border: 1px solid #8fc873;
      border-radius: 999px;
      background: #14251b;
      box-shadow: 0 4px 14px rgb(0 0 0 / 35%);
      color: #f1f8eb;
      cursor: pointer;
      font: 600 13px/1.2 Arial, sans-serif;
    }

    .mtw-xmas-toggle:hover,
    .mtw-xmas-toggle:focus-visible {
      background: #28432d;
      outline: 2px solid #c9ef9c;
      outline-offset: 2px;
    }

    @media (max-width: 600px) {
      .mtw-xmas-toggle {
        display: grid;
        place-items: center;
        width: 36px;
        height: 36px;
        overflow: hidden;
        padding: 0;
        border-radius: 50%;
        color: transparent;
        font-size: 0;
        text-shadow: none;
      }

      .mtw-xmas-toggle::before {
        color: #f1f8eb;
        content: "❄";
        font: 600 17px/1 Arial, sans-serif;
      }
    }

    @media (prefers-reduced-motion: reduce) {
      body.mtw-christmas-active ul.products li.product,
      body.mtw-christmas-active ul.product-groups li.product-group,
      body.mtw-christmas-active #body ul.categories li.category {
        transition: none !important;
      }

      body.mtw-christmas-active ul.products li.product::before,
      body.mtw-christmas-active ul.product-groups li.product-group::before {
        animation: none;
        opacity: 0.68;
      }
    }
  `;
  document.head.appendChild(style);

  var body = document.body;
  var isEmbedded = false;
  try {
    isEmbedded = window.self !== window.top;
  } catch (error) {
    isEmbedded = true;
  }

  var enabled = true;
  var logoImage = document.querySelector("#block_10 img");
  if (logoImage && logoImage.parentElement) {
    var logoLink = logoImage.parentElement;
    logoLink.style.position = "relative";
    logoLink.style.display = "inline-block";

    var hat = document.createElement("span");
    hat.className = "mtw-christmas-hat";
    hat.setAttribute("aria-hidden", "true");
    hat.innerHTML = '<svg viewBox="0 0 64 48" xmlns="http://www.w3.org/2000/svg"><path d="M10 35C15 16 26 5 43 4c-4 9 2 19 12 28-16-3-31-1-45 3Z" fill="#c92731"/><path d="M8 33c14-6 31-7 48-1l-2 9c-17-5-32-3-45 2Z" fill="#fff5df"/><circle cx="44" cy="5" r="5" fill="#fff5df"/><path d="M18 29c7-9 13-15 21-19" fill="none" stroke="#f36a58" stroke-linecap="round" stroke-width="2"/></svg>';
    logoLink.appendChild(hat);
  }

  var lightAnchor = document.querySelector("#nav-outer");
  if (lightAnchor) {
    var lightStrand = document.createElement("div");
    lightStrand.className = "mtw-holiday-lights";
    lightStrand.setAttribute("aria-hidden", "true");

    var lightSvg = document.createElementNS("http://www.w3.org/2000/svg", "svg");
    lightSvg.setAttribute("viewBox", "0 0 1200 44");
    lightSvg.setAttribute("preserveAspectRatio", "none");

    var lightWire = document.createElementNS("http://www.w3.org/2000/svg", "path");
    lightWire.setAttribute("class", "wire");
    lightWire.setAttribute("d", "M0 0 C50 0 50 20 100 20 S150 0 200 0 S250 20 300 20 S350 0 400 0 S450 20 500 20 S550 0 600 0 S650 20 700 20 S750 0 800 0 S850 20 900 20 S950 0 1000 0 S1050 20 1100 20 S1150 0 1200 0");
    lightSvg.appendChild(lightWire);

    lightStrand.appendChild(lightSvg);
    lightAnchor.appendChild(lightStrand);

    var bulbColors = ["#ffd875", "#f15b59", "#79d16b", "#6fc9f2"];
    var currentLightCount = 0;
    function renderHolidayBulbs() {
      var bulbCount = window.innerWidth <= 600 ? 15 : 31;
      if (bulbCount === currentLightCount) {
        return;
      }
      currentLightCount = bulbCount;

      var oldSockets = lightSvg.querySelectorAll(".socket");
      for (var socketIndex = 0; socketIndex < oldSockets.length; socketIndex += 1) {
        oldSockets[socketIndex].remove();
      }
      var oldBulbs = lightSvg.querySelectorAll(".bulb");
      for (var oldBulbIndex = 0; oldBulbIndex < oldBulbs.length; oldBulbIndex += 1) {
        oldBulbs[oldBulbIndex].remove();
      }

      for (var bulbIndex = 0; bulbIndex < bulbCount; bulbIndex += 1) {
        var bulbX = 20 + bulbIndex * 1160 / (bulbCount - 1);
        var wireY = 10 - 10 * Math.cos((bulbX / 100) * Math.PI);
        var bulbY = wireY + 8 + bulbIndex % 4 * 1.5;
        var lightSocket = document.createElementNS("http://www.w3.org/2000/svg", "line");
        lightSocket.setAttribute("class", "socket");
        lightSocket.setAttribute("x1", bulbX);
        lightSocket.setAttribute("y1", wireY);
        lightSocket.setAttribute("x2", bulbX);
        lightSocket.setAttribute("y2", bulbY - 4);
        lightSvg.appendChild(lightSocket);

        var bulb = document.createElementNS("http://www.w3.org/2000/svg", "g");
        bulb.setAttribute("class", "bulb");
        bulb.setAttribute("transform", "translate(" + bulbX + " " + bulbY + ")");
        var bulbColor = bulbColors[bulbIndex % bulbColors.length];
        var bulbShape = document.createElementNS("http://www.w3.org/2000/svg", "path");
        bulbShape.setAttribute("class", "bulb-shape");
        bulbShape.setAttribute("d", "M-2.2-4V-1.5C-6 2-4.8 8.2 0 9c4.8-.8 6-7 2.2-10.5V-4Z");
        bulbShape.setAttribute("fill", bulbColor);
        bulb.appendChild(bulbShape);
        var bulbHighlight = document.createElementNS("http://www.w3.org/2000/svg", "circle");
        bulbHighlight.setAttribute("class", "bulb-highlight");
        bulbHighlight.setAttribute("cx", "-1.2");
        bulbHighlight.setAttribute("cy", "2");
        bulbHighlight.setAttribute("r", "1.1");
        bulb.appendChild(bulbHighlight);
        bulb.style.setProperty("--bulb-glow", bulbColor);
        bulbShape.style.animationDelay = (bulbIndex % 8 * 0.16) + "s";
        lightSvg.appendChild(bulb);
      }
    }

    renderHolidayBulbs();
    window.addEventListener("resize", renderHolidayBulbs);
  }

  var canvas = document.createElement("canvas");
  canvas.className = "mtw-xmas-snow";
  canvas.setAttribute("aria-hidden", "true");
  var context = canvas.getContext("2d");
  if (!context) {
    console.error("MTW Christmas effects: canvas rendering is unavailable.");
  }

  var accumulationCanvas = document.createElement("canvas");
  accumulationCanvas.className = "mtw-xmas-accumulation";
  accumulationCanvas.setAttribute("aria-hidden", "true");
  var accumulationContext = accumulationCanvas.getContext("2d");
  if (!accumulationContext) {
    console.error("MTW Christmas effects: snow accumulation rendering is unavailable.");
  }

  var flakes = [];
  var width = 0;
  var height = 0;
  var pixelRatio = 1;
  var lastFrame = 0;
  var snowSurfaces = [];
  var surfaceProgress = new WeakMap();
  var animationFrameId = null;
  var refreshFramePending = false;
  var canvasClipPath = null;
  var prefersReducedMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
  var snowSurfaceSelector = "#nav-outer, .search-outer, #gallery_1, #clearance-left, #clearance-right, #body #block_28, #home-brands ul.tag-values li.tag-value, #body ul.products li.product, #body ul.product-groups li.product-group, #body ul.categories li.category";

  function setCanvasClipPath(value) {
    if (canvasClipPath === value) {
      return;
    }

    canvasClipPath = value;
    canvas.style.clipPath = value;
    accumulationCanvas.style.clipPath = value;
  }

  function refreshSnowPosition() {
    if (refreshFramePending) {
      return;
    }

    refreshFramePending = true;
    window.requestAnimationFrame(function () {
      refreshFramePending = false;
      if (!enabled) {
        return;
      }

      collectSnowSurfaces();
      drawSnowAccumulation(window.performance.now(), 0);
    });
  }

  function resumeSnow() {
    if (!enabled || isEmbedded) {
      return;
    }

    lastFrame = 0;
    collectSnowSurfaces();
    drawSnow(window.performance.now(), 0);
    startSnowAnimation();
  }

  var observedFrames = new WeakSet();
  var observedFrameDocuments = new WeakSet();
  window.addEventListener("scroll", refreshSnowPosition, { passive: true });
  window.addEventListener("resize", refreshSnowPosition);
  window.addEventListener("pageshow", resumeSnow);
  document.addEventListener("visibilitychange", function () {
    if (!document.hidden) {
      resumeSnow();
    }
  });

  function collectSnowSurfaces() {
    function collect(documentToInspect, offsetX, offsetY, scaleX, scaleY, clipLeft, clipTop, clipRight, clipBottom) {
      var elements = documentToInspect.querySelectorAll(snowSurfaceSelector);
      for (var surfaceIndex = 0; surfaceIndex < elements.length; surfaceIndex += 1) {
        var element = elements[surfaceIndex];
        if (element.matches("#clearance-right") === false && element.closest(".owl-carousel, .carousel-wrapper, .owl-item")) {
          continue;
        }

        var rect = element.getBoundingClientRect();
        if (element.matches("#clearance-right") && documentToInspect.defaultView.innerWidth <= 600) {
          var activeProduct = element.querySelector(".owl-item.active li.product");
          if (activeProduct) {
            rect = activeProduct.getBoundingClientRect();
          }
        }
        var top = offsetY + rect.top * scaleY;
        var bottom = offsetY + rect.bottom * scaleY;
        if (
          rect.width <= 0 ||
          rect.height <= 0 ||
          bottom <= clipTop ||
          top >= clipBottom
        ) {
          continue;
        }

        var left = offsetX + rect.left * scaleX;
        var right = offsetX + rect.right * scaleX;
        left = Math.max(0, clipLeft, left);
        right = Math.min(width, clipRight, right);
        if (right <= left) {
          continue;
        }

        if (!surfaceProgress.has(element)) {
          var patches = [];
          var isProductCard = element.matches("#body ul.products li.product, #body ul.product-groups li.product-group, #body ul.categories li.category, #home-brands ul.tag-values li.tag-value");
          var patchCount = Math.max(4, Math.min(28, Math.ceil(rect.width / (isProductCard ? 36 : 65))));
          for (var patchIndex = 0; patchIndex < patchCount; patchIndex += 1) {
            var offset = (patchIndex + Math.random() * (isProductCard ? 0.12 : 0.35)) / patchCount;
            patches.push({
              offset: offset,
              width: rect.width / patchCount * (isProductCard ? 1.1 + Math.random() * 0.35 : 0.65 + Math.random() * 1.15),
              phase: 0.45 + Math.random() * 1.1,
              crest: 0.3 + Math.random() * 0.4,
              drip: isProductCard && Math.random() < 0.38,
              dripOffset: 0.25 + Math.random() * 0.5,
              dripWidth: 3 + Math.random() * 5,
              dripPhase: 0.2 + Math.random() * 0.38
            });
          }
          surfaceProgress.set(element, { depth: 0, patches: patches, isProductCard: isProductCard });
        }
        snowSurfaces.push({
          element: element,
          left: left,
          right: right,
          top: top,
          clipLeft: clipLeft,
          clipTop: clipTop,
          clipRight: clipRight,
          clipBottom: clipBottom
        });
      }
    }

    snowSurfaces = [];
    if (isEmbedded) {
      setCanvasClipPath("");
      collect(document, 0, 0, 1, 1, 0, 0, width, height);
      return;
    }

    var frames = document.querySelectorAll("iframe");
    var previewFrames = [];
    for (var candidateIndex = 0; candidateIndex < frames.length; candidateIndex += 1) {
      var candidateFrame = frames[candidateIndex];
      var candidateDocument = candidateFrame.contentDocument;
      if (!candidateDocument || !candidateDocument.documentElement || !candidateDocument.querySelector(snowSurfaceSelector)) {
        continue;
      }

      previewFrames.push({
        frame: candidateFrame,
        document: candidateDocument
      });
    }

    if (previewFrames.length === 0) {
      setCanvasClipPath("");
      collect(document, 0, 0, 1, 1, 0, 0, width, height);
      return;
    }

    for (var frameIndex = 0; frameIndex < previewFrames.length; frameIndex += 1) {
      var frame = previewFrames[frameIndex].frame;
      if (!observedFrames.has(frame)) {
        frame.addEventListener("load", function (event) {
          var loadedFrame = event.currentTarget;
          loadedFrame.contentWindow.postMessage({
            type: "mtw-christmas-toggle",
            enabled: enabled
          }, "*");
          resumeSnow();
        });
        observedFrames.add(frame);
      }

      var frameDocument = previewFrames[frameIndex].document;
      var frameRoot = frameDocument && frameDocument.documentElement;
      if (!observedFrameDocuments.has(frameDocument)) {
        frameDocument.defaultView.addEventListener("scroll", refreshSnowPosition, { passive: true });
        frameDocument.defaultView.addEventListener("resize", refreshSnowPosition);
        observedFrameDocuments.add(frameDocument);
      }
      var frameRect = frame.getBoundingClientRect();
      var scaleX = frame.clientWidth / (frameRoot.clientWidth || frame.clientWidth || 1);
      var scaleY = frame.clientHeight / (frameRoot.clientHeight || frame.clientHeight || 1);
      var clipLeft = Math.max(0, frameRect.left);
      var clipTop = Math.max(0, frameRect.top);
      var clipRight = Math.min(width, frameRect.right);
      var clipBottom = Math.min(height, frameRect.bottom);
      var clipPath = "inset(" + clipTop + "px " + Math.max(0, width - clipRight) + "px " +
        Math.max(0, height - clipBottom) + "px " + clipLeft + "px)";
      setCanvasClipPath(clipPath);
      collect(frameDocument, frameRect.left, frameRect.top, scaleX, scaleY, clipLeft, clipTop, clipRight, clipBottom);
    }
  }

  function drawSnowAccumulation(timestamp, delta) {
    if (!accumulationContext) {
      return;
    }

    collectSnowSurfaces();

    accumulationContext.clearRect(0, 0, width, height);
    var buildAmount = Math.min(delta, 2) * 0.002;
    for (var surfaceIndex = 0; surfaceIndex < snowSurfaces.length; surfaceIndex += 1) {
      var surface = snowSurfaces[surfaceIndex];
      var progress = surfaceProgress.get(surface.element);
      progress.depth = Math.min(28, progress.depth + buildAmount);
      accumulationContext.save();
      accumulationContext.beginPath();
      accumulationContext.rect(
        surface.clipLeft,
        surface.clipTop,
        surface.clipRight - surface.clipLeft,
        surface.clipBottom - surface.clipTop
      );
      accumulationContext.clip();
      for (var patchIndex = 0; patchIndex < progress.patches.length; patchIndex += 1) {
        var patch = progress.patches[patchIndex];
        var patchWidth = Math.min(patch.width, surface.right - surface.left);
        var patchDepth = progress.isProductCard
          ? Math.min(7, 2.2 + progress.depth * patch.phase)
          : Math.min(12, progress.depth * patch.phase);
        if (patchDepth < 0.15) {
          continue;
        }

        var patchLeft = surface.left + patch.offset * Math.max(0, surface.right - surface.left - patchWidth);
        var patchRight = patchLeft + patchWidth;
        var crestX = patchLeft + patchWidth * patch.crest;
        accumulationContext.beginPath();
        accumulationContext.moveTo(patchLeft, surface.top);
        accumulationContext.quadraticCurveTo(
          patchLeft + (crestX - patchLeft) * 0.45,
          surface.top - patchDepth * 0.15,
          crestX,
          surface.top - patchDepth
        );
        accumulationContext.quadraticCurveTo(
          crestX + (patchRight - crestX) * 0.55,
          surface.top - patchDepth * 0.85,
          patchRight,
          surface.top
        );
        accumulationContext.closePath();
        accumulationContext.fillStyle = "rgba(242, 248, 245, 0.92)";
        accumulationContext.fill();

        if (progress.isProductCard && patch.drip) {
          var dripX = patchLeft + patchWidth * patch.dripOffset;
          var dripWidth = Math.min(patch.dripWidth, patchWidth * 0.45);
          var dripDepth = Math.min(9, patchDepth * patch.dripPhase);
          accumulationContext.beginPath();
          accumulationContext.moveTo(dripX - dripWidth / 2, surface.top);
          accumulationContext.quadraticCurveTo(
            dripX,
            surface.top + dripDepth * 1.35,
            dripX + dripWidth / 2,
            surface.top
          );
          accumulationContext.closePath();
          accumulationContext.fill();
        }
      }
      accumulationContext.restore();
    }
  }

  function resizeSnow() {
    if (!context) {
      return;
    }

    width = window.innerWidth;
    height = window.innerHeight;
    pixelRatio = Math.min(window.devicePixelRatio || 1, 2);
    canvas.width = Math.round(width * pixelRatio);
    canvas.height = Math.round(height * pixelRatio);
    context.setTransform(pixelRatio, 0, 0, pixelRatio, 0, 0);
    accumulationCanvas.width = canvas.width;
    accumulationCanvas.height = canvas.height;
    if (accumulationContext) {
      accumulationContext.setTransform(pixelRatio, 0, 0, pixelRatio, 0, 0);
    }

    var isSmallScreen = width <= 600;
    var flakeCount = Math.min(110, Math.max(isSmallScreen ? 18 : 32, Math.round(width / (isSmallScreen ? 24 : 18))));
    flakes = [];
    for (var index = 0; index < flakeCount; index += 1) {
      flakes.push({
        x: Math.random() * width,
        y: Math.random() * height,
        radius: (isSmallScreen ? 1.2 : 1.5) + Math.random() * (isSmallScreen ? 1.7 : 2.4),
        speed: (isSmallScreen ? 0.35 : 0.45) + Math.random() * (isSmallScreen ? 0.9 : 1.2),
        sway: 0.35 + Math.random() * 1.1,
        phase: Math.random() * Math.PI * 2,
        opacity: 0.3 + Math.random() * 0.45
      });
    }
    drawSnow(0, 0);
  }

  function drawSnow(timestamp, delta) {
    if (!enabled) {
      return;
    }

    drawSnowAccumulation(timestamp, prefersReducedMotion ? 0 : delta);
    if (context) {
      context.clearRect(0, 0, width, height);
      for (var index = 0; index < flakes.length; index += 1) {
        var flake = flakes[index];
        if (!prefersReducedMotion && delta > 0) {
          flake.y += flake.speed * delta;
          flake.x += Math.sin(timestamp * 0.0007 + flake.phase) * flake.sway * delta * 0.35;
          if (flake.y > height + 5) {
            flake.y = -5;
            flake.x = Math.random() * width;
          }
          if (flake.x < -5) flake.x = width + 5;
          if (flake.x > width + 5) flake.x = -5;
        }

        context.beginPath();
        context.arc(flake.x, flake.y, flake.radius, 0, Math.PI * 2);
        context.fillStyle = "rgba(255, 255, 255, " + flake.opacity + ")";
        context.fill();
      }
    }
  }

  function animateSnow(timestamp) {
    animationFrameId = null;
    if (!enabled || prefersReducedMotion) {
      return;
    }

    var delta = lastFrame ? Math.min(timestamp - lastFrame, 40) / 16.67 : 0;
    lastFrame = timestamp;
    drawSnow(timestamp, delta);
    if (enabled) {
      animationFrameId = window.requestAnimationFrame(animateSnow);
    }
  }

  function startSnowAnimation() {
    if (enabled && !prefersReducedMotion && context && animationFrameId === null) {
      animationFrameId = window.requestAnimationFrame(animateSnow);
    }
  }

  function stopSnowAnimation() {
    if (animationFrameId !== null) {
      window.cancelAnimationFrame(animationFrameId);
      animationFrameId = null;
    }
    lastFrame = 0;
  }

  function setEnabled(value) {
    enabled = Boolean(value);
    if (enabled) {
      drawSnow(0, 0);
      startSnowAnimation();
    } else {
      stopSnowAnimation();
    }
    body.classList.toggle("mtw-christmas-active", enabled);
    if (canvas.parentElement) {
      canvas.hidden = !enabled;
      accumulationCanvas.hidden = !enabled;
    }

    if (!isEmbedded) {
      toggleButton.textContent = enabled ? "❄ Holiday effects: On" : "❄ Holiday effects: Off";
      var frames = document.querySelectorAll("iframe");
      for (var index = 0; index < frames.length; index += 1) {
        var frameDocument = frames[index].contentDocument;
        if (!frameDocument || !frameDocument.querySelector(snowSurfaceSelector)) {
          continue;
        }

        frames[index].contentWindow.postMessage({
          type: "mtw-christmas-toggle",
          enabled: enabled
        }, "*");
      }
    }

  }

  body.classList.add("mtw-christmas-active");
  if (context && !isEmbedded) {
    document.body.appendChild(accumulationCanvas);
    document.body.appendChild(canvas);
    window.addEventListener("resize", resizeSnow);
    resizeSnow();
    startSnowAnimation();
  }
  var toggleButton = null;
  if (!isEmbedded) {
    toggleButton = document.createElement("button");
    toggleButton.className = "mtw-xmas-toggle";
    toggleButton.type = "button";
    toggleButton.textContent = "❄ Holiday effects: On";
    toggleButton.setAttribute("aria-pressed", "true");
    toggleButton.addEventListener("click", function () {
      setEnabled(!enabled);
      toggleButton.setAttribute("aria-pressed", String(enabled));
    });
    document.body.appendChild(toggleButton);

    window.addEventListener("message", function (event) {
      if (event.data && event.data.type === "mtw-christmas-toggle") {
        setEnabled(event.data.enabled);
      }
    });
  } else {
    window.addEventListener("message", function (event) {
      if (event.data && event.data.type === "mtw-christmas-toggle") {
        setEnabled(event.data.enabled);
      }
    });
  }

  window.__mtwChristmas = {
    setEnabled: setEnabled
  };
})();
