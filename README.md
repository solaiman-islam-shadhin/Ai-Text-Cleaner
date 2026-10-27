# AI Text Cleaner

AI Text Cleaner is a Chromium Manifest V3 browser extension that cleans copied text on selected AI platforms. It can remove selected symbols and writing patterns, normalize some punctuation, and apply custom find-and-replace rules.

The extension does **not** run on every website by default. It runs on its built-in AI-site list and on additional domains that you explicitly add and authorize.

## Features

### Clipboard cleaning

The extension handles these copy methods on enabled sites:

- **Select text and press Ctrl+C** (or Cmd+C on macOS).
- **Right-click and choose Copy.**
- **Use a site's own Copy button** when it writes to the clipboard using the Clipboard API.
- **Copy selections from pages that expose text through the browser selection API.**

When selected text is available during the browser's `copy` event, the extension cleans the plain-text clipboard data and the text nodes in the corresponding HTML clipboard data. It prevents the page's later copy handlers from replacing that cleaned selection.

For AI-site Copy buttons that write with `navigator.clipboard.writeText()` or `navigator.clipboard.write()`, a separate MAIN-world script cleans clipboard text and HTML. A fallback also attempts to read and rewrite clipboard contents for copy flows where the selection is not exposed normally. Clipboard access can be limited by browser permissions or site behavior.

### Text-cleaning options

Each option can be enabled or disabled in the extension popup. The defaults are listed below.

| Option | Default | What it changes |
|---|---:|---|
| Invisible Watermarks | On | Removes zero-width characters, joiners, BOM, soft hyphens, directional marks, and related invisible formatting characters. It also converts non-breaking spaces to regular spaces. |
| Em Dashes & Double Hyphens | On | Replaces several Unicode dash characters and repeated ASCII hyphens with spaces. It also converts a hyphen used as a clause separator (for example, `word - word`) to a comma and a space. |
| Smart Quotes | On | Converts supported curly single and double quotation marks to straight quotes. |
| Emoji & Tech Symbols | On | Removes emoji and a broad range of technical, mathematical, arrow, geometric, and symbol characters. |
| Markdown Cleanup | **Off** | Removes inline-code backticks, simple bold/italic markers, and Markdown heading prefixes. |
| Citation Tokens | On | Removes patterns such as `citeturn0search0`, `contentReference[...]`, and supported bracketed citation forms. |
| Filler Phrases | On | Removes a built-in list of common phrases, including “It is important to note that,” “In conclusion,” “I hope this helps,” and “Certainly!”. |
| AI Word Replacements | On | Replaces selected words and phrases with simpler alternatives—for example, “utilize” → “use,” “delve into” → “examine,” and “robust” → “strong.” |
| Unfilled Placeholders | On | Removes supported bracketed prompts such as `[Your Name]`, `[INSERT SOURCE]`, and `[Describe …]`. |
| Fix Punctuation | On | Repairs selected spacing and punctuation issues, removes some orphan separators, collapses duplicate punctuation and excess spaces, and capitalizes a lowercase letter after sentence-ending punctuation. |
| Custom Replacements | **Off** | Applies user-defined literal find-and-replace pairs. Rules are applied after the built-in cleaning transformations. |

These are heuristic text transformations, not an AI detector. They can change legitimate punctuation, symbols, or wording; turn off any option that changes text you want to keep. Markdown cleanup is off by default for this reason.

### Site access

Built-in sites are enabled by default:

- ChatGPT: `chat.openai.com`, `chatgpt.com`
- Claude: `claude.ai`
- Gemini: `gemini.google.com`, `bard.google.com`
- Microsoft Copilot and Bing: `copilot.microsoft.com`, `bing.com`
- Perplexity: `perplexity.ai`
- You.com: `you.com`
- Poe: `poe.com`
- Character.AI: `character.ai`
- DeepSeek: `deepseek.com`
- Mistral: `mistral.ai`
- Hugging Face: `huggingface.co`
- Cohere: `cohere.com`
- Writesonic: `writesonic.com`
- Jasper: `jasper.ai`
- Copy.ai: `copy.ai`
- Rytr: `rytr.me`
- Notion: `notion.so`

The domain list matches the named domain and its subdomains. For example, enabling `example.com` also matches `app.example.com`.

To enable another site:

1. Open the extension popup.
2. Enter a domain such as `example.com` in **AI Sites Only**. A hostname or a bare domain is accepted; paths, ports, and credentials are not.
3. Select **Add** and grant the requested site access in the browser prompt.
4. Reload the site's tab so the extension scripts can start there.

Custom domains are saved in extension sync storage. The popup requests optional access for that domain only; it does not request access to every site. Use **Remove** next to a custom domain to stop enabling it, unregister its injected scripts, and remove its granted host permission.

The master toggle pauses or resumes cleaning without changing the saved site list or individual option settings.

## Install for development

1. Download or clone this repository.
2. Open `chrome://extensions` in Chrome, or the equivalent extensions page in another Chromium-based browser.
3. Turn on **Developer mode**.
4. Choose **Load unpacked** and select the project folder containing `manifest.json`.
5. Open an AI site and copy some text to test. Reload the extension and the site tab after making code changes.

The extension uses Manifest V3 and the Chrome Extensions APIs. It has no server component; settings are stored with `chrome.storage.sync`.

## Project files

| File | Purpose |
|---|---|
| `manifest.json` | Extension metadata, built-in site matches, extension permissions, and content-script registration. |
| `content.js` | Isolated-world cleaning engine, settings loading, manual copy interception, and clipboard fallback. |
| `clipboard-interceptor.js` | MAIN-world Clipboard API interception for site-provided Copy buttons. |
| `popup.html` | Popup layout and cleaning/site controls. |
| `popup.js` | Popup behavior, settings persistence, custom-domain permission handling, and replacement rules. |
| `styles.css` | Popup styling. |

## Permissions

- `storage`: saves cleaning options, site domains, and replacement rules using `chrome.storage.sync`.
- `clipboardRead` and `clipboardWrite`: support the clipboard fallback and cleaned clipboard output.
- `scripting`: registers content scripts for custom domains after permission is granted.
- `activeTab` and `tabs`: extension tab-related capabilities.
- Optional `http://` and `https://` host access: requested for an individual custom domain when it is added.

## Troubleshooting

- **A site is in the list but cleaning does not start:** reload the extension in the browser's extensions page, then refresh the site tab.
- **A newly added custom site does not work:** confirm that you granted access when prompted, then refresh the site tab. The extension cannot inject into browser-internal pages such as `chrome://` pages.
- **Only a site's Copy button works:** the site's manual selection/copy flow may not expose the selected text through the standard browser copy event, or it may use a custom clipboard implementation. Try refreshing the site and using Ctrl+C or right-click → Copy again. Behavior can vary by site.
- **Text changes unexpectedly:** disable the relevant cleaning option in the popup. Each option can be controlled independently.
- **A removed site still appears to use old behavior in an already-open tab:** refresh that tab after removing the domain.

