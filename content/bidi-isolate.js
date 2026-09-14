/**
 * Neural Translate - BiDi Isolation Engine (Cinematic Editorial Edition)
 * Preserves punctuation, parentheses, acronyms, and eliminates intrusive browser tooltips.
 */

(function() {
  'use strict';

  const ARABIC_REGEX = /[\u0600-\u06FF\u0750-\u077F\u08A0-\u08FF]/;

  function isArabic(str) {
    return ARABIC_REGEX.test(str);
  }

  function isolateInlineTerms(htmlOrText) {
    if (!isArabic(htmlOrText)) return htmlOrText;
    return htmlOrText.replace(
      /([a-zA-Z0-9_#@$][a-zA-Z0-9_#@$.:\/-]*[a-zA-Z0-9])/g,
      (match) => `<bdi dir="ltr" class="neural-tech-token">${match}</bdi>`
    );
  }

  /**
   * Generates a clean in-place replacement element WITHOUT native title tooltip attribute.
   */
  function createReplacedElement(translatedText, originalText) {
    const bdi = document.createElement('bdi');
    bdi.className = 'neural-in-place-replaced';
    bdi.setAttribute('dir', 'rtl');
    bdi.setAttribute('data-neural-original', originalText);
    // Notice: NO title attribute to avoid browser default black tooltip!
    bdi.innerHTML = isolateInlineTerms(escapeHtml(translatedText));
    return bdi;
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

  window.NeuralBiDi = {
    isArabic,
    isolateInlineTerms,
    createReplacedElement,
    escapeHtml
  };
})();

