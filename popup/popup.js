/**
 * Neural Translate - Popup Controller (Cinematic Editorial Edition)
 * Supports Custom API Providers (DeepSeek, GLM, OpenAI, OpenRouter, Anthropic)
 * and persistent per-site dynamic Auto-Translation.
 */

document.addEventListener('DOMContentLoaded', () => {
  // Navigation & Views
  const tabBtnSettings = document.getElementById('tab-btn-settings');
  const btnBackMain = document.getElementById('btn-back-main');
  const viewMain = document.getElementById('view-main');
  const viewSettings = document.getElementById('view-settings');

  // Main View Elements
  const statusStrip = document.querySelector('.status-strip');
  const statusText = document.getElementById('status-text');
  const telemetrySpeed = document.getElementById('telemetry-speed');
  const modeButtons = document.querySelectorAll('.mode-btn');
  const toggleSiteAutotranslate = document.getElementById('toggle-site-autotranslate');
  const siteDomainLabel = document.getElementById('site-domain-label');
  const quickInput = document.getElementById('quick-input');
  const clearInputBtn = document.getElementById('clear-input-btn');
  const translateBtn = document.getElementById('translate-btn');
  const quickDuration = document.getElementById('quick-duration');
  const quickResultWrap = document.getElementById('quick-result-wrap');
  const quickEngineBadge = document.getElementById('quick-engine-badge');
  const quickOutput = document.getElementById('quick-output');
  const copyQuickBtn = document.getElementById('copy-quick-btn');
  const copyLabel = document.getElementById('copy-label');
  const localServerUrlInput = document.getElementById('local-server-url');
  const btnTestLocalAi = document.getElementById('btn-test-local-ai');
  const btnSaveLocalAi = document.getElementById('btn-save-local-ai');
  const localAiTestFeedback = document.getElementById('local-ai-test-feedback');
  const localPresetChips = document.querySelectorAll('[data-local-preset]');
  const btnPageTranslate = document.getElementById('btn-page-translate');
  const btnOpenReader = document.getElementById('btn-open-reader');
  const toggleAutopill = document.getElementById('toggle-autopill');
  const btnClearCache = document.getElementById('btn-clear-cache');

  // Settings Elements
  const apiEnableToggle = document.getElementById('api-enable-toggle');
  const apiEndpointInput = document.getElementById('api-endpoint');
  const apiKeyInput = document.getElementById('api-key');
  const apiModelInput = document.getElementById('api-model');
  const toggleKeyVisibility = document.getElementById('toggle-key-visibility');
  const btnTestApi = document.getElementById('btn-test-api');
  const btnSaveApi = document.getElementById('btn-save-api');
  const apiTestFeedback = document.getElementById('api-test-feedback');
  const presetChips = document.querySelectorAll('.chip-btn');

  let currentMode = 'auto';
  let activeProvider = 'openai';
  let currentActiveTabId = null;
  let currentActiveDomain = '';

  // Preset Definitions
  const PRESETS = {
    deepseek: {
      endpoint: 'https://api.deepseek.com/v1/chat/completions',
      model: 'deepseek-chat',
      provider: 'openai'
    },
    glm: {
      endpoint: 'https://open.bigmodel.cn/api/paas/v4/chat/completions',
      model: 'glm-4-flash',
      provider: 'openai'
    },
    openrouter: {
      endpoint: 'https://openrouter.ai/api/v1/chat/completions',
      model: 'deepseek/deepseek-chat',
      provider: 'openai'
    },
    openai: {
      endpoint: 'https://api.openai.com/v1/chat/completions',
      model: 'gpt-4o-mini',
      provider: 'openai'
    },
    anthropic: {
      endpoint: 'https://api.anthropic.com/v1/messages',
      model: 'claude-3-5-haiku-20241022',
      provider: 'anthropic'
    }
  };

  // 1. Detect Active Tab & Site Domain
  chrome.tabs.query({ active: true, currentWindow: true }, (tabs) => {
    if (tabs[0] && tabs[0].url) {
      currentActiveTabId = tabs[0].id;
      try {
        const url = new URL(tabs[0].url);
        currentActiveDomain = url.hostname;
        siteDomainLabel.textContent = currentActiveDomain ? `موقع: ${currentActiveDomain}` : 'صفحة محلية';

        chrome.storage?.local?.get(['autoTranslateDomains'], (data) => {
          const domains = data?.autoTranslateDomains || [];
          if (currentActiveDomain && domains.includes(currentActiveDomain)) {
            toggleSiteAutotranslate.checked = true;
          }
        });

        // Ask tab for live status
        chrome.tabs.sendMessage(currentActiveTabId, { action: 'GET_SITE_AUTO_TRANSLATE_STATUS' }, (res) => {
          if (res && res.isAutoTranslateSite !== undefined) {
            toggleSiteAutotranslate.checked = res.isAutoTranslateSite;
          }
        });
      } catch (e) {
        siteDomainLabel.textContent = 'صفحة غير قابلة للترجمة';
      }
    }
  });

  // Toggle Site Auto-Translate
  toggleSiteAutotranslate.addEventListener('change', () => {
    const isEnabled = toggleSiteAutotranslate.checked;
    if (currentActiveTabId) {
      chrome.tabs.sendMessage(currentActiveTabId, {
        action: 'SET_SITE_AUTO_TRANSLATE',
        enabled: isEnabled
      });
    }

    if (currentActiveDomain) {
      chrome.storage?.local?.get(['autoTranslateDomains'], (data) => {
        let domains = data?.autoTranslateDomains || [];
        if (isEnabled && !domains.includes(currentActiveDomain)) {
          domains.push(currentActiveDomain);
        } else if (!isEnabled && domains.includes(currentActiveDomain)) {
          domains = domains.filter(d => d !== currentActiveDomain);
        }
        chrome.storage?.local?.set({ autoTranslateDomains: domains });
      });
    }
  });

  // 2. View Switching
  tabBtnSettings.addEventListener('click', () => {
    viewMain.classList.add('hidden');
    viewSettings.classList.remove('hidden');
    loadApiSettings();
  });

  btnBackMain.addEventListener('click', () => {
    viewSettings.classList.add('hidden');
    viewMain.classList.remove('hidden');
    refreshStatus();
  });

  // 3. Load Stored Settings
  chrome.storage?.local?.get(['preferredMode', 'autoPillEnabled', 'customApiConfig'], (data) => {
    if (data?.preferredMode) {
      currentMode = data.preferredMode;
      modeButtons.forEach(btn => btn.classList.toggle('active', btn.dataset.mode === currentMode));
    }
    if (data?.autoPillEnabled !== undefined) {
      toggleAutopill.checked = data.autoPillEnabled;
    }
    if (data?.customApiConfig) {
      const cfg = data.customApiConfig;
      apiEnableToggle.checked = !!cfg.enabled;
      apiEndpointInput.value = cfg.endpoint || '';
      apiKeyInput.value = cfg.apiKey || '';
      apiModelInput.value = cfg.model || '';
      activeProvider = cfg.provider || 'openai';
    }
  });

  function loadApiSettings() {
    chrome.storage?.local?.get(['customApiConfig'], (data) => {
      if (data?.customApiConfig) {
        const cfg = data.customApiConfig;
        apiEnableToggle.checked = !!cfg.enabled;
        apiEndpointInput.value = cfg.endpoint || '';
        apiKeyInput.value = cfg.apiKey || '';
        apiModelInput.value = cfg.model || '';
        activeProvider = cfg.provider || 'openai';
      }
    });
  }

  // 4. Preset Clicks
  presetChips.forEach(chip => {
    chip.addEventListener('click', () => {
      const presetKey = chip.dataset.preset;
      const preset = PRESETS[presetKey];
      if (preset) {
        apiEndpointInput.value = preset.endpoint;
        apiModelInput.value = preset.model;
        activeProvider = preset.provider;
        apiTestFeedback.className = 'test-feedback';
        apiTestFeedback.classList.add('hidden');
      }
    });
  });

  toggleKeyVisibility.addEventListener('click', () => {
    apiKeyInput.type = apiKeyInput.type === 'password' ? 'text' : 'password';
  });

  // 5. Test API Connection
  btnTestApi.addEventListener('click', () => {
    const config = {
      enabled: true,
      endpoint: apiEndpointInput.value.trim(),
      apiKey: apiKeyInput.value.trim(),
      model: apiModelInput.value.trim(),
      provider: activeProvider
    };

    if (!config.apiKey) {
      showApiFeedback('يرجى إدخال مفتاح API أولاً.', false);
      return;
    }

    btnTestApi.disabled = true;
    btnTestApi.querySelector('span').textContent = 'جارٍ الفحص...';

    chrome.runtime.sendMessage({ action: 'TEST_CUSTOM_API', config }, (res) => {
      btnTestApi.disabled = false;
      btnTestApi.querySelector('span').textContent = 'اختبار الاتصال';

      if (res?.success) {
        showApiFeedback(`✅ الاتصال ناجح (${res.durationMs}ms): "${res.sampleResult}"`, true);
      } else {
        showApiFeedback(`❌ فشل الاتصال: ${res?.error || 'خطأ غير معروف'}`, false);
      }
    });
  });

  function showApiFeedback(msg, isSuccess) {
    apiTestFeedback.textContent = msg;
    apiTestFeedback.className = `test-feedback ${isSuccess ? 'success' : 'error'}`;
    apiTestFeedback.classList.remove('hidden');
  }

  // 6. Save API Settings
  btnSaveApi.addEventListener('click', () => {
    const config = {
      enabled: apiEnableToggle.checked,
      endpoint: apiEndpointInput.value.trim(),
      apiKey: apiKeyInput.value.trim(),
      model: apiModelInput.value.trim(),
      provider: activeProvider
    };

    chrome.storage?.local?.set({ customApiConfig: config }, () => {
      btnSaveApi.querySelector('span').textContent = 'تم الحفظ!';
      setTimeout(() => {
        btnSaveApi.querySelector('span').textContent = 'حفظ الإعدادات';
      }, 1500);
    });
  });

  // 7. Refresh Status & Telemetry
  function refreshStatus() {
    chrome.runtime.sendMessage({ action: 'CHECK_STATUS' }, (res) => {
      const isCustomEnabled = res?.customConfig?.enabled && res?.customConfig?.apiKey;

      if (isCustomEnabled && (currentMode === 'custom' || currentMode === 'auto')) {
        statusStrip.className = 'status-strip custom';
        statusText.textContent = `API (${res.customConfig.model || 'Custom'})`;
        telemetrySpeed.textContent = 'سحابي فائق السرعة';
      } else if (res?.localHealthy) {
        statusStrip.className = 'status-strip online';
        statusText.textContent = res?.telemetry?.activeModel || 'Gemma-4-E2B (GPU)';
        telemetrySpeed.textContent = res?.telemetry?.tokensPerSec ? `${res.telemetry.tokensPerSec} t/s` : '95 t/s';
      } else {
        statusStrip.className = 'status-strip';
        statusText.textContent = 'سحابي احتياطي (Google GTX)';
        telemetrySpeed.textContent = 'فوري';
      }
    });
  }

  refreshStatus();

  // 8. Mode Switching
  modeButtons.forEach(btn => {
    btn.addEventListener('click', () => {
      modeButtons.forEach(b => b.classList.remove('active'));
      btn.classList.add('active');
      currentMode = btn.dataset.mode;
      chrome.storage?.local?.set({ preferredMode: currentMode });
      refreshStatus();
    });
  });

  // 9. Quick Translation
  quickInput.addEventListener('input', () => {
    clearInputBtn.style.display = quickInput.value ? 'block' : 'none';
  });

  clearInputBtn.addEventListener('click', () => {
    quickInput.value = '';
    clearInputBtn.style.display = 'none';
    quickResultWrap.classList.add('hidden');
    quickDuration.textContent = '';
    quickInput.focus();
  });

  quickInput.addEventListener('keydown', (e) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      performQuickTranslate();
    }
  });

  translateBtn.addEventListener('click', performQuickTranslate);

  function performQuickTranslate() {
    const text = quickInput.value.trim();
    if (!text) return;

    translateBtn.disabled = true;
    translateBtn.querySelector('span').textContent = 'جارٍ الترجمة...';
    quickDuration.textContent = 'تحليل...';

    chrome.runtime.sendMessage(
      { action: 'TRANSLATE', text, mode: currentMode, targetLang: 'ar' },
      (res) => {
        translateBtn.disabled = false;
        translateBtn.querySelector('span').textContent = 'ترجمة فورية';

        if (!res || !res.text) {
          quickDuration.textContent = 'خطأ بالاتصال';
          return;
        }

        quickResultWrap.classList.remove('hidden');
        quickOutput.textContent = res.text;
        quickEngineBadge.textContent = res.engine || 'AI';
        quickDuration.textContent = res.fromCache ? '0ms · كاش محفوظ' : `${res.durationMs || 120}ms`;
      }
    );
  }

  // Copy Result
  copyQuickBtn.addEventListener('click', () => {
    const text = quickOutput.textContent;
    if (text) {
      navigator.clipboard.writeText(text).then(() => {
        copyLabel.textContent = 'تم النسخ!';
        setTimeout(() => { copyLabel.textContent = 'نسخ'; }, 1500);
      });
    }
  });

  // Navigation Buttons
  btnPageTranslate.addEventListener('click', () => {
    chrome.tabs.query({ active: true, currentWindow: true }, (tabs) => {
      if (tabs[0]?.id) {
        chrome.tabs.sendMessage(tabs[0].id, { action: 'TRIGGER_SINGLE_PAGE_TRANSLATE' });
        if (currentActiveDomain) {
          chrome.storage?.local?.get(['autoTranslateDomains'], (data) => {
            let domains = data?.autoTranslateDomains || [];
            if (!domains.includes(currentActiveDomain)) {
              domains.push(currentActiveDomain);
              chrome.storage?.local?.set({ autoTranslateDomains: domains });
            }
          });
        }
        window.close();
      }
    });
  });

  btnOpenReader.addEventListener('click', () => {
    chrome.tabs.create({ url: chrome.runtime.getURL('reader/reader.html') });
    window.close();
  });

  // Autopill switch
  toggleAutopill.addEventListener('change', () => {
    chrome.storage?.local?.set({ autoPillEnabled: toggleAutopill.checked });
  });


  // Local Server Presets
  const LOCAL_PRESETS = {
    llama: 'http://127.0.0.1:28491',
    lmstudio: 'http://localhost:1234',
    ollama: 'http://localhost:11434',
    vllm: 'http://localhost:8000'
  };

  localPresetChips.forEach(chip => {
    chip.addEventListener('click', () => {
      const preset = chip.dataset.localPreset;
      if (LOCAL_PRESETS[preset]) {
        localServerUrlInput.value = LOCAL_PRESETS[preset];
        localAiTestFeedback.className = 'test-feedback hidden';
      }
    });
  });

  // Load Local Server URL
  chrome.storage?.local?.get(['localServerUrl'], (data) => {
    if (localServerUrlInput) {
      localServerUrlInput.value = data?.localServerUrl || 'http://127.0.0.1:28491';
    }
  });

  btnTestLocalAi?.addEventListener('click', () => {
    const url = localServerUrlInput.value.trim();
    btnTestLocalAi.disabled = true;
    btnTestLocalAi.querySelector('span').textContent = 'جارٍ الفحص...';

    chrome.runtime.sendMessage({ action: 'TEST_LOCAL_SERVER', url }, (res) => {
      btnTestLocalAi.disabled = false;
      btnTestLocalAi.querySelector('span').textContent = 'فحص الموديل المحلي';

      if (res?.success) {
        localAiTestFeedback.textContent = `✅ الخادم المحلي متصل ويعمل بنجاح (${res.durationMs}ms): ${res.url}`;
        localAiTestFeedback.className = 'test-feedback success';
      } else {
        localAiTestFeedback.textContent = `❌ تعذر الاتصال بالخادم المحلي: ${res?.error || 'خطأ غير معروف'}`;
        localAiTestFeedback.className = 'test-feedback error';
      }
    });
  });

  btnSaveLocalAi?.addEventListener('click', () => {
    const url = localServerUrlInput.value.trim();
    chrome.storage?.local?.set({ localServerUrl: url }, () => {
      btnSaveLocalAi.querySelector('span').textContent = 'تم الحفظ!';
      setTimeout(() => {
        btnSaveLocalAi.querySelector('span').textContent = 'حفظ الرابط';
      }, 1500);
      refreshStatus();
    });
  });


  const btnOpenManualGuide = document.getElementById("btn-open-manual-guide");
  btnOpenManualGuide?.addEventListener("click", () => {
    chrome.tabs.create({ url: chrome.runtime.getURL("manual/index.html#local-ai") });
  });

  // Clear Cache
  btnClearCache.addEventListener('click', () => {
    chrome.runtime.sendMessage({ action: 'CLEAR_CACHE' }, () => {
      btnClearCache.textContent = 'تم المسح!';
      setTimeout(() => { btnClearCache.textContent = 'مسح الكاش'; }, 1500);
    });
  });
});

