/**
 * Neural Translate - Content Script (V3.2 Complete)
 * - Persistent & Global Auto-Translate (Continuous Across Subpages & Links)
 * - Rock-solid Keyboard Shortcuts (Alt+Shift+R & Alt+Shift+T) with Arabic layout support
 * - Dynamic MutationObserver for Infinite Scroll & SPA Hydration
 * - Non-blocking Viewport Shadow DOM Overlay
 */

(function() {
  'use strict';

  // Comprehensive cleanup of any stale host elements from prior runs or reloads
  try {
    const staleHosts = document.querySelectorAll('neural-translate-host, #neural-translate-host, .nt-pill, .nt-card, .neural-floating-pill, .neural-revert-bubble');
    staleHosts.forEach(el => el.remove());
  } catch(e) {}

  // Stamp unique active instance ID to instantly neutralize stale listeners from previous injections
  const CURRENT_INSTANCE_ID = Date.now() + '-' + Math.random().toString(36).substring(2, 9);
  window.__neuralTranslateActiveInstanceId = CURRENT_INSTANCE_ID;

  // --- State ---
  let hostEl = null;
  let shadow = null;
  let microPill = null;
  let tooltip = null;
  let pageToolbar = null;
  let currentSelectionRange = null;
  let currentSelectionText = '';
  let lastValidRect = null;
  let activeReplacements = [];
  let isPageTranslating = false;
  let fullPageOriginalMap = new Map();
  let preferredMode = 'auto';
  let autoPillEnabled = true;

  // --- PDF Viewer Detection & Smart Bridge ---
  const isPdfDocument = (document.contentType === 'application/pdf') || (/\.pdf($|[?#])/i.test(window.location.href));
  if (isPdfDocument) {
    showPdfReaderBridge();
  }

  function showPdfReaderBridge() {
    initShadowHost();
    const pdfBanner = document.createElement('div');
    pdfBanner.className = 'nt-page-bar';
    pdfBanner.style.cssText = 'position:fixed!important;bottom:24px!important;right:24px!important;z-index:2147483647!important;display:flex!important;align-items:center!important;gap:12px!important;background:#1c1916!important;border:1px solid #b7825e!important;border-radius:4px!important;padding:10px 18px!important;box-shadow:0 12px 36px rgba(0,0,0,0.85)!important;pointer-events:auto!important;direction:rtl!important;font-family:system-ui,sans-serif!important;';
    pdfBanner.innerHTML = `
      <div style="display:flex;align-items:center;gap:8px;font-size:13px;font-weight:600;color:#e8decd;">
        <span style="width:8px;height:8px;border-radius:50%;background:#d0a381;display:inline-block;"></span>
        <span>مستند PDF مكتشف · هل ترغب في ترجمته وقراءته؟</span>
      </div>
      <button class="nt-action-btn" id="nt-open-pdf-btn" style="background:#1d9bf0!important;color:#fff!important;border:none!important;border-radius:3px!important;padding:6px 14px!important;font-size:12px!important;font-weight:600!important;cursor:pointer!important;">
        <span>فتح في Neural Reader للترجمة</span>
      </button>
      <button class="nt-btn-icon" id="nt-close-pdf-banner" title="إغلاق" style="background:transparent!important;border:none!important;color:#8d8171!important;cursor:pointer!important;display:flex!important;align-items:center!important;justify-content:center!important;">
        <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
          <line x1="18" y1="6" x2="6" y2="18"></line>
          <line x1="6" y1="6" x2="18" y2="18"></line>
        </svg>
      </button>
    `;

    shadow.appendChild(pdfBanner);

    pdfBanner.querySelector('#nt-open-pdf-btn')?.addEventListener('click', () => {
      const readerUrl = chrome.runtime.getURL('reader/reader.html?pdf=' + encodeURIComponent(window.location.href));
      window.open(readerUrl, '_blank');
    });

    pdfBanner.querySelector('#nt-close-pdf-banner')?.addEventListener('click', () => {
      pdfBanner.remove();
    });
  }


  // Auto-Translate State
  const currentHostname = window.location.hostname;
  let isAutoTranslateActive = false;
  let dynamicObserver = null;
  const translatedNodesSet = new WeakSet();
  let pendingDynamicNodes = new Set();
  let dynamicDebounceTimer = null;

  // 1. Sync Settings & Auto-Translate Verification
  chrome.storage?.local?.get(['preferredMode', 'autoPillEnabled', 'autoTranslateDomains', 'globalAutoTranslate'], (data) => {
    if (data?.preferredMode) preferredMode = data.preferredMode;
    if (data?.autoPillEnabled !== undefined) autoPillEnabled = data.autoPillEnabled;

  function isDomainMatched(hostname, domains) {
    if (!hostname || !Array.isArray(domains)) return false;
    return domains.some(d => hostname === d || hostname.endsWith("." + d) || d.endsWith("." + hostname));
  }
    const domains = data?.autoTranslateDomains || [];
    const isGlobal = !!data?.globalAutoTranslate;
    const isSiteWhitelisted = isDomainMatched(currentHostname, domains);

    if (isGlobal || isSiteWhitelisted) {
      if (document.readyState === "loading") {
        document.addEventListener("DOMContentLoaded", () => enableSiteAutoTranslate(true, false));
      } else {
        enableSiteAutoTranslate(true, false);
      }
    }
  });

  chrome.storage?.onChanged?.addListener((changes) => {
    if (changes.preferredMode) preferredMode = changes.preferredMode.newValue;
    if (changes.autoPillEnabled) autoPillEnabled = changes.autoPillEnabled.newValue;
    if (changes.autoTranslateDomains || changes.globalAutoTranslate) {
      chrome.storage.local.get(['autoTranslateDomains', 'globalAutoTranslate'], (d) => {
        const domains = d.autoTranslateDomains || [];
        const isGlobal = !!d.globalAutoTranslate;
        const shouldAuto = isGlobal || (currentHostname && domains.includes(currentHostname));
        if (shouldAuto !== isAutoTranslateActive) {
          enableSiteAutoTranslate(shouldAuto, false);
        }
      });
    }
  });

  // --- 2. Reliable Keyboard Shortcuts (Alt+Shift+R and Alt+Shift+T) ---
  document.addEventListener('keydown', (e) => {
    if (window.__neuralTranslateActiveInstanceId !== CURRENT_INSTANCE_ID) return;
    // Alt + Shift + R -> Open Reader (Supports both English 'R' and Arabic 'ق' layout)
    if (e.altKey && e.shiftKey && (e.code === 'KeyR' || e.key === 'R' || e.key === 'r' || e.key === 'ق')) {
      e.preventDefault();
      chrome.runtime.sendMessage({ action: 'OPEN_READER' });
      return;
    }

    // Alt + Shift + T -> Toggle Continuous Site Auto-Translation
    if (e.altKey && e.shiftKey && (e.code === 'KeyT' || e.key === 'T' || e.key === 't' || e.key === 'ف')) {
      e.preventDefault();
      if (isAutoTranslateActive || isPageTranslating || activeReplacements.length > 0) {
        enableSiteAutoTranslate(false, true);
        revertAllReplacements();
      } else {
        enableSiteAutoTranslate(true, true);
      }
      return;
    }

    // Escape -> Dismiss Tooltips or Revert
    if (e.key === 'Escape') {
      hideMicroPill();
      hideTooltip();
    }
  });

  // --- 3. Shadow DOM Viewport Host ---
  function initShadowHost() {
    // Remove any duplicate hosts in page DOM
    const existingHosts = document.querySelectorAll("neural-translate-host");
    if (existingHosts.length > 1) {
      existingHosts.forEach((h, i) => { if (i > 0) h.remove(); });
    }
    if (existingHosts.length === 1 && existingHosts[0].shadowRoot) {
      hostEl = existingHosts[0];
      shadow = hostEl.shadowRoot;
      microPill = shadow.querySelector(".nt-pill");
      tooltip = shadow.querySelector(".nt-card");
      return;
    }
    if (hostEl && document.contains(hostEl)) return;

    if (hostEl) {
      try { hostEl.remove(); } catch(e) {}
    }

    hostEl = document.createElement('neural-translate-host');
    hostEl.id = 'neural-translate-host';
    hostEl.style.cssText = 'all: initial; position: fixed !important; top: 0 !important; left: 0 !important; width: 100vw !important; height: 100vh !important; pointer-events: none !important; z-index: 2147483647 !important;';
    shadow = hostEl.attachShadow({ mode: 'open' });

    const style = document.createElement('style');
    style.textContent = `
      :host {
        font-family: "Manrope", "Noto Sans Arabic", system-ui, -apple-system, sans-serif;
        font-size: 14px;
        color: #e8decd;
        line-height: 1.6;
        direction: ltr;
        box-sizing: border-box;
      }
      *, *::before, *::after {
        box-sizing: border-box;
        margin: 0;
        padding: 0;
      }

      /* Micro Action Pill */
      .nt-pill {
        position: fixed;
        z-index: 2147483647;
        pointer-events: auto;
        display: inline-flex;
        align-items: center;
        background: #1c1916;
        border: 1px solid rgba(183, 130, 94, 0.6);
        border-radius: 3px;
        box-shadow: 0 4px 14px rgba(0, 0, 0, 0.6);
        padding: 5px 12px;
        cursor: pointer;
        opacity: 0;
        visibility: hidden;
        transform: scale(0.92) translateY(3px);
        transition: opacity 0.16s ease, transform 0.16s ease, visibility 0.16s, border-color 0.15s, background 0.15s;
        user-select: none;
      }
      .nt-pill.visible {
        opacity: 1;
        visibility: visible;
        transform: scale(1) translateY(0);
      }
      .nt-pill:hover {
        background: #24201c;
        border-color: #d0a381;
      }
      .nt-pill-icon {
        width: 14px;
        height: 14px;
        display: flex;
        align-items: center;
        justify-content: center;
        color: #d0a381;
      }
      .nt-pill-text {
        font-size: 12px;
        font-weight: 600;
        color: #e8decd;
        letter-spacing: 0.2px;
      }

      /* Tooltip Card */
      .nt-card {
        position: fixed;
        z-index: 2147483647;
        pointer-events: auto;
        width: 390px;
        max-width: calc(100vw - 32px);
        background: #1c1916;
        border: 1px solid rgba(232, 222, 205, 0.16);
        border-radius: 3px;
        box-shadow: 0 16px 36px rgba(0, 0, 0, 0.85);
        overflow: hidden;
        opacity: 0;
        visibility: hidden;
        transform: scale(0.97) translateY(4px);
        transition: opacity 0.18s ease, transform 0.18s ease, visibility 0.18s;
      }
      .nt-card.visible {
        opacity: 1;
        visibility: visible;
        transform: scale(1) translateY(0);
      }

      /* Header */
      .nt-header {
        display: flex;
        align-items: center;
        justify-content: space-between;
        padding: 10px 14px;
        background: #14110f;
        border-bottom: 1px solid rgba(232, 222, 205, 0.12);
      }
      .nt-header-left {
        display: flex;
        align-items: center;
        gap: 8px;
      }
      .nt-brand {
        display: flex;
        align-items: center;
        gap: 6px;
        font-family: "Bodoni Moda", "Amiri", Georgia, serif;
        font-weight: 500;
        font-size: 14px;
        color: #e8decd;
        letter-spacing: -0.2px;
      }
      .nt-badge {
        font-family: "JetBrains Mono", ui-monospace, monospace;
        font-size: 10px;
        font-weight: 500;
        padding: 2px 7px;
        border-radius: 2px;
        text-transform: uppercase;
        letter-spacing: 0.5px;
        display: inline-flex;
        align-items: center;
        gap: 4px;
        background: rgba(183, 130, 94, 0.14);
        color: #d0a381;
        border: 1px solid rgba(183, 130, 94, 0.35);
      }
      .nt-btn-icon {
        width: 26px;
        height: 26px;
        display: flex;
        align-items: center;
        justify-content: center;
        background: transparent;
        border: 1px solid transparent;
        border-radius: 3px;
        color: #b4a99a;
        cursor: pointer;
        transition: all 0.15s;
      }
      .nt-btn-icon:hover {
        background: #24201c;
        border-color: rgba(232, 222, 205, 0.16);
        color: #e8decd;
      }

      /* Body */
      .nt-body {
        padding: 14px;
        max-height: 280px;
        overflow-y: auto;
      }
      .nt-source-snippet {
        font-size: 11.5px;
        color: #8d8171;
        margin-bottom: 10px;
        padding-bottom: 8px;
        border-bottom: 1px solid rgba(232, 222, 205, 0.08);
        word-break: break-word;
        max-height: 48px;
        overflow-y: auto;
        direction: ltr;
        text-align: left;
      }
      .nt-result {
        direction: rtl;
        text-align: right;
        font-size: 16px;
        line-height: 1.8;
        color: #e8decd;
        word-break: break-word;
        font-family: "Amiri", "Noto Naskh Arabic", Georgia, serif;
      }
      .nt-loading-shimmer {
        display: flex;
        flex-direction: column;
        gap: 9px;
        padding: 6px 0;
      }
      .nt-shimmer-line {
        height: 12px;
        background: linear-gradient(90deg, #24201c 25%, #332d28 50%, #24201c 75%);
        background-size: 200% 100%;
        animation: nt-shimmer 1.5s infinite linear;
        border-radius: 2px;
      }
      @keyframes nt-shimmer {
        0% { background-position: 200% 0; }
        100% { background-position: -200% 0; }
      }

      /* Footer */
      .nt-footer {
        display: flex;
        align-items: center;
        justify-content: space-between;
        padding: 10px 14px;
        background: #14110f;
        border-top: 1px solid rgba(232, 222, 205, 0.12);
      }
      .nt-meta-speed {
        font-family: "JetBrains Mono", ui-monospace, monospace;
        font-size: 11px;
        color: #b7825e;
      }
      .nt-btn-group {
        display: flex;
        align-items: center;
        gap: 8px;
      }
      .nt-action-btn {
        display: inline-flex;
        align-items: center;
        gap: 6px;
        padding: 6px 12px;
        border-radius: 3px;
        font-size: 12px;
        font-weight: 600;
        cursor: pointer;
        transition: all 0.15s ease;
        text-decoration: none;
      }
      .nt-btn-replace {
        background: #1d9bf0;
        color: #ffffff;
        border: 1px solid #1a8cd8;
      }
      .nt-btn-replace:hover {
        background: #1a8cd8;
      }
      .nt-btn-secondary {
        background: #24201c;
        color: #e8decd;
        border: 1px solid rgba(232, 222, 205, 0.16);
      }
      .nt-btn-secondary:hover {
        background: #2e2924;
        border-color: rgba(232, 222, 205, 0.3);
      }

      /* Floating Page Progress & Site Auto-Translate Bar */
      .nt-page-bar {
        position: fixed;
        bottom: 24px;
        right: 24px;
        z-index: 2147483646;
        pointer-events: auto;
        display: flex;
        align-items: center;
        gap: 12px;
        background: #1c1916;
        border: 1px solid rgba(232, 222, 205, 0.2);
        border-radius: 4px;
        padding: 8px 16px;
        box-shadow: 0 10px 30px rgba(0, 0, 0, 0.7);
        direction: rtl;
      }
      .nt-page-bar-info {
        display: flex;
        align-items: center;
        gap: 8px;
        font-size: 12.5px;
        font-weight: 500;
        color: #e8decd;
      }
      .nt-page-bar-dot {
        width: 7px;
        height: 7px;
        border-radius: 50%;
        background: #d0a381;
        flex-shrink: 0;
      }
      .nt-page-bar.busy .nt-page-bar-dot {
        background: #1d9bf0;
        animation: nt-pulse 1s infinite alternate;
      }
      .nt-page-bar-badge {
        font-family: "JetBrains Mono", monospace;
        font-size: 10px;
        color: #d0a381;
        background: rgba(183, 130, 94, 0.15);
        padding: 1px 5px;
        border-radius: 2px;
        margin-right: 4px;
      }
      @keyframes nt-pulse {
        from { opacity: 0.3; }
        to { opacity: 1; }
      }
    `;
    shadow.appendChild(style);

    // Micro Action Pill (Clean & Minimal)
    microPill = document.createElement('div');
    microPill.className = 'nt-pill';
    microPill.innerHTML = `
      <span class="nt-pill-text">ترجمة</span>
    `;
    shadow.appendChild(microPill);

    microPill.addEventListener('mousedown', (e) => {
      e.stopPropagation();
      e.preventDefault();
      showTooltipForCurrentSelection();
    });

    microPill.addEventListener('click', (e) => {
      e.stopPropagation();
      e.preventDefault();
      showTooltipForCurrentSelection();
    });

    // Tooltip Card
    tooltip = document.createElement('div');
    tooltip.className = 'nt-card';
    shadow.appendChild(tooltip);

    (document.body || document.documentElement).appendChild(hostEl);
  }

  // --- Viewport Safe Positioning ---
  function positionElementNearRect(element, rect) {
    const margin = 10;
    const width = 390;
    const height = 240;

    if (!rect || (rect.width === 0 && rect.height === 0 && rect.top === 0 && rect.left === 0)) {
      const fallbackTop = Math.max(60, window.innerHeight * 0.2);
      const fallbackLeft = Math.max(16, (window.innerWidth - width) / 2);
      element.style.top = `${fallbackTop}px`;
      element.style.left = `${fallbackLeft}px`;
      return;
    }

    let top = rect.bottom + margin;
    let left = rect.left;

    if (top + height > window.innerHeight) {
      top = Math.max(margin, rect.top - height - margin);
    }
    if (left + width > window.innerWidth) {
      left = Math.max(margin, window.innerWidth - width - margin);
    }
    if (left < margin) left = margin;

    element.style.top = `${Math.round(top)}px`;
    element.style.left = `${Math.round(left)}px`;
  }

  // --- Selection Tracking ---
  let selectionTimeout = null;

  function isArabicSelection(str) {
    if (!str) return false;
    const arabic = str.match(/[\u0600-\u06FF\u0750-\u077F\u08A0-\u08FF]/g);
    if (!arabic) return false;
    const latin = str.match(/[a-zA-Z]/g);
    if (!latin) return true;
    return arabic.length >= latin.length;
  }

  document.addEventListener('mouseup', (e) => {
    if (window.__neuralTranslateActiveInstanceId !== CURRENT_INSTANCE_ID) return;
    const path = e.composedPath ? e.composedPath() : [];
    if (hostEl && (path.includes(hostEl) || (shadow && path.includes(shadow)) || path.some(el => el.id === 'neural-translate-host'))) return;
    if (tooltip && tooltip.classList.contains('visible')) {
      hideMicroPill();
      return;
    }

    clearTimeout(selectionTimeout);
    selectionTimeout = setTimeout(() => {
      handleSelectionChange(e);
    }, 60);
  });

  document.addEventListener('mousedown', (e) => {
    if (window.__neuralTranslateActiveInstanceId !== CURRENT_INSTANCE_ID) return;
    if (e.button === 2) return;
    // Do not dismiss if clicking inside shadow root or extension host
    const path = e.composedPath ? e.composedPath() : [];
    if (hostEl && (path.includes(hostEl) || (shadow && path.includes(shadow)) || path.some(el => el.id === 'neural-translate-host'))) {
      return;
    }

    hideMicroPill();
    if (tooltip && tooltip.classList.contains('visible')) {
      hideTooltip();
    }
  });

  function handleSelectionChange(e) {
    if (tooltip && tooltip.classList.contains('visible')) {
      hideMicroPill();
      return;
    }

    const selection = window.getSelection();
    const text = selection ? selection.toString().trim() : '';

    if (!text || text.length < 2 || isArabicSelection(text)) {
      hideMicroPill();
      return;
    }

    const activeElem = document.activeElement;
    if (activeElem && (activeElem.tagName === 'INPUT' || activeElem.tagName === 'TEXTAREA')) {
      return;
    }

    initShadowHost();

    try {
      if (selection.rangeCount > 0) {
        const range = selection.getRangeAt(0);
        const rect = range.getBoundingClientRect();

        if (rect.width > 0 || rect.height > 0) {
          currentSelectionRange = range.cloneRange();
          currentSelectionText = text;
          lastValidRect = {
            top: rect.top,
            bottom: rect.bottom,
            left: rect.left,
            right: rect.right,
            width: rect.width,
            height: rect.height
          };

          if (!autoPillEnabled) return;

          const pillLeft = Math.min(Math.max(12, rect.right - 50), window.innerWidth - 120);
          const pillTop = rect.bottom + 8 > window.innerHeight - 50 ? Math.max(10, rect.top - 38) : rect.bottom + 8;

          microPill.style.display = 'inline-flex';
          microPill.style.visibility = 'visible';
          microPill.style.left = `${Math.round(pillLeft)}px`;
          microPill.style.top = `${Math.round(pillTop)}px`;
          microPill.classList.add('visible');
        }
      }
    } catch (err) {}
  }

  function hideMicroPill() {
    if (microPill) {
      microPill.classList.remove('visible');
      microPill.style.display = 'none';
      microPill.style.visibility = 'hidden';
    }
  }

  function hideTooltip() {
    if (tooltip) {
      tooltip.classList.remove('visible');
    }
  }

  // --- Show Tooltip and Request Translation ---
  function showTooltipForCurrentSelection(customText, customRange) {
    const text = customText || currentSelectionText || (window.getSelection() ? window.getSelection().toString().trim() : '');
    if (!text) return;

    if (customRange) {
      currentSelectionRange = customRange.cloneRange ? customRange.cloneRange() : customRange;
      try {
        const r = customRange.getBoundingClientRect();
        if (r.width > 0 || r.height > 0) {
          lastValidRect = { top: r.top, bottom: r.bottom, left: r.left, right: r.right, width: r.width, height: r.height };
        }
      } catch (e) {}
    }

    currentSelectionText = text;

    hideMicroPill();
    if (microPill) {
      microPill.classList.remove('visible');
      microPill.style.display = 'none';
    }
    initShadowHost();

    const rectToUse = (currentSelectionRange ? currentSelectionRange.getBoundingClientRect() : null) || lastValidRect;
    positionElementNearRect(tooltip, rectToUse);

    renderTooltipContent({
      original: text,
      translated: '',
      loading: true,
      engine: 'AI',
      durationMs: 0
    });
    tooltip.classList.add('visible');

    let hasHandledResponse = false;
    const safetyTimer = setTimeout(() => {
      if (!hasHandledResponse) {
        hasHandledResponse = true;
        renderTooltipContent({
          original: text,
          translated: 'استغرق المحرك وقتاً أطول من المتوقع. انقر على "إعادة الترجمة" لإعادة المحاولة فوراً.',
          loading: false,
          engine: 'تنبيه',
          durationMs: 7000
        });
      }
    }, 7000);

    chrome.runtime.sendMessage(
      { action: 'TRANSLATE', text, mode: preferredMode, targetLang: 'ar' },
      (response) => {
        if (hasHandledResponse) return;
        hasHandledResponse = true;
        clearTimeout(safetyTimer);

        if (chrome.runtime.lastError || !response) {
          renderTooltipContent({
            original: text,
            translated: 'تعذر الاتصال بمحرك الترجمة.',
            loading: false,
            engine: 'خطأ',
            durationMs: 0
          });
          return;
        }
        renderTooltipContent({
          original: text,
          translated: response.text,
          loading: false,
          engine: response.engine,
          durationMs: response.durationMs,
          fromCache: response.fromCache
        });
      }
    );
  }

  function renderTooltipContent({ original, translated, loading, engine, durationMs, fromCache }) {
    tooltip.innerHTML = `
      <div class="nt-header">
        <div class="nt-header-left">
          <div class="nt-brand">
            <span>Neural Translate</span>
          </div>
          <span class="nt-badge">${engine || 'AI'}</span>
        </div>
        <div class="nt-header-actions">
          <button class="nt-btn-icon nt-close-btn" title="إغلاق (Esc)">
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
              <line x1="18" y1="6" x2="6" y2="18"></line>
              <line x1="6" y1="6" x2="18" y2="18"></line>
            </svg>
          </button>
        </div>
      </div>

      <div class="nt-body">
        <div class="nt-source-snippet" title="${escapeHtml(original)}">${escapeHtml(original)}</div>
        ${loading ? `
          <div class="nt-loading-shimmer">
            <div class="nt-shimmer-line" style="width: 85%;"></div>
            <div class="nt-shimmer-line" style="width: 95%;"></div>
            <div class="nt-shimmer-line" style="width: 60%;"></div>
          </div>
        ` : `
          <div class="nt-result">${window.NeuralBiDi ? window.NeuralBiDi.isolateInlineTerms(escapeHtml(translated)) : escapeHtml(translated)}</div>
        `}
      </div>

      <div class="nt-footer">
        <div class="nt-meta-speed">
          ${loading ? 'جارٍ التحليل...' : (fromCache ? '0ms · كاش محفوظ' : `${durationMs || 120}ms`)}
        </div>
        <div class="nt-btn-group">
          ${!loading ? `
            <button class="nt-action-btn nt-btn-secondary nt-retry-btn" title="إعادة الترجمة وتحديث النتيجة"><span>إعادة الترجمة</span></button>
            <button class="nt-action-btn nt-btn-secondary nt-copy-btn" title="نسخ الترجمة">
              <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round">
                <rect x="9" y="9" width="13" height="13" rx="2" ry="2"></rect>
                <path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"></path>
              </svg>
              <span>نسخ</span>
            </button>
            <button class="nt-action-btn nt-btn-replace nt-replace-btn" title="استبدال النص المحدد بمكانه داخل الصفحة">
              <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round">
                <path d="M21.5 2v6h-6M21.34 15.57a10 10 0 1 1-.57-8.38l5.67-5.67"></path>
              </svg>
              <span>استبدال مكانه</span>
            </button>
          ` : ''}
        </div>
      </div>
    `;

    tooltip.querySelector('.nt-close-btn')?.addEventListener('click', hideTooltip);

    const retryBtn = tooltip.querySelector('.nt-retry-btn');
    if (retryBtn) {
      retryBtn.addEventListener('click', () => {
        renderTooltipContent({ original, translated: '', loading: true, engine: 'AI', durationMs: 0 });
        let retryHandled = false;
        const retryTimer = setTimeout(() => {
          if (!retryHandled) {
            retryHandled = true;
            renderTooltipContent({ original, translated: 'استغرق المحرك وقتاً أطول من المتوقع.', loading: false, engine: 'تنبيه', durationMs: 7000 });
          }
        }, 7000);
        chrome.runtime.sendMessage({ action: 'TRANSLATE', text: original, mode: preferredMode, targetLang: 'ar', bypassCache: true }, (res) => {
          if (retryHandled) return;
          retryHandled = true;
          clearTimeout(retryTimer);
          if (!res) { renderTooltipContent({ original, translated: 'تعذر الاتصال بمحرك الترجمة.', loading: false, engine: 'خطأ', durationMs: 0 }); return; }
          renderTooltipContent({ original, translated: res.text, loading: false, engine: res.engine, durationMs: res.durationMs, fromCache: false });
        });
      });
    }
    const copyBtn = tooltip.querySelector('.nt-copy-btn');
    if (copyBtn) {
      copyBtn.addEventListener('click', () => {
        navigator.clipboard.writeText(translated).then(() => {
          copyBtn.querySelector('span').textContent = 'تم النسخ!';
          setTimeout(() => {
            if (copyBtn) copyBtn.querySelector('span').textContent = 'نسخ';
          }, 1500);
        });
      });
    }

    const replaceBtn = tooltip.querySelector('.nt-replace-btn');
    if (replaceBtn) {
      replaceBtn.addEventListener('click', () => {
        replaceSelectionInPlace(original, translated);
        hideTooltip();
      });
    }
  }

  // --- In-Place Replacement ---
  function replaceSelectionInPlace(originalText, translatedText) {
    try {
      const bdi = window.NeuralBiDi
        ? window.NeuralBiDi.createReplacedElement(translatedText, originalText)
        : document.createElement('bdi');

      if (!window.NeuralBiDi) {
        bdi.className = 'neural-in-place-replaced';
        bdi.setAttribute('dir', 'rtl');
        bdi.setAttribute('data-neural-original', originalText);
        bdi.textContent = translatedText;
      }

      bdi.addEventListener('dblclick', (e) => {
        e.stopPropagation();
        revertSingleReplacement(bdi);
      });

      bdi.addEventListener('mouseenter', () => showRevertBubble(bdi, originalText));
      bdi.addEventListener('mouseleave', hideRevertBubble);

      let replaced = false;

      if (currentSelectionRange && !currentSelectionRange.collapsed) {
        try {
          currentSelectionRange.deleteContents();
          currentSelectionRange.insertNode(bdi);
          replaced = true;
        } catch (e) {}
      }

      if (!replaced) {
        const walker = document.createTreeWalker(document.body, NodeFilter.SHOW_TEXT);
        let node;
        while ((node = walker.nextNode())) {
          if (node.nodeValue && node.nodeValue.includes(originalText)) {
            const parent = node.parentNode;
            if (parent && !parent.closest('#neural-translate-host') && !parent.closest('.neural-in-place-replaced')) {
              const fullVal = node.nodeValue;
              const idx = fullVal.indexOf(originalText);
              const before = fullVal.substring(0, idx);
              const after = fullVal.substring(idx + originalText.length);

              const frag = document.createDocumentFragment();
              if (before) frag.appendChild(document.createTextNode(before));
              frag.appendChild(bdi);
              if (after) frag.appendChild(document.createTextNode(after));

              parent.replaceChild(frag, node);
              replaced = true;
              break;
            }
          }
        }
      }

      if (replaced) {
        activeReplacements.push(bdi);
        updatePageFloatingBar();
        window.getSelection()?.removeAllRanges();
      }
    } catch (err) {
      console.warn('[Neural Translate] In-place replace error:', err);
    }
  }

  function revertSingleReplacement(bdiElement) {
    const original = bdiElement.getAttribute('data-neural-original');
    if (original && bdiElement.parentNode) {
      const textNode = document.createTextNode(original);
      bdiElement.parentNode.replaceChild(textNode, bdiElement);
      activeReplacements = activeReplacements.filter(el => el !== bdiElement);
      hideRevertBubble();
      updatePageFloatingBar();
    }
  }

  function revertAllReplacements() {
    // 1. Restore all in-place replacements directly from live DOM
    try {
      document.querySelectorAll('bdi.neural-in-place-replaced').forEach(bdi => {
        const original = bdi.getAttribute('data-neural-original');
        if (original && bdi.parentNode) {
          bdi.parentNode.replaceChild(document.createTextNode(original), bdi);
        }
      });
    } catch (e) {}
    activeReplacements = [];

    // 2. Restore all full-page text nodes to original values
    if (fullPageOriginalMap.size > 0) {
      for (const [node, originalVal] of fullPageOriginalMap.entries()) {
        try {
          if (node && node.parentNode) {
            node.nodeValue = originalVal;
            if (node.parentElement && node.parentElement.hasAttribute("data-content")) {
              node.parentElement.setAttribute("data-content", originalVal);
            }
          }
        } catch(e) {}
      }
      fullPageOriginalMap.clear();
    }

    // 3. Reset state & stop observer so it does not re-translate English
    isPageTranslating = false;
    isAutoTranslateActive = false;
    stopDynamicObserver();
    hideRevertBubble();

    // 4. Update floating bar
    updatePageFloatingBar("تمت استعادة النص الأصلي");
    setTimeout(() => {
      if (pageToolbar && !isPageTranslating && !isAutoTranslateActive) {
        pageToolbar.remove();
        pageToolbar = null;
      }
    }, 1800);
  }

  // --- Hover Revert Bubble ---
  let revertBubble = null;
  function showRevertBubble(targetElement, originalText) {
    if (!revertBubble) {
      revertBubble = document.createElement('div');
      revertBubble.className = 'neural-revert-bubble';
      document.body.appendChild(revertBubble);
    }
    const rect = targetElement.getBoundingClientRect();
    revertBubble.innerHTML = `
      <div class="bubble-label">النص الأصلي · انقر مرتين للاستعادة</div>
      <div class="bubble-source">${escapeHtml(originalText)}</div>
    `;
    revertBubble.style.top = `${window.scrollY + rect.bottom + 6}px`;
    revertBubble.style.left = `${window.scrollX + Math.max(10, rect.left)}px`;
    revertBubble.style.display = 'block';
  }

  function hideRevertBubble() {
    if (revertBubble) {
      revertBubble.style.display = 'none';
    }
  }

  // --- Page Floating Control Bar ---
  function updatePageFloatingBar(customMsg = null) {
    initShadowHost();

    const totalCount = activeReplacements.length + (fullPageOriginalMap.size > 0 ? 1 : 0);

    if (totalCount === 0 && !isPageTranslating && !isAutoTranslateActive) {
      if (pageToolbar) pageToolbar.remove();
      pageToolbar = null;
      return;
    }

    if (!pageToolbar) {
      pageToolbar = document.createElement('div');
      pageToolbar.className = 'nt-page-bar';
      shadow.appendChild(pageToolbar);
    }

    pageToolbar.className = isPageTranslating ? 'nt-page-bar busy' : 'nt-page-bar';
    
    let statusMsg = '';
    if (isPageTranslating) {
      statusMsg = customMsg || 'جارٍ الترجمة الفورية...';
    } else if (isAutoTranslateActive) {
      statusMsg = `الترجمة المستمرة نشطة <span class="nt-page-bar-badge">${currentHostname || 'مستمر'}</span>`;
    } else {
      statusMsg = `تمت ترجمة ${activeReplacements.length || 'كامل'} فقرات`;
    }

    pageToolbar.innerHTML = `
      <div class="nt-page-bar-info">
        <div class="nt-page-bar-dot"></div>
        <span>${statusMsg}</span>
      </div>
      ${isAutoTranslateActive ? `
        <button class="nt-action-btn nt-btn-secondary nt-toggle-auto-btn" style="padding: 4px 8px; font-size: 11px;">
          <span>إيقاف التلقائي</span>
        </button>
      ` : ''}
      <button class="nt-action-btn nt-btn-secondary nt-revert-all-btn" style="padding: 4px 10px; font-size: 11px;">
        <span>استعادة الأصل (Esc)</span>
      </button>
      <button class="nt-btn-icon nt-bar-close" title="إخفاء">
        <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
          <line x1="18" y1="6" x2="6" y2="18"></line>
          <line x1="6" y1="6" x2="18" y2="18"></line>
        </svg>
      </button>
    `;

    pageToolbar.querySelector('.nt-toggle-auto-btn')?.addEventListener('click', () => {
      enableSiteAutoTranslate(false, true);
    });

    pageToolbar.querySelector('.nt-revert-all-btn')?.addEventListener('click', () => {
      enableSiteAutoTranslate(false, true);
      revertAllReplacements();
    });

    pageToolbar.querySelector('.nt-bar-close')?.addEventListener('click', () => {
      if (pageToolbar) pageToolbar.remove();
      pageToolbar = null;
    });
  }

  // --- Dynamic Site Auto-Translate & Continuous Observer ---
  function enableSiteAutoTranslate(enabled, persist = true) {
    isAutoTranslateActive = enabled;

    if (persist && currentHostname) {
      chrome.storage?.local?.get(['autoTranslateDomains'], (data) => {
        let domains = data?.autoTranslateDomains || [];
        if (enabled && !domains.includes(currentHostname)) {
          domains.push(currentHostname);
        } else if (!enabled && domains.includes(currentHostname)) {
          domains = domains.filter(d => d !== currentHostname);
        }
        chrome.storage?.local?.set({ autoTranslateDomains: domains });
      });
    }

    if (enabled) {
      translateFullPage();
      startDynamicObserver();
      hookSpaNavigation();
    } else {
      stopDynamicObserver();
    }

    updatePageFloatingBar();
  }

  function startDynamicObserver() {
    if (dynamicObserver) return;

    dynamicObserver = new MutationObserver((mutations) => {
      if (!isAutoTranslateActive) return;

      for (const mutation of mutations) {
        if (mutation.target && (mutation.target.closest?.('#neural-translate-host') || mutation.target.id === 'neural-translate-host' || mutation.target.closest?.('.neural-in-place-replaced'))) {
          continue;
        }

        if (mutation.type === 'childList') {
          mutation.addedNodes.forEach(node => {
            if (node.nodeType === Node.ELEMENT_NODE) {
              if (node.id === 'neural-translate-host' || node.classList?.contains('neural-in-place-replaced')) return;
            }
            collectNewTextNodes(node);
          });
        }
      }

      if (pendingDynamicNodes.size > 0) {
        clearTimeout(dynamicDebounceTimer);
        dynamicDebounceTimer = setTimeout(processPendingDynamicNodes, 400);
      }
    });

    dynamicObserver.observe(document.body || document.documentElement, {
      childList: true,
      subtree: true,
      characterData: false
    });
  }

  function stopDynamicObserver() {
    if (dynamicObserver) {
      dynamicObserver.disconnect();
      dynamicObserver = null;
    }
    clearTimeout(dynamicDebounceTimer);
    pendingDynamicNodes.clear();
  }

  function collectNewTextNodes(node) {
    if (!node) return;

    if (node.nodeType === Node.TEXT_NODE) {
      if (shouldTranslateNode(node) && !translatedNodesSet.has(node)) {
        pendingDynamicNodes.add(node);
      }
    } else if (node.nodeType === Node.ELEMENT_NODE) {
      const tag = node.tagName.toUpperCase();
      if (['SCRIPT', 'STYLE', 'NOSCRIPT', 'TEXTAREA', 'INPUT', 'PRE', 'CODE', 'SVG', 'CANVAS'].includes(tag)) {
        return;
      }
      if (node.id === 'neural-translate-host' || node.closest?.('#neural-translate-host') || node.classList?.contains('neural-in-place-replaced')) {
        return;
      }

      const walker = document.createTreeWalker(node, NodeFilter.SHOW_TEXT);
      let child;
      while ((child = walker.nextNode())) {
        if (shouldTranslateNode(child) && !translatedNodesSet.has(child)) {
          pendingDynamicNodes.add(child);
        }
      }
    }
  }

  function shouldTranslateNode(node) {
    if (!node || !node.nodeValue) return false;
    const val = node.nodeValue.trim();
    if (val.length < 3) return false;

    const parent = node.parentElement;
    if (!parent) return false;

    const tag = parent.tagName.toUpperCase();
    if (['SCRIPT', 'STYLE', 'NOSCRIPT', 'TEXTAREA', 'INPUT', 'PRE', 'CODE', 'SVG', 'CANVAS'].includes(tag)) {
      return false;
    }
    if (parent.closest('#neural-translate-host') || parent.closest('.neural-in-place-replaced')) {
      return false;
    }
    if (window.NeuralBiDi && window.NeuralBiDi.isArabic(val) && val.length < 15) {
      return false;
    }
    return true;
  }

  async function processPendingDynamicNodes() {
    if (pendingDynamicNodes.size === 0) return;
    if (isPageTranslating) {
      setTimeout(processPendingDynamicNodes, 250);
      return;
    }

    const nodesArray = Array.from(pendingDynamicNodes).filter(n => document.contains(n) && !translatedNodesSet.has(n));
    pendingDynamicNodes.clear();

    if (nodesArray.length === 0) return;

    const batches = [];
    let curBatch = [];
    let curLen = 0;

    for (const node of nodesArray) {
      if (!fullPageOriginalMap.has(node)) {
        fullPageOriginalMap.set(node, node.nodeValue);
      }
      const len = node.nodeValue.length;
      if (curLen + len > 400 && curBatch.length > 0) {
        batches.push(curBatch);
        curBatch = [node];
        curLen = len;
      } else {
        curBatch.push(node);
        curLen += len;
      }
    }
    if (curBatch.length > 0) batches.push(curBatch);

    const CONCURRENCY = 2;
    for (let i = 0; i < batches.length; i += CONCURRENCY) {
      const slice = batches.slice(i, i + CONCURRENCY);
      await Promise.all(slice.map(processBatch));
    }
  }

  // Hook SPA History Navigation (pushState / popstate / hashchange)
  let spaHooked = false;
  function hookSpaNavigation() {
    if (spaHooked) return;
    spaHooked = true;

    const notifyNavigation = () => {
      if (!isAutoTranslateActive) return;
      setTimeout(() => {
        translateFullPage();
      }, 300);
      setTimeout(() => {
        translateFullPage();
      }, 1000);
    };

    window.addEventListener('popstate', notifyNavigation);
    window.addEventListener('hashchange', notifyNavigation);
    document.addEventListener('turbo:render', notifyNavigation);
    document.addEventListener('turbo:frame-render', notifyNavigation);
    document.addEventListener('pjax:end', notifyNavigation);

    const origPushState = history.pushState;
    history.pushState = function() {
      origPushState.apply(this, arguments);
      notifyNavigation();
    };

    const origReplaceState = history.replaceState;
    history.replaceState = function() {
      origReplaceState.apply(this, arguments);
      notifyNavigation();
    };
  }

  // --- Full Page Scanner ---
  let actuallyReplacedCount = 0;
  async function translateFullPage() {
    if (isPageTranslating) return;
    isPageTranslating = true;
    actuallyReplacedCount = 0;
    updatePageFloatingBar();

    const textNodes = [];
    const walker = document.createTreeWalker(
      document.body || document.documentElement,
      NodeFilter.SHOW_TEXT,
      {
        acceptNode: (node) => {
          if (shouldTranslateNode(node) && !translatedNodesSet.has(node)) {
            return NodeFilter.FILTER_ACCEPT;
          }
          return NodeFilter.FILTER_REJECT;
        }
      }
    );

    let currentNode;
    while ((currentNode = walker.nextNode())) {
      textNodes.push(currentNode);
      if (!fullPageOriginalMap.has(currentNode)) {
        fullPageOriginalMap.set(currentNode, currentNode.nodeValue);
      }
    }

    // Natural visual flow: Viewport visible elements first (Navbar, Sidebar, Main Content)
    textNodes.sort((a, b) => {
      let aInVp = 1, bInVp = 1;
      try {
        const ra = a.parentElement?.getBoundingClientRect();
        if (ra && ra.bottom >= -50 && ra.top <= window.innerHeight + 100) aInVp = 0;
      } catch(e) {}
      try {
        const rb = b.parentElement?.getBoundingClientRect();
        if (rb && rb.bottom >= -50 && rb.top <= window.innerHeight + 100) bInVp = 0;
      } catch(e) {}
      return aInVp - bInVp;
    });

    if (textNodes.length === 0) {
      isPageTranslating = false;
      updatePageFloatingBar();
      return;
    }

    const batches = [];
    let currentBatch = [];
    let currentBatchChars = 0;

    for (const node of textNodes) {
      const len = node.nodeValue.length;
      if (currentBatchChars + len > 400 && currentBatch.length > 0) {
        batches.push(currentBatch);
        currentBatch = [node];
        currentBatchChars = len;
      } else {
        currentBatch.push(node);
        currentBatchChars += len;
      }
    }
    if (currentBatch.length > 0) {
      batches.push(currentBatch);
    }

    // Parallel chunk pipeline matching -np 2 GPU slots
    const CONCURRENCY = 2;
    for (let i = 0; i < batches.length; i += CONCURRENCY) {
      const slice = batches.slice(i, i + CONCURRENCY);
      const pct = Math.round(((i + slice.length) / batches.length) * 100);
      updatePageFloatingBar('جارٍ الترجمة (%' + pct + ')...');
      await Promise.all(slice.map(b => processBatch(b)));
    }

    isPageTranslating = false;
    updatePageFloatingBar();
  }

  async function processBatch(batchNodes, bypassCache = false) {
    const rawTexts = batchNodes.map(n => n.nodeValue.trim());
    return new Promise((resolve) => {
      const safetyTimer = setTimeout(resolve, 8000);
      chrome.runtime.sendMessage(
        { action: 'TRANSLATE_BATCH', texts: rawTexts, mode: preferredMode, targetLang: 'ar', bypassCache },
        (res) => {
          if (res && Array.isArray(res.results)) {
            res.results.forEach((item, idx) => {
              const node = batchNodes[idx];
              if (node && item && item.text && node.parentNode) {
                const isActuallyTranslated = item.text.trim() !== rawTexts[idx].trim();
                if (isActuallyTranslated) {
                  translatedNodesSet.add(node);
                  node.nodeValue = item.text;
                  actuallyReplacedCount++;
                  if (node.parentElement) {
                    if (node.parentElement.hasAttribute('data-content')) {
                      node.parentElement.setAttribute('data-content', item.text);
                    }
                    if (!node.parentElement.getAttribute('dir')) {
                      node.parentElement.setAttribute('dir', 'auto');
                    }
                  }
                }
              }
            });
          }
          clearTimeout(safetyTimer);
          
          resolve();
        }
      );
    });
  }


  // --- Viewport-Priority Scroll Translator for Continuous Reading ---
  let scrollDebounceTimer = null;
  window.addEventListener('scroll', () => {
    if (window.__neuralTranslateActiveInstanceId !== CURRENT_INSTANCE_ID) return;
    if (!isAutoTranslateActive) return;
    clearTimeout(scrollDebounceTimer);
    scrollDebounceTimer = setTimeout(() => {
      translateVisibleViewport();
    }, 120);
  }, { passive: true });

  function translateVisibleViewport() {
    if (!isAutoTranslateActive || isPageTranslating) return;

    const visibleNodes = [];
    const walker = document.createTreeWalker(
      document.body || document.documentElement,
      NodeFilter.SHOW_TEXT,
      {
        acceptNode: (node) => {
          if (!shouldTranslateNode(node) || translatedNodesSet.has(node)) {
            return NodeFilter.FILTER_REJECT;
          }
          const parent = node.parentElement;
          if (!parent) return NodeFilter.FILTER_REJECT;

          try {
            const rect = parent.getBoundingClientRect();
            // Check if within viewport with 600px buffer above and below
            if (rect.bottom >= -400 && rect.top <= window.innerHeight + 600) {
              return NodeFilter.FILTER_ACCEPT;
            }
          } catch(e) {}
          return NodeFilter.FILTER_REJECT;
        }
      }
    );

    let n;
    while ((n = walker.nextNode())) {
      visibleNodes.push(n);
      if (visibleNodes.length >= 35) break;
    }

    if (visibleNodes.length > 0) {
      visibleNodes.forEach(node => {
        if (!fullPageOriginalMap.has(node)) {
          fullPageOriginalMap.set(node, node.nodeValue);
        }
      });
      processBatch(visibleNodes);
    }
  }

  // --- Internal Link Navigation Bridge (Preserves Auto-Translate Across Links) ---
  document.addEventListener('click', (e) => {
    if (window.__neuralTranslateActiveInstanceId !== CURRENT_INSTANCE_ID) return;
    if (!isAutoTranslateActive) return;
    const a = e.target.closest('a');
    if (a && a.href) {
      try {
        const u = new URL(a.href);
        if (u.hostname === currentHostname) {
          chrome.storage?.local?.get(['autoTranslateDomains'], (d) => {
            let domains = d?.autoTranslateDomains || [];
            if (!domains.includes(currentHostname)) {
              domains.push(currentHostname);
              chrome.storage?.local?.set({ autoTranslateDomains: domains });
            }
          });
        }
      } catch(err) {}
    }
  }, true);

  // Track last right-clicked element for Section-specific context menu translation
  let lastRightClickedElement = null;
  document.addEventListener("contextmenu", (e) => {
    if (window.__neuralTranslateActiveInstanceId !== CURRENT_INSTANCE_ID) return;
    lastRightClickedElement = e.target;
  }, true);


  // --- Section-Specific Translation (Right-Click Section) ---
  function translateClickedSection(bypassCache = false) {
    const section = lastRightClickedElement?.closest("p, article, section, div, li, blockquote, tr, td, h1, h2, h3, h4, h5, h6") || lastRightClickedElement;
    if (!section) return;

    // Subtle highlight pulse
    const origBorder = section.style.outline;
    section.style.outline = "1.5px solid #b7825e";
    setTimeout(() => { section.style.outline = origBorder; }, 1200);

    const sectionNodes = [];
    const walker = document.createTreeWalker(
      section,
      NodeFilter.SHOW_TEXT,
      {
        acceptNode: (node) => {
          if (shouldTranslateNode(node) && !translatedNodesSet.has(node)) {
            return NodeFilter.FILTER_ACCEPT;
          }
          return NodeFilter.FILTER_REJECT;
        }
      }
    );

    let n;
    while ((n = walker.nextNode())) {
      sectionNodes.push(n);
      if (!fullPageOriginalMap.has(n)) {
        fullPageOriginalMap.set(n, n.nodeValue);
      }
    }

    if (sectionNodes.length > 0) {
      processBatch(sectionNodes, bypassCache);
    }
  }

  // --- Message Listener ---
  chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
    if (request.action === 'TRIGGER_SELECTION_TRANSLATE') {
      const sel = window.getSelection();
      const text = request.selectionText || (sel ? sel.toString().trim() : '') || currentSelectionText;
      const range = (sel && sel.rangeCount > 0) ? sel.getRangeAt(0) : currentSelectionRange;
      if (text) {
        showTooltipForCurrentSelection(text, range);
      }
      sendResponse({ status: 'ok', textFound: !!text });
    } else if (request.action === 'TRIGGER_TRANSLATE_SECTION') {
      translateClickedSection(!!request.bypassCache);
      sendResponse({ status: 'started' });
    } else if (request.action === 'TRIGGER_SELECTION_REPLACE_DIRECT') {
      const textToTranslate = request.selectionText || (window.getSelection() ? window.getSelection().toString().trim() : '');
      if (textToTranslate) {
        chrome.runtime.sendMessage({
          action: 'TRANSLATE',
          text: textToTranslate,
          mode: preferredMode,
          targetLang: 'ar'
        }, (res) => {
          if (res?.text) replaceSelectionInPlace(textToTranslate, res.text);
        });
      }
      sendResponse({ status: 'started' });
    } else if (request.action === 'TOGGLE_SITE_AUTO_TRANSLATE') {
      enableSiteAutoTranslate(!isAutoTranslateActive, true);
      sendResponse({ status: 'ok', isAutoTranslateActive });
    } else if (request.action === 'TRIGGER_SINGLE_PAGE_TRANSLATE') {
      translateFullPage();
      sendResponse({ status: 'started', mode: 'single-page' });
    } else if (request.action === 'TRIGGER_PAGE_TRANSLATE') {
      enableSiteAutoTranslate(true, true);
      sendResponse({ status: 'started', isAutoTranslateActive: true });
    } else if (request.action === 'SET_SITE_AUTO_TRANSLATE') {
      enableSiteAutoTranslate(request.enabled, true);
      sendResponse({ status: 'ok', isAutoTranslateActive });
    } else if (request.action === 'GET_SITE_AUTO_TRANSLATE_STATUS') {
      sendResponse({ isAutoTranslateActive, hostname: currentHostname });
    } else if (request.action === 'REVERT_ALL') {
      enableSiteAutoTranslate(false, true);
      revertAllReplacements();
      sendResponse({ status: 'reverted' });
    }
    return false;
  });

  function escapeHtml(text) {
    if (!text) return '';
    return text
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#039;');
  }

})();
