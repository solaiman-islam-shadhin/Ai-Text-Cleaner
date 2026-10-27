(function () {
  'use strict';

  const PREVIEWS = {
    removeWatermarks: { before: 'Hello\u200B World\uFEFF text', after: 'Hello World text' },
    fixDashes:        { before: 'AI tools\u2014once niche\u2014are mainstream. Use--it now.', after: 'AI tools once niche are mainstream. Use it now.' },
    fixQuotes:        { before: '\u201CHello\u201D she said, \u2018great\u2019', after: '"Hello" she said, \'great\'' },
    removeEmojis:     { before: '\uD83E\uDD16 AI-Powered \u26A1 Fast \u221E Scalable \u25C9 Nodes', after: 'AI-Powered Fast Scalable Nodes' },
    cleanMarkdown:    { before: '## Heading\n**bold text** and *italic* here', after: 'Heading\nbold text and italic here' },
    removeCitations:  { before: 'The model citeturn0search0 performs well contentReference[oaicite:0]', after: 'The model  performs well ' },
    removeFillerPhrases: { before: 'It is important to note that the model works. In conclusion, it is fast.', after: 'The model works. It is fast.' },
    replaceAIWords:   { before: 'We utilize robust solutions to leverage seamless workflows.', after: 'We use strong solutions to use smooth workflows.' },
    removePlaceholders: { before: 'Contact [Your Name] at [INSERT SOURCE] for details.', after: 'Contact  at  for details.' },
    fixPunctuation:   { before: 'Hello ,world.. the answer is( yes ).', after: 'Hello, world. The answer is(yes).' }
  };

  const DEFAULTS = {
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

  const TOGGLE_IDS = [
    'masterEnabled',
    'removeWatermarks',
    'fixDashes',
    'fixQuotes',
    'removeEmojis',
    'cleanMarkdown',
    'removeCitations',
    'removeFillerPhrases',
    'replaceAIWords',
    'removePlaceholders',
    'fixPunctuation',
    'customReplacementsEnabled'
  ];

  const optionsPanel            = document.getElementById('options');
  const statusText              = document.getElementById('statusText');
  const statusDot               = document.getElementById('statusDot');
  const replacementsList        = document.getElementById('replacementsList');
  const customReplacementsPanel = document.getElementById('customReplacements');
  const addReplacementBtn       = document.getElementById('addReplacementBtn');

  let saveTimer   = null;
  let isRendering = false;

  function setMasterState(enabled) {
    optionsPanel.classList.toggle('disabled', !enabled);
    statusDot.classList.toggle('off', !enabled);
    statusText.textContent = enabled
      ? 'Active — all copies are cleaned'
      : 'Paused — copies pass through unchanged';
  }

  function setCustomState(enabled) {
    customReplacementsPanel.classList.toggle('feature-disabled', !enabled);
  }

  function createRow(find, replace) {
    const row = document.createElement('div');
    row.className = 'replacement-row';

    const findInput = document.createElement('input');
    findInput.type = 'text';
    findInput.className = 'replacement-find';
    findInput.placeholder = 'Find…';
    findInput.value = find || '';

    const arrow = document.createElement('span');
    arrow.className = 'arrow';
    arrow.textContent = '→';

    const replaceInput = document.createElement('input');
    replaceInput.type = 'text';
    replaceInput.className = 'replacement-replace';
    replaceInput.placeholder = 'Replace with…';
    replaceInput.value = replace || '';

    const removeBtn = document.createElement('button');
    removeBtn.type = 'button';
    removeBtn.className = 'btn-remove-row';
    removeBtn.title = 'Remove';
    removeBtn.innerHTML = '<svg width="10" height="10" viewBox="0 0 24 24" fill="currentColor"><path d="M19 6.41L17.59 5 12 10.59 6.41 5 5 6.41 10.59 12 5 17.59 6.41 19 12 13.41 17.59 19 19 17.59 13.41 12z"/></svg>';
    removeBtn.addEventListener('click', () => { row.remove(); persistReplacements(); });

    findInput.addEventListener('input', scheduleReplacementsSave);
    replaceInput.addEventListener('input', scheduleReplacementsSave);

    row.appendChild(findInput);
    row.appendChild(arrow);
    row.appendChild(replaceInput);
    row.appendChild(removeBtn);
    return row;
  }

  function renderReplacements(list) {
    isRendering = true;
    replacementsList.innerHTML = '';
    (list && list.length ? list : [{ find: '', replace: '' }]).forEach((rule) => {
      replacementsList.appendChild(createRow(rule.find, rule.replace));
    });
    isRendering = false;
  }

  function readReplacementsFromDOM() {
    return Array.from(replacementsList.querySelectorAll('.replacement-row'))
      .map((row) => ({
        find: row.querySelector('.replacement-find').value,
        replace: row.querySelector('.replacement-replace').value
      }))
      .filter((rule) => rule.find.length > 0 || rule.replace.length > 0);
  }

  function persistReplacements() {
    if (isRendering) return;
    chrome.storage.sync.set({ customReplacements: readReplacementsFromDOM() });
  }

  function scheduleReplacementsSave() {
    if (isRendering) return;
    clearTimeout(saveTimer);
    saveTimer = setTimeout(persistReplacements, 300);
  }

  addReplacementBtn.addEventListener('click', () => {
    replacementsList.appendChild(createRow('', ''));
    persistReplacements();
  });

  function loadAndRender() {
    chrome.storage.sync.get(DEFAULTS, (stored) => {
      const settings = Object.assign({}, DEFAULTS, stored);
      TOGGLE_IDS.forEach((id) => {
        const el = document.getElementById(id);
        if (el) el.checked = !!settings[id];
      });
      setMasterState(settings.masterEnabled);
      setCustomState(settings.customReplacementsEnabled);
      renderReplacements(settings.customReplacements);
    });
  }

  function bindToggles() {
    TOGGLE_IDS.forEach((id) => {
      const el = document.getElementById(id);
      if (!el) return;
      el.addEventListener('change', () => {
        const update = {};
        update[id] = el.checked;
        chrome.storage.sync.set(update, () => {
          if (id === 'masterEnabled') setMasterState(el.checked);
          if (id === 'customReplacementsEnabled') setCustomState(el.checked);
        });
      });
    });
  }

  function bindPreviews() {
    document.querySelectorAll('.btn-preview').forEach((btn) => {
      btn.addEventListener('click', (e) => {
        e.stopPropagation();
        const card = btn.closest('.option-card');
        const key  = card.dataset.option;
        const panel = card.querySelector('.preview-panel');
        if (!panel) return;
        const isOpen = panel.classList.contains('open');
        // close all others
        document.querySelectorAll('.preview-panel.open').forEach(p => p.classList.remove('open'));
        document.querySelectorAll('.btn-preview.active').forEach(b => b.classList.remove('active'));
        if (!isOpen) {
          panel.classList.add('open');
          btn.classList.add('active');
        }
      });
    });
  }

  document.addEventListener('DOMContentLoaded', () => {
    loadAndRender();
    bindToggles();
    bindPreviews();
  });

  chrome.storage.onChanged.addListener((changes, areaName) => {
    if (areaName !== 'sync') return;
    TOGGLE_IDS.forEach((id) => {
      if (id in changes) {
        const el = document.getElementById(id);
        if (el && document.activeElement !== el) el.checked = !!changes[id].newValue;
        if (id === 'masterEnabled') setMasterState(!!changes[id].newValue);
        if (id === 'customReplacementsEnabled') setCustomState(!!changes[id].newValue);
      }
    });
  });
})();
