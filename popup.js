(function () {
  'use strict';

  const DEFAULT_AI_DOMAINS = [
    'chat.openai.com','chatgpt.com','claude.ai','gemini.google.com',
    'bard.google.com','copilot.microsoft.com','bing.com','perplexity.ai',
    'you.com','poe.com','character.ai','deepseek.com','mistral.ai',
    'huggingface.co','cohere.com','writesonic.com','jasper.ai',
    'copy.ai','rytr.me','notion.so'
  ];
  const AI_DOMAINS_KEY = 'aiDomains';

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
  const sitesList               = document.getElementById('sitesList');
  const siteInput               = document.getElementById('siteInput');
  const addSiteBtn              = document.getElementById('addSiteBtn');
  const siteMessage             = document.getElementById('siteMessage');

  let saveTimer   = null;
  let isRendering = false;
  let currentAIDomains = DEFAULT_AI_DOMAINS.slice();

  function setMasterState(enabled) {
    optionsPanel.classList.toggle('disabled', !enabled);
    statusDot.classList.toggle('off', !enabled);
    statusText.textContent = enabled
      ? 'Active — AI sites only'
      : 'Paused — copies pass through unchanged';
  }

  function showSiteMessage(message, isError) {
    siteMessage.textContent = message;
    siteMessage.classList.toggle('error', !!isError);
  }

  function getDomainMatchPattern(domain) {
    return `*://*.${domain}/*`;
  }

  function getDomainPermissionPatterns(domain) {
    return [`http://*.${domain}/*`, `https://*.${domain}/*`];
  }

  function isDefaultDomain(domain) {
    return DEFAULT_AI_DOMAINS.some((base) => domain === base || domain.endsWith(`.${base}`));
  }

  function getCustomScriptIds(domain) {
    const encodedDomain = Array.from(domain)
      .map((character) => /[a-z0-9]/i.test(character)
        ? character
        : `_${character.codePointAt(0).toString(16)}_`)
      .join('');
    const id = `ai-text-cleaner-${encodedDomain}`;
    return [`${id}-content`, `${id}-clipboard`];
  }

  function normalizeDomain(value) {
    const input = value.trim();
    if (!input) return null;

    let url;
    try {
      url = new URL(input.includes('://') ? input : `https://${input}`);
    } catch (error) {
      return null;
    }

    if (!['http:', 'https:'].includes(url.protocol) || url.username || url.password ||
        url.port || (url.pathname !== '/' && url.pathname !== '') || url.search || url.hash) {
      return null;
    }

    const domain = url.hostname.toLowerCase().replace(/\.$/, '');
    return /^(?=.{1,253}$)(?:[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?)(?:\.(?:[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?))*$/.test(domain)
      ? domain
      : null;
  }

  function renderSites() {
    sitesList.replaceChildren();
    const domains = currentAIDomains
      .map((domain, index) => ({ domain, index }))
      .sort((a, b) => Number(isDefaultDomain(a.domain)) - Number(isDefaultDomain(b.domain)) || a.index - b.index)
      .map(({ domain }) => domain);
    domains.forEach((domain) => {
      const row = document.createElement('div');
      row.className = 'site-row';

      const name = document.createElement('span');
      name.className = 'site-name';
      name.textContent = domain;

      const removeButton = document.createElement('button');
      removeButton.type = 'button';
      removeButton.className = 'btn-remove-site';
      removeButton.textContent = 'Remove';
      removeButton.setAttribute('aria-label', `Remove ${domain}`);
      removeButton.addEventListener('click', () => removeSite(domain));

      row.append(name, removeButton);
      sitesList.appendChild(row);
    });
  }

  function setStoredDomains(domains) {
    return new Promise((resolve, reject) => {
      chrome.storage.sync.set({ [AI_DOMAINS_KEY]: domains }, () => {
        if (chrome.runtime.lastError) {
          reject(new Error(chrome.runtime.lastError.message));
          return;
        }
        resolve();
      });
    });
  }

  function requestSitePermission(domain) {
    return new Promise((resolve, reject) => {
      chrome.permissions.request({ origins: getDomainPermissionPatterns(domain) }, (granted) => {
        if (chrome.runtime.lastError) {
          reject(new Error(chrome.runtime.lastError.message));
          return;
        }
        resolve(granted);
      });
    });
  }

  async function registerCustomDomain(domain) {
    const [contentId, clipboardId] = getCustomScriptIds(domain);
    const matches = [getDomainMatchPattern(domain)];
    await chrome.scripting.registerContentScripts([
      {
        id: contentId,
        matches,
        js: ['content.js'],
        runAt: 'document_start',
        allFrames: true,
        persistAcrossSessions: true
      },
      {
        id: clipboardId,
        matches,
        js: ['clipboard-interceptor.js'],
        runAt: 'document_start',
        allFrames: true,
        world: 'MAIN',
        persistAcrossSessions: true
      }
    ]);
  }

  async function unregisterCustomDomain(domain) {
    const ids = getCustomScriptIds(domain);
    const registrations = await chrome.scripting.getRegisteredContentScripts({ ids });
    const registeredIds = registrations.map((registration) => registration.id);
    if (registeredIds.length) {
      await chrome.scripting.unregisterContentScripts({ ids: registeredIds });
    }
  }

  async function addSite() {
    const domain = normalizeDomain(siteInput.value);
    if (!domain) {
      showSiteMessage('Enter a valid domain, such as example.com.', true);
      return;
    }
    if (currentAIDomains.includes(domain)) {
      showSiteMessage('That site is already enabled.', true);
      return;
    }

    addSiteBtn.disabled = true;
    try {
      if (!isDefaultDomain(domain)) {
        const granted = await requestSitePermission(domain);
        if (!granted) {
          showSiteMessage('Site access was not granted; the site was not added.', true);
          return;
        }
        await registerCustomDomain(domain);
      }
      const updatedDomains = [domain, ...currentAIDomains];
      await setStoredDomains(updatedDomains);
      currentAIDomains = updatedDomains;
      renderSites();
      siteInput.value = '';
      showSiteMessage('Site added. Reload its tab to start cleaning there.', false);
    } catch (error) {
      showSiteMessage(`Could not add site: ${error.message}`, true);
    } finally {
      addSiteBtn.disabled = false;
    }
  }

  async function removeSite(domain) {
    const updatedDomains = currentAIDomains.filter((item) => item !== domain);
    try {
      if (!isDefaultDomain(domain)) {
        await unregisterCustomDomain(domain);
        const removed = await new Promise((resolve, reject) => {
          chrome.permissions.remove({ origins: getDomainPermissionPatterns(domain) }, (result) => {
            if (chrome.runtime.lastError) {
              reject(new Error(chrome.runtime.lastError.message));
              return;
            }
            resolve(result);
          });
        });
        if (!removed) throw new Error('The site permission could not be removed.');
      }
      await setStoredDomains(updatedDomains);
      currentAIDomains = updatedDomains;
      renderSites();
      showSiteMessage(`${domain} removed.`, false);
    } catch (error) {
      showSiteMessage(`Could not remove site: ${error.message}`, true);
    }
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

  addSiteBtn.addEventListener('click', addSite);
  siteInput.addEventListener('keydown', (event) => {
    if (event.key === 'Enter') addSite();
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
    chrome.storage.sync.get({ [AI_DOMAINS_KEY]: DEFAULT_AI_DOMAINS }, (stored) => {
      if (chrome.runtime.lastError) {
        showSiteMessage(`Could not load sites: ${chrome.runtime.lastError.message}`, true);
        return;
      }
      currentAIDomains = Array.isArray(stored[AI_DOMAINS_KEY])
        ? stored[AI_DOMAINS_KEY]
        : DEFAULT_AI_DOMAINS.slice();
      renderSites();
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
    if (AI_DOMAINS_KEY in changes) {
      currentAIDomains = Array.isArray(changes[AI_DOMAINS_KEY].newValue)
        ? changes[AI_DOMAINS_KEY].newValue
        : DEFAULT_AI_DOMAINS.slice();
      renderSites();
    }
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
