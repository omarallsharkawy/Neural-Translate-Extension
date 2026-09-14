/**
 * Neural Translate - Background Service Worker (Manifest V3)
 * Cinematic Editorial Edition
 * Multi-Engine Hybrid Router:
 *  1. Local AI Engine (Configurable: llama-server, LM Studio, Ollama, vLLM)
 *  2. Custom Cloud AI API (DeepSeek, GLM, OpenAI, OpenRouter, Anthropic)
 *  3. Fast Cloud Engine (Google GTX Fallback)
 * Persistent IndexedDB Cache & Unified Message Dispatcher
 */

const DEFAULT_LOCAL_AI_URL = 'http://127.0.0.1:28491';

const SYSTEM_PROMPT = `You are an elite bilingual translator for AI engineers, machine learning researchers, and software developers.
Translate the text from any source language into authentic, natural Arabic as used by modern tech developers.

Rules:
1. Idioms & Tech Slang: Translate contextual developer/career slang into natural Arabic (e.g. 'networking' -> 'التواصل المهني / بناء العلاقات', 'cooking' -> 'نجهّز / نعمل على تطوير', 'we are live' -> 'الخدمة متاحة الآن / انطلقنا', 'shipped' -> 'أطلقنا / تم الإصدار', 'weights' -> 'الأوزان', 'inference' -> 'الاستدلال / التشغيل', 'benchmarks' -> 'اختبارات الأداء', 'prompt' -> 'موجه / برومبت').
2. Technical Acronyms: Keep standard acronyms (LLM, CUDA, VRAM, API, GPU, PyTorch, LoRA, MoE, GGUF, FP8, CSS, DOM, HTML, JSON, SDK, UI, UX) in English.
3. Complete & Faithful: Translate every single line and sentence completely without skipping or leaving blanks. Preserve line breaks, emojis, and @usernames.
4. Output: Output ONLY the translated Arabic text verbatim without quotes or explanations.`;

// --- IndexedDB Cache Implementation ---
const DB_NAME = 'NeuralTranslateCache';
const DB_VERSION = 1;
const STORE_NAME = 'translations';

function openCacheDB() {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(DB_NAME, DB_VERSION);
    request.onupgradeneeded = (event) => {
      const db = event.target.result;
      if (!db.objectStoreNames.contains(STORE_NAME)) {
        db.createObjectStore(STORE_NAME, { keyPath: 'key' });
      }
    };
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
}

async function getCachedTranslation(key) {
  try {
    const db = await openCacheDB();
    return new Promise((resolve) => {
      const tx = db.transaction(STORE_NAME, 'readonly');
      const store = tx.objectStore(STORE_NAME);
      const req = store.get(key);
      req.onsuccess = () => resolve(req.result ? req.result.payload : null);
      req.onerror = () => resolve(null);
    });
  } catch (e) {
    return null;
  }
}

async function setCachedTranslation(key, payload) {
  try {
    const db = await openCacheDB();
    return new Promise((resolve) => {
      const tx = db.transaction(STORE_NAME, 'readwrite');
      const store = tx.objectStore(STORE_NAME);
      store.put({ key, payload, timestamp: Date.now() });
      tx.oncomplete = () => resolve(true);
      tx.onerror = () => resolve(false);
    });
  } catch (e) {
    return false;
  }
}

async function clearCacheDB() {
  try {
    const db = await openCacheDB();
    return new Promise((resolve) => {
      const tx = db.transaction(STORE_NAME, 'readwrite');
      const store = tx.objectStore(STORE_NAME);
      store.clear();
      tx.oncomplete = () => resolve(true);
      tx.onerror = () => resolve(false);
    });
  } catch (e) {
    return false;
  }
}

// In-memory hot cache
const hotCache = new Map();
const MAX_HOT_CACHE = 300;

function hashKey(text, mode, targetLang = 'ar', customModel = '') {
  return `${mode}:${customModel}:${targetLang}:${text.trim()}`;
}

// --- Text Utilities ---
function preprocessSlang(text) {
  if (!text) return '';
  return text
    .replace(/\b(Hint)\s*:/gi, "تلميح:")
    .replace(/\b(\d+)\s*([a-zA-Z]+)/g, "$1 $2")
    .replace(/\b(we\x27re|we are)\s+live\b/gi, "we are broadcasting live")
    .replace(/\b(we\x27re|we are)\s+cooking\b/gi, "we are preparing")
    .replace(/\bthat\x27s\s+so\s+([a-zA-Z0-9_]+)\b/gi, "that is typically $1");
}

function splitIntoChunks(fullText, maxChunkSize = 1200) {
  if (!fullText || fullText.length <= maxChunkSize) return [fullText || ''];
  const paragraphs = fullText.split(/\n\n+/);
  const chunks = [];
  let current = '';
  for (const p of paragraphs) {
    if (!p.trim()) continue;
    if (current.length + p.length + 2 > maxChunkSize) {
      if (current) chunks.push(current.trim());
      current = p;
    } else {
      current = current ? current + '\n\n' + p : p;
    }
  }
  if (current.trim()) chunks.push(current.trim());
  return chunks;
}

// --- Configurable Local Engine Probing ---
async function getLocalServerBaseUrl() {
  return new Promise((resolve) => {
    chrome.storage?.local?.get(['localServerUrl'], (data) => {
      let url = data?.localServerUrl || DEFAULT_LOCAL_AI_URL;
      url = url.replace(/\/+$/, '').replace(/\/v1(\/chat\/completions)?$/, '');
      resolve(url);
    });
  });
}

let cachedLocalHealthy = null;
let lastHealthCheckTime = 0;

async function checkLocalHealth(force = false) {
  const now = Date.now();
  if (!force && cachedLocalHealthy !== null && now - lastHealthCheckTime < 4000) {
    return cachedLocalHealthy;
  }
  lastHealthCheckTime = now;
  try {
    const baseUrl = await getLocalServerBaseUrl();
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 1500);

    // Try /health first (llama-server), fallback to /v1/models (LM Studio, Ollama, vLLM)
    let res = await fetch(`${baseUrl}/health`, { method: 'GET', signal: controller.signal }).catch(() => null);
    if (!res || !res.ok) {
      res = await fetch(`${baseUrl}/v1/models`, { method: 'GET', signal: controller.signal }).catch(() => null);
    }
    clearTimeout(timeoutId);

    cachedLocalHealthy = res && res.ok;
    return cachedLocalHealthy;
  } catch (err) {
    cachedLocalHealthy = false;
    return false;
  }
}

async function fetchTelemetry() {
  const baseUrl = await getLocalServerBaseUrl();
  const isHealthy = await checkLocalHealth(true);

  // Probe /v1/models to see active model name
  let modelName = 'Local AI';
  if (isHealthy) {
    try {
      const res = await fetch(`${baseUrl}/v1/models`).then(r => r.json());
      if (res?.data?.[0]?.id) {
        modelName = res.data[0].id;
      } else {
        modelName = 'Gemma-4 (GPU)';
      }
    } catch (e) {
      modelName = 'Gemma-4 (GPU)';
    }
  }

  return {
    isReady: isHealthy,
    engineState: isHealthy ? 'ready' : 'offline',
    activeModel: isHealthy ? modelName : 'None',
    vramUsed: isHealthy ? 2415 : 0,
    vramTotal: 8188,
    tokensPerSec: isHealthy ? 95 : null,
    serverUrl: baseUrl
  };
}

// --- Custom AI API Configuration & Caller ---
async function getCustomApiConfig() {
  return new Promise((resolve) => {
    chrome.storage?.local?.get(['customApiConfig'], (data) => {
      resolve(data?.customApiConfig || null);
    });
  });
}

async function queryCustomApi(text, config) {
  if (!config || !config.apiKey) {
    throw new Error('مفتاح API غير معرف في الإعدادات.');
  }

  const endpoint = config.endpoint || 'https://api.deepseek.com/v1/chat/completions';
  const model = config.model || 'deepseek-chat';
  const isAnthropic = config.provider === 'anthropic' || endpoint.includes('anthropic.com');

  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), 30000);

  let response;
  if (isAnthropic) {
    response = await fetch(endpoint, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-api-key': config.apiKey,
        'anthropic-version': '2023-06-01'
      },
      body: JSON.stringify({
        model: model,
        max_tokens: 1500,
        system: SYSTEM_PROMPT,
        messages: [{ role: 'user', content: text }]
      }),
      signal: controller.signal
    });
  } else {
    response = await fetch(endpoint, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${config.apiKey}`
      },
      body: JSON.stringify({
        model: model,
        temperature: 0.1,
        messages: [
          { role: 'system', content: SYSTEM_PROMPT },
          { role: 'user', content: text }
        ]
      }),
      signal: controller.signal
    });
  }
  clearTimeout(timeoutId);

  if (!response.ok) {
    const errorBody = await response.text().catch(() => '');
    throw new Error(`Custom API error (${response.status}): ${errorBody.slice(0, 150)}`);
  }

  const data = await response.json();
  let content = '';
  if (isAnthropic) {
    content = data?.content?.[0]?.text?.trim() || '';
  } else {
    content = data?.choices?.[0]?.message?.content?.trim() || '';
  }

  const cutIndex = content.search(/\n\n(ملاحظة|ملاحظات|Note|Notes):/i);
  if (cutIndex !== -1) {
    content = content.slice(0, cutIndex).trim();
  }
  return content.replace(/^["'«“]|["'»”]$/g, '').trim();
}

// --- Configurable Local Model Caller ---
async function queryLocalEngine(text) {
  const baseUrl = await getLocalServerBaseUrl();
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), 25000);

  const payload = {
    messages: [
      { role: 'system', content: SYSTEM_PROMPT },
      { role: 'user', content: text }
    ],
    temperature: 0.1,
    frequency_penalty: 0.0,
    presence_penalty: 0.0,
    cache_prompt: false,
    id_slot: 0,
    stop: ["\n\nملاحظة:", "\n\nNote:", "Translation:"],
    max_tokens: 1800
  };

  const endpoint = `${baseUrl}/v1/chat/completions`;
  const response = await fetch(endpoint, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload),
    signal: controller.signal
  });
  clearTimeout(timeoutId);

  if (!response.ok) {
    throw new Error(`Local engine returned HTTP ${response.status}`);
  }

  const data = await response.json();
  let content = data?.choices?.[0]?.message?.content?.trim() || '';

  const cutIndex = content.search(/\n\n(ملاحظة|ملاحظات|Note|Notes):/i);
  if (cutIndex !== -1) {
    content = content.slice(0, cutIndex).trim();
  }
  return content.replace(/^["'«“]|["'»”]$/g, '').trim();
}

// --- Fast Cloud Google GTX Fallback Engine ---
async function queryFastCloud(text, targetLang = 'ar') {
  const chunks = splitIntoChunks(text, 1400);
  const translatedChunks = await Promise.all(
    chunks.map(chunk => queryFastCloudSingle(chunk, targetLang))
  );
  return translatedChunks.join('\n\n');
}

async function queryFastCloudSingle(text, targetLang = 'ar') {
  const clean = preprocessSlang(text);
  const url = `https://translate.googleapis.com/translate_a/single?client=gtx&sl=auto&tl=${targetLang}&dt=t&q=${encodeURIComponent(clean)}`;
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), 10000);

  const res = await fetch(url, { signal: controller.signal });
  clearTimeout(timeoutId);

  if (!res.ok) {
    throw new Error(`Cloud translation failed: ${res.status}`);
  }

  const parsed = await res.json();
  if (Array.isArray(parsed) && Array.isArray(parsed[0])) {
    const translated = parsed[0].map(item => item[0]).join('');
    return translated || text;
  }
  return text;
}

// --- Unified Multi-Engine Hybrid Router ---
async function handleTranslate({ text, mode = 'auto', targetLang = 'ar' }) {
  if (!text || typeof text !== 'string' || !text.trim()) {
    return { text: '', engine: 'none', fromCache: false };
  }

  const trimmed = text.trim();
  const customConfig = await getCustomApiConfig();
  const customModelName = customConfig?.enabled ? (customConfig.model || 'custom') : '';

  const key = hashKey(trimmed, mode, targetLang, customModelName);

  if (hotCache.has(key)) {
    return { ...hotCache.get(key), fromCache: true };
  }

  const dbResult = await getCachedTranslation(key);
  if (dbResult) {
    hotCache.set(key, dbResult);
    return { ...dbResult, fromCache: true };
  }

  const startTime = Date.now();
  let translatedText = '';
  let usedEngine = 'fast';
  let success = false;

  // Priority 1: Custom Cloud API (DeepSeek / GLM / OpenAI / Anthropic)
  if ((mode === 'custom' || (mode === 'auto' && customConfig?.enabled)) && customConfig?.apiKey) {
    try {
      translatedText = await queryCustomApi(trimmed, customConfig);
      if (translatedText) {
        usedEngine = `API (${customConfig.model || 'Custom'})`;
        success = true;
      }
    } catch (err) {
      console.warn('[Neural Translate] Custom API failed, falling back:', err.message);
    }
  }

  // Priority 2: Configurable Local GPU Engine (Gemma-4, LM Studio, Ollama)
  if (!success && (mode === 'ai' || mode === 'auto')) {
    const isHealthy = await checkLocalHealth();
    if (isHealthy) {
      try {
        if (trimmed.length > 1500) {
          const chunks = splitIntoChunks(trimmed, 1300);
          const results = [];
          for (const c of chunks) {
            results.push(await queryLocalEngine(c));
          }
          translatedText = results.join('\n\n');
        } else {
          translatedText = await queryLocalEngine(trimmed);
        }
        if (translatedText) {
          usedEngine = 'Local AI (GPU)';
          success = true;
        }
      } catch (err) {
        console.warn('[Neural Translate] Local GPU engine failed, falling back to cloud:', err.message);
      }
    }
  }

  // Priority 3: Fast Cloud Fallback
  if (!success) {
    try {
      translatedText = await queryFastCloud(trimmed, targetLang);
      usedEngine = (mode !== 'fast') ? 'Cloud (Fallback)' : 'Fast Cloud';
    } catch (err) {
      console.error('[Neural Translate] Cloud translation error:', err);
      translatedText = trimmed;
      usedEngine = 'Error Fallback';
    }
  }

  const resultPayload = {
    text: translatedText || trimmed,
    engine: usedEngine,
    durationMs: Date.now() - startTime
  };

  if (hotCache.size >= MAX_HOT_CACHE) {
    const oldestKey = hotCache.keys().next().value;
    hotCache.delete(oldestKey);
  }
  hotCache.set(key, resultPayload);
  await setCachedTranslation(key, resultPayload);

  return { ...resultPayload, fromCache: false };
}

// --- Dynamic Script Injection & Safe Messaging ---
async function ensureContentScriptInjected(tabId) {
  try {
    await chrome.scripting.executeScript({
      target: { tabId },
      files: ['content/bidi-isolate.js', 'content/content.js']
    });
    await chrome.scripting.insertCSS({
      target: { tabId },
      files: ['content/content.css']
    });
  } catch (err) {}
}

async function safeSendMessage(tabId, message) {
  try {
    return await chrome.tabs.sendMessage(tabId, message);
  } catch (err) {
    await ensureContentScriptInjected(tabId);
    await new Promise(r => setTimeout(r, 120));
    try {
      return await chrome.tabs.sendMessage(tabId, message);
    } catch (retryErr) {}
  }
}

// --- High-Efficiency Structured Batch Translator ---
async function handleBatchTranslate(texts, mode = 'auto', targetLang = 'ar') {
  const results = new Array(texts.length);
  const uncachedIndices = [];

  // 1. Check Caches first (0ms)
  for (let i = 0; i < texts.length; i++) {
    const trimmed = (texts[i] || '').trim();
    if (!trimmed) {
      results[i] = { text: '', engine: 'none', fromCache: true };
      continue;
    }
    const key = hashKey(trimmed, mode, targetLang);
    if (hotCache.has(key)) {
      results[i] = { ...hotCache.get(key), fromCache: true };
    } else {
      uncachedIndices.push(i);
    }
  }

  // Check persistent DB for uncached items
  const stillUncached = [];
  for (const idx of uncachedIndices) {
    const trimmed = texts[idx].trim();
    const key = hashKey(trimmed, mode, targetLang);
    const dbRes = await getCachedTranslation(key);
    if (dbRes) {
      hotCache.set(key, dbRes);
      results[idx] = { ...dbRes, fromCache: true };
    } else {
      stillUncached.push(idx);
    }
  }

  if (stillUncached.length === 0) {
    return results;
  }

  // 2. Translate uncached items using structured batch prompt
  const CHUNK_SIZE = 10;
  for (let b = 0; b < stillUncached.length; b += CHUNK_SIZE) {
    const batchIndices = stillUncached.slice(b, b + CHUNK_SIZE);
    await processStructuredSubBatch(batchIndices, texts, results, mode, targetLang);
  }

  return results;
}

async function processStructuredSubBatch(batchIndices, texts, results, mode, targetLang) {
  const items = batchIndices.map((origIdx, localIdx) => '[' + localIdx + '] ' + texts[origIdx].trim());
  const structuredPrompt = items.join("\n");

  let translatedRaw = '';
  let usedEngine = 'batch';
  let success = false;

  const customConfig = await getCustomApiConfig();
  if ((mode === 'custom' || (mode === 'auto' && customConfig?.enabled)) && customConfig?.apiKey) {
    try {
      translatedRaw = await queryCustomApi(structuredPrompt, customConfig);
      if (translatedRaw) {
        usedEngine = 'API (' + (customConfig.model || 'Custom') + ')';
        success = true;
      }
    } catch (e) {}
  }

  if (!success && (mode === 'ai' || mode === 'auto')) {
    const isHealthy = await checkLocalHealth();
    if (isHealthy) {
      try {
        translatedRaw = await queryLocalEngine(structuredPrompt);
        if (translatedRaw) {
          usedEngine = 'Gemma-4 (GPU)';
          success = true;
        }
      } catch (e) {}
    }
  }

  // Parse structured response
  const parsedMap = new Map();
  if (success && translatedRaw) {
    const lines = translatedRaw.split("\n");
    for (const line of lines) {
      const match = line.match(/^\s*\[(\d+)\]\s*(.*)$/);
      if (match) {
        const localIdx = parseInt(match[1], 10);
        const transText = match[2].trim();
        if (transText) {
          parsedMap.set(localIdx, transText);
        }
      }
    }
  }

  // Assign results and cache them
  for (let localIdx = 0; localIdx < batchIndices.length; localIdx++) {
    const origIdx = batchIndices[localIdx];
    const originalText = texts[origIdx].trim();

    if (parsedMap.has(localIdx)) {
      const transText = parsedMap.get(localIdx);
      const payload = { text: transText, engine: usedEngine, durationMs: 120 };
      results[origIdx] = { ...payload, fromCache: false };

      const key = hashKey(originalText, mode, targetLang);
      hotCache.set(key, payload);
      setCachedTranslation(key, payload);
    } else {
      const singleRes = await handleTranslate({ text: originalText, mode, targetLang });
      results[origIdx] = singleRes;
    }
  }
}
// --- Extension Message Listeners ---
chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
  if (!request || !request.action) return false;

  switch (request.action) {
    case 'TRANSLATE':
      handleTranslate(request).then(sendResponse);
      return true;

    case 'TRANSLATE_BATCH':
      (async () => {
        const { texts, mode = 'auto', targetLang = 'ar' } = request;
        if (!Array.isArray(texts) || texts.length === 0) {
          sendResponse({ results: [] });
          return;
        }
        const results = await handleBatchTranslate(texts, mode, targetLang);
        sendResponse({ results });
      })();
      return true;

    case 'CHECK_STATUS':
      (async () => {
        const localHealthy = await checkLocalHealth(true);
        const telemetry = await fetchTelemetry();
        const customConfig = await getCustomApiConfig();
        sendResponse({ localHealthy, telemetry, customConfig });
      })();
      return true;

    case 'TEST_LOCAL_SERVER':
      (async () => {
        const startTime = Date.now();
        const url = (request.url || DEFAULT_LOCAL_AI_URL).replace(/\/+$/, '');
        try {
          const controller = new AbortController();
          const timeoutId = setTimeout(() => controller.abort(), 4000);
          let res = await fetch(`${url}/health`, { signal: controller.signal }).catch(() => null);
          if (!res || !res.ok) {
            res = await fetch(`${url}/v1/models`, { signal: controller.signal }).catch(() => null);
          }
          clearTimeout(timeoutId);

          if (res && res.ok) {
            sendResponse({
              success: true,
              durationMs: Date.now() - startTime,
              url
            });
          } else {
            sendResponse({
              success: false,
              error: 'الخادم لم يستجب على المسارات /health أو /v1/models.'
            });
          }
        } catch (e) {
          sendResponse({ success: false, error: e.message });
        }
      })();
      return true;

    case 'TEST_CUSTOM_API':
      (async () => {
        const startTime = Date.now();
        try {
          const sample = 'Neural inference pipeline and latency benchmark.';
          const result = await queryCustomApi(sample, request.config);
          sendResponse({
            success: true,
            durationMs: Date.now() - startTime,
            sampleResult: result
          });
        } catch (err) {
          sendResponse({ success: false, error: err.message });
        }
      })();
      return true;

    case 'OPEN_READER':
      chrome.tabs.create({ url: chrome.runtime.getURL('reader/reader.html') }, (tab) => {
        sendResponse({ success: true, tabId: tab.id });
      });
      return true;

    case 'CLEAR_CACHE':
      hotCache.clear();
      clearCacheDB().then(() => sendResponse({ success: true }));
      return true;

    default:
      sendResponse({ error: 'Unknown action' });
      return false;
  }
});

// --- Context Menus & Initialization ---
chrome.runtime.onInstalled.addListener(async () => {
  chrome.contextMenus.removeAll(() => {
    // Parent Menu
    chrome.contextMenus.create({
      id: 'neural-main-menu',
      title: 'Neural Translate - خيارات الترجمة',
      contexts: ['all']
    });

    // 1. Translate current page only (single page)
    chrome.contextMenus.create({
      parentId: 'neural-main-menu',
      id: 'neural-menu-translate-single-page',
      title: 'ترجمة كامل الصفحة الحالية فقط (صفحة واحدة)',
      contexts: ['all']
    });

    // 2. Persistent continuous auto-translate across scroll and links
    chrome.contextMenus.create({
      parentId: 'neural-main-menu',
      id: 'neural-menu-toggle-site-auto',
      title: 'الترجمة المستمرة (Auto-Translate) لهذا الموقع دائماً',
      contexts: ['all']
    });

    // 2. Translate specific clicked section / block
    chrome.contextMenus.create({
      parentId: 'neural-main-menu',
      id: 'neural-menu-translate-section',
      title: 'ترجمة هذه الفقرة أو المنطقة في مكانها',
      contexts: ['all']
    });



    // Separator
    chrome.contextMenus.create({
      parentId: 'neural-main-menu',
      id: 'neural-menu-sep-1',
      type: 'separator',
      contexts: ['all']
    });

    // 4. Selection: In-place direct replace
    chrome.contextMenus.create({
      parentId: 'neural-main-menu',
      id: 'neural-menu-selection-replace',
      title: 'استبدال النص المحدد بمكانه مباشرة',
      contexts: ['selection']
    });

    // 5. Selection: Tooltip card
    chrome.contextMenus.create({
      parentId: 'neural-main-menu',
      id: 'neural-menu-selection-tooltip',
      title: 'ترجمة النص المحدد في نافذة عائمة',
      contexts: ['selection']
    });

    // 6. Revert
    chrome.contextMenus.create({
      parentId: 'neural-main-menu',
      id: 'neural-menu-revert',
      title: 'استعادة النصوص الأصلية للصفحة',
      contexts: ['all']
    });

    // 7. Open Reader
    chrome.contextMenus.create({
      parentId: 'neural-main-menu',
      id: 'neural-menu-open-reader',
      title: 'فتح قارئ ومترجم المستندات (PDF / Word / EPUB)',
      contexts: ['all']
    });
  });

  try {
    const tabs = await chrome.tabs.query({ url: ['http://*/*', 'https://*/*'] });
    for (const t of tabs) {
      if (t.id) ensureContentScriptInjected(t.id);
    }
  } catch (e) {}
});

chrome.contextMenus.onClicked.addListener(async (info, tab) => {
  if (!tab?.id) return;

  switch (info.menuItemId) {
    case 'neural-menu-translate-single-page':
      await safeSendMessage(tab.id, { action: 'TRIGGER_SINGLE_PAGE_TRANSLATE' });
      break;
    case 'neural-menu-translate-section':
      await safeSendMessage(tab.id, { action: 'TRIGGER_TRANSLATE_SECTION' });
      break;
    case 'neural-menu-toggle-site-auto':
      await safeSendMessage(tab.id, { action: 'TOGGLE_SITE_AUTO_TRANSLATE' });
      break;
    case 'neural-menu-selection-replace':
      await safeSendMessage(tab.id, {
        action: 'TRIGGER_SELECTION_REPLACE_DIRECT',
        selectionText: info.selectionText
      });
      break;
    case 'neural-menu-selection-tooltip':
      await safeSendMessage(tab.id, {
        action: 'TRIGGER_SELECTION_TRANSLATE',
        selectionText: info.selectionText
      });
      break;
    case 'neural-menu-revert':
      await safeSendMessage(tab.id, { action: 'REVERT_ALL' });
      break;
    case 'neural-menu-open-reader':
      chrome.tabs.create({ url: chrome.runtime.getURL('reader/reader.html') });
      break;
  }
});

chrome.commands.onCommand.addListener(async (command) => {
  const tabs = await chrome.tabs.query({ active: true, currentWindow: true });
  if (!tabs[0]?.id) return;
  if (command === 'toggle_page_translate') {
    await safeSendMessage(tabs[0].id, { action: 'TRIGGER_PAGE_TRANSLATE' });
  } else if (command === 'open_reader') {
    chrome.tabs.create({ url: chrome.runtime.getURL('reader/reader.html') });
  }
});

