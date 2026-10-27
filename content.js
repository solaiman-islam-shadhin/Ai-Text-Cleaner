/**
 * content.js — ISOLATED world, document_start, all frames.
 *
 * Copy strategies:
 *   1. FAST PATH: getSelection() has text → clean synchronously via clipboardData.
 *   2. SHADOW DOM PATH: Try to get text from active element / shadow roots.
 *   3. FALLBACK: async clipboard read-clean-rewrite (for JS-driven copy buttons).
 */
(function () {
  'use strict';

  // ─── Cleaning engine ────────────────────────────────────────────────────────

  const DEFAULT_SETTINGS = {
    masterEnabled: true,
    removeWatermarks: true,
    fixDashes: true,
    fixQuotes: true,
    removeEmojis: true,
    cleanMarkdown: false,
    removeCitations: true,
    removeFillerPhrases: true,
    replaceAIWords: true,
    removePlaceholders: true,
    fixPunctuation: true,
    customReplacementsEnabled: false,
    customReplacements: []
  };

  // Default AI platform domains — user can add/remove via popup
  const DEFAULT_AI_DOMAINS = [
    'chat.openai.com',
    'chatgpt.com',
    'claude.ai',
    'gemini.google.com',
    'bard.google.com',
    'copilot.microsoft.com',
    'bing.com',
    'perplexity.ai',
    'you.com',
    'poe.com',
    'character.ai',
    'deepseek.com',
    'mistral.ai',
    'huggingface.co',
    'cohere.com',
    'writesonic.com',
    'jasper.ai',
    'copy.ai',
    'rytr.me',
    'notion.so'
  ];

  // Check if current hostname matches any allowed domain
  function isAIDomain(allowedDomains) {
    const host = window.location.hostname.toLowerCase();
    return allowedDomains.some(d => host === d || host.endsWith('.' + d));
  }

  const RE_INVISIBLE   = /[\u200B\u200C\u200D\uFEFF\u00AD\u200E\u200F\u202A-\u202E\u2060-\u2064\u2066-\u2069\u206A-\u206F]/g;
  const RE_WORD_SPACING_MARKS = /[\u200B\u2060]/g;
  const RE_NBSP        = /\u00A0/g;
  const RE_DASHES      = /[\u2012\u2013\u2014\u2015\u2212\uFE58\u2E3A\u2E3B]/g;
  const RE_DBL_HYPHEN  = /--+/g;
  const RE_DBL_QUOTES  = /[\u201C\u201D\u201E\u201F\u2033\u2036]/g;
  const RE_SGL_QUOTES  = /[\u2018\u2019\u201A\u201B\u2032\u2035]/g;

  let RE_EMOJI;
  try {
    RE_EMOJI = new RegExp(
      '(\\p{Extended_Pictographic}(\\u200D\\p{Extended_Pictographic})*|' +
      '[\\u{1F3FB}-\\u{1F3FF}]|[\\u{FE0F}\\u{20E3}]|[\\u{1F1E6}-\\u{1F1FF}]{2})',
      'gu'
    );
  } catch (e) {
    RE_EMOJI = /[\u203C-\u3299\u{1F000}-\u{1FAFF}]/gu;
  }

  // Math, technical & AI-style symbols (benzene ⌬, atom ⚛, infinity ∞, tensor ⊗, nodes ◉◎, loop ⟳, etc.)
  // Covers: Misc Symbols, Math Operators, Geometric Shapes, Arrows, Supplemental Arrows, Letterlike, etc.
  const RE_TECH_SYMBOLS = /[\u2190-\u21FF\u2200-\u22FF\u2300-\u23FF\u2400-\u243F\u2440-\u245F\u2460-\u24FF\u2500-\u257F\u2580-\u259F\u25A0-\u25FF\u2600-\u26FF\u2700-\u27BF\u27C0-\u27EF\u27F0-\u27FF\u2900-\u297F\u2980-\u29FF\u2A00-\u2AFF\u2B00-\u2BFF\u2E00-\u2E7F]/g;

  const RE_BOLD              = /\*\*([^*]+)\*\*/g;
  const RE_ITALIC_STAR       = /\*([^*]+)\*/g;
  const RE_ITALIC_UNDERSCORE = /_([^_]+)_/g;
  const RE_HEADING           = /^[ \t]{0,3}#{1,6}[ \t]+/gm;
  const RE_INLINE_CODE       = /`([^`]+)`/g;

  // Citation / leaked tokens
  const RE_CITATIONS = /contentReference\[[^\]]*\](?:\{[^}]*\})?|\[(?:\d+|cite:\s*\d+)(?:\s*[,–-]\s*\d+)*\]|\u3010[\d:†\w\s]+\u3011|\bcite\w*\d+\b/gi;

  // Unfilled placeholders
  const RE_PLACEHOLDERS = /\[(?:Your |INSERT |Describe|Add |Enter |Include |Specify )[^\]]{0,60}\]/gi;

  // Filler phrases — ordered longest-first
  const FILLER_PHRASES = [
    "It is important to note that",
    "It's important to note that",
    "It\u2019s important to note that",
    "Please note that",
    "In summary",
    "It is worth noting that",
    "It's worth noting that",
    "It\u2019s worth noting that",
    "It should be mentioned that",
    "It should be noted that",
    "In today's fast-paced world",
    "In today\u2019s fast-paced world",
    "In the ever-evolving landscape of",
    "In the ever evolving landscape of",
    "Let's dive in",
    "Let\u2019s dive in",
    "First and foremost,",
    "As a matter of fact,",
    "To begin with,",
    "Additionally,",
    "Furthermore,",
    "Moreover,",
    "Here are",
    "Here is",
    "Needless to say,",
    "Sure!",
    "In conclusion,",
    "In conclusion",
    "I hope this helps",
    "Feel free to reach out",
    "Great question!",
    "Certainly!",
    "Absolutely!",
    "Overall,",
    "Overall",
    "It goes without saying that",
    "Needless to say",
    "As previously mentioned,",
    "As previously mentioned",
    "As mentioned earlier,",
    "As mentioned earlier",
    "It is crucial to understand that",
    "It is essential to note that",
    "Studies show that",
    "Research shows that",
    "Research suggests that",
    "Experts say that",
    "Not just",
    "game-changing",
    "transformative",
    "revolutionary",
    "groundbreaking"
  ];

  // AI word → simpler replacement
  const AI_WORD_MAP = [
    [/\butilize\b/gi,       'use'],
    [/\butilizes\b/gi,      'uses'],
    [/\butilized\b/gi,      'used'],
    [/\butilizing\b/gi,     'using'],
    [/\bcommence\b/gi,      'start'],
    [/\bcommences\b/gi,     'starts'],
    [/\bcommenced\b/gi,     'started'],
    [/\bfacilitate\b/gi,    'help'],
    [/\bfacilitates\b/gi,   'helps'],
    [/\bfacilitated\b/gi,   'helped'],
    [/\bleverage\b/gi,      'use'],
    [/\bleverages\b/gi,     'uses'],
    [/\bleveraged\b/gi,     'used'],
    [/\bleveraging\b/gi,    'using'],
    [/\bdelve\b/gi,         'examine'],
    [/\bdelves\b/gi,        'examines'],
    [/\bdelved\b/gi,        'examined'],
    [/\bdelving\b/gi,       'examining'],
    [/\bshowcase\b/gi,      'show'],
    [/\bshowcases\b/gi,     'shows'],
    [/\bshowcased\b/gi,     'showed'],
    [/\bunderscore\b/gi,    'emphasize'],
    [/\bunderscores\b/gi,   'emphasizes'],
    [/\bunderscored\b/gi,   'emphasized'],
    [/\bmultifaceted\b/gi,  'complex'],
    [/\brealm\b/gi,         'area'],
    [/\btapestry\b/gi,      'mix'],
    [/\brobust\b/gi,        'strong'],
    [/\bseamless\b/gi,      'smooth'],
    [/\bseamlessly\b/gi,    'smoothly'],
    [/\bpivotal\b/gi,       'important'],
    [/\bgame-changer\b/gi,  'major improvement'],
    [/\bunlock\b/gi,        'enable'],
    [/\bunlocks\b/gi,       'enables'],
    [/\bunlocked\b/gi,      'enabled'],
    [/\bharness\b/gi,       'use'],
    [/\bharnesses\b/gi,     'uses'],
    [/\bharnessed\b/gi,     'used'],
    [/\belevate\b/gi,       'improve'],
    [/\belevates\b/gi,      'improves'],
    [/\belevated\b/gi,      'improved'],
    [/\bnavigate\b/gi,      'handle'],
    [/\bnavigates\b/gi,     'handles'],
    [/\bnavigated\b/gi,     'handled'],
    [/\bfoster\b/gi,        'build'],
    [/\bfosters\b/gi,       'builds'],
    [/\bfostered\b/gi,      'built'],
    [/\bemphasize\b/gi,     'stress'],
    [/\bemphasizes\b/gi,    'stresses'],
    [/\bemphasized\b/gi,    'stressed'],
    [/\benhance\b/gi,       'improve'],
    [/\benhances\b/gi,      'improves'],
    [/\benhanced\b/gi,      'improved'],
    [/\boptimal\b/gi,       'best'],
    [/\boptimize\b/gi,      'improve'],
    [/\boptimizes\b/gi,     'improves'],
    [/\boptimized\b/gi,     'improved'],
    [/\bsynergy\b/gi,       'cooperation'],
    [/\bsynergies\b/gi,     'benefits'],
    [/\bparadigm\b/gi,      'model'],
    [/\bparadigms\b/gi,     'models'],
    [/\bholistic\b/gi,      'complete'],
    [/\bproactive\b/gi,     'active'],
    [/\bstreamline\b/gi,    'simplify'],
    [/\bstreamlines\b/gi,   'simplifies'],
    [/\bstreamlined\b/gi,   'simplified']
  ];

  function applyCustomReplacements(out, s) {
    if (s.customReplacementsEnabled && Array.isArray(s.customReplacements)) {
      for (const rule of s.customReplacements) {
        if (rule && typeof rule.find === 'string' && rule.find.length > 0) {
          out = out.split(rule.find).join(typeof rule.replace === 'string' ? rule.replace : '');
        }
      }
    }
    return out;
  }

  function cleanText(input, settings) {
    if (typeof input !== 'string' || input.length === 0) return input;
    const s = Object.assign({}, DEFAULT_SETTINGS, settings || {});
    if (!s.masterEnabled) return input;

    let out = input;

    if (s.removeWatermarks) {
      out = out.replace(RE_WORD_SPACING_MARKS, ' ');
      out = out.replace(RE_INVISIBLE, '');
      out = out.replace(RE_NBSP, ' ');
    }
    if (s.fixDashes) {
      out = out.replace(RE_DASHES, ' - ');
      out = out.replace(RE_DBL_HYPHEN, '-');
    }
    if (s.fixQuotes) {
      out = out.replace(RE_DBL_QUOTES, '"');
      out = out.replace(RE_SGL_QUOTES, "'");
    }
    if (s.removeEmojis) {
      out = out.replace(RE_EMOJI, '');
      out = out.replace(RE_TECH_SYMBOLS, '');
      out = out.replace(/[ \t]{2,}/g, ' ');
    }
    if (s.cleanMarkdown) {
      out = out.replace(RE_INLINE_CODE, '$1');
      out = out.replace(RE_BOLD, '$1');
      out = out.replace(RE_ITALIC_STAR, '$1');
      out = out.replace(RE_ITALIC_UNDERSCORE, '$1');
      out = out.replace(RE_HEADING, '');
    }
    if (s.removeCitations) {
      out = out.replace(RE_CITATIONS, ' ');
    }
    if (s.removePlaceholders) {
      out = out.replace(RE_PLACEHOLDERS, ' ');
    }
    if (s.removeFillerPhrases) {
      for (const phrase of FILLER_PHRASES) {
        const normalizedPhrase = phrase.replace(/[,:!?]+$/, '');
        const re = new RegExp('(^|[ \\t\\r\\n])' + normalizedPhrase.replace(/[.*+?^${}()|[\]\\]/g, '\\$&') + '[,:!?]?(?=$|\\s)', 'gi');
        out = out.replace(re, '$1');
      }
    }
    if (s.replaceAIWords) {
      for (const [re, replacement] of AI_WORD_MAP) {
        out = out.replace(re, replacement);
      }
    }

    // Custom replacements run FIRST — they override any built-in rule
    out = applyCustomReplacements(out, s);

    // ── Punctuation & orphan cleanup after removals ─────────────────────────
    if (s.fixPunctuation) {
      // Orphaned separators left when surrounding symbols were stripped:
      // " • ", " / ", standalone on a line or between spaces
      out = out.replace(/[ \t]*\u2022[ \t]*/g, ' ');   // bullet • → space
      out = out.replace(/[ \t]+\/[ \t]+/g, ' ');        // word / word orphan slash → space
      // Lines that are now only separators / punctuation → remove entirely
      out = out.replace(/^[ \t]*[\/\u2022\|\-]+[ \t]*$/gm, '');
      // Remove space before punctuation: " ," → ","
      out = out.replace(/ +([,\.;:!?])/g, '$1');
      // Collapse duplicate punctuation: ",," → ","
      out = out.replace(/([,;:!?])\1+/g, '$1');
      // Line starting with orphaned punctuation after removal
      out = out.replace(/^[ \t]*[,;:][ \t]*/gm, '');
      // Double period that isn't ellipsis
      out = out.replace(/\.{2}(?!\.)/g, '.');
      // Spaces inside brackets
      out = out.replace(/\( +/g, '(').replace(/ +\)/g, ')');
      // Multiple spaces after punctuation → single space
      out = out.replace(/([,\.;:!?])[ \t]{2,}/g, '$1 ');
    }

    // Fix sentence capitalisation: after ". " or ".\n" capitalise next letter
    if (s.fixPunctuation) {
      out = out.replace(/([.!?])[ \t]+([a-z])/g, (m, p, l) => p + ' ' + l.toUpperCase());
    }

    // Trim trailing whitespace per line, collapse blank lines, collapse spaces
    out = out.replace(/[ \t]+$/gm, '');
    out = out.replace(/\n{3,}/g, '\n\n');
    out = out.replace(/^[ \t]+/gm, '');
    out = out.replace(/[ \t]{2,}/g, ' ');

    return out;
  }

  function cleanHTML(html, settings) {
    if (typeof html !== 'string' || html.length === 0) return html;
    const s = Object.assign({}, DEFAULT_SETTINGS, settings || {});
    if (!s.masterEnabled) return html;
    try {
      const doc = new DOMParser().parseFromString(html, 'text/html');
      const walker = doc.createTreeWalker(doc.body, NodeFilter.SHOW_TEXT, null);
      const textSettings = Object.assign({}, s, { cleanMarkdown: false });
      const nodes = [];
      let node;
      while ((node = walker.nextNode())) nodes.push(node);
      nodes.forEach((n) => { n.nodeValue = cleanText(n.nodeValue, textSettings); });
      return doc.body.innerHTML;
    } catch (e) {
      return cleanText(html, s);
    }
  }

  // ─── Settings bridge ─────────────────────────────────────────────────────────

  const BRIDGE_EVENT         = 'ai-text-cleaner:settings-update';
  const BRIDGE_REQUEST_EVENT = 'ai-text-cleaner:settings-request';

  let currentSettings = Object.assign({}, DEFAULT_SETTINGS);
  let currentAIDomains = DEFAULT_AI_DOMAINS.slice();
  let domainAllowed    = false; // set after first load

  function broadcastSettings() {
    document.dispatchEvent(new CustomEvent(BRIDGE_EVENT, {
      detail: { settings: currentSettings, aiDomains: currentAIDomains }
    }));
  }

  function loadSettings() {
    chrome.storage.sync.get(
      Object.assign({ aiDomains: DEFAULT_AI_DOMAINS }, DEFAULT_SETTINGS),
      (stored) => {
        if (chrome.runtime.lastError) return;
        currentSettings  = Object.assign({}, DEFAULT_SETTINGS, stored);
        currentAIDomains = Array.isArray(stored.aiDomains) ? stored.aiDomains : DEFAULT_AI_DOMAINS.slice();
        domainAllowed    = isAIDomain(currentAIDomains);
        broadcastSettings();
      }
    );
  }

  loadSettings();
  chrome.storage.onChanged.addListener((changes, area) => { if (area === 'sync') loadSettings(); });
  document.addEventListener(BRIDGE_REQUEST_EVENT, broadcastSettings);

  // ─── Helper: get selected text from shadow DOM ────────────────────────────────

  function getSelectionText() {
    // Standard selection
    const sel = window.getSelection();
    if (sel && sel.toString().trim()) return sel.toString();

    // Try active element (e.g. textarea, input, contenteditable inside shadow root)
    const active = document.activeElement;
    if (active) {
      // Shadow root host — try to pierce it
      if (active.shadowRoot) {
        const innerSel = active.shadowRoot.getSelection ? active.shadowRoot.getSelection() : null;
        if (innerSel && innerSel.toString().trim()) return innerSel.toString();
      }
      // Input / textarea
      if (typeof active.selectionStart === 'number' && active.value) {
        const selected = active.value.substring(active.selectionStart, active.selectionEnd);
        if (selected.trim()) return selected;
      }
    }
    return '';
  }

  function getSelectionHTML() {
    try {
      const sel = window.getSelection();
      if (!sel || sel.rangeCount === 0) return '';
      const container = document.createElement('div');
      for (let i = 0; i < sel.rangeCount; i++) {
        container.appendChild(sel.getRangeAt(i).cloneContents());
      }
      return container.innerHTML;
    } catch (e) {
      return '';
    }
  }

  // ─── Fallback: async clipboard fixup ─────────────────────────────────────────

  function scheduleClipboardFixup() {
    setTimeout(async () => {
      try {
        if (!navigator.clipboard || !navigator.clipboard.read) return;
        const items = await navigator.clipboard.read();
        const newData = {};
        let changed = false;
        for (const item of items) {
          for (const type of item.types) {
            if (type === 'text/plain' || type === 'text/html') {
              const blob = await item.getType(type);
              const text = await blob.text();
              const cleaned = type === 'text/html' ? cleanHTML(text, currentSettings) : cleanText(text, currentSettings);
              if (cleaned !== text) changed = true;
              newData[type] = new Blob([cleaned], { type });
            }
          }
        }
        if (changed && Object.keys(newData).length && typeof ClipboardItem !== 'undefined') {
          await navigator.clipboard.write([new ClipboardItem(newData)]);
        }
      } catch (e) { /* clipboard blocked — fail silently */ }
    }, 80);
  }

  // ─── Copy event interception ──────────────────────────────────────────────────

  window.addEventListener('copy', (event) => {
    if (!currentSettings.masterEnabled) return;
    if (!domainAllowed) return;

    const selectedText = getSelectionText();

    if (selectedText && event.clipboardData) {
      const selectedHTML = getSelectionHTML();
      event.clipboardData.setData('text/plain', cleanText(selectedText, currentSettings));
      event.clipboardData.setData('text/html', selectedHTML ? cleanHTML(selectedHTML, currentSettings) : cleanText(selectedText, currentSettings));
      event.preventDefault();
      event.stopImmediatePropagation();
      return;
    }

    // Fallback for shadow-DOM / virtualized content (Gemini, ChatGPT copy button, etc.)
    scheduleClipboardFixup();
  }, true);

  // ─── Keydown interception for Ctrl+C / Cmd+C ─────────────────────────────────
  // Some sites suppress the copy event; we catch keydown as a secondary trigger.

  window.addEventListener('keydown', (event) => {
    if (!currentSettings.masterEnabled) return;
    if (!domainAllowed) return;
    const isCtrlC = (event.ctrlKey || event.metaKey) && event.key === 'c';
    if (!isCtrlC) return;

    const selectedText = getSelectionText();
    if (!selectedText) {
      // No selection visible yet — schedule async fixup after native copy completes
      scheduleClipboardFixup();
    }
    // If there IS a selection, the 'copy' event handler above will catch it
  }, true);

})();
