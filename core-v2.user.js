// ==UserScript==
// @name         Yurineko PC Viewport (Core V2)
// @name:vi      Viewport Yurineko PC (Core V2)
// @namespace    http://tampermonkey.net/
// @version      1.2.0
// @description  Adds a customizable zoom slider to fit your screen perfectly
// @description:vi Thêm thanh trượt thu phóng Yurineko
// @author       Mireko
// @match        *://*.yurinekoz.com/*
// @icon         https://www.google.com/s2/favicons?sz=64&domain=yurinekoz.com
// @grant        none
// @license      MIT
// ==/UserScript==

(() => {
  "use strict";

  const CONFIG = Object.freeze({
    STORAGE_KEY: "yurineko_canvas_zoom",
    UI_STATE_KEY: "yurineko_ui_expanded",
    WRAPPER_ID: "yurineko-zoom-wrapper",
    STYLE_ID: "yurineko-zoom-style",
    READER_SELECTOR: 'div[aria-label^="Page"]',
    READER_PARENT_SELECTOR: "div.relative.shadow-xl",
    MOBILE_BREAKPOINT_PX: 768,
    OBSERVER_DEBOUNCE_MS: 250,
    ZOOM: Object.freeze({
      DEFAULT: 80,
      MAX: 200,
      MIN: 30,
      STEP: 5,
    }),
  });

  const getInitialZoom = () => {
    const storedZoom = Number.parseInt(localStorage.getItem(CONFIG.STORAGE_KEY), 10);
    if (Number.isNaN(storedZoom)) return CONFIG.ZOOM.DEFAULT;
    return Math.min(Math.max(storedZoom, CONFIG.ZOOM.MIN), CONFIG.ZOOM.MAX);
  };

  let currentZoom = getInitialZoom();
  let isExpanded = localStorage.getItem(CONFIG.UI_STATE_KEY) !== "false";
  let isUIInjected = false;
  let readerContainerNode = null;

  const injectBaseCSS = () => {
    if (document.getElementById(CONFIG.STYLE_ID)) return;

    const styleEl = document.createElement("style");
    styleEl.id = CONFIG.STYLE_ID;

    styleEl.textContent = `
      :root {
        --yuri-zoom-level: ${currentZoom}%;
        --yuri-margin-left: calc(50% - (${currentZoom} * 0.5%));
        --panel-bg: #ffffff;
        --text-color: #1f2937;
        --btn-bg: #ffffff;
        --icon-color: #EE5A8A;
        --shadow-panel: 0 10px 25px rgba(0, 0, 0, 0.15);
        --shadow-btn: 0 4px 12px rgba(0, 0, 0, 0.15);
        --shadow-hover: 0 0 15px rgba(238, 90, 138, 0.4);
        --shadow-closed: -4px 0 12px rgba(0, 0, 0, 0.1);
      }

      html.dark {
        --panel-bg: #18181b;
        --text-color: #ffffff;
        --btn-bg: #18181b;
        --icon-color: #F38FAC;
        --shadow-panel: 0 10px 25px rgba(0, 0, 0, 0.8);
        --shadow-btn: 0 4px 12px rgba(0, 0, 0, 0.5);
        --shadow-hover: 0 0 15px rgba(238, 90, 138, 0.6);
        --shadow-closed: -4px 0 12px rgba(0, 0, 0, 0.4);
      }

      .yuri-optimized-reader {
        display: block !important;
        max-width: none !important;
        position: relative !important;
        width: var(--yuri-zoom-level) !important;
        margin-left: var(--yuri-margin-left) !important;
        left: auto !important;
        margin-top: 0 !important;
        margin-right: 0 !important;
        margin-bottom: 0.5rem !important;
      }

      ${CONFIG.READER_SELECTOR}, ${CONFIG.READER_SELECTOR} canvas {
        width: 100% !important;
        max-width: 100% !important;
        height: auto !important;
      }

      #${CONFIG.WRAPPER_ID} {
        position: fixed;
        top: 50%;
        right: 20px;
        transform: translateY(-50%);
        display: flex;
        flex-direction: column;
        align-items: center;
        gap: 10px;
        z-index: 999999;
      }

      @media (max-width: ${CONFIG.MOBILE_BREAKPOINT_PX}px) {
        #${CONFIG.WRAPPER_ID} {
          display: none !important;
        }
      }

      .yuri-btn-toggle {
        background: var(--btn-bg);
        border: 2px solid #EE5A8A;
        border-radius: 50%;
        width: 40px;
        height: 40px;
        display: flex;
        justify-content: center;
        align-items: center;
        cursor: pointer;
        box-shadow: var(--shadow-btn);
        transition: opacity 0.2s ease, box-shadow 0.2s ease, background-color 0.3s ease, transform 0.3s cubic-bezier(0.4, 0, 0.2, 1);
      }

      .yuri-btn-toggle:not(.closed):hover {
        box-shadow: var(--shadow-hover);
      }

      .yuri-btn-toggle:focus-visible {
        outline: 2px solid var(--icon-color);
        outline-offset: 2px;
      }

      .yuri-btn-toggle.closed {
        transform: translateX(20px);
        opacity: 0.25;
        box-shadow: none;
      }

      .yuri-btn-toggle.closed:hover {
        opacity: 1;
        box-shadow: var(--shadow-closed);
      }

      .yuri-panel {
        background: linear-gradient(var(--panel-bg), var(--panel-bg)) padding-box, linear-gradient(135deg, #F38FAC, #EE5A8A) border-box;
        border: 2px solid transparent;
        border-radius: 12px;
        color: var(--text-color);
        padding: 15px 10px;
        display: flex;
        flex-direction: column;
        align-items: center;
        gap: 12px;
        box-shadow: var(--shadow-panel);
        font-family: monospace;
        font-size: 14px;
        backdrop-filter: blur(5px);
        transform-origin: right center;
        transition: transform 0.3s cubic-bezier(0.4, 0, 0.2, 1), opacity 0.3s ease;
        pointer-events: auto;
        user-select: none;
      }

      .yuri-panel.collapsed {
        transform: translateX(150%) scale(0.8);
        opacity: 0;
        pointer-events: none;
      }

      .yuri-btn-toggle svg {
        stroke: var(--icon-color);
        transition: transform 0.3s ease, stroke 0.3s ease;
      }

      .yuri-btn-toggle.closed svg {
        transform: rotate(180deg);
      }

      #zoom-slider {
        writing-mode: vertical-lr;
        direction: rtl;
        width: 8px;
        height: 140px;
        cursor: ns-resize;
        accent-color: #EE5A8A;
      }

      #zoom-value {
        font-family: sans-serif;
        font-weight: bold;
        padding-top: 2px;
        display: inline-block;
        width: 40px;
        text-align: center;
      }
    `;
    document.head.appendChild(styleEl);
  };

  const toggleUIState = (panelEl, buttonEl) => {
    isExpanded = !isExpanded;
    localStorage.setItem(CONFIG.UI_STATE_KEY, String(isExpanded));
    panelEl.classList.toggle("collapsed", !isExpanded);
    buttonEl.classList.toggle("closed", !isExpanded);
    buttonEl.setAttribute("aria-expanded", String(isExpanded));
  };

  const applyZoomToContainer = (zoomValue) => {
    document.documentElement.style.setProperty("--yuri-zoom-level", `${zoomValue}%`);
    document.documentElement.style.setProperty(
      "--yuri-margin-left",
      `calc(50% - (${zoomValue} * 0.5%))`
    );

    if (!readerContainerNode || !readerContainerNode.isConnected) {
      const firstReaderPage = document.querySelector(CONFIG.READER_SELECTOR);
      if (firstReaderPage) {
        readerContainerNode =
          firstReaderPage.closest(CONFIG.READER_PARENT_SELECTOR) ||
          firstReaderPage.parentElement;
      }
    }

    if (
      readerContainerNode &&
      !readerContainerNode.classList.contains("yuri-optimized-reader")
    ) {
      readerContainerNode.classList.add("yuri-optimized-reader");
    }
  };

  const mountUI = () => {
    if (document.getElementById(CONFIG.WRAPPER_ID)) return;

    const wrapperEl = document.createElement("div");
    wrapperEl.id = CONFIG.WRAPPER_ID;
    wrapperEl.innerHTML = `
      <div class="yuri-btn-toggle ${isExpanded ? "" : "closed"}" id="yuri-toggle-btn" title="Toggle Zoom Panel" aria-label="Toggle Zoom Panel" aria-expanded="${isExpanded}" tabindex="0">
        <svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round">
          <polyline points="13 17 18 12 13 7"></polyline>
          <polyline points="6 17 11 12 6 7"></polyline>
        </svg>
      </div>
      <div class="yuri-panel ${isExpanded ? "" : "collapsed"}" id="yuri-zoom-panel">
        <svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="url(#yuri-grad)" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round">
          <defs>
            <linearGradient id="yuri-grad" x1="0%" y1="0%" x2="100%" y2="100%">
              <stop offset="0%" stop-color="#F38FAC" />
              <stop offset="100%" stop-color="#EE5A8A" />
            </linearGradient>
          </defs>
          <circle cx="11" cy="11" r="8"></circle>
          <line x1="21" y1="21" x2="16.65" y2="16.65"></line>
        </svg>
        <input type="range" id="zoom-slider" aria-label="Zoom level" min="${CONFIG.ZOOM.MIN}" max="${CONFIG.ZOOM.MAX}" value="${currentZoom}" step="${CONFIG.ZOOM.STEP}">
        <span id="zoom-value">${currentZoom}%</span>
      </div>
    `;
    document.body.appendChild(wrapperEl);

    const sliderEl = document.getElementById("zoom-slider");
    const valueDisplayEl = document.getElementById("zoom-value");
    const toggleBtnEl = document.getElementById("yuri-toggle-btn");
    const panelEl = document.getElementById("yuri-zoom-panel");

    let animationFrameId = null;
    applyZoomToContainer(currentZoom);

    sliderEl.addEventListener("input", (event) => {
      const targetZoom = event.target.value;
      valueDisplayEl.textContent = `${targetZoom}%`;

      if (animationFrameId !== null) {
        cancelAnimationFrame(animationFrameId);
      }

      animationFrameId = requestAnimationFrame(() => {
        currentZoom = targetZoom;
        applyZoomToContainer(targetZoom);
        animationFrameId = null;
      });
    });

    sliderEl.addEventListener("change", (event) => {
      localStorage.setItem(CONFIG.STORAGE_KEY, event.target.value);
    });

    toggleBtnEl.addEventListener("click", () => toggleUIState(panelEl, toggleBtnEl));
    toggleBtnEl.addEventListener("keydown", (event) => {
      if (event.key === "Enter" || event.key === " ") {
        event.preventDefault();
        toggleUIState(panelEl, toggleBtnEl);
      }
    });

    isUIInjected = true;
  };

  const unmountUI = () => {
    const wrapperEl = document.getElementById(CONFIG.WRAPPER_ID);
    if (wrapperEl) wrapperEl.remove();
    isUIInjected = false;
  };

  const initSPAObserver = () => {
    let debounceTimerId = null;

    const observer = new MutationObserver(() => {
      if (debounceTimerId !== null) return;

      debounceTimerId = setTimeout(() => {
        const hasReader = document.querySelector(CONFIG.READER_SELECTOR) !== null;

        if (hasReader && !isUIInjected) {
          injectBaseCSS();
          mountUI();
        } else if (!hasReader && isUIInjected) {
          unmountUI();
          readerContainerNode = null;
        } else if (hasReader && isUIInjected) {
          applyZoomToContainer(currentZoom);
        }

        debounceTimerId = null;
      }, CONFIG.OBSERVER_DEBOUNCE_MS);
    });

    observer.observe(document.body, { childList: true, subtree: true });
  };

  initSPAObserver();
})();