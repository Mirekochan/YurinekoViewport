// ==UserScript==
// @name         Yurineko PC Viewport
// @name:vi      Tối ưu Viewport Yurineko PC
// @namespace    http://tampermonkey.net/
// @version      1.0
// @description  Optimized manga reader for Yurineko. Smooth zoom, zero-lag, rAF sync, and pure bare-metal performance.
// @description:vi Kéo dãn khung đọc truyện cho Yurineko. Mượt mà, không giật lag, chỉ tập trung 1 tính năng duy nhất.
// @author       Mireko
// @match        *://*.yurinekoz.com/*
// @icon         https://www.google.com/s2/favicons?sz=64&domain=yurinekoz.com
// @grant        none
// @license      MIT
// ==/UserScript==

(function () {
  "use strict";

  const CONFIG = {
    STORAGE_KEY: "yurineko_canvas_zoom",
    UI_STATE_KEY: "yurineko_ui_expanded",
    WRAPPER_ID: "yurineko-zoom-wrapper",
    STYLE_ID: "yurineko-zoom-style",
    READER_SELECTOR: 'div[aria-label^="Page"]',
    ZOOM: { DEFAULT: 80, MAX: 200, MIN: 30 },
  };

  const getInitialZoom = () => {
    const stored = parseInt(localStorage.getItem(CONFIG.STORAGE_KEY), 10);
    if (Number.isNaN(stored)) return CONFIG.ZOOM.DEFAULT;
    return Math.min(Math.max(stored, CONFIG.ZOOM.MIN), CONFIG.ZOOM.MAX);
  };

  let currentZoom = getInitialZoom();
  let isExpanded = localStorage.getItem(CONFIG.UI_STATE_KEY) !== "false";
  let isUIInjected = false;

  const injectBaseCSS = () => {
    if (document.getElementById(CONFIG.STYLE_ID)) return;

    const styleEl = document.createElement("style");
    styleEl.id = CONFIG.STYLE_ID;
    styleEl.innerHTML = `
            :root {
                --yuri-zoom: ${currentZoom}%;
                --panel-bg: #ffffff; --text-color: #1f2937; --btn-bg: #ffffff; --icon-color: #EE5A8A;
                --shadow-panel: 0 10px 25px rgba(0,0,0,0.15); --shadow-btn: 0 4px 12px rgba(0,0,0,0.15);
                --shadow-hover: 0 0 15px rgba(238, 90, 138, 0.4); --shadow-closed: -4px 0 12px rgba(0,0,0,0.1);
            }
            html.dark {
                --panel-bg: #18181b; --text-color: #ffffff; --btn-bg: #18181b; --icon-color: #F38FAC;
                --shadow-panel: 0 10px 25px rgba(0,0,0,0.8); --shadow-btn: 0 4px 12px rgba(0,0,0,0.5);
                --shadow-hover: 0 0 15px rgba(238, 90, 138, 0.6); --shadow-closed: -4px 0 12px rgba(0,0,0,0.4);
            }
            div.container:has(${CONFIG.READER_SELECTOR}) {
                display: flex !important; flex-direction: column !important; align-items: center !important;
            }
            div.relative.shadow-xl:has(${CONFIG.READER_SELECTOR}) {
                width: var(--yuri-zoom) !important; max-width: none !important; margin: 0 !important;
                position: relative !important; left: auto !important; transform: none !important; align-self: center !important;
            }
            ${CONFIG.READER_SELECTOR}, ${CONFIG.READER_SELECTOR} canvas {
                width: 100% !important; max-width: 100% !important; height: auto !important;
            }
            /* UI Wrapper */
            #${CONFIG.WRAPPER_ID} {
                position: fixed; top: 50%; right: 20px; transform: translateY(-50%);
                display: flex; flex-direction: column; align-items: center; gap: 10px; z-index: 999999;
            }
            .yuri-btn-toggle {
                background: var(--btn-bg); border: 2px solid #EE5A8A; border-radius: 50%;
                width: 40px; height: 40px; display: flex; justify-content: center; align-items: center;
                cursor: pointer; box-shadow: var(--shadow-btn);
                transition: opacity 0.2s ease, box-shadow 0.2s ease, background-color 0.3s ease, transform 0.3s cubic-bezier(0.4, 0, 0.2, 1);
            }
            .yuri-btn-toggle:not(.closed):hover { box-shadow: var(--shadow-hover); }
            .yuri-btn-toggle.closed { transform: translateX(20px); opacity: 0.25; box-shadow: none; }
            .yuri-btn-toggle.closed:hover { opacity: 1; box-shadow: var(--shadow-closed); }
            .yuri-panel {
                background: linear-gradient(var(--panel-bg), var(--panel-bg)) padding-box, linear-gradient(135deg, #F38FAC, #EE5A8A) border-box;
                border: 2px solid transparent; border-radius: 12px; color: var(--text-color);
                padding: 15px 10px; display: flex; flex-direction: column; align-items: center; gap: 12px;
                box-shadow: var(--shadow-panel); font-family: monospace; font-size: 14px;
                backdrop-filter: blur(5px); transform-origin: right center;
                transition: transform 0.3s cubic-bezier(0.4, 0, 0.2, 1), opacity 0.3s ease;
                pointer-events: auto; user-select: none;
            }
            .yuri-panel.collapsed { transform: translateX(150%) scale(0.8); opacity: 0; pointer-events: none; }
            .yuri-btn-toggle svg { stroke: var(--icon-color); transition: transform 0.3s ease, stroke 0.3s ease; }
            .yuri-btn-toggle.closed svg { transform: rotate(180deg); }
        `;
    document.head.appendChild(styleEl);
  };

  const toggleUIState = (panel, btn) => {
    isExpanded = !isExpanded;
    localStorage.setItem(CONFIG.UI_STATE_KEY, isExpanded.toString());
    panel.classList.toggle("collapsed", !isExpanded);
    btn.classList.toggle("closed", !isExpanded);
  };

  const mountUI = () => {
    if (window.innerWidth <= 768 || document.getElementById(CONFIG.WRAPPER_ID))
      return;

    const wrapper = document.createElement("div");
    wrapper.id = CONFIG.WRAPPER_ID;
    wrapper.innerHTML = `
            <div class="yuri-btn-toggle ${isExpanded ? "" : "closed"}" id="yuri-toggle-btn" title="Toggle Zoom Panel">
                <svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round">
                    <polyline points="13 17 18 12 13 7"></polyline><polyline points="6 17 11 12 6 7"></polyline>
                </svg>
            </div>
            <div class="yuri-panel ${isExpanded ? "" : "collapsed"}" id="yuri-zoom-panel">
                <svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="url(#yuri-grad)" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round">
                    <defs>
                        <linearGradient id="yuri-grad" x1="0%" y1="0%" x2="100%" y2="100%">
                            <stop offset="0%" stop-color="#F38FAC" /><stop offset="100%" stop-color="#EE5A8A" />
                        </linearGradient>
                    </defs>
                    <circle cx="11" cy="11" r="8"></circle><line x1="21" y1="21" x2="16.65" y2="16.65"></line>
                </svg>
                <input type="range" orient="vertical" id="zoom-slider" min="${CONFIG.ZOOM.MIN}" max="${CONFIG.ZOOM.MAX}" value="${currentZoom}" step="5"
                       style="-webkit-appearance: slider-vertical; width: 8px; height: 140px; cursor: ns-resize; accent-color: #EE5A8A;">
                <span id="zoom-value" style="font-family: 'r0c0i Linotte', sans-serif; font-weight: bold; padding-top: 2px; display: inline-block; width: 40px; text-align: center;">${currentZoom}%</span>
            </div>
        `;
    document.body.appendChild(wrapper);

    const slider = document.getElementById("zoom-slider");
    const valueDisplay = document.getElementById("zoom-value");
    const toggleBtn = document.getElementById("yuri-toggle-btn");
    const panel = document.getElementById("yuri-zoom-panel");

    let rAF_ID = null;

    slider.addEventListener(
      "input",
      (e) => {
        const val = e.target.value;
        valueDisplay.textContent = `${val}%`;

        if (rAF_ID) cancelAnimationFrame(rAF_ID);
        rAF_ID = requestAnimationFrame(() => {
          currentZoom = val;
          document.documentElement.style.setProperty("--yuri-zoom", `${val}%`);
        });
      },
      { passive: true },
    );

    slider.addEventListener("change", (e) => {
      localStorage.setItem(CONFIG.STORAGE_KEY, e.target.value);
    });

    toggleBtn.addEventListener("click", () => toggleUIState(panel, toggleBtn));
    isUIInjected = true;
  };

  const unmountUI = () => {
    const wrapper = document.getElementById(CONFIG.WRAPPER_ID);
    if (wrapper) wrapper.remove();
    isUIInjected = false;
  };

  const initSPAObserver = () => {
    const observer = new MutationObserver(() => {
      const hasReader = document.querySelector(CONFIG.READER_SELECTOR) !== null;

      if (hasReader && !isUIInjected) {
        injectBaseCSS();
        mountUI();
      } else if (!hasReader && isUIInjected) {
        unmountUI();
      }
    });

    observer.observe(document.body, { childList: true, subtree: true });
  };

  initSPAObserver();
})();
