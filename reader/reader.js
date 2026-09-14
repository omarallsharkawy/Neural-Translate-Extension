/**
 * Neural Reader - Cinematic Editorial Workspace Engine
 * Native Client-Side Document & Book Support:
 * - PDF (.pdf via embedded PDF.js)
 * - Word (.docx via embedded JSZip & XML DOM Parser)
 * - EPUB (.epub multi-chapter extractor via JSZip)
 * - Markdown & Plain Text (.md, .txt)
 * Synchronized split scrolling, paragraph cards, inline disclosure, and multi-format export.
 */

document.addEventListener('DOMContentLoaded', () => {
  // DOM Elements
  const emptyState = document.getElementById('empty-state');
  const readerWorkspace = document.getElementById('reader-workspace');
  const dropZone = document.getElementById('drop-zone');
  const fileInput = document.getElementById('file-input');
  const btnBrowseFile = document.getElementById('btn-browse-file');
  const btnLoadSample = document.getElementById('btn-load-sample');
  const docTitle = document.getElementById('doc-title');
  const sourceContent = document.getElementById('source-content');
  const targetContent = document.getElementById('target-content');
  const sourceWordCount = document.getElementById('source-word-count');
  const targetStatBadge = document.getElementById('target-stat-badge');
  const progressBarFill = document.getElementById('progress-bar-fill');
  const progressText = document.getElementById('progress-text');
  const progressStats = document.getElementById('progress-stats');
  const btnTranslateAll = document.getElementById('btn-translate-all');
  const btnPauseTranslate = document.getElementById('btn-pause-translate');
  const btnCloseDoc = document.getElementById('btn-close-doc');
  const modeDual = document.getElementById('mode-dual');
  const modeInline = document.getElementById('mode-inline');
  const fontDecrease = document.getElementById('font-decrease');
  const fontIncrease = document.getElementById('font-increase');
  const fontSizeVal = document.getElementById('font-size-val');
  const readerEngineName = document.getElementById('reader-engine-name');

  // Export Dropdown
  const btnExportMenu = document.getElementById('btn-export-menu');
  const exportDropdown = document.getElementById('export-dropdown');
  const btnExportCopy = document.getElementById('btn-export-copy');
  const btnExportPdf = document.getElementById('btn-export-pdf');
  const btnExportMd = document.getElementById('btn-export-md');
  const btnExportTxt = document.getElementById('btn-export-txt');

  // State
  let paragraphs = [];
  let isTranslating = false;
  let isPaused = false;
  let currentFontSize = 16;
  let currentViewMode = 'dual';
  let currentFileName = '';

  // Configure PDF.js worker
  if (window.pdfjsLib) {
    window.pdfjsLib.GlobalWorkerOptions.workerSrc = 'lib/pdf.worker.min.js';
  }

  const SAMPLE_PAPER = `# Next-Generation Neural Architectures and Tensor Acceleration

The rapid scaling of generative large language models has fundamentally transformed computing paradigms, driving unprecedented demand for specialized tensor acceleration hardware and low-latency inference runtimes. 

Modern autoregressive transformer decoders require massive memory bandwidth to sustain high-throughput token generation. Techniques such as FlashAttention-3, grouped-query attention (GQA), and 4-bit block-wise quantization (such as GGUF and FP8) have become standard for deploying multi-billion parameter models directly onto consumer GPUs.

By offloading computational layers through Vulkan and CUDA backends, local edge devices can now execute complex reasoning models without transferring private user telemetry over the internet. This shift guarantees absolute confidentiality while achieving sub-20ms first-token latency.

Bidirectional layout isolation and context-aware natural language translation bridge communication barriers for software engineers and researchers worldwide, enabling seamless knowledge dissemination across language borders.`;

  // 1. Probe Engine
  function probeEngine() {
    chrome.runtime.sendMessage({ action: 'CHECK_STATUS' }, (res) => {
      if (res?.customConfig?.enabled && res?.customConfig?.apiKey) {
        readerEngineName.textContent = `API (${res.customConfig.model || 'Custom'})`;
      } else if (res?.localHealthy) {
        readerEngineName.textContent = 'Local GPU (Gemma-4)';
      } else {
        readerEngineName.textContent = 'Cloud Engine';
      }
    });
  }
  probeEngine();

  // Automatic PDF & Document URL Loader (e.g. ?file=... or ?url=...)
  const urlParams = new URLSearchParams(window.location.search);
  const targetDocUrl = urlParams.get('file') || urlParams.get('url') || urlParams.get('pdf');
  if (targetDocUrl) {
    loadDocFromUrl(targetDocUrl);
  }

  async function loadDocFromUrl(url) {
    try {
      docTitle.textContent = 'جارٍ تحميل المستند...';
      const filename = decodeURIComponent(url.split('/').pop().split('?')[0]) || 'document.pdf';
      const response = await fetch(url);
      if (!response.ok) {
        throw new Error('فشل جلب الملف: ' + response.statusText);
      }
      const arrayBuffer = await response.arrayBuffer();
      if (filename.toLowerCase().endsWith('.docx')) {
        parseDocxContent(arrayBuffer, filename);
      } else if (filename.toLowerCase().endsWith('.epub')) {
        parseEpubContent(arrayBuffer, filename);
      } else {
        // Default to PDF parser
        parsePdfContent(arrayBuffer, filename);
      }
    } catch (err) {
      alert('تعذر فتح المستند تلقائياً: ' + err.message);
      docTitle.textContent = 'لم يتم تحميل مستند';
    }
  }


  // 2. Drag & Drop
  dropZone.addEventListener('dragover', (e) => {
    e.preventDefault();
    dropZone.style.borderColor = '#b7825e';
    dropZone.style.background = '#221f1c';
  });

  dropZone.addEventListener('dragleave', () => {
    dropZone.style.borderColor = '';
    dropZone.style.background = '';
  });

  dropZone.addEventListener('drop', (e) => {
    e.preventDefault();
    dropZone.style.borderColor = '';
    dropZone.style.background = '';
    if (e.dataTransfer.files.length > 0) {
      loadFile(e.dataTransfer.files[0]);
    }
  });

  btnBrowseFile.addEventListener('click', () => fileInput.click());
  fileInput.addEventListener('change', (e) => {
    if (e.target.files.length > 0) {
      loadFile(e.target.files[0]);
    }
  });

  btnLoadSample.addEventListener('click', () => {
    currentFileName = 'sample-ai-architecture.md';
    loadTextContent(SAMPLE_PAPER, currentFileName);
  });

  // 3. Multi-Format File Loading
  function loadFile(file) {
    currentFileName = file.name;
    const lowerName = file.name.toLowerCase();
    const reader = new FileReader();

    if (lowerName.endsWith('.docx')) {
      reader.onload = (e) => parseDocxContent(e.target.result, file.name);
      reader.readAsArrayBuffer(file);
    } else if (lowerName.endsWith('.pdf')) {
      reader.onload = (e) => parsePdfContent(e.target.result, file.name);
      reader.readAsArrayBuffer(file);
    } else if (lowerName.endsWith('.epub')) {
      reader.onload = (e) => parseEpubContent(e.target.result, file.name);
      reader.readAsArrayBuffer(file);
    } else {
      reader.onload = (e) => loadTextContent(e.target.result, file.name);
      reader.readAsText(file);
    }
  }

  // --- Word (.docx) Parser via JSZip ---
  async function parseDocxContent(arrayBuffer, filename) {
    try {
      if (!window.JSZip) {
        throw new Error('JSZip library not loaded.');
      }
      const zip = await window.JSZip.loadAsync(arrayBuffer);
      const docXmlFile = zip.file('word/document.xml');
      if (!docXmlFile) {
        throw new Error('Invalid Word document: word/document.xml missing.');
      }

      const xmlText = await docXmlFile.async('string');
      const parser = new DOMParser();
      const xmlDoc = parser.parseFromString(xmlText, 'application/xml');

      const paragraphsList = [];
      const pElements = xmlDoc.getElementsByTagName('w:p');

      for (let i = 0; i < pElements.length; i++) {
        const pEl = pElements[i];
        let pText = '';
        const tElements = pEl.getElementsByTagName('w:t');
        for (let j = 0; j < tElements.length; j++) {
          pText += tElements[j].textContent;
        }

        const trimmed = pText.trim();
        if (trimmed.length > 0) {
          paragraphsList.push(trimmed);
        }
      }

      if (paragraphsList.length === 0) {
        throw new Error('No text found in Word document.');
      }

      loadParsedParagraphs(paragraphsList, filename);
    } catch (err) {
      alert(`تعذر قراءة ملف Word (${filename}): ${err.message}`);
    }
  }

  // --- PDF (.pdf) Parser via PDF.js ---
  async function parsePdfContent(arrayBuffer, filename) {
    try {
      if (!window.pdfjsLib) {
        throw new Error('PDF.js library not loaded.');
      }

      const pdf = await window.pdfjsLib.getDocument({ data: arrayBuffer }).promise;
      const numPages = pdf.numPages;
      const paragraphsList = [];

      for (let pageNum = 1; pageNum <= numPages; pageNum++) {
        const page = await pdf.getPage(pageNum);
        const textContent = await page.getTextContent();
        const items = textContent.items;

        if (!items || items.length === 0) continue;

        // Group items into lines and paragraphs by Y position
        let currentPara = '';
        let lastY = null;

        for (const item of items) {
          const str = item.str;
          if (!str) continue;

          const currentY = item.transform ? item.transform[5] : null;

          if (lastY !== null && currentY !== null && Math.abs(currentY - lastY) > 16) {
            if (currentPara.trim().length > 0) {
              paragraphsList.push(currentPara.trim());
              currentPara = '';
            }
          }

          currentPara += (currentPara && !currentPara.endsWith(' ') ? ' ' : '') + str;
          if (currentY !== null) lastY = currentY;
        }

        if (currentPara.trim().length > 0) {
          paragraphsList.push(currentPara.trim());
        }
      }

      if (paragraphsList.length === 0) {
        throw new Error('لم يتم العثور على نصوص قابلة للقراءة داخل ملف PDF (ربما ملف ممسوح ضوئياً Scanned).');
      }

      loadParsedParagraphs(paragraphsList, filename);
    } catch (err) {
      alert(`تعذر قراءة ملف PDF (${filename}): ${err.message}`);
    }
  }

  // --- EPUB Parser via JSZip ---
  async function parseEpubContent(arrayBuffer, filename) {
    try {
      if (window.JSZip) {
        const zip = await window.JSZip.loadAsync(arrayBuffer);
        const cleanParagraphs = [];

        // Search for all xhtml / html chapter files in zip
        const htmlFiles = Object.keys(zip.files).filter(k => /\.(xhtml|html|htm)$/i.test(k) && !k.includes('toc'));
        htmlFiles.sort();

        for (const fileKey of htmlFiles) {
          const fileContent = await zip.file(fileKey).async('string');
          const parser = new DOMParser();
          const doc = parser.parseFromString(fileContent, 'text/html');
          const pEls = doc.querySelectorAll('p, h1, h2, h3, h4');

          pEls.forEach(el => {
            const t = el.textContent.trim();
            if (t.length > 15) {
              cleanParagraphs.push(t);
            }
          });
        }

        if (cleanParagraphs.length > 0) {
          loadParsedParagraphs(cleanParagraphs, filename);
          return;
        }
      }

      // Fallback text extraction
      const decoder = new TextDecoder('utf-8');
      const text = decoder.decode(arrayBuffer);
      const clean = text.replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim();
      loadTextContent(clean.slice(0, 50000), filename);
    } catch (err) {
      alert('تعذر قراءة ملف EPUB: ' + err.message);
    }
  }

  function loadTextContent(rawText, filename) {
    const rawChunks = rawText.split(/\n\s*\n+/);
    const validChunks = rawChunks
      .map(c => c.trim())
      .filter(c => c.length > 0);

    loadParsedParagraphs(validChunks, filename);
  }

  function loadParsedParagraphs(chunks, filename) {
    paragraphs = chunks.map((text, idx) => ({
      id: idx,
      source: text,
      translated: '',
      state: 'pending'
    }));

    docTitle.textContent = filename;

    // Critical: Hide empty dropzone completely and reveal workspace
    emptyState.classList.add('hidden');
    emptyState.style.display = 'none';

    readerWorkspace.classList.remove('hidden');
    readerWorkspace.style.display = 'flex';

    btnCloseDoc.classList.remove('hidden');

    // Count source words
    const totalWords = chunks.reduce((acc, c) => acc + c.split(/\s+/).length, 0);
    sourceWordCount.textContent = `${totalWords} words`;

    renderAllParagraphs();
    updateProgress();
  }

  // Close Document & Return to Dropzone
  btnCloseDoc.addEventListener('click', () => {
    paragraphs = [];
    isTranslating = false;
    isPaused = false;
    currentFileName = '';
    docTitle.textContent = 'لم يتم تحميل مستند';

    readerWorkspace.classList.add('hidden');
    readerWorkspace.style.display = 'none';

    emptyState.classList.remove('hidden');
    emptyState.style.display = 'flex';

    btnCloseDoc.classList.add('hidden');
    btnTranslateAll.classList.remove('hidden');
    btnPauseTranslate.classList.add('hidden');

    sourceContent.innerHTML = '';
    targetContent.innerHTML = '';
    progressBarFill.style.width = '0%';
    progressStats.textContent = '0 / 0 فقرة';
    progressText.textContent = 'جاهز للقراءة';
  });

  // 4. Render Paragraph Cards
  function renderAllParagraphs() {
    sourceContent.innerHTML = '';
    targetContent.innerHTML = '';

    paragraphs.forEach((p) => {
      // Source Card
      const sCard = document.createElement('div');
      sCard.className = 'reader-card';
      sCard.id = `src-card-${p.id}`;
      sCard.dataset.id = p.id;
      sCard.innerHTML = `
        <div class="card-meta-bar">
          <span class="para-num">§ ${String(p.id + 1).padStart(2, '0')}</span>
          <div class="card-actions">
            <button class="card-btn btn-copy-src" title="Copy paragraph">Copy</button>
          </div>
        </div>
        <div class="para-text-source">${escapeHtml(p.source)}</div>
      `;


      sCard.querySelector('.btn-copy-src')?.addEventListener('click', (e) => {
        e.stopPropagation();
        navigator.clipboard.writeText(p.source);
      });

      sCard.addEventListener('mouseenter', () => highlightSync(p.id));
      sCard.addEventListener('click', () => scrollToSync(p.id, 'target'));

      sourceContent.appendChild(sCard);

      // Target Card
      const tCard = document.createElement('div');
      tCard.className = 'reader-card';
      tCard.id = `tgt-card-${p.id}`;
      tCard.dataset.id = p.id;

      renderTargetCard(tCard, p);

      tCard.addEventListener('mouseenter', () => highlightSync(p.id));
      tCard.addEventListener('click', () => scrollToSync(p.id, 'source'));

      targetContent.appendChild(tCard);
    });
  }

  function renderTargetCard(card, p) {
    const isDone = p.state === 'done';
    const isTranslating = p.state === 'translating';

    let statusHtml = '';
    if (isDone) statusHtml = '<span class="card-status-badge done">مكتمل</span>';
    else if (isTranslating) statusHtml = '<span class="card-status-badge translating">جارٍ الترجمة...</span>';
    else statusHtml = '<span class="card-status-badge pending">في الانتظار</span>';

    card.innerHTML = `
      <div class="card-meta-bar">
        <span class="para-num">§ ${String(p.id + 1).padStart(2, '0')}</span>
        <div class="card-actions">
          ${statusHtml}
          ${isDone ? '<button class="card-btn btn-copy-tgt">نسخ</button>' : ''}
          <button class="card-btn btn-retry-tgt">${isDone ? 'إعادة ترجمة' : 'ترجمة'}</button>
        </div>
      </div>
      <div class="para-text-arabic">
        ${isDone ? (window.NeuralBiDi ? window.NeuralBiDi.isolateInlineTerms(escapeHtml(p.translated)) : escapeHtml(p.translated))
                 : (isTranslating ? '<span style="color:#b4a99a; font-style:italic;">جارٍ تشغيل الاستدلال العصبي...</span>'
                                  : '<span style="color:#8d8171; font-style:italic;">انقر "ترجمة" لبدء المعالجة...</span>')}
      </div>
      <details class="inline-source-disclosure" ${currentViewMode === 'inline' ? '' : 'style="display:none;"'}>
        <summary>النص الأصلي (Original)</summary>
        <div class="inline-source-text">${escapeHtml(p.source)}</div>
      </details>
    `;


    card.querySelector('.btn-copy-tgt')?.addEventListener('click', (e) => {
      e.stopPropagation();
      navigator.clipboard.writeText(p.translated);
      const btn = card.querySelector('.btn-copy-tgt');
      if (btn) {
        btn.textContent = 'تم النسخ!';
        setTimeout(() => { btn.textContent = 'نسخ'; }, 1200);
      }
    });

    card.querySelector('.btn-retry-tgt')?.addEventListener('click', (e) => {
      e.stopPropagation();
      translateSingleParagraph(p);
    });
  }

  // 5. Synchronized Highlighting & Scrolling
  function highlightSync(id) {
    document.querySelectorAll('.reader-card.active-sync').forEach(el => el.classList.remove('active-sync'));
    const s = document.getElementById(`src-card-${id}`);
    const t = document.getElementById(`tgt-card-${id}`);
    if (s) s.classList.add('active-sync');
    if (t) t.classList.add('active-sync');
  }

  function scrollToSync(id, direction) {
    const targetElement = document.getElementById(direction === 'target' ? `tgt-card-${id}` : `src-card-${id}`);
    if (targetElement) {
      targetElement.scrollIntoView({ behavior: 'smooth', block: 'center' });
    }
  }

  // 6. Batch Translation Queue
  btnTranslateAll.addEventListener('click', startBatchTranslation);
  btnPauseTranslate.addEventListener('click', pauseBatchTranslation);

  async function startBatchTranslation() {
    if (isTranslating) return;
    isTranslating = true;
    isPaused = false;

    btnTranslateAll.classList.add('hidden');
    btnPauseTranslate.classList.remove('hidden');

    const pending = paragraphs.filter(p => p.state === 'pending');

    const CONCURRENCY = 2;
    for (let i = 0; i < pending.length; i += CONCURRENCY) {
      if (isPaused) break;
      const batch = pending.slice(i, i + CONCURRENCY);
      await Promise.all(batch.map(p => translateSingleParagraph(p)));
    }

    isTranslating = false;
    btnTranslateAll.classList.remove('hidden');
    btnPauseTranslate.classList.add('hidden');
    updateProgress();
  }

  function pauseBatchTranslation() {
    isPaused = true;
    isTranslating = false;
    btnTranslateAll.classList.remove('hidden');
    btnPauseTranslate.classList.add('hidden');
    progressText.textContent = 'تم الإيقاف المؤقت للترجمة';
  }

  async function translateSingleParagraph(p) {
    p.state = 'translating';
    const card = document.getElementById(`tgt-card-${p.id}`);
    if (card) renderTargetCard(card, p);

    return new Promise((resolve) => {
      chrome.runtime.sendMessage(
        { action: 'TRANSLATE', text: p.source, mode: 'auto', targetLang: 'ar' },
        (res) => {
          if (res && res.text) {
            p.translated = res.text;
            p.state = 'done';
          } else {
            p.translated = p.source;
            p.state = 'done';
          }
          if (card) renderTargetCard(card, p);
          updateProgress();
          resolve();
        }
      );
    });
  }

  // 7. Update Progress
  function updateProgress() {
    const total = paragraphs.length;
    if (total === 0) return;

    const completed = paragraphs.filter(p => p.state === 'done').length;
    const percentage = Math.round((completed / total) * 100);

    progressBarFill.style.width = `${percentage}%`;
    progressStats.textContent = `${completed} / ${total} فقرة (%${percentage})`;
    targetStatBadge.textContent = `${completed} فقرة مكتملة`;
    progressText.textContent = completed === total ? 'تمت ترجمة المستند بالكامل' : (isTranslating ? 'جارٍ الترجمة المتسلسلة...' : 'جاهز للقراءة');
  }

  // 8. View Mode Toggle
  modeDual.addEventListener('click', () => {
    currentViewMode = 'dual';
    modeDual.classList.add('active');
    modeInline.classList.remove('active');
    readerWorkspace.className = 'reader-workspace dual-view';
    document.querySelectorAll('.inline-source-disclosure').forEach(el => el.style.display = 'none');
  });

  modeInline.addEventListener('click', () => {
    currentViewMode = 'inline';
    modeInline.classList.add('active');
    modeDual.classList.remove('active');
    readerWorkspace.className = 'reader-workspace inline-view';
    document.querySelectorAll('.inline-source-disclosure').forEach(el => el.style.display = 'block');
  });

  // 9. Typography Controls
  fontDecrease.addEventListener('click', () => {
    if (currentFontSize > 13) {
      currentFontSize -= 1;
      applyFontSize();
    }
  });

  fontIncrease.addEventListener('click', () => {
    if (currentFontSize < 26) {
      currentFontSize += 1;
      applyFontSize();
    }
  });

  function applyFontSize() {
    document.documentElement.style.setProperty('--font-base', `${currentFontSize}px`);
    fontSizeVal.textContent = `${currentFontSize}px`;
  }

  // 10. Multi-Format Export & Clean Clipboard
  btnExportMenu.addEventListener('click', (e) => {
    e.stopPropagation();
    exportDropdown.classList.toggle('hidden');
  });

  document.addEventListener('click', () => {
    exportDropdown.classList.add('hidden');
  });

  btnExportCopy.addEventListener('click', () => {
    if (paragraphs.length === 0) return;
    const text = paragraphs.map(p => p.translated || p.source).join('\n\n');
    navigator.clipboard.writeText(text).then(() => {
      btnExportMenu.querySelector('span').textContent = 'تم النسخ!';
      setTimeout(() => { btnExportMenu.querySelector('span').textContent = 'تصدير'; }, 1500);
    });
  });

  btnExportPdf?.addEventListener('click', () => exportAsPdf());
  btnExportMd.addEventListener('click', () => downloadDoc('md'));
  btnExportTxt.addEventListener('click', () => downloadDoc('txt'));

    // Clean PDF Export / Print
  function exportAsPdf() {
    if (paragraphs.length === 0) return;
    window.print();
  }
  function downloadDoc(ext) {
    if (paragraphs.length === 0) return;
    const text = paragraphs.map(p => p.translated || p.source).join('\n\n');
    const mime = ext === 'md' ? 'text/markdown;charset=utf-8' : 'text/plain;charset=utf-8';
    const blob = new Blob([text], { type: mime });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `translated-${currentFileName.replace(/\.[^/.]+$/, '') || 'document'}.${ext}`;
    a.click();
    URL.revokeObjectURL(url);
  }

  function escapeHtml(text) {
    if (!text) return '';
    return text
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#039;');
  }
});

